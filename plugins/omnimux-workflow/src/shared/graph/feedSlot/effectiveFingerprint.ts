import { buildUpstreamFingerprint, isMediaInputType, type UpstreamFingerprint } from '../../validation/compatKernel.ts';
import { selectSlotOccupants } from './assembleEffectiveInputs.ts';
import { resolveGenerationPrompt, selectGenerationTextSources } from '../generationPrompt.ts';
import type { FeedAsset, SlotBindings, SlotConflict, SlotLayout } from './types.ts';

export function feedFromFingerprint(fingerprint: UpstreamFingerprint, inputBindingVersion?: number): FeedAsset[] {
  return fingerprint.assets.flatMap((asset, ordinal) => isMediaInputType(asset.type) || (inputBindingVersion === 1 && asset.type === 'text') ? [{
    ...asset, edgeId: asset.edgeId ?? `feed-${asset.sourceNodeId}-${ordinal}`,
    ordinal, availability: asset.availability ?? 'ready',
  }] : []);
}

/** Readiness uses the same available occupant traversal as payload assembly. */
export function effectiveSlotFingerprint(
  fingerprint: UpstreamFingerprint, layout: SlotLayout, bindings: SlotBindings, conflicts: SlotConflict[] = [], inputBindingVersion?: number,
): UpstreamFingerprint {
  const records = selectSlotOccupants(layout, bindings, feedFromFingerprint(fingerprint, inputBindingVersion), conflicts, inputBindingVersion);
  const selected = records.filter(record => record.state !== 'inactive');
  const media = selected.map(({ slot, occupant, asset, state }) => ({
    ...asset, edgeId: occupant.edgeId, sourceNodeId: occupant.sourceNodeId,
    type: slot.type, role: slot.role, targetSlot: slot.slot,
    availability: state === 'invalid' ? 'unavailable' as const : state === 'pending' ? 'waiting' as const : asset?.availability ?? 'unavailable' as const,
    ...(asset && asset.type !== slot.type ? { availability: 'unavailable' as const } : {}),
  }));
  if (inputBindingVersion === 1) {
    const texts = selected.filter(item => item.state === 'ready' && item.slot.type === 'text')
      .sort((a, b) => (a.occupant.ordinal ?? a.asset?.ordinal ?? 0) - (b.occupant.ordinal ?? b.asset?.ordinal ?? 0))
      .map(item => item.asset?.textContent);
    const textSlot = layout.slots.find(slot => slot.type === 'text' && slot.composition);
    const localText = textSlot && !textSlot.valueSources?.includes('local_field') ? '' : fingerprint.localText ?? '';
    return buildUpstreamFingerprint({ ...fingerprint, localText,
      prompt: layout.acceptsText === false ? '' : resolveGenerationPrompt({ prompt: localText }, texts,
        textSlot?.composition), assets: media });
  }
  return buildUpstreamFingerprint({
    ...fingerprint,
    prompt: layout.acceptsText === false ? '' : fingerprint.prompt,
    assets: [...(layout.acceptsText === false ? [] : selectGenerationTextSources(fingerprint.assets)), ...media],
  });
}
