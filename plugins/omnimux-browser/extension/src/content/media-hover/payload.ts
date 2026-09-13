/**
 * Media payload normalisation: element → absolute, size-checked `HoveredMedia`.
 *
 * This is the only place where a relative media URL is resolved and the only
 * place where the `>= 40 x 40` eligibility rule lives; `media-sniffer.ts`
 * consumes the same predicate so the viewport scan and the hover detector can
 * never drift apart.
 *
 * @module
 */

import type { AnchorRect, HoveredMedia, MediaKind } from './types.ts'

/** Minimum rendered edge length, in CSS pixels, for a media element to count. */
export const MIN_MEDIA_SIZE_PX = 40

/** Upper bound on a generated payload id. */
const ID_MAX_LENGTH = 180

/** Elements that carry a thumbnail inside a larger clickable card. */
const MEDIA_SELECTOR = 'img, video'

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
 * The display address of a media element.
 *
 * A `<video>` prefers its poster (the sniffer's established convention) and
 * falls back to the first playable source when no poster is declared.
 */
export function mediaSourceOf(element: Element, kind: MediaKind, baseUrl: string): string {
  if (kind === 'video' && element instanceof HTMLVideoElement) {
    const poster = toAbsoluteUrl(element.poster, baseUrl)
    if (poster !== '') return poster
    return videoSourceOf(element, baseUrl)
  }
  return imageSourceOf(element, baseUrl)
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
 * @returns The payload, or `null` when no fetchable source exists.
 */
export function normalizeMedia(
  element: Element,
  kind: MediaKind,
  baseUrl: string,
  context: MediaContextOverride = {},
): HoveredMedia | null {
  const src = mediaSourceOf(element, kind, baseUrl)
  if (src === '' || !isFetchableUrl(src)) return null
  const metric = measureElement(element)
  const natural = naturalSizeOf(element, kind)
  return {
    id: mediaIdOf(kind, src),
    type: kind,
    src,
    previewSrc: src,
    pageUrl: context.pageUrl ?? resolvePageUrl(),
    pageTitle: context.pageTitle ?? resolvePageTitle(),
    width: Math.round(metric.width),
    height: Math.round(metric.height),
    naturalWidth: Math.round(natural.naturalWidth),
    naturalHeight: Math.round(natural.naturalHeight),
    alt: mediaLabelOf(element, kind),
    capturedAt: context.capturedAt ?? Date.now(),
  }
}

/**
 * Walks up from a pointer target to the nearest `<img>` / `<video>`.
 *
 * Shadow boundaries are crossed with `host`; the walk is bounded to keep a deep
 * tree from costing more than a pointer move.
 */
export function findMediaElement(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null
  let node: Element | null = target
  for (let depth = 0; node !== null && depth < 20; depth += 1) {
    if (node.localName === 'img' || node.localName === 'video') return node
    if (isSkippable(node)) return null
    const parent: Element | null = node.parentElement
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
