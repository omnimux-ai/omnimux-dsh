/**
 * Parameter domain (`parameters`) structural validation operators.
 *
 * Offline validation: no network or provider probing. Applies to model-level
 * and operation-level declarations. Known structure keeps its own diagnostics;
 * consumed defaults additionally require a proven packaged-domain member.
 * Extensions without a consumed default do not close the parameter namespace.
 */

import { evaluateDeclaredParameters } from '../../../../lib/generation-core.js';
import { issue } from './commonSchema.js';

/** Error codes emitted by this module (registered in ADMISSION_ERROR_CODES). */
export const PARAMETER_ERROR_CODES = new Set([
  'parameter_definition_invalid',
  'parameter_length_bound_invalid',
  'parameter_options_invalid',
  'parameter_default_unmatched',
  'parameter_range_invalid',
  'parameter_step_invalid',
  'parameter_flag_invalid',
  'parameter_unit_invalid',
]);

/** Feature-flag booleans on a parameter definition. */
const BOOLEAN_FLAGS = ['allowAuto', 'supported', 'caseInsensitive'];

/** Prompt/text length bounds. */
const LENGTH_FIELDS = ['minLength', 'maxLength'];

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isScalar(value) {
  const type = typeof value;
  return value === null || type === 'string' || (type === 'number' && Number.isFinite(value)) || type === 'boolean';
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Type-tagged option identity so `1` and `"1"` never compare equal.
 * @param {unknown} value
 * @param {boolean} caseInsensitive
 * @returns {string|null} null when the value is not a scalar
 */
function valueKey(value, caseInsensitive) {
  if (!isScalar(value)) return null;
  if (typeof value === 'string') return `string:${caseInsensitive ? value.toLowerCase() : value}`;
  return `${typeof value}:${String(value)}`;
}

/**
 * @param {Record<string, unknown>} def
 * @returns {boolean}
 */
function isCaseInsensitive(def) {
  return def.caseInsensitive === true;
}

/**
 * Validate minLength/maxLength bounds.
 * @param {Record<string, unknown>} def
 * @param {string} path
 * @param {{ modelId?: string, file?: string }} ctx
 * @param {object[]} out
 * @returns {void}
 */
function validateLengthBounds(def, path, ctx, out) {
  /** @type {Record<string, number>} */
  const bounds = {};
  for (const field of LENGTH_FIELDS) {
    const raw = def[field];
    if (raw === undefined) continue;
    const isValid = isFiniteNumber(raw) && Number.isInteger(raw) && raw > 0;
    if (!isValid) {
      out.push(
        issue('parameter_length_bound_invalid', `${field} must be a positive integer at ${path}`, {
          ...ctx,
          path: `${path}.${field}`,
        }),
      );
      continue;
    }
    bounds[field] = raw;
  }
  const hasBoth = bounds.minLength !== undefined && bounds.maxLength !== undefined;
  if (hasBoth && bounds.minLength > bounds.maxLength) {
    out.push(
      issue(
        'parameter_length_bound_invalid',
        `minLength (${bounds.minLength}) > maxLength (${bounds.maxLength}) at ${path}`,
        { ...ctx, path },
      ),
    );
  }
}

/**
 * Validate boolean feature flags.
 * @param {Record<string, unknown>} def
 * @param {string} path
 * @param {{ modelId?: string, file?: string }} ctx
 * @param {object[]} out
 * @returns {void}
 */
function validateBooleanFlags(def, path, ctx, out) {
  for (const flag of BOOLEAN_FLAGS) {
    const raw = def[flag];
    if (raw === undefined) continue;
    if (typeof raw !== 'boolean') {
      out.push(
        issue('parameter_flag_invalid', `${flag} must be boolean at ${path}`, {
          ...ctx,
          path: `${path}.${flag}`,
        }),
      );
    }
  }
  // A boolean switch (`supported`) carries a boolean default.
  if (typeof def.supported === 'boolean' && def.defaultValue !== undefined && typeof def.defaultValue !== 'boolean') {
    out.push(
      issue(
        'parameter_flag_invalid',
        `defaultValue of a boolean switch must be boolean at ${path}`,
        { ...ctx, path: `${path}.defaultValue` },
      ),
    );
  }
}

/**
 * Validate unit string.
 * @param {Record<string, unknown>} def
 * @param {string} path
 * @param {{ modelId?: string, file?: string }} ctx
 * @param {object[]} out
 * @returns {void}
 */
function validateUnit(def, path, ctx, out) {
  const raw = def.unit;
  if (raw === undefined) return;
  const isValid = typeof raw === 'string' && raw.trim().length > 0;
  if (!isValid) {
    out.push(
      issue('parameter_unit_invalid', `unit must be a nonempty string at ${path}`, {
        ...ctx,
        path: `${path}.unit`,
      }),
    );
  }
}

/**
 * Validate range block (min/max/step). An empty `range: {}` carries no bound.
 * @param {Record<string, unknown>} def
 * @param {string} path
 * @param {{ modelId?: string, file?: string }} ctx
 * @param {object[]} out
 * @returns {{ min?: number, max?: number }|null} numeric domain, null when unusable
 */
function validateRange(def, path, ctx, out) {
  const range = def.range;
  if (range === undefined) return null;
  if (!isPlainObject(range)) {
    out.push(
      issue('parameter_range_invalid', `range must be an object at ${path}`, {
        ...ctx,
        path: `${path}.range`,
      }),
    );
    return null;
  }
  for (const field of ['min', 'max']) {
    const raw = range[field];
    if (raw === undefined) continue;
    if (!isFiniteNumber(raw)) {
      out.push(
        issue('parameter_range_invalid', `range.${field} must be a finite number at ${path}`, {
          ...ctx,
          path: `${path}.range.${field}`,
        }),
      );
    }
  }
  if (isFiniteNumber(range.min) && isFiniteNumber(range.max) && range.min > range.max) {
    out.push(
      issue('parameter_range_invalid', `range.min (${range.min}) > range.max (${range.max}) at ${path}`, {
        ...ctx,
        path: `${path}.range`,
      }),
    );
  }
  if (range.step !== undefined && !(isFiniteNumber(range.step) && range.step > 0)) {
    out.push(
      issue('parameter_step_invalid', `range.step must be a positive number at ${path}`, {
        ...ctx,
        path: `${path}.range.step`,
      }),
    );
  }
  return {
    min: isFiniteNumber(range.min) ? range.min : undefined,
    max: isFiniteNumber(range.max) ? range.max : undefined,
  };
}

/**
 * Collect declared option values, reporting malformed entries and duplicates.
 * @param {Record<string, unknown>} def
 * @param {string} path
 * @param {{ modelId?: string, file?: string }} ctx
 * @param {object[]} out
 * @returns {Set<string>|null} value keys, null when `options` is structurally unusable
 */
function validateOptions(def, path, ctx, out) {
  const options = def.options;
  if (options === undefined) return null;
  if (!Array.isArray(options) || options.length === 0) {
    out.push(
      issue('parameter_options_invalid', `options must be a nonempty array at ${path}`, {
        ...ctx,
        path: `${path}.options`,
      }),
    );
    return null;
  }
  const caseInsensitive = isCaseInsensitive(def);
  const keys = new Set();
  for (let i = 0; i < options.length; i++) {
    const item = options[i];
    const isObjectItem = isPlainObject(item);
    const value = isObjectItem ? item.value : item;
    const isValidItem = (isObjectItem ? value !== undefined : true) && isScalar(value);
    if (!isValidItem) {
      out.push(
        issue('parameter_options_invalid', `options[${i}] must be a scalar or an object with "value" at ${path}`, {
          ...ctx,
          path: `${path}.options[${i}]`,
        }),
      );
      continue;
    }
    const key = valueKey(value, caseInsensitive);
    if (keys.has(key)) {
      out.push(
        issue('parameter_options_invalid', `duplicate option value ${JSON.stringify(value)} at ${path}`, {
          ...ctx,
          path: `${path}.options[${i}].value`,
        }),
      );
      continue;
    }
    keys.add(key);
  }
  return keys;
}

/**
 * Defaults use the packaged domain kernel; structure issues keep their original
 * code and location and are reported before domain evaluation.
 * @param {Record<string, unknown>} def
 * @param {string} path
 * @param {{ modelId?: string, file?: string }} ctx
 * @param {object[]} out
 */
function validateDefaultValue(def, path, ctx, out) {
  if (!Object.prototype.hasOwnProperty.call(def, 'defaultValue') || out.length > 0) return;
  const result = evaluateDeclaredParameters({}, { value: def }, undefined, { mode: 'legacyGuard' });
  if (result.ok) return;
  // Raw registered voice structure is not execution readiness; load resolves it first.
  if (path.endsWith('.voice') && def.optionsFrom === 'volcengine-voice-index'
    && def.options === undefined && def.range === undefined
    && result.result.status === 'indeterminate' && result.result.diagnostic === 'unresolved_options') return;
  out.push(issue('parameter_default_unmatched',
    `defaultValue ${JSON.stringify(def.defaultValue)} is not declared by options/range at ${path}`,
    { ...ctx, path: `${path}.defaultValue` }));
}

/**
 * Validate a single parameter definition object.
 * @param {Record<string, unknown>} def
 * @param {string} path
 * @param {{ modelId?: string, file?: string }} ctx
 * @returns {object[]}
 */
function validateParameterDefinition(def, path, ctx) {
  const out = [];
  validateLengthBounds(def, path, ctx, out);
  validateBooleanFlags(def, path, ctx, out);
  validateUnit(def, path, ctx, out);
  validateOptions(def, path, ctx, out);
  validateRange(def, path, ctx, out);
  validateDefaultValue(def, path, ctx, out);
  return out;
}

/**
 * Validate a `parameters` block (model-level or operation-level).
 * @param {unknown} parameters
 * @param {string} basePath
 * @param {string} [modelId]
 * @param {string} [file]
 * @returns {object[]}
 */
export function validateParameterDomain(parameters, basePath, modelId, file) {
  const out = [];
  const ctx = { modelId, file };
  if (parameters === undefined || parameters === null) return out;
  if (!isPlainObject(parameters)) {
    out.push(
      issue('parameter_definition_invalid', `parameters must be an object at ${basePath}`, {
        ...ctx,
        path: basePath,
      }),
    );
    return out;
  }
  for (const [paramKey, def] of Object.entries(parameters)) {
    const path = `${basePath}.${paramKey}`;
    if (!isPlainObject(def)) {
      out.push(
        issue('parameter_definition_invalid', `parameter "${paramKey}" definition must be an object at ${path}`, {
          ...ctx,
          path,
        }),
      );
      continue;
    }
    out.push(...validateParameterDefinition(def, path, ctx));
  }
  return out;
}
