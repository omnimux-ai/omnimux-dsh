import { hydrateSlotBindings, type LegacySlotEdge } from './hydrateSlotBindings.ts';
import { selectSlotOccupants } from './assembleEffectiveInputs.ts';
import { autoFillSlots, isReadyFeedAsset } from './autoFillSlots.ts';
import { slotBindingConflicts } from './slotBindingConflicts.ts';
import type { FeedAsset, SlotBindings, SlotConflict, SlotLayout } from './types.ts';

/** Refresh automatic loading while retaining explicit intent and intentional standby. */
export function effectiveInputDisplay(layout: SlotLayout, feed: FeedAsset[], saved?: SlotBindings,
  savedConflicts: SlotConflict[] = [], edges: LegacySlotEdge[] = [], standby: readonly string[] = []) {
  const explicit: SlotBindings | undefined = saved && Object.fromEntries(Object.entries(saved).map(([key, values]) => [key, values.map((value) => ({ ...value }))]));
  for (const conflict of savedConflicts) {
    if (!explicit) break;
    const values = explicit[conflict.slot] ??= [];
    if (!values.some((value) => value.edgeId === conflict.occupant.edgeId)) values.push(conflict.occupant);
  }
  // An empty saved map is an intentional empty selection, not a request to hydrate.
  const fill = explicit === undefined ? hydrateSlotBindings(feed, layout, edges)
    : Object.keys(explicit).length > 0
      ? autoFillSlots(feed, layout, explicit, standby)
      : { bindings: explicit, conflicts: [] as SlotConflict[] };
  const bindings = fill.bindings;
  for (const conflict of fill.conflicts) {
    const values = bindings[conflict.slot] ??= [];
    if (!values.some((value) => value.edgeId === conflict.occupant.edgeId)) values.push(conflict.occupant);
  }
  const conflicts = [...savedConflicts, ...fill.conflicts, ...slotBindingConflicts(layout, bindings, feed)]
    .filter((item, index, all) => all.findIndex((other) => other.slot === item.slot && other.occupant.edgeId === item.occupant.edgeId) === index);
  const selected = selectSlotOccupants(layout, bindings, feed, conflicts);
  const visibleBindings: SlotBindings = {};
  for (const { slot, occupant } of selected) (visibleBindings[slot.slot] ??= []).push(occupant);
  const unloaded = Object.entries(bindings).flatMap(([slot, values]) => values.filter((value) => value.pinned
    && !isReadyFeedAsset(feed.find((asset) => asset.edgeId === value.edgeId))).map((occupant) => ({ slot, occupant })));
  const requiredUnavailable = [...unloaded, ...conflicts].find(({ slot }) => {
    const spec = layout.slots.find((item) => item.slot === slot);
    return spec && (visibleBindings[slot]?.length ?? 0) < spec.min;
  });
  return { bindings, visibleBindings, conflicts, selected, unloaded, requiredUnavailable };
}
