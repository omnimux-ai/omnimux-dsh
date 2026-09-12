/**
 * Node executor bridge: connects the M1 executor registry to the M3
 * ExecutionScheduler.
 *
 * The scheduler calls a plain `(node, context) => Promise<output>` function;
 * this module builds that function per execution:
 *  - resolves upstream outputs from the graph edges + context output cache,
 *  - looks the executor up in the registry (extension point ②) — unknown
 *    node types fail fast with a clear error,
 *  - threads cooperative cancellation (one AbortController per execution),
 *  - rewrites artifact paths into project-file URLs when bound.
 */

import { relative, resolve } from 'node:path';
import type { ExecutionContext } from './ExecutionContext.ts';
import type {
  ExecutableEdge,
  ExecutableNode,
  NodeExecutorFn,
} from './ExecutionScheduler.ts';
import {
  getExecutor,
  type ExecutionContext as ExecutorContext,
  type NodeOutput,
} from '../executors/registry.ts';
import { createWorkflowLogger } from './logger.ts';
import { WORKFLOW_ROUTE_PREFIX } from '../../shared/api.ts';
import { resolveNodeKind } from '../../shared/graph/materialNode.ts';
import { findExecutionReadinessFailure } from '../../shared/validation/executionReadiness.ts';
import { readExplicitTargetSlot } from '../../shared/validation/compatKernel.ts';
import { deriveSlotLayout, selectSlotOccupants, type SlotBindings, type SlotConflict } from '../../shared/graph/feedSlot/index.ts';
import type { CapabilityCatalog } from '../../shared/api.ts';

const LOG_TAG = 'nodeExecutors';

const logger = createWorkflowLogger(LOG_TAG);

export function resolveExecutorKey(node: { type: string; data?: Record<string, unknown> }): string {
  if (node.type !== 'material') return node.type;
  try {
    const kind = resolveNodeKind(node.data ?? {});
    return kind === 'import' ? 'material:import' : 'material:generate';
  } catch (err) {
    logger.warn('failed to resolve material node kind, falling back to generate', {
      nodeId: (node as { id?: string }).id,
      error: err instanceof Error ? err.message : String(err),
    });
    return 'material:generate';
  }
}

export interface DispatchingExecutorOptions {
  gateway: import('../seam/gateway').GenerationGateway;
  /** Plugin media root (absolute) — tmp artifacts land under <root>/executions/<id>/. */
  mediaRoot: string;
  executionId: string;
  workspaceId?: string;
  edges: ExecutableEdge[];
  /** AbortController shared by the execution (cancel aborts in-flight nodes). */
  abortController: AbortController;
  persistGenerated?: ExecutorContext['persistGenerated'];
}

export interface DispatchingNodeExecutor {
  /** Scheduler-facing executor function. */
  executor: NodeExecutorFn;
  /** Per-execution media dir (absolute), also used by the URL rewriter. */
  mediaDir: string;
}

export function createDispatchingNodeExecutor(
  opts: DispatchingExecutorOptions,
): DispatchingNodeExecutor {
  const mediaDir = resolve(opts.mediaRoot, 'executions', opts.executionId);

  /** Absolute artifact path -> /omnimux-workflow/media/executions/<id>/<file>. */
  const toPublicUrl = (absolutePath: string): string => {
    const rel = relative(opts.mediaRoot, resolve(absolutePath));
    const normalized = rel.split('\\').join('/');
    if (normalized.startsWith('..')) {
      // Path outside the media root: refuse to expose.
      logger.warn('artifact path escapes media root', { executionId: opts.executionId, absolutePath });
      return absolutePath;
    }
    return `${WORKFLOW_ROUTE_PREFIX}/media/${normalized}`;
  };

  const executor: NodeExecutorFn = async (node, context) => {
    const executorKey = resolveExecutorKey(node);
    const registryExecutor = getExecutor(executorKey);
    if (!registryExecutor) {
      throw new Error(`节点类型 ${node.type} 没有注册执行器（registry key: ${executorKey}）`);
    }

    node = structuredClone(node);
    const edges = structuredClone(opts.edges);
    const upstreamOutputs = structuredClone(resolveUpstreamOutputs(node, edges, context));
    const catalog = executorKey === 'material:generate' ? structuredClone(await opts.gateway.capabilities()) : undefined;
    const upstreamBindings = resolveUpstreamBindings(node, edges, { getNodeOutput: (id) => upstreamOutputs.get(id) }, catalog);

    if (executorKey === 'material:generate') {
      const resolvedInputs = new Map([...upstreamOutputs].map(([id, output]) => {
        const media = (output.mediaAssets ?? []).map((asset) => ({
          nodeId: id, materialType: asset.type, availability: 'ready' as const,
          url: asset.url, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, durationSec: asset.durationSec,
        }));
        const declaredType = edges.find((edge) => edge.target === node.id && edge.source === id)?.data?.feedType;
        // A pending media output is not a text source just because it has no asset yet.
        return [id, media.length ? media : [{
          nodeId: id, materialType: typeof declaredType === 'string' ? declaredType : 'text', textContent: output.text,
          availability: output.text?.trim() ? 'ready' as const : 'waiting' as const,
        }]];
      }));
      const failure = findExecutionReadinessFailure([node], catalog, {
        nodes: [], edges, workspaceId: opts.workspaceId, resolvedInputs,
      });
      if (failure) throw new Error(failure.message);
    }

    const ctx: ExecutorContext = {
      catalog,
      upstreamOutputs,
      upstreamBindings,
      signal: opts.abortController.signal,
      mediaDir,
      workspaceId: opts.workspaceId,
      toPublicUrl,
      persistGenerated: opts.persistGenerated,
      // #1382: the executor reports the upstream task it just created and reads
      // back any reference a recovered node was re-pended with. Both are thin
      // closures over the execution context, which owns the persisted state.
      //
      // Guarded on purpose: a context double (tests, embedding code) need not
      // implement a bookkeeping channel that only affects post-restart behavior.
      // Losing it means "resubmit after a restart", never a failed generation.
      recordUpstreamTask: (ref) => context.setNodeUpstreamTask?.(node.id, ref),
      readUpstreamTask: () => context.readNodeUpstreamTask?.(node.id),
      clearUpstreamTask: () => context.clearNodeUpstreamTask?.(node.id),
      reportProgress: (progress, message) => {
        context.reportProgress(node.id, progress, message ?? '');
      },
    };

    const output = await registryExecutor.execute(
      { id: node.id, type: node.type, data: node.data ?? {} },
      ctx,
    );

    // Cache media assets on the context (Gxgen behavior: asset bookkeeping).
    for (const asset of output.mediaAssets ?? []) {
      context.addMediaAsset(node.id, { ...asset });
    }
    return output as unknown;
  };

  return { executor, mediaDir };
}

export function resolveUpstreamBindings(
  node: ExecutableNode,
  edges: ExecutableEdge[],
  context: Pick<ExecutionContext, 'getNodeOutput'>,
  catalog?: CapabilityCatalog,
): NonNullable<ExecutorContext['upstreamBindings']> {
  const bindings: NonNullable<ExecutorContext['upstreamBindings']> = [];
  const saved = node.data?.slotBindings as SlotBindings | undefined;
  if (saved !== undefined && catalog) {
    const params = (node.data?.params ?? {}) as Record<string, unknown>;
    const kind = (node.data?.materialType ?? 'text') as keyof NonNullable<CapabilityCatalog['defaults']>;
    const layout = deriveSlotLayout(catalog, (params.model ?? catalog.defaults?.[kind]) as string | undefined, params.operation as string | undefined);
    const incoming = edges.filter((edge) => edge.target === node.id);
    for (const edge of incoming) {
      const output = normalizeOutput(context.getNodeOutput(edge.source));
      const isMedia = output.mediaAssets?.length || ['image', 'video', 'audio'].includes(String(edge.data?.feedType))
        || Object.values(saved).flat().some((item) => item.edgeId === edge.id);
      if (!isMedia) bindings.push({ edgeId: edge.id, sourceNodeId: edge.source, output: structuredClone(output) });
    }
    const feed = incoming.map((edge, ordinal) => {
      const output = normalizeOutput(context.getNodeOutput(edge.source));
      const asset = output.mediaAssets?.[0];
      const slot = layout.slots.find((item) => saved[item.slot]?.some((occupant) => occupant.edgeId === edge.id));
      return { edgeId: edge.id ?? `feed-${edge.source}-${ordinal}`, sourceNodeId: edge.source, ordinal,
        type: asset?.type ?? String(edge.data?.feedType ?? slot?.type ?? 'text'),
        availability: asset ? 'ready' as const : 'waiting' as const };
    });
    for (const { slot, occupant } of selectSlotOccupants(layout, saved, feed, (node.data?.slotConflicts ?? []) as SlotConflict[])) {
      bindings.push({ edgeId: occupant.edgeId, sourceNodeId: occupant.sourceNodeId, role: slot.role,
        targetSlot: slot.slot, output: structuredClone(normalizeOutput(context.getNodeOutput(occupant.sourceNodeId))) });
    }
    return bindings;
  }
  for (const edge of edges) {
    if (edge.target !== node.id) continue;
    const rawOutput = context.getNodeOutput(edge.source);
    if (rawOutput === undefined) continue;
    const edgeData = edge.data && typeof edge.data === 'object' ? edge.data : {};
    const slotBinding = edgeData.slotBinding && typeof edgeData.slotBinding === 'object'
      ? edgeData.slotBinding as { role?: unknown }
      : undefined;
    const role = typeof edgeData.role === 'string' && edgeData.role.trim()
      ? edgeData.role.trim()
      : typeof slotBinding?.role === 'string' && slotBinding.role.trim()
        ? slotBinding.role.trim()
        : undefined;
    const targetSlot = readExplicitTargetSlot(edgeData, edge.targetHandle);
    bindings.push({
      ...(edge.id ? { edgeId: edge.id } : {}),
      sourceNodeId: edge.source,
      ...(edge.sourceHandle !== undefined ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle !== undefined ? { targetHandle: edge.targetHandle } : {}),
      ...(role ? { role } : {}),
      ...(targetSlot ? { targetSlot } : {}),
      output: normalizeOutput(rawOutput),
    });
  }
  return bindings;
}

function resolveUpstreamOutputs(
  node: ExecutableNode,
  edges: ExecutableEdge[],
  context: ExecutionContext,
): Map<string, NodeOutput> {
  const upstream = new Map<string, NodeOutput>();
  for (const edge of edges) {
    if (edge.target !== node.id) continue;
    const output = context.getNodeOutput(edge.source);
    if (output === undefined) continue;
    upstream.set(edge.source, normalizeOutput(output));
  }
  return upstream;
}

function normalizeOutput(output: unknown): NodeOutput {
  if (output && typeof output === 'object' && ('text' in output || 'mediaAssets' in output)) {
    return output as NodeOutput;
  }
  return typeof output === 'string' ? { text: output } : {};
}
