/**
 * Shrink the empty-session hero headline to one line in a narrow session
 * column (workspace canvas open). Official chrome is 26/32 wt500 with a
 * 34px fish + 10px gap; a long OmniMux title wraps a trailing CJK glyph
 * unless font-size drops and wrapping is forbidden.
 */

import {
  DEFAULT_CONFIG,
  DEFAULT_HERO_HEADLINE_LEADING_PX,
  DEFAULT_HERO_HEADLINE_MAX_PX,
  DEFAULT_HERO_HEADLINE_MIN_PX,
  HERO_HEADLINE_FISH_PX,
  HERO_HEADLINE_GAP_PX,
  OFFICIAL_HERO_HEADLINES,
} from './defaults.js'

/** Style tag id injected by {@link startHeadlineFit}. */
export const HERO_HEADLINE_FIT_STYLE_ID = 'omnimux-hero-headline-fit'

/** Marks the live `.headlineText` node so CSS vars apply after React rewrite. */
export const HERO_HEADLINE_ATTR = 'data-omnimux-hero-headline'

/** Font-size CSS variable written on `documentElement`. */
export const HERO_HEADLINE_SIZE_VAR = '--omnimux-hero-headline-size'

/** Line-height CSS variable written on `documentElement`. */
export const HERO_HEADLINE_LEADING_VAR = '--omnimux-hero-headline-leading'

const HIDE_ATTR = 'data-omnimux-hide'
const ASCII_WIDTH_RATIO = 0.55

/**
 * @typedef {object} HeadlineFitOptions
 * @property {number} [maxPx]
 * @property {number} [minPx]
 * @property {string} [fontFamily]
 * @property {string | number} [fontWeight]
 * @property {(text: string, px: number, fontFamily: string, fontWeight: string | number) => number} [measure]
 */

/**
 * Line-height that keeps the official 26/32 ratio at `sizePx`.
 * @param {number} sizePx Chosen font-size.
 * @param {number} [maxPx]
 * @param {number} [leadingPx]
 * @returns {number} CSS px line-height.
 */
export function headlineLeadingPx(
  sizePx,
  maxPx = DEFAULT_HERO_HEADLINE_MAX_PX,
  leadingPx = DEFAULT_HERO_HEADLINE_LEADING_PX,
) {
  if (sizePx >= maxPx) return leadingPx
  return Math.max(1, Math.round(sizePx * leadingPx / maxPx))
}

/**
 * CJK ≈ 1em, ASCII ≈ 0.55em. Used when canvas `measureText` is missing or 0.
 * @param {string} text Headline copy.
 * @param {number} px Font-size in CSS px.
 * @returns {number} estimated width.
 */
export function heuristicMeasure(text, px) {
  let width = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    width += code > 0xff ? px : px * ASCII_WIDTH_RATIO
  }
  return width
}

/**
 * Largest integer font-size in `[minPx, maxPx]` whose measured width fits.
 * Wide columns keep `maxPx`; a column that cannot hold `minPx` still returns
 * `minPx` (nowrap then overflows rather than wrapping a trailing glyph).
 * @param {number} availableWidth Text-column width in CSS px.
 * @param {string} text Headline copy.
 * @param {HeadlineFitOptions} [options]
 * @returns {number} font-size in CSS px.
 */
export function computeHeadlineSize(availableWidth, text, options = {}) {
  const maxPx = options.maxPx ?? DEFAULT_HERO_HEADLINE_MAX_PX
  const minPx = options.minPx ?? DEFAULT_HERO_HEADLINE_MIN_PX
  const fontFamily = options.fontFamily ?? 'sans-serif'
  const fontWeight = options.fontWeight ?? 500
  const measure = options.measure ?? ((value, px) => heuristicMeasure(value, px))

  if (typeof text !== 'string' || text.length === 0) return maxPx
  const width = Number(availableWidth)
  if (!Number.isFinite(width) || width <= 0) return maxPx

  const fits = (px) => measure(text, px, fontFamily, fontWeight) <= width
  if (fits(maxPx)) return maxPx
  if (!fits(minPx)) return minPx

  let lo = minPx
  let hi = maxPx
  let best = minPx
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (fits(mid)) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

/**
 * Inject the nowrap / CSS-variable rules and observe the `.headline` grid.
 * Idempotent per document: a second call retargets the existing fitter.
 * @param {Document} document Browser document.
 * @param {import('./defaults.js').BrandConfig} config Resolved overlay config.
 * @param {Array<() => void>} restores Disposer stack owned by the overlay.
 * @returns {{ retarget: () => void, dispose: () => void }}
 */
export function startHeadlineFit(document, config, restores) {
  if (config?.heroHeadlineFit === false) {
    return { retarget() {}, dispose() {} }
  }

  const existing = fitters.get(document)
  if (existing) {
    existing.retarget()
    return existing
  }

  const view = document.defaultView
  const maxPx = config.heroHeadlineMaxPx ?? DEFAULT_CONFIG.heroHeadlineMaxPx
  const minPx = config.heroHeadlineMinPx ?? DEFAULT_CONFIG.heroHeadlineMinPx
  const measure = createMeasure(document)

  let disposed = false
  /** @type {ResizeObserver | null} */
  let observer = null
  /** @type {Element | null} */
  let observed = null
  /** @type {Element | null} */
  let marked = null

  ensureFitStyle(document)

  const fitNow = () => {
    if (disposed) return
    const grid = observed ?? marked?.parentElement ?? null
    const text = (marked?.textContent ?? config.heroHeadline ?? '').trim()
    const available = view && grid instanceof view.Element
      ? textAvailableWidth(grid, view)
      : 0
    const font = readFont(marked, view)
    const size = computeHeadlineSize(available, text, {
      maxPx,
      minPx,
      fontFamily: font.family,
      fontWeight: font.weight,
      measure,
    })
    writeVars(document, size, maxPx)
  }

  const retarget = () => {
    if (disposed) return
    const next = findHeadlineText(document, config)
    if (marked && marked !== next) marked.removeAttribute(HERO_HEADLINE_ATTR)
    marked = next
    if (marked && !marked.hasAttribute(HERO_HEADLINE_ATTR)) {
      marked.setAttribute(HERO_HEADLINE_ATTR, '')
    }
    const grid = marked?.parentElement ?? findHeadlineGrid(document)
    if (observer && observed && observed !== grid) observer.unobserve(observed)
    observed = grid
    if (observer && observed) observer.observe(observed)
    fitNow()
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    observer?.disconnect()
    observer = null
    observed = null
    if (marked?.hasAttribute(HERO_HEADLINE_ATTR)) marked.removeAttribute(HERO_HEADLINE_ATTR)
    marked = null
    document.documentElement.style.removeProperty(HERO_HEADLINE_SIZE_VAR)
    document.documentElement.style.removeProperty(HERO_HEADLINE_LEADING_VAR)
    document.getElementById(HERO_HEADLINE_FIT_STYLE_ID)?.remove()
    fitters.delete(document)
  }

  if (view && typeof view.ResizeObserver === 'function') {
    observer = new view.ResizeObserver(fitNow)
  }

  retarget()
  const fitter = { retarget, dispose }
  fitters.set(document, fitter)
  restores.push(dispose)
  return fitter
}

/** @type {WeakMap<Document, { retarget: () => void, dispose: () => void }>} */
const fitters = new WeakMap()

/**
 * @param {Document} document
 */
function ensureFitStyle(document) {
  if (document.getElementById(HERO_HEADLINE_FIT_STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = HERO_HEADLINE_FIT_STYLE_ID
  style.textContent = [
    `[${HERO_HEADLINE_ATTR}]{white-space:nowrap !important;font-size:var(${HERO_HEADLINE_SIZE_VAR}, ${DEFAULT_HERO_HEADLINE_MAX_PX}px) !important;line-height:var(${HERO_HEADLINE_LEADING_VAR}, ${DEFAULT_HERO_HEADLINE_LEADING_PX}px) !important}`,
    `[${HIDE_ATTR}]{display:none !important}`,
  ].join('')
  document.head.append(style)
}

/**
 * @param {Document} document
 * @param {number} sizePx
 * @param {number} maxPx
 */
function writeVars(document, sizePx, maxPx) {
  const leading = headlineLeadingPx(sizePx, maxPx)
  const style = document.documentElement.style
  const size = `${sizePx}px`
  const leadingValue = `${leading}px`
  // The fitter is driven by a ResizeObserver on the headline's own container, so
  // rewriting an unchanged size keeps invalidating the box that triggered the
  // callback. Skipping identical values lets the layout settle.
  if (style.getPropertyValue(HERO_HEADLINE_SIZE_VAR) === size
    && style.getPropertyValue(HERO_HEADLINE_LEADING_VAR) === leadingValue) return
  style.setProperty(HERO_HEADLINE_SIZE_VAR, size)
  style.setProperty(HERO_HEADLINE_LEADING_VAR, leadingValue)
}

/**
 * @param {Document} document
 * @param {import('./defaults.js').BrandConfig} config
 * @returns {Element | null}
 */
function findHeadlineText(document, config) {
  const marked = document.querySelector(`[${HERO_HEADLINE_ATTR}]`)
  if (marked) return marked
  const byClass = document.querySelector('[class*="headlineText"]')
  if (byClass) return byClass
  const wanted = [config.heroHeadline, ...OFFICIAL_HERO_HEADLINES]
    .filter(value => typeof value === 'string' && value.trim() !== '')
  for (const el of document.querySelectorAll('span,div')) {
    if (el.childElementCount !== 0) continue
    const current = el.textContent?.trim() ?? ''
    if (wanted.includes(current)) return el
  }
  return null
}

/**
 * @param {Document} document
 * @returns {Element | null}
 */
function findHeadlineGrid(document) {
  const text = document.querySelector(`[${HERO_HEADLINE_ATTR}], [class*="headlineText"]`)
  if (text?.parentElement) return text.parentElement
  for (const el of document.querySelectorAll('[class*="headline"]')) {
    const cls = typeof el.className === 'string' ? el.className : ''
    if (cls.includes('headlineText')) continue
    return el
  }
  return null
}

/**
 * Text-column width: grid minus fish, gap, and a still-visible badge.
 * @param {Element} grid
 * @param {Window} view
 * @returns {number}
 */
function textAvailableWidth(grid, view) {
  const width = Number(grid.clientWidth)
  if (!Number.isFinite(width) || width <= 0) return 0
  let used = HERO_HEADLINE_FISH_PX + HERO_HEADLINE_GAP_PX
  for (const child of grid.children) {
    if (isHeadlineTextNode(child)) continue
    if (child.hasAttribute(HIDE_ATTR)) continue
    const style = typeof view.getComputedStyle === 'function' ? view.getComputedStyle(child) : null
    if (style && (style.display === 'none' || style.visibility === 'hidden')) continue
    const className = typeof child.className === 'string' ? child.className : ''
    if (className.includes('fishHitbox') || className.includes('fish')) {
      const fishWidth = rectWidth(child)
      if (fishWidth > 0) used += fishWidth - HERO_HEADLINE_FISH_PX
      continue
    }
    const extra = rectWidth(child)
    if (extra > 0) used += extra + HERO_HEADLINE_GAP_PX
  }
  return Math.max(0, width - used)
}

/**
 * @param {Element} node
 */
function isHeadlineTextNode(node) {
  if (node.hasAttribute(HERO_HEADLINE_ATTR)) return true
  const className = typeof node.className === 'string' ? node.className : ''
  return className.includes('headlineText')
}

/**
 * @param {Element} node
 */
function rectWidth(node) {
  if (typeof node.getBoundingClientRect !== 'function') return 0
  const width = node.getBoundingClientRect().width
  return Number.isFinite(width) && width > 0 ? width : 0
}

/**
 * @param {Element | null} node
 * @param {Window | null} view
 */
function readFont(node, view) {
  const style = node && view && typeof view.getComputedStyle === 'function'
    ? view.getComputedStyle(node)
    : null
  return {
    family: style?.fontFamily || 'sans-serif',
    weight: style?.fontWeight || 500,
  }
}

/**
 * Canvas `measureText` when it returns a real width; otherwise the heuristic.
 * @param {Document} document
 * @returns {(text: string, px: number, fontFamily: string, fontWeight: string | number) => number}
 */
function createMeasure(document) {
  const ctx = real2dContext(document)
  return (text, px, fontFamily, fontWeight) => {
    if (ctx && typeof ctx.measureText === 'function') {
      try {
        ctx.font = `${fontWeight} ${px}px ${fontFamily}`
        const width = ctx.measureText(text).width
        if (Number.isFinite(width) && width > 0) return width
      } catch {
        // fall through to the heuristic
      }
    }
    return heuristicMeasure(text, px)
  }
}

/**
 * Skip jsdom's stub `getContext` (it logs "Not implemented" and returns null).
 * @param {Document} document
 * @returns {CanvasRenderingContext2D | null}
 */
function real2dContext(document) {
  const view = document.defaultView
  if (!view || /jsdom/i.test(view.navigator?.userAgent ?? '')) return null
  try {
    const canvas = document.createElement('canvas')
    if (typeof canvas.getContext !== 'function') return null
    const ctx = canvas.getContext('2d')
    return ctx && typeof ctx.measureText === 'function' ? ctx : null
  } catch {
    return null
  }
}
