// Generated from @omnimux/generation-capabilities; source-sha256: ee1051caee2b8b3e40857193cd2a06942daf73468959974fb715caa97814bc02

// src/units.js
var BYTES_PER_MB = 1024 * 1024;
function mbToBytes(maxSizeMb) {
  if (typeof maxSizeMb !== "number" || !Number.isFinite(maxSizeMb) || maxSizeMb < 0) {
    throw new TypeError(`maxSizeMb must be a non-negative finite number, got ${maxSizeMb}`);
  }
  return maxSizeMb * BYTES_PER_MB;
}
function isWithinSizeLimit(sizeBytes, maxSizeMb, exclusive = false) {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new TypeError(`sizeBytes must be a non-negative finite number, got ${sizeBytes}`);
  }
  return exclusive ? sizeBytes < mbToBytes(maxSizeMb) : sizeBytes <= mbToBytes(maxSizeMb);
}
function isWithinDurationLimit(durationSec, maxDurationSec) {
  if (typeof durationSec !== "number" || !Number.isFinite(durationSec) || durationSec < 0) {
    throw new TypeError(`durationSec must be a non-negative finite number, got ${durationSec}`);
  }
  if (typeof maxDurationSec !== "number" || !Number.isFinite(maxDurationSec) || maxDurationSec < 0) {
    throw new TypeError(`maxDurationSec must be a non-negative finite number, got ${maxDurationSec}`);
  }
  return durationSec <= maxDurationSec;
}

// src/codes.js
var GUARD_CODES = Object.freeze({
  // Catalog / index
  CATALOG_UNAVAILABLE: "catalog_unavailable",
  CATALOG_MALFORMED: "catalog_malformed",
  CONTRACT_MISSING: "contract_missing",
  // Model / operation admission
  UNKNOWN_MODEL: "unknown_model",
  MODEL_NOT_ADMITTED: "model_not_admitted",
  DISPOSITION_FORBIDDEN: "disposition_forbidden",
  OPERATION_REQUIRED: "operation_required",
  UNKNOWN_OPERATION: "unknown_operation",
  OPERATION_NOT_ON_MODEL: "operation_not_on_model",
  NOT_LISTED: "not_listed",
  RESEARCH_NOT_VERIFIED: "research_not_verified",
  IMPLEMENTATION_UNAVAILABLE: "implementation_unavailable",
  EXECUTION_UNAVAILABLE: "execution_unavailable",
  PROFILE_MISSING: "profile_missing",
  PROFILE_INCOMPATIBLE: "profile_incompatible",
  SEAM_MISMATCH: "seam_mismatch",
  // Slots / assets
  PROMPT_REQUIRED: "prompt_required",
  MIN_UNSATISFIED: "min_unsatisfied",
  SLOT_CAPACITY: "slot_capacity",
  ROLE_CONFLICT: "role_conflict",
  MIME_UNSUPPORTED: "mime_unsupported",
  SIZE_EXCEEDED: "size_exceeded",
  DURATION_EXCEEDED: "duration_exceeded",
  METADATA_UNKNOWN: "metadata_unknown",
  OPERATION_INCOMPATIBLE: "operation_incompatible",
  ASSET_TYPE_MISMATCH: "asset_type_mismatch",
  PARAMETER_UNSUPPORTED: "parameter_unsupported",
  // Vendor mapping
  VENDOR_FIELD_FORBIDDEN: "vendor_field_forbidden",
  LOGICAL_FIELD_FORBIDDEN: "logical_field_forbidden",
  MAPPER_INCOMPLETE: "mapper_incomplete",
  // Output
  INVALID_RESPONSE: "invalid_response",
  OUTPUT_TYPE_MISMATCH: "output_type_mismatch",
  OUTPUT_MIME_MISMATCH: "output_mime_mismatch"
});

// src/assets.js
var SLOT_ALIASES = Object.freeze({
  reference_image: Object.freeze(["reference_images"]),
  reference_images: Object.freeze(["reference_image"]),
  first_frame: Object.freeze(["first_frame_image"]),
  first_frame_image: Object.freeze(["first_frame"]),
  last_frame: Object.freeze(["last_frame_image"]),
  last_frame_image: Object.freeze(["last_frame"])
});
function getSlotAliases(slotName) {
  if (!slotName || typeof slotName !== "string") return [];
  return SLOT_ALIASES[
    /** @type {keyof typeof SLOT_ALIASES} */
    slotName
  ] || [];
}
function rejection(code, message, extra) {
  return { code, message, ...extra };
}
function validateAssetAgainstSlot(asset, slot) {
  if (slot.type && asset.type && slot.type !== asset.type) {
    return {
      ok: false,
      rejection: rejection(GUARD_CODES.ASSET_TYPE_MISMATCH, `asset type ${asset.type} does not match slot ${slot.slot} type ${slot.type}`, {
        slot: slot.slot,
        assetType: asset.type,
        slotType: slot.type
      })
    };
  }
  const isTargetSlot = asset.targetSlot === slot.slot || getSlotAliases(asset.targetSlot).includes(slot.slot);
  if (slot.role && asset.role && slot.role !== asset.role && !isTargetSlot) {
    return {
      ok: false,
      rejection: rejection(GUARD_CODES.ROLE_CONFLICT, `asset role ${asset.role} does not match slot role ${slot.role}`, {
        slot: slot.slot,
        role: asset.role
      })
    };
  }
  const allowed = Array.isArray(slot.allowedMimes) ? slot.allowedMimes : null;
  if (allowed && allowed.length > 0 && asset.mime) {
    const normalized = asset.mime.toLowerCase();
    const ok = allowed.some((m) => String(m).toLowerCase() === normalized);
    if (!ok) {
      return {
        ok: false,
        rejection: rejection(GUARD_CODES.MIME_UNSUPPORTED, `MIME ${asset.mime} not allowed for slot ${slot.slot}`, {
          slot: slot.slot,
          mime: asset.mime,
          allowedMimes: [...allowed]
        })
      };
    }
  }
  if (typeof slot.maxSizeMb === "number" && Number.isFinite(slot.maxSizeMb)) {
    if (asset.sizeBytes === void 0 || asset.sizeBytes === null) {
      return {
        ok: false,
        rejection: rejection(GUARD_CODES.METADATA_UNKNOWN, `sizeBytes unknown for slot ${slot.slot} which declares maxSizeMb=${slot.maxSizeMb}`, {
          slot: slot.slot,
          field: "sizeBytes",
          maxSizeMb: slot.maxSizeMb
        })
      };
    }
    if (!isWithinSizeLimit(asset.sizeBytes, slot.maxSizeMb, slot.maxSizeExclusive === true)) {
      return {
        ok: false,
        rejection: rejection(GUARD_CODES.SIZE_EXCEEDED, `sizeBytes ${asset.sizeBytes} exceeds slot ${slot.slot} maxSizeMb ${slot.maxSizeMb}`, {
          slot: slot.slot,
          sizeBytes: asset.sizeBytes,
          maxSizeMb: slot.maxSizeMb,
          maxSizeExclusive: slot.maxSizeExclusive === true
        })
      };
    }
  }
  if (typeof slot.maxDurationSec === "number" && Number.isFinite(slot.maxDurationSec)) {
    if (asset.durationSec === void 0 || asset.durationSec === null) {
      return {
        ok: false,
        rejection: rejection(GUARD_CODES.METADATA_UNKNOWN, `durationSec unknown for slot ${slot.slot} which declares maxDurationSec=${slot.maxDurationSec}`, {
          slot: slot.slot,
          field: "durationSec",
          maxDurationSec: slot.maxDurationSec
        })
      };
    }
    if (!isWithinDurationLimit(asset.durationSec, slot.maxDurationSec)) {
      return {
        ok: false,
        rejection: rejection(GUARD_CODES.DURATION_EXCEEDED, `durationSec ${asset.durationSec} exceeds slot ${slot.slot} max ${slot.maxDurationSec}`, {
          slot: slot.slot,
          durationSec: asset.durationSec,
          maxDurationSec: slot.maxDurationSec
        })
      };
    }
  }
  if (typeof slot.minDurationSec === "number" && Number.isFinite(slot.minDurationSec)) {
    if (asset.durationSec === void 0 || asset.durationSec === null) {
      return {
        ok: false,
        rejection: rejection(GUARD_CODES.METADATA_UNKNOWN, `durationSec unknown for slot ${slot.slot} which declares minDurationSec=${slot.minDurationSec}`, {
          slot: slot.slot,
          field: "durationSec",
          minDurationSec: slot.minDurationSec
        })
      };
    }
    if (asset.durationSec < slot.minDurationSec) {
      return {
        ok: false,
        rejection: rejection(GUARD_CODES.DURATION_EXCEEDED, `durationSec ${asset.durationSec} is below slot ${slot.slot} minimum ${slot.minDurationSec}`, {
          slot: slot.slot,
          durationSec: asset.durationSec,
          minDurationSec: slot.minDurationSec
        })
      };
    }
  }
  return { ok: true };
}
export {
  BYTES_PER_MB,
  GUARD_CODES,
  SLOT_ALIASES,
  getSlotAliases,
  isWithinDurationLimit,
  isWithinSizeLimit,
  mbToBytes,
  validateAssetAgainstSlot
};
