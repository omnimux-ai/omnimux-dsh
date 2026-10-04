import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const MAPPING_URL = new URL('./official-preview-mapping.json', import.meta.url);
const MAPPING_NAME = 'official-preview-mapping.json';
const PREVIEW_PURPOSE = 'official-voice-preview';
const MAPPING_SCHEMA_VERSION = 1;
const DEFAULT_CDN_BASE = 'https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/';

/** Packaged mapping snapshot; content participates in the same cache key as the YAML contracts. */
export function readVoicePreviewSnapshot() {
  return { name: MAPPING_NAME, content: readFileSync(MAPPING_URL, 'utf8') };
}

/** Content hash of the verified-mapping snapshot (sha256 hex). */
export function voicePreviewFingerprint(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Parse + validate the verified-preview mapping. The file stores one verified
 * filename per voice_type under the single registered official CDN base —
 * cdn_base must be exactly that HTTPS origin+path and every file must be a
 * relative path that cannot override or escape it. When verified rows exist,
 * audit.checked_at (a parseable date) and audit.evidence_ref are required and
 * the mapping's purpose/schema_version must match; anything else fails closed.
 * @param {{ name: string, content: string }} snapshot
 */
export function parsePreviewMapping(snapshot) {
  if (!snapshot || snapshot.name !== MAPPING_NAME || typeof snapshot.content !== 'string') {
    throw new Error(`registered preview snapshot required: ${MAPPING_NAME}`);
  }
  let mapping;
  try {
    mapping = JSON.parse(snapshot.content);
  } catch (err) {
    throw new Error(`preview mapping is not valid JSON: ${err?.message ?? err}`);
  }
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    throw new Error('preview mapping must be an object');
  }
  const base = typeof mapping.cdn_base === 'string' && mapping.cdn_base ? mapping.cdn_base : DEFAULT_CDN_BASE;
  let baseUrl;
  try {
    baseUrl = new URL(base);
  } catch {
    throw new Error('preview mapping cdn_base must be a valid HTTPS URL');
  }
  const registeredBase = new URL(DEFAULT_CDN_BASE);
  // cdn_base is not a caller-chosen host: it must be the registered official
  // CDN base (same HTTPS origin AND same path), or the mapping is not ours.
  // URL.origin never carries userinfo, so a credentialed base would pass the
  // origin/path check and then leak username:password into every relative
  // preview URL the picker publishes — userinfo fails closed first
  // (#3058 OCR #6).
  if (baseUrl.username !== '' || baseUrl.password !== '') {
    throw new Error('preview mapping cdn_base must not carry credentials');
  }
  if (baseUrl.protocol !== 'https:' || baseUrl.origin !== registeredBase.origin
    || baseUrl.pathname !== registeredBase.pathname || baseUrl.search !== '' || baseUrl.hash !== '') {
    throw new Error('preview mapping cdn_base must be the registered HTTPS CDN base');
  }
  const baseHref = baseUrl.href.endsWith('/') ? baseUrl.href : `${baseUrl.href}/`;
  if (typeof mapping.voices !== 'object' || mapping.voices === null || Array.isArray(mapping.voices)) {
    throw new Error('preview mapping voices must be an object');
  }
  const verified = new Map();
  for (const [voiceType, file] of Object.entries(mapping.voices)) {
    if (typeof voiceType !== 'string' || !voiceType.trim()) {
      throw new Error('preview mapping voice key must be a nonempty voice_type');
    }
    if (typeof file !== 'string' || !file.trim()) {
      throw new Error(`preview mapping file for ${voiceType} must be a nonempty filename`);
    }
    // Files are relative paths under cdn_base only: no scheme override, no
    // scheme-relative or absolute path, no query/hash, no traversal.
    if (/^[a-z][a-z\d+.-]*:/i.test(file) || file.startsWith('//') || file.startsWith('/')
      || file.includes('?') || file.includes('#') || file.includes('\\')) {
      throw new Error(`preview mapping file for ${voiceType} must not override cdn_base`);
    }
    const segments = file.split('/');
    for (const segment of segments) {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        throw new Error(`preview mapping file for ${voiceType} is not a valid URL path`);
      }
      // Encoded separators decode inside one segment (safe%2F..%2Fescape.mp3,
      // %5C..%5Cevil.mp3): new URL keeps them as encoded bytes under the
      // registered prefix, but a CDN/origin that decodes first would escape
      // the registered subtree — reject them like literal separators.
      if (decoded === '..' || decoded === '.' || decoded.includes('/') || decoded.includes('\\')) {
        throw new Error(`preview mapping file for ${voiceType} must not escape cdn_base`);
      }
    }
    let url;
    try {
      url = new URL(file, baseHref);
    } catch {
      throw new Error(`preview mapping file for ${voiceType} is not a valid URL path`);
    }
    if (url.protocol !== 'https:' || url.origin !== baseUrl.origin
      || !url.pathname.startsWith(registeredBase.pathname)) {
      throw new Error(`preview mapping URL for ${voiceType} must stay on the registered HTTPS CDN`);
    }
    verified.set(voiceType, url.href);
  }
  // A mapping that publishes verified rows must carry intact provenance and
  // declare the shared purpose/schema; anything else fails closed.
  if (verified.size > 0) {
    const audit = mapping.audit && typeof mapping.audit === 'object' && !Array.isArray(mapping.audit)
      ? mapping.audit : null;
    const checkedAt = audit?.checked_at;
    const evidenceRef = audit?.evidence_ref;
    if (typeof checkedAt !== 'string' || !checkedAt.trim() || Number.isNaN(Date.parse(checkedAt))
      || typeof evidenceRef !== 'string' || !evidenceRef.trim()) {
      throw new Error('preview mapping audit.checked_at and audit.evidence_ref are required for verified previews');
    }
    if (mapping.purpose !== PREVIEW_PURPOSE) {
      throw new Error(`preview mapping purpose must be ${PREVIEW_PURPOSE}`);
    }
    if (mapping.schema_version !== MAPPING_SCHEMA_VERSION) {
      throw new Error(`preview mapping schema_version must be ${MAPPING_SCHEMA_VERSION}`);
    }
    return {
      checked_at: checkedAt,
      evidence_ref: evidenceRef,
      verified,
    };
  }
  return {
    checked_at: null,
    evidence_ref: null,
    verified,
  };
}

/**
 * Canvas voice-picker candidate rule (single source, shared by asset library).
 * Filenames in priority order:
 *  1. English alias (or slash-separated alias pair, e.g. 爽快思思/Skye)
 *  2. Official voice_type.mp3
 *  3. Cleaned name (spaces → underscores)
 *  4. display_name with a trailing "2.0" version suffix stripped
 * @param {{ voice_type: string, name?: string, display_name?: string }} voice
 * @returns {string[]} URL candidates
 */
export function voicePreviewCandidates(voice) {
  const voiceType = voice.voice_type;
  const rawName = typeof voice.name === 'string' ? voice.name : '';
  const displayName = typeof voice.display_name === 'string' ? voice.display_name : '';
  const fileNames = [];

  if (rawName) {
    if (rawName.includes('/')) {
      const parts = rawName.split('/').map((s) => s.trim().replace(/ /g, '_'));
      if (parts[1]) fileNames.push(`${parts[1]}.mp3`);
      if (parts[0]) fileNames.push(`${parts[0]}.mp3`);
    } else {
      const cleanName = rawName.replace(/ /g, '_');
      if (/^[A-Za-z0-9_ -]+$/.test(rawName)) {
        fileNames.push(`${cleanName}.mp3`);
      }
    }
  }

  fileNames.push(`${voiceType}.mp3`);

  if (rawName && !rawName.includes('/')) {
    fileNames.push(`${rawName.replace(/ /g, '_')}.mp3`);
  }

  if (displayName) {
    const noVer = displayName.replace(/[_ ]?2\.0$/, '').replace(/ /g, '_');
    if (noVer && !fileNames.includes(`${noVer}.mp3`)) {
      fileNames.push(`${noVer}.mp3`);
    }
  }

  const unique = [...new Set(fileNames)];
  return unique.map((name) => `${DEFAULT_CDN_BASE}${encodeURIComponent(name)}`);
}

/**
 * Project one voice record's preview DTO. Verified rows come only from the
 * registered mapping (never fabricated); unverified rows keep a null primary
 * with the shared rule candidates. Primary lands first in candidates when
 * it is not already the rule's own first hit.
 * @param {object} voice voice index record
 * @param {ReturnType<typeof parsePreviewMapping> | null} mapping parsed mapping or null
 */
export function voicePreviewMeta(voice, mapping) {
  const candidates = voicePreviewCandidates(voice);
  const primary = mapping?.verified.get(voice.voice_type) ?? null;
  if (primary && candidates[0] !== primary) {
    candidates.unshift(primary);
    for (let i = 1; i < candidates.length; i += 1) {
      if (candidates[i] === primary) {
        candidates.splice(i, 1);
        break;
      }
    }
  }
  return {
    purpose: PREVIEW_PURPOSE,
    state: primary ? 'verified-file' : 'unverified',
    primary_url: primary,
    candidates,
    checked_at: primary ? mapping.checked_at : null,
    evidence_ref: primary ? mapping.evidence_ref : null,
  };
}
