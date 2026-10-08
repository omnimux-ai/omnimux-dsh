/**
 * Size / duration unit helpers for model capability contracts.
 *
 * Contract declares maxSizeMb (decimal MB number). Runtime comparison uses
 * binary MiB. Each slot states whether equality is allowed.
 * MUST NOT default missing limits to a global 100MB ceiling.
 */

/** Bytes per declared megabyte (MiB binary, aligns with Node file size bytes). */
export const BYTES_PER_MB = 1024 * 1024;

/**
 * @param {number} maxSizeMb
 * @returns {number}
 */
export function mbToBytes(maxSizeMb) {
  if (typeof maxSizeMb !== 'number' || !Number.isFinite(maxSizeMb) || maxSizeMb < 0) {
    throw new TypeError(`maxSizeMb must be a non-negative finite number, got ${maxSizeMb}`);
  }
  return maxSizeMb * BYTES_PER_MB;
}

/**
 * @param {number} sizeBytes
 * @param {number} maxSizeMb
 * @param {boolean} [exclusive]
 * @returns {boolean}
 */
export function isWithinSizeLimit(sizeBytes, maxSizeMb, exclusive = false) {
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new TypeError(`sizeBytes must be a non-negative finite number, got ${sizeBytes}`);
  }
  return exclusive ? sizeBytes < mbToBytes(maxSizeMb) : sizeBytes <= mbToBytes(maxSizeMb);
}

/**
 * @param {number} durationSec
 * @param {number} maxDurationSec
 * @returns {boolean}
 */
export function isWithinDurationLimit(durationSec, maxDurationSec) {
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec < 0) {
    throw new TypeError(`durationSec must be a non-negative finite number, got ${durationSec}`);
  }
  if (typeof maxDurationSec !== 'number' || !Number.isFinite(maxDurationSec) || maxDurationSec < 0) {
    throw new TypeError(`maxDurationSec must be a non-negative finite number, got ${maxDurationSec}`);
  }
  return durationSec <= maxDurationSec;
}
