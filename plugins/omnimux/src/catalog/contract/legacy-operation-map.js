/**
 * Read-time map from historical GenerationMode / canvas aliases to MCC
 * standard operation ids. H1 ships the table + tests only; H2 consumers
 * translate on read. Never treat aliases as a second machine truth source.
 */

/** @type {Readonly<Record<string, string>>} */
export const LEGACY_OPERATION_MAP = Object.freeze({
  reference: 'video_multi_ref',
  first_last_frame: 'first_last_frame',
  first_frame: 'first_frame',
  end_frame: 'end_frame',
  endframe: 'end_frame',
  'end-frame': 'end_frame',
  text_to_video: 'text_to_video',
  i2v: 'first_frame',
  t2v: 'text_to_video',
  flf: 'first_last_frame',
  avatar: 'digital_human',
  digital_human: 'digital_human',
  tts: 'text_to_speech',
  asr: 'speech_to_text',
  stt: 'speech_to_text',
  music: 'text_to_music',
  t2i: 'text_to_image',
  i2i: 'image_to_image',
  image_edit: 'multi_reference',
});

/**
 * @param {string} raw
 * @returns {string}
 */
export function mapLegacyOperation(raw) {
  const key = String(raw ?? '').trim();
  if (!key) return key;
  return LEGACY_OPERATION_MAP[key] ?? key;
}
