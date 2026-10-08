import { isWithinDurationLimit, isWithinSizeLimit } from './units.js'
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
  return SLOT_ALIASES[/** @type {keyof typeof SLOT_ALIASES} */ (slotName)] || []
}

/**
 * @template {import('../types/index.js').AssetRejection['code']} C
 * @template {object} E
 * @param {C} code
 * @param {string} message
 * @param {E} extra
 * @returns {{ code: C, message: string } & E}
 */
function rejection(code, message, extra) {
  return { code, message, ...extra }
}

/**
 * @param {import('../types/index.js').GenerationAsset} asset
 * @param {import('../types/index.js').GenerationSlot} slot
 * @returns {import('../types/index.js').AssetSlotResult}
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
