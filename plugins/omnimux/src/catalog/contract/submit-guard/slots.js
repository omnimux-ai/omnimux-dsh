/**
 * Slot assignment + validation against a contract operation's inputs[].
 * Boundary: size/duration equality with max is allowed; over max rejects.
 * Missing size/duration when the slot declares a max → metadata_unknown.
 */

import { isWithinDurationLimit, isWithinSizeLimit } from '../units.js'
import { GUARD_CODES } from './codes.js'

export const SLOT_ALIASES = Object.freeze({
  reference_image: Object.freeze(['reference_images']),
  reference_images: Object.freeze(['reference_image']),
  first_frame: Object.freeze(['first_frame_image']),
  first_frame_image: Object.freeze(['first_frame']),
  last_frame: Object.freeze(['last_frame_image']),
  last_frame_image: Object.freeze(['last_frame']),
})

/**
 * Returns candidate slot aliases for singular/plural and frame naming compatibility.
 * @param {string} [slotName]
 * @returns {readonly string[]}
 */
export function getSlotAliases(slotName) {
  if (!slotName || typeof slotName !== 'string') return []
  return SLOT_ALIASES[slotName] || []
}

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [extra]
 */
function rejection(code, message, extra = {}) {
  return { code, message, ...extra }
}

/**
 * @param {import('./normalize.js').LogicalAsset} asset
 * @param {object} slot
 * @returns {{ ok: true } | { ok: false, rejection: object }}
 */
export function validateAssetAgainstSlot(asset, slot) {
  if (slot.type && asset.type && slot.type !== asset.type) {
    return {
      ok: false,
      rejection: rejection(GUARD_CODES.ASSET_TYPE_MISMATCH, `asset type ${asset.type} does not match slot ${slot.slot} type ${slot.type}`, {
        slot: slot.slot,
        assetType: asset.type,
        slotType: slot.type,
      }),
    }
  }

  const isTargetSlot = asset.targetSlot === slot.slot || getSlotAliases(asset.targetSlot).includes(slot.slot)
  if (slot.role && asset.role && slot.role !== asset.role && !isTargetSlot) {
    // Role mismatch only when caller pinned a role that is not this slot's role
    // and did not explicitly target this slot (or its alias).
    return {
      ok: false,
      rejection: rejection(GUARD_CODES.ROLE_CONFLICT, `asset role ${asset.role} does not match slot role ${slot.role}`, {
        slot: slot.slot,
        role: asset.role,
      }),
    }
  }

  const allowed = Array.isArray(slot.allowedMimes) ? slot.allowedMimes : null
  if (allowed && allowed.length > 0 && asset.mime) {
    // Known MIME must be on the allow-list. Unknown MIME is not metadata_unknown
    // (that code is reserved for size/duration ceilings); callers that need
    // strict MIME may pass mime explicitly.
    const normalized = asset.mime.toLowerCase()
    const ok = allowed.some((m) => String(m).toLowerCase() === normalized)
    if (!ok) {
      return {
        ok: false,
        rejection: rejection(GUARD_CODES.MIME_UNSUPPORTED, `MIME ${asset.mime} not allowed for slot ${slot.slot}`, {
          slot: slot.slot,
          mime: asset.mime,
          allowedMimes: [...allowed],
        }),
      }
    }
  }

  if (typeof slot.maxSizeMb === 'number' && Number.isFinite(slot.maxSizeMb)) {
    if (asset.sizeBytes === undefined || asset.sizeBytes === null) {
      return {
        ok: false,
        rejection: rejection(GUARD_CODES.METADATA_UNKNOWN, `sizeBytes unknown for slot ${slot.slot} which declares maxSizeMb=${slot.maxSizeMb}`, {
          slot: slot.slot,
          field: 'sizeBytes',
          maxSizeMb: slot.maxSizeMb,
        }),
      }
    }
    if (!isWithinSizeLimit(asset.sizeBytes, slot.maxSizeMb, slot.maxSizeExclusive === true)) {
      return {
        ok: false,
        rejection: rejection(GUARD_CODES.SIZE_EXCEEDED, `sizeBytes ${asset.sizeBytes} exceeds slot ${slot.slot} maxSizeMb ${slot.maxSizeMb}`, {
          slot: slot.slot,
          sizeBytes: asset.sizeBytes,
          maxSizeMb: slot.maxSizeMb,
          maxSizeExclusive: slot.maxSizeExclusive === true,
        }),
      }
    }
  }

  if (typeof slot.maxDurationSec === 'number' && Number.isFinite(slot.maxDurationSec)) {
    if (asset.durationSec === undefined || asset.durationSec === null) {
      return {
        ok: false,
        rejection: rejection(GUARD_CODES.METADATA_UNKNOWN, `durationSec unknown for slot ${slot.slot} which declares maxDurationSec=${slot.maxDurationSec}`, {
          slot: slot.slot,
          field: 'durationSec',
          maxDurationSec: slot.maxDurationSec,
        }),
      }
    }
    if (!isWithinDurationLimit(asset.durationSec, slot.maxDurationSec)) {
      return {
        ok: false,
        rejection: rejection(GUARD_CODES.DURATION_EXCEEDED, `durationSec ${asset.durationSec} exceeds slot ${slot.slot} max ${slot.maxDurationSec}`, {
          slot: slot.slot,
          durationSec: asset.durationSec,
          maxDurationSec: slot.maxDurationSec,
        }),
      }
    }
  }

  if (typeof slot.minDurationSec === 'number' && Number.isFinite(slot.minDurationSec)) {
    if (asset.durationSec === undefined || asset.durationSec === null) {
      return {
        ok: false,
        rejection: rejection(GUARD_CODES.METADATA_UNKNOWN, `durationSec unknown for slot ${slot.slot} which declares minDurationSec=${slot.minDurationSec}`, {
          slot: slot.slot,
          field: 'durationSec',
          minDurationSec: slot.minDurationSec,
        }),
      }
    }
    if (asset.durationSec < slot.minDurationSec) {
      return {
        ok: false,
        rejection: rejection(GUARD_CODES.DURATION_EXCEEDED, `durationSec ${asset.durationSec} is below slot ${slot.slot} minimum ${slot.minDurationSec}`, {
          slot: slot.slot,
          durationSec: asset.durationSec,
          minDurationSec: slot.minDurationSec,
        }),
      }
    }
  }

  return { ok: true }
}

/**
 * Greedy assign assets → slots. Does not fold everything into reference.
 * @param {object} op
 * @param {import('./normalize.js').LogicalAsset[]} assets
 * @param {{ prompt?: string, duration?: number }} [ctx]
 * @returns {{
 *   ok: boolean,
 *   bindings: Array<{ slot: string, role?: string, type: string, pathOrUrl: string, asset: import('./normalize.js').LogicalAsset }>,
 *   bySlot: Map<string, import('./normalize.js').LogicalAsset[]>,
 *   rejections: object[],
 * }}
 */
export function assignAndValidateSlots(op, assets, ctx = {}) {
  const slots = Array.isArray(op?.inputs) ? op.inputs : []
  /** @type {Map<object, import('./normalize.js').LogicalAsset[]>} */
  const assigned = new Map()
  for (const slot of slots) assigned.set(slot, [])

  /** @type {object[]} */
  const rejections = []
  /** @type {Array<{ slot: string, role?: string, type: string, pathOrUrl: string, asset: import('./normalize.js').LogicalAsset }>} */
  const bindings = []

  const mediaAssets = (assets ?? []).filter((a) => a && a.type && a.type !== 'text')

  /**
   * @param {import('./normalize.js').LogicalAsset} asset
   * @param {object[]} candidates
   * @returns {boolean}
   */
  function tryAssign(asset, candidates) {
    /** @type {object[]} */
    const attempts = []
    for (const slot of candidates) {
      const bucket = assigned.get(slot) ?? []
      const max = Number.isFinite(slot.max) ? slot.max : Number.POSITIVE_INFINITY
      if (bucket.length >= max) {
        attempts.push(rejection(GUARD_CODES.SLOT_CAPACITY, `slot ${slot.slot} is full (max ${slot.max})`, { slot: slot.slot, max: slot.max }))
        continue
      }
      const check = validateAssetAgainstSlot(asset, slot)
      if (!check.ok) {
        attempts.push(check.rejection)
        continue
      }
      bucket.push(asset)
      assigned.set(slot, bucket)
      bindings.push({
        slot: slot.slot,
        ...(slot.role ? { role: slot.role } : {}),
        type: slot.type,
        pathOrUrl: asset.pathOrUrl,
        asset,
      })
      return true
    }
    if (attempts.length > 0) {
      // Prefer most specific (non-capacity) rejection
      const ranked = [...attempts].sort((a, b) => {
        const order = (c) =>
          c === GUARD_CODES.MIME_UNSUPPORTED ||
          c === GUARD_CODES.SIZE_EXCEEDED ||
          c === GUARD_CODES.DURATION_EXCEEDED ||
          c === GUARD_CODES.METADATA_UNKNOWN ||
          c === GUARD_CODES.ROLE_CONFLICT
            ? 0
            : 1
        return order(a.code) - order(b.code)
      })
      rejections.push(ranked[0])
    } else {
      rejections.push(
        rejection(GUARD_CODES.OPERATION_INCOMPATIBLE, `no slot can absorb ${asset.type} asset`, {
          assetType: asset.type,
          role: asset.role,
        }),
      )
    }
    return false
  }

  for (const asset of mediaAssets) {
    if (asset.targetSlot) {
      let explicit = slots.filter((s) => s.slot === asset.targetSlot)
      if (explicit.length === 0) {
        const aliases = getSlotAliases(asset.targetSlot)
        if (aliases.length > 0) {
          explicit = slots.filter((s) => aliases.includes(s.slot))
        }
      }
      if (explicit.length === 0) {
        rejections.push(
          rejection(GUARD_CODES.ROLE_CONFLICT, `explicit targetSlot ${asset.targetSlot} not found`, {
            slot: asset.targetSlot,
          }),
        )
        continue
      }
      tryAssign(asset, explicit)
      continue
    }

    if (asset.role) {
      const roleSlots = slots.filter((s) => s.role === asset.role && (!s.type || s.type === asset.type))
      if (roleSlots.length === 0) {
        // Fallback: type-matched non-prompt slots (legacy image→first_frame on ops that use slot name first_frame)
        const typed = slots.filter((s) => s.type === asset.type && s.role !== 'prompt')
        if (typed.length === 0) {
          rejections.push(
            rejection(GUARD_CODES.ROLE_CONFLICT, `no slot with role ${asset.role} for type ${asset.type}`, {
              role: asset.role,
              type: asset.type,
            }),
          )
          continue
        }
        tryAssign(asset, typed)
        continue
      }
      tryAssign(asset, roleSlots)
      continue
    }

    const typed = slots.filter((s) => s.type === asset.type)
    if (typed.length === 0) {
      rejections.push(
        rejection(GUARD_CODES.OPERATION_INCOMPATIBLE, `operation has no slot for type ${asset.type}`, {
          type: asset.type,
        }),
      )
      continue
    }
    // Prefer slots still under min, then reference, then rest.
    const underMin = typed.filter((s) => (assigned.get(s)?.length ?? 0) < (s.min ?? 0))
    const refs = typed.filter((s) => s.role === 'reference' && !underMin.includes(s))
    const rest = typed.filter((s) => !underMin.includes(s) && !refs.includes(s))
    tryAssign(asset, [...underMin, ...refs, ...rest])
  }

  /** @type {Map<string, import('./normalize.js').LogicalAsset[]>} */
  const bySlot = new Map()
  for (const slot of slots) {
    bySlot.set(slot.slot, [...(assigned.get(slot) ?? [])])
  }

  // min / prompt checks (ready-to-submit)
  if (rejections.length === 0) {
    for (const slot of slots) {
      if (slot.role === 'prompt' || slot.type === 'text') continue
      const count = assigned.get(slot)?.length ?? 0
      const min = Number.isFinite(slot.min) ? slot.min : 0
      if (count < min) {
        rejections.push(
          rejection(GUARD_CODES.MIN_UNSATISFIED, `slot ${slot.slot} needs min ${min}, got ${count}`, {
            slot: slot.slot,
            min,
            current: count,
          }),
        )
      }

      const bucket = assigned.get(slot) ?? []
      const hasTotalDurationConstraint =
        typeof slot.totalMinDurationSec === 'number'
        || typeof slot.totalMaxDurationSec === 'number'
      if (bucket.length > 0 && hasTotalDurationConstraint) {
        if (bucket.some((asset) => typeof asset.durationSec !== 'number' || !Number.isFinite(asset.durationSec))) {
          rejections.push(rejection(GUARD_CODES.METADATA_UNKNOWN, `durationSec unknown for slot ${slot.slot} total-duration validation`, {
            slot: slot.slot,
            field: 'durationSec',
          }))
          continue
        }
        const total = bucket.reduce((sum, asset) => sum + asset.durationSec, 0)
        if (
          typeof slot.totalMinDurationSec === 'number'
          && (slot.totalMinExclusive ? total <= slot.totalMinDurationSec : total < slot.totalMinDurationSec)
        ) {
          rejections.push(rejection(GUARD_CODES.DURATION_EXCEEDED, `slot ${slot.slot} total duration ${total}s is below the documented minimum`, {
            slot: slot.slot,
            totalDurationSec: total,
            totalMinDurationSec: slot.totalMinDurationSec,
            exclusive: slot.totalMinExclusive === true,
          }))
        }
        if (
          typeof slot.totalMaxDurationSec === 'number'
          && (slot.totalMaxExclusive ? total >= slot.totalMaxDurationSec : total > slot.totalMaxDurationSec)
        ) {
          rejections.push(rejection(GUARD_CODES.DURATION_EXCEEDED, `slot ${slot.slot} total duration ${total}s exceeds the documented maximum`, {
            slot: slot.slot,
            totalDurationSec: total,
            totalMaxDurationSec: slot.totalMaxDurationSec,
            exclusive: slot.totalMaxExclusive === true,
          }))
        }
        if (
          typeof slot.combinedOutputMaxDurationSec === 'number'
          && typeof ctx.duration === 'number'
          && Number.isFinite(ctx.duration)
          && ctx.duration >= 0
          && total + ctx.duration > slot.combinedOutputMaxDurationSec
        ) {
          rejections.push(rejection(
            GUARD_CODES.DURATION_EXCEEDED,
            `slot ${slot.slot} input duration ${total}s plus output duration ${ctx.duration}s exceeds the documented maximum`,
            {
              slot: slot.slot,
              totalDurationSec: total,
              outputDurationSec: ctx.duration,
              combinedOutputMaxDurationSec: slot.combinedOutputMaxDurationSec,
            },
          ))
        }
      }
    }

    for (const group of op.inputGroups ?? []) {
      const count = (group.slots ?? []).reduce(
        (sum, slotName) => sum + (bySlot.get(slotName)?.length ?? 0),
        0,
      )
      if (count < group.min) {
        rejections.push(rejection(GUARD_CODES.MIN_UNSATISFIED, group.hint || `input group needs min ${group.min}, got ${count}`, {
          slots: [...(group.slots ?? [])],
          min: group.min,
          current: count,
        }))
      }
    }

    const promptSlot = slots.find((s) => s.role === 'prompt' || (s.type === 'text' && s.source === 'node_field'))
    const promptText = typeof ctx.prompt === 'string' ? ctx.prompt.trim() : ''
    if (promptSlot) {
      const min = Number.isFinite(promptSlot.min) ? promptSlot.min : 0
      if (min >= 1 && !promptText) {
        rejections.push(rejection(GUARD_CODES.PROMPT_REQUIRED, 'prompt is required for this operation', { slot: promptSlot.slot }))
      }
    }
  }

  return {
    ok: rejections.length === 0,
    bindings,
    bySlot,
    rejections,
  }
}

/**
 * Soft accept check used for operation inference (mins may still fail later).
 * Assets must all assign without hard type/mime/role conflicts; empty optional OK.
 * @param {object} op
 * @param {import('./normalize.js').LogicalAsset[]} assets
 * @param {{ prompt?: string, requireMins?: boolean }} [ctx]
 */
export function operationAcceptsAssets(op, assets, ctx = {}) {
  const result = assignAndValidateSlots(op, assets, ctx)
  if (!ctx.requireMins) {
    // For inference, ignore pure min/prompt pending — only hard absorption failures.
    const hard = result.rejections.filter(
      (r) =>
        r.code !== GUARD_CODES.MIN_UNSATISFIED &&
        r.code !== GUARD_CODES.PROMPT_REQUIRED,
    )
    return { ok: hard.length === 0, rejections: hard, bindings: result.bindings, bySlot: result.bySlot }
  }
  return result
}
