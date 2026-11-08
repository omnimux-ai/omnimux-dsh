/**
 * Canvas renderer for the X poster.
 *
 * The poster is a fixed-width, content-height portrait card: the author's
 * avatar, name and handle, the original post body unchanged, and a small
 * OmniMux watermark. Everything is code-fixed (the reference artifact look) —
 * the only user choice is the light or dark theme.
 *
 * The renderer takes its canvas and image loader as dependencies so the layout
 * maths can be unit-tested without a browser canvas implementation.
 *
 * @module
 */

import { POSTER_THEMES, type PosterThemeTokens } from './themes.ts'
import type { PosterRenderResult, PosterTheme, TweetPosterSource } from './types.ts'

export const POSTER_WIDTH = 1280
export const POSTER_PADDING = 100
export const POSTER_CONTENT_WIDTH = POSTER_WIDTH - POSTER_PADDING * 2
export const POSTER_BODY_SIZE = 40
export const POSTER_BODY_LINE_HEIGHT = 68
export const POSTER_AVATAR_RADIUS = 52
export const POSTER_HEADER_HEIGHT = POSTER_AVATAR_RADIUS * 2 + 56
export const POSTER_WATERMARK_HEIGHT = 110
export const POSTER_MAX_HEIGHT = 4000
export const POSTER_EMPTY_BODY = '（无正文）'

const SANS_STACK =
  '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","WenQuanYi Zen Hei",sans-serif'

/** The slice of `CanvasRenderingContext2D` the renderer actually calls. */
export interface PosterTextMetrics {
  width: number
}

export interface PosterContext {
  font: string
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  textBaseline: CanvasTextBaseline
  textAlign: CanvasTextAlign
  globalAlpha: number
  measureText(text: string): PosterTextMetrics
  fillText(text: string, x: number, y: number): void
  fillRect(x: number, y: number, width: number, height: number): void
  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void
  arc(x: number, y: number, radius: number, start: number, end: number): void
  clip(): void
  save(): void
  restore(): void
  translate(x: number, y: number): void
  scale(x: number, y: number): void
  fill(path?: Path2D): void
  stroke(path?: Path2D): void
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw?: number, dh?: number): void
}

/** The slice of `HTMLCanvasElement` the renderer needs. */
export interface PosterCanvas {
  width: number
  height: number
  getContext(contextId: '2d'): PosterContext | null
  toDataURL(type?: string): string
}

/** A decoded image: the browser `Image` element satisfies this shape. */
export interface PosterImage {
  source: CanvasImageSource
  width: number
  height: number
}

export interface PosterRenderDeps {
  /** Creates the output canvas; defaults to the page canvas. */
  createCanvas?: () => PosterCanvas
  /** Loads the avatar; resolves `null` when the image cannot be decoded. */
  loadImage?: (url: string) => Promise<PosterImage | null>
}

/**
 * Wraps text to a pixel width, one code point at a time.
 *
 * Blank source lines are preserved as an empty line and only one blank line is
 * kept in a row: the poster gives paragraphs air, not arbitrary gaps.
 */
export function wrapPosterText(
  text: string,
  measure: (value: string) => number,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  let previousBlank = false

  for (const paragraph of String(text).split('\n')) {
    if (paragraph.trim() === '') {
      if (lines.length > 0 && !previousBlank) lines.push('')
      previousBlank = true
      continue
    }
    previousBlank = false

    let current = ''
    for (const character of Array.from(paragraph)) {
      const next = current + character
      if (current !== '' && measure(next) > maxWidth) {
        lines.push(current)
        current = character
      } else {
        current = next
      }
    }
    lines.push(current)
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Total canvas height for a number of body lines. */
export function measurePosterHeight(lineCount: number): number {
  return (
    POSTER_PADDING + POSTER_HEADER_HEIGHT + lineCount * POSTER_BODY_LINE_HEIGHT + POSTER_WATERMARK_HEIGHT
  )
}

/** Maximum body lines that stay inside the upload-friendly height cap. */
export function maxPosterBodyLines(): number {
  return Math.max(
    1,
    Math.floor(
      (POSTER_MAX_HEIGHT - POSTER_PADDING - POSTER_HEADER_HEIGHT - POSTER_WATERMARK_HEIGHT) /
        POSTER_BODY_LINE_HEIGHT,
    ),
  )
}

/** Truncates wrapped lines to the height cap, marking the cut. */
export function fitPosterLines(lines: string[]): string[] {
  const limit = maxPosterBodyLines()
  if (lines.length <= limit) return lines
  const kept = lines.slice(0, limit)
  kept[kept.length - 1] = `${kept[kept.length - 1]}…`
  return kept
}

function defaultCreateCanvas(): PosterCanvas {
  const canvas = document.createElement('canvas')
  return canvas as unknown as PosterCanvas
}

function defaultLoadImage(url: string): Promise<PosterImage | null> {
  return new Promise((resolve) => {
    const image = new Image()
    // Needed on the off chance the avatar URL is served without a data URL.
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve(null)
    image.src = url
  })
}

function drawCircularAvatar(
  context: PosterContext,
  tokens: PosterThemeTokens,
  source: TweetPosterSource,
  centreX: number,
  centreY: number,
  avatar: PosterImage | null,
  radius = POSTER_AVATAR_RADIUS,
): void {
  context.save()
  context.beginPath()
  context.arc(centreX, centreY, radius, 0, Math.PI * 2)
  context.clip()

  if (avatar !== null) {
    context.drawImage(avatar.source, centreX - radius, centreY - radius, radius * 2, radius * 2)
  } else {
    context.fillStyle = tokens.avatarFallback
    context.fillRect(centreX - radius, centreY - radius, radius * 2, radius * 2)
    context.fillStyle = tokens.avatarFallbackText
    context.font = `700 52px ${SANS_STACK}`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const initial = Array.from(source.name.trim())[0] ?? '?'
    context.fillText(initial, centreX, centreY + 2)
    context.textAlign = 'left'
    context.textBaseline = 'top'
  }

  context.restore()
}

function drawVerifiedMark(context: PosterContext, tokens: PosterThemeTokens, x: number, y: number): void {
  const radius = 17
  context.save()
  context.beginPath()
  context.arc(x + radius, y + radius, radius, 0, Math.PI * 2)
  context.fillStyle = tokens.heading
  context.fill()
  context.beginPath()
  context.moveTo(x + 9, y + 17)
  context.lineTo(x + 15, y + 23)
  context.lineTo(x + 26, y + 11)
  context.strokeStyle = tokens.background
  context.lineWidth = 3.2
  context.stroke()
  context.restore()
}

function drawWatermark(
  context: PosterContext,
  tokens: PosterThemeTokens,
  height: number,
  width = POSTER_WIDTH,
): void {
  const text = 'OmniMux'
  const baselineY = height - 55
  context.save()
  context.globalAlpha = 0.8
  context.fillStyle = tokens.watermark
  context.font = `700 30px ${SANS_STACK}`
  context.textAlign = 'right'
  context.textBaseline = 'middle'
  const textWidth = context.measureText(text).width
  context.fillText(text, width - POSTER_PADDING, baselineY)

  // A small solid square reads as a mark without depending on a vector path or
  // a loaded image, so the watermark cannot fail on a browser without Path2D.
  const markSize = 14
  context.fillRect(
    width - POSTER_PADDING - textWidth - 14 - markSize,
    baselineY - markSize / 2,
    markSize,
    markSize,
  )

  context.globalAlpha = 1
  context.textAlign = 'left'
  context.textBaseline = 'top'
  context.restore()
}

/**
 * Draws one poster and returns its PNG data URL.
 *
 * The body is drawn unchanged; only whitespace normalisation and height
 * truncation are applied, because a poster that rewrites the source is no
 * longer a citation of it.
 */
export async function renderPoster(
  source: TweetPosterSource,
  theme: PosterTheme,
  deps: PosterRenderDeps = {},
): Promise<PosterRenderResult> {
  const tokens = POSTER_THEMES[theme]
  const createCanvas = deps.createCanvas ?? defaultCreateCanvas
  const loadImage = deps.loadImage ?? defaultLoadImage

  const canvas = createCanvas()
  canvas.width = POSTER_WIDTH

  const measuringContext = canvas.getContext('2d')
  if (measuringContext === null) throw new Error('无法创建海报画布')

  measuringContext.font = `400 ${POSTER_BODY_SIZE}px ${SANS_STACK}`
  const cache = new Map<string, number>()
  const measure = (value: string): number => {
    const hit = cache.get(value)
    if (hit !== undefined) return hit
    const width = measuringContext.measureText(value).width
    cache.set(value, width)
    return width
  }

  const rawBody = String(source.text || '').trim()
  const lines = fitPosterLines(
    wrapPosterText(rawBody === '' ? POSTER_EMPTY_BODY : rawBody, measure, POSTER_CONTENT_WIDTH),
  )
  const height = measurePosterHeight(lines.length)
  canvas.height = height

  // Resizing resets a real canvas context, so take a fresh one.
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('无法创建海报画布')

  context.fillStyle = tokens.background
  context.fillRect(0, 0, POSTER_WIDTH, height)
  context.textBaseline = 'top'
  context.textAlign = 'left'

  const avatarUrl = source.avatarDataUrl !== undefined && source.avatarDataUrl !== '' ? source.avatarDataUrl : source.avatar
  const avatar = avatarUrl === '' ? null : await loadImage(avatarUrl)

  const avatarCentreX = POSTER_PADDING + POSTER_AVATAR_RADIUS
  const avatarCentreY = POSTER_PADDING + POSTER_AVATAR_RADIUS
  drawCircularAvatar(context, tokens, source, avatarCentreX, avatarCentreY, avatar)

  const textX = avatarCentreX + POSTER_AVATAR_RADIUS + 28
  context.fillStyle = tokens.heading
  context.font = `700 40px ${SANS_STACK}`
  context.fillText(source.name, textX, avatarCentreY - 46)
  const nameWidth = context.measureText(source.name).width

  if (source.verified && source.name !== '') {
    drawVerifiedMark(context, tokens, textX + nameWidth + 10, avatarCentreY - 46 + 2)
  }

  context.fillStyle = tokens.secondary
  context.font = `400 32px ${SANS_STACK}`
  context.fillText(source.handle === '' ? '' : `@${source.handle}`, textX, avatarCentreY + 6)

  context.globalAlpha = 0.9
  context.fillStyle = tokens.divider
  context.fillRect(POSTER_PADDING, POSTER_PADDING + POSTER_HEADER_HEIGHT - 28, POSTER_CONTENT_WIDTH, 2)
  context.globalAlpha = 1

  context.fillStyle = tokens.foreground
  context.font = `400 ${POSTER_BODY_SIZE}px ${SANS_STACK}`
  let bodyY = POSTER_PADDING + POSTER_HEADER_HEIGHT
  for (const line of lines) {
    if (line !== '') context.fillText(line, POSTER_PADDING, bodyY)
    bodyY += POSTER_BODY_LINE_HEIGHT
  }

  drawWatermark(context, tokens, height)

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: POSTER_WIDTH,
    height,
  }
}

/* ------------------------------------------------------------------------- */
/* Long-form pagination                                                      */
/* ------------------------------------------------------------------------- */

/** X shows a single photo in full between 2:1 and 3:4; long pages use 3:4. */
export const POSTER_PAGE_WIDTH = 1920
export const POSTER_PAGE_HEIGHT = 2560
export const POSTER_PAGE_PADDING = 120
export const POSTER_PAGE_AVATAR_RADIUS = 64
export const POSTER_PAGE_HEADER_HEIGHT = POSTER_PAGE_AVATAR_RADIUS * 2 + 72
export const POSTER_PAGE_WATERMARK_HEIGHT = 120
export const POSTER_PAGE_MAX_PAGES = 4

export interface PosterPageLayout {
  readonly bodySize: number
  readonly lineHeight: number
  readonly paragraphGap: number
}

/**
 * Long-page typography, largest first. The first layout that fits in four
 * pages wins, so a shorter article keeps the most readable type.
 */
export const POSTER_PAGE_LAYOUTS: readonly PosterPageLayout[] = [
  { bodySize: 24, lineHeight: 40, paragraphGap: 12 },
  { bodySize: 22, lineHeight: 37, paragraphGap: 11 },
  { bodySize: 20, lineHeight: 34, paragraphGap: 10 },
  { bodySize: 18, lineHeight: 30, paragraphGap: 9 },
]

/** Thrown when even the smallest long-page layout needs more than four pages. */
export class PosterTooLongError extends Error {
  constructor() {
    super('poster-too-long')
    this.name = 'PosterTooLongError'
  }
}

/**
 * Splits text into non-empty paragraphs and wraps each one. Unlike the single
 * poster's `wrapPosterText`, blank source lines are structural separators and
 * do not become a full empty line; the long-page renderer uses a compact
 * paragraph gap instead, which keeps a 20-minute article inside four pages.
 */
export function wrapPosterParagraphs(
  text: string,
  measure: (value: string) => number,
  maxWidth: number,
): string[][] {
  const paragraphs: string[][] = []
  for (const paragraph of String(text).split('\n')) {
    if (paragraph.trim() === '') continue
    const lines = wrapPosterText(paragraph, measure, maxWidth)
    if (lines.length > 0) paragraphs.push(lines)
  }
  return paragraphs
}

/**
 * Packs wrapped paragraphs into pages. `capacityPx` is the body box height,
 * `lineHeight` the height of one line, and `paragraphGap` the space inserted
 * between paragraphs that share a page. A paragraph longer than one page is
 * split by line; no text is dropped.
 */
export function paginatePosterParagraphs(
  paragraphs: readonly string[][],
  capacityPx: number,
  lineHeight: number,
  paragraphGap: number,
): string[][][] {
  const pages: string[][][] = []
  let page: string[][] = []
  let used = 0

  const flush = (): void => {
    if (page.length === 0) return
    pages.push(page)
    page = []
    used = 0
  }

  for (const paragraph of paragraphs) {
    let remaining = paragraph.slice()
    while (remaining.length > 0) {
      const gap = page.length === 0 ? 0 : paragraphGap
      const available = capacityPx - used - gap
      const fit = Math.floor(available / lineHeight)
      if (fit <= 0) {
        flush()
        continue
      }
      if (remaining.length <= fit) {
        page.push(remaining)
        used += gap + remaining.length * lineHeight
        remaining = []
      } else {
        page.push(remaining.slice(0, fit))
        flush()
        remaining = remaining.slice(fit)
      }
    }
  }
  flush()
  return pages
}

/** Page body height available to text. */
export function posterPageBodyHeight(): number {
  return POSTER_PAGE_HEIGHT - POSTER_PAGE_PADDING - POSTER_PAGE_HEADER_HEIGHT - POSTER_PAGE_WATERMARK_HEIGHT
}

function drawLongHeader(
  context: PosterContext,
  tokens: PosterThemeTokens,
  source: TweetPosterSource,
  avatar: PosterImage | null,
): void {
  const radius = POSTER_PAGE_AVATAR_RADIUS
  const centreX = POSTER_PAGE_PADDING + radius
  const centreY = POSTER_PAGE_PADDING + radius
  drawCircularAvatar(context, tokens, source, centreX, centreY, avatar, radius)

  const textX = centreX + radius + 32
  context.fillStyle = tokens.heading
  context.font = `700 48px ${SANS_STACK}`
  context.fillText(source.name, textX, centreY - 52)
  const nameWidth = context.measureText(source.name).width

  if (source.verified && source.name !== '') {
    drawVerifiedMark(context, tokens, textX + nameWidth + 12, centreY - 52 + 2)
  }

  context.fillStyle = tokens.secondary
  context.font = `400 36px ${SANS_STACK}`
  context.fillText(source.handle === '' ? '' : `@${source.handle}`, textX, centreY + 14)

  context.globalAlpha = 0.9
  context.fillStyle = tokens.divider
  context.fillRect(
    POSTER_PAGE_PADDING,
    POSTER_PAGE_PADDING + POSTER_PAGE_HEADER_HEIGHT - 28,
    POSTER_PAGE_WIDTH - POSTER_PAGE_PADDING * 2,
    2,
  )
  context.globalAlpha = 1
}

function drawPageFooter(
  context: PosterContext,
  tokens: PosterThemeTokens,
  pageNumber: number,
  pageCount: number,
): void {
  const baselineY = POSTER_PAGE_HEIGHT - 55
  context.save()
  context.fillStyle = tokens.secondary
  context.font = `400 30px ${SANS_STACK}`
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  context.fillText(`${pageNumber} / ${pageCount}`, POSTER_PAGE_PADDING, baselineY)
  context.restore()
  drawWatermark(context, tokens, POSTER_PAGE_HEIGHT, POSTER_PAGE_WIDTH)
}

async function renderPosterPage(
  source: TweetPosterSource,
  theme: PosterTheme,
  paragraphs: readonly string[][],
  pageNumber: number,
  pageCount: number,
  layout: PosterPageLayout,
  deps: PosterRenderDeps,
  avatar: PosterImage | null,
): Promise<PosterRenderResult> {
  const tokens = POSTER_THEMES[theme]
  const canvas = (deps.createCanvas ?? defaultCreateCanvas)()
  canvas.width = POSTER_PAGE_WIDTH
  canvas.height = POSTER_PAGE_HEIGHT
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('无法创建海报画布')

  context.fillStyle = tokens.background
  context.fillRect(0, 0, POSTER_PAGE_WIDTH, POSTER_PAGE_HEIGHT)
  context.textBaseline = 'top'
  context.textAlign = 'left'

  drawLongHeader(context, tokens, source, avatar)

  context.fillStyle = tokens.foreground
  context.font = `400 ${layout.bodySize}px ${SANS_STACK}`
  let bodyY = POSTER_PAGE_PADDING + POSTER_PAGE_HEADER_HEIGHT
  for (let index = 0; index < paragraphs.length; index += 1) {
    if (index > 0) bodyY += layout.paragraphGap
    for (const line of paragraphs[index]) {
      if (line !== '') context.fillText(line, POSTER_PAGE_PADDING, bodyY)
      bodyY += layout.lineHeight
    }
  }

  drawPageFooter(context, tokens, pageNumber, pageCount)

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: POSTER_PAGE_WIDTH,
    height: POSTER_PAGE_HEIGHT,
    page: pageNumber,
    pageCount,
  }
}

/**
 * Renders one poster for short content, or an ordered set of 3:4 pages for a
 * long post. Pagination is the default for any body that does not fit the
 * single-page height cap; no text is silently truncated.
 */
export async function renderPosterPages(
  source: TweetPosterSource,
  theme: PosterTheme,
  deps: PosterRenderDeps = {},
): Promise<PosterRenderResult[]> {
  const rawBody = String(source.text || '').trim() || POSTER_EMPTY_BODY
  const createCanvas = deps.createCanvas ?? defaultCreateCanvas
  const loadImage = deps.loadImage ?? defaultLoadImage

  const probe = createCanvas()
  probe.width = POSTER_WIDTH
  const probeContext = probe.getContext('2d')
  if (probeContext === null) throw new Error('无法创建海报画布')
  probeContext.font = `400 ${POSTER_BODY_SIZE}px ${SANS_STACK}`
  const singleCache = new Map<string, number>()
  const singleMeasure = (value: string): number => {
    const hit = singleCache.get(value)
    if (hit !== undefined) return hit
    const width = probeContext.measureText(value).width
    singleCache.set(value, width)
    return width
  }
  const singleLines = wrapPosterText(rawBody, singleMeasure, POSTER_CONTENT_WIDTH)
  if (singleLines.length <= maxPosterBodyLines()) {
    const single = await renderPoster(source, theme, deps)
    return [{ ...single, page: 1, pageCount: 1 }]
  }

  const avatarUrl = source.avatarDataUrl !== undefined && source.avatarDataUrl !== '' ? source.avatarDataUrl : source.avatar
  const avatar = avatarUrl === '' ? null : await loadImage(avatarUrl)

  for (const layout of POSTER_PAGE_LAYOUTS) {
    const layoutProbe = createCanvas()
    layoutProbe.width = POSTER_PAGE_WIDTH
    const layoutContext = layoutProbe.getContext('2d')
    if (layoutContext === null) continue
    layoutContext.font = `400 ${layout.bodySize}px ${SANS_STACK}`
    const cache = new Map<string, number>()
    const measure = (value: string): number => {
      const hit = cache.get(value)
      if (hit !== undefined) return hit
      const width = layoutContext.measureText(value).width
      cache.set(value, width)
      return width
    }
    const paragraphs = wrapPosterParagraphs(
      rawBody,
      measure,
      POSTER_PAGE_WIDTH - POSTER_PAGE_PADDING * 2,
    )
    const pages = paginatePosterParagraphs(
      paragraphs,
      posterPageBodyHeight(),
      layout.lineHeight,
      layout.paragraphGap,
    )
    if (pages.length === 0 || pages.length > POSTER_PAGE_MAX_PAGES) continue

    const results: PosterRenderResult[] = []
    for (let index = 0; index < pages.length; index += 1) {
      results.push(
        await renderPosterPage(
          source,
          theme,
          pages[index],
          index + 1,
          pages.length,
          layout,
          deps,
          avatar,
        ),
      )
    }
    return results
  }

  throw new PosterTooLongError()
}
