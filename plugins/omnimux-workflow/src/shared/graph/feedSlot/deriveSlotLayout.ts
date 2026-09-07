import type { CapabilityCatalog } from '../../api.ts';
import { bindableSlots, buildContractView, resolveModelView } from '../../validation/compatKernel.ts';
import { SLOT_LAYOUT_TABLE, SLOT_NAME_ALIASES } from './slotLayoutTable.ts';
import type { SlotLayout } from './types.ts';

export function deriveSlotLayout(
  catalog: CapabilityCatalog | null | undefined,
  modelId: string | undefined,
  operationId: string | undefined,
): SlotLayout {
  const layout: SlotLayout = {
    operationId: operationId ?? '', preset: 'none', slots: [], swap: false,
    addButton: false, implementationGaps: [],
  };
  const model = resolveModelView(buildContractView(catalog), modelId);
  const operation = model?.operations.find((op) => op.id === operationId && op.listed);
  if (!operation) return { ...layout, implementationGaps: ['operation_unlisted'] };
  const inputs = bindableSlots(operation);
  const policy = SLOT_LAYOUT_TABLE[operation.id];
  if (!policy && inputs.length) layout.implementationGaps.push('missing_layout');
  layout.preset = inputs.length ? (policy?.preset ?? 'strip') : 'none';
  if (layout.preset === 'none') return layout;
  const ordered = [] as typeof inputs;
  for (const name of policy?.slots ?? []) {
    const matches = inputs.filter((input) => input.slot === name
      || SLOT_NAME_ALIASES[name]?.includes(input.slot) || input.role === name
      || (name === 'character' && input.type === 'image' && input.role === 'reference')
      || (name === 'driving_audio' && input.type === 'audio' && input.role === 'audio_track'));
    if (!matches.length) layout.implementationGaps.push(`missing_slot:${name}`);
    for (const input of matches) if (!ordered.includes(input)) ordered.push(input);
  }
  // Extra catalog slots remain consumable; a display preset cannot erase capability.
  for (const input of inputs) if (!ordered.includes(input)) ordered.push(input);
  layout.slots = ordered.map((input) => ({
    slot: input.slot, role: input.role, type: input.type, min: input.min, max: input.max,
    labelKey: `panel.slot.${input.slot}`,
    ...(input.allowedMimes ? { allowedMimes: [...input.allowedMimes] } : {}),
  }));
  layout.swap = policy?.swap === true && layout.slots.length === 2
    && layout.slots.every((slot) => slot.type === 'image' && slot.max === 1);
  layout.addButton = layout.preset === 'strip' && layout.slots.some((slot) => slot.max === null || slot.max > 0);
  return layout;
}
