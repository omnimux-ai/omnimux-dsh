import { resolveGenerationPrompt } from '../generationPrompt.ts';
import { isMediaInputType } from '../../validation/compatKernel.ts';
import { acceptsFeedAsset, isReadyFeedAsset } from './autoFillSlots.ts';
import type { EffectiveSubmitInputs, FeedAsset, SlotBindings, SlotConflict, SlotLayout, SlotOccupant, SlotSpec } from './types.ts';

export interface SlotSelection {
  slot: SlotSpec;
  occupant: SlotOccupant;
  asset?: FeedAsset;
  state: 'ready' | 'inactive' | 'pending' | 'invalid';
  reasonCode?: 'input_waiting' | 'input_unavailable' | 'slot_removed' | 'role_conflict' | 'slot_capacity';
}

/** The sole traversal of persisted consumption; never fills gaps from standby feed. */
export function selectSlotOccupants(layout: SlotLayout, bindings: SlotBindings, feedAssets: FeedAsset[], conflicts: SlotConflict[] = [], inputBindingVersion?: number): SlotSelection[] {
  const byEdge = new Map(feedAssets.map(asset => [asset.edgeId, asset]));
  const seenRoles = new Set<string>();
  const counts = new Map<string, number>();
  const records: SlotSelection[] = [];
  for (const [name, occupants] of Object.entries(bindings)) {
    const spec = layout.slots.find(slot => slot.slot === name);
    const seen = new Set<string>();
    for (const occupant of occupants) {
      if (inputBindingVersion !== 1 && seen.has(occupant.edgeId)) continue;
      seen.add(occupant.edgeId);
      const candidate = byEdge.get(occupant.edgeId);
      const asset = candidate?.sourceNodeId === occupant.sourceNodeId ? candidate : undefined;
      const slot: SlotSpec = spec ?? { slot: name, role: occupant.role ?? '', type: asset?.type ?? '', min: 0, max: null, labelKey: '' };
      let state: SlotSelection['state'] = 'ready';
      let reasonCode: SlotSelection['reasonCode'];
      if (occupant.use === 'inactive') state = 'inactive';
      else if (!spec) { state = 'invalid'; reasonCode = 'slot_removed'; }
      else if ((occupant.role !== undefined && occupant.role !== spec.role)
        || (inputBindingVersion === 1 && occupants.filter(item => item.edgeId === occupant.edgeId).length > 1)
        || conflicts.some(item => item.slot === name && item.occupant.edgeId === occupant.edgeId)
        || (asset && !acceptsFeedAsset(spec, asset))) { state = 'invalid'; reasonCode = 'role_conflict'; }
      else if (asset?.availability === 'waiting') { state = 'pending'; reasonCode = 'input_waiting'; }
      else if (!isReadyFeedAsset(asset)) { state = 'invalid'; reasonCode = 'input_unavailable'; }
      if (state === 'ready' || state === 'pending') {
        const identity = JSON.stringify([occupant.sourceNodeId, asset?.outputId ?? occupant.outputId ?? '', slot.role]);
        if (seenRoles.has(identity)) {
          if (inputBindingVersion !== 1) continue;
          state = 'invalid'; reasonCode = 'role_conflict';
        } else seenRoles.add(identity);
        const count = (counts.get(name) ?? 0) + 1;
        counts.set(name, count);
        if (!slot.composition && count > (slot.max ?? Infinity)) { state = 'invalid'; reasonCode = 'slot_capacity'; }
      }
      if (inputBindingVersion !== 1 && state !== 'ready') continue;
      records.push({ slot, occupant: { ...occupant,
        ...(inputBindingVersion === 1 && asset?.outputId ? { outputId: asset.outputId } : {}),
      }, ...(asset ? { asset: { ...asset } } : {}), state, ...(reasonCode ? { reasonCode } : {}) });
    }
  }
  return records.sort((a, b) => (a.occupant.ordinal ?? a.asset?.ordinal ?? 0) - (b.occupant.ordinal ?? b.asset?.ordinal ?? 0));
}

export function assembleEffectiveInputsFromSlots(args: {
  layout: SlotLayout;
  bindings: SlotBindings;
  conflicts: SlotConflict[];
  nodeData: { materialType?: string; prompt?: unknown; content?: unknown; inputBindingVersion?: number };
  feedAssets: FeedAsset[];
  incomingText: string[];
}): EffectiveSubmitInputs {
  const result: EffectiveSubmitInputs = {
    prompt: args.layout.acceptsText === false ? '' : resolveGenerationPrompt(args.nodeData, args.incomingText), references: [],
    unusedFeedEdgeIds: [], emptyRequiredSlots: [], blockedInputs: [],
  };
  const records = selectSlotOccupants(args.layout, args.bindings, args.feedAssets, args.conflicts, args.nodeData.inputBindingVersion);
  const selections = records.filter(record => record.state === 'ready');
  result.blockedInputs = records.filter(record => record.state === 'pending' || record.state === 'invalid').map(record => ({
    slot: record.slot.slot, edgeId: record.occupant.edgeId, sourceNodeId: record.occupant.sourceNodeId,
    reason: record.reasonCode ?? 'input_unavailable',
  }));
  const textSelections = selections.filter(item => item.slot.type === 'text')
    .sort((a, b) => (a.occupant.ordinal ?? a.asset?.ordinal ?? 0) - (b.occupant.ordinal ?? b.asset?.ordinal ?? 0));
  const textSlot = args.layout.slots.find(slot => slot.type === 'text' && slot.composition);
  const composition = textSlot?.composition;
  if (args.nodeData.inputBindingVersion === 1) {
    const local = textSlot && !textSlot.valueSources?.includes('local_field') ? {} : args.nodeData;
    result.prompt = args.layout.acceptsText === false ? '' : resolveGenerationPrompt(local,
      textSelections.map(item => item.asset?.textContent), composition);
  }
  const counts = new Map<string, number>();
  const used = new Set(selections.map((item) => item.occupant.edgeId));
  for (const { slot, occupant, asset } of selections) {
    if (slot.type === 'text') {
      counts.set(slot.slot, slot.composition ? Number(Boolean(result.prompt.trim())) : (counts.get(slot.slot) ?? 0) + 1);
      continue;
    }
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
  for (const slot of args.layout.slots) {
    if (slot.type === 'text' && slot.composition && slot.valueSources?.includes('local_field')) {
      counts.set(slot.slot, Number(Boolean(result.prompt.trim())));
    }
  }
  result.emptyRequiredSlots = args.layout.slots.filter((slot) => (counts.get(slot.slot) ?? 0) < slot.min).map((slot) => slot.slot);
  result.unusedFeedEdgeIds = args.feedAssets.filter((asset) => !used.has(asset.edgeId)).map((asset) => asset.edgeId);
  return result;
}

export const assembleEffectiveInputs = assembleEffectiveInputsFromSlots;
