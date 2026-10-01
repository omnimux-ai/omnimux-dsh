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
  standbyEdgeIds: readonly string[] = [],
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
    const boundTextOccupants = selected.filter(item => item.state === 'ready' && item.slot.type === 'text')
      .sort((a, b) => (a.occupant.ordinal ?? a.asset?.ordinal ?? 0) - (b.occupant.ordinal ?? b.asset?.ordinal ?? 0));
    const boundTexts = boundTextOccupants.map(item => item.asset?.textContent);
    const textSlot = layout.slots.find(slot => slot.type === 'text' && slot.composition);

    const standbySet = new Set(standbyEdgeIds);
    // 若当前 layout.slots 中未声明专门的 text slot，但当前 operation 允许文本输入（layout.acceptsText !== false），
    // 则上游连入的就绪文本资产（且未被用于媒体槽、未被用户明确设为待命的）作为自由上游提示词源消费
    const freeTextAssets = (!textSlot && layout.acceptsText !== false)
      ? selectGenerationTextSources(fingerprint.assets).filter(asset =>
          !selected.some(sel => sel.asset?.edgeId === asset.edgeId) && (!asset.edgeId || !standbySet.has(asset.edgeId)))
      : [];
    const freeTexts = freeTextAssets.map(asset => asset.textContent);
    const allTexts = [...boundTexts, ...freeTexts].filter((t): t is string => typeof t === 'string' && Boolean(t.trim()));

    const localText = textSlot && !textSlot.valueSources?.includes('local_field') ? '' : fingerprint.localText ?? '';
    return buildUpstreamFingerprint({
      ...fingerprint,
      localText,
      prompt: layout.acceptsText === false ? '' : resolveGenerationPrompt({ prompt: localText }, allTexts, textSlot?.composition),
      assets: [...freeTextAssets, ...media],
    });
  }
  return buildUpstreamFingerprint({
    ...fingerprint,
    prompt: layout.acceptsText === false ? '' : fingerprint.prompt,
    assets: [...(layout.acceptsText === false ? [] : selectGenerationTextSources(fingerprint.assets)), ...media],
  });
}
