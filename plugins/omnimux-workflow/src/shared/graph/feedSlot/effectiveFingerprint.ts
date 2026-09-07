import { buildUpstreamFingerprint, isMediaInputType, type UpstreamFingerprint } from '../../validation/compatKernel.ts';
import { selectSlotOccupants } from './assembleEffectiveInputs.ts';
import type { FeedAsset, SlotBindings, SlotConflict, SlotLayout } from './types.ts';

export function feedFromFingerprint(fingerprint: UpstreamFingerprint): FeedAsset[] {
  return fingerprint.assets.flatMap((asset, ordinal) => isMediaInputType(asset.type) ? [{
    ...asset, edgeId: asset.edgeId ?? `feed-${asset.sourceNodeId}-${ordinal}`,
    ordinal, availability: asset.availability ?? 'ready',
  }] : []);
}

/** Readiness uses the same slot traversal as payload assembly, including waiting occupants. */
export function effectiveSlotFingerprint(
  fingerprint: UpstreamFingerprint, layout: SlotLayout, bindings: SlotBindings, conflicts: SlotConflict[] = [],
): UpstreamFingerprint {
  const selected = selectSlotOccupants(layout, bindings, feedFromFingerprint(fingerprint), conflicts);
  const media = selected.map(({ slot, occupant, asset }) => ({
    ...asset, edgeId: occupant.edgeId, sourceNodeId: occupant.sourceNodeId,
    type: slot.type, role: slot.role, targetSlot: slot.slot,
    availability: asset?.availability ?? 'unavailable' as const,
    ...(asset && asset.type !== slot.type ? { availability: 'unavailable' as const } : {}),
  }));
  return buildUpstreamFingerprint({
    ...fingerprint, assets: [...fingerprint.assets.filter((asset) => !isMediaInputType(asset.type)), ...media],
  });
}
