import { hydrateSlotBindings, type LegacySlotEdge } from './hydrateSlotBindings.ts';
import { selectSlotOccupants } from './assembleEffectiveInputs.ts';
import { slotBindingConflicts } from './slotBindingConflicts.ts';
import type { FeedAsset, SlotBindings, SlotConflict, SlotLayout } from './types.ts';

/** Project consumption without refilling or dropping invalid user choices. */
export function effectiveInputDisplay(layout: SlotLayout, feed: FeedAsset[], saved?: SlotBindings,
  savedConflicts: SlotConflict[] = [], edges: LegacySlotEdge[] = []) {
  const hydrated = saved === undefined ? hydrateSlotBindings(feed, layout, edges) : undefined;
  const bindings = saved ?? hydrated!.bindings;
  const conflicts = [...savedConflicts, ...(hydrated?.conflicts ?? []), ...slotBindingConflicts(layout, bindings, feed)];
  const selected = selectSlotOccupants(layout, bindings, feed, conflicts);
  const visibleBindings: SlotBindings = {};
  for (const { slot, occupant } of selected) (visibleBindings[slot.slot] ??= []).push(occupant);
  return { bindings, visibleBindings, conflicts, selected };
}
