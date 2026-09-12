/**
 * Profile-URL identity parsing for the rival-accounts module.
 *
 * Shared by Host (import endpoint) and client (the inline import dialog echoes
 * what it resolved before submitting), so it is pure and side-effect free: no
 * `fs`, no `fetch`, no clock.
 *
 * The parse never guesses. A URL it cannot classify as a profile answers
 * `{ kind: 'content' }` and is handed to the existing import pipeline unchanged,
 * and a profile URL whose identity cannot be read answers
 * `{ kind: 'unknown' }` rather than being stored under an invented key.
 */

import { detectPlatformFromUrl, normalizeUrl } from '../url-normalizer.js'

/** Path segments that are pages, not profile handles. */
const RESERVED_SEGMENTS = new Set([
  'about', 'account', 'accounts', 'ads', 'api', 'blog', 'business', 'channel', 'c',
  'clips', 'discover', 'embed', 'explore', 'feed', 'following', 'foryou', 'gaming',
  'hashtag', 'home', 'help', 'i', 'intent', 'jobs', 'legal', 'live', 'login',
  'messages', 'music', 'notifications', 'p', 'place', 'playlist', 'press',
  'privacy', 'reel', 'reels', 'results', 'search', 'settings', 'share', 'shorts',
  'signup', 'status', 'stories', 'terms', 'trending', 'tweet', 'upload', 'user',
  'video', 'videos', 'watch', 'who_to_follow',
])

/** @type {Record<string, { profileBase: string, idKind: string }>} */
const PLATFORM_META = {
  tiktok: { profileBase: 'https://www.tiktok.com/', idKind: 'username' },
  instagram: { profileBase: 'https://www.instagram.com/', idKind: 'username' },
  youtube: { profileBase: 'https://www.youtube.com/', idKind: 'handle-unverified' },
  x: { profileBase: 'https://x.com/', idKind: 'username' },
}

/**
 * Platforms whose *content* URLs the inspiration import pipeline has a parser
 * for. A host outside this set is not a content link this module can hand on,
 * so it must be refused rather than stored as an "unknown platform" row.
 */
const CONTENT_PLATFORMS = new Set(Object.keys(PLATFORM_META))

/**
 * Platforms that store their `external_id` in the `@handle` form. TikTok and
 * YouTube already did; Instagram and X stored the bare name, which is the
 * divergence requirement 2's dedup key tripped over.
 *
 * The `@`-prefixed form wins because it is the one the module *shows*
 * (`handle`) and the one two of the four platforms already persist — so the fix
 * adds a form rather than migrating away from one, and no existing row has to
 * change. Comparison never depends on it: `identityKey` in the store strips the
 * prefix, so a `@bar` row and a `bar` row are the same account either way.
 */
const AT_PREFIXED_PLATFORMS = new Set(['tiktok', 'instagram', 'x'])

/**
 * The handle with its `@` decoration removed. Idempotent, and a YouTube
 * channel id (`UC…`, never stored with a `@`) passes through unchanged — which
 * is what keeps `external_id_canonical` meaningful, since this only ever runs
 * on `external_id` and never on the canonical value.
 * @param {unknown} value
 * @returns {string}
 */
function bareHandle(value) {
  return typeof value === 'string' ? value.trim().replace(/^@+/, '').trim() : ''
}

/**
 * Stored identity form of `platform` + bare handle.
 * @param {string} platform
 * @param {string} handle bare, already validated by `isHandleLike`
 * @returns {string}
 */
function externalIdFor(platform, handle) {
  return AT_PREFIXED_PLATFORMS.has(platform) ? `@${handle}` : handle
}

/**
 * @typedef {Object} RivalIdentity
 * @property {string} platform
 * @property {string} external_id
 * @property {string} external_id_kind
 * @property {string} handle
 * @property {string} profile_url
 */

/**
 * Classify a pasted URL.
 *
 * `account` — a profile page this module can monitor.
 * `content` — a post/video page, i.e. the existing import pipeline's input.
 * `unknown` — the URL could not be parsed at all.
 * @param {unknown} url
 * @returns {{ kind: 'account' | 'content' | 'unknown', platform: string, identity?: RivalIdentity, hint_key?: string }}
 */
export function detectInputKind(url) {
  const raw = typeof url === 'string' ? url.trim() : ''
  if (!raw) return { kind: 'unknown', platform: 'unknown' }
  let parsed
  try {
    parsed = new URL(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    return { kind: 'unknown', platform: 'unknown' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { kind: 'unknown', platform: 'unknown' }
  }
  const platform = detectPlatformFromUrl(raw)
  const segments = parsed.pathname.split('/').map((part) => decodeURIComponent(part)).filter(Boolean)

  if (platform === 'youtube') {
    const youtube = parseYouTube(parsed, segments)
    if (youtube) return { kind: 'account', platform, identity: youtube }
    return { kind: 'content', platform }
  }

  const meta = PLATFORM_META[platform]
  if (meta && segments.length === 1 && isHandleLike(segments[0])) {
    const handle = bareHandle(segments[0])
    return {
      kind: 'account',
      platform,
      identity: {
        platform,
        external_id: externalIdFor(platform, handle),
        external_id_kind: meta.idKind,
        handle: `@${handle}`,
        profile_url: `${meta.profileBase}@${handle}`,
      },
    }
  }
  if (platform === 'tiktok' && segments.length === 2 && segments[0] === 'user' && isHandleLike(segments[1])) {
    const handle = bareHandle(segments[1])
    return {
      kind: 'account',
      platform,
      identity: {
        platform,
        external_id: externalIdFor(platform, handle),
        external_id_kind: meta.idKind,
        handle: `@${handle}`,
        profile_url: `${meta.profileBase}@${handle}`,
      },
    }
  }
  // facebook / threads / any other host has no content parser here and no
  // monitorable identity, so it is refused — the dialog then shows
  // `rivalAccounts.import.unrecognized` instead of falling through to a content
  // import that cannot succeed.
  if (!CONTENT_PLATFORMS.has(platform)) {
    return { kind: 'unknown', platform, hint_key: 'rivalAccounts.import.unrecognized' }
  }
  return { kind: 'content', platform }
}

/**
 * Whether a path segment can be a handle: letters, digits, `.`, `_`, `-`, and
 * not one of the platform's own pages.
 * @param {string} segment
 * @returns {boolean}
 */
export function isHandleLike(segment) {
  const text = typeof segment === 'string' ? segment.replace(/^@+/, '') : ''
  if (!text || text.length > 40) return false
  if (!/^[A-Za-z0-9._-]+$/.test(text)) return false
  return !RESERVED_SEGMENTS.has(text.toLowerCase())
}

/**
 * Identity of a profile URL, or `null` when the URL is not a profile page.
 * @param {unknown} url
 * @returns {RivalIdentity | null}
 */
export function parseRivalIdentity(url) {
  const classified = detectInputKind(url)
  return classified.kind === 'account' ? classified.identity ?? null : null
}

/**
 * @param {URL} parsed
 * @param {string[]} segments
 * @returns {RivalIdentity | null}
 */
function parseYouTube(parsed, segments) {
  const base = 'https://www.youtube.com'
  if (segments.length >= 2 && segments[0] === 'channel' && /^UC[\w-]{22}$/.test(segments[1])) {
    const id = segments[1]
    return { platform: 'youtube', external_id: id, external_id_kind: 'channel_id', handle: id, profile_url: `${base}/channel/${id}` }
  }
  if (segments.length >= 1 && segments[0].startsWith('@')) {
    const handle = bareHandle(segments[0])
    if (!isHandleLike(handle)) return null
    return { platform: 'youtube', external_id: `@${handle}`, external_id_kind: 'handle-unverified', handle: `@${handle}`, profile_url: `${base}/@${handle}` }
  }
  if (segments.length >= 2 && (segments[0] === 'c' || segments[0] === 'user') && isHandleLike(segments[1])) {
    const handle = bareHandle(segments[1])
    return {
      platform: 'youtube',
      external_id: `@${handle}`,
      external_id_kind: 'handle-unverified',
      handle: `@${handle}`,
      profile_url: `${base}/${segments[0]}/${handle}`,
    }
  }
  // A bare `youtube.com/<name>` is a legacy custom URL: accepted, and marked
  // unverified because the handle has to be confirmed by the first refresh.
  // `youtu.be/<code>` is a *video* short link, never a profile, so the host is
  // checked before its only path segment is read as a handle.
  if (segments.length === 1 && parsed.hostname.toLowerCase().endsWith('youtube.com')
    && isHandleLike(segments[0]) && parsed.searchParams.get('v') === null) {
    const handle = bareHandle(segments[0])
    return { platform: 'youtube', external_id: `@${handle}`, external_id_kind: 'handle-unverified', handle: `@${handle}`, profile_url: `${base}/@${handle}` }
  }
  return null
}

/**
 * The `user` call's identity value.
 *
 * `external_id_canonical` wins once a first refresh has proven it: a `@handle`
 * that the cloud accepted is then refreshed through its resolved channel id, so
 * later refreshes stop depending on the unverified form.
 *
 * The value is handed over exactly as stored. Making this function rewrite it
 * would silently change which business field the hub seam receives, and that
 * mapping (`uniqueId` / `username` / `screen_name` / `channel_id`) is owned by
 * the hub — this module only decides what identity it recorded.
 * @param {{ external_id?: string, external_id_canonical?: string | null }} account
 * @returns {string}
 */
export function rivalIdentityValue(account) {
  const canonical = typeof account?.external_id_canonical === 'string' ? account.external_id_canonical.trim() : ''
  return canonical || (typeof account?.external_id === 'string' ? account.external_id.trim() : '')
}

/**
 * Normalized profile URL of an account, for display and re-import matching.
 * @param {{ platform?: string, external_id?: string, profile_url?: string }} account
 * @returns {string}
 */
export function rivalProfileUrl(account) {
  const stored = normalizeUrl(account?.profile_url || '')
  if (stored) return stored
  const platform = typeof account?.platform === 'string' ? account.platform : ''
  const meta = PLATFORM_META[platform]
  const externalId = typeof account?.external_id === 'string' ? account.external_id : ''
  if (!meta || !externalId) return ''
  return `${meta.profileBase}${externalId.startsWith('@') ? externalId : `@${externalId}`}`
}
