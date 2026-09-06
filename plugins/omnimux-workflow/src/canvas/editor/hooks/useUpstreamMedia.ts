import { useMemo } from 'react';
import { useNodes, useEdges } from '@xyflow/react';
import type { MaterialNodeData, MaterialType } from '../../types/materialNode';
import { readNodeInputSource, type InputAvailability } from '../../../shared/graph/nodeInputSource.ts';
import {
  type UpstreamMediaSnapshot,
} from '../../../shared/validation/operationUi.ts';
import { readExplicitTargetSlot } from '../../../shared/validation/compatKernel.ts';

export interface UpstreamMediaItem {
  nodeId: string;
  availability: InputAvailability;
  availabilityMessage?: string;
  outputId?: string;
  label: string;
  materialType: MaterialType;
  url?: string;
  hasMedia: boolean;
  textContent?: string;
  /** Canonical MIME; undefined when unknown (never invent). */
  mimeType?: string;
  /** Canonical byte size; undefined when unknown. */
  sizeBytes?: number;
  /** Canonical duration seconds; undefined when unknown. */
  durationSec?: number;
  /** Edge id feeding this upstream (when known). */
  edgeId?: string;
  role?: string;
  targetSlot?: string;
}

export function useUpstreamMedia(nodeId: string): UpstreamMediaItem[] {
  const nodes = useNodes();
  const edges = useEdges();

  return useMemo<UpstreamMediaItem[]>(() => {
    if (!nodeId || !edges || !nodes) return [];
    const inbound = edges.filter((edge) => edge.target === nodeId);
    return inbound.flatMap((edge) => {
      const node = nodes.find((n) => n.id === edge.source);
      if (!node) return [];
      const data = (node.data || {}) as unknown as MaterialNodeData;
      const source = readNodeInputSource(node);
      const asset = source.output.mediaAssets?.[0];
      const url = asset?.url;
      const textContent = source.output.text;
      const hasMedia = source.availability === 'ready';
      const { mimeType, sizeBytes, durationSec } = source.metadata ?? {};
      const edgeData = (edge.data ?? {}) as Record<string, unknown>;
      const role =
        typeof edgeData.role === 'string' && edgeData.role.trim()
          ? edgeData.role.trim()
          : undefined;
      const targetSlot = readExplicitTargetSlot(edgeData, edge.targetHandle);

      return [
        {
          nodeId: node.id,
          availability: source.availability,
          availabilityMessage: source.message,
          outputId: source.outputId,
          label: data.label || node.id,
          materialType: data.materialType || 'image',
          url,
          hasMedia,
          textContent,
          ...(mimeType ? { mimeType } : {}),
          ...(sizeBytes !== undefined ? { sizeBytes } : {}),
          ...(durationSec !== undefined ? { durationSec } : {}),
          edgeId: edge.id,
          ...(role ? { role } : {}),
          ...(targetSlot ? { targetSlot } : {}),
        },
      ];
    });
  }, [nodes, edges, nodeId]);
}

/** Project UpstreamMediaItem[] into the fingerprint snapshot shape. */
export function toUpstreamSnapshots(items: UpstreamMediaItem[]): UpstreamMediaSnapshot[] {
  return items.map((item) => ({
    nodeId: item.nodeId,
    label: item.label,
    availability: item.availability,
    availabilityMessage: item.availabilityMessage,
    outputId: item.outputId,
    url: item.url,
    materialType: item.materialType,
    ...(item.textContent ? { textContent: item.textContent } : {}),
    ...(item.mimeType ? { mimeType: item.mimeType } : {}),
    ...(item.sizeBytes !== undefined ? { sizeBytes: item.sizeBytes } : {}),
    ...(item.durationSec !== undefined ? { durationSec: item.durationSec } : {}),
    ...(item.edgeId ? { edgeId: item.edgeId } : {}),
    ...(item.role ? { role: item.role } : {}),
    ...(item.targetSlot ? { targetSlot: item.targetSlot } : {}),
  }));
}
