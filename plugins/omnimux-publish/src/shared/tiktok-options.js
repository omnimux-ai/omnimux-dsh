/**
 * TikTok Content Sharing Guidelines options (privacy level, interaction toggles,
 * commercial disclosure, music confirmation). Shared by the Host validation and
 * the publishing composer so both sides agree on defaults and legality.
 */

/** @typedef {object} TikTokOptions
 * @property {string} privacy_level
 * @property {boolean} allow_comment
 * @property {boolean} allow_duet
 * @property {boolean} allow_stitch
 * @property {boolean} commercial_content
 * @property {boolean} your_brand
 * @property {boolean} branded_content
 * @property {boolean} music_usage_confirmed
 */

/** @type {readonly string[]} */
export const TIKTOK_PRIVACY_LEVELS = Object.freeze([
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
])

/** @type {Readonly<TikTokOptions>} */
export const DEFAULT_TIKTOK_OPTIONS = Object.freeze({
  privacy_level: 'SELF_ONLY',
  allow_comment: true,
  allow_duet: true,
  allow_stitch: true,
  commercial_content: false,
  your_brand: false,
  branded_content: false,
  music_usage_confirmed: false,
})

/** @param {unknown} value @returns {boolean} */
const asBool = (value) => value === true

/**
 * Normalize a stored/picked options object. Unknown privacy levels fall back to
 * SELF_ONLY; unknown keys are dropped so the ledger stays predictable.
 * @param {unknown} raw
 * @returns {TikTokOptions}
 */
export function normalizeTikTokOptions(raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? /** @type {Record<string, unknown>} */ (raw) : {}
  const privacy = typeof input.privacy_level === 'string' ? input.privacy_level.trim().toUpperCase() : ''
  return {
    privacy_level: TIKTOK_PRIVACY_LEVELS.includes(privacy) ? privacy : DEFAULT_TIKTOK_OPTIONS.privacy_level,
    allow_comment: input.allow_comment === undefined ? DEFAULT_TIKTOK_OPTIONS.allow_comment : asBool(input.allow_comment),
    allow_duet: input.allow_duet === undefined ? DEFAULT_TIKTOK_OPTIONS.allow_duet : asBool(input.allow_duet),
    allow_stitch: input.allow_stitch === undefined ? DEFAULT_TIKTOK_OPTIONS.allow_stitch : asBool(input.allow_stitch),
    commercial_content: asBool(input.commercial_content),
    your_brand: asBool(input.your_brand),
    branded_content: asBool(input.branded_content),
    music_usage_confirmed: asBool(input.music_usage_confirmed),
  }
}

/**
 * Privacy levels the account may actually choose. When creator-info reports a
 * non-empty list we trust it (unaudited sandbox apps only allow SELF_ONLY).
 * @param {unknown} creatorInfo
 * @returns {string[]}
 */
export function privacyChoices(creatorInfo) {
  const options = creatorInfo && typeof creatorInfo === 'object'
    ? /** @type {{ privacy_level_options?: unknown }} */ (creatorInfo).privacy_level_options
    : undefined
  if (!Array.isArray(options)) return [...TIKTOK_PRIVACY_LEVELS]
  const allowed = options
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().toUpperCase())
    .filter((item) => TIKTOK_PRIVACY_LEVELS.includes(item))
  return allowed.length > 0 ? [...new Set(allowed)] : [...TIKTOK_PRIVACY_LEVELS]
}

/**
 * Blocking problems for a chosen combination. Empty array means submittable.
 * @param {TikTokOptions} options
 * @returns {string[]} stable machine codes
 */
export function tiktokOptionProblems(options) {
  /** @type {string[]} */
  const problems = []
  if (options.commercial_content && !options.your_brand && !options.branded_content) {
    problems.push('commercial-brand-required')
  }
  if (options.branded_content && options.privacy_level === 'SELF_ONLY') {
    problems.push('branded-requires-public')
  }
  if (options.commercial_content && !options.music_usage_confirmed) {
    problems.push('music-confirmation-required')
  }
  return problems
}

/**
 * Build the gateway `tiktok_options` body. Returns undefined when nothing should
 * be sent, so older gateways keep their previous behavior.
 * @param {unknown} raw
 * @returns {Record<string, unknown> | undefined}
 */
export function buildCreateTikTokOptions(raw) {
  if (raw === undefined || raw === null) return undefined
  const options = normalizeTikTokOptions(raw)
  /** @type {Record<string, unknown>} */
  const body = {
    privacy_level: options.privacy_level,
    allow_comment: options.allow_comment,
    allow_duet: options.allow_duet,
    allow_stitch: options.allow_stitch,
  }
  if (options.commercial_content) {
    body.commercial_content = true
    body.your_brand = options.your_brand
    body.branded_content = options.branded_content
  }
  if (options.music_usage_confirmed) body.music_usage_confirmed = true
  return body
}

/**
 * Shrink an options object for draft persistence (settings.tiktok_options).
 * @param {unknown} raw
 * @returns {TikTokOptions}
 */
export function storeTikTokOptions(raw) {
  return normalizeTikTokOptions(raw)
}
