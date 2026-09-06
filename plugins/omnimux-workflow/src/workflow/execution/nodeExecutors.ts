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

    const upstreamOutputs = resolveUpstreamOutputs(node, opts.edges, context);
    const upstreamBindings = resolveUpstreamBindings(node, opts.edges, context);

    if (executorKey === 'material:generate') {
      const resolvedInputs = new Map([...upstreamOutputs].map(([id, output]) => {
        const media = (output.mediaAssets ?? []).map((asset) => ({
          nodeId: id, materialType: asset.type, availability: 'ready' as const,
          url: asset.url, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, durationSec: asset.durationSec,
        }));
        // Media executor labels are not textual content; pure text outputs are.
        return [id, media.length ? media : [{
          nodeId: id, materialType: 'text', textContent: output.text,
          availability: output.text?.trim() ? 'ready' as const : 'waiting' as const,
        }]];
      }));
      const failure = findExecutionReadinessFailure([node], await opts.gateway.capabilities(), {
        nodes: [], edges: opts.edges, workspaceId: opts.workspaceId, resolvedInputs,
      });
      if (failure) throw new Error(failure.message);
    }

    const ctx: ExecutorContext = {
      upstreamOutputs,
      upstreamBindings,
      signal: opts.abortController.signal,
      mediaDir,
      workspaceId: opts.workspaceId,
      toPublicUrl,
      persistGenerated: opts.persistGenerated,
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

function resolveUpstreamBindings(
  node: ExecutableNode,
  edges: ExecutableEdge[],
  context: ExecutionContext,
): NonNullable<ExecutorContext['upstreamBindings']> {
  const bindings: NonNullable<ExecutorContext['upstreamBindings']> = [];
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
