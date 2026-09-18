import { readFileSync } from 'node:fs';

const INDEX_URL = new URL('../catalog/voices/volcengine-voice-index.json', import.meta.url);

let cachedVoices = null;

function loadVoiceIndex() {
  if (!cachedVoices) {
    cachedVoices = JSON.parse(readFileSync(INDEX_URL, 'utf8'));
  }
  return cachedVoices;
}

const SUPPORTED_MODELS = new Set(['seed-audio-1.0', 'doubao-seed-audio-1.0', 'seed-audio']);

/**
 * Query voice options from the catalog for a given model.
 *
 * @param {object} [options]
 * @param {string} [options.model='seed-audio-1.0']
 * @param {string} [options.query]
 * @param {string} [options.category]
 * @param {string} [options.gender]
 * @param {string} [options.tag]
 * @param {string} [options.language]
 * @param {number} [options.limit=20]
 * @param {number} [options.offset=0]
 * @returns {{
 *   model: string,
 *   total: number,
 *   count: number,
 *   offset: number,
 *   limit: number,
 *   voices: Array<object>,
 *   error?: string,
 * }}
 */
export function searchVoices(options = {}) {
  const model = options.model ? String(options.model).trim() : 'seed-audio-1.0';
  if (!SUPPORTED_MODELS.has(model)) {
    return {
      model,
      total: 0,
      count: 0,
      offset: 0,
      limit: 0,
      voices: [],
      error: `Model '${model}' does not have a registered voice catalog. Supported models: seed-audio-1.0`,
    };
  }

  const allVoices = loadVoiceIndex();
  const query = options.query ? String(options.query).trim().toLowerCase() : '';
  const category = options.category ? String(options.category).trim().toLowerCase() : '';
  const gender = options.gender ? String(options.gender).trim().toLowerCase() : '';
  const tag = options.tag ? String(options.tag).trim().toLowerCase() : '';
  const language = options.language ? String(options.language).trim().toLowerCase() : '';

  const filtered = allVoices.filter((v) => {
    if (gender && v.gender !== gender) return false;
    if (category && !(v.category && v.category.toLowerCase().includes(category))) return false;
    if (language && !(v.language && v.language.toLowerCase().includes(language))) return false;
    if (tag && !(Array.isArray(v.tags) && v.tags.some((t) => t.toLowerCase().includes(tag)))) return false;
    if (query) {
      const matchName = v.name && v.name.toLowerCase().includes(query);
      const matchDisplayName = v.display_name && v.display_name.toLowerCase().includes(query);
      const matchType = v.voice_type && v.voice_type.toLowerCase().includes(query);
      const matchCat = v.category && v.category.toLowerCase().includes(query);
      const matchAccent = v.accent && v.accent.toLowerCase().includes(query);
      const matchTag = Array.isArray(v.tags) && v.tags.some((t) => t.toLowerCase().includes(query));
      if (!matchName && !matchDisplayName && !matchType && !matchCat && !matchAccent && !matchTag) {
        return false;
      }
    }
    return true;
  });

  const limit = Math.max(1, Math.min(100, Number.isFinite(options.limit) ? Number(options.limit) : 20));
  const offset = Math.max(0, Number.isFinite(options.offset) ? Number(options.offset) : 0);

  const paginated = filtered.slice(offset, offset + limit);

  return {
    model,
    total: filtered.length,
    count: paginated.length,
    offset,
    limit,
    voices: paginated,
  };
}
