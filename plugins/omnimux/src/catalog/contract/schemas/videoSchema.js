/**
 * Video model parameters and slot duration validation operators.
 */

import { issue } from './commonSchema.js';

export const VIDEO_DURATION_FIELDS = [
  'minDurationSec',
  'maxDurationSec',
  'totalMinDurationSec',
  'totalMaxDurationSec',
  'combinedOutputMaxDurationSec',
];

export const VIDEO_EXCLUSIVE_FIELDS = [
  'totalMinExclusive',
  'totalMaxExclusive',
];

/**
 * Check single duration numeric field.
 */
function checkDurationField(field, slot, context) {
  const { basePath, options, out } = context;
  const value = slot[field];
  if (value === undefined || value === null) return;
  const isInvalid = typeof value !== 'number' || !Number.isFinite(value) || value < 0;
  if (isInvalid) {
    out.push(
      issue('schema_invalid', `invalid ${field} at ${basePath}`, {
        modelId: options.modelId,
        path: `${basePath}.${field}`,
        file: options.file,
      }),
    );
  }
}

/**
 * Check single exclusive boolean flag field.
 */
function checkExclusiveField(field, slot, context) {
  const { basePath, options, out } = context;
  const value = slot[field];
  if (value === undefined || value === null) return;
  if (typeof value !== 'boolean') {
    out.push(
      issue('schema_invalid', `invalid ${field} at ${basePath}`, {
        modelId: options.modelId,
        path: `${basePath}.${field}`,
        file: options.file,
      }),
    );
  }
}

/**
 * Validate video slot duration fields and exclusive flags.
 * @param {Record<string, unknown>} slot
 * @param {string} basePath
 * @param {{ modelId?: string, file?: string }} [options]
 * @returns {object[]}
 */
export function validateSlotDurations(slot, basePath, options = {}) {
  const out = [];
  const context = { basePath, options, out };
  for (const field of VIDEO_DURATION_FIELDS) {
    checkDurationField(field, slot, context);
  }
  for (const field of VIDEO_EXCLUSIVE_FIELDS) {
    checkExclusiveField(field, slot, context);
  }
  return out;
}

/**
 * Check if a slot carries any video duration fields.
 * @param {Record<string, unknown>} slot
 * @returns {boolean}
 */
export function hasVideoDurationFields(slot) {
  if (!slot || typeof slot !== 'object') return false;
  return VIDEO_DURATION_FIELDS.some((field) => slot[field] !== undefined && slot[field] !== null);
}
