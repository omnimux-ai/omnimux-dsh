/**
 * Video-only capsule anchoring: keep the pill off the player's own controls.
 *
 * A video's bottom-left corner belongs to the player's play control, so the
 * video pill hugs the top-right corner instead. Two things keep it there
 * cleanly, and this module owns both:
 *
 * 1. a fixed inset pair ({@link VIDEO_ANCHOR_SPEC}) measured from the media's
 *    top-right corner to the pill's top-right corner, and
 * 2. one bounded hit test that reads a *measured* top-right control (a help or
 *    "more" button some players park there), so the pill steps left of it
 *    instead of covering it.
 *
 * The probe is cheap and cached: it runs once per media element per
 * {@link VIDEO_ANCHOR_SPEC.cacheMs}, never once per scroll frame.
 *
 * @module
 */

import { IMAGE_ANCHOR_POLICY, MEDIA_OVERLAY_HOST_ID, VIDEO_ANCHOR_SPEC } from './messages.ts'
import { measureElement } from './payload.ts'
import type { AnchorRect, CapsuleAnchorPolicy, MediaKind } from './types.ts'

/** What one probe learned about the control in a media's top-right corner. */
export interface ControlProbe {
  /** Left edge of the control sitting under the probe point, in viewport px. */
  controlLeft: number
  /** `false` when nothing control-shaped was under the probe point. */
  measured: boolean
}

/** The probe result for a media element with no readable corner control. */
export const UNMEASURED_CONTROL: ControlProbe = {
  controlLeft: 0,
  measured: false,
}

/**
 * Everything that counts as a control rather than as content.
 *
 * The tag/role filter is what makes this safe: an `<img>` or a card is never a
 * control no matter how small CSS made it, so the guard can never mistake a
 * shrunken thumbnail for a button.
 */
const CONTROL_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="slider"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
].join(', ')

/**
 * Whether an element is a control small enough to be one button rather than a
 * whole card.
 *
 * @param element - Candidate element, usually the result of a hit test.
 */
export function isControlSizedElement(element: Element): boolean {
  if (!element.matches(CONTROL_SELECTOR)) return false
  const metric = measureElement(element)
  const max = VIDEO_ANCHOR_SPEC.controlMaxSize
  if (metric.width <= 0 || metric.height <= 0) return false
  return metric.width <= max && metric.height <= max
}

/**
 * Hit tests the media's top-right corner for a player control.
 *
 * The probe point is `(right - probeInsetX, top + probeInsetY)`. A hit only
 * counts when it is control-shaped *and* sits inside the media box; anything
 * else reads as "no probe", which keeps the fixed default on an unknown player.
 *
 * @param media - The media element being anchored.
 * @param rect - The media element's current bounding rect.
 * @param hitTest - Page hit test that skips the overlay, or `null` outside a document.
 */
export function probePlayControl(
  media: Element,
  rect: AnchorRect,
  hitTest: ((x: number, y: number) => Element | null) | null = defaultHitTest(),
): ControlProbe {
  if (hitTest === null) return UNMEASURED_CONTROL

  const x = rect.right - VIDEO_ANCHOR_SPEC.probeInsetX
  const y = rect.top + VIDEO_ANCHOR_SPEC.probeInsetY
  if (x <= rect.left || y >= rect.bottom) return UNMEASURED_CONTROL

  let hit: Element | null
  try {
    hit = hitTest(x, y)
  } catch {
    return UNMEASURED_CONTROL
  }
  if (hit === null) return UNMEASURED_CONTROL

  // A player with no custom chrome reports the video element itself; that is
  // "no control found", not "a control the size of the whole frame".
  if (hit === media || media.contains(hit) || hit.contains(media)) return UNMEASURED_CONTROL
  if (!isControlSizedElement(hit)) return UNMEASURED_CONTROL

  const box = hit.getBoundingClientRect()
  if (box.right <= rect.left || box.left >= rect.right) return UNMEASURED_CONTROL
  if (box.bottom <= rect.top || box.top >= rect.bottom) return UNMEASURED_CONTROL

  return { controlLeft: box.left, measured: true }
}

/**
 * Resolves the anchor policy for one media element.
 *
 * An image keeps {@link IMAGE_ANCHOR_POLICY} verbatim. A video hugs the
 * top-right corner, stepping left of a measured corner control; the right
 * inset is clamped into its band so no probe result can push the pill toward
 * the middle of the frame.
 *
 * @param rect - The media element's current bounding rect.
 * @param kind - Media kind resolved by the detector.
 * @param probe - Control probe for this element; defaults to "unmeasured".
 */
export function resolveCapsuleAnchor(
  rect: AnchorRect,
  kind: MediaKind,
  probe: ControlProbe = UNMEASURED_CONTROL,
): CapsuleAnchorPolicy {
  if (kind !== 'video') return imageAnchorPolicy()

  const [minX, maxX] = VIDEO_ANCHOR_SPEC.offsetXRange
  const measuredX = probe.measured
    ? (rect.right - probe.controlLeft) + VIDEO_ANCHOR_SPEC.minClearance
    : VIDEO_ANCHOR_SPEC.offsetX

  return {
    corner: 'top-right',
    offsetX: clamp(measuredX, minX, maxX),
    offsetY: VIDEO_ANCHOR_SPEC.offsetY,
    overflow: 'clamp',
  }
}

/**
 * Per-element control probe with a short-lived cache.
 *
 * One shared instance lives on the overlay: the same player is probed once and
 * then reused across every scroll frame the pointer generates, and a resized
 * media invalidates its own entry.
 */
export class VideoAnchorProbe {
  private readonly cache = new WeakMap<
    Element,
    { probe: ControlProbe; at: number; width: number; height: number }
  >()
  private readonly hitTest: ((x: number, y: number) => Element | null) | null
  private readonly now: () => number

  constructor(
    hitTest: ((x: number, y: number) => Element | null) | null = defaultHitTest(),
    now: () => number = () => Date.now(),
  ) {
    this.hitTest = hitTest
    this.now = now
  }

  /**
   * Returns the control probe for a media element, measuring at most once per
   * {@link VIDEO_ANCHOR_SPEC.cacheMs}.
   */
  probe(media: Element, rect: AnchorRect): ControlProbe {
    const at = this.now()
    const width = rect.right - rect.left
    const height = rect.bottom - rect.top
    const cached = this.cache.get(media)
    if (cached !== undefined
      && at - cached.at < VIDEO_ANCHOR_SPEC.cacheMs
      && cached.width === width
      && cached.height === height) {
      return cached.probe
    }
    const probe = probePlayControl(media, rect, this.hitTest)
    this.cache.set(media, { probe, at, width, height })
    return probe
  }
}

function imageAnchorPolicy(): CapsuleAnchorPolicy {
  // A copy, so a caller cannot mutate the shared spec through the policy.
  return { ...IMAGE_ANCHOR_POLICY }
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * `document.elementsFromPoint` minus the overlay's own host, or `null` where no
 * document exists. Once the pill is visible it covers the probe point, so the
 * first hit would otherwise always be the overlay itself.
 */
function defaultHitTest(): ((x: number, y: number) => Element | null) | null {
  if (typeof document === 'undefined') return null
  if (typeof document.elementsFromPoint === 'function') {
    return (x, y) => {
      for (const hit of document.elementsFromPoint(x, y)) {
        if (isOverlayNode(hit)) continue
        return hit
      }
      return null
    }
  }
  if (typeof document.elementFromPoint !== 'function') return null
  return (x, y) => {
    const hit = document.elementFromPoint(x, y)
    if (!(hit instanceof Element) || isOverlayNode(hit)) return null
    return hit
  }
}

/** Whether a hit belongs to the overlay: its host, or a node inside its shadow tree. */
function isOverlayNode(node: Element): boolean {
  if (node.id === MEDIA_OVERLAY_HOST_ID) return true
  if (node.closest(`#${MEDIA_OVERLAY_HOST_ID}`) !== null) return true
  const root = node.getRootNode()
  return typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot && root.host.id === MEDIA_OVERLAY_HOST_ID
}
