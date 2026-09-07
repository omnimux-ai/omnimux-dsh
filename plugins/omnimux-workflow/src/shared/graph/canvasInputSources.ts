import type { Edge } from '@xyflow/react';
import type { CanvasNode } from './canvasInputMutationGateway.ts';
import { resolveGenerationPrompt } from './generationPrompt.ts';
import { readNodeInputSource } from './nodeInputSource.ts';
import { buildUpstreamFingerprint, readExplicitTargetSlot, type UpstreamAssetFingerprint } from '../validation/compatKernel.ts';

export function readCanvasParams(node: { data?: Record<string, unknown> }): Record<string, unknown> {
  const params = node.data?.params;
  return params && typeof params === 'object' ? params as Record<string, unknown> : {};
}

/** Feed fingerprint, not a submission population. Edges remain in connection order. */
export function buildCanvasUpstreamFingerprint(
  targetId: string, nodes: CanvasNode[], edges: Edge[], pendingSourceIds: string[] = [],
): ReturnType<typeof buildUpstreamFingerprint> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const target = byId.get(targetId);
  const incoming = [...edges.filter((edge) => edge.target === targetId), ...pendingSourceIds.map((source) => ({
    id: `pending-${source}-${targetId}`, source, target: targetId,
  }))] as Edge[];
  const assets: UpstreamAssetFingerprint[] = incoming.flatMap((edge, ordinal) => {
    const source = byId.get(edge.source);
    if (!source) return [];
    const current = readNodeInputSource(source);
    const data = (edge.data ?? {}) as Record<string, unknown>;
    const binding = data.slotBinding as { role?: string } | undefined;
    return [{ edgeId: edge.id ?? `feed-${edge.source}-${ordinal}`, sourceNodeId: source.id, sourceLabel: current.label,
      availability: current.availability, availabilityMessage: current.message, outputId: current.outputId,
      url: current.output.mediaAssets?.[0]?.url, textContent: current.output.text,
      type: current.materialType, ...current.metadata,
      role: typeof data.role === 'string' ? data.role : binding?.role,
      targetSlot: readExplicitTargetSlot(data, edge.targetHandle),
    }];
  });
  return buildUpstreamFingerprint({
    prompt: resolveGenerationPrompt(target?.data ?? {}, assets.filter((asset) => asset.type === 'text').map((asset) => asset.textContent)),
    localText: resolveGenerationPrompt(target?.data ?? {}), nodeFields: target ? readCanvasParams(target) : {}, assets,
  });
}
