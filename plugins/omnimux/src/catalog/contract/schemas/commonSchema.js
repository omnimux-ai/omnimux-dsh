/**
 * Core schema constants, loaders, and foundational validation operators.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACT_DIR = join(__dirname, '..');

export const OUTPUT_TYPES = new Set(['text', 'image', 'video', 'audio']);
export const MEDIA_TYPES = new Set(['text', 'image', 'video', 'audio', 'document']);
export const LIMIT_KINDS = new Set(['official_docs', 'measured', 'policy_conservative']);
export const SLOT_SOURCES = new Set(['user', 'upstream_edge', 'node_field']);
export const PROMPT_POLICIES = new Set(['required', 'optional', 'none']);
export const PROFILE_STATUSES = new Set(['live', 'stub', 'unavailable']);

/**
 * Canonical operation count lock (registry SSOT).
 */
export const EXPECTED_OPERATION_COUNT = 21;

/** Canonical model-capability Contract v1.1 schemaVersion literal. */
export const CANONICAL_SCHEMA_VERSION = '1.1';

/** @type {object|null} */
let cachedRegistry = null;
/** @type {object|null} */
let cachedProfiles = null;
/** @type {object|null} */
let cachedSchema = null;

/**
 * @returns {object}
 */
export function loadOperationRegistry() {
  if (cachedRegistry) return cachedRegistry;
  const raw = readFileSync(join(CONTRACT_DIR, 'operation-registry.json'), 'utf8');
  cachedRegistry = JSON.parse(raw);
  return cachedRegistry;
}

/**
 * @returns {object}
 */
export function loadAdapterProfiles() {
  if (cachedProfiles) return cachedProfiles;
  const raw = readFileSync(join(CONTRACT_DIR, 'adapter-profiles.json'), 'utf8');
  cachedProfiles = JSON.parse(raw);
  return cachedProfiles;
}

/**
 * @returns {object}
 */
export function loadJsonSchema() {
  if (cachedSchema) return cachedSchema;
  const raw = readFileSync(join(CONTRACT_DIR, 'model-capability.schema.json'), 'utf8');
  cachedSchema = JSON.parse(raw);
  return cachedSchema;
}

/**
 * @returns {void}
 */
export function resetSchemaCaches() {
  cachedRegistry = null;
  cachedProfiles = null;
  cachedSchema = null;
}

/**
 * @param {object} [registry]
 * @returns {Set<string>}
 */
export function operationIdSet(registry) {
  const target = registry || loadOperationRegistry();
  let operations = [];
  if (target && Array.isArray(target.operations)) {
    operations = target.operations;
  }
  const ids = [];
  for (const op of operations) {
    if (op && op.id) ids.push(op.id);
  }
  return new Set(ids);
}

/**
 * @param {string} opId
 * @param {object} [registry]
 * @returns {'required'|'optional'|'none'|undefined}
 */
export function promptPolicyFor(opId, registry) {
  const target = registry || loadOperationRegistry();
  let operations = [];
  if (target && Array.isArray(target.operations)) {
    operations = target.operations;
  }
  let matchedPolicy = undefined;
  for (const op of operations) {
    if (op && op.id === opId) {
      matchedPolicy = op.promptPolicy;
      break;
    }
  }
  if (!matchedPolicy) return undefined;
  if (!PROMPT_POLICIES.has(matchedPolicy)) return undefined;
  return matchedPolicy;
}

/**
 * Construct standard validation issue object.
 * @param {string} code
 * @param {string} message
 * @param {{ modelId?: string, path?: string, file?: string, level?: 'error'|'warning'|'info', operationId?: string }} [extra]
 * @returns {object}
 */
export function issue(code, message, extra = {}) {
  const level = extra.level || 'error';
  const out = { level, code, message };
  if (extra.modelId) out.modelId = extra.modelId;
  if (extra.operationId) out.operationId = extra.operationId;
  if (extra.path) out.path = extra.path;
  if (extra.file) out.file = extra.file;
  return out;
}

/**
 * Validate individual MIME item in array.
 */
function validateSingleMimeItem(item, index, context) {
  const { path, options, seen, out } = context;
  const itemPath = `${path}[${index}]`;
  if (typeof item !== 'string' || item.trim().length === 0) {
    out.push(
      issue('allowed_mimes_invalid', `allowedMimes[${index}] must be nonempty string at ${path}`, {
        modelId: options.modelId,
        path: itemPath,
        file: options.file,
      }),
    );
    return;
  }
  if (seen.has(item)) {
    out.push(
      issue('allowed_mimes_invalid', `allowedMimes duplicate "${item}" at ${path}`, {
        modelId: options.modelId,
        path: itemPath,
        file: options.file,
      }),
    );
  }
  seen.add(item);
}

/**
 * Validate allowedMimes array of nonempty unique strings.
 * @param {unknown} value
 * @param {string} path
 * @param {string} [modelId]
 * @param {string} [file]
 * @returns {object[]}
 */
export function validateAllowedMimes(value, path, modelId, file) {
  const out = [];
  const options = { modelId, file };
  if (!Array.isArray(value)) {
    out.push(issue('allowed_mimes_invalid', `allowedMimes must be a nonempty string array at ${path}`, {
      modelId,
      path,
      file,
    }));
    return out;
  }
  if (value.length === 0) {
    out.push(issue('allowed_mimes_invalid', `allowedMimes must be nonempty at ${path}`, {
      modelId,
      path,
      file,
    }));
    return out;
  }
  const seen = new Set();
  const context = { path, options, seen, out };
  for (let i = 0; i < value.length; i++) {
    validateSingleMimeItem(value[i], i, context);
  }
  return out;
}

/**
 * Check min boundary legality.
 */
function checkMinBound(min, context) {
  const { path, options, code, out } = context;
  if (min === undefined || min === null) return;
  const isInvalidType = typeof min !== 'number';
  const isNotFinite = !Number.isFinite(min);
  const isNegative = min < 0;
  if (isInvalidType || isNotFinite || isNegative) {
    out.push(
      issue(code, `min must be a finite nonnegative number at ${path}`, {
        modelId: options.modelId,
        path: `${path}.min`,
        file: options.file,
      }),
    );
  }
}

/**
 * Check max boundary legality.
 */
function checkMaxBound(max, context) {
  const { path, options, code, out } = context;
  if (max === undefined || max === null) return;
  const isInvalidType = typeof max !== 'number';
  const isNotFinite = !Number.isFinite(max);
  const isNegative = max < 0;
  if (isInvalidType || isNotFinite || isNegative) {
    out.push(
      issue(code, `max must be a finite nonnegative number at ${path}`, {
        modelId: options.modelId,
        path: `${path}.max`,
        file: options.file,
      }),
    );
  }
}

/**
 * Validate min/max pair for numeric values.
 * @param {unknown} min
 * @param {unknown} max
 * @param {string} path
 * @param {{ modelId?: string, file?: string, code?: string }|string} [opts]
 * @returns {object[]}
 */
export function validateMinMaxPair(min, max, path, opts = {}) {
  let options = opts;
  if (typeof opts === 'string') {
    options = { modelId: opts };
  }
  const errCode = options.code || 'slot_minmax_invalid';
  const out = [];
  const context = { path, options, code: errCode, out };

  checkMinBound(min, context);
  checkMaxBound(max, context);

  const minValid = typeof min === 'number' && Number.isFinite(min);
  const maxValid = typeof max === 'number' && Number.isFinite(max);
  if (minValid && maxValid && min > max) {
    out.push(
      issue(errCode, `min (${min}) > max (${max}) at ${path}`, {
        modelId: options.modelId,
        path,
        file: options.file,
      }),
    );
  }
  return out;
}

/**
 * Check if a number is an invalid slot integer count.
 */
function isInvalidSlotInt(value) {
  if (typeof value !== 'number') return true;
  if (!Number.isFinite(value)) return true;
  if (value < 0) return true;
  return !Number.isInteger(value);
}

/**
 * Slot min/max must be nonnegative integers (cardinality).
 * @param {unknown} min
 * @param {unknown} max
 * @param {string} path
 * @param {{ modelId?: string, file?: string }|string} [opts]
 * @returns {object[]}
 */
export function validateSlotMinMax(min, max, path, opts = {}) {
  let options = opts;
  if (typeof opts === 'string') {
    options = { modelId: opts };
  }
  const out = [];
  if (isInvalidSlotInt(min)) {
    out.push(issue('slot_minmax_invalid', `slot.min must be a nonnegative integer at ${path}`, {
      modelId: options.modelId,
      path: `${path}.min`,
      file: options.file,
    }));
  }
  if (max !== null && isInvalidSlotInt(max)) {
    out.push(issue('slot_minmax_invalid', `slot.max must be a nonnegative integer at ${path}`, {
      modelId: options.modelId,
      path: `${path}.max`,
      file: options.file,
    }));
  }
  const validMinInt = typeof min === 'number' && Number.isInteger(min);
  const validMaxInt = typeof max === 'number' && Number.isInteger(max);
  if (validMinInt && validMaxInt && min > max) {
    out.push(issue('slot_minmax_invalid', `slot min (${min}) > max (${max}) at ${path}`, {
      modelId: options.modelId,
      path,
      file: options.file,
    }));
  }
  return out;
}

/**
 * Validate limitSource block.
 * @param {unknown} value
 * @param {string} path
 * @param {string} [modelId]
 * @param {string} [file]
 * @returns {object[]}
 */
export function validateLimitSource(value, path, modelId, file) {
  const out = [];
  if (value == null) {
    out.push(issue('limit_source_missing', `missing limitSource at ${path}`, { modelId, path, file }));
    return out;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    out.push(issue('schema_invalid', `limitSource must be object at ${path}`, { modelId, path, file }));
    return out;
  }
  const kind = /** @type {Record<string, unknown>} */ (value).kind;
  if (typeof kind !== 'string' || !LIMIT_KINDS.has(kind)) {
    out.push(
      issue('schema_invalid', `limitSource.kind invalid at ${path}`, {
        modelId,
        path: `${path}.kind`,
        file,
      }),
    );
  }
  return out;
}

/**
 * Validate aliases string item.
 */
function validateSingleAliasItem(alias, index, context) {
  const { path, options, seen, out } = context;
  const itemPath = `${path}[${index}]`;
  if (typeof alias !== 'string' || alias.trim().length === 0) {
    out.push(
      issue('duplicate_alias', `aliases[${index}] must be nonempty string at ${path}`, {
        modelId: options.modelId,
        path: itemPath,
        file: options.file,
      }),
    );
    return;
  }
  if (seen.has(alias)) {
    out.push(
      issue('duplicate_alias', `duplicate alias "${alias}" at ${path}`, {
        modelId: options.modelId,
        path: itemPath,
        file: options.file,
      }),
    );
  }
  seen.add(alias);
}

/**
 * Validate aliases array.
 * @param {unknown} aliases
 * @param {string} path
 * @param {string} [modelId]
 * @param {string} [file]
 * @returns {object[]}
 */
export function validateAliasesArray(aliases, path, modelId, file) {
  const out = [];
  if (aliases == null) return out;
  const options = { modelId, file };
  if (!Array.isArray(aliases)) {
    out.push(issue('duplicate_alias', `aliases must be a nonempty unique string array at ${path}`, {
      modelId,
      path,
      file,
    }));
    return out;
  }
  if (aliases.length === 0) {
    out.push(issue('duplicate_alias', `aliases must be nonempty at ${path}`, {
      modelId,
      path,
      file,
    }));
    return out;
  }
  const seen = new Set();
  const context = { path, options, seen, out };
  for (let i = 0; i < aliases.length; i++) {
    validateSingleAliasItem(aliases[i], i, context);
  }
  return out;
}
