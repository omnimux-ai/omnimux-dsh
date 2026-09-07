import { readExplicitTargetSlot } from '../../validation/compatKernel.ts';
import { acceptsFeedAsset, autoFillSlots } from './autoFillSlots.ts';
import type { FeedAsset, FillResult, SlotBindings, SlotLayout } from './types.ts';

export interface LegacySlotEdge {
  id?: string;
  source: string;
  targetHandle?: string | null;
  data?: Record<string, unknown>;
}

/** Only call on absent node bindings; an existing empty map means intentionally empty. */
export function hydrateSlotBindings(
  feedAssets: FeedAsset[], layout: SlotLayout, edges: LegacySlotEdge[] = [],
): FillResult {
  const explicit: SlotBindings = {};
  for (const asset of feedAssets) {
    const edge = edges.find((candidate) => candidate.id === asset.edgeId);
    const data = edge?.data ?? {};
    const slotName = readExplicitTargetSlot(data, edge?.targetHandle) ?? asset.targetSlot;
    const role = typeof data.role === 'string' ? data.role : asset.role;
    const slot = slotName ? layout.slots.find((item) => item.slot === slotName)
      : role ? layout.slots.find((item) => item.role === role && item.type === asset.type) : undefined;
    if (slotName || role) {
      // Invalid explicit intent stays a conflict; it must not become a guessed role.
      const key = slot?.slot ?? slotName ?? `role:${role}`;
      (explicit[key] ??= []).push({ sourceNodeId: asset.sourceNodeId, edgeId: asset.edgeId,
        outputId: asset.outputId, pinned: !slot || !acceptsFeedAsset(slot, asset) });
    }
  }
  return autoFillSlots(feedAssets, layout, explicit);
}
