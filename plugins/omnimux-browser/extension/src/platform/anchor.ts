/**
 * Where a platform's marks belong, from measured geometry alone.
 *
 * The bug this module exists for: the old anchor treated "a TikTok page" as one
 * layout — desktop, with a left rail — and encoded that as a fixed selector list
 * plus a fixed fallback coordinate. The same address is a rail page at 1416px and
 * an immersive page at 430px, so the assumption failed wholesale
 * (`evidence/live-probe.md`).
 *
 * There is exactly one target now: **directly above the avatar the page renders
 * in its rail** — the account's own at the foot of the left navigation rail on
 * the desktop layout, the post author's in the right-hand action bar in the
 * portrait one. Which person that is is the page's decision, not this module's;
 * what this module promises is the rail's avatar rather than any square image
 * that happens to be nearby. An earlier attempt anchored the mark to the video's
 * bottom-left corner instead; that branch is gone, along with the video
 * selection it needed, because the user's answer is the avatar's column and not
 * the frame.
 *
 * Finding that avatar is the hard half, and the probe says why: every named hook
 * misses on at least one real layout (`nav-user-avatar` misses on both;
 * `nav-profile img` hits only on the desktop page; `aside` is a zero-width box
 * outside the viewport on the desktop page and absent on the portrait one; `nav`
 * is a 168x28 top tab bar in the portrait one). So the hooks are tried first and
 * a structural scan covers the rest — and that scan is confined to containers
 * that pass {@link isSideRailRect}, because a scan over the whole document
 * happily returns a video cover or a commenter's avatar. Inside the container
 * the candidate is *attributed* rather than taken from either end of the DOM
 * ({@link attributedAvatarIn}): a rail holds several square images, and the one
 * the mark belongs on is the one the page marks as a person.
 *
 * Imports run one way at runtime — this module reads the platform table, the
 * table does not read this one — so the registry stays importable without DOM.
 *
 * @module
 */

import { anchorChainFor } from './registry.ts'
import type { AnchorChain, AnchorMark, AnchorSource, PlatformEntry } from './registry.ts'
import type { AnchorRect } from '../content/media-hover/types.ts'

/**
 * The layouts a platform entry may distinguish.
 *
 * Two, not three. `side-rail` means a narrow vertical column hugging the
 * viewport's left or right edge — the desktop navigation rail and the portrait
 * action bar are the same shape, and both put the avatar in that column, so they
 * are one layout for placement purposes. Everything else is `unknown`, which is
 * a legal answer and has an answer of its own.
 */
export type AnchorLayout = 'side-rail' | 'unknown'

/**
 * Furthest a rail's near edge may sit from the viewport's matching edge, as a
 * share of the viewport width.
 *
 * Inferred, not measured: probe A and B could not isolate the rail container
 * itself (its `data-e2e` hook misses on both), so this is a bound rather than a
 * reading. It is a named constant so replacing it is a one-line change.
 */
export const EDGE_FRACTION = 0.08

/**
 * Largest share of the viewport width a rail may occupy.
 *
 * The other half of the same inference: without it a full-width wrapper passes
 * the `height > width` test and is read as a rail.
 */
export const MAX_RAIL_WIDTH_FRACTION = 0.5

/** Gap kept between a mark and the avatar above which it sits. */
export const ANCHOR_GAP = 8

/**
 * Smallest image that may be treated as an avatar rather than an icon.
 *
 * Unchanged from the implementation this replaces; the probe's real avatar is
 * 32x32 and the icon glyphs beside it are drawn as SVG, not images.
 */
export const MIN_AVATAR_PX = 24

/**
 * Largest image the structural scan may treat as an avatar.
 *
 * The guard against reading content as a person. The probe's feed covers are
 * measured in the hundreds of pixels across, and the largest avatar either real
 * layout renders is 96px, so this bound separates the two without touching the
 * 24px floor below it. Named hooks are exempt: a hook is the page saying "this is
 * the avatar", and second-guessing that is how a correct hit gets thrown away.
 */
export const MAX_AVATAR_PX = 128

/** How far from square an image may be and still read as an avatar. */
export const SQUARE_TOLERANCE = 0.2

/**
 * Vertical range, in CSS px, in which a follow badge sits under the avatar it
 * belongs to.
 *
 * The portrait action bar hangs a round `+` control directly below the author's
 * avatar; the gap is the only thing separating "a control under this picture"
 * from "the next item in the column", so it is bounded on both sides rather than
 * tested one way.
 */
export const FOLLOW_BADGE_GAP_MIN_PX = 8

/** Upper end of that range. */
export const FOLLOW_BADGE_GAP_MAX_PX = 24

/** Smallest box a follow badge may occupy: below this it is a dot, not a control. */
export const MIN_FOLLOW_BADGE_PX = 12

/**
 * Largest a follow badge may be, as a share of the avatar's own width.
 *
 * A badge is drawn smaller than the picture it belongs to, which is what keeps
 * the *next* square image in the column from being read as a badge of this one.
 */
const MAX_FOLLOW_BADGE_FRACTION = 0.75

/** How many levels below the document element the structural walk descends. */
const SCAN_DEPTH = 4

/** How many elements one structural walk may measure before giving up. */
const SCAN_LIMIT = 150

/** Where a mark parks when only a rail could be identified. */
const RAIL_PARKING = { left: 16, bottom: 96 } as const

/** Where a mark parks when the page identified itself as neither layout. */
const CORNER_PARKING = { left: 12, bottom: 88 } as const

/** Right margin the viewport-corner-right placement keeps. */
const CORNER_RIGHT_INSET = 20

/** Bottom margin it keeps: X's drawer column, plus the mark's own height. */
const CORNER_BOTTOM_INSET = 146

/** Closest a mark may come to the viewport's top or left edge. */
const VIEWPORT_MARGIN = 10

/**
 * Documented avatar hooks, most specific first.
 *
 * These are the page's own `data-e2e` test hooks, so they survive styling
 * changes. The probe measured exactly one of them hitting on a real page
 * (`[data-e2e="nav-profile"] img`, 32x32 at left=20, top=472 on the desktop
 * layout), which is why the structural scan below is not optional.
 */
export const AVATAR_SELECTORS: readonly string[] = [
  '[data-e2e="nav-user-avatar"]',
  '[data-e2e="nav-profile"] img',
  'a[href^="/@"] [data-e2e="nav-user-avatar"]',
]

/**
 * Candidate side-rail containers, most specific first.
 *
 * A hit here only nominates a container; {@link isSideRailRect} decides whether
 * the box it produced can be a rail at all. Two of the four miss on every layout
 * the probe measured, so the structural walk in
 * {@link findSideRailElement} covers the rest.
 */
export const RAIL_SELECTORS: readonly string[] = [
  '[data-e2e="nav-bar"]',
  'nav[role="navigation"]',
  'aside',
  'nav',
]

/** The viewport box placements are expressed against. */
export interface ViewportSize {
  readonly width: number
  readonly height: number
}

/** Everything an anchor rule may read. Measured once per reposition. */
export interface AnchorFacts {
  /** The page, so a `stack-above` step can find the element it stacks on. */
  readonly doc: Document
  /** The viewport the boxes were measured against, carried so no rule re-reads it. */
  readonly viewport: ViewportSize
  /** Which layout the page was read as. */
  readonly layout: AnchorLayout
  /** The side rail's box, when a container passed the rail predicate. */
  readonly rail: AnchorRect | null
  /** The signed-in avatar's box, when one could be found. */
  readonly avatar: AnchorRect | null
}

/** The measurable half of {@link AnchorFacts}: everything layout detection reads. */
export type AnchorMeasurements = Pick<AnchorFacts, 'rail'>

/** The mark being placed. */
export interface AnchorRequest {
  /**
   * The mark's own height, in CSS px.
   *
   * One number, not a box: every mark this extension places is square (the FAB
   * is 55x55, the scene trigger 48x48), so the same value serves both axes, and
   * it is the one dimension that converts a `top` into a `bottom`.
   */
  readonly box: number
}

/** A resolved position for one mark, in viewport coordinates. */
export interface AnchorPlacement {
  /** Distance from the viewport's left edge to the mark's left edge. */
  readonly left: number
  /** Distance from the viewport's bottom edge to the mark's bottom edge. */
  readonly bottom: number
  /** Which step answered. Diagnostics and tests only; never rendered. */
  readonly source: AnchorSource
}

/** An element's box, in viewport coordinates. */
function rectOf(element: Element): AnchorRect {
  return element.getBoundingClientRect()
}

/** An element is usable only if it is laid out and has area. */
function isMeasurable(element: Element): boolean {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

/** The first matching element that is actually laid out. */
function firstMeasurable(doc: Document, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    for (const element of Array.from(doc.querySelectorAll(selector))) {
      if (isMeasurable(element)) return element
    }
  }
  return null
}

/**
 * Whether a container's box can be the platform's side rail.
 *
 * All five bounds answer a measurement from `evidence/live-probe.md`, not a
 * guess. In particular:
 *
 * - `width > 0` rejects probe A's `aside` — a 0x929 box at `left=1920`, i.e. a
 *   zero-width element parked outside the right edge of the viewport.
 * - `height > width` rejects probe C's `nav` — a 168x28 top tab bar. A horizontal
 *   container is navigation, but it is not a *rail*.
 * - the near edge must sit within {@link EDGE_FRACTION} of **either** the left or
 *   the right viewport edge, because the portrait layout's action bar hugs the
 *   right and its avatar has to be reachable without a selector that matches.
 *
 * @param rect the candidate container's box
 * @param viewport the viewport box
 */
export function isSideRailRect(rect: AnchorRect, viewport: ViewportSize): boolean {
  if (!(rect.width > 0 && rect.height > 0)) return false
  if (rect.width > viewport.width * MAX_RAIL_WIDTH_FRACTION) return false
  if (!(rect.height > rect.width)) return false
  const margin = viewport.width * EDGE_FRACTION
  const hugsLeft = rect.left <= margin
  const hugsRight = rect.left + rect.width >= viewport.width - margin
  return hugsLeft || hugsRight
}

/**
 * Read the page's layout from measured geometry alone.
 *
 * One question now: did a container survive the rail predicate? Nothing else is
 * consulted — in particular the page's videos are not, so a feed that happens to
 * have a video under the viewport centre (which the probe measures on the desktop
 * page too) cannot drag the answer anywhere.
 *
 * @param measured the boxes measured for this reposition
 * @param viewport the viewport box
 */
export function detectAnchorLayout(measured: AnchorMeasurements, viewport: ViewportSize): AnchorLayout {
  if (measured.rail !== null && isSideRailRect(measured.rail, viewport)) return 'side-rail'
  return 'unknown'
}

/** Every element matched by {@link RAIL_SELECTORS}, in selector order. */
function* namedRailCandidates(doc: Document, seen: Set<Element>): Generator<Element> {
  for (const selector of RAIL_SELECTORS) {
    for (const element of Array.from(doc.querySelectorAll(selector))) {
      if (seen.has(element)) continue
      seen.add(element)
      yield element
    }
  }
}

/**
 * The layout regions near the document root, breadth-first.
 *
 * The bound is a bound, not a geometric rule: a candidate that is rejected is
 * rejected by {@link isSideRailRect}. Depth and count are capped because this
 * runs inside the scene's throttled re-measure, and because the region being
 * looked for is a layout-level column — the probe's rail and action bar both live
 * within a few levels of the root. A page that keeps everything deeper than the
 * cap simply falls back to parking, which is the shipped behaviour.
 * @param doc the page
 * @param seen containers already tried by name
 */
function* laidOutRegions(doc: Document, seen: Set<Element>): Generator<Element> {
  const root = doc.documentElement
  if (root === null) return
  const queue: Array<{ element: Element; depth: number }> = [{ element: root, depth: 0 }]
  let measured = 0
  while (queue.length > 0 && measured < SCAN_LIMIT) {
    const next = queue.shift()
    if (next === undefined) break
    const { element, depth } = next
    measured += 1
    if (depth < SCAN_DEPTH) {
      for (const child of Array.from(element.children)) {
        queue.push({ element: child, depth: depth + 1 })
      }
    }
    if (seen.has(element)) continue
    seen.add(element)
    yield element
  }
}

/**
 * The side rail's container, when the page has one.
 *
 * A hit is a nomination, not a verdict: the box is measured against
 * {@link isSideRailRect} before it is accepted, and the search widens to the
 * layout regions only because the named hooks miss on at least one real layout.
 * @param doc the page
 * @param viewport the viewport box, which the right-edge arm of the predicate needs
 */
export function findSideRailElement(doc: Document, viewport: ViewportSize): Element | null {
  const seen = new Set<Element>()
  for (const element of namedRailCandidates(doc, seen)) {
    if (isSideRailRect(rectOf(element), viewport)) return element
  }
  for (const element of laidOutRegions(doc, seen)) {
    if (isSideRailRect(rectOf(element), viewport)) return element
  }
  return null
}

/**
 * Whether an image's box reads as an avatar.
 *
 * Square-ish and neither an icon nor a video cover. The bounds are the whole of
 * the rule; which images are *looked at* is decided by the container they sit in.
 * @param rect the image's box
 */
function isAvatarRect(rect: AnchorRect): boolean {
  if (rect.width < MIN_AVATAR_PX || rect.height < MIN_AVATAR_PX) return false
  if (rect.width > MAX_AVATAR_PX || rect.height > MAX_AVATAR_PX) return false
  const longer = Math.max(rect.width, rect.height)
  return Math.abs(rect.width - rect.height) <= longer * SQUARE_TOLERANCE
}

/** Every image inside a rail whose box reads as an avatar, in DOM order. */
function avatarCandidatesIn(rail: Element): Element[] {
  return Array.from(rail.querySelectorAll('img')).filter((img) => isAvatarRect(rectOf(img)))
}

/**
 * Whether a small round control sits directly under an image.
 *
 * That control is the page's own statement of ownership: TikTok's action bar
 * hangs a follow badge below the author's avatar and below nothing else, which
 * is the one signal in the container that separates a person's picture from a
 * promo tile or a sticker. Only the box is read — a circle occupies a square
 * box, so squareness is the whole of the shape test — and images are not
 * eligible, because the next picture in the column is not a badge.
 *
 * @param rail the container, which is the search space
 * @param image the candidate the badge would belong to
 */
function hasFollowBadgeBelow(rail: Element, image: Element): boolean {
  const box = rectOf(image)
  for (const element of Array.from(rail.querySelectorAll('*'))) {
    if (element.tagName.toLowerCase() === 'img') continue
    const rect = rectOf(element)
    const gap = rect.top - box.bottom
    if (gap < FOLLOW_BADGE_GAP_MIN_PX || gap > FOLLOW_BADGE_GAP_MAX_PX) continue
    if (rect.width < MIN_FOLLOW_BADGE_PX || rect.height < MIN_FOLLOW_BADGE_PX) continue
    if (rect.width > box.width * MAX_FOLLOW_BADGE_FRACTION) continue
    const longer = Math.max(rect.width, rect.height)
    if (Math.abs(rect.width - rect.height) > longer * SQUARE_TOLERANCE) continue
    const centre = rect.left + rect.width / 2
    if (centre < box.left || centre > box.right) continue
    return true
  }
  return false
}

/**
 * The rail's avatar, chosen by attribution rather than by position.
 *
 * Three answers, in order of how much the page says about the picture:
 *
 * 1. the image with a follow badge under it — the action bar's own signature;
 * 2. the highest image in the container — the avatar heads the column, and the
 *    like/comment/share controls beside it are drawn as glyphs, not photographs;
 * 3. a container holding exactly one candidate, which is the same answer as (2).
 *
 * DOM order decides nothing, in either direction. It is not visual order (a
 * lazily inserted tile can land above one that is already painted), and a rail
 * that renders several square images — author avatar, promo tile, sticker — has
 * no "last" that means "person".
 *
 * @param rail the container, when one was identified
 */
function attributedAvatarIn(rail: Element | null): Element | null {
  if (rail === null) return null
  const candidates = avatarCandidatesIn(rail)
  for (const image of candidates) {
    if (hasFollowBadgeBelow(rail, image)) return image
  }
  let highest: Element | null = null
  for (const image of candidates) {
    if (highest === null || rectOf(image).top < rectOf(highest).top) highest = image
  }
  return highest
}

/**
 * Detect the author avatar in the active video feed card's action bar.
 *
 * TikTok's recommendation feed heads every video's right-hand action column
 * with the author's avatar. On large or centred viewports the action bar sits
 * next to the video rather than hugging the viewport edge, so it does not
 * qualify as a global side rail, yet it is the primary avatar landmark the user
 * expects shortcuts to anchor to.
 */
function findActiveFeedAvatar(doc: Document, viewport: ViewportSize): Element | null {
  const vCenter = viewport.height / 2

  // 1. Explicit video-author-avatar hook in view
  const namedAvatars = Array.from(doc.querySelectorAll('[data-e2e="video-author-avatar"]'))
  let bestNamed: { element: Element; diff: number } | null = null
  for (const el of namedAvatars) {
    const r = rectOf(el)
    if (r.width > 0 && r.height > 0 && r.top < viewport.height && r.bottom > 0) {
      const diff = Math.abs((r.top + r.bottom) / 2 - vCenter)
      if (bestNamed === null || diff < bestNamed.diff) {
        bestNamed = { element: el.querySelector('img') ?? el, diff }
      }
    }
  }
  if (bestNamed !== null) return bestNamed.element

  // 2. Active SectionActionBarContainer in the current card
  const actionBars = Array.from(doc.querySelectorAll('section[class*="SectionActionBarContainer"], [class*="ActionBarContainer"]'))
  let bestBar: Element | null = null
  let minBarDiff = Infinity

  for (const bar of actionBars) {
    const r = rectOf(bar)
    if (r.height > 0 && r.top < viewport.height && r.bottom > 0) {
      const diff = Math.abs((r.top + r.bottom) / 2 - vCenter)
      if (diff < minBarDiff) {
        minBarDiff = diff
        bestBar = bar
      }
    }
  }

  if (bestBar !== null) {
    const avatarImg = bestBar.querySelector('img')
    if (avatarImg !== null && isAvatarRect(rectOf(avatarImg))) return avatarImg
    const avatarLink = bestBar.querySelector('[data-e2e="video-author-avatar"], a[href*="/@"]')
    if (avatarLink !== null) return avatarLink
    const firstItem = bestBar.firstElementChild
    if (firstItem !== null) {
      const fr = rectOf(firstItem)
      if (fr.width > 0 && fr.height > 0) return firstItem
    }
  }

  return null
}

/**
 * The rail's avatar, searched for through the page's own hooks first.
 *
 * @param doc the page
 * @param viewport the viewport box, needed by the structural arm
 */
export function findAvatarElement(doc: Document, viewport: ViewportSize): Element | null {
  return findActiveFeedAvatar(doc, viewport) ?? firstMeasurable(doc, AVATAR_SELECTORS) ?? attributedAvatarIn(findSideRailElement(doc, viewport))
}

/**
 * Measure the page once; every rule reads this and nothing else.
 *
 * The rail is resolved once and handed to the scan, so the structural walk runs
 * at most once per reposition.
 * @param doc the page
 * @param viewport current viewport size in CSS pixels
 */
export function measureAnchorFacts(doc: Document, viewport: ViewportSize): AnchorFacts {
  const railElement = findSideRailElement(doc, viewport)
  const avatarElement = findAvatarElement(doc, viewport)
  const rail = railElement === null ? null : rectOf(railElement)
  const avatar = avatarElement === null ? null : rectOf(avatarElement)
  const layout = detectAnchorLayout({ rail }, viewport)
  return { doc, viewport, layout, rail, avatar }
}

/**
 * Directly above the avatar, which is the one target this layer has.
 *
 * The avatar's own box decides both axes: its left edge is the mark's left edge,
 * and its top edge is where the mark's bottom edge goes, one gap above.
 * @param facts the measured page
 * @param viewport the viewport box
 */
function placeAtAvatar(facts: AnchorFacts, viewport: ViewportSize): AnchorPlacement | null {
  const avatar = facts.avatar
  if (avatar === null) return null
  return {
    left: Math.max(0, avatar.left),
    // The avatar's top edge measured from the bottom of the viewport, plus the
    // gap, is where the mark's bottom edge goes.
    bottom: Math.max(0, viewport.height - avatar.top + ANCHOR_GAP),
    source: 'avatar-above',
  }
}

/**
 * The foot of the rail, for a rail page whose avatar could not be found.
 *
 * Unchanged from the implementation this replaces: a page that showed a rail but
 * no avatar parks where the avatar would have been.
 */
function placeAtRailParking(): AnchorPlacement {
  return { ...RAIL_PARKING, source: 'side-rail-parking' }
}

/**
 * The lower-left corner: the answer when nothing on the page was identified.
 *
 * Also unchanged, and reached only when neither an avatar nor a rail was found.
 * There is deliberately no "video's corner" answer: that placement was tried and
 * the user rejected it.
 */
function placeAtViewportCornerLeft(): AnchorPlacement {
  return { ...CORNER_PARKING, source: 'viewport-corner-left' }
}

/**
 * The lower-right corner, in X's drawer column.
 *
 * `top` is what the column is really specified in — 146px of clearance below the
 * mark, 20px to its right — so it is computed first and converted to a `bottom`,
 * which keeps the shipped pixel values while letting the strategy serve any mark
 * height.
 * @param viewport the viewport box
 * @param request the mark being placed
 */
function placeAtViewportCornerRight(viewport: ViewportSize, request: AnchorRequest): AnchorPlacement {
  const left = Math.max(VIEWPORT_MARGIN, viewport.width - CORNER_RIGHT_INSET - request.box)
  const top = Math.max(VIEWPORT_MARGIN, viewport.height - CORNER_BOTTOM_INSET - request.box)
  return {
    left,
    bottom: viewport.height - top - request.box,
    source: 'viewport-corner-right',
  }
}

/**
 * Stacked above an element the page already renders.
 *
 * `rank` is how many mark-sized slots the mark sits above that element, so
 * `rank: 2` puts one whole mark's worth of clearance between the two — the X
 * drawer column, expressed as data instead of arithmetic.
 * @param step the declared step
 * @param facts the measured page
 * @param viewport the viewport box
 * @param request the mark being placed
 */
function placeStackedAbove(
  step: Extract<AnchorChain[number], { strategy: 'stack-above' }>,
  facts: AnchorFacts,
  viewport: ViewportSize,
  request: AnchorRequest,
): AnchorPlacement | null {
  const element = firstMeasurable(facts.doc, step.selectors)
  if (element === null) return null
  const rect = element.getBoundingClientRect()
  const offset = step.rank * (request.box + step.gapPx)
  const top = Math.max(VIEWPORT_MARGIN, Math.round(rect.top - offset))
  return {
    left: Math.round(rect.left),
    bottom: viewport.height - top - request.box,
    source: 'stack-above',
  }
}

/** Run one declared step. `null` means "this step has nothing to say here". */
function runStep(
  step: AnchorChain[number],
  facts: AnchorFacts,
  viewport: ViewportSize,
  request: AnchorRequest,
): AnchorPlacement | null {
  if (typeof step !== 'string') return placeStackedAbove(step, facts, viewport, request)
  switch (step) {
    case 'avatar-above':
      return placeAtAvatar(facts, viewport)
    case 'side-rail-parking':
      return placeAtRailParking()
    case 'viewport-corner-left':
      return placeAtViewportCornerLeft()
    case 'viewport-corner-right':
      return placeAtViewportCornerRight(viewport, request)
  }
}

/**
 * Resolve where one mark belongs.
 *
 * Walks the chain in order and returns the first answer. A step answers `null`
 * only when the thing it needs is absent (no avatar, no matching element), so the
 * chain's later steps are fallbacks in the literal sense.
 *
 * The trailing viewport corner is why a mark never disappears: a chain should end
 * in a step that always answers, and if a caller hands over one that does not,
 * the mark still gets a home rather than being left unpositioned.
 *
 * @param facts the measured page
 * @param chain the platform's declared steps for this mark in this layout
 * @param request the mark being placed
 */
export function resolveAnchorPlacement(
  facts: AnchorFacts,
  chain: AnchorChain,
  request: AnchorRequest,
): AnchorPlacement {
  for (const step of chain) {
    const placement = runStep(step, facts, facts.viewport, request)
    if (placement !== null) return placement
  }
  return placeAtViewportCornerLeft()
}

/**
 * Resolve one of a platform's marks, in one call.
 *
 * Consumers hold a `PlatformEntry` and a mark slot; the three steps (measure →
 * select the chain → place) must never be assembled differently in two places,
 * because a mark reading a different chain than its sibling is a layout bug that
 * no test of either half can see.
 *
 * @param entry the platform, as resolved from the host
 * @param mark which of the platform's marks is being placed
 * @param doc the page
 * @param viewport current viewport size in CSS pixels
 * @param request the mark being placed
 * @throws when the platform declares no such mark — a caller asking for a slot
 *   that does not exist is a bug, not a page condition
 */
export function resolvePlatformAnchor(
  entry: PlatformEntry,
  mark: AnchorMark,
  doc: Document,
  viewport: ViewportSize,
  request: AnchorRequest,
): AnchorPlacement {
  const facts = measureAnchorFacts(doc, viewport)
  const chain = anchorChainFor(entry.anchor, mark, facts.layout)
  if (chain === null) throw new Error(`platform ${entry.id} declares no ${mark} mark`)
  return resolveAnchorPlacement(facts, chain, request)
}
