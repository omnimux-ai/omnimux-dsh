/**
 * Coexistence placement for the TikTok scene trigger.
 *
 * Rival extensions (CreatOK and other injected shortcut rows) are read, never
 * written: this module answers "where can we stand so that nothing overlaps?"
 * and the caller moves only our own layer. That replaces the earlier
 * displacement strategy, which lifted the rival by rewriting its `transform`.
 * Writing another extension's DOM is both fragile (its next render wins) and a
 * fight: the loser is decided by mutation order, not by layout. Standing in the
 * corridor *above* the rival keeps both buttons visible and keeps our hands off
 * its element.
 *
 * The rule is deliberately small:
 *
 * [highest rival]
 *   ↑ 8px
 * [rival closest to the mark]
 *   ↑ 8px
 * [OmniMux trigger]  <- starts above the avatar and climbs until clear
 *   ↑ 8px
 * [author avatar]
 *
 * A page with no rival answers with the base placement unchanged, so the
 * ordinary layout is exactly what the anchor layer computed.
 *
 * @module
 */

/** An element box, in viewport coordinates. */
export interface Box {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly width: number
  readonly height: number
}

/** The mark being placed, in viewport coordinates. */
export interface BasePlacement {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** The viewport the boxes were measured against. */
export interface ViewportSize {
  readonly width: number
  readonly height: number
}

/** Where the mark ended up, and why. */
export interface CoexistPlacement {
  readonly left: number
  readonly top: number
  /** Which answer produced the placement; diagnostics and tests only. */
  readonly source: 'base' | 'above-rival' | 'beside-rival' | 'below-rival' | 'clamped'
}

/** Gap kept between the mark and anything it stacks over. */
export const COEXIST_GAP = 8

/** Closest the mark may come to the viewport's top or left edge. */
export const VIEWPORT_MARGIN = 10

/** How many rivals one placement may climb over before it gives up. */
const MAX_STACK_STEPS = 6

/**
 * The marks a rival extension injects.
 *
 * Only injected shortcut rows are listed. A generic `button` / `[class*="icon"]`
 * scan would treat TikTok's own like/comment/share controls as rivals and climb
 * over the page's primary controls; reported geometry then depends on how many
 * native buttons happened to be painted.
 */
const RIVAL_SELECTORS: readonly string[] = [
  '#creatok-video-trigger',
  '[id*="creatok" i]',
  '[class*="creatok" i]',
  'plasmo-csui',
  '[data-placement*="action-bar"]',
]

/** Tags that can never be a rival mark, whatever selector matched them. */
const STRUCTURAL_TAGS = new Set([
  'html',
  'body',
  'header',
  'nav',
  'main',
  'video',
  'canvas',
  'svg',
  'path',
  'iframe',
])

/** Smallest / largest box an injected shortcut may claim. */
const RIVAL_MIN_PX = 14
const RIVAL_MAX_PX = 180

/** Box of one element in viewport coordinates. */
function boxOf(el: HTMLElement): Box {
  const rect = el.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
}

/** Whether two horizontal spans share any part of the corridor. */
function sameColumn(aLeft: number, aWidth: number, bLeft: number, bRight: number): boolean {
  return aLeft < bRight + COEXIST_GAP && aLeft + aWidth > bLeft - COEXIST_GAP
}

/**
 * Whether an element is an injected shortcut worth avoiding.
 *
 * Geometry is the whole test beyond identity: a 0×0 / off-screen node is not
 * painted, a viewport-sized overlay is a popover host rather than a mark, and
 * anything containing the author avatar is the rail itself.
 * @param el the candidate
 * @param hostId our own host id, excluded so we never stack over ourselves
 * @param avatarEl the author avatar, excluded so the mark cannot climb the rail
 */
export function isRivalMark(el: HTMLElement, hostId: string, avatarEl: Element | null): boolean {
  if (el.id === hostId || el.closest(`#${hostId}`) !== null) return false
  if (avatarEl !== null && (el === avatarEl || el.contains(avatarEl) || avatarEl.contains(el))) return false
  if (STRUCTURAL_TAGS.has(el.tagName.toLowerCase())) return false
  const box = boxOf(el)
  if (box.width < RIVAL_MIN_PX || box.height < RIVAL_MIN_PX) return false
  if (box.width > RIVAL_MAX_PX || box.height > RIVAL_MAX_PX) return false
  return true
}

/** Every injected shortcut currently painted on the page. */
export function collectRivalMarks(doc: Document, hostId: string, avatarEl: Element | null): HTMLElement[] {
  const seen = new Set<HTMLElement>()
  const marks: HTMLElement[] = []
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(RIVAL_SELECTORS.join(', ')))) {
    if (seen.has(el)) continue
    seen.add(el)
    if (isRivalMark(el, hostId, avatarEl)) marks.push(el)
  }
  return marks
}

/** Clamp a `top` into the viewport while keeping the mark fully visible. */
function clampTop(top: number, height: number, viewport: ViewportSize): number {
  const max = Math.max(VIEWPORT_MARGIN, viewport.height - height - VIEWPORT_MARGIN)
  return Math.min(Math.max(top, VIEWPORT_MARGIN), max)
}

/**
 * Resolve where our trigger can stand without covering an injected rival.
 *
 * The base placement comes from the anchor layer (directly above the avatar).
 * When a rival occupies that corridor the mark climbs above the rival, one gap
 * per step, over a bounded number of rivals. A corridor with no room left above
 * falls back to the mark's left, and only then to a clamped base position: the
 * mark must stay on screen, but it never moves a rival to get there.
 * @param doc the page
 * @param hostId our own host id
 * @param avatarEl the author avatar the base placement was derived from
 * @param base the anchor layer's placement, in viewport coordinates
 * @param viewport the viewport the boxes were measured against
 */
export function resolveCoexistPlacement(
  doc: Document,
  hostId: string,
  avatarEl: Element | null,
  base: BasePlacement,
  viewport: ViewportSize,
): CoexistPlacement {
  // No rival: the anchor layer's answer is the answer. The coexist layer owns
  // only "where can we stand without covering someone", never a general clamp —
  // the shipping anchor contract deliberately lets a mark sit above a landmark
  // that is itself above the viewport, and existing callers depend on it.
  const rivals = collectRivalMarks(doc, hostId, avatarEl)
  if (rivals.length === 0) {
    return { left: base.left, top: base.top, source: 'base' }
  }

  // Where a candidate lands is not known until it is clamped, so clearance is
  // measured on the final box — a clamp that moves the mark into a rival is a
  // candidate that fails, not one that is returned anyway.
  const overlapArea = (left: number, top: number): number => {
    let total = 0
    for (const rival of rivals) {
      const box = boxOf(rival)
      const width = Math.min(left + base.width, box.right) - Math.max(left, box.left)
      const height = Math.min(top + base.height, box.bottom) - Math.max(top, box.top)
      if (width > 0 && height > 0) total += width * height
    }
    return total
  }

  let top = base.top
  let climbed = false
  for (let step = 0; step < MAX_STACK_STEPS; step += 1) {
    const hit = rivals.filter((rival) => {
      const box = boxOf(rival)
      if (!sameColumn(base.left, base.width, box.left, box.right)) return false
      return box.bottom > top && box.top < top + base.height
    })
    if (hit.length === 0) break
    const ceiling = Math.min(...hit.map((rival) => boxOf(rival).top))
    const next = ceiling - COEXIST_GAP - base.height
    if (Number.isFinite(next) === false || next === top) break
    top = next
    climbed = true
  }

  // Candidate positions, in the order the layout reads: above the rival stack,
  // then to its left, then below it, then to its right, and only then the base
  // slot itself. The first one that lands clear wins; the least-covering one is
  // the answer only when a page genuinely has no clear slot.
  const lowestBottom = Math.max(...rivals.map((rival) => boxOf(rival).bottom))
  const highestRight = Math.max(...rivals.map((rival) => boxOf(rival).right))
  const besideLeft = base.left - base.width - COEXIST_GAP
  const besideRight = highestRight + COEXIST_GAP
  const clampedBaseTop = clampTop(base.top, base.height, viewport)
  const candidates: Array<{ left: number; top: number; source: CoexistPlacement['source'] }> = [
    { left: base.left, top: clampTop(top, base.height, viewport), source: climbed ? 'above-rival' : 'base' },
    { left: besideLeft, top: clampedBaseTop, source: 'beside-rival' },
    { left: base.left, top: clampTop(lowestBottom + COEXIST_GAP, base.height, viewport), source: 'below-rival' },
    { left: besideRight, top: clampedBaseTop, source: 'beside-rival' },
    { left: base.left, top: clampedBaseTop, source: 'clamped' },
  ]

  let best = candidates[candidates.length - 1]
  let bestOverlap = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const inViewport =
      candidate.top >= VIEWPORT_MARGIN &&
      candidate.top + base.height <= viewport.height - VIEWPORT_MARGIN &&
      candidate.left >= VIEWPORT_MARGIN &&
      candidate.left + base.width <= viewport.width - VIEWPORT_MARGIN
    if (!inViewport) continue
    const overlap = overlapArea(candidate.left, candidate.top)
    if (overlap === 0) return { left: candidate.left, top: candidate.top, source: candidate.source }
    if (overlap < bestOverlap) {
      bestOverlap = overlap
      best = candidate
    }
  }

  // Everything visible is covered: take the least-covering slot and report it
  // honestly as a clamped answer rather than pretending the above-rule held.
  return { left: best.left, top: best.top, source: 'clamped' }
}
