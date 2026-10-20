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
  return isEmptyPayload(data) && keys.every((key) => EMPTY_PAYLOAD_KEYS.includes(key))
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
const CONTAINER_KEYS = Object.freeze([...LIST_CONTAINERS, 'node'])

/**
 * @param {Record<string, any>} value
 * @returns {boolean}
 */
function isContainerObject(value) {
  if (probeField(value, POST_FIELD_CANDIDATES.id, isUsableText).source !== FIELD_PROBE_MISS) return false
  return CONTAINER_KEYS.some((key) => value[key] !== undefined)
}

/**
 * @param {unknown} value
 * @returns {{ rows: Record<string, any>[], source_count: number } | null}
 */
function rowsOf(value) {
  if (Array.isArray(value)) {
    const rows = value
      .map((entry) => (isPlainObject(entry) && isContainerObject(entry) && isPlainObject(entry.node) ? entry.node : entry))
      .filter((entry) => isPlainObject(entry))
    return { rows, source_count: value.length }
  }
  if (isPlainObject(value)) {
    // Instagram-style edges: `{ edges: [{ node: {...} }] }`.
    if (Array.isArray(value.edges)) return rowsOf(value.edges)
    // A single-object answer is a one-row list (`aweme_detail`, a lone `video`),
    // unless it is itself a wrapper the caller still has to descend into.
    if (Object.keys(value).length > 0 && !isContainerObject(value)) return { rows: [value], source_count: 1 }
  }
  return null
}

/**
 * Recognize at most two known container levels, retaining the source length so
 * an empty list and a nonempty list of unusable rows stay different outcomes.
 * @param {unknown} data
 * @returns {{ rows: Record<string, any>[], source_count: number } | null}
 */
function probeRivalPostRows(data) {
  if (!isPlainObject(data)) return null
  let empty = null
  for (const key of LIST_CONTAINERS) {
    const found = rowsOf(data[key])
    if (found?.source_count > 0) return found
    if (found) empty = found
  }
  for (const key of LIST_CONTAINERS) {
    const nested = data[key]
    if (!isPlainObject(nested)) continue
    for (const inner of LIST_CONTAINERS) {
      const found = rowsOf(nested[inner])
      if (found?.source_count > 0) return found
      if (found) empty = found
    }
  }
  return empty
}

/**
 * Rows of a `posts` answer, unwrapping at most two container levels.
 * @param {unknown} data
 * @returns {Record<string, any>[]}
 */
export function unwrapRivalPostRows(data) {
  return probeRivalPostRows(data)?.rows || []
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

/** @param {unknown} value */
function objectOf(value) {
  return isPlainObject(value) ? value : {}
}

/** @param {unknown} value */
function arrayOf(value) {
  return Array.isArray(value) ? value : []
}

/** @param {unknown} value */
function urlPathname(value) {
  const url = asText(value)
  if (!url) return ''
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

/**
 * First playable URL inside a `url_list`-shaped field (TikTok/Instagram).
 *
 * The observed gateway answers carry the stream and the covers as
 * `{ url_list: string[...] }`; an entry may also be an object with `url`.
 * Anything that is not an absolute http(s) URL is skipped rather than guessed.
 * @param {unknown} value
 * @returns {string}
 */
function urlListUrl(value) {
  for (const entry of arrayOf(value)) {
    const url = typeof entry === 'string' ? firstHttpUrl(entry) : firstHttpUrl(objectOf(entry).url)
    if (url) return url
  }
  return ''
}

/**
 * Highest-quality directly playable mp4 of a `variants[]` list.
 *
 * Mirrors the import pipeline's ranking (bitrate → bit_rate → height, then the
 * resolution encoded in the URL) so the monitor card and the import see the
 * same stream, without importing the import pipeline module into this pure
 * mapper.
 * @param {unknown} variants
 * @returns {string}
 */
function bestMp4Url(variants) {
  let best = ''
  let bestScore = -1
  for (const raw of arrayOf(variants)) {
    const variant = objectOf(raw)
    const url = firstHttpUrl(variant.url) || firstHttpUrl(variant.src)
      || (typeof raw === 'string' ? firstHttpUrl(raw) : '')
    if (!url) continue
    const declared = asText(variant.content_type || variant.contentType).toLowerCase()
    const isMp4 = declared ? declared.includes('mp4') : /\.mp4$/i.test(urlPathname(url))
    if (!isMp4) continue
    const score = asNumber(variant.bitrate) ?? asNumber(variant.bit_rate)
      ?? asNumber(variant.height) ?? videoUrlResolution(url)
    if (score > bestScore) {
      best = url
      bestScore = score
    }
  }
  return best
}

/** Resolution encoded in X's bitrate-free public video variants. */
function videoUrlResolution(value) {
  const match = urlPathname(value).match(/\/(\d+)x(\d+)\//)
  return match ? Number(match[1]) * Number(match[2]) : 0
}

/**
 * Media entries of an X/Twitter post row.
 *
 * The observed shapes are `media` / `extended_entities.media` /
 * `entities.media` arrays, a single `media` object, and the gateway's
 * `media.video[]` / `media.photo[]` containers. Only these bounded containers
 * are read — never a recursive walk.
 * @param {Record<string, any>} layer
 * @returns {Array<Record<string, any>>}
 */
function xMediaEntries(layer) {
  /** @type {Array<Record<string, any>>} */
  const entries = []
  const push = (value) => {
    if (Array.isArray(value)) {
      entries.push(...value.filter(isPlainObject))
      return
    }
    if (!isPlainObject(value)) return
    entries.push(value)
    entries.push(...arrayOf(value.video).filter(isPlainObject))
    entries.push(...arrayOf(value.photo).filter(isPlainObject))
  }
  push(layer.media)
  push(objectOf(layer.extended_entities).media)
  push(objectOf(layer.entities).media)
  return entries
}

/**
 * Media, duration, aspect ratio and statistics nested one level inside a raw
 * platform row, in the same spirit as the import pipeline's `parseSocialMeta`.
 *
 * Why this exists: the gateway returns the platform's own envelope
 * (TikTok `video.cover.url_list` / `video.play_addr.url_list` /
 * `statistics.*`, X `media[].video_info.variants[]`), while the flat candidates
 * in `POST_FIELD_CANDIDATES` only cover envelopes that hoist those fields. A
 * row that carries only the platform shape therefore used to normalize to an
 * empty media card (Issue #3428). The map is a **one-level whitelist**: known
 * containers only, no recursion, and every filled field records its source.
 * @param {Record<string, any>} layer
 * @param {{ platform?: string }} [ctx]
 * @returns {{ values: Record<string, any>, probe: Record<string, string> }}
 */
function nestedPostFields(layer, ctx = {}) {
  /** @type {Record<string, any>} */
  const values = {}
  /** @type {Record<string, string>} */
  const probe = {}
  /** @param {string} field @param {unknown} value @param {string} source */
  const fill = (field, value, source) => {
    if (values[field] !== undefined) return
    if (value === null || value === undefined || value === '') return
    if (Array.isArray(value) && value.length === 0) return
    values[field] = value
    probe[field] = source
  }

  const video = objectOf(layer.video)
  fill('cover_url', urlListUrl(objectOf(video.cover).url_list), 'video.cover.url_list')
  fill('cover_url', urlListUrl(objectOf(video.origin_cover).url_list), 'video.origin_cover.url_list')
  fill('cover_url', urlListUrl(objectOf(video.dynamic_cover).url_list), 'video.dynamic_cover.url_list')
  fill('cover_url', firstHttpUrl(video.poster), 'video.poster')
  fill('video_url', urlListUrl(objectOf(video.play_addr).url_list), 'video.play_addr.url_list')
  fill('video_url', urlListUrl(objectOf(video.playAddr).url_list), 'video.playAddr.url_list')
  fill('video_url', urlListUrl(objectOf(video.download_addr).url_list), 'video.download_addr.url_list')
  const videoDuration = asNumber(video.duration)
  // TikTok's `video.duration` is milliseconds; the same field on other platforms
  // is normally seconds. The conversion is therefore platform-gated instead of
  // applied globally, which would truncate non-TikTok rows to 0.
  if (videoDuration !== null && videoDuration > 0) {
    const seconds = ctx?.platform === 'tiktok' ? Math.round(videoDuration / 1000) : Math.round(videoDuration)
    fill('duration', seconds, 'video.duration')
  }
  const videoWidth = asNumber(video.width)
  const videoHeight = asNumber(video.height)
  if (videoWidth !== null && videoHeight !== null && videoWidth > 0 && videoHeight > 0) {
    fill('ratio', videoWidth / videoHeight, 'video.width/height')
  }

  // TikTok image posts (`image_post_info.images[].display_image.url_list`).
  /** @type {string[]} */
  const imageUrls = []
  for (const raw of arrayOf(objectOf(layer.image_post_info).images)) {
    const image = objectOf(raw)
    const url = urlListUrl(objectOf(image.display_image).url_list)
      || urlListUrl(objectOf(image.thumbnail).url_list)
    if (url) imageUrls.push(url)
  }
  fill('images', imageUrls, 'image_post_info.images[].display_image.url_list')
  if (imageUrls.length > 0) fill('cover_url', imageUrls[0], 'image_post_info.images[0].display_image.url_list')

  const media = xMediaEntries(layer)
  /** @type {string[]} */
  const photoUrls = []
  let bestVideoUrl = ''
  let mediaRatio = null
  let mediaDuration = null
  for (const item of media) {
    const photo = firstHttpUrl(item.media_url_https) || firstHttpUrl(item.media_url)
      || firstHttpUrl(item.display_url) || firstHttpUrl(item.preview_image_url)
    if (photo) photoUrls.push(photo)
    bestVideoUrl = bestVideoUrl || bestMp4Url(objectOf(item.video_info).variants)
      || bestMp4Url(item.variants) || bestMp4Url(objectOf(item.video).variants)
    const info = objectOf(item.original_info)
    const width = asNumber(info.width)
    const height = asNumber(info.height)
    if (mediaRatio === null && width !== null && height !== null && width > 0 && height > 0) {
      mediaRatio = width / height
    }
    const millis = asNumber(objectOf(item.video_info).duration_millis)
    if (mediaDuration === null && millis !== null && millis > 0) mediaDuration = Math.round(millis / 1000)
  }
  fill('images', photoUrls, 'media[].media_url_https')
  fill('cover_url', photoUrls[0], 'media[0].media_url_https')
  fill('video_url', bestVideoUrl, 'media[].video_info.variants')
  fill('ratio', mediaRatio, 'media[].original_info')
  fill('duration', mediaDuration, 'media[].video_info.duration_millis')

  const statistics = objectOf(layer.statistics)
  fill('views', asNumber(statistics.play_count), 'statistics.play_count')
  fill('likes', asNumber(statistics.digg_count), 'statistics.digg_count')
  fill('comments', asNumber(statistics.comment_count), 'statistics.comment_count')
  fill('shares', asNumber(statistics.share_count), 'statistics.share_count')
  fill('saves', asNumber(statistics.collect_count), 'statistics.collect_count')

  return { values, probe }
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
 *   cover_url: string, video_url: string, duration: number | null, ratio: number | null,
 *   stats: { views: number | null, likes: number | null, comments: number | null, shares: number | null, saves: number | null },
 *   field_probe: Record<string, string | null>,
 * }}
 */
export function normalizeRivalPost(row, ctx) {
  const layer = isPlainObject(row) ? row : {}
  const { values, probe } = probeLayer(layer, POST_FIELD_CANDIDATES)
  // One-level nested containers fill only the fields the flat candidates could
  // not read; a hoisted flat field always wins (see `nestedPostFields`).
  // Cover/video precedence is judged on the *derived* flat answer, not just the
  // singular field: a flat `images[]` that already yields a cover must not be
  // overridden by a nested `media[]`/`video.cover`.
  const nested = nestedPostFields(layer, ctx)
  const flatCover = pickCoverUrl(values)
  const flatVideo = pickVideoUrl(values)
  for (const [field, value] of Object.entries(nested.values)) {
    if (field === 'cover_url' && flatCover) continue
    if (field === 'video_url' && flatVideo) continue
    const current = values[field]
    const missing = current === null || current === undefined || current === ''
      || (Array.isArray(current) && current.length === 0)
    if (!missing) continue
    values[field] = value
    probe[field] = nested.probe[field]
  }
  const id = asText(values.id)
  if (!id) return null
  const duration = asNumber(values.duration)
  const ratio = asNumber(values.ratio)
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
    ratio: ratio !== null && ratio > 0 ? ratio : null,
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
 * The observed TikTok wrapper separates profile text from its sibling stats.
 * Only this exact shape and its five observed leaves are supported here.
 * @param {unknown} data
 */
function mapTikTokUserInfo(data) {
  const wrapper = isPlainObject(data) ? data.userInfo : null
  if (!isPlainObject(wrapper) || !isPlainObject(wrapper.user) || !isPlainObject(wrapper.stats)) return null
  const text = (value) => typeof value === 'string' ? value.trim() : ''
  const count = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
  const profile = {
    nickname: text(wrapper.user.nickname),
    avatar_url: tikTokAvatarUrl(wrapper.user.avatarLarger),
    bio: text(wrapper.user.signature),
    followers: count(wrapper.stats.followerCount),
    posts_count: count(wrapper.stats.videoCount),
    external_id_canonical: null,
  }
  return {
    profile,
    field_probe: {
      nickname: profile.nickname ? 'userInfo.user.nickname' : FIELD_PROBE_MISS,
      avatar_url: profile.avatar_url ? 'userInfo.user.avatarLarger' : FIELD_PROBE_MISS,
      bio: profile.bio ? 'userInfo.user.signature' : FIELD_PROBE_MISS,
      followers: profile.followers !== null ? 'userInfo.stats.followerCount' : FIELD_PROBE_MISS,
      posts_count: profile.posts_count !== null ? 'userInfo.stats.videoCount' : FIELD_PROBE_MISS,
      external_id_canonical: FIELD_PROBE_MISS,
    },
    recognized: Object.values(profile).some((value) => value !== null && value !== ''),
  }
}

/** @param {unknown} value */
function tikTokAvatarUrl(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^https?:\/\/[^/]/i.test(text)) return ''
  try {
    const url = new URL(text)
    return url.hostname && ['http:', 'https:'].includes(url.protocol) ? text : ''
  } catch {
    return ''
  }
}

/**
 * Map the account fields of a `user` answer.
 * @param {unknown} data
 * @param {{ platform?: string }} [ctx]
 * @returns {{ profile: Record<string, any>, field_probe: Record<string, string | null>, recognized: boolean }}
 */
export function mapRivalUser(data, ctx = {}) {
  const layer = unwrapRivalUserLayer(data)
  const { values, probe } = probeLayer(layer, USER_FIELD_CANDIDATES)
  const canonical = extractYouTubeChannelId(values.external_id_canonical)
  const profile = {
    nickname: asText(values.nickname),
    avatar_url: firstHttpUrl(values.avatar_url),
    bio: asText(values.bio),
    followers: asNumber(values.followers),
    posts_count: asNumber(values.posts_count),
    external_id_canonical: canonical || null,
  }
  const mapped = {
    profile,
    field_probe: probe,
    recognized: Object.values(profile).some((value) => typeof value === 'number' ? value >= 0 : Boolean(value)),
  }
  // Keep the existing layer preference and all other platforms unchanged.
  if (mapped.recognized || ctx.platform !== 'tiktok') return mapped
  return mapTikTokUserInfo(data) || mapped
}

/**
 * Map a `posts` answer onto normalized rows.
 * @param {unknown} data
 * @param {{ platform: string }} ctx
 * @returns {{ rows: ReturnType<typeof normalizeRivalPost>[], field_probe: Record<string, string | null>, recognized: boolean, source_count: number }}
 */
export function mapRivalPosts(data, ctx) {
  let source = probeRivalPostRows(data)
  // Only the observed direct X container is new; retain every recognized old
  // list (including empty or unusable ones) and the existing row/identity rules.
  if (source === null && ctx?.platform === 'x' && isPlainObject(data) && Array.isArray(data.timeline)) {
    source = rowsOf(data.timeline)
  }
  const raw = source?.rows || []
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
  return { rows, field_probe: fieldProbe, recognized: source !== null, source_count: source?.source_count || 0 }
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
