// Generated from @omnimux/generation-capabilities; source-sha256: 5586e322120980fab414e1bdd68d585fedf1961c45d62ba15dcdd58238f6b63e

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
function solveAssetAssignment(operation, assets, context = {}, policy = {}) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) throw new TypeError("invalid assignment policy");
  const strategy = policy.strategy === void 0 ? "legacy" : policy.strategy, mode = policy.mode === void 0 ? "full" : policy.mode, maxStates = policy.maxStates === void 0 ? 1e5 : policy.maxStates;
  if (!["legacy", "strict"].includes(strategy) || !["full", "accept"].includes(mode) || !Number.isSafeInteger(maxStates) || maxStates < 1) throw new TypeError("invalid assignment policy");
  const strict = strategy === "strict";
  const slots = Array.isArray(operation?.inputs) ? operation.inputs : [];
  const groups = operation?.inputGroups ?? [];
  let visitedStates = 0, exhausted = false, seenCompletionUnproven = false;
  let failures = [];
  let ready;
  let savedPending;
  const buckets = slots.map(() => []);
  const counts = slots.map(() => 0);
  const assigned = /* @__PURE__ */ new Map();
  const maxima = slots.map((s) => s?.max === void 0 || s?.max === null ? Infinity : s.max);
  const minima = slots.map((s) => s?.min === void 0 ? 0 : s.min);
  const media = (assets ?? []).flatMap((asset, assetIndex) => asset && asset.type && asset.type !== "text" ? [{ asset, assetIndex }] : []);
  const slotIndices = slots.map((_, i) => i);
  const mediaSlots = slotIndices.filter((i) => slots[i]?.type !== "text" && slots[i]?.role !== "prompt");
  function failed(reasons, diagnostic) {
    const common = { bindings: [], buckets: slots.map(() => []), rejections: reasons, pending: (
      /** @type {readonly []} */
      []
    ), visitedStates, uncheckedConstraints: [] };
    return (
      /** @type {import('../types/index.js').AssignmentResult<A>} */
      diagnostic ? { ...common, status: "indeterminate", diagnostic } : { ...common, status: "rejected" }
    );
  }
  const incompatible = (message, extra = (
    /** @type {E} */
    {}
  )) => ({ code: GUARD_CODES.OPERATION_INCOMPATIBLE, message, ...extra });
  const malformed = (message, extra = {}) => failed([incompatible(message, { diagnostic: (
    /** @type {const} */
    "malformed_contract"
  ), ...extra })]);
  const countValid = (n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (!Array.isArray(operation?.inputs)) return malformed("operation inputs must be an array", { field: "inputs" });
  const names = /* @__PURE__ */ new Set();
  for (const i of slotIndices) {
    const s = slots[i];
    if (!s || typeof s.slot !== "string" || !s.slot.trim() || names.has(s.slot)) return malformed("slot names must be nonempty and unique", { slotIndex: i, field: "slot" });
    names.add(s.slot);
    if (!countValid(minima[i]) || maxima[i] !== Infinity && !countValid(maxima[i]) || s.max !== void 0 && s.max !== null && !countValid(s.max) || minima[i] > maxima[i]) return malformed(`invalid count range for slot ${s.slot}`, { slotIndex: i, slot: s.slot, field: "min" });
  }
  if (!Array.isArray(groups)) return malformed("inputGroups must be an array", { field: "inputGroups" });
  for (const g of groups) {
    if (!g || !Array.isArray(g.slots) || new Set(g.slots).size !== g.slots.length || g.slots.some((name) => !names.has(name)) || !countValid(g.min === void 0 ? 0 : g.min) || !g.slots.length && (g.min ?? 0) > 0) return malformed("invalid input group", { field: "inputGroups" });
    const capacity = mediaSlots.filter((i) => g.slots.includes(slots[i].slot)).reduce((n, i) => n + maxima[i], 0);
    if (capacity < (g.min ?? 0)) return failed([incompatible("input group minimum exceeds available capacity", { slots: [...g.slots], min: g.min, limit: capacity })]);
  }
  function enter() {
    if (visitedStates >= maxStates) {
      exhausted = true;
      return false;
    }
    visitedStates++;
    return true;
  }
  function remember(reasons) {
    if (!failures.length) failures = reasons;
  }
  function domainCheck(asset, assetIndex, slotIndex) {
    const s = slots[slotIndex];
    const pending = [];
    const rejected = [];
    const base = { assetIndex, slotIndex, slot: s.slot };
    let testedAsset = asset;
    let testedSlot = s;
    if (s.maxSizeMb === 0 && s.maxSizeExclusive === true) rejected.push({ code: GUARD_CODES.SIZE_EXCEEDED, message: `no nonnegative size can satisfy slot ${s.slot}`, ...base, maxSizeMb: 0, maxSizeExclusive: true });
    if (s.minDurationSec !== void 0 && s.maxDurationSec !== void 0 && s.minDurationSec > s.maxDurationSec) rejected.push({ code: GUARD_CODES.DURATION_EXCEEDED, message: `slot ${s.slot} duration bounds cannot be satisfied`, ...base, diagnostic: "duration_bounds_conflict" });
    if (strict) {
      for (
        const field of
        /** @type {const} */
        ["sizeBytes", "durationSec"]
      ) {
        const value = asset[field];
        if (value !== void 0 && value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) rejected.push(incompatible(`invalid ${field} for slot ${s.slot}`, { ...base, diagnostic: (
          /** @type {const} */
          "invalid_metadata"
        ), field }));
      }
      if (asset.role && s.role && asset.role !== s.role) rejected.push({ code: GUARD_CODES.ROLE_CONFLICT, message: `asset role ${asset.role} does not match slot role ${s.role}`, ...base, role: asset.role });
      if (!asset.role && !asset.targetSlot && (s.role && s.role !== "reference" || ["first_frame", "first_frame_image", "last_frame", "last_frame_image", "source", "source_image", "source_video", "mask", "audio_track"].includes(s.slot))) pending.push({ code: GUARD_CODES.OPERATION_INCOMPATIBLE, message: `explicit intent required for slot ${s.slot}`, ...base, diagnostic: "intent_required" });
      if (Array.isArray(s.allowedMimes) && s.allowedMimes.length) {
        if (!asset.mime || !asset.mime.trim()) pending.push({ code: GUARD_CODES.METADATA_UNKNOWN, message: `MIME unknown for slot ${s.slot}`, ...base, field: "mime" });
        else testedAsset = /** @type {A} */
        { ...asset, mime: asset.mime.trim().toLowerCase() };
        testedSlot = { ...s, allowedMimes: s.allowedMimes.map((m) => m.trim().toLowerCase()) };
      }
    }
    if (asset.sizeBytes === void 0 || asset.sizeBytes === null) {
      if (typeof s.maxSizeMb === "number" && Number.isFinite(s.maxSizeMb)) {
        const check = validateAssetAgainstSlot({ ...testedAsset, durationSec: void 0 }, { ...testedSlot, minDurationSec: void 0, maxDurationSec: void 0 });
        if (!check.ok && check.rejection.code === GUARD_CODES.METADATA_UNKNOWN) pending.push({ ...check.rejection, ...base });
        testedSlot = { ...testedSlot, maxSizeMb: void 0 };
      }
    }
    if (asset.durationSec === void 0 || asset.durationSec === null) {
      if (typeof s.maxDurationSec === "number" && Number.isFinite(s.maxDurationSec) || typeof s.minDurationSec === "number" && Number.isFinite(s.minDurationSec)) {
        const check = validateAssetAgainstSlot(testedAsset, { ...testedSlot, maxSizeMb: void 0 });
        if (!check.ok && check.rejection.code === GUARD_CODES.METADATA_UNKNOWN) pending.push({ ...check.rejection, ...base });
        testedSlot = { ...testedSlot, minDurationSec: void 0, maxDurationSec: void 0 };
      }
    }
    if (!rejected.length) {
      const check = validateAssetAgainstSlot(testedAsset, testedSlot);
      if (!check.ok) rejected.push({ ...check.rejection, ...base });
    }
    return { pending, rejected };
  }
  const entries = media.map((entry) => {
    const { asset, assetIndex } = entry;
    let candidates = mediaSlots;
    let rejected = [];
    if (asset.targetSlot) {
      candidates = mediaSlots.filter((i) => slots[i].slot === asset.targetSlot);
      if (!candidates.length) candidates = mediaSlots.filter((i) => getSlotAliases(asset.targetSlot).includes(slots[i].slot));
      if (!candidates.length) rejected.push({ code: GUARD_CODES.ROLE_CONFLICT, message: `explicit targetSlot ${asset.targetSlot} not found`, slot: asset.targetSlot, assetIndex });
    } else if (asset.role) {
      candidates = mediaSlots.filter((i) => slots[i].role === asset.role && (!slots[i].type || slots[i].type === asset.type));
      if (!candidates.length) candidates = strict ? [] : mediaSlots.filter((i) => slots[i].type === asset.type);
    } else candidates = mediaSlots.filter((i) => slots[i].type === asset.type);
    const domains = [];
    for (const i of candidates) {
      const check = domainCheck(asset, assetIndex, i);
      if (check.rejected.length) rejected.push(...check.rejected);
      else domains.push({ slotIndex: i, pending: check.pending });
    }
    if (!domains.length && !rejected.length) {
      if (asset.role) rejected.push({ code: GUARD_CODES.ROLE_CONFLICT, message: `no slot with role ${asset.role} for type ${asset.type}`, assetIndex, role: asset.role, type: (
        /** @type {string} */
        asset.type
      ) });
      else rejected.push(incompatible(`operation has no slot for type ${asset.type}`, { assetIndex, type: asset.type }));
    }
    return { ...entry, domains, rejected };
  });
  for (const e of entries) if (!e.domains.length) return failed(e.rejected);
  function validate(final) {
    const pending = final ? [...assigned.values()].flatMap((d) => d.pending) : [];
    const rejected = [];
    const uncheckedConstraints = [];
    let unproven = false;
    for (const i of mediaSlots) {
      const s = slots[i], bucket = buckets[i], current = counts[i];
      const base = { slotIndex: i, slot: s.slot };
      if (current > maxima[i]) rejected.push({ code: GUARD_CODES.SLOT_CAPACITY, message: `slot ${s.slot} is full (max ${s.max})`, ...base, max: s.max });
      if (final && mode === "full" && current < minima[i]) pending.push({ code: GUARD_CODES.MIN_UNSATISFIED, message: `slot ${s.slot} needs min ${minima[i]}, got ${current}`, ...base, min: minima[i], current });
      if (!bucket.length) continue;
      const timed = s.totalMinDurationSec !== void 0 || s.totalMaxDurationSec !== void 0 || s.combinedOutputMaxDurationSec !== void 0;
      if (!timed) continue;
      let low = 0, high = 0, unknown = false;
      for (const assetIndex of bucket) {
        const value = assets[assetIndex]?.durationSec;
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
          low += value;
          high += value;
        } else {
          unknown = true;
          low += s.minDurationSec ?? 0;
          high += s.maxDurationSec ?? Infinity;
          if (final) pending.push({ code: GUARD_CODES.METADATA_UNKNOWN, message: `durationSec unknown for slot ${s.slot} total-duration validation`, ...base, assetIndex, field: "durationSec" });
        }
      }
      const ceiling = s.totalMaxDurationSec;
      if (ceiling !== void 0 && (s.totalMaxExclusive ? low >= ceiling : low > ceiling)) rejected.push({ code: GUARD_CODES.DURATION_EXCEEDED, message: `slot ${s.slot} total duration ${low}s exceeds the documented maximum`, ...base, ...!unknown ? { totalDurationSec: low, totalMaxDurationSec: ceiling, exclusive: s.totalMaxExclusive === true } : { limit: ceiling } });
      const floor = s.totalMinDurationSec;
      if (mode === "full" && floor !== void 0 && ceiling !== void 0 && (floor > ceiling || floor === ceiling && (s.totalMinExclusive || s.totalMaxExclusive))) rejected.push({ code: GUARD_CODES.DURATION_EXCEEDED, message: `slot ${s.slot} duration bounds cannot be satisfied`, ...base, diagnostic: "duration_bounds_conflict" });
      const output = context.duration;
      const combinedCeiling = s.combinedOutputMaxDurationSec === void 0 ? Infinity : s.combinedOutputMaxDurationSec - (typeof output === "number" && Number.isFinite(output) && output >= 0 ? output : 0);
      if (mode === "full" && floor !== void 0 && (floor > combinedCeiling || s.totalMinExclusive && floor === combinedCeiling)) rejected.push({ code: GUARD_CODES.DURATION_EXCEEDED, message: `slot ${s.slot} combined duration bounds cannot be satisfied`, ...base, diagnostic: "duration_bounds_conflict" });
      if (low > combinedCeiling && !(typeof output === "number" && Number.isFinite(output) && output >= 0)) rejected.push({ code: GUARD_CODES.DURATION_EXCEEDED, message: `slot ${s.slot} input duration ${low}s exceeds the combined maximum`, ...base, limit: s.combinedOutputMaxDurationSec });
      if (final && mode === "full" && floor !== void 0 && (unknown || current < maxima[i])) {
        const remaining = maxima[i] - current;
        const perHigh = typeof s.maxDurationSec === "number" && Number.isFinite(s.maxDurationSec) ? s.maxDurationSec : Infinity;
        const futureHigh = remaining === 0 || perHigh === 0 ? 0 : remaining * perHigh;
        const reachableHigh = high + futureHigh;
        if (s.totalMinExclusive ? reachableHigh <= floor : reachableHigh < floor) rejected.push({ code: GUARD_CODES.DURATION_EXCEEDED, message: `slot ${s.slot} maximum reachable total duration ${reachableHigh}s is below the documented minimum`, ...base, min: floor, limit: reachableHigh });
      }
      if (final && mode === "full" && floor !== void 0 && (s.totalMinExclusive ? high <= floor : high < floor)) {
        if (current >= maxima[i] && !unknown) rejected.push({ code: GUARD_CODES.DURATION_EXCEEDED, message: `slot ${s.slot} total duration ${high}s is below the documented minimum`, ...base, totalDurationSec: high, totalMinDurationSec: floor, exclusive: s.totalMinExclusive === true });
        else unproven = true;
      } else if (final && mode === "full" && floor !== void 0 && unknown && (s.totalMinExclusive ? low <= floor : low < floor)) {
        if (ceiling !== void 0 && (floor > ceiling || floor === ceiling && (s.totalMinExclusive || s.totalMaxExclusive))) rejected.push(incompatible(`slot ${s.slot} duration bounds cannot be satisfied`, base));
      }
      if (s.combinedOutputMaxDurationSec !== void 0) {
        const output2 = context.duration;
        if (typeof output2 === "number" && Number.isFinite(output2) && output2 >= 0) {
          if (low + output2 > s.combinedOutputMaxDurationSec) rejected.push({ code: GUARD_CODES.DURATION_EXCEEDED, message: `slot ${s.slot} input duration ${low}s plus output duration ${output2}s exceeds the documented maximum`, ...base, ...!unknown ? { totalDurationSec: low, outputDurationSec: output2, combinedOutputMaxDurationSec: s.combinedOutputMaxDurationSec } : { limit: s.combinedOutputMaxDurationSec } });
        } else if (final) {
          if (strict && mode === "full") pending.push({ code: GUARD_CODES.METADATA_UNKNOWN, message: `output duration unknown for slot ${s.slot} combined-duration validation`, ...base, field: "outputDurationSec" });
          else uncheckedConstraints.push({ constraint: "combined_output_ceiling", slotIndex: i, field: "outputDurationSec" });
        }
      }
    }
    if (final && mode === "full") {
      for (const g of groups) {
        const current = mediaSlots.filter((i) => g.slots.includes(slots[i].slot)).reduce((n, i) => n + counts[i], 0);
        if (current < (g.min ?? 0)) pending.push({ code: GUARD_CODES.MIN_UNSATISFIED, message: g.hint || `input group needs min ${g.min}, got ${current}`, slots: [...g.slots], min: g.min ?? 0, current });
      }
      const prompt = slots.find((s) => s.role === "prompt" || s.type === "text" && s.source === "node_field");
      if (prompt && (prompt.min ?? 0) >= 1 && !(typeof context.prompt === "string" && context.prompt.trim())) pending.push({ code: GUARD_CODES.PROMPT_REQUIRED, message: "prompt is required for this operation", slot: prompt.slot, slotIndex: slots.indexOf(prompt) });
    }
    return { pending, rejected, uncheckedConstraints, unproven };
  }
  function place(e, d) {
    const i = d.slotIndex;
    assigned.set(e.assetIndex, d);
    buckets[i].push(e.assetIndex);
    counts[i]++;
  }
  function unplace(e) {
    const d = assigned.get(e.assetIndex);
    if (d) {
      const i = d.slotIndex;
      buckets[i].pop();
      counts[i]--;
      assigned.delete(e.assetIndex);
    }
  }
  function witness(pending, uncheckedConstraints) {
    const bindings = entries.map((e) => {
      const slotIndex = (
        /** @type {Domain} */
        assigned.get(e.assetIndex).slotIndex
      );
      const s = slots[slotIndex];
      return { assetIndex: e.assetIndex, slotIndex, slot: s.slot, ...s.role ? { role: s.role } : {}, asset: e.asset };
    });
    return (
      /** @type {import('../types/index.js').AssignmentResult<A>} */
      { status: pending.length ? "pending" : "ready", bindings, buckets: buckets.map((bucket) => [...bucket].sort((a, b) => a - b).map((i) => (
        /** @type {A} */
        assets[i]
      ))), rejections: pending, pending, visitedStates, uncheckedConstraints }
    );
  }
  function completeCounts() {
    const missing = () => mediaSlots.some((i) => counts[i] < minima[i]) || groups.some((g) => mediaSlots.filter((i) => g.slots.includes(slots[i].slot)).reduce((n, i) => n + counts[i], 0) < (g.min ?? 0));
    function fill(position) {
      if (!enter()) return "unproven";
      if (!missing()) return "yes";
      if (position >= mediaSlots.length) return "no";
      const i = mediaSlots[position], s = slots[i], original = counts[i];
      let needed = minima[i] > original ? minima[i] - original : 0;
      for (const g of groups) if (g.slots.includes(s.slot)) {
        const deficit = (g.min ?? 0) - mediaSlots.filter((j) => g.slots.includes(slots[j].slot)).reduce((n, j) => n + counts[j], 0);
        if (deficit > needed) needed = deficit;
      }
      let limit = maxima[i] - original;
      if (needed < limit) limit = needed;
      let uncertain = limit > 0 && (s.totalMinDurationSec !== void 0 || (s.minDurationSec ?? 0) > 0);
      if (uncertain || s.maxSizeMb === 0 && s.maxSizeExclusive || s.totalMaxDurationSec === 0 && s.totalMaxExclusive || s.combinedOutputMaxDurationSec !== void 0 && typeof context.duration === "number" && context.duration > s.combinedOutputMaxDurationSec) limit = 0;
      for (let add = 0; add <= limit; add++) {
        counts[i] = original + add;
        const answer = fill(position + 1);
        counts[i] = original;
        if (answer === "yes") return "yes";
        if (answer === "unproven") uncertain = true;
        if (exhausted) break;
      }
      return uncertain ? "unproven" : "no";
    }
    return fill(0);
  }
  function leaf() {
    if (!enter()) return;
    const check = validate(true);
    if (check.rejected.length) {
      remember(check.rejected);
      return;
    }
    if (check.unproven) {
      seenCompletionUnproven = true;
      return;
    }
    if (check.pending.some((p) => p.code === GUARD_CODES.MIN_UNSATISFIED)) {
      const completion = completeCounts();
      if (completion === "no") {
        remember([incompatible("input minima cannot be completed")]);
        return;
      }
      if (completion === "unproven") {
        seenCompletionUnproven = true;
        return;
      }
    }
    const result = witness(check.pending, check.uncheckedConstraints);
    if (result.status === "ready") ready = result;
    else if (!savedPending) savedPending = result;
  }
  if (!enter()) return failed([incompatible("assignment search budget exceeded")], "search_budget_exceeded");
  if (strategy === "legacy") {
    for (const e of entries) {
      let domains = e.domains;
      if (!e.asset.targetSlot && !e.asset.role) domains = [...domains].sort((a, b) => {
        const rank = (d) => {
          const i = d.slotIndex;
          return counts[i] < minima[i] ? 0 : slots[i].role === "reference" ? 1 : 2;
        };
        return rank(a) - rank(b) || a.slotIndex - b.slotIndex;
      });
      for (const d of domains) {
        const i = d.slotIndex;
        if (counts[i] >= maxima[i]) continue;
        if (!enter()) break;
        place(e, d);
        const check = validate(false);
        if (!check.rejected.length) break;
        unplace(e);
      }
      if (!assigned.has(e.assetIndex) || exhausted) break;
    }
    if (assigned.size === entries.length && !exhausted) leaf();
    if (ready) return ready;
    for (const e of [...entries].reverse()) unplace(e);
  }
  function search(remaining) {
    if (ready || exhausted) return;
    if (!remaining.length) {
      leaf();
      return;
    }
    const available = (e2) => e2.domains.filter((d) => {
      const i = d.slotIndex;
      return counts[i] < maxima[i];
    });
    const ordered = [...remaining].sort((a, b) => Number(Boolean(b.asset.targetSlot)) - Number(Boolean(a.asset.targetSlot)) || available(a).length - available(b).length || a.assetIndex - b.assetIndex);
    const e = ordered[0], domains = available(e);
    if (!domains.length) {
      if (e.domains.length === 1) {
        const i = e.domains[0].slotIndex, s = slots[i];
        remember([{ code: GUARD_CODES.SLOT_CAPACITY, message: `slot ${s.slot} is full (max ${s.max})`, assetIndex: e.assetIndex, slotIndex: i, slot: s.slot, max: s.max }]);
      } else remember([incompatible("no complete assignment satisfies the operation")]);
      return;
    }
    for (const d of domains) {
      if (!enter()) return;
      place(e, d);
      const check = validate(false);
      if (check.rejected.length) remember(check.rejected);
      else search(remaining.filter((item) => item !== e));
      unplace(e);
      if (ready || exhausted) return;
    }
  }
  search(entries);
  const finalReady = (
    /** @type {import('../types/index.js').AssignmentResult<A> | undefined} */
    ready
  );
  if (finalReady) return { ...finalReady, visitedStates };
  if (exhausted) return failed([incompatible("assignment search budget exceeded", { diagnostic: (
    /** @type {const} */
    "search_budget_exceeded"
  ) })], "search_budget_exceeded");
  if (savedPending) return { ...savedPending, visitedStates };
  if (seenCompletionUnproven) return failed([incompatible("future input completion is not proven", { diagnostic: (
    /** @type {const} */
    "completion_unproven"
  ) })], "completion_unproven");
  return failed(failures.length && entries.every((e) => e.domains.length === 1) ? failures : [incompatible("no complete assignment satisfies the operation")]);
}

// src/parameters.js
function plain(value) {
  return typeof value === "object" && value !== null && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function modeOf(policy) {
  if (policy === void 0) return "canonical";
  if (!plain(policy) || Object.getOwnPropertySymbols(policy).length > 0 || Object.getOwnPropertyNames(policy).some((key) => key !== "mode") || policy.mode !== void 0 && policy.mode !== "canonical" && policy.mode !== "legacyGuard") {
    throw new TypeError("parameter policy must be { mode?: canonical | legacyGuard }");
  }
  return policy.mode ?? "canonical";
}
function primitive(value) {
  return value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value);
}
function matches(left, right, fold) {
  return Object.is(left, right) || left === 0 && right === 0 || fold === true && typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();
}
function decimal(value) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(value));
  if (!match) return null;
  let digits = (match[2] + (match[3] ?? "")).replace(/^0+/, "") || "0";
  let exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
  while (digits.length > 1 && digits.endsWith("0")) {
    digits = digits.slice(0, -1);
    exponent += 1;
  }
  if (digits.length > 17 || exponent < -324 || exponent > 308 || !Number.isInteger(exponent)) return null;
  return { coefficient: BigInt((match[1] || "") + digits), exponent };
}
function stepped(value, min, step) {
  const parts = [decimal(value), decimal(min), decimal(step)];
  if (parts.some((part) => part === null)) return { status: "indeterminate", diagnostic: "precision_unproven" };
  const valid = (
    /** @type {{ coefficient: bigint, exponent: number }[]} */
    parts
  );
  const exponent = valid.reduce((lowest, part) => part.exponent < lowest ? part.exponent : lowest, 308);
  if (valid.some((part) => part.exponent - exponent > 632)) return { status: "indeterminate", diagnostic: "precision_unproven" };
  const [V, M, S] = valid.map((part) => part.coefficient * 10n ** BigInt(part.exponent - exponent));
  const D = V - M;
  if (D < 0n || S <= 0n) return { status: "indeterminate", diagnostic: "precision_unproven" };
  const Q = D > S ? D : S;
  const scale = 2n ** 49n;
  if (4n * Q >= scale * S) return { status: "indeterminate", diagnostic: "precision_unproven" };
  const remainder = D % S;
  const R = remainder < S - remainder ? remainder : S - remainder;
  return R * scale <= Q ? { status: "member" } : { status: "nonmember", reason: "range" };
}
function checkParameterMember(definition, value, policy) {
  const mode = modeOf(policy);
  if (!plain(definition)) return { status: "indeterminate", diagnostic: "malformed_definition" };
  const malformed = { status: (
    /** @type {const} */
    "indeterminate"
  ), diagnostic: (
    /** @type {const} */
    "malformed_definition"
  ) };
  for (
    const flag of
    /** @type {const} */
    ["allowAuto", "supported", "caseInsensitive"]
  ) {
    if (definition[flag] !== void 0 && typeof definition[flag] !== "boolean") return malformed;
  }
  for (
    const bound of
    /** @type {const} */
    ["minLength", "maxLength"]
  ) {
    const raw = definition[bound];
    if (raw !== void 0 && (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw <= 0)) return malformed;
  }
  if (definition.minLength !== void 0 && definition.maxLength !== void 0 && definition.minLength > definition.maxLength) return malformed;
  if (Object.prototype.hasOwnProperty.call(definition, "defaultValue") && definition.defaultValue === void 0) return malformed;
  const known = [
    "type",
    "options",
    "optionsFrom",
    "range",
    "defaultValue",
    "minLength",
    "maxLength",
    "supported",
    "allowAuto",
    "caseInsensitive",
    "unit",
    "description",
    "label",
    "help"
  ];
  if (Object.getOwnPropertySymbols(definition).length > 0 || Object.getOwnPropertyNames(definition).some((key) => !known.includes(key))) return malformed;
  const range = definition.range;
  if (range !== void 0) {
    if (!plain(range) || Object.getOwnPropertySymbols(range).length > 0 || Object.getOwnPropertyNames(range).some((key) => !["min", "max", "step"].includes(key))) return malformed;
    for (
      const bound of
      /** @type {const} */
      ["min", "max", "step"]
    ) {
      const raw = range[bound];
      if (raw !== void 0 && (typeof raw !== "number" || !Number.isFinite(raw))) return malformed;
    }
    if (range.step !== void 0 && range.step <= 0 || range.min !== void 0 && range.max !== void 0 && range.min > range.max) return malformed;
  }
  const options = [];
  if (definition.options !== void 0) {
    if (!Array.isArray(definition.options)) return malformed;
    for (const item of definition.options) {
      const option = plain(item) ? (
        /** @type {{ value: unknown }} */
        item.value
      ) : item;
      if (!primitive(option) || options.some((candidate) => matches(candidate, option, definition.caseInsensitive))) return malformed;
      options.push(option);
    }
  }
  const optionMember = options.some((option) => matches(option, value, definition.caseInsensitive));
  const inRangeBounds = range !== void 0 && typeof value === "number" && Number.isFinite(value) && (range.min === void 0 || value >= range.min) && (range.max === void 0 || value <= range.max);
  const autoMember = definition.allowAuto === true && value === -1;
  if (mode === "legacyGuard" && definition.optionsFrom === void 0 && options.length > 0 && !optionMember && !inRangeBounds && !autoMember) {
    return { status: "nonmember", reason: "domain" };
  }
  if (!primitive(value)) return { status: "nonmember", reason: "domain" };
  if (definition.supported === true && typeof value !== "boolean") return { status: "nonmember", reason: "boolean" };
  if (definition.supported === false) return { status: "nonmember", reason: "unsupported" };
  if (definition.type === "integer" && (typeof value !== "number" || !Number.isSafeInteger(value))) return { status: "nonmember", reason: "integer" };
  if (definition.type === "number" && typeof value !== "number") return { status: "nonmember", reason: "number" };
  if (definition.type === "string" && typeof value !== "string") return { status: "nonmember", reason: "string" };
  if (definition.type === "boolean" && typeof value !== "boolean") return { status: "nonmember", reason: "boolean" };
  if (definition.type !== void 0 && !["integer", "number", "string", "boolean"].includes(definition.type)) return { status: "nonmember", reason: "type" };
  if (definition.minLength !== void 0 || definition.maxLength !== void 0) {
    if (typeof value !== "string") return { status: "nonmember", reason: "length_type" };
    const length = Array.from(value).length;
    if (definition.minLength !== void 0 && length < definition.minLength) return { status: "nonmember", reason: "minLength" };
    if (definition.maxLength !== void 0 && length > definition.maxLength) return { status: "nonmember", reason: "maxLength" };
  }
  if (optionMember) return { status: "member" };
  if (autoMember) return { status: "member" };
  let rangeResult;
  if (range !== void 0) {
    rangeResult = typeof value !== "number" ? { status: "nonmember", reason: "number" } : !inRangeBounds ? { status: "nonmember", reason: "range" } : range.step === void 0 ? { status: "member" } : range.min === void 0 ? { status: "indeterminate", diagnostic: "precision_unproven" } : stepped(value, range.min, range.step);
    if (rangeResult.status === "member") return rangeResult;
  }
  if (definition.optionsFrom !== void 0) return { status: "indeterminate", diagnostic: "unresolved_options" };
  if (rangeResult) {
    if (definition.options && definition.options.length > 0 && rangeResult.status === "nonmember" && !inRangeBounds) return { status: "nonmember", reason: "domain" };
    return rangeResult;
  }
  return definition.options === void 0 && value !== null ? { status: "member" } : { status: "nonmember", reason: "domain" };
}
function evaluateDeclaredParameters(request, operationDefinitions, modelDefinitions, policy) {
  const mode = modeOf(policy);
  if (!plain(request)) throw new TypeError("parameter request must be a plain object");
  if (operationDefinitions !== void 0 && !plain(operationDefinitions) || modelDefinitions !== void 0 && !plain(modelDefinitions)) return {
    ok: false,
    field: "",
    source: "definition",
    result: { status: "indeterminate", diagnostic: "malformed_definition" }
  };
  const definitions = { ...modelDefinitions, ...operationDefinitions };
  if (mode === "canonical") for (const field of Object.keys(request)) {
    if (request[field] !== void 0 && !Object.prototype.hasOwnProperty.call(definitions, field)) return {
      ok: false,
      field,
      source: "request",
      result: { status: "nonmember", reason: "unknown_field" }
    };
  }
  const values = {};
  for (const [field, definition] of Object.entries(definitions)) {
    if (!plain(definition)) return { ok: false, field, source: "definition", result: { status: "indeterminate", diagnostic: "malformed_definition" } };
    const supplied = Object.prototype.hasOwnProperty.call(request, field) && request[field] !== void 0 && (mode !== "legacyGuard" || request[field] !== null && request[field] !== "");
    if (!supplied && !Object.prototype.hasOwnProperty.call(definition, "defaultValue")) continue;
    const value = supplied ? request[field] : definition.defaultValue;
    const domain = !supplied && mode === "legacyGuard" && definition.supported === false ? Object.create(Object.getPrototypeOf(definition), {
      ...Object.getOwnPropertyDescriptors(definition),
      supported: { value: void 0, enumerable: true, writable: true, configurable: true }
    }) : definition;
    const result = checkParameterMember(domain, value, policy);
    if (result.status !== "member") return { ok: false, field, source: supplied ? "request" : "default", result };
    Object.defineProperty(values, field, { value, enumerable: true, writable: true, configurable: true });
  }
  return { ok: true, values };
}
export {
  BYTES_PER_MB,
  GUARD_CODES,
  SLOT_ALIASES,
  checkParameterMember,
  evaluateDeclaredParameters,
  getSlotAliases,
  isWithinDurationLimit,
  isWithinSizeLimit,
  mbToBytes,
  solveAssetAssignment,
  validateAssetAgainstSlot
};
