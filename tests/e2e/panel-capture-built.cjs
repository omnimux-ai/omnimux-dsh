var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../tests/e2e/workflow-effective-input-capture.ts
var workflow_effective_input_capture_exports = {};
__export(workflow_effective_input_capture_exports, {
  capture: () => capture
});
module.exports = __toCommonJS(workflow_effective_input_capture_exports);

// src/workflow/execution/materialGatewayExecutor.ts
var import_node_path5 = require("node:path");
var import_node_crypto = require("node:crypto");

// src/projects/paths.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var ProjectPathError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "ProjectPathError";
  }
};
function isInsideDir(target, root) {
  return target === root || target.startsWith(root + import_node_path.sep);
}
function assertProjectWriteSafe(target, root) {
  if (!isInsideDir(target, root)) {
    throw new ProjectPathError("path-denied", "project path escapes containment root");
  }
  const resolveFuture = (path) => {
    let ancestor = (0, import_node_path.resolve)(path);
    const suffix = [];
    while (true) {
      try {
        (0, import_node_fs.lstatSync)(ancestor);
        return (0, import_node_path.resolve)((0, import_node_fs.realpathSync)(ancestor), ...suffix);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        try {
          (0, import_node_fs.lstatSync)(ancestor);
          throw new ProjectPathError("path-denied", "dangling path symlink");
        } catch (probe) {
          if (probe.code !== "ENOENT") throw probe;
        }
        const parent = (0, import_node_path.resolve)(ancestor, "..");
        if (parent === ancestor) throw error;
        suffix.unshift(ancestor.slice(parent.length).replace(/^[/\\]+/, ""));
        ancestor = parent;
      }
    }
  };
  if (!isInsideDir(resolveFuture(target), resolveFuture(root))) {
    throw new ProjectPathError("path-denied", "project path escapes containment root (symlink)");
  }
}

// src/shared/validation/compatKernel.ts
function rejection(code, message, extra) {
  return { code, message, ...extra ?? {} };
}
function readExplicitTargetSlot(edgeData, targetHandle) {
  const direct = typeof edgeData.targetSlot === "string" ? edgeData.targetSlot.trim() : "";
  if (direct) return direct;
  if (typeof targetHandle === "string") {
    const handle = targetHandle.trim();
    if (handle === "in" || handle === "input") {
      return void 0;
    }
    if (handle) return handle;
  }
  const binding = edgeData.slotBinding;
  if (binding && typeof binding === "object") {
    const slot2 = binding.slot;
    if (typeof slot2 === "string" && slot2.trim()) return slot2.trim();
  }
  return void 0;
}
var LEGACY_OPERATION_MAP = Object.freeze({
  reference: "video_multi_ref",
  first_last_frame: "first_last_frame",
  first_frame: "first_frame",
  end_frame: "end_frame",
  endframe: "end_frame",
  "end-frame": "end_frame",
  text_to_video: "text_to_video",
  i2v: "first_frame",
  t2v: "text_to_video",
  flf: "first_last_frame",
  avatar: "digital_human",
  digital_human: "digital_human",
  tts: "text_to_speech",
  asr: "speech_to_text",
  stt: "speech_to_text",
  music: "text_to_music",
  t2i: "text_to_image",
  i2i: "image_to_image"
});
var MEDIA_INPUT_TYPES = Object.freeze(["image", "video", "audio", "document"]);
function isMediaInputType(type) {
  return type === "image" || type === "video" || type === "audio" || type === "document";
}
var BYTES_PER_MB = 1024 * 1024;
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}
function buildUpstreamFingerprint(input) {
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const nodeFields = Object.fromEntries(
    Object.entries(input.nodeFields ?? {}).filter(([, value]) => value !== void 0)
  );
  const assets = (input.assets ?? []).map((asset) => ({ ...asset }));
  const mediaAssets = assets.filter((asset) => isMediaInputType(asset.type));
  const localText = input.localText;
  const signature = canonicalJson({ prompt, nodeFields, assets, localText });
  return { prompt, nodeFields, assets, mediaAssets, signature, localText };
}
function normalizeSlot(raw) {
  if (!raw || typeof raw !== "object") return null;
  const slot2 = raw;
  if (typeof slot2.slot !== "string" || typeof slot2.type !== "string") return null;
  return {
    slot: slot2.slot,
    type: slot2.type,
    role: typeof slot2.role === "string" ? slot2.role : "reference",
    ...typeof slot2.source === "string" ? { source: slot2.source } : {},
    ...Array.isArray(slot2.valueSources) ? { valueSources: slot2.valueSources.filter((source) => source === "local_field" || source === "upstream_output") } : {},
    ...slot2.type === "text" && slot2.composition && typeof slot2.composition === "object" ? { composition: { ...slot2.composition } } : {},
    min: Number.isFinite(slot2.min) ? slot2.min : 0,
    max: slot2.max === null ? null : Number.isFinite(slot2.max) ? slot2.max : 0,
    ...Array.isArray(slot2.allowedMimes) ? { allowedMimes: slot2.allowedMimes.map(String) } : {},
    ...Number.isFinite(slot2.maxSizeMb) ? { maxSizeMb: slot2.maxSizeMb } : {},
    ...typeof slot2.maxSizeExclusive === "boolean" ? { maxSizeExclusive: slot2.maxSizeExclusive } : {},
    ...Number.isFinite(slot2.minDurationSec) ? { minDurationSec: slot2.minDurationSec } : {},
    ...Number.isFinite(slot2.maxDurationSec) ? { maxDurationSec: slot2.maxDurationSec } : {},
    ...Number.isFinite(slot2.totalMinDurationSec) ? { totalMinDurationSec: slot2.totalMinDurationSec } : {},
    ...Number.isFinite(slot2.totalMaxDurationSec) ? { totalMaxDurationSec: slot2.totalMaxDurationSec } : {},
    ...Number.isFinite(slot2.combinedOutputMaxDurationSec) ? { combinedOutputMaxDurationSec: slot2.combinedOutputMaxDurationSec } : {},
    ...typeof slot2.totalMinExclusive === "boolean" ? { totalMinExclusive: slot2.totalMinExclusive } : {},
    ...typeof slot2.totalMaxExclusive === "boolean" ? { totalMaxExclusive: slot2.totalMaxExclusive } : {},
    ...slot2.limitSource && typeof slot2.limitSource === "object" ? { limitSource: slot2.limitSource } : {}
  };
}
function normalizeOperation(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.id) return null;
  const outputType = typeof raw.output?.type === "string" ? raw.output.type : "";
  if (!outputType) return null;
  return {
    id: raw.id,
    label: typeof raw.label === "string" ? raw.label : raw.id,
    output: { ...raw.output, type: outputType },
    inputs: (Array.isArray(raw.inputs) ? raw.inputs : []).map(normalizeSlot).filter((slot2) => slot2 !== null),
    inputGroups: (Array.isArray(raw.inputGroups) ? raw.inputGroups : []).filter((group) => group && typeof group === "object" && Array.isArray(group.slots)).map((group) => ({
      slots: group.slots.map(String),
      min: Number.isFinite(group.min) ? group.min : 0,
      ...typeof group.hint === "string" ? { hint: group.hint } : {}
    })),
    ...raw.parameters && typeof raw.parameters === "object" ? { parameters: raw.parameters } : {},
    listed: raw.listed === true
  };
}
function toModelView(model, order) {
  if (!model || typeof model.id !== "string" || !model.id) return null;
  return {
    id: model.id,
    label: typeof model.label === "string" ? model.label : model.id,
    ...typeof model.family === "string" ? { family: model.family } : {},
    aliases: Array.isArray(model.aliases) ? model.aliases.map(String).filter(Boolean) : [],
    operations: (Array.isArray(model.operations) ? model.operations : []).map(normalizeOperation).filter((op) => op !== null),
    order,
    synthesized: false
  };
}
function buildContractView(catalog2) {
  const empty = {
    available: false,
    models: [],
    byIdOrAlias: /* @__PURE__ */ new Map(),
    defaultsByOperation: {}
  };
  if (!catalog2 || typeof catalog2 !== "object") return empty;
  const models = [];
  if (Array.isArray(catalog2.models)) {
    catalog2.models.forEach((row, index) => {
      const view = toModelView(row, index);
      if (view) models.push(view);
    });
  }
  const byIdOrAlias = /* @__PURE__ */ new Map();
  for (const view of models) {
    if (!byIdOrAlias.has(view.id)) byIdOrAlias.set(view.id, view);
    for (const alias of view.aliases) {
      if (!byIdOrAlias.has(alias)) byIdOrAlias.set(alias, view);
    }
  }
  const defaultsByOperation = {};
  if (catalog2.defaultsByOperation && typeof catalog2.defaultsByOperation === "object") {
    for (const [key, value] of Object.entries(catalog2.defaultsByOperation)) {
      if (typeof value === "string" && value) defaultsByOperation[key] = value;
    }
  }
  return {
    available: models.length > 0 || Array.isArray(catalog2.models),
    models,
    byIdOrAlias,
    defaultsByOperation
  };
}
function resolveModelView(view, modelId) {
  const key = String(modelId ?? "").trim();
  if (!key) return void 0;
  return view.byIdOrAlias.get(key);
}
function camelCaseSlot(slot2) {
  return slot2.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
}
function readNodeField(slot2, fingerprint) {
  if (slot2.slot === "prompt" || slot2.role === "prompt") return fingerprint.prompt;
  return fingerprint.nodeFields[slot2.slot] ?? fingerprint.nodeFields[camelCaseSlot(slot2.slot)];
}
function isRequiredNodeFieldPresent(slot2, value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!slot2.slot.endsWith("_url")) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
function bindableSlots(op) {
  return op.inputs.filter((slot2) => slot2.valueSources ? slot2.valueSources.includes("upstream_output") : slot2.source !== "node_field" && slot2.role !== "prompt" && isMediaInputType(slot2.type));
}
var REJECTION_PRIORITY = [
  "role_conflict",
  "slot_capacity",
  "mime_unsupported",
  "size_exceeded",
  "duration_exceeded",
  "operation_incompatible"
];
function bestRejection(candidates) {
  for (const code of REJECTION_PRIORITY) {
    const hit = candidates.find((candidate) => candidate.code === code);
    if (hit) return hit;
  }
  return candidates[0] ?? rejection("operation_incompatible", "\u8F93\u5165\u65E0\u6CD5\u88AB\u8BE5 operation \u5438\u6536");
}
function matchOperationInputs(op, fingerprint) {
  const slots = bindableSlots(op);
  const assignments = /* @__PURE__ */ new Map();
  for (const slot2 of slots) assignments.set(slot2, { slot: slot2, assets: [] });
  const rejections = [];
  const tryAssign = (asset, candidates) => {
    const attempts = [];
    for (const slot2 of candidates) {
      const state = assignments.get(slot2);
      if (!state) continue;
      const max = slot2.max === null ? Number.POSITIVE_INFINITY : slot2.max;
      if (!(slot2.type === "text" && slot2.composition) && state.assets.length >= max) {
        attempts.push(rejection("slot_capacity", `\u69FD\u4F4D ${slot2.slot} \u5DF2\u6EE1\uFF08max ${slot2.max}\uFF09`, {
          operationId: op.id,
          slot: slot2.slot,
          meta: { max: slot2.max, current: state.assets.length }
        }));
        continue;
      }
      if (Array.isArray(slot2.allowedMimes) && slot2.allowedMimes.length > 0 && typeof asset.mimeType === "string" && asset.mimeType && !slot2.allowedMimes.includes(asset.mimeType)) {
        attempts.push(rejection("mime_unsupported", `\u7D20\u6750 MIME ${asset.mimeType} \u4E0D\u5728\u69FD\u4F4D ${slot2.slot} \u5141\u8BB8\u5217\u8868`, {
          operationId: op.id,
          slot: slot2.slot,
          meta: { mimeType: asset.mimeType, allowedMimes: [...slot2.allowedMimes] }
        }));
        continue;
      }
      if (Number.isFinite(slot2.maxSizeMb) && Number.isFinite(asset.sizeBytes) && (slot2.maxSizeExclusive === true ? asset.sizeBytes >= slot2.maxSizeMb * BYTES_PER_MB : asset.sizeBytes > slot2.maxSizeMb * BYTES_PER_MB)) {
        attempts.push(rejection("size_exceeded", `\u7D20\u6750\u4F53\u79EF\u8D85\u8FC7\u69FD\u4F4D ${slot2.slot} \u4E0A\u9650\uFF08${slot2.maxSizeMb}MB\uFF09`, {
          operationId: op.id,
          slot: slot2.slot,
          meta: { sizeBytes: asset.sizeBytes, maxSizeMb: slot2.maxSizeMb }
        }));
        continue;
      }
      if (Number.isFinite(slot2.maxDurationSec) && Number.isFinite(asset.durationSec) && asset.durationSec > slot2.maxDurationSec) {
        attempts.push(rejection("duration_exceeded", `\u7D20\u6750\u65F6\u957F\u8D85\u8FC7\u69FD\u4F4D ${slot2.slot} \u4E0A\u9650\uFF08${slot2.maxDurationSec}s\uFF09`, {
          operationId: op.id,
          slot: slot2.slot,
          meta: { durationSec: asset.durationSec, maxDurationSec: slot2.maxDurationSec }
        }));
        continue;
      }
      if (Number.isFinite(slot2.minDurationSec) && Number.isFinite(asset.durationSec) && asset.durationSec < slot2.minDurationSec) {
        attempts.push(rejection("duration_exceeded", `\u7D20\u6750\u65F6\u957F\u4F4E\u4E8E\u69FD\u4F4D ${slot2.slot} \u4E0B\u9650\uFF08${slot2.minDurationSec}s\uFF09`, {
          operationId: op.id,
          slot: slot2.slot,
          meta: { durationSec: asset.durationSec, minDurationSec: slot2.minDurationSec }
        }));
        continue;
      }
      state.assets.push(asset);
      return { assigned: true, attempts };
    }
    return { assigned: false, attempts };
  };
  const upstreamAssets = fingerprint.assets.filter((asset) => isMediaInputType(asset.type) || asset.type === "text" && op.inputs.some((slot2) => slot2.valueSources !== void 0));
  for (const asset of upstreamAssets) {
    if (asset.targetSlot) {
      const explicit = slots.filter((slot2) => slot2.slot === asset.targetSlot && slot2.type === asset.type);
      if (explicit.length === 0) {
        rejections.push(rejection("role_conflict", `\u663E\u5F0F\u76EE\u6807\u69FD\u4F4D ${asset.targetSlot} \u4E0D\u5B58\u5728\u6216\u7C7B\u578B\u4E0D\u7B26`, {
          operationId: op.id,
          slot: asset.targetSlot
        }));
        continue;
      }
      const result2 = tryAssign(asset, explicit);
      if (!result2.assigned) rejections.push(bestRejection(result2.attempts));
      continue;
    }
    if (asset.role) {
      const roleSlots = slots.filter((slot2) => slot2.role === asset.role && slot2.type === asset.type);
      if (roleSlots.length === 0) {
        rejections.push(rejection("role_conflict", `\u6CA1\u6709\u89D2\u8272\u4E3A ${asset.role} \u4E14\u7C7B\u578B\u4E3A ${asset.type} \u7684\u69FD\u4F4D`, {
          operationId: op.id,
          meta: { role: asset.role, type: asset.type }
        }));
        continue;
      }
      const result2 = tryAssign(asset, roleSlots);
      if (!result2.assigned) rejections.push(bestRejection(result2.attempts));
      continue;
    }
    const typed = slots.filter((slot2) => slot2.type === asset.type);
    if (typed.length === 0) {
      rejections.push(rejection("operation_incompatible", `operation ${op.id} \u6CA1\u6709\u53EF\u5438\u6536 ${asset.type} \u7684\u69FD\u4F4D`, {
        operationId: op.id,
        meta: { type: asset.type }
      }));
      continue;
    }
    const requiredNarrow = typed.filter((slot2) => {
      const state = assignments.get(slot2);
      return slot2.role !== "reference" && state !== void 0 && state.assets.length < slot2.min;
    });
    const genericReference = typed.filter((slot2) => slot2.role === "reference" && !requiredNarrow.includes(slot2));
    const rest = typed.filter((slot2) => !requiredNarrow.includes(slot2) && !genericReference.includes(slot2));
    const result = tryAssign(asset, [...requiredNarrow, ...genericReference, ...rest]);
    if (!result.assigned) rejections.push(bestRejection(result.attempts));
  }
  for (const state of assignments.values()) {
    if (state.assets.length === 0) continue;
    if (!state.assets.every((asset) => Number.isFinite(asset.durationSec))) continue;
    const total = state.assets.reduce((sum, asset) => sum + asset.durationSec, 0);
    if (Number.isFinite(state.slot.totalMinDurationSec) && (state.slot.totalMinExclusive ? total <= state.slot.totalMinDurationSec : total < state.slot.totalMinDurationSec)) {
      rejections.push(rejection("duration_exceeded", `\u69FD\u4F4D ${state.slot.slot} \u7684\u7D20\u6750\u603B\u65F6\u957F\u4F4E\u4E8E\u6587\u6863\u4E0B\u9650`, {
        operationId: op.id,
        slot: state.slot.slot,
        meta: { totalDurationSec: total, totalMinDurationSec: state.slot.totalMinDurationSec }
      }));
    }
    if (Number.isFinite(state.slot.totalMaxDurationSec) && (state.slot.totalMaxExclusive ? total >= state.slot.totalMaxDurationSec : total > state.slot.totalMaxDurationSec)) {
      rejections.push(rejection("duration_exceeded", `\u69FD\u4F4D ${state.slot.slot} \u7684\u7D20\u6750\u603B\u65F6\u957F\u8D85\u8FC7\u6587\u6863\u4E0A\u9650`, {
        operationId: op.id,
        slot: state.slot.slot,
        meta: { totalDurationSec: total, totalMaxDurationSec: state.slot.totalMaxDurationSec }
      }));
    }
  }
  const bindings = [];
  for (const state of assignments.values()) {
    for (const asset of state.assets) {
      bindings.push({
        ...asset.edgeId ? { edgeId: asset.edgeId } : {},
        sourceNodeId: asset.sourceNodeId,
        slot: state.slot.slot,
        role: state.slot.role,
        type: state.slot.type
      });
    }
  }
  const accepts = rejections.length === 0;
  const pending = [];
  if (accepts) {
    if (!op.inputs.some((slot2) => slot2.composition) && op.output.type === "audio" && fingerprint.localText?.trim() && fingerprint.assets.some((asset) => asset.type === "text" && asset.textContent?.trim())) {
      pending.push(rejection("text_role_required", "\u5F53\u524D\u97F3\u9891\u4EFB\u52A1\u4E0D\u80FD\u5206\u522B\u8868\u8FBE\u4E0A\u6E38\u6B63\u6587\u548C\u672C\u5730\u8981\u6C42\uFF1B\u8BF7\u5C06\u6B63\u6587\u4FDD\u7559\u5728\u4E00\u4E2A\u6765\u6E90\uFF0C\u5E76\u7528\u5DF2\u652F\u6301\u7684\u97F3\u8272\u3001\u8BED\u901F\u7B49\u53C2\u6570\u8C03\u6574\u8868\u8FBE", { operationId: op.id }));
    }
    for (const asset of fingerprint.assets) {
      if (!asset.availability || asset.availability === "ready") continue;
      pending.push(rejection(
        asset.availability === "waiting" ? "input_waiting" : "input_unavailable",
        asset.availabilityMessage ?? `\u6765\u6E90 ${asset.sourceNodeId} \u5C1A\u672A\u5C31\u7EEA\uFF0C\u8BF7\u8865\u9F50\u5185\u5BB9\u6216\u79FB\u9664\u5F15\u7528`,
        {
          operationId: op.id,
          meta: { sourceNodeId: asset.sourceNodeId, sourceLabel: asset.sourceLabel ?? asset.sourceNodeId, edgeId: asset.edgeId }
        }
      ));
    }
    for (const state of assignments.values()) {
      const localValue = state.slot.slot === "prompt" || state.slot.role === "prompt" ? fingerprint.localText ?? fingerprint.prompt : readNodeField(state.slot, fingerprint);
      const localPresent = state.slot.valueSources?.includes("local_field") && Boolean(String(localValue ?? "").trim());
      const composition = state.slot.composition;
      if (composition && localPresent && !(composition.kind === "single_body" && composition.localRole === "body") && !(composition.kind === "content_with_instruction" && composition.localRole === "instruction")) {
        pending.push(rejection("text_role_required", "\u5F53\u524D\u65B9\u5F0F\u4E0D\u652F\u6301\u8BE5\u6587\u672C\u89D2\u8272", { operationId: op.id, slot: state.slot.slot }));
      }
      const count = state.slot.type === "text" && composition ? Number(localPresent || state.slot.valueSources?.includes("upstream_output") && state.assets.some((asset) => asset.textContent?.trim())) : state.assets.length;
      if (count < state.slot.min && state.slot.type === "text" && composition && state.slot.valueSources?.includes("local_field")) {
        pending.push(rejection("prompt_required", "\u8BF7\u63D0\u4F9B\u6B63\u6587\u6216\u8865\u5145\u8981\u6C42\uFF0C\u4E5F\u53EF\u8FDE\u63A5\u5DF2\u6709\u6587\u672C", { operationId: op.id, slot: state.slot.slot }));
      } else if (count < state.slot.min) {
        pending.push(rejection("min_unsatisfied", `\u69FD\u4F4D ${state.slot.slot} \u9700\u8981\u81F3\u5C11 ${state.slot.min} \u4E2A\u8F93\u5165\uFF08\u5F53\u524D ${state.assets.length}\uFF09`, {
          operationId: op.id,
          slot: state.slot.slot,
          meta: { min: state.slot.min, current: state.assets.length }
        }));
      }
    }
    for (const group of op.inputGroups) {
      const count = group.slots.reduce(
        (sum, slotName) => sum + (assignments.get(slots.find((slot2) => slot2.slot === slotName))?.assets.length ?? 0),
        0
      );
      if (count < group.min) {
        pending.push(rejection("min_unsatisfied", group.hint || `\u8F93\u5165\u7EC4\u81F3\u5C11\u9700\u8981 ${group.min} \u4E2A\u7D20\u6750\uFF08\u5F53\u524D ${count}\uFF09`, {
          operationId: op.id,
          meta: { slots: [...group.slots], min: group.min, current: count }
        }));
      }
    }
    const promptRequired = op.inputs.some(
      (slot2) => (slot2.role === "prompt" || slot2.slot === "prompt") && slot2.min >= 1
    );
    if (promptRequired && !fingerprint.prompt.trim() && !pending.some((item) => item.code === "prompt_required")) {
      pending.push(rejection("prompt_required", "\u8BF7\u63D0\u4F9B\u6B63\u6587\u6216\u8865\u5145\u8981\u6C42\uFF0C\u4E5F\u53EF\u8FDE\u63A5\u5DF2\u6709\u6587\u672C", { operationId: op.id }));
    }
    for (const slot2 of op.inputs) {
      if (slot2.source !== "node_field" || slot2.min < 1 || slot2.role === "prompt" || slot2.slot === "prompt") continue;
      if (isRequiredNodeFieldPresent(slot2, readNodeField(slot2, fingerprint))) continue;
      const name = slot2.slot.endsWith("_url") ? "\u6709\u6548 URL" : "\u975E\u7A7A\u503C";
      pending.push(rejection("metadata_required", `\u69FD\u4F4D ${slot2.slot} \u9700\u8981${name}`, {
        operationId: op.id,
        slot: slot2.slot
      }));
    }
  }
  return {
    operationId: op.id,
    accepts,
    ready: accepts && pending.length === 0,
    bindings,
    rejections,
    pending
  };
}
function evaluateModelCompat(model, fingerprint, opts = {}) {
  if (!model) {
    return {
      modelId: "",
      known: false,
      listedOperationIds: [],
      matches: [],
      effectiveOperations: [],
      acceptsCurrentInputs: false,
      readyToSubmit: false,
      bindings: [],
      rejections: [rejection("unknown_model", "\u6A21\u578B\u4E0D\u5728\u76EE\u5F55\u4E2D\uFF08\u672A\u77E5\u6216\u5DF2\u4E0B\u67B6\uFF09")]
    };
  }
  const requestedOperationId = typeof opts.operationId === "string" && opts.operationId.trim() ? opts.operationId.trim() : void 0;
  const listedOps = model.operations.filter((op) => op.listed);
  const candidateOps = opts.outputType ? listedOps.filter((op) => op.output.type === opts.outputType) : listedOps;
  const base = {
    modelId: model.id,
    known: true,
    ...model.family !== void 0 ? { family: model.family } : {},
    ...requestedOperationId ? { requestedOperationId } : {},
    listedOperationIds: candidateOps.map((op) => op.id),
    matches: [],
    effectiveOperations: [],
    acceptsCurrentInputs: false,
    readyToSubmit: false,
    bindings: [],
    rejections: []
  };
  if (listedOps.length === 0) {
    base.rejections = [rejection("not_listed", `\u6A21\u578B ${model.id} \u6CA1\u6709\u5DF2\u4E0A\u67B6 operation`, { modelId: model.id })];
    return base;
  }
  if (candidateOps.length === 0) {
    base.rejections = [rejection("operation_incompatible", `\u6A21\u578B ${model.id} \u6CA1\u6709\u4EA7\u51FA\u7C7B\u578B\u4E3A ${opts.outputType ?? "?"} \u7684\u5DF2\u4E0A\u67B6 operation`, {
      modelId: model.id,
      meta: { outputType: opts.outputType }
    })];
    return base;
  }
  const matches = candidateOps.map((op) => matchOperationInputs(op, fingerprint));
  const effective = matches.filter((match) => match.accepts);
  base.matches = matches;
  base.effectiveOperations = effective;
  if (effective.length === 0) {
    const ranked = [...matches].sort((a, b) => a.rejections.length - b.rejections.length);
    const best = ranked[0];
    base.rejections = best ? best.rejections.map((item) => ({ ...item, modelId: model.id })) : [rejection("model_incompatible", `\u6A21\u578B ${model.id} \u65E0\u6CD5\u5438\u6536\u5F53\u524D\u8F93\u5165`, { modelId: model.id })];
    return base;
  }
  const chosen = (requestedOperationId ? effective.find((match) => match.operationId === requestedOperationId) : void 0) ?? effective[0];
  base.acceptsCurrentInputs = true;
  base.readyToSubmit = chosen.ready;
  base.chosenOperationId = chosen.operationId;
  base.bindings = chosen.bindings;
  base.rejections = chosen.pending.map((item) => ({ ...item, modelId: model.id }));
  return base;
}

// src/shared/graph/generationPrompt.ts
function selectGenerationTextSources(sources) {
  const seen = /* @__PURE__ */ new Set();
  return sources.filter((source) => {
    const text = source.type === "text" || source.type === "table" || Boolean(source.textContent) && !source.url;
    if (!text || seen.has(source.sourceNodeId)) return false;
    seen.add(source.sourceNodeId);
    return Boolean(source.textContent?.trim()) && (!source.availability || source.availability === "ready");
  });
}
function resolveGenerationPrompt(data, upstreamTexts = [], composition) {
  const local = [data.prompt, data.content].find((value) => typeof value === "string" && value.trim());
  const instruction = typeof local === "string" ? local.replace(/@ref\[([^:]+):-1:([^\]]+)\]/g, "").trim() : "";
  const texts = upstreamTexts.filter((value) => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim());
  if (composition?.kind === "single_body") return [...texts, instruction].filter(Boolean).join("\n\n");
  if (texts.length === 0) return instruction;
  if (!composition && data.materialType === "audio") return texts.join("\n\n");
  if (texts.length === 1 && !instruction) return texts[0];
  const sources = texts.map((text, index) => `\u6765\u6E90 ${index + 1}\uFF1A
${text}`).join("\n\n");
  return instruction ? `${sources}

\u8865\u5145\u8981\u6C42\uFF1A
${instruction}` : sources;
}

// src/shared/generationPolicy.ts
var CANVAS_CAPABILITY_TOOLS = Object.freeze({
  "audio-transcription": "speechToText"
});
var CANVAS_INPUT_CAPABILITY_SEAMS = Object.freeze([
  ...new Set(Object.values(CANVAS_CAPABILITY_TOOLS))
]);

// src/shared/validation/operationUi.ts
function readOptionalMediaNumber(value) {
  if (value === null || value === void 0) return void 0;
  if (typeof value !== "number") return void 0;
  if (!Number.isFinite(value)) return void 0;
  return value;
}
function readOptionalMime(value) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  if (!trimmed) return void 0;
  if (trimmed.toLowerCase() === "unknown") return void 0;
  if (trimmed === "application/octet-stream") return void 0;
  return trimmed;
}
function assetFromUpstreamSnapshot(snap) {
  const sizeBytes = readOptionalMediaNumber(snap.sizeBytes) ?? readOptionalMediaNumber(snap.fileSize);
  const durationSec = readOptionalMediaNumber(snap.durationSec) ?? readOptionalMediaNumber(snap.duration);
  const mimeType = readOptionalMime(snap.mimeType);
  const role = typeof snap.role === "string" && snap.role.trim() ? snap.role.trim() : void 0;
  const targetSlot = typeof snap.targetSlot === "string" && snap.targetSlot.trim() ? snap.targetSlot.trim() : void 0;
  const edgeId = typeof snap.edgeId === "string" && snap.edgeId.trim() ? snap.edgeId.trim() : void 0;
  return {
    sourceNodeId: snap.nodeId,
    sourceLabel: snap.label,
    availability: snap.availability,
    availabilityMessage: snap.availabilityMessage,
    outputId: snap.outputId,
    url: snap.url,
    textContent: snap.textContent,
    type: snap.materialType || "text",
    ...edgeId ? { edgeId } : {},
    ...mimeType ? { mimeType } : {},
    ...sizeBytes !== void 0 ? { sizeBytes } : {},
    ...durationSec !== void 0 ? { durationSec } : {},
    ...role ? { role } : {},
    ...targetSlot ? { targetSlot } : {}
  };
}
function buildUiUpstreamFingerprint(input) {
  const assets = (input.upstreams ?? []).map(assetFromUpstreamSnapshot);
  return buildUpstreamFingerprint({
    prompt: resolveGenerationPrompt(
      input,
      selectGenerationTextSources(assets).map((item) => item.textContent)
    ),
    nodeFields: input.nodeFields,
    localText: resolveGenerationPrompt(input),
    assets
  });
}
function matchToOption(match, model) {
  const opView = model?.operations.find((entry) => entry.id === match.operationId);
  return {
    id: match.operationId,
    label: opView?.label && opView.label.trim() || match.operationId,
    slots: opView?.inputs ?? [],
    ...opView?.output?.type ? { outputType: opView.output.type } : {},
    ...opView?.parameters ? { parameters: opView.parameters } : {},
    bindings: match.bindings,
    effective: match.accepts,
    ready: match.ready,
    pending: match.pending
  };
}
function buildEffectiveOpsUiState(args) {
  const catalog2 = args.catalog;
  const modelId = typeof args.modelId === "string" ? args.modelId.trim() : "";
  if (!catalog2) {
    return {
      effectiveOps: [],
      count: 0,
      visibility: "hidden",
      blockGenerate: true,
      reasonCode: "catalog_unavailable",
      reasonMessage: "\u6A21\u578B\u76EE\u5F55\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"
    };
  }
  if (!modelId) {
    return {
      effectiveOps: [],
      count: 0,
      visibility: "hidden",
      blockGenerate: true,
      reasonCode: "model_unselected",
      reasonMessage: "\u8BF7\u5148\u9009\u62E9\u6A21\u578B"
    };
  }
  const view = buildContractView(catalog2);
  if (!view.available) {
    return {
      effectiveOps: [],
      count: 0,
      visibility: "hidden",
      blockGenerate: true,
      reasonCode: "catalog_unavailable",
      reasonMessage: "\u6A21\u578B\u76EE\u5F55\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"
    };
  }
  const model = resolveModelView(view, modelId);
  if (!model) {
    return {
      effectiveOps: [],
      count: 0,
      visibility: "hidden",
      blockGenerate: true,
      reasonCode: "unknown_model",
      reasonMessage: `\u6A21\u578B ${modelId} \u4E0D\u5728\u76EE\u5F55\u4E2D\uFF08\u672A\u77E5\u6216\u5DF2\u4E0B\u67B6\uFF09`
    };
  }
  const preferred = typeof args.preferredOperationId === "string" && args.preferredOperationId.trim() ? args.preferredOperationId.trim() : void 0;
  const listedOps = model.operations.filter((op) => op.listed);
  const candidateOps = args.outputType ? listedOps.filter((op) => op.output.type === args.outputType) : listedOps;
  if (listedOps.length === 0) {
    return {
      effectiveOps: [],
      count: 0,
      visibility: "hidden",
      blockGenerate: true,
      reasonCode: "not_listed",
      reasonMessage: `\u6A21\u578B ${modelId} \u6CA1\u6709\u5DF2\u4E0A\u67B6 operation`
    };
  }
  if (candidateOps.length === 0) {
    return {
      effectiveOps: [],
      count: 0,
      visibility: "hidden",
      blockGenerate: true,
      reasonCode: "operation_incompatible",
      reasonMessage: `\u6A21\u578B ${modelId} \u6CA1\u6709\u4EA7\u51FA\u7C7B\u578B\u4E3A ${args.outputType ?? "?"} \u7684\u5DF2\u4E0A\u67B6 operation`
    };
  }
  if (args.outputType === "text") {
    const verdict = evaluateModelCompat(model, args.fingerprint, {
      ...preferred ? { operationId: preferred } : {},
      outputType: "text"
    });
    const effectiveOps2 = verdict.effectiveOperations.map((match) => matchToOption(match, model));
    const count2 = effectiveOps2.length;
    if (count2 === 0) {
      const primary = verdict.rejections[0];
      return {
        effectiveOps: [],
        count: 0,
        visibility: "hidden",
        blockGenerate: true,
        reasonCode: primary?.code ?? "operation_incompatible",
        reasonMessage: primary?.message ?? `\u5F53\u524D\u6A21\u578B ${modelId} \u65E0\u6CD5\u5904\u7406\u8FD9\u4E9B\u8F93\u5165\u7D20\u6750`,
        ...primary ? { reason: primary } : {},
        ...preferred ? { selectedOperationId: preferred } : {}
      };
    }
    const preferredOp2 = effectiveOps2.find((op) => op.id === preferred);
    const selected2 = (preferredOp2?.ready ? preferredOp2 : void 0) ?? effectiveOps2.find((op) => op.ready) ?? preferredOp2 ?? effectiveOps2[0];
    const pending2 = selected2.pending[0];
    return {
      effectiveOps: effectiveOps2,
      count: count2,
      visibility: "hidden",
      implicitOperationId: selected2.id,
      selectedOperationId: selected2.id,
      blockGenerate: !selected2.ready,
      ...pending2 ? { reasonCode: pending2.code, reasonMessage: pending2.message, reason: pending2 } : {}
    };
  }
  if (candidateOps.length === 1) {
    const verdict = evaluateModelCompat(model, args.fingerprint, {
      ...preferred ? { operationId: preferred } : {},
      ...args.outputType ? { outputType: args.outputType } : {}
    });
    const effectiveOps2 = verdict.effectiveOperations.map((match) => matchToOption(match, model));
    const count2 = effectiveOps2.length;
    if (count2 === 0) {
      const primary = verdict.rejections[0];
      return {
        effectiveOps: [],
        count: 0,
        visibility: "hidden",
        blockGenerate: true,
        reasonCode: primary?.code ?? "operation_incompatible",
        reasonMessage: primary?.message ?? `\u5F53\u524D\u6A21\u578B ${modelId} \u65E0\u6CD5\u5904\u7406\u8FD9\u4E9B\u8F93\u5165\u7D20\u6750`,
        ...primary ? { reason: primary } : {},
        ...preferred ? { selectedOperationId: preferred } : {}
      };
    }
    const sole = effectiveOps2[0];
    const pending2 = sole.pending[0];
    const preferredIsEffective2 = !preferred || preferred === sole.id;
    if (!preferredIsEffective2) {
      return {
        effectiveOps: effectiveOps2,
        count: 1,
        visibility: "hidden",
        implicitOperationId: sole.id,
        selectedOperationId: preferred,
        blockGenerate: true,
        reasonCode: "operation_incompatible",
        reasonMessage: "\u5F53\u524D\u6A21\u578B\u4E0D\u652F\u6301\u5DF2\u4FDD\u5B58\u7684\u751F\u6210\u65B9\u5F0F\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9"
      };
    }
    return {
      effectiveOps: effectiveOps2,
      count: 1,
      visibility: "hidden",
      implicitOperationId: sole.id,
      selectedOperationId: sole.id,
      blockGenerate: !sole.ready,
      ...pending2 ? { reasonCode: pending2.code, reasonMessage: pending2.message, reason: pending2 } : {}
    };
  }
  const effectiveOps = candidateOps.map((op) => {
    const allowedMediaTypes = new Set(op.inputs.map((slot2) => slot2.type));
    const opFingerprint = buildUpstreamFingerprint({
      ...args.fingerprint,
      assets: args.fingerprint.assets.filter((asset) => {
        if (!isMediaInputType(asset.type)) return true;
        return allowedMediaTypes.has(asset.type);
      })
    });
    const match = matchOperationInputs(op, opFingerprint);
    return matchToOption(match, model);
  });
  const count = effectiveOps.length;
  const preferredOp = effectiveOps.find((op) => op.id === preferred);
  const preferredIsEffective = !preferred || Boolean(preferredOp);
  if (!preferredIsEffective) {
    return {
      effectiveOps,
      count,
      visibility: "selector",
      selectedOperationId: preferred,
      blockGenerate: true,
      reasonCode: "operation_incompatible",
      reasonMessage: "\u5F53\u524D\u6A21\u578B\u4E0D\u652F\u6301\u5DF2\u4FDD\u5B58\u7684\u751F\u6210\u65B9\u5F0F\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9"
    };
  }
  if (!preferred && args.outputType === "video") {
    return {
      effectiveOps,
      count,
      visibility: "selector",
      blockGenerate: true,
      reasonCode: "operation_incompatible",
      reasonMessage: "\u8BF7\u9009\u62E9\u751F\u6210\u65B9\u5F0F"
    };
  }
  const mediaTypesInFeed = new Set(args.fingerprint.mediaAssets.map((a) => a.type));
  const absorbingOp = effectiveOps.find(
    (op) => op.slots.some((slot2) => mediaTypesInFeed.has(slot2.type))
  );
  const selected = preferredOp ?? (mediaTypesInFeed.size > 0 ? absorbingOp : void 0) ?? effectiveOps.find((op) => op.ready) ?? effectiveOps[0];
  const pending = selected.pending[0];
  return {
    effectiveOps,
    count,
    visibility: "selector",
    selectedOperationId: selected.id,
    blockGenerate: !selected.ready,
    ...pending ? { reasonCode: pending.code, reasonMessage: pending.message, reason: pending } : {}
  };
}

// src/shared/graph/feedSlot/resolveSlotOperation.ts
function resolveSlotOperation(catalog2, modelId, operation2, outputType, fingerprint) {
  const isTextTask = outputType === "text" || !outputType;
  if (isTextTask) {
    const view = buildContractView(catalog2);
    const model = resolveModelView(view, modelId);
    if (model) {
      const multimodal = model.operations.find(
        (op) => op.listed && op.output.type === "text" && op.inputs.some((input) => input.type !== "text" && input.role !== "prompt")
      );
      if (multimodal) return multimodal.id;
    }
  }
  if (typeof operation2 === "string" && operation2.trim()) return operation2.trim();
  const current = buildEffectiveOpsUiState({ catalog: catalog2, modelId, outputType, fingerprint });
  if (current.count > 0) return current.selectedOperationId;
  return buildEffectiveOpsUiState({
    catalog: catalog2,
    modelId,
    outputType,
    fingerprint: buildUpstreamFingerprint({
      ...fingerprint,
      assets: fingerprint.assets.filter((asset) => !isMediaInputType(asset.type))
    })
  }).selectedOperationId;
}

// src/shared/graph/feedSlot/slotLayoutTable.ts
var SLOT_LAYOUT_TABLE = Object.freeze({
  text_to_image: { preset: "strip", slots: ["reference_image", "reference"], addButton: true },
  image_to_image: { preset: "strip", slots: ["reference_image", "reference"], addButton: true },
  multi_reference: { preset: "strip", slots: ["reference_image", "reference"], addButton: true },
  text_to_video: { preset: "none" },
  first_frame: { preset: "named", slots: ["first_frame"] },
  end_frame: { preset: "named", slots: ["last_frame"] },
  first_last_frame: { preset: "pair", slots: ["first_frame", "last_frame"], swap: true },
  video_multi_ref: { preset: "strip", slots: ["reference"], addButton: true },
  digital_human: { preset: "named", slots: ["character", "driving_audio"] },
  text_to_speech: { preset: "strip", slots: ["reference_audio", "reference"], addButton: true },
  vision_chat: { preset: "strip", slots: ["reference_images", "reference_videos", "reference_audios", "reference_documents", "reference"], addButton: true }
});
var SLOT_NAME_ALIASES = Object.freeze({
  first_frame: ["start_frame"],
  last_frame: ["end_frame"],
  character: ["character_image", "portrait", "reference_image", "reference_images", "first_frame"],
  driving_audio: ["audio_track", "audio", "source_audio"],
  reference_image: ["reference", "references", "input_image", "input_images"],
  reference: ["reference_image", "references", "input_image", "input_images"],
  reference_audio: ["reference", "references", "input_audio", "audio_track", "audio"],
  reference_images: ["reference_image", "reference", "references", "input_images"],
  reference_videos: ["reference_video", "reference", "references", "input_videos"],
  reference_audios: ["reference_audio", "audio_track", "audio", "reference", "references"],
  reference_documents: ["reference_document", "document", "pdf", "reference", "references"]
});

// src/shared/graph/feedSlot/deriveSlotLayout.ts
function deriveSlotLayout(catalog2, modelId, operationId, _outputTypeOrOptions) {
  const layout = {
    operationId: operationId ?? "",
    preset: "none",
    slots: [],
    swap: false,
    addButton: false,
    implementationGaps: []
  };
  const model = resolveModelView(buildContractView(catalog2), modelId);
  const operation2 = model?.operations.find((op) => op.id === operationId && op.listed);
  if (!operation2) return { ...layout, acceptsText: false, implementationGaps: ["operation_unlisted"] };
  layout.acceptsText = operation2.inputs.some((input) => input.type === "text" || input.role === "prompt" || input.slot === "prompt") || operation2.promptPolicy != null && operation2.promptPolicy !== "forbidden" || operation2.output?.type === "video" || operation2.output?.type === "image";
  const inputs = bindableSlots(operation2).filter((input) => operation2.output.type !== "audio" || operation2.id !== "text_to_speech" || input.type === "text");
  const policy = SLOT_LAYOUT_TABLE[operation2.id];
  if (!policy && inputs.length) layout.implementationGaps.push("missing_layout");
  layout.preset = inputs.length ? policy?.preset === "none" ? "strip" : policy?.preset ?? "strip" : "none";
  if (layout.preset === "none") return layout;
  const ordered = [];
  for (const name of policy?.slots ?? []) {
    const matches = inputs.filter((input) => input.slot === name || SLOT_NAME_ALIASES[name]?.includes(input.slot) || input.role === name || name === "character" && input.type === "image" && input.role === "reference" || name === "driving_audio" && input.type === "audio" && input.role === "audio_track");
    if (!matches.length && inputs.length > 0 && policy?.preset !== "strip") layout.implementationGaps.push(`missing_slot:${name}`);
    for (const input of matches) if (!ordered.includes(input)) ordered.push(input);
  }
  for (const input of inputs) if (!ordered.includes(input)) ordered.push(input);
  layout.slots = ordered.map((input) => ({
    slot: input.slot,
    role: input.role,
    type: input.type,
    min: input.min,
    max: input.max,
    labelKey: `panel.slot.${input.slot}`,
    maxSizeMb: input.maxSizeMb,
    maxSizeExclusive: input.maxSizeExclusive,
    minDurationSec: input.minDurationSec,
    maxDurationSec: input.maxDurationSec,
    ...input.valueSources ? { valueSources: [...input.valueSources] } : {},
    ...input.composition ? { composition: { ...input.composition } } : {},
    ...input.allowedMimes ? { allowedMimes: [...input.allowedMimes] } : {}
  }));
  layout.swap = policy?.swap === true && layout.slots.length === 2 && layout.slots.every((slot2) => slot2.type === "image" && slot2.max === 1);
  layout.addButton = layout.preset === "strip" && layout.slots.some((slot2) => slot2.max == null || slot2.max > 0);
  return layout;
}

// src/shared/graph/feedSlot/autoFillSlots.ts
function acceptsFeedAsset(slot2, asset) {
  if (slot2.type !== asset.type || asset.mimeType && slot2.allowedMimes?.length && !slot2.allowedMimes.includes(asset.mimeType)) return false;
  if (Number.isFinite(slot2.maxSizeMb) && Number.isFinite(asset.sizeBytes) && (slot2.maxSizeExclusive ? asset.sizeBytes >= slot2.maxSizeMb * 1024 * 1024 : asset.sizeBytes > slot2.maxSizeMb * 1024 * 1024)) return false;
  if (Number.isFinite(asset.durationSec) && (Number.isFinite(slot2.minDurationSec) && asset.durationSec < slot2.minDurationSec || Number.isFinite(slot2.maxDurationSec) && asset.durationSec > slot2.maxDurationSec)) return false;
  return true;
}
function isReadyFeedAsset(asset) {
  if (asset?.type === "text") return asset.availability === "ready" && Boolean(asset.textContent?.trim());
  const path = asset?.pathOrUrl ?? asset?.url;
  return asset?.availability === "ready" && Boolean(path?.trim()) && !path.trim().startsWith("blob:");
}
function autoFillSlots(feedAssets, layout, explicit = {}, standbyEdgeIds = []) {
  const feed = [...feedAssets].sort((a, b) => a.ordinal - b.ordinal);
  const byEdge = new Map(feed.map((asset) => [asset.edgeId, asset]));
  const slots = layout.preset === "none" ? [] : layout.slots;
  const bindings = Object.fromEntries(slots.map((slot2) => [slot2.slot, []]));
  const conflicts = [];
  const reserved = new Set(standbyEdgeIds);
  const used = /* @__PURE__ */ new Set();
  const usedInputs = /* @__PURE__ */ new Set();
  const usedRoles = /* @__PURE__ */ new Set();
  const identity = (asset) => JSON.stringify([asset.sourceNodeId, asset.outputId ?? ""]);
  const roleIdentity = (asset, slot2) => JSON.stringify([identity(asset), slot2.role]);
  for (const pinned of [true, false]) {
    for (const [name, occupants] of Object.entries(explicit)) {
      const slot2 = slots.find((candidate) => candidate.slot === name);
      for (const occupant of occupants) {
        if (occupant.pinned !== pinned) continue;
        const asset = byEdge.get(occupant.edgeId);
        if (!asset || asset.sourceNodeId !== occupant.sourceNodeId) {
          if (pinned && slot2) bindings[name].push({ ...occupant });
          else if (pinned) conflicts.push({ slot: name, occupant: { ...occupant }, reason: "slot_removed" });
          continue;
        }
        if (!pinned && !isReadyFeedAsset(asset)) continue;
        const next = { ...occupant, outputId: asset.outputId };
        const reason = !slot2 ? "slot_removed" : slot2.type !== asset.type ? "type_mismatch" : !acceptsFeedAsset(slot2, asset) ? "role_illegal" : void 0;
        if (!reason && slot2 && (usedRoles.has(roleIdentity(asset, slot2)) || !pinned && used.has(asset.edgeId))) continue;
        const full = slot2 && bindings[name].length >= (slot2.max ?? Infinity);
        if (reason || full) {
          if (pinned) {
            conflicts.push({ slot: name, occupant: next, reason: reason ?? "role_illegal" });
            reserved.add(asset.edgeId);
          }
          continue;
        }
        bindings[name].push(next);
        used.add(asset.edgeId);
        usedInputs.add(identity(asset));
        usedRoles.add(roleIdentity(asset, slot2));
      }
    }
  }
  for (const slot2 of slots) {
    if (conflicts.some((conflict) => conflict.slot === slot2.slot) || bindings[slot2.slot].some((occupant) => occupant.pinned && !isReadyFeedAsset(byEdge.get(occupant.edgeId)))) continue;
    for (const asset of feed) {
      if (bindings[slot2.slot].length >= (slot2.max ?? Infinity)) break;
      if (!isReadyFeedAsset(asset) || used.has(asset.edgeId) || usedInputs.has(identity(asset)) || reserved.has(asset.edgeId) || !acceptsFeedAsset(slot2, asset)) continue;
      if (slot2.role === "mask" || slot2.role === "controlnet") continue;
      bindings[slot2.slot].push({
        sourceNodeId: asset.sourceNodeId,
        edgeId: asset.edgeId,
        outputId: asset.outputId,
        pinned: false
      });
      used.add(asset.edgeId);
      usedInputs.add(identity(asset));
      usedRoles.add(roleIdentity(asset, slot2));
    }
  }
  return { bindings, conflicts, unusedFeed: feed.filter((asset) => !used.has(asset.edgeId)).map((asset) => ({ ...asset })) };
}

// src/shared/graph/feedSlot/assembleEffectiveInputs.ts
function selectSlotOccupants(layout, bindings, feedAssets, conflicts = [], inputBindingVersion) {
  const byEdge = new Map(feedAssets.map((asset) => [asset.edgeId, asset]));
  const seenRoles = /* @__PURE__ */ new Set();
  const counts = /* @__PURE__ */ new Map();
  const records = [];
  for (const [name, occupants] of Object.entries(bindings)) {
    const spec = layout.slots.find((slot2) => slot2.slot === name);
    const seen = /* @__PURE__ */ new Set();
    for (const occupant of occupants) {
      if (inputBindingVersion !== 1 && seen.has(occupant.edgeId)) continue;
      seen.add(occupant.edgeId);
      const candidate = byEdge.get(occupant.edgeId);
      const asset = candidate?.sourceNodeId === occupant.sourceNodeId ? candidate : void 0;
      const slot2 = spec ?? { slot: name, role: occupant.role ?? "", type: asset?.type ?? "", min: 0, max: null, labelKey: "" };
      let state = "ready";
      let reasonCode;
      if (occupant.use === "inactive") state = "inactive";
      else if (!spec) {
        state = "invalid";
        reasonCode = "slot_removed";
      } else if (occupant.role !== void 0 && occupant.role !== spec.role || inputBindingVersion === 1 && occupants.filter((item) => item.edgeId === occupant.edgeId).length > 1 || conflicts.some((item) => item.slot === name && item.occupant.edgeId === occupant.edgeId) || asset && !acceptsFeedAsset(spec, asset)) {
        state = "invalid";
        reasonCode = "role_conflict";
      } else if (asset?.availability === "waiting") {
        state = "pending";
        reasonCode = "input_waiting";
      } else if (!isReadyFeedAsset(asset)) {
        state = "invalid";
        reasonCode = "input_unavailable";
      }
      if (state === "ready" || state === "pending") {
        const identity = JSON.stringify([occupant.sourceNodeId, asset?.outputId ?? occupant.outputId ?? "", slot2.role]);
        if (seenRoles.has(identity)) {
          if (inputBindingVersion !== 1) continue;
          state = "invalid";
          reasonCode = "role_conflict";
        } else seenRoles.add(identity);
        const count = (counts.get(name) ?? 0) + 1;
        counts.set(name, count);
        if (!slot2.composition && count > (slot2.max ?? Infinity)) {
          state = "invalid";
          reasonCode = "slot_capacity";
        }
      }
      if (inputBindingVersion !== 1 && state !== "ready") continue;
      records.push({ slot: slot2, occupant: {
        ...occupant,
        ...inputBindingVersion === 1 && asset?.outputId ? { outputId: asset.outputId } : {}
      }, ...asset ? { asset: { ...asset } } : {}, state, ...reasonCode ? { reasonCode } : {} });
    }
  }
  return records.sort((a, b) => (a.occupant.ordinal ?? a.asset?.ordinal ?? 0) - (b.occupant.ordinal ?? b.asset?.ordinal ?? 0));
}
function assembleEffectiveInputsFromSlots(args) {
  const result = {
    prompt: args.layout.acceptsText === false ? "" : resolveGenerationPrompt(args.nodeData, args.incomingText),
    references: [],
    unusedFeedEdgeIds: [],
    emptyRequiredSlots: [],
    blockedInputs: []
  };
  const records = selectSlotOccupants(args.layout, args.bindings, args.feedAssets, args.conflicts, args.nodeData.inputBindingVersion);
  const selections = records.filter((record) => record.state === "ready");
  result.blockedInputs = records.filter((record) => record.state === "pending" || record.state === "invalid").map((record) => ({
    slot: record.slot.slot,
    edgeId: record.occupant.edgeId,
    sourceNodeId: record.occupant.sourceNodeId,
    reason: record.reasonCode ?? "input_unavailable"
  }));
  const textSelections = selections.filter((item) => item.slot.type === "text").sort((a, b) => (a.occupant.ordinal ?? a.asset?.ordinal ?? 0) - (b.occupant.ordinal ?? b.asset?.ordinal ?? 0));
  const textSlot = args.layout.slots.find((slot2) => slot2.type === "text" && slot2.composition);
  const composition = textSlot?.composition;
  if (args.nodeData.inputBindingVersion === 1) {
    const local = textSlot && !textSlot.valueSources?.includes("local_field") ? {} : args.nodeData;
    const boundEdgeIds = new Set(selections.map((item) => item.occupant.edgeId));
    const freeTexts = !textSlot && args.layout.acceptsText !== false ? args.feedAssets.filter((asset) => asset.type === "text" && asset.availability === "ready" && asset.textContent?.trim() && !boundEdgeIds.has(asset.edgeId)) : [];
    result.prompt = args.layout.acceptsText === false ? "" : resolveGenerationPrompt(
      local,
      [...textSelections.map((item) => item.asset?.textContent), ...freeTexts.map((asset) => asset.textContent)],
      composition
    );
  }
  const counts = /* @__PURE__ */ new Map();
  const used = new Set(selections.map((item) => item.occupant.edgeId));
  for (const { slot: slot2, occupant, asset } of selections) {
    if (slot2.type === "text") {
      counts.set(slot2.slot, slot2.composition ? Number(Boolean(result.prompt.trim())) : (counts.get(slot2.slot) ?? 0) + 1);
      continue;
    }
    const count = (counts.get(slot2.slot) ?? 0) + 1;
    counts.set(slot2.slot, count);
    const path = asset?.pathOrUrl ?? asset?.url;
    const valid = asset && acceptsFeedAsset(slot2, asset) && count <= (slot2.max ?? Infinity);
    if (!valid || asset.availability !== "ready" || !path?.trim() || !isMediaInputType(asset.type)) {
      result.blockedInputs.push({
        slot: slot2.slot,
        edgeId: occupant.edgeId,
        sourceNodeId: occupant.sourceNodeId,
        reason: valid && asset.availability === "waiting" ? "input_waiting" : "input_unavailable"
      });
      continue;
    }
    const payload = {
      type: asset.type,
      role: slot2.role,
      pathOrUrl: path,
      targetSlot: slot2.slot,
      sourceNodeId: asset.sourceNodeId,
      edgeId: asset.edgeId,
      ...asset.mimeType ? { mimeType: asset.mimeType } : {},
      ...asset.sizeBytes !== void 0 ? { sizeBytes: asset.sizeBytes } : {},
      ...asset.durationSec !== void 0 ? { durationSec: asset.durationSec } : {}
    };
    if (asset.type === "audio" && slot2.role === "audio_track" && !result.audioTrack) result.audioTrack = payload;
    else result.references.push(payload);
  }
  for (const slot2 of args.layout.slots) {
    if (slot2.type === "text" && slot2.composition && slot2.valueSources?.includes("local_field")) {
      counts.set(slot2.slot, Number(Boolean(result.prompt.trim())));
    }
  }
  result.emptyRequiredSlots = args.layout.slots.filter((slot2) => (counts.get(slot2.slot) ?? 0) < slot2.min).map((slot2) => slot2.slot);
  result.unusedFeedEdgeIds = args.feedAssets.filter((asset) => !used.has(asset.edgeId)).map((asset) => asset.edgeId);
  return result;
}

// src/shared/graph/feedSlot/hydrateSlotBindings.ts
function hydrateSlotBindings(feedAssets, layout, edges = []) {
  const explicit = {};
  for (const asset of feedAssets) {
    const edge = edges.find((candidate) => candidate.id === asset.edgeId);
    const data = edge?.data ?? {};
    const slotName = readExplicitTargetSlot(data, edge?.targetHandle) ?? asset.targetSlot;
    const role = typeof data.role === "string" ? data.role : asset.role;
    const slot2 = slotName ? layout.slots.find((item) => item.slot === slotName) : role ? layout.slots.find((item) => item.role === role && item.type === asset.type) : void 0;
    if (slotName || role) {
      const key = slot2?.slot ?? slotName ?? `role:${role}`;
      (explicit[key] ??= []).push({
        sourceNodeId: asset.sourceNodeId,
        edgeId: asset.edgeId,
        outputId: asset.outputId,
        pinned: !slot2 || !acceptsFeedAsset(slot2, asset)
      });
    }
  }
  return autoFillSlots(feedAssets, layout, explicit);
}

// src/shared/graph/feedSlot/slotBindingConflicts.ts
function slotBindingConflicts(layout, bindings, feed) {
  const conflicts = [];
  const assets = new Map(feed.map((asset) => [asset.edgeId, asset]));
  for (const [name, occupants] of Object.entries(bindings)) {
    const slot2 = layout.slots.find((item) => item.slot === name);
    for (const occupant of occupants) {
      const asset = assets.get(occupant.edgeId);
      const reason = !slot2 ? "slot_removed" : asset && slot2.type !== asset.type ? "type_mismatch" : asset && !acceptsFeedAsset(slot2, asset) ? "role_illegal" : void 0;
      if (reason) conflicts.push({ slot: name, occupant: { ...occupant }, reason });
    }
  }
  return conflicts;
}

// src/shared/graph/feedSlot/effectiveFingerprint.ts
function feedFromFingerprint(fingerprint, inputBindingVersion) {
  return fingerprint.assets.flatMap((asset, ordinal) => isMediaInputType(asset.type) || inputBindingVersion === 1 && asset.type === "text" ? [{
    ...asset,
    edgeId: asset.edgeId ?? `feed-${asset.sourceNodeId}-${ordinal}`,
    ordinal,
    availability: asset.availability ?? "ready"
  }] : []);
}
function effectiveSlotFingerprint(fingerprint, layout, bindings, conflicts = [], inputBindingVersion, standbyEdgeIds = []) {
  const records = selectSlotOccupants(layout, bindings, feedFromFingerprint(fingerprint, inputBindingVersion), conflicts, inputBindingVersion);
  const selected = records.filter((record) => record.state !== "inactive");
  const media = selected.map(({ slot: slot2, occupant, asset, state }) => ({
    ...asset,
    edgeId: occupant.edgeId,
    sourceNodeId: occupant.sourceNodeId,
    type: slot2.type,
    role: slot2.role,
    targetSlot: slot2.slot,
    availability: state === "invalid" ? "unavailable" : state === "pending" ? "waiting" : asset?.availability ?? "unavailable",
    ...asset && asset.type !== slot2.type ? { availability: "unavailable" } : {}
  }));
  if (inputBindingVersion === 1) {
    const boundTextOccupants = selected.filter((item) => item.state === "ready" && item.slot.type === "text").sort((a, b) => (a.occupant.ordinal ?? a.asset?.ordinal ?? 0) - (b.occupant.ordinal ?? b.asset?.ordinal ?? 0));
    const boundTexts = boundTextOccupants.map((item) => item.asset?.textContent);
    const textSlot = layout.slots.find((slot2) => slot2.type === "text" && slot2.composition);
    const standbySet = new Set(standbyEdgeIds);
    const freeTextAssets = !textSlot && layout.acceptsText !== false ? selectGenerationTextSources(fingerprint.assets).filter((asset) => !selected.some((sel) => sel.asset?.edgeId === asset.edgeId) && (!asset.edgeId || !standbySet.has(asset.edgeId))) : [];
    const freeTexts = freeTextAssets.map((asset) => asset.textContent);
    const allTexts = [...boundTexts, ...freeTexts].filter((t) => typeof t === "string" && Boolean(t.trim()));
    const localText = textSlot && !textSlot.valueSources?.includes("local_field") ? "" : fingerprint.localText ?? "";
    return buildUpstreamFingerprint({
      ...fingerprint,
      localText,
      prompt: layout.acceptsText === false ? "" : resolveGenerationPrompt({ prompt: localText }, allTexts, textSlot?.composition),
      assets: [...freeTextAssets, ...media]
    });
  }
  return buildUpstreamFingerprint({
    ...fingerprint,
    prompt: layout.acceptsText === false ? "" : fingerprint.prompt,
    assets: [...layout.acceptsText === false ? [] : selectGenerationTextSources(fingerprint.assets), ...media]
  });
}

// src/workflow/execution/executionMediaSource.ts
var import_node_fs2 = require("node:fs");
var import_node_path2 = require("node:path");

// src/shared/api.ts
var WORKFLOW_ROUTE_PREFIX = "/omnimux-workflow";
var WORKFLOW_API_ROUTES = {
  /** GET/PATCH: profile-wide last manual model choices. */
  generationPreferences: `${WORKFLOW_ROUTE_PREFIX}/api/generation-preferences`,
  /** GET: build manifest (canvas.js hash for cache busting). */
  manifest: `${WORKFLOW_ROUTE_PREFIX}/api/manifest`,
  /** GET: island bundle (lazy-loaded by CanvasBridge). */
  canvasJs: `${WORKFLOW_ROUTE_PREFIX}/canvas.js`,
  /** GET: workspace summaries. POST: create workspace. */
  workspaces: `${WORKFLOW_ROUTE_PREFIX}/api/workspaces`,
  /** GET/PUT/DELETE one workspace snapshot (PUT uses optimistic lock). */
  workspace: (id) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}`,
  /** GET/PUT/DELETE one tabular document (.htable) within a workspace. */
  workspaceTable: (workspaceId, tableId) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/tables/${tableId}`,
  /** GET: lightweight { id, version } — external-edit polling (PR3). */
  workspaceVersion: (id) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/version`,
  /** GET/PUT: project-private assets.json (independent rev, never canvas.version). */
  workspaceAssets: (id) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/assets`,
  /** POST: create a logical folder record in assets.json. */
  workspaceAssetsMkdir: (id) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/assets/mkdir`,
  /** POST: copy source files into `<ProjectRoot>/assets/imported/`. */
  workspaceAssetsIngest: (id) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/assets/ingest`,
  /** POST application/octet-stream: bounded external audio bytes, never a URL. */
  workspaceAudioBytes: (id) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/assets/audio-bytes`,
  /** POST: deprecated alias of ingest (physical copy, not a path index). */
  workspaceAssetsIndex: (id) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/assets/index`,
  /** POST: copy a global library subject into `<ProjectRoot>/assets/subjects/<id>/`. */
  workspaceAssetsInstantiate: (id) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/assets/instantiate`,
  /** POST: copy a project file into the global library (explicit promote). */
  workspaceAssetsPromote: (id) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/assets/promote`,
  /** GET: stream a project-relative file (Range 206). */
  workspaceFile: (id, rel) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${id}/file?rel=${encodeURIComponent(rel)}`,
  /** GET: alias of workspaceFile (`?workspace=&rel=`). */
  projectFile: `${WORKFLOW_ROUTE_PREFIX}/api/project-file`,
  /** GET: generation capability catalog (M3/M4 fills real data). */
  capabilities: `${WORKFLOW_ROUTE_PREFIX}/api/capabilities`,
  /** GET: media files under the plugin-owned media dir (traversal-guarded). */
  media: `${WORKFLOW_ROUTE_PREFIX}/media`,
  /** POST: native file/folder picker → absolute paths (no copy). */
  pick: `${WORKFLOW_ROUTE_PREFIX}/api/pick`,
  /**
   * ComfyUI 托管后端（Issue #3690 M2a 路由 / #3701 M2c 界面）：
   * state 读状态机，install/start/stop 是动作，log 读安装日志尾部。
   */
  comfyBackendState: `${WORKFLOW_ROUTE_PREFIX}/api/comfy-backend/state`,
  comfyBackendInstall: `${WORKFLOW_ROUTE_PREFIX}/api/comfy-backend/install`,
  comfyBackendStart: `${WORKFLOW_ROUTE_PREFIX}/api/comfy-backend/start`,
  comfyBackendStop: `${WORKFLOW_ROUTE_PREFIX}/api/comfy-backend/stop`,
  comfyBackendLog: (lines) => `${WORKFLOW_ROUTE_PREFIX}/api/comfy-backend/log?lines=${lines}`,
  /** GET/POST: 托管后端设置（安装根、已有模型目录）。 */
  comfyBackendSettings: `${WORKFLOW_ROUTE_PREFIX}/api/comfy-backend/settings`,
  /** POST: list one layer of local directories for in-dialog browse. */
  browseDirectory: `${WORKFLOW_ROUTE_PREFIX}/api/browse-directory`,
  /** GET: stream an imported local file by realPath (Range 206). */
  localFile: `${WORKFLOW_ROUTE_PREFIX}/api/local-file`,
  /** POST: batch exists/size probe for imported realPath values. */
  localFileProbe: `${WORKFLOW_ROUTE_PREFIX}/api/local-file/probe`,
  /** GET: execution summaries. POST: create execution {mode, nodeIds?}. */
  executions: (workspaceId) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/executions`,
  /** GET: one execution status snapshot. */
  execution: (workspaceId, executionId) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/executions/${executionId}`,
  /** POST: pause | resume | cancel. */
  executionAction: (workspaceId, executionId, action) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/executions/${executionId}/${action}`,
  /** GET: execution SSE event stream (text/event-stream). */
  executionEvents: (workspaceId, executionId) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/executions/${executionId}/events`,
  /** POST: speech-to-text transcription (Issue 744; default model whisper-1, default format srt). */
  speechToText: (workspaceId) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/speech-to-text`,
  /** POST: extract video from social media URL and download to local media. */
  extractVideo: (workspaceId) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/extract-video`,
  /** POST: deconstruct video into structured table document (.htable). */
  deconstructVideo: (workspaceId) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/deconstruct-video`,
  /** POST: generate video storyboard table with keyframe image attachments and scripts. */
  storyboardVideo: (workspaceId) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/storyboard-video`,
  /** POST: extract audio track from video and generate material audio node. */
  extractAudio: (workspaceId) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/extract-audio`,
  /** POST: convert a video into a grayscale depth-map video (local Depth Anything). */
  videoDepth: (workspaceId) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/video-depth`,
  /** GET: list templates. POST: create template. */
  templates: `${WORKFLOW_ROUTE_PREFIX}/api/templates`,
  /** GET/DELETE one template. */
  template: (id) => `${WORKFLOW_ROUTE_PREFIX}/api/templates/${id}`,
  /** GET/POST: project pages associated with a canvas workspace. */
  workspaceProjectPages: (workspaceId) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/project-pages`,
  /** PATCH/DELETE: one project page associated with a canvas workspace. */
  workspaceProjectPageItem: (workspaceId, pageId) => `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${workspaceId}/project-pages/${pageId}`
};

// src/shared/localMedia.ts
var MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
  heic: "image/heic",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  m4v: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  ogg: "audio/ogg",
  opus: "audio/opus"
};
var SNIFF_HEAD_BYTES = 512;
function bytesEq(buf, offset, signature) {
  if (buf.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (buf[offset + i] !== signature[i]) return false;
  }
  return true;
}
function asciiEq(buf, offset, text) {
  if (buf.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (buf[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}
function latin1Head(buf, maxBytes = SNIFF_HEAD_BYTES) {
  const n = Math.min(buf.length, maxBytes);
  if (typeof TextDecoder === "function") {
    return new TextDecoder("latin1").decode(buf.subarray(0, n));
  }
  let out = "";
  for (let i = 0; i < n; i += 1) {
    out += String.fromCharCode(buf[i] ?? 0);
  }
  return out;
}
function sniffMimeType(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (bytes.length === 0) return void 0;
  if (bytesEq(bytes, 0, [137, 80, 78, 71])) return "image/png";
  if (bytesEq(bytes, 0, [255, 216, 255])) return "image/jpeg";
  if (asciiEq(bytes, 0, "GIF8")) return "image/gif";
  if (asciiEq(bytes, 0, "RIFF") && asciiEq(bytes, 8, "WEBP")) return "image/webp";
  if (asciiEq(bytes, 0, "RIFF") && asciiEq(bytes, 8, "WAVE")) return "audio/wav";
  if (asciiEq(bytes, 4, "ftyp")) return "video/mp4";
  if (bytesEq(bytes, 0, [26, 69, 223, 163])) return "video/webm";
  if (asciiEq(bytes, 0, "ID3")) return "audio/mpeg";
  if (bytes.length >= 2 && bytes[0] === 255 && ((bytes[1] ?? 0) & 224) === 224) {
    return "audio/mpeg";
  }
  const head = latin1Head(bytes, SNIFF_HEAD_BYTES).toLowerCase();
  if (head.includes("<svg") || head.includes("<?xml")) return "image/svg+xml";
  return void 0;
}
function nodeFsSync() {
  try {
    const proc = globalThis.process;
    const fs = proc?.getBuiltinModule?.("node:fs");
    if (!fs?.openSync || !fs.readSync || !fs.closeSync) return void 0;
    return fs;
  } catch {
    return void 0;
  }
}
function readFileHead(filePath, maxBytes = SNIFF_HEAD_BYTES) {
  const fs = nodeFsSync();
  if (!fs) return void 0;
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = new Uint8Array(maxBytes);
    const n = fs.readSync(fd, buf, 0, maxBytes, 0);
    if (n <= 0) return new Uint8Array();
    return n === maxBytes ? buf : buf.subarray(0, n);
  } catch {
    return void 0;
  } finally {
    if (fd !== void 0) {
      try {
        fs.closeSync(fd);
      } catch {
      }
    }
  }
}
function detectMimeFromFile(filePath, fallbackMime = "application/octet-stream") {
  const head = readFileHead(filePath, SNIFF_HEAD_BYTES);
  if (head && head.length > 0) {
    const sniffed = sniffMimeType(head);
    if (sniffed) return sniffed;
  }
  return mimeFromFilename(filePath) ?? MIME_BY_EXT[extensionOf(filePath)] ?? fallbackMime;
}
function extensionOf(filename) {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}
function mimeFromFilename(filename) {
  return MIME_BY_EXT[extensionOf(filename)];
}
function localFileMediaUrl(realPath) {
  return `${WORKFLOW_ROUTE_PREFIX}/api/local-file?path=${encodeURIComponent(realPath)}`;
}
function projectFileMediaUrl(workspaceId, relativePath) {
  return `${WORKFLOW_ROUTE_PREFIX}/api/workspaces/${encodeURIComponent(workspaceId)}/file?rel=${encodeURIComponent(relativePath)}`;
}
function localFilePathFromUrl(url) {
  if (typeof url !== "string" || url.length === 0) return null;
  try {
    const parsed = new URL(url, "http://127.0.0.1");
    if (!parsed.pathname.endsWith("/api/local-file")) return null;
    const path = parsed.searchParams.get("path");
    return path && path.length > 0 ? path : null;
  } catch {
    return null;
  }
}
function looksAbsolutePath(path) {
  if (!path || path.includes("\0")) return false;
  if (path.startsWith("/")) return true;
  return /^[a-zA-Z]:[\\/]/.test(path);
}

// src/workflow/workspace/WorkflowStoreError.ts
var WorkflowStoreError = class extends Error {
  code;
  /**
   * Server-side current version/rev carried by version_conflict errors, so the
   * HTTP layer can surface it in the 409 body without parsing the message.
   */
  current;
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.current = details.current;
    this.name = "WorkflowStoreError";
  }
};

// src/workflow/execution/executionMediaSource.ts
function requireFile(path) {
  try {
    if ((0, import_node_path2.isAbsolute)(path) && (0, import_node_fs2.statSync)(path).isFile()) return path;
  } catch {
  }
  throw new WorkflowStoreError("not-found", "\u8F93\u5165\u7D20\u6750\u6587\u4EF6\u4E0D\u53EF\u7528\uFF0C\u8BF7\u66FF\u6362\u7D20\u6750\u6216\u79FB\u9664\u5F15\u7528");
}
function resolveExecutionMediaSource(asset, options) {
  const projectFile = (relativePath) => {
    if (!options.workspaceId || !options.resolveProjectFile) {
      throw new WorkflowStoreError("project-required", "\u8F93\u5165\u7D20\u6750\u9700\u8981\u53EF\u7528\u7684\u9879\u76EE\u6587\u4EF6\uFF0C\u8BF7\u91CD\u65B0\u7ED1\u5B9A\u9879\u76EE");
    }
    return options.resolveProjectFile(options.workspaceId, relativePath);
  };
  if (asset.relativePath?.trim()) return projectFile(asset.relativePath.trim());
  const url = asset.url?.trim() ?? "";
  if (url.startsWith("/omnimux-workflow/api/workspaces/")) {
    const parsed = new URL(url, "http://localhost");
    const match = /^\/omnimux-workflow\/api\/workspaces\/([^/]+)\/file$/.exec(parsed.pathname);
    if (!match || decodeURIComponent(match[1]) !== options.workspaceId) {
      throw new WorkflowStoreError("path-denied", "\u8F93\u5165\u7D20\u6750\u4E0D\u5C5E\u4E8E\u5F53\u524D\u9879\u76EE\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u7D20\u6750");
    }
    return projectFile(parsed.searchParams.get("rel") ?? "");
  }
  if (asset.path?.trim()) return requireFile(asset.path.trim());
  if (/^https?:\/\//i.test(url) || /^data:(image|video|audio)\/[^,]+,.+/s.test(url)) return url;
  const localPath = localFilePathFromUrl(url);
  if (localPath) return requireFile(localPath);
  const mediaPrefix = ["/omnimux-workflow/media/", "/media/"].find((prefix) => url.startsWith(prefix));
  if (mediaPrefix) {
    const root = (0, import_node_path2.resolve)(options.mediaDir);
    const path = (0, import_node_path2.resolve)(root, decodeURIComponent(url.slice(mediaPrefix.length)));
    if (!path.startsWith(root + import_node_path2.sep)) {
      throw new WorkflowStoreError("path-denied", "\u8F93\u5165\u7D20\u6750\u8DEF\u5F84\u8D85\u51FA\u5A92\u4F53\u76EE\u5F55");
    }
    const file = requireFile(path);
    if (!(0, import_node_fs2.realpathSync)(file).startsWith((0, import_node_fs2.realpathSync)(root) + import_node_path2.sep)) {
      throw new WorkflowStoreError("path-denied", "\u8F93\u5165\u7D20\u6750\u8DEF\u5F84\u8D85\u51FA\u5A92\u4F53\u76EE\u5F55");
    }
    return file;
  }
  throw new WorkflowStoreError("invalid-path", "\u8F93\u5165\u7D20\u6750\u65E0\u6CD5\u89E3\u6790\uFF0C\u8BF7\u66FF\u6362\u7D20\u6750\u6216\u79FB\u9664\u5F15\u7528");
}

// src/workflow/seam/SeamGatewayError.ts
var SeamGatewayError = class extends Error {
  code;
  constructor(code, message) {
    super(`[omnimux:${code}] ${message}`);
    this.name = "SeamGatewayError";
    this.code = code;
  }
};

// src/shared/graph/feedSlot/effectiveInputDisplay.ts
var UNUSED_MEDIA_TYPES = /* @__PURE__ */ new Set(["image", "video", "audio"]);
function effectiveInputDisplay(layout, feed, saved, savedConflicts = [], edges = [], standby = [], inputBindingVersion) {
  const explicit = saved && Object.fromEntries(Object.entries(saved).map(([key, values]) => [key, values.map((value) => ({ ...value }))]));
  for (const conflict of savedConflicts) {
    if (!explicit) break;
    const values = explicit[conflict.slot] ??= [];
    if (!values.some((value) => value.edgeId === conflict.occupant.edgeId)) values.push(conflict.occupant);
  }
  const fill = inputBindingVersion === 1 ? explicit === void 0 ? autoFillSlots(feed, layout, {}, standby) : { bindings: explicit, conflicts: [] } : explicit === void 0 ? hydrateSlotBindings(feed, layout, edges) : Object.keys(explicit).length > 0 ? autoFillSlots(feed, layout, explicit, standby) : { bindings: explicit, conflicts: [] };
  const bindings = fill.bindings;
  for (const conflict of fill.conflicts) {
    const values = bindings[conflict.slot] ??= [];
    if (!values.some((value) => value.edgeId === conflict.occupant.edgeId)) values.push(conflict.occupant);
  }
  const conflicts = [...savedConflicts, ...fill.conflicts, ...slotBindingConflicts(layout, bindings, feed)].filter((item, index, all) => all.findIndex((other) => other.slot === item.slot && other.occupant.edgeId === item.occupant.edgeId) === index);
  const records = selectSlotOccupants(layout, bindings, feed, conflicts, inputBindingVersion);
  const selected = records.filter((record) => record.state === "ready");
  const visibleBindings = {};
  for (const { slot: slot2, occupant } of selected) (visibleBindings[slot2.slot] ??= []).push(occupant);
  const unloaded = Object.entries(bindings).flatMap(([slot2, values]) => values.filter((value) => value.pinned && value.use !== "inactive" && !isReadyFeedAsset(feed.find((asset) => asset.edgeId === value.edgeId))).map((occupant) => ({ slot: slot2, occupant })));
  const consumedEdges = /* @__PURE__ */ new Set();
  for (const values of Object.values(bindings)) for (const occupant of values) consumedEdges.add(occupant.edgeId);
  const standbyEdges = new Set(standby);
  const unused = feed.filter((asset) => UNUSED_MEDIA_TYPES.has(asset.type) && asset.availability === "ready" && !consumedEdges.has(asset.edgeId) && !standbyEdges.has(asset.edgeId)).map((asset) => {
    const accepting = layout.slots.filter((spec) => acceptsFeedAsset(spec, asset));
    const occupied = (slot2) => (bindings[slot2] ?? []).filter((occupant) => occupant.use !== "inactive").length;
    const reasonCode = !isReadyFeedAsset(asset) ? "input_unavailable" : accepting.length === 0 ? "no_matching_slot" : accepting.every((spec) => occupied(spec.slot) >= (spec.max ?? Infinity)) ? "slot_capacity" : "not_bound";
    return {
      occupant: { sourceNodeId: asset.sourceNodeId, edgeId: asset.edgeId, outputId: asset.outputId, pinned: false, ordinal: asset.ordinal },
      asset: { ...asset },
      reasonCode
    };
  });
  const currentInvalid = inputBindingVersion === 1 ? records.filter((record) => record.state === "pending" || record.state === "invalid").map((record) => ({ slot: record.slot.slot, occupant: record.occupant, reasonCode: record.reasonCode })) : [];
  const requiredUnavailable = inputBindingVersion === 1 ? currentInvalid[0] : [...unloaded, ...conflicts].find(({ slot: slot2 }) => {
    const spec = layout.slots.find((item) => item.slot === slot2);
    return spec && (visibleBindings[slot2]?.length ?? 0) < spec.min;
  });
  return { bindings, visibleBindings, conflicts, records, selected, unloaded, unused, requiredUnavailable };
}

// src/workflow/execution/materialSlotInputs.ts
function collectMaterialSlotInputs(data, ctx, catalog2, resolveProjectFile) {
  const params = data.params ?? {};
  const kind = data.materialType ?? "text";
  const modelId = typeof params.model === "string" ? params.model : catalog2.defaults?.[kind];
  const model = resolveModelView(buildContractView(catalog2), modelId);
  let operationId = typeof params.operation === "string" ? params.operation : void 0;
  let layout = deriveSlotLayout(catalog2, model?.id, operationId);
  const currentVersion = data.inputBindingVersion === 1;
  const boundOccupants = Object.entries(data.slotBindings ?? {}).flatMap(([targetSlot, occupants]) => occupants.filter((occupant) => occupant.use !== "inactive").map((occupant) => ({
    edgeId: occupant.edgeId,
    sourceNodeId: occupant.sourceNodeId,
    targetSlot,
    role: occupant.role,
    output: ctx.upstreamBindings !== void 0 ? ctx.upstreamBindings.find((binding) => binding.edgeId === occupant.edgeId && binding.sourceNodeId === occupant.sourceNodeId)?.output ?? {} : ctx.upstreamOutputs.get(occupant.sourceNodeId) ?? {}
  })));
  const ordered = currentVersion ? [
    ...boundOccupants,
    // Free-text contract: unbound connected edges (not in slotBindings, not
    // standby) stay in feed so assemble picks them up as freeTextAssets.
    ...(ctx.upstreamBindings ?? []).filter((binding) => !boundOccupants.some((item) => item.edgeId === binding.edgeId && item.sourceNodeId === binding.sourceNodeId))
  ] : ctx.upstreamBindings ?? [...ctx.upstreamOutputs].map(([sourceNodeId, output]) => ({ sourceNodeId, output }));
  const texts = [];
  const seenText = /* @__PURE__ */ new Set();
  const feed = [];
  const mediaByEdge = /* @__PURE__ */ new Map();
  const saved = data.slotBindings;
  for (const [ordinal, binding] of ordered.entries()) {
    const output = binding.output;
    const edgeId = binding.edgeId ?? `feed-${binding.sourceNodeId}-${ordinal}`;
    const savedSlot = layout.slots.find((slot2) => saved?.[slot2.slot]?.some((item) => item.edgeId === edgeId));
    const type = output.mediaAssets?.[0]?.type ?? (currentVersion && output.text !== void 0 ? "text" : void 0) ?? savedSlot?.type;
    if (!type) {
      if (!output.text?.trim()) continue;
      if (!seenText.has(binding.sourceNodeId)) {
        seenText.add(binding.sourceNodeId);
        texts.push(output.text.trim());
      }
      continue;
    }
    if (feed.some((asset2) => asset2.edgeId === edgeId)) continue;
    const asset = output.mediaAssets?.[0];
    feed.push({
      edgeId,
      sourceNodeId: binding.sourceNodeId,
      type,
      ordinal,
      outputId: asset?.assetId ?? asset?.relativePath ?? asset?.path ?? asset?.url ?? output.assetId,
      availability: asset || type === "text" && output.text?.trim() ? "ready" : (currentVersion && ctx.upstreamBindings !== void 0 ? ctx.upstreamBindings.some((item) => item.edgeId === edgeId && item.sourceNodeId === binding.sourceNodeId) : ctx.upstreamBindings?.some((item) => item.edgeId === edgeId && item.sourceNodeId === binding.sourceNodeId) || ctx.upstreamOutputs.has(binding.sourceNodeId)) ? "waiting" : "unavailable",
      ...type === "text" ? { textContent: output.text } : {},
      role: binding.role,
      targetSlot: binding.targetSlot,
      url: asset?.url,
      pathOrUrl: asset?.relativePath || asset?.path,
      mimeType: asset?.mimeType,
      sizeBytes: asset?.sizeBytes,
      durationSec: asset?.durationSec
    });
    mediaByEdge.set(edgeId, output.mediaAssets);
  }
  operationId = currentVersion && typeof params.operation === "string" && params.operation.trim() ? params.operation.trim() : resolveSlotOperation(
    catalog2,
    model?.id,
    params.operation,
    kind,
    buildUpstreamFingerprint({
      prompt: resolveGenerationPrompt(data, texts),
      localText: resolveGenerationPrompt(data),
      nodeFields: params,
      assets: feed
    })
  );
  if (model && !operationId) throw new SeamGatewayError("operation-required", "\u8BF7\u9009\u62E9\u751F\u6210\u65B9\u5F0F");
  layout = deriveSlotLayout(catalog2, model?.id, operationId);
  const plainSpeech = !currentVersion && kind === "audio" && operationId === "text_to_speech";
  const loaded = effectiveInputDisplay(
    layout,
    feed,
    plainSpeech ? {} : saved,
    plainSpeech ? [] : data.slotConflicts ?? [],
    [],
    data.slotStandbyEdgeIds ?? [],
    currentVersion ? 1 : void 0
  );
  const { bindings, conflicts } = loaded;
  if (loaded.requiredUnavailable) {
    const reason = currentVersion ? loaded.records.find((record) => record.occupant.edgeId === loaded.requiredUnavailable.occupant.edgeId)?.reasonCode : void 0;
    throw new SeamGatewayError(reason === "input_waiting" ? reason : "input_unavailable", `\u6765\u6E90 ${loaded.requiredUnavailable.occupant.sourceNodeId} \u7684\u7D20\u6750\u5C1A\u4E0D\u53EF\u7528\uFF0C\u8BF7\u66FF\u6362\u6216\u505C\u7528`);
  }
  const selected = selectSlotOccupants(layout, bindings, feed, conflicts);
  for (const { occupant } of selected) {
    const asset = feed.find((item) => item.edgeId === occupant.edgeId);
    const output = mediaByEdge.get(occupant.edgeId);
    if (!asset || !output?.length) continue;
    if (output.length !== 1) throw new SeamGatewayError("input_unavailable", `\u6765\u6E90 ${occupant.sourceNodeId} \u5C1A\u672A\u786E\u5B9A\u552F\u4E00\u8F93\u51FA`);
    asset.pathOrUrl = resolveExecutionMediaSource(output[0], { workspaceId: ctx.workspaceId, mediaDir: ctx.mediaDir, resolveProjectFile }) ?? void 0;
    if (!asset.pathOrUrl) throw new SeamGatewayError("input_unavailable", `\u6765\u6E90 ${occupant.sourceNodeId} \u7684\u5DF2\u9009\u7D20\u6750\u65E0\u6CD5\u89E3\u6790\uFF0C\u8BF7\u66FF\u6362\u6216\u79FB\u9664\u5F15\u7528`);
  }
  const effective = assembleEffectiveInputsFromSlots({
    layout,
    bindings,
    conflicts,
    nodeData: data,
    feedAssets: feed,
    incomingText: texts
  });
  if (effective.blockedInputs.length) {
    const failure = effective.blockedInputs[0];
    throw new SeamGatewayError(failure.reason, `\u6765\u6E90 ${failure.sourceNodeId} \u7684\u5DF2\u5165\u5751\u7D20\u6750\u5C1A\u4E0D\u53EF\u7528\uFF0C\u8BF7\u8865\u9F50\u6216\u79FB\u9664\u5F15\u7528`);
  }
  if (effective.emptyRequiredSlots.length) throw new SeamGatewayError("min_unsatisfied", `\u8FD8\u9700\u8981\u5361\u69FD ${effective.emptyRequiredSlots.join("\u3001")} \u7684\u7D20\u6750`);
  const textSlot = layout.slots.find((slot2) => slot2.type === "text" && slot2.composition);
  const localText = layout.acceptsText === false || textSlot && !textSlot.valueSources?.includes("local_field") ? "" : resolveGenerationPrompt(data);
  const textInputs = loaded.records.filter((record) => record.state === "ready" && record.slot.type === "text").map((record) => ({
    sourceNodeId: record.occupant.sourceNodeId,
    edgeId: record.occupant.edgeId,
    outputId: record.asset?.outputId,
    role: record.slot.role,
    targetSlot: record.slot.slot,
    textContent: record.asset?.textContent ?? ""
  }));
  return {
    ...effective,
    ...currentVersion ? { localText, textInputs } : {},
    texts: layout.acceptsText === false ? [] : texts,
    operationId,
    modelId: model?.id ?? modelId
  };
}

// src/workflow/execution/logger.ts
function createWorkflowLogger(tag) {
  const emit = (level, message, meta) => {
    const line = `[omnimux-workflow/${tag}] ${message}`;
    const suffix = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    switch (level) {
      case "debug":
        if (process.env.OMNIMUX_WORKFLOW_DEBUG === "1") console.debug(line + suffix);
        break;
      case "info":
        console.info(line + suffix);
        break;
      case "warn":
        console.warn(line + suffix);
        break;
      default:
        console.error(line + suffix);
        break;
    }
  };
  return {
    debug: (message, meta) => emit("debug", message, meta),
    info: (message, meta) => emit("info", message, meta),
    warn: (message, meta) => emit("warn", message, meta),
    error: (message, meta) => emit("error", message, meta)
  };
}

// src/workflow/execution/multimodalCompiler.ts
var logger = createWorkflowLogger("multimodalCompiler");
var PROMPT_REF_REGEX = /@ref\[([^:]+):([^:]+):([^\]]+)\]/g;
function inferMaterialType(fileName, mimeType) {
  if (mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("text/")) return "text";
  }
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif"].includes(ext)) {
    return "image";
  }
  if (["mp4", "mov", "webm", "mkv", "avi", "m4v"].includes(ext)) {
    return "video";
  }
  if (["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(ext)) {
    return "audio";
  }
  return "image";
}
function formatFriendlyTag(materialType, fileName) {
  switch (materialType) {
    case "video":
      return `[\u53C2\u8003\u89C6\u9891: ${fileName}]`;
    case "audio":
      return `[\u53C2\u8003\u97F3\u9891: ${fileName}]`;
    case "image":
      return `[\u53C2\u8003\u56FE: ${fileName}]`;
    default:
      return `[\u53C2\u8003: ${fileName}]`;
  }
}
function compileMultimodalPrompt(args) {
  const { rawPrompt, slotState, upstreamOutputs, modelContract } = args;
  if (!rawPrompt || typeof rawPrompt !== "string") {
    return {
      cleanedPrompt: "",
      interleavedParts: modelContract?.supportsInterleaved ? [] : void 0,
      resolvedReferences: []
    };
  }
  const supportsInterleaved = Boolean(
    modelContract?.supportsInterleaved || modelContract?.category === "interleaved"
  );
  const resolveTokenData = (nodeId, slotIndex, fileName) => {
    let mediaUrl;
    let mimeType;
    let materialType = slotIndex === -1 ? "text" : void 0;
    if (upstreamOutputs) {
      let upEntry;
      if (upstreamOutputs instanceof Map || typeof upstreamOutputs === "object" && upstreamOutputs !== null && "get" in upstreamOutputs && typeof upstreamOutputs.get === "function") {
        upEntry = upstreamOutputs.get(nodeId);
      } else if (typeof upstreamOutputs === "object") {
        upEntry = upstreamOutputs[nodeId];
      }
      if (upEntry) {
        mediaUrl = upEntry.mediaUrl || upEntry.url || upEntry.path;
        if (!mediaUrl && Array.isArray(upEntry.mediaAssets) && upEntry.mediaAssets.length > 0) {
          const asset = upEntry.mediaAssets[0];
          mediaUrl = asset?.url || asset?.path;
          mimeType = asset?.mimeType;
          if (asset?.type) {
            materialType = asset.type;
          }
        }
        mimeType = mimeType || upEntry.mimeType;
      }
    }
    if (!mediaUrl && slotState) {
      const activeItem = slotState.activeSlots.find(
        (s) => s.sourceNodeId === nodeId && s.slotIndex === slotIndex
      ) || slotState.activeSlots.find((s) => s.sourceNodeId === nodeId);
      if (activeItem) {
        mediaUrl = activeItem.mediaUrl;
        mimeType = mimeType || activeItem.mimeType;
        materialType = materialType || activeItem.materialType;
      } else {
        const overflowItem = slotState.overflowPool.find((o) => o.sourceNodeId === nodeId);
        if (overflowItem) {
          mediaUrl = overflowItem.mediaUrl;
          mimeType = mimeType || overflowItem.mimeType;
          materialType = materialType || overflowItem.materialType;
        }
      }
    }
    if (!materialType) {
      materialType = inferMaterialType(fileName, mimeType);
    }
    return {
      mediaUrl,
      mimeType,
      materialType
    };
  };
  const resolvedReferences = [];
  const interleavedParts = [];
  const seenRefKeys = /* @__PURE__ */ new Set();
  PROMPT_REF_REGEX.lastIndex = 0;
  let lastIndex = 0;
  let match = null;
  let cleanedPrompt = "";
  while ((match = PROMPT_REF_REGEX.exec(rawPrompt)) !== null) {
    const matchStart = match.index;
    const matchEnd = PROMPT_REF_REGEX.lastIndex;
    const nodeId = match[1] ?? "";
    const slotIndexStr = match[2] ?? "0";
    const fileName = match[3] ?? "";
    const slotIndex = Number.parseInt(slotIndexStr, 10);
    const validSlotIndex = Number.isNaN(slotIndex) ? 0 : slotIndex;
    const prefixText = rawPrompt.slice(lastIndex, matchStart);
    if (prefixText.length > 0) {
      cleanedPrompt += prefixText;
      if (supportsInterleaved) {
        interleavedParts.push({
          type: "text",
          text: prefixText
        });
      }
    }
    const { mediaUrl, mimeType, materialType } = resolveTokenData(nodeId, validSlotIndex, fileName);
    const friendlyTag = formatFriendlyTag(materialType, fileName);
    cleanedPrompt += friendlyTag;
    if (mediaUrl) {
      const refKey = `${nodeId}:${validSlotIndex}:${mediaUrl}`;
      if (!seenRefKeys.has(refKey)) {
        seenRefKeys.add(refKey);
        resolvedReferences.push({
          role: "reference",
          type: materialType,
          materialType,
          pathOrUrl: mediaUrl,
          mediaUrl,
          sourceNodeId: nodeId,
          slotIndex: validSlotIndex,
          label: fileName,
          ...mimeType ? { mimeType } : {}
        });
      }
      if (supportsInterleaved) {
        const partType = `${materialType}_url`;
        interleavedParts.push({
          type: partType,
          [partType]: { url: mediaUrl },
          url: mediaUrl,
          mediaUrl,
          mimeType,
          slotIndex: validSlotIndex,
          sourceNodeId: nodeId,
          label: fileName,
          materialType
        });
      }
    } else {
      if (materialType !== "text") logger.warn("\u591A\u6A21\u6001\u7F16\u8BD1\u8B66\u544A\uFF1A\u5F15\u7528\u7D20\u6750\u672A\u5C31\u7EEA\u6216\u4E22\u5931\uFF0C\u5E73\u6ED1\u964D\u7EA7\u4E3A\u6587\u672C\u6807\u7B7E", {
        nodeId,
        slotIndex: validSlotIndex,
        fileName
      });
      if (supportsInterleaved) {
        interleavedParts.push({
          type: "text",
          text: friendlyTag
        });
      }
    }
    lastIndex = matchEnd;
  }
  if (lastIndex < rawPrompt.length) {
    const trailingText = rawPrompt.slice(lastIndex);
    cleanedPrompt += trailingText;
    if (supportsInterleaved) {
      interleavedParts.push({
        type: "text",
        text: trailingText
      });
    }
  }
  return {
    cleanedPrompt,
    interleavedParts: supportsInterleaved ? interleavedParts : void 0,
    resolvedReferences
  };
}

// src/workflow/seam/submissionInputs.ts
var import_node_child_process = require("node:child_process");
var import_node_fs3 = require("node:fs");
var import_node_path3 = require("node:path");
function probeLocalMediaDuration(filePath) {
  try {
    const out = (0, import_node_child_process.execFileSync)("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ], { encoding: "utf8", timeout: 3e3, stdio: ["ignore", "pipe", "ignore"] });
    const val = Number.parseFloat(out.trim());
    return Number.isFinite(val) && val >= 0 ? Math.round(val * 100) / 100 : void 0;
  } catch {
    return void 0;
  }
}
function submissionReferences(req) {
  if (req.references !== void 0 && !Array.isArray(req.references)) {
    throw new SeamGatewayError("omnimux-invalid-request", "\u7D20\u6750\u5F15\u7528\u5FC5\u987B\u662F\u6709\u5E8F\u5217\u8868");
  }
  const refs = [...req.references ?? []];
  if (refs.some((ref) => !ref || typeof ref !== "object")) {
    throw new SeamGatewayError("input_unavailable", "\u7D20\u6750\u5F15\u7528\u65E0\u6548\uFF0C\u8BF7\u66FF\u6362\u7D20\u6750\u6216\u79FB\u9664\u5F15\u7528");
  }
  if (req.audioTrack && !refs.some((ref) => ref.pathOrUrl === req.audioTrack.pathOrUrl && ref.role === req.audioTrack.role && ref.targetSlot === req.audioTrack.targetSlot)) refs.push(req.audioTrack);
  const add = (pathOrUrl, type, role) => {
    if (pathOrUrl !== void 0 && !refs.some((ref) => ref.type === type && ref.pathOrUrl === pathOrUrl)) {
      refs.push({ pathOrUrl, type, role });
    }
  };
  add(req.image, "image", req.capability === "video" ? "first_frame" : "reference");
  add(req.video, "video", "reference");
  add(req.audio, "audio", req.operation === "speech_to_text" ? "source" : "reference");
  add(req.speech, "audio", "audio_track");
  return refs;
}
function validateReference(ref) {
  const fail = (message) => {
    throw new SeamGatewayError("input_unavailable", `\u6765\u6E90 ${ref?.sourceNodeId ?? ref?.edgeId ?? "\u7D20\u6750"}\uFF1A${message}`);
  };
  if (!ref || !["image", "video", "audio"].includes(ref.type)) {
    throw new SeamGatewayError("operation_incompatible", "\u5F53\u524D\u5F15\u7528\u4E0D\u662F\u652F\u6301\u7684\u56FE\u7247\u3001\u89C6\u9891\u6216\u97F3\u9891\u7D20\u6750");
  }
  const path = typeof ref.pathOrUrl === "string" ? ref.pathOrUrl.trim() : "";
  if (!path || path.includes("\0")) fail("\u7D20\u6750\u5730\u5740\u65E0\u6548\uFF0C\u8BF7\u66FF\u6362\u7D20\u6750\u6216\u79FB\u9664\u5F15\u7528");
  if (ref.mimeType !== void 0 && typeof ref.mimeType !== "string") {
    throw new SeamGatewayError("metadata_required", "\u7D20\u6750 MIME \u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u7D20\u6750");
  }
  let mimeType = ref.mimeType?.trim().toLowerCase() || void 0;
  if (mimeType === "application/octet-stream" || mimeType === "unknown") mimeType = void 0;
  let sizeBytes = ref.sizeBytes;
  let durationSec = ref.durationSec ?? ref.duration;
  const resolvedDiskPath = localFilePathFromUrl(path) || ((0, import_node_path3.isAbsolute)(path) ? path : null);
  if (resolvedDiskPath && (0, import_node_path3.isAbsolute)(resolvedDiskPath)) {
    try {
      const stat = (0, import_node_fs3.statSync)(resolvedDiskPath);
      if (!stat.isFile() || stat.size === 0) fail("\u7D20\u6750\u6587\u4EF6\u4E3A\u7A7A\u6216\u4E0D\u53EF\u7528");
      sizeBytes = stat.size;
      const detected = detectMimeFromFile(resolvedDiskPath, "");
      if (detected && !detected.startsWith(`${ref.type}/`)) fail("\u7D20\u6750\u6587\u4EF6\u7684\u5B9E\u9645\u7C7B\u578B\u4E0E\u58F0\u660E\u4E0D\u4E00\u81F4");
      mimeType = detected || mimeType;
      if ((ref.type === "video" || ref.type === "audio") && (durationSec === void 0 || durationSec === null)) {
        durationSec = probeLocalMediaDuration(resolvedDiskPath);
      }
    } catch (err) {
      if (err instanceof SeamGatewayError) throw err;
      fail("\u7D20\u6750\u6587\u4EF6\u4E0D\u53EF\u7528\uFF0C\u8BF7\u66FF\u6362\u7D20\u6750\u6216\u79FB\u9664\u5F15\u7528");
    }
  } else if (path.startsWith("data:")) {
    const match = /^data:((?:image|video|audio)\/[^;,]+)(;base64)?,(.+)$/s.exec(path);
    if (!match || match[1].split("/")[0] !== ref.type) fail("\u7D20\u6750\u6570\u636E\u7C7B\u578B\u65E0\u6548");
    const payload = match[3];
    if (match[2] && (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload) || payload.replace(/=+$/, "").length % 4 === 1)) {
      fail("\u7D20\u6750\u6570\u636E\u7F16\u7801\u65E0\u6548");
    }
    mimeType ??= match[1];
    if (match[2]) sizeBytes ??= Buffer.byteLength(payload, "base64");
  } else {
    try {
      const url = new URL(path);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname) fail("\u7D20\u6750\u5FC5\u987B\u662F\u6267\u884C\u4FA7\u53EF\u8BFB\u53D6\u7684\u5730\u5740");
      mimeType ??= mimeFromFilename(url.pathname);
    } catch {
      fail("\u7D20\u6750\u5FC5\u987B\u662F\u6267\u884C\u4FA7\u53EF\u8BFB\u53D6\u7684\u5730\u5740");
    }
  }
  if (mimeType && !mimeType.toLowerCase().startsWith(`${ref.type}/`)) {
    throw new SeamGatewayError("mime_unsupported", "\u7D20\u6750\u7C7B\u578B\u4E0E MIME \u4E0D\u4E00\u81F4\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u7D20\u6750");
  }
  for (const value of [sizeBytes, durationSec]) {
    if (value !== void 0 && (!Number.isFinite(value) || value < 0)) {
      throw new SeamGatewayError("metadata_required", "\u7D20\u6750\u5927\u5C0F\u6216\u65F6\u957F\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u7D20\u6750");
    }
  }
  return {
    ...ref,
    pathOrUrl: path,
    ...mimeType ? { mimeType } : {},
    ...sizeBytes !== void 0 ? { sizeBytes } : {},
    ...durationSec !== void 0 ? { durationSec } : {}
  };
}
function submissionFingerprint(req) {
  const references = submissionReferences(req).map(validateReference);
  return buildUpstreamFingerprint({
    prompt: req.prompt,
    nodeFields: Object.fromEntries(Object.entries(req).filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")),
    assets: references.map((ref, index) => ({
      ...ref,
      sourceNodeId: ref.sourceNodeId ?? `reference-${index}`,
      url: ref.pathOrUrl,
      availability: "ready"
    }))
  });
}

// src/workflow/seam/submitGuard.ts
function submissionModel(req, catalog2) {
  if (req.model !== void 0 && typeof req.model !== "string") {
    throw new SeamGatewayError("model-not-allowed", "\u6A21\u578B\u6807\u8BC6\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u6A21\u578B");
  }
  const id = req.model?.trim() || catalog2.defaults?.[req.capability] || "";
  const model = resolveModelView(buildContractView(catalog2), id);
  if (!model || !catalog2[req.capability]?.some((row) => row.id === model.id)) {
    throw new SeamGatewayError("model-not-allowed", "\u8BF7\u9009\u62E9\u6B64\u7C7B\u8282\u70B9\u767D\u540D\u5355\u4E2D\u53EF\u7528\u7684\u6A21\u578B");
  }
  if (model.synthesized) {
    throw new SeamGatewayError("contract_missing", "\u6A21\u578B\u76EE\u5F55\u7F3A\u5C11\u751F\u6210\u65B9\u5F0F\u5408\u540C\uFF0C\u8BF7\u5237\u65B0\u76EE\u5F55\u540E\u91CD\u8BD5");
  }
  if (!model.operations.some((op) => op.listed && op.output.type === req.capability)) {
    throw new SeamGatewayError("model-not-allowed", "\u5F53\u524D\u6A21\u578B\u6CA1\u6709\u6B64\u7C7B\u8282\u70B9\u53EF\u7528\u7684\u751F\u6210\u65B9\u5F0F");
  }
  return model;
}
function resolveExecutorSubmission(req, catalog2) {
  const model = submissionModel(req, catalog2);
  if (req.operation !== void 0) return resolveCanvasSubmission(req, catalog2);
  const state = buildEffectiveOpsUiState({
    catalog: catalog2,
    modelId: model.id,
    outputType: req.capability,
    fingerprint: submissionFingerprint(req)
  });
  if (state.blockGenerate || !state.selectedOperationId) {
    throw new SeamGatewayError(state.reasonCode ?? "operation-required", state.reasonMessage ?? "\u8BF7\u9009\u62E9\u751F\u6210\u65B9\u5F0F");
  }
  return resolveCanvasSubmission({ ...req, model: model.id, operation: state.selectedOperationId }, catalog2);
}
function resolveCanvasSubmission(req, catalog2) {
  const model = submissionModel(req, catalog2);
  if (typeof req.operation !== "string" || !req.operation.trim()) throw new SeamGatewayError("operation-required", "\u8BF7\u9009\u62E9\u751F\u6210\u65B9\u5F0F\u540E\u518D\u63D0\u4EA4");
  const operation2 = model.operations.find((op) => op.id === req.operation);
  if (!operation2?.listed || operation2.output.type !== req.capability) {
    throw new SeamGatewayError("operation-not-allowed", "\u5F53\u524D\u6A21\u578B\u4E0D\u652F\u6301\u6240\u9009\u751F\u6210\u65B9\u5F0F\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
  }
  const submitted = submissionFingerprint(req);
  if (req.textInputs !== void 0 && (!Array.isArray(req.textInputs) || req.textInputs.some((input) => !input || typeof input.sourceNodeId !== "string" || typeof input.edgeId !== "string" || typeof input.targetSlot !== "string" || typeof input.textContent !== "string"))) throw new SeamGatewayError("input_unavailable", "\u6587\u672C\u8F93\u5165\u65E0\u6548\uFF0C\u8BF7\u66FF\u6362\u6216\u505C\u7528");
  const fingerprint = buildUpstreamFingerprint({
    ...submitted,
    localText: req.localText,
    assets: [...submitted.assets, ...(req.textInputs ?? []).map((input) => ({ ...input, type: "text", availability: "ready" }))]
  });
  const match = matchOperationInputs(operation2, fingerprint);
  const failure = !match.accepts ? match.rejections[0] : !match.ready ? match.pending[0] : void 0;
  if (!match.accepts || !match.ready) {
    throw new SeamGatewayError(failure?.code ?? "operation_incompatible", failure?.message ?? "\u5F53\u524D\u8F93\u5165\u5C1A\u4E0D\u6EE1\u8DB3\u751F\u6210\u8981\u6C42");
  }
  const bindings = [...match.bindings];
  const normalized = /* @__PURE__ */ new Map();
  const references = submissionReferences(req);
  for (const [index, asset] of fingerprint.mediaAssets.entries()) {
    const bindingIndex = bindings.findIndex((binding2) => binding2.sourceNodeId === asset.sourceNodeId && binding2.edgeId === asset.edgeId && binding2.type === asset.type && (!asset.targetSlot || binding2.slot === asset.targetSlot) && (!asset.role || binding2.role === asset.role));
    if (bindingIndex < 0) throw new SeamGatewayError("role_conflict", `\u6765\u6E90 ${asset.sourceNodeId} \u7684\u7528\u9014\u4E0E\u76EE\u6807\u69FD\u4F4D\u4E0D\u4E00\u81F4`);
    const [binding] = bindings.splice(bindingIndex, 1);
    const slot2 = operation2.inputs.find((input) => input.slot === binding.slot);
    const durationRequired = [
      slot2.minDurationSec,
      slot2.maxDurationSec,
      slot2.totalMinDurationSec,
      slot2.totalMaxDurationSec,
      slot2.combinedOutputMaxDurationSec
    ].some(Number.isFinite);
    if (slot2.allowedMimes?.length && !asset.mimeType || Number.isFinite(slot2.maxSizeMb) && asset.sizeBytes === void 0 || durationRequired && asset.durationSec === void 0) {
      throw new SeamGatewayError("metadata_required", `\u6765\u6E90 ${asset.sourceNodeId} \u7F3A\u5C11\u69FD\u4F4D ${slot2.slot} \u6821\u9A8C\u6240\u9700\u7684\u7D20\u6750\u4FE1\u606F\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u7D20\u6750`);
    }
    normalized.set(references[index], {
      ...references[index],
      pathOrUrl: asset.url,
      role: binding.role,
      ...references[index].targetSlot ? {} : { targetSlot: binding.slot },
      ...asset.mimeType ? { mimeType: asset.mimeType } : {},
      ...asset.sizeBytes !== void 0 ? { sizeBytes: asset.sizeBytes } : {},
      ...asset.durationSec !== void 0 ? { durationSec: asset.durationSec } : {}
    });
  }
  const trackReference = req.audioTrack && references.find((ref) => ref.pathOrUrl === req.audioTrack.pathOrUrl && ref.role === req.audioTrack.role && ref.targetSlot === req.audioTrack.targetSlot);
  return {
    ...req,
    model: model.id,
    ...req.references ? { references: req.references.map((ref) => normalized.get(ref)) } : {},
    ...trackReference ? { audioTrack: normalized.get(trackReference) } : {}
  };
}

// src/workflow/seam/generatedResult.ts
var import_node_fs4 = require("node:fs");
var import_node_path4 = require("node:path");
function validateGeneratedResult(result, expected, localPath) {
  const fail = () => {
    throw new SeamGatewayError("omnimux-invalid-response", `\u751F\u6210\u7ED3\u679C\u4E0E ${expected} \u8282\u70B9\u7684\u4EA7\u7269\u7C7B\u578B\u4E0D\u5339\u914D`);
  };
  if (!result || typeof result !== "object" || result.type !== void 0 && result.type !== expected) fail();
  if (result.url != null && typeof result.url !== "string") fail();
  if (result.mimeType !== void 0 && typeof result.mimeType !== "string") fail();
  if (expected === "text") {
    if (typeof result.text !== "string" || !result.text.trim()) fail();
  } else if (typeof result.text === "string" || !result.url?.trim()) fail();
  const dataMime = result.url?.match(/^data:([^;,]+)/)?.[1];
  if (dataMime && !dataMime.startsWith(`${expected}/`)) fail();
  let mimeType = result.mimeType ?? dataMime;
  let sizeBytes = result.sizeBytes;
  for (const path of /* @__PURE__ */ new Set([localPath, result.url])) {
    if (!path || !(0, import_node_path4.isAbsolute)(path)) continue;
    try {
      const stat = (0, import_node_fs4.statSync)(path);
      if (stat.isFile()) {
        const detected = detectMimeFromFile(path, "");
        if (detected && expected !== "text" && !detected.startsWith(`${expected}/`)) fail();
        mimeType ??= detected || void 0;
        sizeBytes ??= stat.size;
      }
    } catch (error) {
      if (error instanceof SeamGatewayError) throw error;
    }
  }
  if (!mimeType && result.url) {
    try {
      mimeType = mimeFromFilename(new URL(result.url, "file:///").pathname);
    } catch {
    }
  }
  if (mimeType && !mimeType.toLowerCase().startsWith(`${expected}/`)) fail();
  for (const value of [sizeBytes, result.durationSec]) {
    if (value !== void 0 && (!Number.isFinite(value) || value < 0)) fail();
  }
  return {
    ...mimeType ? { mimeType } : {},
    ...sizeBytes !== void 0 ? { sizeBytes } : {},
    ...result.durationSec !== void 0 ? { durationSec: result.durationSec } : {}
  };
}

// src/workflow/execution/upstreamReconcile.ts
var UPSTREAM_TASK_DEADLINE_MS = 20 * 60 * 1e3;
function upstreamTaskDeadlineAt(ref, deadlineMs = UPSTREAM_TASK_DEADLINE_MS) {
  return ref.submittedAt + deadlineMs;
}
function isNotReconcilableError(error) {
  if (error instanceof SeamGatewayError) {
    return error.code === "omnimux-invalid-request";
  }
  if (!error || typeof error !== "object") return false;
  const coded = error;
  if (coded.code === "omnimux-invalid-request") return true;
  return coded.code === "omnimux-request-failed" && (coded.status === 404 || coded.status === 410);
}
async function reconcileUpstreamTask(input) {
  const { ref } = input;
  if (!ref) return { kind: "not-reconcilable", reason: "no persisted upstream task reference" };
  if (ref.capability !== input.capability) {
    return {
      kind: "not-reconcilable",
      reason: `reference capability ${ref.capability} does not match node capability ${input.capability}`
    };
  }
  const deadlineMs = input.deadlineMs ?? UPSTREAM_TASK_DEADLINE_MS;
  const deadlineAt = upstreamTaskDeadlineAt(ref, deadlineMs);
  if (Date.now() >= deadlineAt) {
    return {
      kind: "failed",
      error: new SeamGatewayError(
        "omnimux-task-timeout",
        `${ref.capability} task ${ref.taskId} exceeded its ${deadlineMs}ms poll deadline before the restart`
      )
    };
  }
  try {
    const result = await input.gateway.reconcileTask(ref, input.dest, input.signal);
    return { kind: "downloaded", result };
  } catch (error) {
    if (isNotReconcilableError(error)) {
      return {
        kind: "not-reconcilable",
        reason: error instanceof Error ? error.message : String(error)
      };
    }
    return { kind: "failed", error: error instanceof Error ? error : new Error(String(error)) };
  }
}

// src/workflow/execution/materialGatewayExecutor.ts
function readMockFail(nodeData) {
  return nodeData.mockFail === true;
}
function isUpstreamTerminalError(error) {
  if (error instanceof SeamGatewayError) {
    return error.code === "omnimux-failed" || error.code === "omnimux-task-timeout" || error.code === "omnimux-invalid-response";
  }
  if (!error || typeof error !== "object") return false;
  const coded = error;
  return coded.code === "omnimux-failed" || coded.code === "omnimux-task-timeout" || coded.code === "omnimux-invalid-response";
}
function readString(source, key) {
  const value = source?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
function readDuration(data) {
  const fromParams = data.params?.duration;
  if (typeof fromParams === "number") return fromParams;
  if (typeof data.duration === "number") return data.duration;
  return void 0;
}
function readNumber(source, key) {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function readBoolean(source, key) {
  const value = source?.[key];
  return typeof value === "boolean" ? value : void 0;
}
var ROUTING_STRATEGIES = ["auto", "stability_first", "cost_first"];
function readRouting(source) {
  const routing = source?.routing;
  if (!routing || typeof routing !== "object" || Array.isArray(routing)) return {};
  const row = routing;
  const out = {};
  if (typeof row.strategy === "string" && ROUTING_STRATEGIES.includes(row.strategy)) {
    out.strategy = row.strategy;
  }
  if (Array.isArray(row.allowedGroups)) {
    const groups = row.allowedGroups.filter((id) => typeof id === "string" && id.trim().length > 0).map((id) => id.trim());
    if (groups.length > 0) out.allowedGroups = groups;
  }
  return out;
}
function readMaterialType(nodeData) {
  const value = nodeData.materialType;
  if (value === "image" || value === "video" || value === "audio") return value;
  return "text";
}
function extFor(capability) {
  if (capability === "image") return "png";
  if (capability === "video") return "mp4";
  if (capability === "audio") return "mp3";
  return "txt";
}
function createMaterialGatewayExecutor(opts) {
  const { gateway } = opts;
  return {
    key: "material:generate",
    async execute(node, ctx) {
      const data = structuredClone(node.data ?? {});
      const params = data.params;
      const capability = readMaterialType(data);
      const fileId = (0, import_node_crypto.createHash)("sha256").update(node.id).digest("hex");
      const dest = (0, import_node_path5.join)(ctx.mediaDir, `${fileId}-${(0, import_node_crypto.randomUUID)()}.${extFor(capability)}`);
      assertProjectWriteSafe(dest, ctx.mediaDir);
      const finalizeMedia = async (settled, record) => {
        const metadata = validateGeneratedResult(settled, capability, dest);
        ctx.reportProgress?.(90, "\u751F\u6210\u5B8C\u6210");
        const simulated = settled.simulated === true;
        if (capability === "text") {
          return {
            text: settled.text,
            ...simulated ? { simulated: true } : {}
          };
        }
        if (ctx.persistGenerated) {
          const persisted = await ctx.persistGenerated({
            nodeId: node.id,
            nodeType: node.type,
            tmpAbs: dest,
            materialType: capability,
            prompt: record.prompt,
            modelId: record.modelId
          });
          return {
            relativePath: persisted.relativePath,
            assetId: persisted.assetId,
            ...simulated ? { simulated: true } : {},
            mediaAssets: [{
              type: capability,
              url: persisted.url,
              relativePath: persisted.relativePath,
              assetId: persisted.assetId,
              ...metadata,
              ...persisted.mimeType ? { mimeType: persisted.mimeType } : {},
              ...persisted.sizeBytes != null ? { sizeBytes: persisted.sizeBytes } : {},
              ...persisted.durationSec != null ? { durationSec: persisted.durationSec } : {}
            }]
          };
        }
        const url = ctx.toPublicUrl ? ctx.toPublicUrl(settled.url) : settled.url;
        return {
          ...simulated ? { simulated: true } : {},
          ...settled.relativePath ? { relativePath: settled.relativePath } : {},
          ...settled.assetId ? { assetId: settled.assetId } : {},
          mediaAssets: [{
            type: capability,
            url,
            ...metadata,
            ...settled.relativePath ? { relativePath: settled.relativePath } : {},
            ...settled.assetId ? { assetId: settled.assetId } : {}
          }]
        };
      };
      const upstreamTaskRef = ctx.readUpstreamTask?.();
      if (upstreamTaskRef) {
        const outcome = await reconcileUpstreamTask({
          gateway,
          ref: upstreamTaskRef,
          dest,
          signal: ctx.signal,
          capability
        });
        if (outcome.kind === "downloaded") {
          const output = await finalizeMedia(outcome.result, {
            prompt: resolveGenerationPrompt(data),
            modelId: readString(params, "model")
          });
          ctx.clearUpstreamTask?.();
          return output;
        }
        if (outcome.kind === "failed") {
          if (isUpstreamTerminalError(outcome.error)) {
            ctx.clearUpstreamTask?.();
          }
          throw outcome.error;
        }
        ctx.clearUpstreamTask?.();
        throw new Error("\u539F\u751F\u6210\u4EFB\u52A1\u65E0\u6CD5\u53D6\u56DE\uFF1B\u8BF7\u91CD\u65B0\u786E\u8BA4\u5B8C\u6574\u8F93\u5165\u540E\u521B\u5EFA\u65B0\u7684\u751F\u6210\u4EFB\u52A1");
      }
      const inputs = { ...ctx, upstreamOutputs: structuredClone(ctx.upstreamOutputs), upstreamBindings: structuredClone(ctx.upstreamBindings) };
      const catalog2 = structuredClone(ctx.catalog ?? await gateway.capabilities());
      const upstream = collectMaterialSlotInputs(data, inputs, catalog2, opts.resolveProjectFile);
      if (data.inputBindingVersion !== 1 && capability === "audio" && upstream.texts.length && resolveGenerationPrompt(data).trim()) {
        throw new Error("\u5F53\u524D\u97F3\u9891\u4EFB\u52A1\u4E0D\u80FD\u5206\u522B\u8868\u8FBE\u4E0A\u6E38\u6B63\u6587\u548C\u672C\u5730\u8981\u6C42\uFF1B\u8BF7\u4FDD\u7559\u4E00\u4E2A\u6B63\u6587\u6765\u6E90\u5E76\u8C03\u6574\u97F3\u8272\u3001\u8BED\u901F\u7B49\u53C2\u6570");
      }
      const rawPrompt = upstream.prompt;
      const references = [...upstream.references];
      const modelId = upstream.modelId ?? readString(params, "model");
      const modelDef = catalog2.models?.find((m) => m.id === modelId);
      const supportsInterleaved = Boolean(
        modelDef?.supportsInterleaved || params?.supportsInterleaved
      );
      const upstreamOutputsObj = {};
      for (const [sourceId, out] of ctx.upstreamOutputs.entries()) {
        const firstAsset = out.mediaAssets?.[0];
        const mediaUrl = upstream.references.find((reference) => reference.sourceNodeId === sourceId)?.pathOrUrl;
        upstreamOutputsObj[sourceId] = {
          mediaUrl,
          text: out.text,
          mimeType: firstAsset?.mimeType
        };
      }
      for (const ref of upstream.references) {
        if (ref.sourceNodeId) {
          upstreamOutputsObj[ref.sourceNodeId] = {
            ...upstreamOutputsObj[ref.sourceNodeId],
            mediaUrl: ref.pathOrUrl,
            mimeType: ref.mimeType || upstreamOutputsObj[ref.sourceNodeId]?.mimeType
          };
        }
      }
      const compiled = compileMultimodalPrompt({
        rawPrompt,
        // The resolved Slot population alone authorizes media consumption, not legacy caches.
        slotState: void 0,
        upstreamOutputs: upstreamOutputsObj,
        modelContract: {
          supportsInterleaved,
          category: capability
        }
      });
      const prompt = compiled.cleanedPrompt;
      const audioTrack = upstream.audioTrack;
      const image = references.find((r) => r.type === "image")?.pathOrUrl || void 0;
      const audio = references.find((r) => r.type === "audio")?.pathOrUrl || audioTrack?.pathOrUrl;
      const request = {
        capability,
        prompt,
        ...data.inputBindingVersion === 1 ? { localText: upstream.localText, textInputs: upstream.textInputs } : {},
        interleavedParts: compiled.interleavedParts && compiled.interleavedParts.length > 0 ? compiled.interleavedParts : void 0,
        image,
        audio,
        references: references.length > 0 ? references : void 0,
        audioTrack,
        duration: readDuration(data),
        operation: upstream.operationId,
        model: upstream.modelId,
        resolution: readString(params, "resolution"),
        quality: readString(params, "quality"),
        n: readNumber(params, "n"),
        aspectRatio: readString(params, "aspectRatio"),
        voice: readString(params, "voice"),
        style: readString(params, "style"),
        instrumental: readBoolean(params, "instrumental"),
        speed: readNumber(params, "speed"),
        sound: readBoolean(params, "sound"),
        seed: readNumber(params, "seed"),
        watermark: readBoolean(params, "watermark"),
        outputFormat: readString(params, "outputFormat"),
        referenceTaskType: readString(params, "referenceTaskType"),
        generationType: readString(params, "generationType"),
        returnLastFrame: readBoolean(params, "returnLastFrame"),
        webSearch: readBoolean(params, "webSearch"),
        nsfwCheck: readBoolean(params, "nsfwCheck"),
        fileUrl: readString(params, "fileUrl"),
        linkUrl: readString(params, "linkUrl"),
        ...readRouting(params),
        dest,
        signal: ctx.signal,
        mockFail: readMockFail(data)
      };
      if (capability === "audio" && upstream.operationId === "text_to_speech") {
        delete request.image;
        delete request.interleavedParts;
        const hasReferenceAudio = Array.isArray(request.references) && request.references.some((r) => r && r.type === "audio") || Boolean(request.audioTrack?.pathOrUrl) || Boolean(request.audio);
        if (!hasReferenceAudio) {
          delete request.references;
          delete request.audio;
          delete request.audioTrack;
        }
      }
      const isSafePublicRemoteUrl = (rawUrl) => {
        try {
          const parsed = new URL(rawUrl);
          if (!["http:", "https:"].includes(parsed.protocol)) return false;
          const host = parsed.hostname.toLowerCase();
          if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return false;
          if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
          if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return false;
          return true;
        } catch {
          return false;
        }
      };
      const enrichRemoteReference = async (ref) => {
        const url = ref?.pathOrUrl;
        if (typeof url !== "string" || !isSafePublicRemoteUrl(url)) {
          return ref;
        }
        if (ref.sizeBytes !== void 0 && ref.mimeType !== void 0) {
          return ref;
        }
        try {
          const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(3e3) });
          if (!res.ok) return ref;
          const patch = {};
          const len = res.headers.get("content-length");
          if (len) {
            const num = Number(len);
            if (Number.isFinite(num) && num >= 0) patch.sizeBytes = num;
          }
          const ct = res.headers.get("content-type");
          if (ct && !ref.mimeType) {
            const mime = ct.split(";")[0]?.trim().toLowerCase();
            if (mime && mime !== "application/octet-stream" && mime !== "binary/octet-stream") {
              patch.mimeType = mime;
            }
          }
          return { ...ref, ...patch };
        } catch {
          return ref;
        }
      };
      if (Array.isArray(request.references) && request.references.length > 0) {
        request.references = await Promise.all(request.references.map(enrichRemoteReference));
      }
      if (request.audioTrack) {
        request.audioTrack = await enrichRemoteReference(request.audioTrack);
      }
      const resolved = resolveExecutorSubmission(request, catalog2);
      const submitted = await gateway.submit(resolved);
      ctx.reportProgress?.(10, "\u5DF2\u63D0\u4EA4\u751F\u6210\u4EFB\u52A1");
      if (submitted.mode === "submitted") {
        ctx.recordUpstreamTask?.({
          taskId: submitted.taskId,
          capability,
          submittedAt: Date.now(),
          ...submitted.taskRef ? { taskRef: submitted.taskRef } : {},
          // #1386: persist which backend owns the task alongside its id, so the
          // recovery in a later process routes the reconcile back to that same
          // backend instead of assuming the hub.
          ...submitted.owner ? { owner: submitted.owner } : {}
        });
      }
      try {
        ctx.reportProgress?.(40, "\u751F\u6210\u4E2D\u2026");
        const settled = await gateway.awaitTask(submitted.taskId, dest, ctx.signal);
        const output = await finalizeMedia(settled, { prompt, modelId: resolved.model });
        ctx.clearUpstreamTask?.();
        return output;
      } catch (error) {
        if (isUpstreamTerminalError(error)) {
          ctx.clearUpstreamTask?.();
        }
        throw error;
      }
    }
  };
}

// src/workflow/execution/nodeExecutors.ts
var import_node_path6 = require("node:path");

// src/workflow/executors/registry.ts
var executors = /* @__PURE__ */ new Map();
function registerExecutor(executor) {
  executors.set(executor.key, executor);
}
function getExecutor(key) {
  return executors.get(key);
}

// src/shared/specs/nodes/materialNodeSpec.ts
var MATERIAL_TOOLS_BY_TYPE = {
  text: ["text-editor", "text-to-text", "link-extract", "audio-transcription"],
  image: ["import", "text-to-image", "image-to-image"],
  video: ["import", "video-generation", "motion-mimicry", "subtitle-render", "digital-human"],
  audio: ["import", "text-to-audio", "text-to-music", "video-to-audio", "voice-clone", "audio-extract"]
};
var materialTools = {
  // === Text Tools ===
  "text-editor": {
    id: "text-editor",
    labelKey: "tool.text-editor",
    materialType: "text",
    outputType: "text",
    acceptedInputTypes: [],
    slots: []
  },
  "text-to-text": {
    id: "text-to-text",
    labelKey: "tool.text-to-text",
    materialType: "text",
    outputType: "text",
    acceptedInputTypes: ["text", "image", "video", "audio"],
    modelCategory: "text",
    slots: [
      {
        slotId: "prompt",
        materialType: "text",
        role: "prompt",
        required: true
      }
    ]
  },
  "link-extract": {
    id: "link-extract",
    labelKey: "tool.link-extract",
    materialType: "text",
    outputType: "text",
    acceptedInputTypes: ["text"],
    slots: [
      {
        slotId: "url",
        materialType: "text",
        role: "prompt",
        required: true
      }
    ]
  },
  "audio-transcription": {
    id: "audio-transcription",
    labelKey: "tool.audio-transcription",
    materialType: "text",
    outputType: "text",
    acceptedInputTypes: ["audio"],
    modelCategory: "audio",
    slots: [
      {
        slotId: "audio",
        materialType: "audio",
        role: "audio_track",
        required: true
      }
    ]
  },
  // === Common Import Tool ===
  import: {
    id: "import",
    labelKey: "tool.import",
    materialType: "image",
    outputType: "image",
    acceptedInputTypes: [],
    slots: []
  },
  // === Image Tools ===
  "text-to-image": {
    id: "text-to-image",
    labelKey: "tool.text-to-image",
    materialType: "image",
    outputType: "image",
    acceptedInputTypes: ["text"],
    modelCategory: "image",
    slots: [
      {
        slotId: "prompt",
        materialType: "text",
        role: "prompt",
        required: true
      }
    ]
  },
  "image-to-image": {
    id: "image-to-image",
    labelKey: "tool.image-to-image",
    materialType: "image",
    outputType: "image",
    acceptedInputTypes: ["text", "image"],
    modelCategory: "image",
    slots: [
      {
        slotId: "prompt",
        materialType: "text",
        role: "prompt",
        required: true
      },
      {
        slotId: "references",
        materialType: "image",
        role: "reference",
        required: false,
        dynamicMaxByModel: true
      }
    ]
  },
  // === Video Tools ===
  "video-generation": {
    id: "video-generation",
    labelKey: "tool.video-generation",
    materialType: "video",
    outputType: "video",
    acceptedInputTypes: ["text", "image", "video", "audio"],
    modelCategory: "video",
    slots: [
      {
        slotId: "prompt",
        materialType: "text",
        role: "prompt",
        required: true
      },
      {
        slotId: "references",
        materialType: "image",
        role: "reference",
        required: false,
        dynamicMaxByModel: true
      },
      {
        slotId: "audio_track",
        materialType: "audio",
        role: "audio_track",
        required: false
      }
    ]
  },
  "motion-mimicry": {
    id: "motion-mimicry",
    labelKey: "tool.motion-mimicry",
    materialType: "video",
    outputType: "video",
    acceptedInputTypes: ["text", "image", "video"],
    modelCategory: "video",
    slots: [
      {
        slotId: "motion_source",
        materialType: "video",
        role: "motion_source",
        required: true
      },
      {
        slotId: "character_image",
        materialType: "image",
        role: "reference",
        required: true
      }
    ]
  },
  "subtitle-render": {
    id: "subtitle-render",
    labelKey: "tool.subtitle-render",
    materialType: "video",
    outputType: "video",
    acceptedInputTypes: ["text", "video"],
    modelCategory: "video",
    slots: [
      {
        slotId: "video",
        materialType: "video",
        role: "reference",
        required: true
      },
      {
        slotId: "subtitles",
        materialType: "text",
        role: "prompt",
        required: true
      }
    ]
  },
  "digital-human": {
    id: "digital-human",
    labelKey: "tool.digital-human",
    materialType: "video",
    outputType: "video",
    acceptedInputTypes: ["text", "image", "video", "audio"],
    modelCategory: "video",
    slots: [
      {
        slotId: "character_image",
        materialType: "image",
        role: "reference",
        required: true
      },
      {
        slotId: "speech_audio",
        materialType: "audio",
        role: "audio_track",
        required: true
      },
      {
        slotId: "prompt",
        materialType: "text",
        role: "prompt",
        required: false
      }
    ]
  },
  // === Audio Tools ===
  "text-to-audio": {
    id: "text-to-audio",
    labelKey: "tool.text-to-audio",
    materialType: "audio",
    outputType: "audio",
    acceptedInputTypes: ["text"],
    modelCategory: "audio",
    slots: [
      {
        slotId: "prompt",
        materialType: "text",
        role: "prompt",
        required: true
      }
    ]
  },
  "text-to-music": {
    id: "text-to-music",
    labelKey: "tool.text-to-music",
    materialType: "audio",
    outputType: "audio",
    acceptedInputTypes: ["text"],
    modelCategory: "audio",
    slots: [
      {
        slotId: "prompt",
        materialType: "text",
        role: "prompt",
        required: true
      }
    ]
  },
  "video-to-audio": {
    id: "video-to-audio",
    labelKey: "tool.video-to-audio",
    materialType: "audio",
    outputType: "audio",
    acceptedInputTypes: ["video"],
    modelCategory: "audio",
    slots: [
      {
        slotId: "video",
        materialType: "video",
        role: "reference",
        required: true
      }
    ]
  },
  "voice-clone": {
    id: "voice-clone",
    labelKey: "tool.voice-clone",
    materialType: "audio",
    outputType: "audio",
    acceptedInputTypes: ["text", "audio"],
    modelCategory: "audio",
    slots: [
      {
        slotId: "prompt",
        materialType: "text",
        role: "prompt",
        required: true
      },
      {
        slotId: "voice_sample",
        materialType: "audio",
        role: "audio_track",
        required: true
      }
    ]
  },
  "audio-extract": {
    id: "audio-extract",
    labelKey: "tool.audio-extract",
    materialType: "audio",
    outputType: "audio",
    acceptedInputTypes: ["video"],
    modelCategory: "audio",
    slots: [
      {
        slotId: "video",
        materialType: "video",
        role: "reference",
        required: true
      }
    ]
  }
};
var materialNodeSpec = {
  type: "material",
  ports: [
    { side: "in", acceptedTypes: ["text", "image", "video", "audio"], multi: true },
    { side: "out", acceptedTypes: ["text", "image", "video", "audio"], multi: true }
  ],
  tools: materialTools,
  defaultTool: "text-editor",
  executorKey: "material"
};

// src/shared/specs/nodes/tableNodeSpec.ts
var tableNodeSpec = {
  type: "table",
  ports: [
    { side: "in", acceptedTypes: ["text", "image", "video", "audio"], multi: true },
    { side: "out", acceptedTypes: ["text", "image", "video", "audio"], multi: true }
  ],
  tools: {},
  defaultTool: "table",
  executorKey: "table"
};

// src/shared/specs/nodes/videoCompositionNodeSpec.ts
var videoCompositionNodeSpec = {
  type: "video_composition",
  ports: [
    { side: "in", acceptedTypes: ["text", "image", "video", "audio"], multi: true },
    { side: "out", acceptedTypes: ["video"], multi: true }
  ],
  tools: {},
  defaultTool: "video_composition",
  executorKey: "video_composition"
};

// src/shared/specs/nodes/groupNodeSpec.ts
var groupNodeSpec = {
  type: "group",
  ports: [],
  tools: {},
  defaultTool: "group",
  executorKey: "group"
};

// src/shared/specs/nodes/directorNodeSpec.ts
var directorNodeSpec = {
  type: "director",
  ports: [{ side: "in", acceptedTypes: ["text", "image"], multi: true }],
  tools: {},
  defaultTool: "director",
  executorKey: "director"
};

// src/shared/specs/registry.ts
var NodeSpecRegistryImpl = class {
  specs = /* @__PURE__ */ new Map();
  constructor() {
    this.registerBuiltins();
  }
  /**
   * Register a node specification into the registry.
   */
  register(spec) {
    this.specs.set(spec.type, spec);
  }
  /**
   * Get a node specification by its node type key.
   */
  get(type) {
    return this.specs.get(type);
  }
  /**
   * Get a specific tool specification under a node type.
   */
  getToolSpec(nodeType, toolId) {
    const spec = this.specs.get(nodeType);
    if (!spec) return void 0;
    return spec.tools[toolId];
  }
  /**
   * Get all registered node specifications.
   */
  getAll() {
    return Array.from(this.specs.values());
  }
  /**
   * Calculate accepted incoming connection material types for a node.
   *
   * 1. If a specific tool is provided and exists in spec.tools, returns the exact acceptedInputTypes of that tool.
   * 2. If a materialType is provided (or selectedTool matches a material type key), returns the union of acceptedInputTypes for all tools belonging to that material type.
   * 3. For material node with no tool/materialType specified, returns the union of all material tools.
   * 4. For non-material nodes, returns input port acceptedTypes (or empty array if no input port).
   * 5. For unknown/unregistered nodes, safely falls back to all four material types.
   */
  getNodeInputRequirements(nodeType, selectedTool, materialType) {
    const spec = this.specs.get(nodeType);
    if (!spec) {
      return { acceptedTypes: ["text", "image", "video", "audio"] };
    }
    if (nodeType === "material") {
      if (selectedTool && spec.tools[selectedTool]) {
        return { acceptedTypes: [...spec.tools[selectedTool].acceptedInputTypes] };
      }
      const targetMaterialType = materialType || (selectedTool && ["text", "image", "video", "audio"].includes(selectedTool) ? selectedTool : void 0);
      if (targetMaterialType) {
        const toolsForType = MATERIAL_TOOLS_BY_TYPE[targetMaterialType];
        if (toolsForType && toolsForType.length > 0) {
          const unionSet = /* @__PURE__ */ new Set();
          for (const toolId of toolsForType) {
            const tSpec = spec.tools[toolId];
            if (tSpec?.acceptedInputTypes) {
              for (const inType of tSpec.acceptedInputTypes) {
                unionSet.add(inType);
              }
            }
          }
          return { acceptedTypes: Array.from(unionSet) };
        }
      }
      const allUnionSet = /* @__PURE__ */ new Set();
      for (const tSpec of Object.values(spec.tools)) {
        if (tSpec?.acceptedInputTypes) {
          for (const inType of tSpec.acceptedInputTypes) {
            allUnionSet.add(inType);
          }
        }
      }
      return {
        acceptedTypes: allUnionSet.size > 0 ? Array.from(allUnionSet) : ["text", "image", "video", "audio"]
      };
    }
    const inPort = spec.ports.find((p) => p.side === "in");
    if (inPort) {
      return { acceptedTypes: [...inPort.acceptedTypes] };
    }
    if (spec.ports.length === 0 || !inPort) {
      return { acceptedTypes: [] };
    }
    return { acceptedTypes: ["text", "image", "video", "audio"] };
  }
  registerBuiltins() {
    this.register(materialNodeSpec);
    this.register(tableNodeSpec);
    this.register(videoCompositionNodeSpec);
    this.register(groupNodeSpec);
    this.register(directorNodeSpec);
  }
};
var NodeSpecRegistry = new NodeSpecRegistryImpl();

// src/shared/graph/materialNode.ts
function deriveMaterialToolInputTypes() {
  const result = {};
  const spec = NodeSpecRegistry.get("material");
  if (spec) {
    for (const [toolId, toolSpec] of Object.entries(spec.tools)) {
      result[toolId] = [...toolSpec.acceptedInputTypes];
    }
  }
  return result;
}
var MATERIAL_TOOL_INPUT_TYPES = deriveMaterialToolInputTypes();
function resolveNodeKind(data) {
  if (data.materialType === "text" && typeof data.content === "string" && data.content.trim().length > 0 && !data.generatedContent && (!data.prompt || !String(data.prompt).trim())) {
    return "import";
  }
  if (data.nodeKind === "generate" || data.nodeKind === "import") {
    return data.nodeKind;
  }
  if (data.selectedTool === "import") {
    return "import";
  }
  return "generate";
}

// src/shared/validation/declaredParameterValidation.ts
function entriesOf(definitions) {
  if (!definitions || typeof definitions !== "object" || Array.isArray(definitions)) return [];
  return Object.entries(definitions).filter(
    (entry) => Boolean(entry[1]) && typeof entry[1] === "object" && !Array.isArray(entry[1])
  );
}
function withinRange(range, value, allowAuto) {
  if (!range) return false;
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (allowAuto && value === -1) return true;
  const min = typeof range.min === "number" ? range.min : void 0;
  const max = typeof range.max === "number" ? range.max : void 0;
  const step = typeof range.step === "number" ? range.step : void 0;
  if (min !== void 0 && value < min) return false;
  if (max !== void 0 && value > max) return false;
  if (step !== void 0 && min !== void 0 && Math.abs((value - min) / step - Math.round((value - min) / step)) > Number.EPSILON) return false;
  return true;
}
function findDeclaredParameterFailure(values, operationParameters, modelParameters) {
  const definitions = {
    ...modelParameters ?? {},
    ...operationParameters ?? {}
  };
  for (const [field, definition] of entriesOf(definitions)) {
    const supplied = Object.prototype.hasOwnProperty.call(values, field) && values[field] !== void 0 && values[field] !== null && values[field] !== "";
    const hasDefault = Object.prototype.hasOwnProperty.call(definition, "defaultValue");
    if (!supplied && !hasDefault) continue;
    const value = supplied ? values[field] : definition.defaultValue;
    const options = Array.isArray(definition.options) ? definition.options : [];
    const range = definition.range && typeof definition.range === "object" && !Array.isArray(definition.range) ? definition.range : null;
    if (options.length > 0 || range) {
      const optionMatches = options.length > 0 && options.some((option) => {
        const candidate = option && typeof option === "object" && !Array.isArray(option) ? option.value : option;
        return Object.is(candidate, value) || definition.caseInsensitive === true && typeof candidate === "string" && typeof value === "string" && candidate.toLowerCase() === value.toLowerCase();
      });
      if (!optionMatches && !withinRange(range, value, definition.allowAuto === true)) {
        if (options.length === 0 && range) {
          if (typeof value !== "number" || !Number.isFinite(value)) {
            return { field, message: `\u53C2\u6570\u201C${field}\u201D\u5FC5\u987B\u4E3A\u6570\u5B57` };
          }
          return { field, message: `\u53C2\u6570\u201C${field}\u201D\u8D85\u51FA\u5408\u540C\u5141\u8BB8\u8303\u56F4` };
        }
        return { field, message: `\u53C2\u6570\u201C${field}\u201D\u4E0D\u652F\u6301\u503C ${JSON.stringify(value)}` };
      }
    }
    if (definition.supported === true && typeof value !== "boolean") {
      return { field, message: `\u53C2\u6570\u201C${field}\u201D\u5FC5\u987B\u4E3A\u5E03\u5C14\u503C` };
    }
    if (definition.supported === false && supplied) {
      return { field, message: `\u5F53\u524D\u6A21\u578B\u6216\u751F\u6210\u65B9\u5F0F\u4E0D\u652F\u6301\u53C2\u6570\u201C${field}\u201D` };
    }
    if (definition.type === "integer" && !Number.isInteger(value)) {
      return { field, message: `\u53C2\u6570\u201C${field}\u201D\u5FC5\u987B\u4E3A\u6574\u6570` };
    }
    if (typeof value === "string") {
      const length = Array.from(value).length;
      if (typeof definition.minLength === "number" && length < definition.minLength) {
        return { field, message: `\u53C2\u6570\u201C${field}\u201D\u5C11\u4E8E ${definition.minLength} \u4E2A\u5B57\u7B26` };
      }
      if (typeof definition.maxLength === "number" && length > definition.maxLength) {
        return { field, message: `\u53C2\u6570\u201C${field}\u201D\u8D85\u8FC7 ${definition.maxLength} \u4E2A\u5B57\u7B26` };
      }
    }
  }
  return null;
}

// src/shared/mediaMetadata.ts
function normalizeMimeType(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "unknown" || lower === "application/octet-stream" || lower === "binary/octet-stream") {
    return null;
  }
  return trimmed;
}
function normalizeMediaNumber(value) {
  if (value === null || value === void 0) return null;
  if (typeof value !== "number") {
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) return null;
      return parsed;
    }
    return null;
  }
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

// src/shared/graph/tableTextSerializer.ts
function sanitizeCellText(val) {
  if (val === null || val === void 0) return "";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") {
    return val.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
  }
  if (Array.isArray(val)) {
    return val.map((item) => {
      if (item && typeof item === "object" && "name" in item) {
        return `[\u9644\u4EF6: ${item.name || item.kind || "\u6587\u4EF6"}]`;
      }
      return String(item);
    }).join(", ");
  }
  return String(val);
}
function serializeTableToMarkdown(doc, options = {}) {
  if (!doc) return "";
  const columns = Array.isArray(doc.columns) ? doc.columns : [];
  const rows = Array.isArray(doc.rows) ? doc.rows : [];
  if (columns.length === 0 || rows.length === 0) {
    return "";
  }
  const visibleCols = columns.filter((col) => col.visible !== false);
  if (visibleCols.length === 0) return "";
  const { maxRows = 100, title = doc.title, tableOnly = false } = options;
  const headers = visibleCols.map((c) => c.title ? c.title.replace(/\|/g, "\\|").trim() : "\u672A\u547D\u540D\u5217");
  const headerLine = `| ${headers.join(" | ")} |`;
  const separatorLine = `| ${visibleCols.map(() => "---").join(" | ")} |`;
  const rowsToProcess = rows.slice(0, maxRows);
  const dataLines = [];
  for (const row of rowsToProcess) {
    if (!row || typeof row !== "object") continue;
    const cells = row.cells || {};
    const rowValues = visibleCols.map((col) => sanitizeCellText(cells[col.id]));
    dataLines.push(`| ${rowValues.join(" | ")} |`);
  }
  const tableBody = [headerLine, separatorLine, ...dataLines].join("\n");
  const titleHeader = !tableOnly && title?.trim() ? `### \u8868\u683C\uFF1A${title.trim()}
` : "";
  const truncation = rows.length > maxRows ? `

*(\u5DF2\u622A\u65AD\uFF0C\u4EC5\u5C55\u793A\u524D ${maxRows} \u884C\uFF0C\u5171 ${rows.length} \u884C)*` : "";
  return `${titleHeader}${tableBody}${truncation}`.trim();
}
function serializePreviewRowsToText(previewRows, title) {
  if (!Array.isArray(previewRows) || previewRows.length === 0) return "";
  const validRows = previewRows.filter((r) => typeof r === "string" && Boolean(r.trim())).map((r) => r.trim());
  if (validRows.length === 0) return "";
  const titleHeader = title?.trim() ? `### \u8868\u683C\uFF1A${title.trim()}
` : "";
  const listBody = validRows.map((row) => `- ${row}`).join("\n");
  return `${titleHeader}${listBody}`.trim();
}
var activeResolver;
function resolveTableDocument(tableId) {
  return activeResolver ? activeResolver(tableId) : void 0;
}
function serializeTableNodeToText(data, doc, fallbackTableId) {
  if (!data && !doc) return "";
  const nodeTitle = typeof data?.label === "string" && data.label.trim() ? data.label.trim() : typeof data?.title === "string" && data.title.trim() ? data.title.trim() : doc?.title;
  const tableId = typeof data?.tableId === "string" && data.tableId.trim() ? data.tableId.trim() : typeof data?.id === "string" && data.id.trim() ? data.id.trim() : typeof fallbackTableId === "string" && fallbackTableId.trim() ? fallbackTableId.trim() : void 0;
  const document = doc || data?.document || (tableId ? resolveTableDocument(tableId) : void 0);
  if (document && Array.isArray(document.rows) && document.rows.length > 0) {
    const md = serializeTableToMarkdown(document, { title: nodeTitle });
    if (md) return md;
  }
  if (Array.isArray(data?.previewRows) && data.previewRows.length > 0) {
    const previewText = serializePreviewRowsToText(data.previewRows, nodeTitle);
    if (previewText) return previewText;
  }
  return "";
}

// src/shared/graph/nodeInputSource.ts
function nonempty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function readCurrentText(data) {
  const current = typeof data.generatedContent === "string" ? data.generatedContent : data.content;
  return typeof current === "string" ? current : "";
}
function usableUrl(value) {
  const url = nonempty(value);
  if (!url || url.startsWith("blob:")) return void 0;
  if (/^https?:\/\//i.test(url) || /^data:(image|video|audio)\/[^,]+,.+/s.test(url)) return url;
  if (url.startsWith("/omnimux-workflow/") || url.startsWith("/media/")) return url;
  return void 0;
}
function mediaAsset(data, type, workspaceId) {
  const assets = Array.isArray(data.mediaAssets) ? data.mediaAssets : void 0;
  const current = assets?.find((asset2) => asset2 && typeof asset2 === "object" && asset2.type === type);
  const asset = current;
  const fields = asset ?? data;
  const relativePath = nonempty(fields.relativePath);
  const path = nonempty(fields.path) ?? nonempty(fields.realPath);
  const assetId = nonempty(fields.assetId);
  let url = usableUrl(asset ? asset.url : data.mediaUrl);
  if (relativePath && workspaceId) url = projectFileMediaUrl(workspaceId, relativePath);
  else if (path && looksAbsolutePath(path)) url = localFileMediaUrl(path);
  if (!url) return void 0;
  const mimeType = normalizeMimeType(fields.mimeType ?? data.mimeType);
  const sizeBytes = normalizeMediaNumber(fields.sizeBytes ?? data.sizeBytes ?? data.fileSize);
  const durationSec = normalizeMediaNumber(fields.durationSec ?? data.durationSec ?? data.duration);
  return {
    type,
    url,
    ...path && looksAbsolutePath(path) ? { path } : {},
    ...relativePath ? { relativePath } : {},
    ...assetId ? { assetId } : {},
    ...mimeType ? { mimeType } : {},
    ...sizeBytes !== null ? { sizeBytes } : {},
    ...durationSec !== null ? { durationSec } : {}
  };
}
function readNodeInputSource(node, workspaceId) {
  const data = node.data ?? {};
  const materialType = nonempty(data.materialType) ?? node.type ?? "text";
  const label = nonempty(data.label) ?? nonempty(data.title) ?? node.id;
  const selected = Array.isArray(data.mediaAssets) ? data.mediaAssets.find((asset) => asset && typeof asset === "object" && asset.type === materialType) : void 0;
  const fields = selected ?? data;
  const metadata = {
    mimeType: normalizeMimeType(fields.mimeType ?? data.mimeType) ?? void 0,
    sizeBytes: normalizeMediaNumber(fields.sizeBytes ?? data.sizeBytes ?? data.fileSize) ?? void 0,
    durationSec: normalizeMediaNumber(fields.durationSec ?? data.durationSec ?? data.duration) ?? void 0
  };
  const base = { nodeId: node.id, label, materialType, metadata };
  const missing = data.isMissing === true || data.fileMissing === true || data.fileCorrupted === true || data.isOffline === true || ["missing", "corrupted", "offline"].includes(String(data.status)) || ["missing", "corrupted", "error"].includes(String(data.probeStatus));
  if (missing) {
    return { ...base, availability: "unavailable", message: `\u201C${label}\u201D\u7684\u7D20\u6750\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u8BD5\u3001\u66FF\u6362\u6216\u79FB\u9664\u5F15\u7528`, output: {} };
  }
  let text = void 0;
  if (materialType === "text") {
    text = readCurrentText(data);
  } else if (materialType === "table") {
    const raw = serializeTableNodeToText(data, void 0, node.id);
    text = raw.trim() ? raw : void 0;
  }
  const media = materialType === "image" || materialType === "video" || materialType === "audio" ? mediaAsset(data, materialType, workspaceId) : void 0;
  const output = {
    ...text !== void 0 ? { text } : {},
    ...media ? { mediaAssets: [media] } : {}
  };
  if (text?.trim() || media) {
    const outputId = media?.assetId ?? media?.relativePath ?? media?.path ?? media?.url ?? (materialType === "table" ? nonempty(data.tableId) ?? `${node.id}:table` : void 0) ?? nonempty(data.taskId) ?? `${node.id}:current`;
    return {
      ...base,
      availability: "ready",
      output: text !== void 0 && nonempty(data.taskId) ? { ...output, assetId: outputId } : output,
      outputId
    };
  }
  const failed = ["error", "failed"].includes(String(data.status)) || ["error", "failed"].includes(String(data.executionStatus));
  return {
    ...base,
    availability: failed ? "unavailable" : "waiting",
    message: failed ? `\u201C${label}\u201D\u5C1A\u65E0\u53EF\u7528\u7ED3\u679C\uFF0C\u8BF7\u91CD\u8BD5\u6216\u79FB\u9664\u5F15\u7528` : `\u7B49\u5F85\u201C${label}\u201D\u7684${materialType === "text" ? "\u5185\u5BB9" : materialType === "table" ? "\u8868\u683C\u8BB0\u5F55" : "\u7D20\u6750\u6216\u7ED3\u679C"}`,
    output
  };
}

// src/shared/validation/executionReadiness.ts
function readString2(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function upstreamSnapshots(nodeId, graph) {
  return (graph?.edges ?? []).filter((edge) => edge.target === nodeId).flatMap((edge, ordinal) => {
    const node = graph.nodes.find((candidate) => candidate.id === edge.source);
    const source = readNodeInputSource(node ?? { id: edge.source }, graph?.workspaceId);
    const binding = edge.data?.slotBinding;
    const inputs = graph?.resolvedInputs?.get(edge.source) ?? [{
      nodeId: edge.source,
      label: source.label,
      outputId: source.outputId,
      materialType: node ? source.materialType : String(edge.data?.feedType ?? source.materialType),
      availability: source.availability,
      availabilityMessage: source.message,
      textContent: source.output.text,
      url: source.output.mediaAssets?.[0]?.url,
      ...source.metadata
    }];
    return inputs.map((input) => ({
      ...input,
      edgeId: edge.id ?? `feed-${edge.source}-${ordinal}`,
      role: typeof edge.data?.role === "string" ? edge.data.role : binding?.role,
      targetSlot: readExplicitTargetSlot(edge.data ?? {}, edge.targetHandle)
    }));
  });
}
function findExecutionReadinessFailure(nodes, catalog2, graph) {
  const view = buildContractView(catalog2);
  for (const node of nodes) {
    if (node.type !== "material" || resolveNodeKind(node.data ?? {}) !== "generate") continue;
    let upstreams = upstreamSnapshots(node.id, graph);
    const deferred = new Set(upstreams.filter((input) => {
      const source = graph?.nodes.find((candidate) => candidate.id === input.nodeId);
      return source?.type === "material" && resolveNodeKind(source.data ?? {}) === "generate" && graph?.scheduledNodeIds?.has(source.id);
    }).map((input) => input.nodeId));
    if (!view.available) return { nodeId: node.id, reasonCode: "catalog_unavailable", message: "\u6A21\u578B\u76EE\u5F55\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" };
    upstreams = upstreams.map((input) => deferred.has(input.nodeId) ? {
      nodeId: input.nodeId,
      label: input.label,
      materialType: input.materialType,
      edgeId: input.edgeId,
      role: input.role,
      targetSlot: input.targetSlot,
      availability: "ready",
      // Admission-only placeholder: dispatch revalidates the completed scheduled output.
      ...input.materialType === "text" ? { textContent: "__scheduled_text__" } : { url: "scheduled:pending" }
    } : input);
    const data = node.data ?? {};
    const inputBindingVersion = data.inputBindingVersion === 1 ? 1 : void 0;
    const params = data.params && typeof data.params === "object" ? data.params : {};
    const requestedModel = readString2(params.model);
    const outputKind = typeof data.materialType === "string" ? data.materialType : "text";
    const defaultModel = catalog2?.defaults?.[outputKind];
    const model = resolveModelView(view, requestedModel ?? defaultModel);
    if (!model) return { nodeId: node.id, reasonCode: "unknown_model", message: "\u5F53\u524D\u6A21\u578B\u4E0D\u53EF\u7528\uFF0C\u8BF7\u9009\u62E9\u6A21\u578B\u540E\u91CD\u8BD5" };
    const rawFingerprint = buildUiUpstreamFingerprint({
      materialType: typeof data.materialType === "string" ? data.materialType : void 0,
      prompt: typeof data.prompt === "string" ? data.prompt : "",
      content: typeof data.content === "string" ? data.content : void 0,
      upstreams,
      nodeFields: params
    });
    const outputType = typeof data.materialType === "string" ? data.materialType : void 0;
    const chosenId = inputBindingVersion === 1 && readString2(params.operation) ? readString2(params.operation) : resolveSlotOperation(catalog2, model.id, params.operation, outputType, rawFingerprint);
    const layout = deriveSlotLayout(catalog2, model.id, chosenId);
    const loaded = effectiveInputDisplay(
      layout,
      feedFromFingerprint(rawFingerprint, inputBindingVersion),
      data.slotBindings,
      data.slotConflicts ?? [],
      graph?.edges.filter((edge) => edge.target === node.id) ?? [],
      data.slotStandbyEdgeIds ?? [],
      inputBindingVersion
    );
    const { bindings, conflicts } = loaded;
    if (loaded.requiredUnavailable && !deferred.has(loaded.requiredUnavailable.occupant.sourceNodeId)) return {
      nodeId: node.id,
      reasonCode: inputBindingVersion === 1 ? loaded.records.find((record) => record.occupant.edgeId === loaded.requiredUnavailable.occupant.edgeId)?.reasonCode ?? "input_unavailable" : "input_unavailable",
      message: `\u6765\u6E90 ${loaded.requiredUnavailable.occupant.sourceNodeId} \u7684\u7D20\u6750\u5C1A\u4E0D\u53EF\u7528\uFF0C\u8BF7\u66FF\u6362\u6216\u505C\u7528`
    };
    const fingerprint = effectiveSlotFingerprint(rawFingerprint, layout, bindings, conflicts, inputBindingVersion);
    const unavailable = fingerprint.assets.find((asset) => asset.availability !== "ready" && !deferred.has(asset.sourceNodeId));
    if (unavailable) return {
      nodeId: node.id,
      reasonCode: unavailable.availability === "unavailable" ? "input_unavailable" : "input_waiting",
      message: unavailable.availabilityMessage ?? `\u7B49\u5F85\u6765\u6E90 ${unavailable.sourceNodeId} \u7684\u5185\u5BB9`
    };
    const opsState = buildEffectiveOpsUiState({
      catalog: catalog2,
      modelId: model.id,
      fingerprint,
      ...outputType ? { outputType } : {},
      ...readString2(params.operation) ? { preferredOperationId: readString2(params.operation) } : {}
    });
    const rawOperation = readString2(params.operation);
    const selectedOperationId = rawOperation ?? chosenId ?? opsState.selectedOperationId ?? opsState.implicitOperationId;
    const operation2 = selectedOperationId ? model.operations.find((candidate) => candidate.id === selectedOperationId && candidate.listed) : void 0;
    const selectedIsEffective = Boolean(
      selectedOperationId && opsState.effectiveOps.some((candidate) => candidate.id === selectedOperationId)
    );
    if (!operation2 || !selectedIsEffective) {
      return {
        nodeId: node.id,
        reasonCode: "operation_incompatible",
        message: rawOperation ? `\u5F53\u524D\u6A21\u578B\u4E0D\u652F\u6301\u5DF2\u4FDD\u5B58\u7684\u751F\u6210\u65B9\u5F0F ${rawOperation}` : opsState.reasonMessage ?? "\u5F53\u524D\u6A21\u578B\u6CA1\u6709\u53EF\u7528\u7684\u751F\u6210\u65B9\u5F0F"
      };
    }
    const catalogModel = (catalog2?.models ?? []).find(
      (candidate) => candidate.id === model.id || candidate.aliases?.includes(model.id)
    );
    const parameterFailure = findDeclaredParameterFailure(
      params,
      operation2.parameters,
      catalogModel?.parameters
    );
    if (parameterFailure) {
      return {
        nodeId: node.id,
        reasonCode: "parameter_unsupported",
        message: parameterFailure.message
      };
    }
    const match = matchOperationInputs(operation2, fingerprint);
    const missing = [...match.rejections, ...match.pending].find((failure) => {
      if (deferred.size === 0) return true;
      if (["input_waiting", "input_unavailable"].includes(failure.code)) {
        return !deferred.has(String(failure.meta?.sourceNodeId));
      }
      return !(failure.code === "prompt_required" && upstreams.some((input) => deferred.has(input.nodeId) && input.materialType === "text"));
    });
    if (missing) return { nodeId: node.id, reasonCode: missing.code, message: missing.message };
  }
  return null;
}

// src/workflow/execution/nodeExecutors.ts
var LOG_TAG = "nodeExecutors";
var logger2 = createWorkflowLogger(LOG_TAG);
function resolveExecutorKey(node) {
  if (node.type !== "material") return node.type;
  try {
    const kind = resolveNodeKind(node.data ?? {});
    return kind === "import" ? "material:import" : "material:generate";
  } catch (err) {
    logger2.warn("failed to resolve material node kind, falling back to generate", {
      nodeId: node.id,
      error: err instanceof Error ? err.message : String(err)
    });
    return "material:generate";
  }
}
function createDispatchingNodeExecutor(opts) {
  const mediaDir = (0, import_node_path6.resolve)(opts.mediaRoot, "executions", opts.executionId);
  const toPublicUrl = (absolutePath) => {
    const rel = (0, import_node_path6.relative)(opts.mediaRoot, (0, import_node_path6.resolve)(absolutePath));
    const normalized = rel.split("\\").join("/");
    if (normalized.startsWith("..")) {
      logger2.warn("artifact path escapes media root", { executionId: opts.executionId, absolutePath });
      return absolutePath;
    }
    return `${WORKFLOW_ROUTE_PREFIX}/media/${normalized}`;
  };
  const executor = async (node, context) => {
    const executorKey = resolveExecutorKey(node);
    const registryExecutor = getExecutor(executorKey);
    if (!registryExecutor) {
      throw new Error(`\u8282\u70B9\u7C7B\u578B ${node.type} \u6CA1\u6709\u6CE8\u518C\u6267\u884C\u5668\uFF08registry key: ${executorKey}\uFF09`);
    }
    node = structuredClone(node);
    const edges = structuredClone(opts.edges);
    const upstreamOutputs = structuredClone(resolveUpstreamOutputs(node, edges, context));
    const collecting = executorKey === "material:generate" && Boolean(context.readNodeUpstreamTask?.(node.id));
    const catalog2 = executorKey === "material:generate" && !collecting ? structuredClone(await opts.gateway.capabilities()) : void 0;
    const upstreamBindings = collecting ? [] : resolveUpstreamBindings(node, edges, { getNodeOutput: (id) => upstreamOutputs.get(id) }, catalog2);
    if (executorKey === "material:generate" && !collecting) {
      const resolvedInputs = new Map([...upstreamOutputs].map(([id, output2]) => {
        const media = (output2.mediaAssets ?? []).map((asset) => ({
          nodeId: id,
          materialType: asset.type,
          availability: "ready",
          url: asset.url || asset.relativePath || asset.path,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          durationSec: asset.durationSec
        }));
        const declaredType = edges.find((edge) => edge.target === node.id && edge.source === id)?.data?.feedType;
        return [id, media.length ? media : [{
          nodeId: id,
          materialType: typeof declaredType === "string" ? declaredType : "text",
          textContent: output2.text,
          availability: output2.text?.trim() ? "ready" : "waiting"
        }]];
      }));
      const failure = findExecutionReadinessFailure([node], catalog2, {
        nodes: [],
        edges,
        workspaceId: opts.workspaceId,
        resolvedInputs
      });
      if (failure) throw new Error(failure.message);
    }
    assertProjectWriteSafe(mediaDir, opts.mediaRoot);
    const ctx = {
      catalog: catalog2,
      upstreamOutputs,
      upstreamBindings,
      signal: opts.abortController.signal,
      mediaDir,
      workspaceId: opts.workspaceId,
      toPublicUrl,
      persistGenerated: opts.persistGenerated,
      // #1382: the executor reports the upstream task it just created and reads
      // back any reference a recovered node was re-pended with. Both are thin
      // closures over the execution context, which owns the persisted state.
      //
      // Guarded on purpose: a context double (tests, embedding code) need not
      // implement a bookkeeping channel that only affects post-restart behavior.
      // Losing it means "resubmit after a restart", never a failed generation.
      recordUpstreamTask: (ref) => context.setNodeUpstreamTask?.(node.id, ref),
      readUpstreamTask: () => context.readNodeUpstreamTask?.(node.id),
      clearUpstreamTask: () => context.clearNodeUpstreamTask?.(node.id),
      reportProgress: (progress, message) => {
        context.reportProgress(node.id, progress, message ?? "");
      }
    };
    const output = await registryExecutor.execute(
      { id: node.id, type: node.type, data: node.data ?? {} },
      ctx
    );
    for (const asset of output.mediaAssets ?? []) {
      context.addMediaAsset(node.id, { ...asset });
    }
    return output;
  };
  return { executor, mediaDir };
}
function resolveUpstreamBindings(node, edges, context, catalog2) {
  const bindings = [];
  const saved = node.data?.slotBindings;
  if (saved !== void 0 && catalog2) {
    const params = node.data?.params ?? {};
    const kind = node.data?.materialType ?? "text";
    const layout = deriveSlotLayout(catalog2, params.model ?? catalog2.defaults?.[kind], params.operation);
    const incoming = edges.filter((edge) => edge.target === node.id);
    if (node.data?.inputBindingVersion === 1) {
      const feed2 = incoming.map((edge, ordinal) => {
        const rawOutput = context.getNodeOutput(edge.source);
        const output = normalizeOutput(rawOutput);
        const asset = output.mediaAssets?.[0];
        const slot2 = layout.slots.find((item) => saved[item.slot]?.some((occupant) => occupant.edgeId === edge.id && occupant.sourceNodeId === edge.source));
        const type = asset?.type ?? (output.text !== void 0 ? "text" : void 0) ?? String(edge.data?.feedType ?? slot2?.type ?? "text");
        return {
          edgeId: edge.id ?? `feed-${edge.source}-${ordinal}`,
          sourceNodeId: edge.source,
          ordinal,
          type,
          outputId: asset?.assetId ?? asset?.relativePath ?? asset?.path ?? asset?.url ?? output.assetId,
          ...type === "text" ? { textContent: output.text } : {},
          url: asset?.url,
          pathOrUrl: asset?.relativePath || asset?.path,
          mimeType: asset?.mimeType,
          sizeBytes: asset?.sizeBytes,
          durationSec: asset?.durationSec,
          availability: rawOutput === void 0 ? "unavailable" : asset || type === "text" && output.text?.trim() ? "ready" : "waiting"
        };
      });
      const loaded = effectiveInputDisplay(
        layout,
        feed2,
        saved,
        node.data?.slotConflicts ?? [],
        [],
        node.data?.slotStandbyEdgeIds ?? [],
        1
      );
      for (const { slot: slot2, occupant, state } of loaded.records) {
        if (state !== "ready" && state !== "pending") continue;
        const edge = incoming.find((item) => item.id === occupant.edgeId && item.source === occupant.sourceNodeId);
        if (!edge) continue;
        bindings.push({
          edgeId: edge.id,
          sourceNodeId: edge.source,
          role: slot2.role,
          targetSlot: slot2.slot,
          output: structuredClone(normalizeOutput(context.getNodeOutput(edge.source)))
        });
      }
      const bound = new Set(bindings.map((item) => `${item.edgeId}:${item.sourceNodeId}`));
      for (const item of feed2) {
        if (bound.has(`${item.edgeId}:${item.sourceNodeId}`)) continue;
        bindings.push({
          edgeId: item.edgeId,
          sourceNodeId: item.sourceNodeId,
          output: structuredClone(normalizeOutput(context.getNodeOutput(item.sourceNodeId)))
        });
      }
      return bindings;
    }
    for (const edge of incoming) {
      const output = normalizeOutput(context.getNodeOutput(edge.source));
      const isMedia = output.mediaAssets?.length || ["image", "video", "audio"].includes(String(edge.data?.feedType)) || Object.values(saved).flat().some((item) => item.edgeId === edge.id);
      if (!isMedia) bindings.push({ edgeId: edge.id, sourceNodeId: edge.source, output: structuredClone(output) });
    }
    const feed = incoming.map((edge, ordinal) => {
      const output = normalizeOutput(context.getNodeOutput(edge.source));
      const asset = output.mediaAssets?.[0];
      const slot2 = layout.slots.find((item) => saved[item.slot]?.some((occupant) => occupant.edgeId === edge.id));
      return {
        edgeId: edge.id ?? `feed-${edge.source}-${ordinal}`,
        sourceNodeId: edge.source,
        ordinal,
        type: asset?.type ?? String(edge.data?.feedType ?? slot2?.type ?? "text"),
        url: asset?.url,
        pathOrUrl: asset?.relativePath || asset?.path,
        mimeType: asset?.mimeType,
        sizeBytes: asset?.sizeBytes,
        durationSec: asset?.durationSec,
        availability: asset ? "ready" : "waiting"
      };
    });
    for (const { slot: slot2, occupant } of effectiveInputDisplay(
      layout,
      feed,
      saved,
      node.data?.slotConflicts ?? [],
      [],
      node.data?.slotStandbyEdgeIds ?? []
    ).selected) {
      bindings.push({
        edgeId: occupant.edgeId,
        sourceNodeId: occupant.sourceNodeId,
        role: slot2.role,
        targetSlot: slot2.slot,
        output: structuredClone(normalizeOutput(context.getNodeOutput(occupant.sourceNodeId)))
      });
    }
    return bindings;
  }
  for (const edge of edges) {
    if (edge.target !== node.id) continue;
    const rawOutput = context.getNodeOutput(edge.source);
    if (rawOutput === void 0) continue;
    const edgeData = edge.data && typeof edge.data === "object" ? edge.data : {};
    const slotBinding = edgeData.slotBinding && typeof edgeData.slotBinding === "object" ? edgeData.slotBinding : void 0;
    const role = typeof edgeData.role === "string" && edgeData.role.trim() ? edgeData.role.trim() : typeof slotBinding?.role === "string" && slotBinding.role.trim() ? slotBinding.role.trim() : void 0;
    const targetSlot = readExplicitTargetSlot(edgeData, edge.targetHandle);
    bindings.push({
      ...edge.id ? { edgeId: edge.id } : {},
      sourceNodeId: edge.source,
      ...edge.sourceHandle !== void 0 ? { sourceHandle: edge.sourceHandle } : {},
      ...edge.targetHandle !== void 0 ? { targetHandle: edge.targetHandle } : {},
      ...role ? { role } : {},
      ...targetSlot ? { targetSlot } : {},
      output: normalizeOutput(rawOutput)
    });
  }
  return bindings;
}
function resolveUpstreamOutputs(node, edges, context) {
  const upstream = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    if (edge.target !== node.id) continue;
    const output = context.getNodeOutput(edge.source);
    if (output === void 0) continue;
    upstream.set(edge.source, normalizeOutput(output));
  }
  return upstream;
}
function normalizeOutput(output) {
  if (output && typeof output === "object" && ("text" in output || "mediaAssets" in output)) {
    return output;
  }
  return typeof output === "string" ? { text: output } : {};
}

// src/shared/graph/canvasInputSources.ts
function readCanvasParams(node) {
  const params = node.data?.params;
  return params && typeof params === "object" ? params : {};
}
function buildCanvasUpstreamFingerprint(targetId, nodes, edges, pendingSourceIds = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const target = byId.get(targetId);
  const incoming = [...edges.filter((edge) => edge.target === targetId), ...pendingSourceIds.map((source) => ({
    id: `pending-${source}-${targetId}`,
    source,
    target: targetId
  }))];
  const assets = incoming.flatMap((edge, ordinal) => {
    const source = byId.get(edge.source);
    if (!source) return [];
    const current = readNodeInputSource(source);
    const data = edge.data ?? {};
    const binding = data.slotBinding;
    return [{
      edgeId: edge.id ?? `feed-${edge.source}-${ordinal}`,
      sourceNodeId: source.id,
      sourceLabel: current.label,
      availability: current.availability,
      availabilityMessage: current.message,
      outputId: current.outputId,
      url: current.output.mediaAssets?.[0]?.url,
      textContent: current.output.text,
      type: current.materialType,
      ...current.metadata,
      role: typeof data.role === "string" ? data.role : binding?.role,
      targetSlot: readExplicitTargetSlot(data, edge.targetHandle)
    }];
  });
  return buildUpstreamFingerprint({
    prompt: resolveGenerationPrompt(target?.data ?? {}, target?.data.inputBindingVersion === 1 ? [] : selectGenerationTextSources(assets).map((asset) => asset.textContent)),
    localText: resolveGenerationPrompt(target?.data ?? {}),
    nodeFields: target ? readCanvasParams(target) : {},
    assets
  });
}

// src/shared/graph/feedSlot/prepareExecutionSlotGraph.ts
function prepareExecutionSlotGraph(nodes, edges, catalog2) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const view = buildContractView(catalog2);
  const ordinalByTarget = /* @__PURE__ */ new Map();
  const nextEdges = edges.map((edge) => {
    const ordinal = ordinalByTarget.get(edge.target) ?? 0;
    ordinalByTarget.set(edge.target, ordinal + 1);
    return {
      ...structuredClone(edge),
      id: edge.id ?? `feed-${edge.source}-${ordinal}`,
      data: { ...structuredClone(edge.data), feedType: readNodeInputSource(byId.get(edge.source) ?? { id: edge.source }).materialType }
    };
  });
  const nextNodes = nodes.map((node) => {
    if (node.type !== "material" || resolveNodeKind(node.data ?? {}) !== "generate") return structuredClone(node);
    const data = structuredClone(node.data ?? {});
    const params = data.params ?? {};
    const kind = data.materialType ?? "text";
    const model = resolveModelView(view, params.model ?? catalog2?.defaults?.[kind]);
    params.model ??= model?.id;
    params.operation ??= resolveSlotOperation(
      catalog2,
      model?.id,
      params.operation,
      kind,
      buildCanvasUpstreamFingerprint(node.id, nodes, nextEdges)
    );
    data.params = params;
    if (data.inputBindingVersion === 1) return { ...node, data };
    if (kind === "audio" && params.operation === "text_to_speech") {
      data.slotBindings = {};
      data.slotConflicts = [];
    }
    {
      const incoming = nextEdges.filter((edge) => edge.target === node.id);
      const feed = incoming.flatMap((edge, ordinal) => {
        const source = readNodeInputSource(byId.get(edge.source) ?? { id: edge.source });
        if (!["image", "video", "audio"].includes(source.materialType)) return [];
        return [{
          edgeId: edge.id ?? `feed-${edge.source}-${ordinal}`,
          sourceNodeId: edge.source,
          ordinal,
          type: source.materialType,
          outputId: source.outputId,
          availability: source.availability,
          url: source.output.mediaAssets?.[0]?.url,
          ...source.metadata
        }];
      });
      const layout = deriveSlotLayout(catalog2, model?.id, params.operation);
      const fill = effectiveInputDisplay(
        layout,
        feed,
        data.slotBindings,
        data.slotConflicts ?? [],
        incoming,
        data.slotStandbyEdgeIds ?? []
      );
      data.slotBindings = fill.bindings;
      data.slotConflicts = fill.conflicts;
    }
    return { ...node, data };
  });
  return { nodes: nextNodes, edges: nextEdges };
}

// src/workflow/execution/executionInputs.ts
function buildInitialOutputs(workspace, executedNodeIds, options) {
  const initialOutputs = {};
  for (const edge of workspace.edges) {
    if (!executedNodeIds.has(edge.target)) continue;
    const source = workspace.nodes.find((node) => node.id === edge.source);
    if (!source) continue;
    const scheduled = executedNodeIds.has(edge.source);
    if (scheduled && source.type === "material" && resolveNodeKind(source.data ?? {}) === "generate") continue;
    const resolved = readNodeInputSource(source, workspace.id);
    const target = workspace.nodes.find((node) => node.id === edge.target);
    const slots = target?.data?.slotBindings;
    if (slots !== void 0 && ["image", "video", "audio"].includes(resolved.materialType) && !Object.values(slots).flat().some((item) => item.edgeId === edge.id && item.sourceNodeId === edge.source)) continue;
    if (resolved.availability === "ready") {
      const output = {
        ...resolved.output,
        ...resolved.output.mediaAssets ? { mediaAssets: resolved.output.mediaAssets.map((asset) => {
          const source2 = resolveExecutionMediaSource(asset, { mediaDir: options?.mediaDir ?? "", ...options, workspaceId: workspace.id });
          return { ...asset, url: source2, path: source2.startsWith("/") ? source2 : void 0 };
        }) } : {}
      };
      if (!scheduled) initialOutputs[edge.source] = output;
    }
  }
  return initialOutputs;
}

// src/workflow/seam/submissionFixtures.mjs
function slot(type, role = "reference", min = 0, max = 4, name = `reference_${type}s`) {
  return { slot: name, type, role, min, max, source: "upstream_edge" };
}
function operation(id, type, inputs = [], promptRequired = true) {
  return { id, listed: true, output: { type }, inputs: [
    { slot: "prompt", role: "prompt", type: "text", source: "node_field", min: promptRequired ? 1 : 0, max: 1 },
    ...inputs
  ] };
}

// ../../tests/e2e/workflow-effective-input-fixtures.mjs
var catalog = { source: "static-stub", schemaVersion: "1.1", defaults: {}, models: [], text: [], image: [], video: [], audio: [] };
var operations = {
  text: [operation("text_to_text", "text"), operation("image_to_text", "text", [slot("image", "reference", 0, 4, "images")])],
  image: [operation("text_to_image", "image"), operation("image_to_image", "image", [slot("image", "reference", 1, 1, "images")])],
  video: [operation("text_to_video", "video"), operation("first_frame", "video", [slot("image", "first_frame", 1, 1, "first_frame")], false), operation("first_last_frame", "video", [slot("image", "first_frame", 1, 1, "first_frame"), slot("image", "last_frame", 1, 1, "last_frame")], false), operation("video_multi_ref", "video", [slot("image", "reference", 1, 3, "reference_images")], false)],
  audio: [operation("text_to_speech", "audio"), operation("text_to_music", "audio", [slot("audio", "reference", 0, 1, "reference_audio")])]
};
for (const type of Object.keys(operations)) {
  const model = { id: `qa-${type}`, label: `\u79BB\u7EBF${type}\u5939\u5177`, listed: true, operations: operations[type], parameterSchema: {} };
  catalog[type] = [model];
  catalog.models.push(model);
  catalog.defaults[type] = model.id;
}
var singleFrame = { id: "qa-single-frame", label: "\u5355\u9996\u5E27\u53C2\u6570\u5939\u5177", listed: true, parameterSchema: {}, operations: [{ ...operation("first_frame", "video", [slot("image", "first_frame", 1, 1, "first_frame")], false), parameters: { duration: { options: [{ value: 5 }], defaultValue: 5 } } }] };
catalog.video.push(singleFrame);
catalog.models.push(singleFrame);
var mediaOnly = { id: "qa-media-only", label: "\u79BB\u7EBF\u7EAF\u5A92\u4F53\u5939\u5177", listed: true, parameterSchema: {}, operations: [
  { id: "speech_to_text", listed: true, output: { type: "text" }, inputs: [slot("audio", "source", 1, 1, "audio")] },
  { id: "video_to_text", listed: true, output: { type: "text" }, inputs: [slot("video", "reference", 1, 1, "videos")] }
] };
catalog.text.push(mediaOnly);
catalog.models.push(mediaOnly);

// ../../tests/e2e/workflow-effective-input-capture.ts
async function capture(input, origin, mediaRoot) {
  const requests = [];
  const snapshot = structuredClone(input);
  const graph = prepareExecutionSlotGraph(snapshot.nodes, snapshot.edges, catalog);
  const target = graph.nodes.find((n) => n.id === snapshot.targetId);
  if (!target) return { requests, error: { message: "Target missing" }, snapshot };
  const readiness = findExecutionReadinessFailure([target], catalog, graph);
  if (readiness) return { requests, readiness, snapshot, prepared: graph };
  const gateway = {
    capabilities: async () => catalog,
    submit: async (request) => {
      requests.push(structuredClone(request));
      return { taskId: "offline-capture", mode: "stub" };
    },
    awaitTask: async () => {
      throw Object.assign(new Error("Offline fixture stops after gateway.submit; no generation or result finalization"), { code: "QA_CAPTURE_ONLY" });
    }
  };
  try {
    const outputs = buildInitialOutputs({ ...graph, id: "qa_1760" }, /* @__PURE__ */ new Set([target.id]), { mediaDir: mediaRoot, resolveProjectFile: () => {
      throw new Error("Filesystem media prohibited in fixture");
    } });
    registerExecutor(createMaterialGatewayExecutor({ gateway }));
    await createDispatchingNodeExecutor({ gateway, edges: graph.edges, mediaRoot, executionId: "qa_1760", abortController: new AbortController() }).executor(target, {
      getNodeOutput: (id) => outputs[id],
      reportProgress() {
      },
      addMediaAsset() {
      }
    });
    return { requests, snapshot, prepared: graph };
  } catch (error) {
    if (error.code === "QA_CAPTURE_ONLY") return { requests, captureOnly: true, generationCompleted: false, snapshot, prepared: graph };
    return { requests, error: { message: error.message, code: error.code }, snapshot, prepared: graph };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  capture
});
