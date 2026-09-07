import type { FeedAsset, FillResult, SlotBindings, SlotLayout, SlotOccupant, SlotSpec } from './types.ts';

export function acceptsFeedAsset(slot: SlotSpec, asset: FeedAsset): boolean {
  return slot.type === asset.type && (!asset.mimeType || !slot.allowedMimes?.length
    || slot.allowedMimes.includes(asset.mimeType));
}

/** Preserve explicit choices first; automatically use each supply edge at most once. */
export function autoFillSlots(feedAssets: FeedAsset[], layout: SlotLayout, explicit: SlotBindings = {}): FillResult {
  const feed = [...feedAssets].sort((a, b) => a.ordinal - b.ordinal);
  const byEdge = new Map(feed.map((asset) => [asset.edgeId, asset]));
  const slots = layout.preset === 'none' ? [] : layout.slots;
  const bindings: SlotBindings = Object.fromEntries(slots.map((slot) => [slot.slot, []]));
  const conflicts: FillResult['conflicts'] = [];
  const reserved = new Set<string>();
  const used = new Set<string>();
  const usedInputs = new Set<string>();
  const usedRoles = new Set<string>();
  const identity = (asset: FeedAsset) => JSON.stringify([asset.sourceNodeId, asset.outputId ?? '']);
  const roleIdentity = (asset: FeedAsset, slot: SlotSpec) => JSON.stringify([identity(asset), slot.role]);
  // Two passes give pinned choices precedence even when they occur later in a strip.
  for (const pinned of [true, false]) {
    for (const [name, occupants] of Object.entries(explicit)) {
      const slot = slots.find((candidate) => candidate.slot === name);
      for (const occupant of occupants) {
        if (occupant.pinned !== pinned) continue;
        const asset = byEdge.get(occupant.edgeId);
        if (!asset || asset.sourceNodeId !== occupant.sourceNodeId) continue;
        const next: SlotOccupant = { ...occupant, outputId: asset.outputId };
        const reason = !slot ? 'slot_removed' : slot.type !== asset.type ? 'type_mismatch'
          : !acceptsFeedAsset(slot, asset) ? 'role_illegal' : undefined;
        if (!reason && slot && (usedRoles.has(roleIdentity(asset, slot)) || (!pinned && used.has(asset.edgeId)))) continue;
        const full = slot && bindings[name]!.length >= (slot.max ?? Infinity);
        if (reason || full) {
          if (pinned) {
            conflicts.push({ slot: name, occupant: next, reason: reason ?? 'role_illegal' });
            reserved.add(asset.edgeId);
          }
          continue;
        }
        bindings[name]!.push(next);
        used.add(asset.edgeId);
        usedInputs.add(identity(asset));
        usedRoles.add(roleIdentity(asset, slot!));
      }
    }
  }
  for (const slot of slots) {
    for (const asset of feed) {
      if (bindings[slot.slot]!.length >= (slot.max ?? Infinity)) break;
      if (used.has(asset.edgeId) || usedInputs.has(identity(asset)) || reserved.has(asset.edgeId) || !acceptsFeedAsset(slot, asset)) continue;
      // Role-specific assets must be chosen explicitly, not inferred as masks/control signals.
      if (slot.role === 'mask' || slot.role === 'controlnet') continue;
      bindings[slot.slot]!.push({
        sourceNodeId: asset.sourceNodeId, edgeId: asset.edgeId, outputId: asset.outputId, pinned: false,
      });
      used.add(asset.edgeId);
      usedInputs.add(identity(asset));
      usedRoles.add(roleIdentity(asset, slot));
    }
  }
  return { bindings, conflicts, unusedFeed: feed.filter((asset) => !used.has(asset.edgeId)).map((asset) => ({ ...asset })) };
}

/** One edge may occupy two named roles only through an explicit choice. */
export function swapNamedSlots(bindings: SlotBindings, first: string, last: string): SlotBindings {
  const next = Object.fromEntries(Object.entries(bindings).map(([key, values]) => [key, values.map((value) => ({ ...value }))]));
  if (first === last) return next;
  next[first] = (bindings[last] ?? []).map((value) => ({ ...value, pinned: true }));
  next[last] = (bindings[first] ?? []).map((value) => ({ ...value, pinned: true }));
  return next;
}
