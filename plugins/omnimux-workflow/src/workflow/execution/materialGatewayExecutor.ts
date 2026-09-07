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
import type { NodeSlotEngineState } from '../../shared/graph/slotContractTypes.ts';
import type { GenerationGateway, MediaInputRole, SubmitRequest } from '../seam/gateway';
import { resolveExecutorSubmission } from '../seam/submitGuard.ts';
import { validateGeneratedResult } from '../seam/generatedResult.ts';
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
        const mediaUrl = firstAsset?.url || (firstAsset as { path?: string } | undefined)?.path;
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
        slotState: data.slotState as NodeSlotEngineState | undefined,
        upstreamOutputs: upstreamOutputsObj,
        modelContract: {
          supportsInterleaved,
          category: capability,
        },
      });

      const prompt = compiled.cleanedPrompt;

      // Merge resolved references from prompt tokens into upstream references if not already present
      for (const resolvedRef of compiled.resolvedReferences) {
        const pathOrUrl = resolvedRef.pathOrUrl || resolvedRef.mediaUrl;
        const sourceNodeId = resolvedRef.sourceNodeId || '';
        const exists = references.some(
          (r) => r.pathOrUrl === pathOrUrl && r.sourceNodeId === sourceNodeId,
        );
        if (!exists && pathOrUrl) {
          const rawType = resolvedRef.type || resolvedRef.materialType;
          const mediaType = (rawType === 'video' || rawType === 'audio' || rawType === 'document') ? rawType : 'image';
          references.push({
            role: (resolvedRef.role as MediaInputRole) || 'reference',
            type: mediaType,
            pathOrUrl,
            sourceNodeId,
            ...(resolvedRef.mimeType ? { mimeType: resolvedRef.mimeType } : {}),
          });
        }
      }

      const audioTrack = upstream.audioTrack;
      const image = references.find((r) => r.type === 'image')?.pathOrUrl || undefined;
      const audio = references.find((r) => r.type === 'audio')?.pathOrUrl || audioTrack?.pathOrUrl;

      const dest = join(ctx.mediaDir, `${node.id}.${extFor(capability)}`);
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

      ctx.reportProgress?.(40, '生成中…');
      const settled = await gateway.awaitTask(submitted.taskId, dest, ctx.signal);
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
          prompt,
          modelId: resolved.model,
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
    },
  };
}
