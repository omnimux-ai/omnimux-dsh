import { resolveNodeKind } from '../../shared/graph/materialNode.ts';
import { readNodeInputSource } from '../../shared/graph/nodeInputSource.ts';
import { resolveExecutionMediaSource, type ExecutionMediaSourceOptions } from './executionMediaSource.ts';
import type { NodeOutput } from '../executors/registry.ts';

/** Seed only dependencies outside the scheduled graph, using their displayed current output. */
export function buildInitialOutputs(
  workspace: {
    id: string;
    nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>;
    edges: Array<{ source: string; target: string }>;
  },
  executedNodeIds: ReadonlySet<string>,
  options?: Omit<ExecutionMediaSourceOptions, 'workspaceId'>,
): Record<string, NodeOutput> {
  const initialOutputs: Record<string, NodeOutput> = {};
  for (const edge of workspace.edges) {
    if (!executedNodeIds.has(edge.target)) continue;
    const source = workspace.nodes.find((node) => node.id === edge.source);
    if (!source) continue;
    const scheduled = executedNodeIds.has(edge.source);
    if (scheduled && source.type === 'material' && resolveNodeKind(source.data ?? {}) === 'generate') continue;
    const resolved = readNodeInputSource(source, workspace.id);
    if (resolved.availability === 'ready') {
      const output = {
        ...resolved.output,
        ...(resolved.output.mediaAssets ? { mediaAssets: resolved.output.mediaAssets.map((asset) => {
          const source = resolveExecutionMediaSource(asset, { mediaDir: options?.mediaDir ?? '', ...options, workspaceId: workspace.id });
          return { ...asset, url: source, path: source.startsWith('/') ? source : undefined };
        }) } : {}),
      };
      if (!scheduled) initialOutputs[edge.source] = output;
    }
  }
  return initialOutputs;
}
