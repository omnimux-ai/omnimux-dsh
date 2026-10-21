/**
 * Shared readers for page capture: inline JSON, meta tags, URLs and shapes.
 *
 * Everything here is pure and offline. Inline JSON is untrusted page text, so
 * every parser fails closed (`null`) instead of throwing into the message
 * handler; the caller then falls back to another source or to the generic DOM
 * extractor.
 *
 * @module
 */

import { MAX_CAPTURE_MEDIA, type CapturedMedia, type ContentShape } from './types.ts'

/** Normalised text of an element, or `''`. */
export function textOf(node: Element | null | undefined): string {
  return (node?.textContent || '').replace(/\s+/g, ' ').trim()
}

/** First non-empty value, trimmed. */
export function firstNonEmpty(...values: readonly (string | null | undefined)[]): string {
  for (const value of values) {
    const trimmed = (value || '').trim()
    if (trimmed !== '') return trimmed
  }
  return ''
}

/** First non-empty line of a text body, shortened to `maxLength`. */
export function titleFromText(text: string, maxLength = 140): string {
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find((line) => line !== '') ?? ''
  const value = firstLine !== '' ? firstLine : text.replace(/\s+/g, ' ').trim()
  return value.slice(0, maxLength)
}

/** Content of the first matching meta tag, or `''`. */
export function metaContent(doc: Document, selectors: readonly string[]): string {
  for (const selector of selectors) {
    const value = doc.querySelector<HTMLMetaElement>(selector)?.content
    const trimmed = (value || '').trim()
    if (trimmed !== '') return trimmed
  }
  return ''
}

/** Absolute href of the first matching link, or `''`. */
export function linkHref(doc: Document, selectors: readonly string[], base: string): string {
  for (const selector of selectors) {
    const raw = doc.querySelector<HTMLLinkElement>(selector)?.getAttribute('href')
    const url = absoluteHttpUrl(raw, base)
    if (url !== null) return url
  }
  return ''
}

/** Absolute http(s) URL, or `null` for empty / data: / javascript: / malformed input. */
export function absoluteHttpUrl(raw: string | null | undefined, base: string): string | null {
  const value = (raw || '').trim()
  if (value === '' || value.startsWith('data:') || value.startsWith('#')) return null
  try {
    const url = new URL(value, base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

/** Record form of a parsed JSON value, or `null` for scalars and arrays. */
export function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/** Array form of a parsed JSON value, or `[]`. */
export function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** First string (or finite number) stored under one of `keys`, or `''`. */
export function stringField(record: Record<string, unknown> | null, keys: readonly string[]): string {
  if (record === null) return ''
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

/** Non-negative integer from a number or a formatted counter string. */
export function positiveInt(value: unknown): number | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return undefined
    return Math.round(value)
  }
  if (typeof value === 'string') {
    const digits = value.replace(/[^0-9]/g, '')
    if (digits === '') return undefined
    const parsed = Number.parseInt(digits, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/** First counter from `keys`, as a number. */
export function numberField(record: Record<string, unknown> | null, keys: readonly string[]): number | undefined {
  if (record === null) return undefined
  for (const key of keys) {
    const parsed = positiveInt(record[key])
    if (parsed !== undefined) return parsed
  }
  return undefined
}

/** ISO timestamp from a unix value (seconds or milliseconds) or an ISO string. */
export function isoFromDate(value: unknown): string | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return undefined
    const milliseconds = value > 1e12 ? value : value * 1000
    const parsed = new Date(milliseconds)
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return undefined
    if (/^\d+$/.test(trimmed)) return isoFromDate(Number(trimmed))
    const parsed = Date.parse(trimmed)
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
  }
  return undefined
}

/**
 * Best public URL inside a platform's address value.
 *
 * Platforms nest the same address three ways (`"url"`, `"url_list"` /
 * `"urlList"`, `{ "urlDefault" }`), so one reader walks all of them. When the
 * list is ordered small-to-large (TikTok images), `preferLast` picks the best.
 */
export function firstHttpUrl(value: unknown, base: string, preferLast = false): string | null {
  const candidates: string[] = []
  const collect = (input: unknown): void => {
    if (typeof input === 'string') {
      candidates.push(input)
      return
    }
    if (Array.isArray(input)) {
      for (const item of input) collect(item)
      return
    }
    const record = recordOf(input)
    if (record === null) return
    for (const key of ['url_list', 'urlList', 'url', 'urlDefault', 'urlPre', 'infoList', 'masterUrl', 'backupUrls']) {
      if (key in record) collect(record[key])
    }
  }
  collect(value)
  const ordered = preferLast ? [...candidates].reverse() : candidates
  for (const candidate of ordered) {
    const url = absoluteHttpUrl(candidate, base)
    if (url !== null) return url
  }
  return null
}

/** Distinct http(s) media entries, capped at the contract limit. */
export function uniqueMedia(items: readonly CapturedMedia[]): CapturedMedia[] {
  const seen = new Set<string>()
  const media: CapturedMedia[] = []
  for (const item of items) {
    if (!/^https?:\/\//i.test(item.url) || seen.has(item.url)) continue
    seen.add(item.url)
    media.push(item)
    if (media.length >= MAX_CAPTURE_MEDIA) break
  }
  return media
}

/** Shape decided by the media list alone. */
export function contentShapeOf(media: readonly CapturedMedia[]): ContentShape {
  if (media.some((item) => item.type === 'video')) return 'video'
  if (media.length > 1) return 'gallery'
  if (media.length === 1) return 'photo'
  return 'text'
}

/** Whether an image is page chrome (avatar, icon, logo, tiny spacer) rather than work media. */
export function isDecorativeImage(image: Element, url: string): boolean {
  const lower = url.toLowerCase()
  if (/(avatar|icon|logo|sprite|emoji|badge|placeholder|spacer|pixel|1x1|qlogo|favicon)/.test(lower)) return true
  if (/\.svg(\?|$)/.test(lower)) return true
  const width = Number(image.getAttribute('width') || image.getAttribute('data-width') || 0)
  const height = Number(image.getAttribute('height') || image.getAttribute('data-height') || 0)
  if (width > 0 && width < 120) return true
  if (height > 0 && height < 120) return true
  return false
}

/** Images under `root`, page chrome excluded. */
export function domImages(root: ParentNode, base: string, selector = 'img'): CapturedMedia[] {
  const media: CapturedMedia[] = []
  for (const image of root.querySelectorAll<HTMLImageElement>(selector)) {
    const raw = image.getAttribute('src')
      || image.getAttribute('data-src')
      || image.getAttribute('data-original')
      || ''
    const url = absoluteHttpUrl(raw, base)
    if (url === null || isDecorativeImage(image, url)) continue
    media.push({ type: 'image', url })
  }
  return media
}

/** Playable `<video src>` / `<video><source>` addresses under `root`. */
export function domVideos(root: ParentNode, base: string): CapturedMedia[] {
  const media: CapturedMedia[] = []
  for (const video of root.querySelectorAll<HTMLVideoElement>('video')) {
    const urls: string[] = []
    const direct = absoluteHttpUrl(video.getAttribute('src'), base)
    if (direct !== null) urls.push(direct)
    for (const source of video.querySelectorAll('source')) {
      const url = absoluteHttpUrl(source.getAttribute('src'), base)
      if (url !== null) urls.push(url)
    }
    for (const url of urls) media.push({ type: 'video', url })
  }
  return media
}

/** First video poster address under `root`, or `''`. */
export function videoPoster(root: ParentNode, base: string): string {
  const raw = root.querySelector<HTMLVideoElement>('video[poster]')?.getAttribute('poster')
  return absoluteHttpUrl(raw, base) ?? ''
}

/** Balanced `{...}` / `[...]` starting at `start`, or `null` when truncated. */
export function balancedValueAt(text: string, start: number): string | null {
  const open = text[start]
  if (open !== '{' && open !== '[') return null
  let depth = 0
  let inString = false
  let quote = ''
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) inString = false
      continue
    }
    if (char === '"' || char === "'") {
      inString = true
      quote = char
      continue
    }
    if (char === '{' || char === '[') {
      depth += 1
    } else if (char === '}' || char === ']') {
      depth -= 1
      if (depth === 0) return text.slice(start, index + 1)
    }
  }
  return null
}

/**
 * The JSON value assigned after `marker` (`var x = {...};` / `window.x = {...}`).
 *
 * A marker followed by `;` before any value means the page never assigned it.
 */
export function valueAfterMarker(text: string, marker: string): string | null {
  const markerIndex = text.indexOf(marker)
  if (markerIndex < 0) return null
  for (let index = markerIndex + marker.length; index < text.length; index += 1) {
    const char = text[index]
    if (char === '{' || char === '[') return balancedValueAt(text, index)
    if (char === ';') return null
  }
  return null
}

/** Parsed JSON, or `null` for empty / malformed text. */
export function parseJson(raw: string | null | undefined): unknown {
  if (raw === null || raw === undefined || raw.trim() === '') return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Every non-empty inline `<script>` text, in document order. */
export function scriptTexts(doc: Document): string[] {
  const texts: string[] = []
  for (const script of doc.querySelectorAll('script')) {
    const text = script.textContent || ''
    if (text.trim() !== '') texts.push(text)
  }
  return texts
}

/** JSON value assigned after the first inline-script marker that parses. */
export function scriptJsonAfterMarker(doc: Document, markers: readonly string[]): unknown {
  for (const text of scriptTexts(doc)) {
    for (const marker of markers) {
      if (!text.includes(marker)) continue
      const parsed = parseJson(valueAfterMarker(text, marker))
      if (parsed !== null) return parsed
    }
  }
  return null
}

/** JSON object stored under `"key"` in the first inline script that carries it. */
export function keyedJsonInScripts(doc: Document, keys: readonly string[]): unknown {
  for (const text of scriptTexts(doc)) {
    for (const key of keys) {
      if (!text.includes(`"${key}"`)) continue
      const parsed = parseJson(valueAfterMarker(text, `"${key}"`))
      if (parsed !== null) return parsed
    }
  }
  return null
}

/** JSON-LD nodes flattened from `@graph`, in document order. */
export function jsonLdNodes(doc: Document): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = []
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    collectJsonLd(parseJson(stripToJson(script.textContent || '')), nodes)
  }
  return nodes
}

/** Trim wrapper text around a JSON-LD body, when the page served one. */
export function stripToJson(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed
  const start = trimmed.search(/[{[]/)
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'))
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed
}

function collectJsonLd(value: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLd(item, out)
    return
  }
  const record = recordOf(value)
  if (record === null) return
  const graph = record['@graph']
  if (Array.isArray(graph)) collectJsonLd(graph, out)
  out.push(record)
}

/**
 * Breadth-first search for the first object a predicate accepts.
 *
 * Platform payloads wrap the work differently on every page variant, so the
 * extractors locate it by shape ("has `desc` and `images`") instead of by a
 * fixed property path that one page layout would invalidate.
 */
export function findDeepObject(
  root: unknown,
  predicate: (record: Record<string, unknown>) => boolean,
  maxDepth = 14,
): Record<string, unknown> | null {
  const queue: { value: unknown, depth: number }[] = [{ value: root, depth: 0 }]
  const visited = new Set<object>()
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined || current.depth > maxDepth) continue
    if (Array.isArray(current.value)) {
      for (const item of current.value) queue.push({ value: item, depth: current.depth + 1 })
      continue
    }
    const record = recordOf(current.value)
    if (record === null || visited.has(record)) continue
    visited.add(record)
    if (predicate(record)) return record
    for (const child of Object.values(record)) {
      if (typeof child === 'object' && child !== null) queue.push({ value: child, depth: current.depth + 1 })
    }
  }
  return null
}
