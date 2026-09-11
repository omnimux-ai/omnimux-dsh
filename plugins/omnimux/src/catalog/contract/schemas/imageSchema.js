/**
 * Image model parameters and slot file-size validation operators.
 */

import { issue } from './commonSchema.js';

/**
 * Validate slot file size limits (maxSizeMb & maxSizeExclusive).
 * @param {Record<string, unknown>} slot
 * @param {string} basePath
 * @param {{ modelId?: string, file?: string }} [options]
 * @returns {object[]}
 */
export function validateSlotSizes(slot, basePath, options = {}) {
  const out = [];
  if (slot.maxSizeMb !== undefined && slot.maxSizeMb !== null) {
    const isInvalidSize = typeof slot.maxSizeMb !== 'number' || !Number.isFinite(slot.maxSizeMb) || slot.maxSizeMb < 0;
    if (isInvalidSize) {
      out.push(
        issue('schema_invalid', `invalid maxSizeMb at ${basePath}`, {
          modelId: options.modelId,
          path: `${basePath}.maxSizeMb`,
          file: options.file,
        }),
      );
    }
  }

  if (slot.maxSizeExclusive !== undefined && slot.maxSizeExclusive !== null) {
    if (typeof slot.maxSizeExclusive !== 'boolean') {
      out.push(
        issue('schema_invalid', `invalid maxSizeExclusive at ${basePath}`, {
          modelId: options.modelId,
          path: `${basePath}.maxSizeExclusive`,
          file: options.file,
        }),
      );
    }
  }
  return out;
}

/**
 * Check if a slot carries any size limit fields.
 * @param {Record<string, unknown>} slot
 * @returns {boolean}
 */
export function hasSizeLimitFields(slot) {
  if (!slot || typeof slot !== 'object') return false;
  return slot.maxSizeMb !== undefined && slot.maxSizeMb !== null;
}
