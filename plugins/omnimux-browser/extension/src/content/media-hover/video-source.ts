/**
 * Real video-source resolution behind a media element.
 *
 * Modern players hand the page a `blob:` Media Source handle: on X the `<video>`
 * carries no `http(s)` playable address at all, only a poster thumbnail. A
 * download that trusts the element therefore saves a jpg and believes it saved
 * a video. The actual bytes live elsewhere — progressive `video/mp4` variants
 * come from the public syndication payload (fetched by the background worker,
 * keyed by the tweet id), while the page's own resource timings expose the HLS
 * playlists the player is streaming.
 *
 * This module turns those inputs into candidates and answers one question:
 * which URL is the video? It is pure data in, pure data out — no `chrome.*`, no
 * global `document`, no network, no `performance` reads unless a caller omits
 * the entry list. The caller owns the fetch, the choice and the download.
 *
 * A candidate describes its `kind`, not its downloadability. HLS is reported as
 * `hls` even when it is the only source: a playlist is not a video file, and the
 * caller must decide to show a page-reference hint rather than save it as one.
 *
 * @module
 */

import { isFetchableUrl, toAbsoluteUrl } from './payload.ts'

/** One address a media element can be downloaded from. */
export interface VideoSourceCandidate {
  /** Absolute `http(s)` address. */
  url: string
  kind: 'mp4' | 'hls'
  /** Where the address was observed; only `x-syndication` comes from a network call. */
  origin: 'x-syndication' | 'meta' | 'element' | 'performance'
  width?: number
  height?: number
  bitrate?: number
}

/** One progressive/HLS stream offered by the syndication `video_info`. */
export interface XVideoVariant {
  url: string
  contentType: string
  /** Bits per second; `0` when the payload omits it (HLS playlists do). */
  bitrate: number
}

/** Content types that identify a playlist rather than a progressive file. */
const HLS_CONTENT_TYPES = new Set(['application/x-mpegurl', 'application/vnd.apple.mpegurl'])

/** The only progressive container this module claims to download. */
const MP4_CONTENT_TYPE = 'video/mp4'

/** Poster path segment that encodes the X media id of a tweet video. */
const X_MEDIA_ID_PATTERN = /(?:amplify_video_thumb|ext_tw_video_thumb)\/(\d+)(?:\/|$)/

/** The tweet id segment of an X status link. X ids are 19 digits today. */
const X_STATUS_ID_PATTERN = /\/status\/(\d{19})(?!\d)/

/** The article wrapping one timeline entry; the tweet id is read from it. */
const X_TWEET_ARTICLE_SELECTOR = 'article[data-testid="tweet"]'

/** The first status link inside a tweet article is the tweet's own permalink. */
const X_STATUS_LINK_SELECTOR = 'a[href*="/status/"]'

/** The resource-timing init segment lives under `/0/0/` and is not a video. */
const INIT_SEGMENT_PATTERN = /\/0\/0(?:\/|$)/

/** Dimensions embedded in a CDN path such as `.../avc1/1920x1080/...`. */
const PATH_DIMENSIONS_PATTERN = /(?:^|\/)(\d{2,5})x(\d{2,5})(?:\/|$)/

/**
 * Video declarations, in the order the page exposes them.
 *
 * `og:video:secure_url` outranks `og:video:url` / `og:video`, and the Twitter
 * player stream is checked last because it is frequently an embed URL rather
 * than a file.
 */
const META_VIDEO_SELECTORS = [
  'meta[property="og:video:secure_url"]',
  'meta[property="og:video:url"]',
  'meta[property="og:video"]',
  'meta[name="twitter:player:stream"]',
] as const

/** Lower bound used when a candidate has no measured dimension. */
const MISSING_METRIC = -1

/**
 * Extracts the X media id encoded in a video poster.
 *
 * @param poster - Absolute or relative poster address.
 * @returns The numeric media id, or `null` when the poster is not an X video thumbnail.
 */
export function xMediaIdFromPoster(poster: string): string | null {
  const match = X_MEDIA_ID_PATTERN.exec(poster.trim())
  return match === null ? null : (match[1] ?? null)
}

/**
 * Reads the tweet id the hovered video belongs to.
 *
 * The nearest `article[data-testid="tweet"]` owns the id: its first `/status/`
 * link is the tweet's permalink. Without an article (a video rendered outside
 * the timeline), the page address is the only hint left.
 *
 * @param video - The hovered `<video>` element.
 * @param pageUrl - Address of the page the element was found on.
 * @returns The 19-digit tweet id, or `null` when neither source has one.
 */
export function xTweetIdOf(video: Element, pageUrl: string): string | null {
  const article = video.closest(X_TWEET_ARTICLE_SELECTOR)
  if (article === null) return statusIdOf(pageUrl)
  const link = article.querySelector(X_STATUS_LINK_SELECTOR)
  if (link === null) return null
  const href = link.getAttribute('href')
  return href === null ? null : statusIdOf(href)
}

/**
 * Lists the video variants the syndication payload offers for one poster.
 *
 * The poster is the identity key: `mediaDetails[].media_url_https` repeats it
 * verbatim, which is how a multi-video tweet is disambiguated. Query strings are
 * ignored because the page may request a resized thumbnail while the payload
 * keeps the original address. When no entry matches, a payload with exactly one
 * `video_info` is unambiguous and is used; anything else (no match, several
 * videos, malformed shapes) yields no variants.
 *
 * @param payload - Parsed `tweet-result` JSON, of unknown shape on purpose.
 * @param poster - The hovered video's poster address.
 * @returns The variants, or `[]` when the payload cannot identify a video.
 */
export function xVariantsOfTweetResult(payload: unknown, poster: string): XVideoVariant[] {
  const root = asRecord(payload)
  if (root === null) return []
  const details = root.mediaDetails
  if (!Array.isArray(details)) return []

  const posterKey = stripQueryAndHash(poster.trim())
  const unclaimed: XVideoVariant[][] = []

  for (const rawMedia of details) {
    const media = asRecord(rawMedia)
    if (media === null) continue
    const mediaUrl = asString(media.media_url_https)
    if (mediaUrl !== null && stripQueryAndHash(mediaUrl) === posterKey) {
      // The poster names this media entry: it is either a video or not a video
      // at all, and in neither case may another entry be substituted for it.
      return readVariants(media.video_info) ?? []
    }
    const variants = readVariants(media.video_info)
    if (variants !== null) unclaimed.push(variants)
  }

  return unclaimed.length === 1 ? (unclaimed[0] ?? []) : []
}

/**
 * Picks the best variant offered by a syndication payload.
 *
 * Preference is progressive mp4 first (highest bitrate), then the HLS manifest
 * — never the other way around, because a playlist cannot be saved as a video.
 *
 * @param variants - Variants parsed from {@link xVariantsOfTweetResult}.
 * @returns The chosen variant, or `null` when none is an `http(s)` stream.
 */
export function pickXVideoVariant(variants: readonly XVideoVariant[]): XVideoVariant | null {
  let bestMp4: XVideoVariant | null = null
  let bestHls: XVideoVariant | null = null
  for (const variant of variants) {
    if (!isFetchableUrl(variant.url)) continue
    const contentType = baseContentType(variant.contentType)
    if (contentType === MP4_CONTENT_TYPE) {
      if (bestMp4 === null || variant.bitrate > bestMp4.bitrate) bestMp4 = variant
    } else if (HLS_CONTENT_TYPES.has(contentType)) {
      if (bestHls === null || variant.bitrate > bestHls.bitrate) bestHls = variant
    }
  }
  return bestMp4 ?? bestHls
}

/**
 * Collects video addresses the element itself (or its page head) declares.
 *
 * Covers the direct `<video src>` / `currentSrc`, every `<source>` with its
 * `type` hint, and the page's `og:video` / `twitter:player:stream` metadata.
 * Relative addresses resolve against the page, not the extension origin. Blob
 * and data URLs are rejected: they are page-scoped handles, not downloads.
 *
 * @param video - The hovered `<video>` element (any element is tolerated).
 * @param pageUrl - Address of the containing page, used to absolutise.
 * @returns Candidates in declaration order, de-duplicated by address.
 */
export function videoCandidatesFromElement(video: Element, pageUrl: string): VideoSourceCandidate[] {
  const candidates: VideoSourceCandidate[] = []
  const seen = new Set<string>()
  const dimensions = intrinsicVideoSize(video)

  const push = (
    raw: string | null,
    origin: VideoSourceCandidate['origin'],
    contentTypeHint: string | null,
    size?: { width?: number; height?: number },
  ): void => {
    if (raw === null || raw.trim() === '') return
    const url = toAbsoluteUrl(raw, pageUrl)
    if (url === '' || !isFetchableUrl(url) || seen.has(url)) return
    const kind = candidateKindOf(url, contentTypeHint)
    if (kind === null) return
    seen.add(url)
    candidates.push({ url, kind, origin, ...size })
  }

  for (const raw of directVideoSources(video)) {
    push(raw, 'element', null, dimensions)
  }
  for (const source of video.querySelectorAll('source')) {
    push(source.getAttribute('src'), 'element', source.getAttribute('type'))
  }

  const document = video.ownerDocument
  if (document !== null) {
    for (const selector of META_VIDEO_SELECTORS) {
      const meta = document.querySelector(selector)
      if (meta === null) continue
      push(meta.getAttribute('content'), 'meta', null)
    }
  }
  return candidates
}

/**
 * Collects video resources the page has already fetched.
 *
 * On X the player streams HLS, so `performance` resource timings are the only
 * page-local trace of the video. Filtering by the poster's media id keeps the
 * four `<video>` elements on one status page from claiming each other's
 * resources; without a media id (a generic site) the extension filter is the
 * only discriminator. The `/0/0/` segment is an fMP4 init segment — 904 bytes
 * on the real page — never a downloadable video.
 *
 * @param video - The hovered `<video>` element, read for its poster.
 * @param entryNames - Resource names, usually `performance.getEntriesByType('resource')`.
 * @param pageUrl - Address of the containing page, used to absolutise.
 * @returns Candidates with progressive mp4 first, then HLS.
 */
export function videoCandidatesFromResourceTiming(
  video: Element,
  entryNames: readonly string[],
  pageUrl: string,
): VideoSourceCandidate[] {
  const mediaId = xMediaIdFromPoster(posterOf(video))
  const seen = new Set<string>()
  const mp4: VideoSourceCandidate[] = []
  const hls: VideoSourceCandidate[] = []

  for (const entryName of entryNames) {
    if (typeof entryName !== 'string' || entryName.trim() === '') continue
    const url = toAbsoluteUrl(entryName, pageUrl)
    if (url === '' || !isFetchableUrl(url)) continue
    const pathname = pathnameOf(url)
    if (pathname === null) continue
    const lowerPath = pathname.toLowerCase()
    const kind = lowerPath.endsWith('.m3u8') ? 'hls' : lowerPath.endsWith('.mp4') ? 'mp4' : null
    if (kind === null) continue
    if (INIT_SEGMENT_PATTERN.test(pathname)) continue
    if (mediaId !== null && !url.includes(mediaId)) continue
    if (seen.has(url)) continue
    seen.add(url)
    const candidate: VideoSourceCandidate = {
      url,
      kind,
      origin: 'performance',
      ...dimensionsFromPath(pathname),
    }
    if (kind === 'mp4') mp4.push(candidate)
    else hls.push(candidate)
  }

  return [...mp4, ...hls]
}

/**
 * Picks the candidate a download should use.
 *
 * Progressive mp4 wins by quality: tallest first, then widest, then highest
 * bitrate, so an unknown-dimension candidate never outranks a measured 1080p
 * one. HLS is only returned when there is no mp4 at all — the caller is
 * expected to treat `kind: 'hls'` as "not directly downloadable".
 *
 * @param candidates - Candidates from any source, in any order.
 * @returns The chosen candidate, or `null` when there is nothing usable.
 */
export function pickDownloadCandidate(
  candidates: readonly VideoSourceCandidate[],
): VideoSourceCandidate | null {
  let bestMp4: VideoSourceCandidate | null = null
  let firstHls: VideoSourceCandidate | null = null

  for (const candidate of candidates) {
    if (!isFetchableUrl(candidate.url)) continue
    if (candidate.kind === 'hls') {
      if (firstHls === null) firstHls = candidate
      continue
    }
    if (bestMp4 === null || isHigherQuality(candidate, bestMp4)) bestMp4 = candidate
  }

  return bestMp4 ?? firstHls
}

/**
 * Gathers every video source discoverable without a network round trip.
 *
 * The X syndication payload is fetched by the background worker and is not part
 * of this list: this function is the synchronous fallback used while that
 * request is in flight, fails, or on sites with no syndication endpoint.
 *
 * @param video - The hovered `<video>` element.
 * @param pageUrl - Address of the containing page.
 * @param entryNames - Resource names to inspect; defaults to the element's own
 *   document's performance entries.
 * @returns Element, metadata and resource-timing candidates, de-duplicated.
 */
export function resolveSyncVideoCandidates(
  video: Element,
  pageUrl: string,
  entryNames?: readonly string[],
): VideoSourceCandidate[] {
  const resources = entryNames ?? resourceNamesOf(video)
  const combined = [
    ...videoCandidatesFromElement(video, pageUrl),
    ...videoCandidatesFromResourceTiming(video, resources, pageUrl),
  ]
  const seen = new Set<string>()
  return combined.filter((candidate) => {
    if (seen.has(candidate.url)) return false
    seen.add(candidate.url)
    return true
  })
}

/** Reads the tweet id out of a URL's `/status/<id>` segment. */
function statusIdOf(url: string): string | null {
  const match = X_STATUS_ID_PATTERN.exec(url)
  return match === null ? null : (match[1] ?? null)
}

/** Parses the variants of one `video_info`, or `null` when this is not a video. */
function readVariants(videoInfo: unknown): XVideoVariant[] | null {
  const info = asRecord(videoInfo)
  if (info === null) return null
  const rawVariants = info.variants
  if (!Array.isArray(rawVariants)) return null

  const variants: XVideoVariant[] = []
  for (const rawVariant of rawVariants) {
    const variant = asRecord(rawVariant)
    if (variant === null) continue
    const url = asString(variant.url)
    const contentType = asString(variant.content_type)
    if (url === null || contentType === null || !isFetchableUrl(url)) continue
    variants.push({ url, contentType, bitrate: asFiniteNumber(variant.bitrate) ?? 0 })
  }
  return variants
}

/** The element's own playable addresses, in preference order. */
function directVideoSources(video: Element): string[] {
  const sources: string[] = []
  const currentSrc = stringProperty(video, 'currentSrc')
  if (currentSrc !== '') sources.push(currentSrc)
  const propertySrc = stringProperty(video, 'src')
  if (propertySrc !== '') sources.push(propertySrc)
  const attributeSrc = video.getAttribute('src')
  if (attributeSrc !== null) sources.push(attributeSrc)
  return sources
}

/** The hovered video's poster, preferring the raw attribute (portable). */
function posterOf(video: Element): string {
  const attribute = video.getAttribute('poster')
  if (attribute !== null && attribute.trim() !== '') return attribute
  return stringProperty(video, 'poster')
}

/** Intrinsic size, available only after the browser has loaded metadata. */
function intrinsicVideoSize(video: Element): { width?: number; height?: number } {
  const width = positiveNumberProperty(video, 'videoWidth')
  const height = positiveNumberProperty(video, 'videoHeight')
  return width !== null && height !== null ? { width, height } : {}
}

/** Maps an address (and an optional `<source type>`) to a candidate kind. */
function candidateKindOf(url: string, contentTypeHint: string | null): VideoSourceCandidate['kind'] | null {
  if (contentTypeHint !== null) {
    const hint = baseContentType(contentTypeHint)
    if (HLS_CONTENT_TYPES.has(hint)) return 'hls'
    if (hint === MP4_CONTENT_TYPE) return 'mp4'
    // A known non-mp4 video container cannot be represented by this contract;
    // omitting it beats downloading a webm under an mp4 label.
    if (hint.startsWith('video/')) return null
  }
  const pathname = stripQueryAndHash(url).toLowerCase()
  if (pathname.endsWith('.m3u8')) return 'hls'
  // Any remaining `http(s)` media address is treated as a progressive file:
  // a <video src> that names no playlist is the only thing that can play.
  return 'mp4'
}

/** Lower-cased media type without parameters such as `; codecs=...`. */
function baseContentType(contentType: string): string {
  return (contentType.split(';')[0] ?? '').trim().toLowerCase()
}

/** Whether `candidate` outranks `current` on height, then width, then bitrate. */
function isHigherQuality(candidate: VideoSourceCandidate, current: VideoSourceCandidate): boolean {
  const height = (candidate.height ?? MISSING_METRIC) - (current.height ?? MISSING_METRIC)
  if (height !== 0) return height > 0
  const width = (candidate.width ?? MISSING_METRIC) - (current.width ?? MISSING_METRIC)
  if (width !== 0) return width > 0
  return (candidate.bitrate ?? MISSING_METRIC) > (current.bitrate ?? MISSING_METRIC)
}

/** Reads `width x height` out of a CDN path, if it carries one. */
function dimensionsFromPath(pathname: string): { width?: number; height?: number } {
  const match = PATH_DIMENSIONS_PATTERN.exec(pathname)
  if (match === null) return {}
  const width = Number.parseInt(match[1] ?? '', 10)
  const height = Number.parseInt(match[2] ?? '', 10)
  return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : {}
}

/** The pathname of an already-absolutised URL, or `null` when unparsable. */
function pathnameOf(url: string): string | null {
  try {
    return new URL(url).pathname
  } catch {
    return null
  }
}

/** Drops a query string and fragment so two spellings of one address compare equal. */
function stripQueryAndHash(url: string): string {
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
}

/** The element's document's resource names, when a live Performance API exists. */
function resourceNamesOf(video: Element): string[] {
  const pageWindow = video.ownerDocument === null ? null : video.ownerDocument.defaultView
  const performance = pageWindow === null ? undefined : pageWindow.performance
  if (performance === undefined || typeof performance.getEntriesByType !== 'function') return []
  try {
    return performance.getEntriesByType('resource').map((entry) => entry.name)
  } catch {
    // Pages may stub or partially implement Performance; a sniffing failure
    // must degrade to the element candidates instead of escaping the listener.
    return []
  }
}

/** A string-valued DOM property, read without depending on a concrete element class. */
function stringProperty(element: Element, name: string): string {
  const value = (element as unknown as Record<string, unknown>)[name]
  return typeof value === 'string' ? value : ''
}

/** A positive finite DOM property, read without depending on a concrete element class. */
function positiveNumberProperty(element: Element, name: string): number | null {
  const value = (element as unknown as Record<string, unknown>)[name]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** Narrows an unknown JSON value to a plain object. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** Narrows an unknown JSON value to a non-empty trimmed string. */
function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Narrows an unknown JSON value to a finite number. */
function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
