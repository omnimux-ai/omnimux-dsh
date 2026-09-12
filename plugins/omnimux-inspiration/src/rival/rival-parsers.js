/**
 * Tolerant payload mapping for the rival-accounts module.
 *
 * Every function here is pure: no `fs`, no `fetch`, no clock. A cloud answer's
 * shape is not documented, so the module *probes* it — candidate key lists from
 * `constants.js`, a hit recorded per field — and returns `null` for anything it
 * cannot read. It never invents `0` or `''` in place of a missing value: a post
 * with no readable view count must report "unknown" so the potential rules can
 * decline to score it.
 */

import {
  CLOUD_CAPABILITY_POSTS,
  CLOUD_CAPABILITY_USER,
  EMPTY_PAYLOAD_KEYS,
  FIELD_PROBE_MISS,
  POST_FIELD_CANDIDATES,
  USER_FIELD_CANDIDATES,
} from './constants.js'

/**
 * @typedef {{ value: unknown, source: string | null }} Probed
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function asText(value) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/**
 * Coerce a numeric field.
 *
 * Numeric strings are accepted (gateways stringify counters often enough that
 * refusing them would drop real data); everything else — `{ count: 1 }`, `''`,
 * `NaN`, `true` — answers `null` so the caller can tell "unknown" from "zero".
 * @param {unknown} value
 * @returns {number | null}
 */
export function asNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/,/g, '')
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function asTextArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((entry) => asText(entry)).filter(Boolean)
}

/**
 * First usable value of `keys` on `source`, with the key that fired.
 * @param {unknown} source
 * @param {readonly string[]} keys
 * @param {(value: unknown) => boolean} usable
 * @returns {Probed}
 */
export function probeField(source, keys, usable) {
  const row = isPlainObject(source) ? source : {}
  for (const key of keys) {
    const value = row[key]
    if (usable(value)) return { value, source: key }
  }
  return { value: null, source: FIELD_PROBE_MISS }
}

/** @param {unknown} value */
export function isUsableNumber(value) {
  return asNumber(value) !== null
}

/** @param {unknown} value */
export function isUsableText(value) {
  return asText(value) !== ''
}

/** @param {unknown} value */
export function isUsableArray(value) {
  return Array.isArray(value) && value.length > 0
}

/**
 * Probe every key of one candidate map against a layer.
 * @param {unknown} layer
 * @param {Record<string, readonly string[]>} candidates
 * @returns {{ values: Record<string, any>, probe: Record<string, string | null> }}
 */
export function probeLayer(layer, candidates) {
  /** @type {Record<string, any>} */
  const values = {}
  /** @type {Record<string, string | null>} */
  const probe = {}
  for (const [field, keys] of Object.entries(candidates)) {
    const usable = field === 'views' || field === 'likes' || field === 'comments'
      || field === 'shares' || field === 'saves' || field === 'duration'
      || field === 'followers' || field === 'posts_count'
      ? isUsableNumber
      : (field === 'images' ? isUsableArray : isUsableText)
    const hit = probeField(layer, keys, usable)
    probe[field] = hit.source
    values[field] = hit.value
  }
  return { values, probe }
}

/**
 * Whether an envelope carries nothing at all.
 *
 * An empty *list* answer from a `posts` call (`{ items: [] }`) reads the same
 * way as the hub's no-content sentinel, so this answers "no content" for both
 * and `isNoContentSentinel` is what tells them apart.
 * @param {unknown} data
 * @returns {boolean}
 */
export function isEmptyPayload(data) {
  if (!isPlainObject(data)) return true
  const keys = Object.keys(data)
  if (keys.length === 0) return true
  return keys.every((key) => isEmptyValue(data[key]))
}

/**
 * Whether an empty payload is the hub's no-content *sentinel* (`{ text: null }`)
 * rather than a well-formed answer that happens to be empty.
 *
 * The two are not the same fact and must not be treated the same way:
 *
 * - **Sentinel** — the cloud reported that it has no content. There is nothing
 *   to parse and nothing to store, so a refresh must say so (`no-content`).
 * - **Empty list** (`{ items: [] }`, `{ aweme_list: [] }`) — the cloud answered
 *   normally and the account genuinely has no posts yet. That is a *successful*
 *   refresh with zero new rows. Reporting it as a failure would start the
 *   `[5, 15, 60]` backoff and end in the terminal `error` state, silently
 *   switching automatic refresh off for a brand-new account — a far worse
 *   outcome than an empty list.
 *
 * A payload carrying any key outside the sentinel vocabulary is *not* a
 * sentinel, even when its values are all empty: `{ items: [] }` declares a list
 * container, and `{ data: { items: [] } }` nests one.
 * @param {unknown} data
 * @returns {boolean}
 */
export function isNoContentSentinel(data) {
  if (!isPlainObject(data)) return false
  const keys = Object.keys(data)
  if (keys.length === 0) return false
  return keys.every((key) => EMPTY_PAYLOAD_KEYS.includes(key))
}

/**
 * A value with no content of its own: undefined, null, an empty/whitespace
 * string, an empty array, an object whose own values are all empty.
 * A number (including `0`) and a boolean are content.
 *
 * An array is judged by its length only: `[{}]` is a malformed row, not an empty
 * answer, and flattening it into "no content" would hide a mapping bug instead
 * of reporting it as a row the parser had to skip.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isEmptyValue(value) {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return isEmptyPayload(value)
  return false
}

/**
 * List containers a `posts` answer may nest its rows under, in probe order.
 * A bounded list of known containers — never a recursive search — so an
 * unrelated array (thumbnails, hashtags) cannot be mistaken for the post list.
 */
const LIST_CONTAINERS = Object.freeze([
  'items',
  'aweme_list',
  'item_list',
  'contents',
  'posts',
  'videos',
  'video',
  'data',
  'result',
  'list',
  'edges',
  'media',
])

/**
 * Keys that mark an object as a *container* rather than a row.
 *
 * `{ data: { items: [...] } }` must not be read as a one-row list whose single
 * row has no id, or the nested list is never reached and every refresh stores
 * nothing.
 */
const CONTAINER_KEYS = Object.freeze([
  'edges', 'items', 'aweme_list', 'item_list', 'contents', 'posts', 'list', 'node',
])

/**
 * @param {Record<string, any>} value
 * @returns {boolean}
 */
function isContainerObject(value) {
  return CONTAINER_KEYS.some((key) => value[key] !== undefined)
}

/**
 * @param {unknown} value
 * @returns {Record<string, any>[] | null}
 */
function rowsOf(value) {
  if (Array.isArray(value)) {
    const rows = value.filter((entry) => isPlainObject(entry))
    return rows.length > 0 ? rows : null
  }
  if (isPlainObject(value)) {
    // Instagram-style edges: `{ edges: [{ node: {...} }] }`.
    if (Array.isArray(value.edges)) {
      const nodes = value.edges
        .map((edge) => (isPlainObject(edge) ? edge.node ?? edge : null))
        .filter((node) => isPlainObject(node))
      if (nodes.length > 0) return nodes
    }
    // A single-object answer is a one-row list (`aweme_detail`, a lone `video`),
    // unless it is itself a wrapper the caller still has to descend into.
    if (Object.keys(value).length > 0 && !isContainerObject(value)) return [value]
  }
  return null
}

/**
 * Rows of a `posts` answer, unwrapping at most two container levels.
 * @param {unknown} data
 * @returns {Record<string, any>[]}
 */
export function unwrapRivalPostRows(data) {
  if (!isPlainObject(data)) return []
  for (const key of LIST_CONTAINERS) {
    const rows = rowsOf(data[key])
    if (rows) return rows
  }
  for (const key of LIST_CONTAINERS) {
    const nested = data[key]
    if (!isPlainObject(nested)) continue
    for (const inner of LIST_CONTAINERS) {
      const rows = rowsOf(nested[inner])
      if (rows) return rows
    }
  }
  return []
}

/**
 * The single layer a `user` answer describes.
 *
 * Account fields are read off the top level first, then off the first container
 * that holds a row (`data.user`, `data`, `user`, `channel`, `author`, `result`,
 * `items[0]`) — a bounded, one-level unwrap in probe order.
 * @param {unknown} data
 * @returns {Record<string, any>}
 */
export function unwrapRivalUserLayer(data) {
  if (!isPlainObject(data)) return {}
  for (const key of ['user', 'channel', 'author', 'result', 'data', 'items']) {
    const nested = data[key]
    if (Array.isArray(nested)) {
      const first = nested.find((entry) => isPlainObject(entry))
      if (first) return first
      continue
    }
    if (!isPlainObject(nested)) continue
    if (Object.keys(nested).length === 0) continue
    // `data` may wrap the real layer one more time (`{ data: { user: {...} } }`).
    for (const inner of ['user', 'channel', 'author', 'result']) {
      if (isPlainObject(nested[inner]) && Object.keys(nested[inner]).length > 0) return nested[inner]
    }
    return nested
  }
  return data
}

/**
 * `UC` + 22 URL-safe characters — the shape of a canonical YouTube channel id.
 * @param {unknown} value
 * @returns {string}
 */
export function extractYouTubeChannelId(value) {
  const text = asText(value)
  if (!text) return ''
  if (/^UC[\w-]{22}$/.test(text)) return text
  const match = text.match(/(?:youtube\.com\/channel\/)?(UC[\w-]{22})/)
  return match ? match[1] : ''
}

/**
 * Parse a publication timestamp into ISO, or `null` when it cannot be read.
 *
 * Accepts seconds, milliseconds, epoch strings, ISO strings and a short list of
 * platform formats. A value that cannot be parsed stays `null` — the caller
 * sorts it last instead of pretending the post is brand new.
 * @param {unknown} value
 * @returns {string | null}
 */
export function parsePostedAt(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' || (typeof value === 'string' && /^\d{1,17}$/.test(value.trim()))) {
    const raw = Number(value)
    if (!Number.isFinite(raw) || raw <= 0) return null
    const ms = raw < 1e11 ? raw * 1000 : raw
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const text = asText(value)
  if (!text) return null
  const direct = Date.parse(text)
  if (!Number.isNaN(direct)) return new Date(direct).toISOString()
  const numeric = Number(text)
  if (Number.isFinite(numeric) && numeric > 0) {
    const date = new Date(numeric < 1e11 ? numeric * 1000 : numeric)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  return null
}

/** @param {unknown} value */
function firstHttpUrl(value) {
  return /^https?:\/\//i.test(asText(value)) ? asText(value) : ''
}

/**
 * Cover of a post: a direct field first, then the first image of an image list.
 * @param {Record<string, any>} values
 * @returns {string}
 */
export function pickCoverUrl(values) {
  const direct = firstHttpUrl(values.cover_url)
  if (direct) return direct
  const images = Array.isArray(values.images) ? values.images : []
  for (const entry of images) {
    if (typeof entry === 'string' && firstHttpUrl(entry)) return entry
    if (isPlainObject(entry)) {
      const nested = firstHttpUrl(entry.url) || firstHttpUrl(entry.display_url) || firstHttpUrl(entry.cover_url)
      if (nested) return nested
    }
  }
  return ''
}

/**
 * @param {Record<string, any>} values
 * @returns {string}
 */
export function pickVideoUrl(values) {
  const direct = firstHttpUrl(values.video_url)
  if (direct) return direct
  const images = Array.isArray(values.images) ? values.images : []
  for (const entry of images) {
    if (!isPlainObject(entry)) continue
    const nested = firstHttpUrl(entry.play_url) || firstHttpUrl(entry.url)
    if (nested) return nested
  }
  return ''
}

/**
 * Post type: `video` when a stream exists, `image` when only pictures do.
 * @param {Record<string, any>} values
 * @param {number | null} duration
 * @returns {'video' | 'image' | 'text'}
 */
export function pickPostType(values, duration) {
  const declared = asText(values.type).toLowerCase()
  if (declared.includes('video')) return 'video'
  if (declared.includes('image') || declared.includes('photo')) return 'image'
  if (pickVideoUrl(values) || (duration !== null && duration > 0)) return 'video'
  if (isUsableArray(values.images)) return 'image'
  return 'text'
}

/**
 * Map one probed post row onto the module's flat post shape.
 *
 * Returns `null` when the row carries no identity at all: without a platform id
 * the row cannot be deduplicated, so storing it would create a new duplicate on
 * every refresh.
 * @param {unknown} row
 * @param {{ platform: string, now?: () => number }} ctx
 * @returns {null | {
 *   id: string, short_code: string, url: string, title: string, text: string,
 *   posted_at: string | null, type: 'video' | 'image' | 'text',
 *   cover_url: string, video_url: string, duration: number | null,
 *   stats: { views: number | null, likes: number | null, comments: number | null, shares: number | null, saves: number | null },
 *   field_probe: Record<string, string | null>,
 * }}
 */
export function normalizeRivalPost(row, ctx) {
  const layer = isPlainObject(row) ? row : {}
  const { values, probe } = probeLayer(layer, POST_FIELD_CANDIDATES)
  const id = asText(values.id)
  if (!id) return null
  const duration = asNumber(values.duration)
  const text = asText(values.text)
  const title = asText(values.title) || text
  return {
    id,
    short_code: asText(values.short_code) || id,
    // An answer that carries no explicit permalink still describes a real post,
    // and every downstream use of a post (open it, import it) needs a URL.
    // Only well-formed platform shapes are synthesized; an unknown platform gets
    // an empty string rather than a plausible-looking wrong link.
    url: firstHttpUrl(values.url) || synthesizedPostUrl(ctx?.platform, id),
    title,
    text: text || title,
    posted_at: parsePostedAt(values.posted_at),
    type: pickPostType(values, duration),
    cover_url: pickCoverUrl(values),
    video_url: pickVideoUrl(values),
    duration,
    stats: {
      views: asNumber(values.views),
      likes: asNumber(values.likes),
      comments: asNumber(values.comments),
      shares: asNumber(values.shares),
      saves: asNumber(values.saves),
    },
    field_probe: probe,
  }
}

/**
 * Canonical post URL of a platform, from the platform's own id shape.
 *
 * Deliberately limited to the four catalog platforms whose permalink format is
 * unambiguous; anything else answers `''` so the caller reports "this post has
 * no link" instead of inventing one that would 404 in the user's browser.
 * @param {string} platform
 * @param {string} id
 * @returns {string}
 */
export function synthesizedPostUrl(platform, id) {
  const value = asText(id)
  const slug = String(platform || '').toLowerCase()
  if (!value) return ''
  if (slug === 'youtube') {
    // YouTube video ids are 11 URL-safe characters.
    return /^[\w-]{11}$/.test(value) ? `https://www.youtube.com/watch?v=${value}` : ''
  }
  if (slug === 'tiktok') {
    return /^\d{15,25}$/.test(value) ? `https://www.tiktok.com/video/${value}` : ''
  }
  if (slug === 'instagram') {
    return /^[A-Za-z0-9_-]{5,}$/.test(value) ? `https://www.instagram.com/p/${value}` : ''
  }
  if (slug === 'x') {
    return /^\d{5,}$/.test(value) ? `https://x.com/i/status/${value}` : ''
  }
  return ''
}

/**
 * Map the account fields of a `user` answer.
 * @param {unknown} data
 * @returns {{ profile: Record<string, any>, field_probe: Record<string, string | null> }}
 */
export function mapRivalUser(data) {
  const layer = unwrapRivalUserLayer(data)
  const { values, probe } = probeLayer(layer, USER_FIELD_CANDIDATES)
  const canonical = extractYouTubeChannelId(values.external_id_canonical)
  return {
    profile: {
      nickname: asText(values.nickname),
      avatar_url: firstHttpUrl(values.avatar_url),
      bio: asText(values.bio),
      followers: asNumber(values.followers),
      posts_count: asNumber(values.posts_count),
      external_id_canonical: canonical || null,
    },
    field_probe: probe,
  }
}

/**
 * Map a `posts` answer onto normalized rows.
 * @param {unknown} data
 * @param {{ platform: string }} ctx
 * @returns {{ rows: ReturnType<typeof normalizeRivalPost>[], field_probe: Record<string, string | null> }}
 */
export function mapRivalPosts(data, ctx) {
  const raw = unwrapRivalPostRows(data)
  const rows = []
  /** @type {Record<string, string | null>} */
  const fieldProbe = {}
  for (const row of raw) {
    const normalized = normalizeRivalPost(row, ctx)
    if (!normalized) continue
    for (const [field, source] of Object.entries(normalized.field_probe)) {
      if (fieldProbe[field] === undefined || fieldProbe[field] === FIELD_PROBE_MISS) {
        fieldProbe[field] = source
      }
    }
    delete normalized.field_probe
    rows.push(normalized)
  }
  return { rows, field_probe: fieldProbe }
}

/**
 * @param {string} capability
 * @returns {Record<string, readonly string[]>}
 */
export function candidatesFor(capability) {
  if (capability === CLOUD_CAPABILITY_USER) return USER_FIELD_CANDIDATES
  if (capability === CLOUD_CAPABILITY_POSTS) return POST_FIELD_CANDIDATES
  return {}
}

/**
 * Probe result shape joining both capabilities, for callers that log the whole
 * cycle's findings at once.
 * @param {Record<string, string | null>} [userProbe]
 * @param {Record<string, string | null>} [postsProbe]
 * @returns {Record<string, string | null>}
 */
export function mergeFieldProbes(userProbe = {}, postsProbe = {}) {
  return { ...postsProbe, ...userProbe }
}
