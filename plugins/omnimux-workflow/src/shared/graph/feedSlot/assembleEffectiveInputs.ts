import { resolveGenerationPrompt } from '../generationPrompt.ts';
import { isMediaInputType } from '../../validation/compatKernel.ts';
import { acceptsFeedAsset } from './autoFillSlots.ts';
import type { EffectiveSubmitInputs, FeedAsset, SlotBindings, SlotConflict, SlotLayout, SlotOccupant, SlotSpec } from './types.ts';

export interface SlotSelection {
  slot: SlotSpec;
  occupant: SlotOccupant;
  asset?: FeedAsset;
}

/** The sole traversal of persisted consumption; never fills gaps from standby feed. */
export function selectSlotOccupants(layout: SlotLayout, bindings: SlotBindings, feedAssets: FeedAsset[], conflicts: SlotConflict[] = []): SlotSelection[] {
  if (layout.preset === 'none') return [];
  const byEdge = new Map(feedAssets.map((asset) => [asset.edgeId, asset]));
  const seenRoles = new Set<string>();
  return layout.slots.flatMap((slot) => {
    const seen = new Set<string>();
    return (bindings[slot.slot] ?? []).flatMap((occupant) => {
      if (seen.has(occupant.edgeId)) return [];
      seen.add(occupant.edgeId);
      if (conflicts.some((item) => item.slot === slot.slot && item.occupant.edgeId === occupant.edgeId)) return [];
      const asset = byEdge.get(occupant.edgeId);
      const identity = JSON.stringify([occupant.sourceNodeId, asset?.outputId ?? occupant.outputId ?? '', slot.role]);
      if (seenRoles.has(identity)) return [];
      seenRoles.add(identity);
      return [{ slot, occupant: { ...occupant }, asset: asset && asset.sourceNodeId === occupant.sourceNodeId ? { ...asset } : undefined }];
    });
  });
}

export function assembleEffectiveInputsFromSlots(args: {
  layout: SlotLayout;
  bindings: SlotBindings;
  conflicts: SlotConflict[];
  nodeData: { materialType?: string; prompt?: unknown; content?: unknown };
  feedAssets: FeedAsset[];
  incomingText: string[];
}): EffectiveSubmitInputs {
  const result: EffectiveSubmitInputs = {
    prompt: resolveGenerationPrompt(args.nodeData, args.incomingText), references: [],
    unusedFeedEdgeIds: [], emptyRequiredSlots: [], blockedInputs: [],
  };
  const selections = selectSlotOccupants(args.layout, args.bindings, args.feedAssets, args.conflicts);
  const counts = new Map<string, number>();
  const used = new Set(selections.map((item) => item.occupant.edgeId));
  for (const { slot, occupant, asset } of selections) {
    const count = (counts.get(slot.slot) ?? 0) + 1;
    counts.set(slot.slot, count);
    const path = asset?.pathOrUrl ?? asset?.url;
    const valid = asset && acceptsFeedAsset(slot, asset) && count <= (slot.max ?? Infinity);
    if (!valid || asset.availability !== 'ready' || !path?.trim() || !isMediaInputType(asset.type)) {
      result.blockedInputs.push({ slot: slot.slot, edgeId: occupant.edgeId, sourceNodeId: occupant.sourceNodeId,
        reason: valid && asset.availability === 'waiting' ? 'input_waiting' : 'input_unavailable' });
      continue;
    }
    const payload: EffectiveSubmitInputs['references'][number] = {
      type: asset.type, role: slot.role as EffectiveSubmitInputs['references'][number]['role'],
      pathOrUrl: path, targetSlot: slot.slot, sourceNodeId: asset.sourceNodeId, edgeId: asset.edgeId,
      ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
      ...(asset.sizeBytes !== undefined ? { sizeBytes: asset.sizeBytes } : {}),
      ...(asset.durationSec !== undefined ? { durationSec: asset.durationSec } : {}),
    };
    if (asset.type === 'audio' && slot.role === 'audio_track' && !result.audioTrack) result.audioTrack = payload;
    else result.references.push(payload);
  }
  result.emptyRequiredSlots = args.layout.slots.filter((slot) => (counts.get(slot.slot) ?? 0) < slot.min).map((slot) => slot.slot);
  result.unusedFeedEdgeIds = args.feedAssets.filter((asset) => !used.has(asset.edgeId)).map((asset) => asset.edgeId);
  return result;
}

export const assembleEffectiveInputs = assembleEffectiveInputsFromSlots;
