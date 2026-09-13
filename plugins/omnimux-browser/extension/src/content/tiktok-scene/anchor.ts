/**
 * Where the OmniMux trigger sits on a TikTok page.
 *
 * The intended home is directly above the signed-in avatar at the foot of the
 * left rail, which is where the user's own eye already returns. Two fallbacks
 * sit under it, because a missing trigger is a broken feature while a slightly
 * misplaced one is still usable: without an avatar (signed out, or a reduced
 * layout) the trigger parks above the rail's foot, and without a rail at all it
 * parks in the lower-left corner.
 *
 * The result is always a fixed-position viewport coordinate, never a node
 * inserted into TikTok's own tree: the page cannot reflow around it, cannot
 * restyle it, and a TikTok redesign moves the trigger instead of deleting it.
 *
 * @module
 */

/** Distance kept between the trigger and the avatar above which it sits. */
export const ANCHOR_GAP = 8

/** Where the trigger sits when only the rail could be identified. */
const RAIL_PARKING = { left: 16, bottom: 96 }

/** Where the trigger sits when nothing on the page could be identified. */
const CORNER_PARKING = { left: 12, bottom: 88 }

/** Smallest image that may be treated as an avatar rather than an icon. */
const MIN_AVATAR_PX = 24

/** How far from square an image may be and still read as an avatar. */
const SQUARE_TOLERANCE = 0.2

/**
 * Documented avatar hooks, most specific first.
 *
 * These are the page's own `data-e2e` test hooks, so they survive styling
 * changes; the structural scan below covers the case where TikTok renames them.
 */
export const AVATAR_SELECTORS: readonly string[] = [
  '[data-e2e="nav-user-avatar"]',
  '[data-e2e="nav-profile"] img',
  'a[href^="/@"] [data-e2e="nav-user-avatar"]',
]

/** Candidate left-rail containers, most specific first. */
export const RAIL_SELECTORS: readonly string[] = [
  '[data-e2e="nav-bar"]',
  'nav[role="navigation"]',
  'aside',
  'nav',
]

/** A resolved trigger position in viewport coordinates. */
export interface AnchorPlacement {
  /** Distance from the viewport's left edge to the trigger's left edge. */
  left: number
  /** Distance from the viewport's bottom edge to the trigger's bottom edge. */
  bottom: number
  /** Which rule answered; diagnostics only, never rendered. */
  source: 'avatar' | 'rail' | 'fallback'
}

/** The viewport box the placement is expressed against. */
export interface ViewportSize {
  width: number
  height: number
}

/** An element is usable only if it is laid out and has area. */
function isMeasurable(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

/** The first matching element that is actually laid out. */
function firstMeasurable(doc: Document, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    for (const el of Array.from(doc.querySelectorAll(selector))) {
      if (isMeasurable(el)) return el
    }
  }
  return null
}

/**
 * The left rail, when the page has one.
 * @param doc
 */
export function findRailElement(doc: Document): Element | null {
  return firstMeasurable(doc, RAIL_SELECTORS)
}

/**
 * The signed-in avatar at the foot of the rail.
 *
 * The structural pass looks inside the rail only, and takes the last
 * approximately-square image in it: an avatar is the bottom-most square image in
 * that column, while everything above it is a navigation icon (a glyph, not a
 * square photo) or content. Scanning the whole document instead would happily
 * return a video cover from the feed.
 * @param doc
 */
export function findAvatarElement(doc: Document): Element | null {
  const hooked = firstMeasurable(doc, AVATAR_SELECTORS)
  if (hooked !== null) return hooked

  const rail = findRailElement(doc)
  if (rail === null) return null
  let candidate: Element | null = null
  for (const img of Array.from(rail.querySelectorAll('img'))) {
    const rect = img.getBoundingClientRect()
    if (rect.width < MIN_AVATAR_PX || rect.height < MIN_AVATAR_PX) continue
    const longer = Math.max(rect.width, rect.height)
    if (Math.abs(rect.width - rect.height) > longer * SQUARE_TOLERANCE) continue
    candidate = img
  }
  return candidate
}

/**
 * Resolve where the trigger belongs for the current page.
 * @param doc
 * @param viewport current viewport size in CSS pixels
 * @returns a fixed-position anchor; every branch answers, so the trigger always has a home
 */
export function resolveAnchorPlacement(doc: Document, viewport: ViewportSize): AnchorPlacement {
  const avatar = findAvatarElement(doc)
  if (avatar !== null) {
    const rect = avatar.getBoundingClientRect()
    return {
      left: Math.max(0, rect.left),
      // The avatar's top edge measured from the bottom of the viewport, plus the
      // gap, is where the trigger's bottom edge goes.
      bottom: Math.max(0, viewport.height - rect.top + ANCHOR_GAP),
      source: 'avatar',
    }
  }
  if (findRailElement(doc) !== null) return { ...RAIL_PARKING, source: 'rail' }
  return { ...CORNER_PARKING, source: 'fallback' }
}
