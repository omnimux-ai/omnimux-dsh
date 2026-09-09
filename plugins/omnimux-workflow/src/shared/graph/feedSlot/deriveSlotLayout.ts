import type { CapabilityCatalog } from '../../api.ts';
import { bindableSlots, buildContractView, resolveModelView } from '../../validation/compatKernel.ts';
import { SLOT_LAYOUT_TABLE, SLOT_NAME_ALIASES } from './slotLayoutTable.ts';
import type { SlotLayout, SlotSpec } from './types.ts';

const DEFAULT_IMAGE_SLOT: SlotSpec = Object.freeze({
  slot: 'reference_image',
  role: 'reference',
  type: 'image',
  min: 0,
  max: 10,
  labelKey: 'panel.slot.reference_image',
});

const DEFAULT_TEXT_MULTIMODAL_SLOT: SlotSpec = Object.freeze({
  slot: 'reference_images',
  role: 'reference',
  type: 'image',
  min: 0,
  max: 10,
  labelKey: 'panel.slot.reference_images',
});

export function deriveSlotLayout(
  catalog: CapabilityCatalog | null | undefined,
  modelId: string | undefined,
  operationId: string | undefined,
  outputTypeOrOptions?: string | { outputType?: string },
): SlotLayout {
  const explicitOutputType = typeof outputTypeOrOptions === 'string'
    ? outputTypeOrOptions
    : outputTypeOrOptions?.outputType;

  const layout: SlotLayout = {
    operationId: operationId ?? '', preset: 'none', slots: [], swap: false,
    addButton: false, implementationGaps: [],
  };
  const contractView = buildContractView(catalog);
  const model = resolveModelView(contractView, modelId);
  const operation = model?.operations.find((op) => op.id === operationId && op.listed);

  const isPromptOnly = Boolean(modelId && modelId.includes('prompt-only'));
  const isImage = !isPromptOnly && (explicitOutputType === 'image' || (!explicitOutputType && (
    (operationId && ['text_to_image', 'image_to_image', 'multi_reference'].includes(operationId))
    || (operationId && (operationId.endsWith('_image') || operationId.startsWith('image_')))
    || operation?.output?.type === 'image'
    || (model && model.operations.some((op) => op.output?.type === 'image' || op.id === 'text_to_image'))
    || Boolean(catalog?.image && Array.isArray(catalog.image) && modelId && catalog.image.some((m) => m.id === modelId))
  )));

  const isText = !isPromptOnly && (explicitOutputType === 'text' || (!explicitOutputType && (
    (operationId && ['chat', 'vision_chat'].includes(operationId))
    || operation?.output?.type === 'text'
    || (model && model.operations.some((op) => op.output?.type === 'text' || op.id === 'chat' || op.id === 'vision_chat'))
    || Boolean(catalog?.text && Array.isArray(catalog.text) && modelId && catalog.text.some((m) => m.id === modelId))
  )));

  const multimodalTextOp = isText
    ? (model?.operations.find((op) => op.listed && op.id === 'vision_chat' && bindableSlots(op).length > 0)
       || model?.operations.find((op) => op.listed && bindableSlots(op).length > 0))
    : undefined;
  const isMultimodalTextModel = Boolean(multimodalTextOp);

  if (!operation) {
    if (isImage) {
      return {
        ...layout,
        preset: 'strip',
        slots: [{ ...DEFAULT_IMAGE_SLOT }],
        addButton: true,
        implementationGaps: ['operation_unlisted'],
      };
    }
    if (isMultimodalTextModel && multimodalTextOp) {
      const inputs = bindableSlots(multimodalTextOp);
      const policy = SLOT_LAYOUT_TABLE[multimodalTextOp.id] ?? SLOT_LAYOUT_TABLE.vision_chat;
      const ordered = [] as typeof inputs;
      for (const name of policy?.slots ?? []) {
        const matches = inputs.filter((input) => input.slot === name
          || SLOT_NAME_ALIASES[name]?.includes(input.slot) || input.role === name);
        for (const input of matches) if (!ordered.includes(input)) ordered.push(input);
      }
      for (const input of inputs) if (!ordered.includes(input)) ordered.push(input);
      const mappedSlots = ordered.map((input) => ({
        slot: input.slot, role: input.role, type: input.type, min: input.min, max: input.max,
        labelKey: `panel.slot.${input.slot}`,
        ...(input.allowedMimes ? { allowedMimes: [...input.allowedMimes] } : {}),
      }));
      return {
        ...layout,
        operationId: multimodalTextOp.id,
        preset: 'strip',
        slots: mappedSlots.length > 0 ? mappedSlots : [{ ...DEFAULT_TEXT_MULTIMODAL_SLOT }],
        addButton: true,
        implementationGaps: ['operation_unlisted'],
      };
    }
    return { ...layout, implementationGaps: ['operation_unlisted'] };
  }

  let activeOp = operation;
  if (isMultimodalTextModel && bindableSlots(operation).length === 0 && multimodalTextOp) {
    activeOp = multimodalTextOp;
  }

  const inputs = bindableSlots(activeOp);
  const policy = SLOT_LAYOUT_TABLE[activeOp.id];
  if (!policy && inputs.length) layout.implementationGaps.push('missing_layout');
  layout.preset = inputs.length ? (policy?.preset ?? 'strip') : (isImage ? 'strip' : 'none');
  if (layout.preset === 'none') return layout;

  const ordered = [] as typeof inputs;
  for (const name of policy?.slots ?? []) {
    const matches = inputs.filter((input) => input.slot === name
      || SLOT_NAME_ALIASES[name]?.includes(input.slot) || input.role === name
      || (name === 'character' && input.type === 'image' && input.role === 'reference')
      || (name === 'driving_audio' && input.type === 'audio' && input.role === 'audio_track'));
    if (!matches.length && inputs.length > 0 && policy?.preset !== 'strip') layout.implementationGaps.push(`missing_slot:${name}`);
    for (const input of matches) if (!ordered.includes(input)) ordered.push(input);
  }
  // Extra catalog slots remain consumable; a display preset cannot erase capability.
  for (const input of inputs) if (!ordered.includes(input)) ordered.push(input);
  layout.slots = ordered.map((input) => ({
    slot: input.slot, role: input.role, type: input.type, min: input.min, max: input.max,
    labelKey: `panel.slot.${input.slot}`,
    ...(input.allowedMimes ? { allowedMimes: [...input.allowedMimes] } : {}),
  }));

  if (isImage && layout.slots.length === 0) {
    layout.slots = [{ ...DEFAULT_IMAGE_SLOT }];
  } else if (isMultimodalTextModel && layout.slots.length === 0) {
    layout.slots = [{ ...DEFAULT_TEXT_MULTIMODAL_SLOT }];
  }

  layout.swap = policy?.swap === true && layout.slots.length === 2
    && layout.slots.every((slot) => slot.type === 'image' && slot.max === 1);
  layout.addButton = isImage || isMultimodalTextModel
    ? true
    : (layout.preset === 'strip' && layout.slots.some((slot) => slot.max === null || slot.max > 0));
  return layout;
}
