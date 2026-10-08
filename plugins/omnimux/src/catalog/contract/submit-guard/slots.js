import { SLOT_ALIASES, getSlotAliases, validateAssetAgainstSlot, solveAssetAssignment } from '../../../../lib/generation-core.js'
export { SLOT_ALIASES, getSlotAliases, validateAssetAgainstSlot }

/** Restore the legacy DTO and declaration-order Map without a second validator. */
function facade(op, result) {
  const slots = Array.isArray(op?.inputs) ? op.inputs : []
  const bySlot = new Map(slots.filter(slot => slot && typeof slot.slot === 'string').map(slot => [slot.slot, [...result.buckets[slots.indexOf(slot)]]]))
  return {
    ok: result.status === 'ready',
    bindings: result.bindings.map(binding => ({
      slot: binding.slot,
      ...(binding.role ? { role: binding.role } : {}),
      type: slots[binding.slotIndex].type,
      pathOrUrl: binding.asset.pathOrUrl,
      asset: binding.asset,
    })),
    bySlot,
    rejections: result.rejections,
  }
}

/**
 * @param {object} op
 * @param {import('./normalize.js').LogicalAsset[]} assets
 * @param {{ prompt?: string, duration?: number }} [ctx]
 */
export function assignAndValidateSlots(op, assets, ctx = {}) {
  return facade(op, solveAssetAssignment(op, assets, ctx, { strategy: 'legacy', mode: 'full' }))
}

/**
 * @param {object} op
 * @param {import('./normalize.js').LogicalAsset[]} assets
 * @param {{ prompt?: string, duration?: number, requireMins?: boolean }} [ctx]
 */
export function operationAcceptsAssets(op, assets, ctx = {}) {
  return facade(op, solveAssetAssignment(op, assets, ctx, { strategy: 'legacy', mode: ctx.requireMins ? 'full' : 'accept' }))
}
