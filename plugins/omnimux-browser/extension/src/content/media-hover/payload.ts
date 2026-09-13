/**
 * Media payload normalisation: element → absolute, size-checked `HoveredMedia`.
 *
 * This is the only place where a relative media URL is resolved and the only
 * place where the `>= 40 x 40` eligibility rule lives; `media-sniffer.ts`
 * consumes the same predicate so the viewport scan and the hover detector can
 * never drift apart.
 *
 * It is also the only place that decides *which* address a media element is
 * known by. Modern players rarely expose one: a Twitter/X video hands out a
 * `blob:` handle and no poster, so a single `http(s)`-only rule dropped the
 * element entirely and the capsule never appeared over the video. The rule is
 * therefore a ladder ({@link resolveMediaSource}) that always yields a usable
 * identity, and an explicit `attachable` flag for the rungs the workbench
 * cannot re-fetch on its own.
 *
 * @module
 */

import type {
  AnchorRect,
  HoveredMedia,
  MediaKind,
  MediaSourceKind,
  MediaSourceResolution,
} from './types.ts'

/**
 * The creative-asset rule lives in its own module and is re-exported here so a
 * caller imports every media predicate from one place: the pointer detector, the
 * viewport sniffer and the classifier must never disagree about which elements
 * are offered a hover capsule.
 */
export { MIN_POST_MEDIA_SIZE_PX, isPostOrWorkMedia } from './classifier.ts'

/** Minimum rendered edge length, in CSS pixels, for a media element to count. */
export const MIN_MEDIA_SIZE_PX = 40

/** Upper bound on a generated payload id. */
const ID_MAX_LENGTH = 180

/** Elements that carry a thumbnail inside a larger clickable card. */
const MEDIA_SELECTOR = 'img, video'

/** Longest edge of a frame captured from a playing video. */
const FRAME_MAX_EDGE = 640

/** JPEG quality for a captured frame. */
const FRAME_QUALITY = 0.72

/** Upper bound on a captured frame's data URL, so one frame cannot bloat a message. */
const FRAME_MAX_CHARS = 256 * 1024

/** How far the page-level rung walks looking for an enclosing `<a href>`. */
const PAGE_LINK_DEPTH = 6

/** Rendered-size facts about one element. */
export interface MediaMetric {
  width: number
  height: number
}

/** Intrinsic-size facts about one element. */
export interface NaturalMediaSize {
  naturalWidth: number
  naturalHeight: number
}

/** Optional context overrides; production always reads the live document. */
export interface MediaContextOverride {
  pageUrl?: string
  pageTitle?: string
  capturedAt?: number
}

/** A point in viewport coordinates. */
export interface PointerPoint {
  x: number
  y: number
}

/**
 * Rendered size of an element, preferring the layout box and falling back to
 * the `width`/`height` attributes when no layout engine is available (jsdom).
 */
export function measureElement(element: Element): MediaMetric {
  const rect = element.getBoundingClientRect()
  const attrWidth = readPositiveNumber(element.getAttribute('width'))
  const attrHeight = readPositiveNumber(element.getAttribute('height'))
  const width = rect.width > 0 ? rect.width : (attrWidth ?? 0)
  const height = rect.height > 0 ? rect.height : (attrHeight ?? 0)
  return { width, height }
}

/**
 * Whether a rendered size is large enough to hold a hover capsule.
 *
 * Serves as the shared `>= 40px` rule for both the pointer detector and the
 * viewport sniffer.
 */
export function isEligibleMediaSize(width: number, height: number): boolean {
  return width >= MIN_MEDIA_SIZE_PX && height >= MIN_MEDIA_SIZE_PX
}

/**
 * Whether an element sits inside the viewport (or overlaps it).
 *
 * @param rect - Current bounding box of the element.
 * @param viewportWidth - Visible viewport width in CSS pixels.
 * @param viewportHeight - Visible viewport height in CSS pixels.
 */
export function isElementInViewport(rect: AnchorRect, viewportWidth: number, viewportHeight: number): boolean {
  return rect.bottom > 0 && rect.right > 0 && rect.top < viewportHeight && rect.left < viewportWidth
}

/**
 * Resolves a raw URL against the page address.
 *
 * @returns The absolute URL, or `''` when the input is empty or unparsable.
 */
export function toAbsoluteUrl(raw: string, baseUrl: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  try {
    return new URL(trimmed, baseUrl).href
  } catch {
    return ''
  }
}

/**
 * Whether a URL can be re-fetched by the workbench.
 *
 * Inline `data:` payloads and `blob:` handles are page-scoped: they resolve
 * nowhere inside the extension origin, so they are rejected at this layer.
 */
export function isFetchableUrl(url: string): boolean {
  return /^https?:/i.test(url)
}

/**
 * Names the rung a raw address belongs to.
 *
 * Kept separate from {@link resolveMediaSource} so a caller holding only a
 * string — the sniffer, a replayed record — can label it without an element.
 */
export function classifyMediaSource(url: string): MediaSourceKind {
  if (/^blob:/i.test(url)) return 'blob'
  if (/^data:/i.test(url)) return 'frame'
  if (isFetchableUrl(url)) return 'direct'
  return 'page'
}

/** Attribute-based fallback when no intrinsic size is available (lazy images). */
function readDimensionAttribute(element: Element): number {
  const raw = element.getAttribute('width') ?? element.getAttribute('height')
  return readPositiveNumber(raw) ?? 0
}

function readPositiveNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

/** Truncates a value so a pathological data URL cannot bloat the payload id. */
function bounded(value: string): string {
  return value.length > ID_MAX_LENGTH ? value.slice(0, ID_MAX_LENGTH) : value
}

/**
 * Intrinsic media size.
 *
 * - `<img>`: `naturalWidth` / `naturalHeight`, falling back to the `width` /
 *   `height` attributes for lazily decoded images.
 * - `<video>`: `videoWidth` / `videoHeight`, falling back to `poster` size
 *   proxies (the attributes) when metadata has not loaded yet.
 */
export function naturalSizeOf(element: Element, kind: MediaKind): NaturalMediaSize {
  if (kind === 'video' && element instanceof HTMLVideoElement) {
    const width = Number.isFinite(element.videoWidth) ? element.videoWidth : 0
    const height = Number.isFinite(element.videoHeight) ? element.videoHeight : 0
    if (width > 0 && height > 0) return { naturalWidth: width, naturalHeight: height }
    const fallback = readDimensionAttribute(element)
    return { naturalWidth: fallback, naturalHeight: fallback }
  }
  if (element instanceof HTMLImageElement) {
    const width = Number.isFinite(element.naturalWidth) ? element.naturalWidth : 0
    const height = Number.isFinite(element.naturalHeight) ? element.naturalHeight : 0
    if (width > 0 && height > 0) return { naturalWidth: width, naturalHeight: height }
    const fallback = readDimensionAttribute(element)
    return { naturalWidth: fallback, naturalHeight: fallback }
  }
  const fallback = readDimensionAttribute(element)
  return { naturalWidth: fallback, naturalHeight: fallback }
}

/** The visual (non-video) source of an element, already absolute. */
function imageSourceOf(element: Element, baseUrl: string): string {
  if (element instanceof HTMLImageElement) {
    return toAbsoluteUrl(element.currentSrc || element.src, baseUrl)
  }
  const lazy = element.getAttribute('src')
  return lazy === null ? '' : toAbsoluteUrl(lazy, baseUrl)
}

/** The playable source of a `<video>`, in resolution order. */
function videoSourceOf(video: HTMLVideoElement, baseUrl: string): string {
  const direct = toAbsoluteUrl(video.currentSrc || video.src, baseUrl)
  if (direct !== '') return direct
  const sources = video.querySelectorAll('source')
  for (const source of sources) {
    const candidate = toAbsoluteUrl(source.getAttribute('src') ?? '', baseUrl)
    if (candidate !== '') return candidate
  }
  return ''
}

/**
 * Draws the video's current frame into a detached canvas and encodes it as a
 * JPEG data URL.
 *
 * This is the only visual credential a cross-origin or `blob:` video can offer
 * the workbench. Every failure path returns `''` rather than throwing: a
 * cross-origin video without CORS makes `drawImage` / `toDataURL` raise
 * `SecurityError`, and that must degrade to the next rung instead of escaping
 * into the pointer listener.
 *
 * @param video - The `<video>` element to capture.
 * @returns A `data:image/jpeg` URL, or `''` when no frame could be read.
 */
export function captureVideoFrame(video: HTMLVideoElement): string {
  try {
    if (video.readyState < 2) return ''
    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight
    if (!(sourceWidth > 0) || !(sourceHeight > 0)) return ''
    if (typeof document === 'undefined') return ''

    const scale = Math.min(1, FRAME_MAX_EDGE / Math.max(sourceWidth, sourceHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sourceWidth * scale))
    canvas.height = Math.max(1, Math.round(sourceHeight * scale))
    const context = canvas.getContext('2d')
    if (context === null) return ''
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const encoded = canvas.toDataURL('image/jpeg', FRAME_QUALITY)
    // The cap is read against the encoded string, which is what actually travels.
    return encoded.length > FRAME_MAX_CHARS ? '' : encoded
  } catch {
    return ''
  }
}

/** The page address an element belongs to, preferring an enclosing link. */
function pageReferenceOf(element: Element, baseUrl: string): string {
  let node: Element | null = element
  for (let depth = 0; node !== null && depth < PAGE_LINK_DEPTH; depth += 1) {
    const href = node.getAttribute('href')
    if (href !== null && node.localName === 'a') {
      const absolute = toAbsoluteUrl(href, baseUrl)
      if (isFetchableUrl(absolute)) return absolute
    }
    node = node.parentElement
  }
  return baseUrl
}

/**
 * Resolves a `<video>` address down the ladder.
 *
 * Rung order is `poster → direct → blob → frame → page`. The poster outranks the
 * playable source because that is the established convention for the payload's
 * `src` (a poster is what the sniffer and the workbench thumbnail both expect),
 * and `blob` outranks `frame` because the `blob:` handle is the video's real
 * identity while a captured frame is only a picture of it — the frame rides
 * along in `previewSrc`, and the action layer keys its degradation on `blob`.
 */
function resolveVideoSource(
  video: HTMLVideoElement,
  baseUrl: string,
  captureFrame: boolean,
): MediaSourceResolution {
  const playable = videoSourceOf(video, baseUrl)
  const poster = toAbsoluteUrl(video.poster, baseUrl)

  if (isFetchableUrl(poster)) {
    return { src: poster, previewSrc: poster, kind: 'poster', attachable: true }
  }
  if (isFetchableUrl(playable)) {
    return { src: playable, previewSrc: playable, kind: 'direct', attachable: true }
  }
  if (/^blob:/i.test(playable)) {
    const frame = captureFrame ? captureVideoFrame(video) : ''
    return { src: playable, previewSrc: frame, kind: 'blob', attachable: false }
  }
  if (captureFrame) {
    const frame = captureVideoFrame(video)
    if (frame !== '') return { src: frame, previewSrc: frame, kind: 'frame', attachable: true }
  }
  const page = pageReferenceOf(video, baseUrl)
  return { src: page, previewSrc: '', kind: 'page', attachable: page !== '' }
}

/**
 * Resolves the address a media element should be known by.
 *
 * @param element - The `<img>` or `<video>` element under the pointer.
 * @param kind - Media kind, resolved by the caller's tag check.
 * @param baseUrl - Page address used to absolutise relative sources.
 * @param captureFrame - Set `false` for the cheap identity probe the detector
 *   runs on every pointer move; a canvas capture is far too expensive there.
 * @returns The resolved address, or an empty `src` when nothing could be used.
 */
export function resolveMediaSource(
  element: Element,
  kind: MediaKind,
  baseUrl: string,
  captureFrame = true,
): MediaSourceResolution {
  if (kind === 'video' && element instanceof HTMLVideoElement) {
    return resolveVideoSource(element, baseUrl, captureFrame)
  }
  // Images keep the strict rule: an inline or object URL is not an address the
  // workbench can re-fetch, and an image has no frame worth carrying instead.
  const src = imageSourceOf(element, baseUrl)
  if (src === '' || !isFetchableUrl(src)) {
    return { src: '', previewSrc: '', kind: 'page', attachable: false }
  }
  return { src, previewSrc: src, kind: 'direct', attachable: true }
}

/**
 * The display address of a media element.
 *
 * A thin projection of {@link resolveMediaSource} kept for callers that only
 * need the string; it never triggers a frame capture.
 */
export function mediaSourceOf(element: Element, kind: MediaKind, baseUrl: string): string {
  return resolveMediaSource(element, kind, baseUrl, false).src
}

/**
 * Whether a payload's address can be re-fetched by the workbench.
 *
 * Legacy payloads carry no flag and are `direct` by construction, so the default
 * is derived from the same classifier the ladder uses; the explicit `false`
 * comes from the `blob` rung.
 */
export function isAttachablePayload(payload: HoveredMedia): boolean {
  if (payload.attachable !== undefined) return payload.attachable
  return classifyMediaSource(payload.src) !== 'blob'
}

/** The alt-like label of an element. */
export function mediaLabelOf(element: Element, kind: MediaKind, altOverride?: string): string {
  if (altOverride !== undefined) return altOverride
  const alt = element.getAttribute('alt')
  if (alt !== null && alt.trim() !== '') return alt.trim()
  const title = element.getAttribute('title')
  if (title !== null && title.trim() !== '') return title.trim()
  return kind === 'video' ? '视频素材' : '图片素材'
}

/** Builds the stable payload identity for one media address. */
export function mediaIdOf(kind: MediaKind, src: string): string {
  return `${kind}:${bounded(src)}`
}

/**
 * Normalises an image or video element into a `HoveredMedia` payload.
 *
 * @param element - The `<img>` or `<video>` element under the pointer.
 * @param kind - Media kind, resolved by the caller's tag check.
 * @param baseUrl - Page address used to absolutise relative sources.
 * @param context - Optional page/capture overrides.
 * @returns The payload, or `null` when the ladder resolved no address at all.
 */
export function normalizeMedia(
  element: Element,
  kind: MediaKind,
  baseUrl: string,
  context: MediaContextOverride = {},
): HoveredMedia | null {
  const resolution = resolveMediaSource(element, kind, baseUrl)
  if (resolution.src === '') return null
  const metric = measureElement(element)
  const natural = naturalSizeOf(element, kind)
  return {
    id: mediaIdOf(kind, resolution.src),
    type: kind,
    src: resolution.src,
    previewSrc: resolution.previewSrc !== '' ? resolution.previewSrc : resolution.src,
    pageUrl: context.pageUrl ?? resolvePageUrl(),
    pageTitle: context.pageTitle ?? resolvePageTitle(),
    width: Math.round(metric.width),
    height: Math.round(metric.height),
    naturalWidth: Math.round(natural.naturalWidth),
    naturalHeight: Math.round(natural.naturalHeight),
    alt: mediaLabelOf(element, kind),
    capturedAt: context.capturedAt ?? Date.now(),
    sourceKind: resolution.kind,
    attachable: resolution.attachable,
  }
}

/**
 * Finds the media a page-nested play overlay is covering.
 *
 * Modern players (X/Twitter, Bilibili, YouTube) paint a transparent click
 * catcher over the video, so the pointer hit lands on a `<div>` that is the
 * video's *sibling*, not its descendant — walking up from it never reaches the
 * video. This looks one level sideways instead, inside the parent the walk is
 * about to leave.
 *
 * Bounded on purpose: the container's own descendants only, never the document,
 * and never inside `<html>` / `<body>` / `<head>`.
 *
 * @param container - The parent the upward walk is leaving.
 * @param point - Pointer position; when known, only a media box containing it
 *   is accepted, which is what disambiguates a grid feed full of videos.
 */
export function siblingMediaOf(container: Element, point?: PointerPoint): Element | null {
  if (isSkippable(container)) return null
  let fallback: Element | null = null
  for (const candidate of container.querySelectorAll(MEDIA_SELECTOR)) {
    if (!candidate.isConnected) continue
    const metric = measureElement(candidate)
    if (!isEligibleMediaSize(metric.width, metric.height)) continue
    if (point === undefined) return candidate
    if (containsPoint(candidate, point)) return candidate
    if (fallback === null) fallback = candidate
  }
  // With a pointer position only a containing box is trustworthy; without one
  // (the jsdom fallback path) the first eligible media is the best available.
  return point === undefined ? fallback : null
}

function containsPoint(element: Element, point: PointerPoint): boolean {
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  return point.x >= rect.left && point.x <= rect.right
    && point.y >= rect.top && point.y <= rect.bottom
}

/**
 * Walks up from a pointer target to the nearest `<img>` / `<video>`.
 *
 * Shadow boundaries are crossed with `host`; the walk is bounded to keep a deep
 * tree from costing more than a pointer move. Each level also probes the
 * container it is about to leave for a media sibling (see
 * {@link siblingMediaOf}), which is how a play overlay resolves to its video.
 *
 * @param target - The element the hit test returned.
 * @param point - Pointer position, used to disambiguate the sibling probe.
 */
export function findMediaElement(target: EventTarget | null, point?: PointerPoint): Element | null {
  if (!(target instanceof Element)) return null
  let node: Element | null = target
  for (let depth = 0; node !== null && depth < 20; depth += 1) {
    if (node.localName === 'img' || node.localName === 'video') return node
    if (isSkippable(node)) return null
    const parent: Element | null = node.parentElement
    if (parent !== null) {
      const sibling = siblingMediaOf(parent, point)
      if (sibling !== null) return sibling
    }
    const root = node.getRootNode()
    node = parent ?? (root instanceof ShadowRoot ? root.host : null)
  }
  return null
}

/** Resolves the media kind from an element tag, or `null` for other tags. */
export function mediaKindOf(element: Element): MediaKind | null {
  if (element.localName === 'img') return 'image'
  if (element.localName === 'video') return 'video'
  return null
}

/** Queries the nearest media descendant of a node (light DOM only). */
export function queryMediaElement(root: Element): Element | null {
  if (root.localName === 'img' || root.localName === 'video') return root
  return root.querySelector(MEDIA_SELECTOR)
}

function isSkippable(node: Element): boolean {
  const name = node.localName
  return name === 'html' || name === 'body' || name === 'head'
}

/** The address of the live document, or an empty string outside a page. */
function resolvePageUrl(): string {
  return typeof location === 'undefined' ? '' : location.href
}

function resolvePageTitle(): string {
  return typeof document === 'undefined' ? '' : document.title
}
