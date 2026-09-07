import { acceptsFeedAsset } from './autoFillSlots.ts';
import type { FeedAsset, SlotBindings, SlotConflict, SlotLayout } from './types.ts';

/** Validate saved consumption without filling gaps or rewriting the request snapshot. */
export function slotBindingConflicts(layout: SlotLayout, bindings: SlotBindings, feed: FeedAsset[]): SlotConflict[] {
  const conflicts: SlotConflict[] = [];
  const assets = new Map(feed.map((asset) => [asset.edgeId, asset]));
  for (const [name, occupants] of Object.entries(bindings)) {
    const slot = layout.slots.find((item) => item.slot === name);
    for (const occupant of occupants) {
      const asset = assets.get(occupant.edgeId);
      const reason = !slot ? 'slot_removed' : asset && slot.type !== asset.type ? 'type_mismatch'
        : asset && !acceptsFeedAsset(slot, asset) ? 'role_illegal' : undefined;
      if (reason) conflicts.push({ slot: name, occupant: { ...occupant }, reason });
    }
  }
  return conflicts;
}
