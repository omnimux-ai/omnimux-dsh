import type { CapabilityCatalog } from '../../api.ts';
import { buildContractView, resolveModelView } from '../../validation/compatKernel.ts';
import { readNodeInputSource } from '../nodeInputSource.ts';
import { resolveNodeKind } from '../materialNode.ts';
import { deriveSlotLayout } from './deriveSlotLayout.ts';
import { hydrateSlotBindings } from './hydrateSlotBindings.ts';
import type { LegacySlotEdge } from './hydrateSlotBindings.ts';
import type { FeedAsset } from './types.ts';
import { buildCanvasUpstreamFingerprint } from '../canvasInputSources.ts';
import type { CanvasNode } from '../canvasInputMutationGateway.ts';
import type { Edge } from '@xyflow/react';
import { resolveSlotOperation } from './resolveSlotOperation.ts';

/** Freeze legacy hydration for dispatch without modifying the persisted graph or topology. */
export function prepareExecutionSlotGraph<
  N extends { id: string; type?: string; data?: Record<string, unknown> },
  E extends LegacySlotEdge & { target: string },
>(nodes: N[], edges: E[], catalog: CapabilityCatalog | null | undefined): { nodes: N[]; edges: E[] } {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const view = buildContractView(catalog);
  const ordinalByTarget = new Map<string, number>();
  const nextEdges = edges.map((edge) => {
    const ordinal = ordinalByTarget.get(edge.target) ?? 0;
    ordinalByTarget.set(edge.target, ordinal + 1);
    return { ...structuredClone(edge), id: edge.id ?? `feed-${edge.source}-${ordinal}`,
      data: { ...structuredClone(edge.data), feedType: readNodeInputSource(byId.get(edge.source) ?? { id: edge.source }).materialType } };
  }) as E[];
  const nextNodes = nodes.map((node) => {
    if (node.type !== 'material' || resolveNodeKind(node.data ?? {}) !== 'generate') return structuredClone(node);
    const data = structuredClone(node.data ?? {});
    const params = (data.params ?? {}) as Record<string, unknown>;
    const kind = (data.materialType ?? 'text') as keyof NonNullable<CapabilityCatalog['defaults']>;
    const model = resolveModelView(view, (params.model ?? catalog?.defaults?.[kind]) as string | undefined);
    params.model ??= model?.id;
    params.operation ??= resolveSlotOperation(catalog, model?.id, params.operation, kind,
      buildCanvasUpstreamFingerprint(node.id, nodes as unknown as CanvasNode[], nextEdges as unknown as Edge[]));
    data.params = params;
    if (data.slotBindings === undefined) {
      const incoming = nextEdges.filter((edge) => edge.target === node.id);
      const feed: FeedAsset[] = incoming.flatMap((edge, ordinal) => {
        const source = readNodeInputSource(byId.get(edge.source) ?? { id: edge.source });
        if (!['image', 'video', 'audio'].includes(source.materialType)) return [];
        return [{ edgeId: edge.id ?? `feed-${edge.source}-${ordinal}`, sourceNodeId: edge.source, ordinal,
          type: source.materialType, outputId: source.outputId, availability: source.availability,
          url: source.output.mediaAssets?.[0]?.url, ...source.metadata }];
      });
      const layout = deriveSlotLayout(catalog, model?.id, params.operation as string | undefined);
      const fill = hydrateSlotBindings(feed, layout, incoming);
      data.slotBindings = fill.bindings;
      data.slotConflicts = fill.conflicts;
    }
    return { ...node, data } as N;
  });
  return { nodes: nextNodes, edges: nextEdges };
}
