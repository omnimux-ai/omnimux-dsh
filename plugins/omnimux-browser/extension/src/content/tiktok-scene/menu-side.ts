/**
 * Which side of the trigger the toolbar opens on.
 *
 * The toolbar is one horizontal row of three items, so it is wide — wider than
 * the circle it belongs to, which means neither side can be assumed. The side is
 * therefore decided from the toolbar's own measured width and the room the
 * viewport actually has, and never from a fixed threshold: a number tuned on one
 * screen silently overflows on a narrower one, and the trigger sits near the
 * viewport's right edge often enough (the portrait layout's action bar is exactly
 * that) for the difference to be visible.
 *
 * Both candidate sides are checked against the real geometry before either is
 * used, so the toolbar can only leave the viewport if the viewport is narrower
 * than the toolbar itself.
 *
 * The trigger keeps its own room as well. Clamping can push the toolbar onto the
 * button it belongs to — the button then sits under the panel, unclickable, and
 * the panel stays open because the pointer is still inside the anchor. So a
 * placement that lands on the trigger is only kept when the viewport leaves no
 * alternative, and then it is the one that covers least of the button.
 *
 * @module
 */

/** The side the toolbar opens on. */
export type MenuSide = 'right' | 'left'

/** Everything the decision reads. All of it is measured or derived from a marking. */
export interface MenuSideFacts {
  /** The trigger's left edge, in viewport coordinates. */
  readonly buttonLeft: number
  /** The trigger's width in CSS px. Every mark this extension places is square. */
  readonly buttonBox: number
  /** The toolbar's rendered width, measured after layout. */
  readonly menuWidth: number
  /** The viewport width the boxes were measured against. */
  readonly viewportWidth: number
}

/** The chosen side, and where the toolbar's left edge goes. */
export interface MenuSidePlacement {
  readonly side: MenuSide
  /** Distance from the viewport's left edge to the toolbar's left edge. */
  readonly left: number
}

/** Keep a value inside `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** The other side. */
function otherSide(side: MenuSide): MenuSide {
  return side === 'right' ? 'left' : 'right'
}

/** How much of the trigger one toolbar placement sits on. */
interface TriggerCover {
  /** Width of the covered part, in CSS px; `0` means the trigger stays clear. */
  readonly width: number
  /** Whether the trigger's centre — where a click lands — is under the toolbar. */
  readonly hidesCentre: boolean
}

/** The part of the trigger a toolbar occupying `[left, left + menuWidth]` covers. */
function coverOf(left: number, menuWidth: number, buttonLeft: number, buttonBox: number): TriggerCover {
  const buttonRight = buttonLeft + buttonBox
  const width = Math.max(0, Math.min(left + menuWidth, buttonRight) - Math.max(left, buttonLeft))
  const centre = buttonLeft + buttonBox / 2
  return { width, hidesCentre: left < centre && left + menuWidth > centre }
}

/** Lower is better: clear of the trigger, then clear of its centre, then least covered. */
function rankOf(cover: TriggerCover): number {
  if (cover.width === 0) return 0
  return cover.hidesCentre ? 2 : 1
}

/**
 * Place the toolbar beside the trigger.
 *
 * Order of business: the preferred side comes from the toolbar's width against
 * the room between the trigger's centre and the viewport's right edge; that
 * preference is then confirmed against the exact box the toolbar would occupy on
 * that side, and the other side is tried when it would not fit. The last clamp is
 * what makes "never wider than the viewport" true even when neither side fits.
 *
 * The clamp can move the toolbar onto the trigger, so the placement it produced
 * is checked against the button: when it covers any of the button the other side
 * is measured too, and the better of the two is returned. "Better" is the one
 * clear of the button, and failing that the one that leaves the button's centre
 * — the point a user aims at — uncovered, and failing that the one covering less
 * of it. When both are clear the preferred side stands, so nothing about the
 * ordinary case changes.
 *
 * `side` is the side the returned placement was computed from, which is the edge
 * the toolbar grows from; it is never the side that was discarded.
 *
 * @param facts the measured trigger and toolbar
 */
export function resolveMenuSide(facts: MenuSideFacts): MenuSidePlacement {
  const { buttonLeft, buttonBox, menuWidth, viewportWidth } = facts

  // Where the toolbar's left edge lands on each side: flush with the trigger's
  // right edge, or ending at the trigger's left edge.
  const rightLeft = buttonLeft + buttonBox
  const leftLeft = buttonLeft - menuWidth

  const roomRight = viewportWidth - (buttonLeft + buttonBox / 2)
  const preferred: MenuSide = menuWidth <= roomRight ? 'right' : 'left'
  const fits =
    preferred === 'right'
      ? rightLeft + menuWidth <= viewportWidth
      : leftLeft >= 0
  const first: MenuSide = fits ? preferred : otherSide(preferred)

  // The upper bound is the same for both sides: it is what keeps the toolbar
  // inside the viewport, and it is zero when the toolbar is wider than it.
  const max = Math.max(0, viewportWidth - menuWidth)
  const placementOf = (side: MenuSide): MenuSidePlacement => ({
    side,
    left: clamp(side === 'right' ? rightLeft : leftLeft, 0, max),
  })

  const chosen = placementOf(first)
  const cover = coverOf(chosen.left, menuWidth, buttonLeft, buttonBox)
  if (cover.width === 0) return chosen

  const alternative = placementOf(otherSide(first))
  const alternativeCover = coverOf(alternative.left, menuWidth, buttonLeft, buttonBox)
  const rank = rankOf(cover)
  const alternativeRank = rankOf(alternativeCover)
  if (alternativeRank !== rank) return alternativeRank < rank ? alternative : chosen
  return alternativeCover.width < cover.width ? alternative : chosen
}
