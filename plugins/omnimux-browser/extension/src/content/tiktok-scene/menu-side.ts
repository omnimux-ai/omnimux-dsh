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

/**
 * Place the toolbar beside the trigger.
 *
 * Order of business: the preferred side comes from the toolbar's width against
 * the room between the trigger's centre and the viewport's right edge; that
 * preference is then confirmed against the exact box the toolbar would occupy on
 * that side, and the other side is tried when it would not fit. The last clamp is
 * what makes "never wider than the viewport" true even when neither side fits.
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
  const side: MenuSide = fits ? preferred : preferred === 'right' ? 'left' : 'right'

  const raw = side === 'right' ? rightLeft : leftLeft
  return { side, left: clamp(raw, 0, Math.max(0, viewportWidth - menuWidth)) }
}
