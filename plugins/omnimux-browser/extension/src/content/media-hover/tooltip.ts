/**
 * The pure-white tooltip shown above a capsule icon.
 *
 * Two invariants drive this file:
 *
 * 1. The tooltip is a **sibling** of the capsule, never a child. Both are
 *    `position: fixed` nodes under the shadow root, so a media card with
 *    `overflow: hidden` cannot clip the tooltip.
 * 2. Placement is a pure function of geometry, so the flip and clamp rules are
 *    verifiable without a layout engine.
 *
 * @module
 */

import { TOOLTIP_SPEC, TOOLTIP_MAX_CHARS } from './messages.ts'
import type { AnchorRect, TooltipPlacement, ViewportBox } from './types.ts'

/** Measures an element's rendered width, honouring invisible nodes. */
export type TooltipMeasurer = (element: HTMLElement) => number

/** Returns the current viewport box, with the contract margin applied. */
export function readViewportBox(): ViewportBox {
  const view = typeof window === 'undefined' ? undefined : window
  return {
    width: view?.innerWidth ?? 0,
    height: view?.innerHeight ?? 0,
    margin: TOOLTIP_SPEC.viewportMargin,
  }
}

function measureWidth(element: HTMLElement): number {
  const rect = element.getBoundingClientRect()
  if (rect.width > 0) return rect.width
  if (element.offsetWidth > 0) return element.offsetWidth
  // A detached or display:none node reports 0; fall back to the text budget so
  // the clamp still keeps the tooltip on screen.
  return Math.min(TOOLTIP_SPEC.maxWidth, (element.textContent?.length ?? 0) * 7 + 20)
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Computes where the tooltip sits for a given anchor.
 *
 * Preference order: centred above the anchor, flipped below when the viewport
 * top cannot hold it, then clamped to the viewport on all four sides. A tooltip
 * that fits on neither side is clamped rather than pushed off screen.
 *
 * @param anchor - Bounding rect of the hovered icon.
 * @param viewport - Visible viewport box plus its edge margin.
 * @param metrics - Tooltip pixel size (`width` measured, heights from spec).
 */
export function placeTooltip(
  anchor: AnchorRect,
  viewport: ViewportBox,
  metrics: { width: number; height: number },
): TooltipPlacement {
  const width = Math.min(metrics.width, Math.max(0, viewport.width - viewport.margin * 2))
  const height = metrics.height
  const margin = viewport.margin

  const maxLeft = Math.max(margin, viewport.width - width - margin)
  const left = clamp(anchor.left + anchor.width / 2 - width / 2, margin, maxLeft)

  const roomAbove = anchor.top - TOOLTIP_SPEC.offsetY - margin
  const fitsAbove = roomAbove >= height
  const maxTop = Math.max(margin, viewport.height - height - margin)

  if (fitsAbove) {
    return {
      left,
      top: clamp(anchor.top - TOOLTIP_SPEC.offsetY - height, margin, maxTop),
      side: 'above',
      flipped: false,
    }
  }

  const maxBottom = Math.max(margin, viewport.height - height - margin)
  return {
    left,
    top: clamp(anchor.bottom + TOOLTIP_SPEC.offsetY + TOOLTIP_SPEC.arrow.size, margin, maxBottom),
    side: 'below',
    flipped: true,
  }
}

/** Truncates a label to the tooltip's character budget. */
export function trimTooltipText(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= TOOLTIP_MAX_CHARS) return collapsed
  return `${collapsed.slice(0, TOOLTIP_MAX_CHARS - 1)}…`
}

/**
 * Manages the white tooltip node.
 *
 * The node is created once by {@link MediaTooltip.create} and is appended to the
 * same shadow root as the capsule, then positioned with inline `left` / `top`.
 */
export class MediaTooltip {
  /** The tooltip node; a direct child of the shadow root. */
  readonly element: HTMLDivElement

  private readonly textNode: HTMLSpanElement
  private readonly arrowNode: HTMLElement
  private readonly measure: TooltipMeasurer

  private constructor(element: HTMLDivElement, measure: TooltipMeasurer) {
    this.element = element
    this.measure = measure
    this.textNode = element.querySelector('.white-tooltip-text') as HTMLSpanElement
    this.arrowNode = element.querySelector('.white-tooltip-arrow') as HTMLElement
    this.hide()
  }

  /**
   * Creates the tooltip node without attaching it; the overlay decides where it
   * lives in the shadow tree.
   *
   * @param measure - Optional width measurer, injectable for tests.
   */
  static create(measure: TooltipMeasurer = measureWidth): MediaTooltip {
    const element = document.createElement('div')
    element.className = 'white-tooltip'
    element.setAttribute('role', 'tooltip')
    element.setAttribute('aria-hidden', 'true')
    element.setAttribute('data-side', 'above')
    element.innerHTML = '<span class="white-tooltip-text"></span>'
      + '<i class="white-tooltip-arrow" aria-hidden="true"></i>'
    return new MediaTooltip(element, measure)
  }

  /** Whether the tooltip is currently painted. */
  get visible(): boolean {
    return this.element.classList.contains('is-visible')
  }

  /**
   * Paints the tooltip above (or below) the anchor and shows it.
   *
   * @param text - Label to render; trimmed to the tooltip budget.
   * @param anchor - Bounding rect of the hovered icon.
   * @param viewport - Viewport box; read from `window` when omitted.
   */
  show(text: string, anchor: AnchorRect, viewport: ViewportBox = readViewportBox()): void {
    const label = trimTooltipText(text)
    this.textNode.textContent = label
    this.element.classList.add('is-visible')
    this.element.setAttribute('aria-hidden', 'false')
    this.place(anchor, viewport)
  }

  /** Recomposes the tooltip against a new anchor or after a scroll. */
  place(anchor: AnchorRect, viewport: ViewportBox = readViewportBox()): void {
    const height = this.measureHeight()
    const placement = placeTooltip(anchor, viewport, { width: this.measure(this.element), height })
    this.element.style.left = `${Math.round(placement.left)}px`
    this.element.style.top = `${Math.round(placement.top)}px`
    this.element.style.maxWidth = `${TOOLTIP_SPEC.maxWidth}px`
    this.element.setAttribute('data-side', placement.side)
    this.placeArrow(anchor, placement)
  }

  /** Hides the tooltip. The node stays mounted so the next show is instant. */
  hide(): void {
    this.element.classList.remove('is-visible')
    this.element.setAttribute('aria-hidden', 'true')
  }

  /** Removes the node from the DOM. */
  destroy(): void {
    this.element.remove()
  }

  /** Measures the tooltip height, falling back to the padding + line box. */
  private measureHeight(): number {
    const rect = this.element.getBoundingClientRect()
    if (rect.height > 0) return rect.height
    return TOOLTIP_SPEC.fontSize + 12
  }

  /**
   * Aligns the tail with the icon's centre while keeping it inside the tooltip.
   *
   * `left` is read relative to the tooltip, so it is converted from the viewport
   * coordinate the anchor provides.
   */
  private placeArrow(anchor: AnchorRect, placement: TooltipPlacement): void {
    const width = this.measure(this.element)
    const half = TOOLTIP_SPEC.arrow.size
    const inset = horizontalPadding()
    const center = anchor.left + anchor.width / 2
    const min = placement.left + inset + half
    const max = placement.left + Math.max(width, half * 2) - inset - half
    const arrowViewportX = clamp(center, min, Math.max(min, max))
    this.arrowNode.style.left = `${Math.round(arrowViewportX - placement.left)}px`
  }
}

/** Horizontal padding parsed from the tooltip's `padding` shorthand. */
function horizontalPadding(): number {
  const parts = TOOLTIP_SPEC.padding.split(/\s+/)
  const value = Number.parseFloat(parts[1] ?? parts[0] ?? '10')
  return Number.isFinite(value) ? value : 10
}
