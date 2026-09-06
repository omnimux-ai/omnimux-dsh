import { readNodeInputSource } from '../../shared/graph/nodeInputSource.ts';
import type { NodeOutput } from '../executors/registry.ts';

/** Seed only dependencies outside the scheduled graph, using their displayed current output. */
export function buildInitialOutputs(
  workspace: {
    id: string;
    nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>;
    edges: Array<{ source: string; target: string }>;
  },
  executedNodeIds: ReadonlySet<string>,
): Record<string, NodeOutput> {
  const initialOutputs: Record<string, NodeOutput> = {};
  for (const edge of workspace.edges) {
    if (!executedNodeIds.has(edge.target) || executedNodeIds.has(edge.source)) continue;
    const source = workspace.nodes.find((node) => node.id === edge.source);
    if (!source) continue;
    const resolved = readNodeInputSource(source, workspace.id);
    if (resolved.availability === 'ready') initialOutputs[edge.source] = resolved.output;
  }
  return initialOutputs;
}
