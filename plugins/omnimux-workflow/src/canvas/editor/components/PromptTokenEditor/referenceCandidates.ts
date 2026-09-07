import type { Edge } from '@xyflow/react';
import type { CanvasNode, CanvasInputMutation } from '../../../../shared/graph/canvasInputMutationGateway.ts';
import { validateCanvasConnectionStructure } from '../../../../shared/graph/canvasConnectionStructure.ts';
import { readNodeInputSource, type InputAvailability } from '../../../../shared/graph/nodeInputSource.ts';
import type { PromptReferenceToken } from '../../../../shared/graph/slotContractTypes.ts';
import type { SlotBindings } from '../../../../shared/graph/feedSlot/index.ts';
import type { UpstreamMediaItem } from '../../hooks/useUpstreamMedia.ts';

export interface ReferenceCandidate extends PromptReferenceToken {
  availability: InputAvailability;
  connected: boolean;
  reasonCode?: string;
}

/** Negative indices identify node references, never a media slot. Legacy indices stay readable. */
export function referenceToken(nodeId: string, label: string, materialType: PromptReferenceToken['materialType'], mediaUrl?: string, slotIndex = materialType === 'text' ? -1 : -2): PromptReferenceToken {
  return { nodeId, label, materialType, mediaUrl, slotIndex, raw: `@ref[${nodeId}:${slotIndex}:${label}]` };
}

/** Slot bindings and real inbound edges, not the retired slotState cache, own this list. */
export function currentReferenceCandidates(upstreams: UpstreamMediaItem[], bindings: SlotBindings): ReferenceCandidate[] {
  const occupied = Object.values(bindings).flat();
  const ordered = [...occupied.flatMap((slot) => upstreams.filter((item) => item.edgeId === slot.edgeId)), ...upstreams];
  const seen = new Set<string>();
  return ordered.flatMap((item) => {
    if (seen.has(item.nodeId)) return [];
    seen.add(item.nodeId);
    const index = occupied.findIndex((slot) => slot.edgeId === item.edgeId);
    return [{ ...referenceToken(item.nodeId, item.label, item.materialType, item.url, index < 0 ? undefined : index), availability: item.availability, connected: true }];
  });
}

/** All image/text sources remain discoverable, including pending outputs and invalid topology. */
export function canvasReferenceCandidates(targetId: string, nodes: CanvasNode[], edges: Edge[]): ReferenceCandidate[] {
  return nodes.flatMap((node) => {
    if (node.id === targetId) return [];
    const source = readNodeInputSource(node);
    if (source.materialType !== 'image' && source.materialType !== 'text') return [];
    const connected = edges.some((edge) => edge.source === node.id && edge.target === targetId);
    const validity = connected ? { valid: true } : validateCanvasConnectionStructure({ source: node.id, target: targetId }, nodes, edges);
    return [{ ...referenceToken(node.id, source.label, source.materialType, source.output.mediaAssets?.[0]?.url), availability: source.availability, connected, ...(!validity.valid ? { reasonCode: validity.reasonCode } : {}) }];
  });
}

/** The gateway validates again at commit time and applies edge + prompt in a single graph mutation. */
export function referenceMutation(targetId: string, sourceId: string, prompt: string, edges: Edge[]): CanvasInputMutation {
  const connected = edges.some((edge) => edge.source === sourceId && edge.target === targetId);
  return { ...(!connected ? { addEdges: [{ source: sourceId, target: targetId }] } : {}), nodePatches: [{ nodeId: targetId, data: { prompt } }] };
}
