/**
 * Material generator executor: dispatches generative material nodes through the
 * GenerationGateway seam (key: 'material:generate').
 *
 * All non-generative / pass-through logic has been cleanly separated into
 * `importExecutor.ts`.
 */

import { join } from 'node:path';
import type { ResolveExecutionProjectFile } from './executionMediaSource.ts';
import { collectMaterialSlotInputs } from './materialSlotInputs.ts';
import { resolveGenerationPrompt } from '../../shared/graph/generationPrompt.ts';
import { compileMultimodalPrompt } from './multimodalCompiler.ts';
import type { AwaitTaskResult, GenerationGateway, SubmitRequest } from '../seam/gateway';
import { resolveExecutorSubmission } from '../seam/submitGuard.ts';
import { validateGeneratedResult } from '../seam/generatedResult.ts';
import { reconcileUpstreamTask } from './upstreamReconcile.ts';
import type {
  NodeExecutor,
  NodeOutput,
} from '../executors/registry';

/** Deterministic per-node fail switch for the M3 mock path (node data flag). */
function readMockFail(nodeData: Record<string, unknown>): boolean {
  return nodeData.mockFail === true;
}

function readString(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readDuration(data: Record<string, unknown>): number | undefined {
  const fromParams = (data.params as Record<string, unknown> | undefined)?.duration;
  if (typeof fromParams === 'number') return fromParams;
  if (typeof data.duration === 'number') return data.duration;
  return undefined;
}

function readNumber(source: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = source?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readBoolean(source: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = source?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

const ROUTING_STRATEGIES = ['auto', 'stability_first', 'cost_first'] as const;

/**
 * Channel routing stored on the node by the model picker. Only well-formed
 * values travel: an unknown strategy or an empty pool must not reach the hub as
 * a routing request, or it would narrow (or fail) a generation the user never
 * constrained.
 */
function readRouting(source: Record<string, unknown> | undefined): {
  strategy?: 'auto' | 'stability_first' | 'cost_first';
  allowedGroups?: string[];
} {
  const routing = source?.routing;
  if (!routing || typeof routing !== 'object' || Array.isArray(routing)) return {};
  const row = routing as Record<string, unknown>;
  const out: { strategy?: 'auto' | 'stability_first' | 'cost_first'; allowedGroups?: string[] } = {};
  if (typeof row.strategy === 'string'
    && (ROUTING_STRATEGIES as readonly string[]).includes(row.strategy)) {
    out.strategy = row.strategy as 'auto' | 'stability_first' | 'cost_first';
  }
  if (Array.isArray(row.allowedGroups)) {
    const groups = row.allowedGroups
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map((id) => id.trim());
    if (groups.length > 0) out.allowedGroups = groups;
  }
  return out;
}

function readMaterialType(nodeData: Record<string, unknown>): 'text' | 'image' | 'video' | 'audio' {
  const value = nodeData.materialType;
  if (value === 'image' || value === 'video' || value === 'audio') return value;
  return 'text';
}

function extFor(capability: 'text' | 'image' | 'video' | 'audio'): string {
  if (capability === 'image') return 'png';
  if (capability === 'video') return 'mp4';
  if (capability === 'audio') return 'mp3';
  return 'txt';
}

export function createMaterialGatewayExecutor(opts: {
  gateway: GenerationGateway;
  resolveProjectFile?: ResolveExecutionProjectFile;
}): NodeExecutor {
  const { gateway } = opts;

  return {
    key: 'material:generate',
    async execute(node, ctx): Promise<NodeOutput> {
      const data = structuredClone(node.data ?? {});
      const params = data.params as Record<string, unknown> | undefined;
      const inputs = { ...ctx, upstreamOutputs: structuredClone(ctx.upstreamOutputs), upstreamBindings: structuredClone(ctx.upstreamBindings) };
      const catalog = structuredClone(ctx.catalog ?? await gateway.capabilities());
      const upstream = collectMaterialSlotInputs(data, inputs, catalog, opts.resolveProjectFile);

      // Generative: gateway submit -> await -> output
      const capability = readMaterialType(data);
      if (capability === 'audio' && upstream.texts.length && resolveGenerationPrompt(data).trim()) {
        throw new Error('当前音频任务不能分别表达上游正文和本地要求；请保留一个正文来源并调整音色、语速等参数');
      }
      const rawPrompt = resolveGenerationPrompt(data, upstream.texts);
      const dest = join(ctx.mediaDir, `${node.id}.${extFor(capability)}`);

      /**
       * Shared tail of both paths: validate the settled result, hand it to the
       * project store and describe the node output.
       *
       * @param record.prompt Prompt recorded with the artifact. The reconcile
       *   path records the resolved prompt without multimodal recompilation,
       *   because its request was compiled and submitted by another process.
       */
      const finalizeMedia = async (
        settled: AwaitTaskResult,
        record: { prompt: string; modelId?: string },
      ): Promise<NodeOutput> => {
        const metadata = validateGeneratedResult(settled, capability, dest);
        ctx.reportProgress?.(90, '生成完成');
        const simulated = settled.simulated === true;

        if (capability === 'text') {
          return {
            text: settled.text!,
            ...(simulated ? { simulated: true } : {}),
          };
        }

        if (ctx.persistGenerated) {
          const persisted = await ctx.persistGenerated({
            nodeId: node.id,
            nodeType: node.type,
            tmpAbs: dest,
            materialType: capability,
            prompt: record.prompt,
            modelId: record.modelId,
          });
          return {
            relativePath: persisted.relativePath,
            assetId: persisted.assetId,
            ...(simulated ? { simulated: true } : {}),
            mediaAssets: [{
              type: capability,
              url: persisted.url,
              relativePath: persisted.relativePath,
              assetId: persisted.assetId,
              ...metadata,
              ...(persisted.mimeType ? { mimeType: persisted.mimeType } : {}),
              ...(persisted.sizeBytes != null ? { sizeBytes: persisted.sizeBytes } : {}),
              ...(persisted.durationSec != null ? { durationSec: persisted.durationSec } : {}),
            }],
          };
        }

        const url = ctx.toPublicUrl ? ctx.toPublicUrl(settled.url) : settled.url;
        return {
          ...(simulated ? { simulated: true } : {}),
          ...(settled.relativePath ? { relativePath: settled.relativePath } : {}),
          ...(settled.assetId ? { assetId: settled.assetId } : {}),
          mediaAssets: [{ type: capability, url, ...metadata,
            ...(settled.relativePath ? { relativePath: settled.relativePath } : {}),
            ...(settled.assetId ? { assetId: settled.assetId } : {}),
          }],
        };
      };

      // #1382: a recovered node may already own an upstream task. Reconciling it
      // reuses that work; preparing the request instead would re-validate inputs
      // the hub no longer needs (and may no longer have), and submitting again
      // would discard a finished artifact and bill a second time.
      const upstreamTaskRef = ctx.readUpstreamTask?.();
      if (upstreamTaskRef) {
        const outcome = await reconcileUpstreamTask({
          gateway,
          ref: upstreamTaskRef,
          dest,
          signal: ctx.signal,
          capability,
        });
        if (outcome.kind === 'downloaded') {
          ctx.clearUpstreamTask?.();
          return finalizeMedia(outcome.result, {
            prompt: rawPrompt,
            modelId: upstream.modelId ?? readString(params, 'model'),
          });
        }
        // Either the hub cannot tell us about that task (resubmit, as before) or
        // the task genuinely failed. Both are terminal for this reference.
        ctx.clearUpstreamTask?.();
        if (outcome.kind === 'failed') throw outcome.error;
      }

      // Upstream reference mapping (multi-modal references + audioTrack + backward compatibility)
      const references = [...upstream.references];

      // Compile multimodal prompt (Issue #714 / T05)
      const modelId = upstream.modelId ?? readString(params, 'model');
      const modelDef = catalog.models?.find((m) => m.id === modelId) as Record<string, unknown> | undefined;
      const supportsInterleaved = Boolean(
        modelDef?.supportsInterleaved ||
        (params as Record<string, unknown> | undefined)?.supportsInterleaved
      );

      const upstreamOutputsObj: Record<string, { mediaUrl?: string; text?: string; mimeType?: string }> = {};
      for (const [sourceId, out] of ctx.upstreamOutputs.entries()) {
        const firstAsset = out.mediaAssets?.[0];
        const mediaUrl = upstream.references.find((reference) => reference.sourceNodeId === sourceId)?.pathOrUrl;
        upstreamOutputsObj[sourceId] = {
          mediaUrl,
          text: out.text,
          mimeType: firstAsset?.mimeType,
        };
      }
      for (const ref of upstream.references) {
        if (ref.sourceNodeId) {
          upstreamOutputsObj[ref.sourceNodeId] = {
            ...upstreamOutputsObj[ref.sourceNodeId],
            mediaUrl: ref.pathOrUrl,
            mimeType: ref.mimeType || upstreamOutputsObj[ref.sourceNodeId]?.mimeType,
          };
        }
      }

      const compiled = compileMultimodalPrompt({
        rawPrompt,
        // The resolved Slot population alone authorizes media consumption, not legacy caches.
        slotState: undefined,
        upstreamOutputs: upstreamOutputsObj,
        modelContract: {
          supportsInterleaved,
          category: capability,
        },
      });

      const prompt = compiled.cleanedPrompt;

      // Tokens annotate the prompt; they cannot add media beyond the resolved Slot set.

      const audioTrack = upstream.audioTrack;
      const image = references.find((r) => r.type === 'image')?.pathOrUrl || undefined;
      const audio = references.find((r) => r.type === 'audio')?.pathOrUrl || audioTrack?.pathOrUrl;

      const request: SubmitRequest = {
        capability,
        prompt,
        interleavedParts: compiled.interleavedParts && compiled.interleavedParts.length > 0
          ? compiled.interleavedParts
          : undefined,
        image,
        audio,
        references: references.length > 0 ? references : undefined,
        audioTrack,
        duration: readDuration(data),
        operation: upstream.operationId,
        model: upstream.modelId,
        resolution: readString(params, 'resolution'),
        aspectRatio: readString(params, 'aspectRatio'),
        voice: readString(params, 'voice'),
        style: readString(params, 'style'),
        instrumental: readBoolean(params, 'instrumental'),
        speed: readNumber(params, 'speed'),
        sound: readBoolean(params, 'sound'),
        seed: readNumber(params, 'seed'),
        watermark: readBoolean(params, 'watermark'),
        outputFormat: readString(params, 'outputFormat'),
        referenceTaskType: readString(params, 'referenceTaskType'),
        generationType: readString(params, 'generationType'),
        returnLastFrame: readBoolean(params, 'returnLastFrame'),
        webSearch: readBoolean(params, 'webSearch'),
        nsfwCheck: readBoolean(params, 'nsfwCheck'),
        fileUrl: readString(params, 'fileUrl'),
        linkUrl: readString(params, 'linkUrl'),
        ...readRouting(params),
        dest,
        signal: ctx.signal,
        mockFail: readMockFail(data),
      };
      // Synchronous speech consumes text and voice parameters, not reference media.
      if (capability === 'audio' && upstream.operationId === 'text_to_speech') {
        delete request.references;
        delete request.audio;
        delete request.audioTrack;
        delete request.image;
        delete request.interleavedParts;
      }
      const resolved = resolveExecutorSubmission(request, catalog);
      const submitted = await gateway.submit(resolved);
      ctx.reportProgress?.(10, '已提交生成任务');
      // #1382: record the moment the hub owns a task, before any polling. The
      // record is written immediately (not at the next sync tick): a crash in
      // this window is exactly what would otherwise force a resubmit of a task
      // that is already running — and billable — upstream.
      if (submitted.mode === 'submitted') {
        ctx.recordUpstreamTask?.({
          taskId: submitted.taskId,
          capability,
          submittedAt: Date.now(),
        });
      }
      try {
        ctx.reportProgress?.(40, '生成中…');
        const settled = await gateway.awaitTask(submitted.taskId, dest, ctx.signal);
        const output = await finalizeMedia(settled, { prompt, modelId: resolved.model });
        // Terminal: a finished node must not leave a stale reference for the next
        // recovery to chase.
        ctx.clearUpstreamTask?.();
        return output;
      } catch (error) {
        // The node is about to go terminal, so the reference must not survive:
        // its window is either already closed or the hub gave a final answer.
        ctx.clearUpstreamTask?.();
        throw error;
      }
    },
  };
}
