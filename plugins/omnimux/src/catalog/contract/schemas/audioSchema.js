/**
 * Audio model parameters and slot audio validation operators.
 */

import { issue } from './commonSchema.js';

export const AUDIO_OUTPUT_FORMATS = new Set(['mp3', 'wav', 'flac', 'aac', 'opus', 'pcm', 'm4a']);

/**
 * Check sample rate field validity.
 */
function checkSampleRate(sampleRate, basePath, options, out) {
  if (sampleRate === undefined || sampleRate === null) return;
  const isInvalid = typeof sampleRate !== 'number' || sampleRate <= 0;
  if (isInvalid) {
    out.push(
      issue('schema_invalid', `invalid audio sampleRate at ${basePath}`, {
        modelId: options.modelId,
        path: `${basePath}.sampleRate`,
        file: options.file,
      }),
    );
  }
}

/**
 * Check audio format field validity.
 */
function checkAudioFormat(format, basePath, options, out) {
  if (format === undefined || format === null) return;
  const isInvalid = typeof format !== 'string' || !AUDIO_OUTPUT_FORMATS.has(format);
  if (isInvalid) {
    out.push(
      issue('schema_invalid', `invalid audio format at ${basePath}`, {
        modelId: options.modelId,
        path: `${basePath}.format`,
        file: options.file,
      }),
    );
  }
}

/**
 * Validate audio output parameters if specified.
 * @param {Record<string, unknown>} output
 * @param {string} basePath
 * @param {{ modelId?: string, file?: string }} [options]
 * @returns {object[]}
 */
export function validateAudioOutputParams(output, basePath, options = {}) {
  const out = [];
  if (!output || typeof output !== 'object') return out;
  checkSampleRate(output.sampleRate, basePath, options, out);
  checkAudioFormat(output.format, basePath, options, out);
  return out;
}
