import { readFileSync } from 'node:fs';
import { parsePreviewMapping, readVoicePreviewSnapshot, voicePreviewMeta } from './preview.js';

const INDEX_URL = new URL('./volcengine-voice-index.json', import.meta.url);
const SOURCE_ID = 'volcengine-voice-index';

/**
 * Snapshot content participates in the same cache key as the YAML contracts.
 * The `preview` field carries the registered verified-mapping snapshot;
 * callers must pass it to buildContentCacheKey alongside this snapshot.
 */
export function readVoiceIndexSnapshot() {
  return {
    name: 'volcengine-voice-index.json',
    content: readFileSync(INDEX_URL, 'utf8'),
    preview: readVoicePreviewSnapshot(),
  };
}

function voiceOptions(snapshot) {
  const records = JSON.parse(snapshot.content);
  if (!Array.isArray(records) || records.length === 0) throw new Error('voice index must be a nonempty array');
  if (!snapshot.preview) throw new Error('voice options require the registered preview snapshot');
  const preview = parsePreviewMapping(snapshot.preview);
  // The official voice index is the only identity source: every verified
  // voice_type in the mapping must join a registered record, fail closed.
  const voiceTypes = new Set(records.map((voice) => voice?.voice_type)
    .filter((voiceType) => typeof voiceType === 'string'));
  for (const voiceType of preview.verified.keys()) {
    if (!voiceTypes.has(voiceType)) {
      throw new Error(`preview mapping contains unknown voice_type: ${voiceType}`);
    }
  }
  const seen = new Set();
  return records.map((voice) => {
    if (typeof voice?.voice_type !== 'string' || !voice.voice_type.trim()
      || typeof voice.display_name !== 'string' || !voice.display_name.trim()) {
      throw new Error('voice index requires voice_type and display_name');
    }
    if (seen.has(voice.voice_type)) throw new Error(`duplicate voice_type: ${voice.voice_type}`);
    seen.add(voice.voice_type);
    return {
      value: voice.voice_type,
      label: voice.display_name,
      meta: { ...structuredClone(voice), preview: voicePreviewMeta(voice, preview) },
    };
  });
}

/**
 * Resolve a registered data source, never a caller-supplied filesystem path.
 * Guard and Catalog DTO receive the same options, including picker metadata.
 * @param {object} doc
 * @param {{ name: string, content: string, preview?: { name: string, content: string } }} [snapshot]
 * @returns {object}
 */
export function materializeVoiceOptions(doc, snapshot) {
  let options;
  const resolveParameters = (parameters) => {
    if (!parameters || typeof parameters !== 'object') return parameters;
    return Object.fromEntries(Object.entries(parameters).map(([field, definition]) => {
      if (!definition || typeof definition !== 'object' || !Object.hasOwn(definition, 'optionsFrom')) return [field, definition];
      if (field !== 'voice' || definition.optionsFrom !== SOURCE_ID) {
        throw new Error(`unregistered parameter optionsFrom: ${definition.optionsFrom}`);
      }
      if (Object.hasOwn(definition, 'options')) throw new Error('voice must not declare both options and optionsFrom');
      options ??= voiceOptions(snapshot ?? readVoiceIndexSnapshot());
      if (definition.defaultValue !== undefined && !options.some((option) => option.value === definition.defaultValue)) {
        throw new Error('voice defaultValue is not present in its options source');
      }
      const { optionsFrom, ...rest } = definition;
      return [field, { ...rest, options: structuredClone(options) }];
    }));
  };
  const resolveRow = (row) => ({ ...row,
    ...(row.parameters ? { parameters: resolveParameters(row.parameters) } : {}),
  });
  return { ...doc, ...(Array.isArray(doc.models) ? { models: doc.models.map((model) => ({
    ...resolveRow(model),
    ...(Array.isArray(model.operations) ? { operations: model.operations.map(resolveRow) } : {}),
  })) } : {}) };
}
