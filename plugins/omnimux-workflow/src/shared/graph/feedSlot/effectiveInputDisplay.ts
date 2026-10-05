import { hydrateSlotBindings, type LegacySlotEdge } from './hydrateSlotBindings.ts';
import { selectSlotOccupants } from './assembleEffectiveInputs.ts';
import { acceptsFeedAsset, autoFillSlots, isReadyFeedAsset } from './autoFillSlots.ts';
import { slotBindingConflicts } from './slotBindingConflicts.ts';
import type { FeedAsset, SlotBindings, SlotConflict, SlotLayout, UnusedSupply } from './types.ts';

/** Media supply is the only kind the user cannot otherwise notice missing from the slot area. */
const UNUSED_MEDIA_TYPES = new Set(['image', 'video', 'audio']);

/** Refresh automatic loading while retaining explicit intent and intentional standby. */
export function effectiveInputDisplay(layout: SlotLayout, feed: FeedAsset[], saved?: SlotBindings,
  savedConflicts: SlotConflict[] = [], edges: LegacySlotEdge[] = [], standby: readonly string[] = [], inputBindingVersion?: number) {
  const explicit: SlotBindings | undefined = saved && Object.fromEntries(Object.entries(saved).map(([key, values]) => [key, values.map((value) => ({ ...value }))]));
  for (const conflict of savedConflicts) {
    if (!explicit) break;
    const values = explicit[conflict.slot] ??= [];
    if (!values.some((value) => value.edgeId === conflict.occupant.edgeId)) values.push(conflict.occupant);
  }
  // 当显式传入已保存的字典（含空对象）时严格保持不变；仅当 explicit === undefined（未初始化装填态）时执行 autoFillSlots
  const fill = inputBindingVersion === 1
    ? (explicit === undefined ? autoFillSlots(feed, layout, {}, standby) : { bindings: explicit, conflicts: [] as SlotConflict[] })
    : explicit === undefined ? hydrateSlotBindings(feed, layout, edges)
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
  const records = selectSlotOccupants(layout, bindings, feed, conflicts, inputBindingVersion);
  const selected = records.filter(record => record.state === 'ready');
  const visibleBindings: SlotBindings = {};
  for (const { slot, occupant } of selected) (visibleBindings[slot.slot] ??= []).push(occupant);
  const unloaded = Object.entries(bindings).flatMap(([slot, values]) => values.filter((value) => value.pinned && value.use !== 'inactive'
    && !isReadyFeedAsset(feed.find((asset) => asset.edgeId === value.edgeId))).map((occupant) => ({ slot, occupant })));
  // 已就绪、却不会被本次生成消费的上游媒体：必须在卡槽外显式呈现，绝不静默消失。
  // 待命池（用户主动排除）与未就绪来源不属于此列。
  const consumedEdges = new Set<string>();
  for (const values of Object.values(bindings)) for (const occupant of values) consumedEdges.add(occupant.edgeId);
  const standbyEdges = new Set(standby);
  const unused: UnusedSupply[] = feed
    .filter((asset) => UNUSED_MEDIA_TYPES.has(asset.type) && asset.availability === 'ready'
      && !consumedEdges.has(asset.edgeId) && !standbyEdges.has(asset.edgeId))
    .map((asset) => {
      const accepting = layout.slots.filter((spec) => acceptsFeedAsset(spec, asset));
      const reasonCode: UnusedSupply['reasonCode'] = !isReadyFeedAsset(asset) ? 'input_unavailable'
        : accepting.length === 0 ? 'no_matching_slot'
        : accepting.every((spec) => (bindings[spec.slot]?.length ?? 0) >= (spec.max ?? Infinity)) ? 'slot_capacity'
        : 'not_bound';
      return {
        occupant: { sourceNodeId: asset.sourceNodeId, edgeId: asset.edgeId, outputId: asset.outputId, pinned: false, ordinal: asset.ordinal },
        asset: { ...asset },
        reasonCode,
      };
    });
  const currentInvalid = inputBindingVersion === 1 ? records.filter(record => record.state === 'pending' || record.state === 'invalid')
    .map(record => ({ slot: record.slot.slot, occupant: record.occupant, reasonCode: record.reasonCode })) : [];
  const requiredUnavailable = inputBindingVersion === 1 ? currentInvalid[0] : [...unloaded, ...conflicts].find(({ slot }) => {
    const spec = layout.slots.find((item) => item.slot === slot);
    return spec && (visibleBindings[slot]?.length ?? 0) < spec.min;
  });
  return { bindings, visibleBindings, conflicts, records, selected, unloaded, unused, requiredUnavailable };
}
