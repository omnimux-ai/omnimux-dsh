import { useMemo } from 'react';
import { useNodes, useEdges } from '@xyflow/react';
import type { MaterialNodeData, MaterialType } from '../../types/materialNode';
import { resolveMediaPreviewUrl, type MediaAssetLike } from '../utils/mediaUrl';
import {
  readOptionalMediaNumber,
  readOptionalMime,
  type UpstreamMediaSnapshot,
} from '../../../shared/validation/operationUi.ts';
import { readExplicitTargetSlot } from '../../../shared/validation/compatKernel.ts';

export interface UpstreamMediaItem {
  nodeId: string;
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
      const url = resolveMediaPreviewUrl(
        data.materialType,
        data.mediaAssets as MediaAssetLike[] | undefined,
        data.mediaUrl,
      );
      const textContent = (data.content || data.generatedContent || '') as string;
      const hasMedia = Boolean(url || (data.materialType === 'text' && textContent.trim().length > 0));
      const mimeType = readOptionalMime((data as Record<string, unknown>).mimeType);
      const sizeBytes =
        readOptionalMediaNumber((data as Record<string, unknown>).sizeBytes)
        ?? readOptionalMediaNumber((data as Record<string, unknown>).fileSize);
      const durationSec =
        readOptionalMediaNumber((data as Record<string, unknown>).durationSec)
        ?? readOptionalMediaNumber((data as Record<string, unknown>).duration);
      const edgeData = (edge.data ?? {}) as Record<string, unknown>;
      const role =
        typeof edgeData.role === 'string' && edgeData.role.trim()
          ? edgeData.role.trim()
          : undefined;
      const targetSlot = readExplicitTargetSlot(edgeData, edge.targetHandle);

      return [
        {
          nodeId: node.id,
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
