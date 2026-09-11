/**
 * @file plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/videoParams/videoSlotLayout.ts
 * Slot layout resolution for video nodes.
 */

import type { CapabilityCatalog } from '../../../../../../shared/api';
import { buildContractView, resolveModelView } from '../../../../../../shared/validation/compatKernel';
import type { SlotLayout } from '../../../../../../shared/graph/feedSlot';

const MULTI_IMAGE_OPS = ['first_frame', 'first_last_frame', 'image_to_video', 'video_multi_ref', 'multi_reference'];

function findCandidateImageSlot(model: ReturnType<typeof resolveModelView>) {
  if (!model) return null;
  for (const op of model.operations) {
    if (!op.listed || !MULTI_IMAGE_OPS.includes(op.id)) continue;
    const slot = op.inputs.find((s) => s.type === 'image' && s.role !== 'prompt');
    if (slot) return slot;
  }
  return null;
}

function hasFallbackImageOp(model: ReturnType<typeof resolveModelView>): boolean {
  if (!model) return false;
  return model.operations.some((op) => op.listed && MULTI_IMAGE_OPS.includes(op.id));
}

function buildFallbackStripLayout(
  imageSlot: ReturnType<typeof findCandidateImageSlot>,
  currentOperationId?: string,
): SlotLayout {
  let targetSlot = 'first_frame';
  let targetRole = 'first_frame';
  let labelKey = 'panel.slot.first_frame';
  let maxCount = 10;

  if (imageSlot) {
    targetSlot = imageSlot.slot;
    targetRole = imageSlot.role;
    if (targetSlot !== 'first_frame') {
      labelKey = 'panel.slot.reference_image';
    }
    if (typeof imageSlot.max === 'number') {
      maxCount = imageSlot.max;
    }
  }

  const opId = currentOperationId || 'text_to_video';

  return {
    operationId: opId,
    preset: 'strip',
    slots: [{
      slot: targetSlot,
      role: targetRole,
      type: 'image',
      min: 0,
      max: maxCount,
      labelKey,
    }],
    swap: false,
    addButton: true,
    implementationGaps: [],
  };
}

/**
 * 视频卡槽派生：当模式卡槽为 none 时，探测模型是否支持图生视频/多参考并智能降级为 strip 槽位。
 */
export function resolveVideoSlotLayout(
  slotLayout: SlotLayout,
  activeCatalog: CapabilityCatalog | null,
  modelValue: string,
  currentOperationId?: string,
): SlotLayout {
  if (slotLayout.preset !== 'none' && slotLayout.slots.length > 0) {
    return slotLayout;
  }
  const contractView = buildContractView(activeCatalog);
  const model = resolveModelView(contractView, modelValue);
  const imageSlot = findCandidateImageSlot(model);
  const hasFallback = hasFallbackImageOp(model);

  if (!imageSlot && !hasFallback) {
    return slotLayout;
  }

  return buildFallbackStripLayout(imageSlot, currentOperationId);
}
