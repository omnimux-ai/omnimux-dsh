/**
 * Video-only capsule anchoring: keep the pill off the player's own controls.
 *
 * A video's bottom-left corner belongs to the player, not to the page. Twitter,
 * YouTube and Bilibili all park their play/pause control there, so anchoring the
 * pill the way an image is anchored paints it straight over the button the user
 * is aiming at. Two things fix that, and this module owns both:
 *
 * 1. a fixed, control-clearing left inset ({@link VIDEO_ANCHOR_SPEC}), and
 * 2. one bounded hit test that reads the *measured* control, so a player with a
 *    wider cluster pushes the pill further right instead of being ignored.
 *
 * The probe is deliberately cheap and cached: it runs once per media element per
 * {@link VIDEO_ANCHOR_SPEC.cacheMs}, never once per scroll frame.
 *
 * @module
 */

import { CAPSULE_SPEC, IMAGE_ANCHOR_POLICY, VIDEO_ANCHOR_SPEC } from './messages.ts'
import { measureElement } from './payload.ts'
import type { AnchorRect, CapsuleAnchorPolicy, MediaKind } from './types.ts'

/** What one probe learned about a media element's own control row. */
export interface ControlProbe {
  /** Right edge of the control sitting under the probe point, in viewport px. */
  playButtonRight: number
  /** Vertical centre of that control, in viewport px. */
  controlCenterY: number
  /** `false` when nothing control-shaped was under the probe point. */
  measured: boolean
}

/** The probe result for a media element with no readable control row. */
export const UNMEASURED_CONTROL: ControlProbe = {
  playButtonRight: 0,
  controlCenterY: 0,
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
 * Hit tests the media's bottom-left corner for the player's own control.
 *
 * The probe point is `(left + probeInsetX, bottom - probeInsetY)` — inside the
 * control cluster but clear of its rounded edge. A hit only counts when it is
 * control-shaped *and* sits inside the media box; anything else reads as "no
 * probe", which is what makes the fixed default safe on an unknown player.
 *
 * @param media - The media element being anchored.
 * @param rect - The media element's current bounding rect.
 * @param hitTest - `document.elementFromPoint`, or `null` outside a document.
 */
export function probePlayControl(
  media: Element,
  rect: AnchorRect,
  hitTest: ((x: number, y: number) => Element | null) | null = defaultHitTest(),
): ControlProbe {
  if (hitTest === null) return UNMEASURED_CONTROL

  const x = rect.left + VIDEO_ANCHOR_SPEC.probeInsetX
  const y = rect.bottom - VIDEO_ANCHOR_SPEC.probeInsetY
  if (x >= rect.right || y <= rect.top) return UNMEASURED_CONTROL

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

  return {
    playButtonRight: box.right,
    controlCenterY: box.top + box.height / 2,
    measured: true,
  }
}

/**
 * Resolves the anchor policy for one media element.
 *
 * An image keeps {@link IMAGE_ANCHOR_POLICY} verbatim. A video is pushed clear
 * of the measured control when there is one, and clear of a typical ~48px
 * control when there is not: both `offsetX` and `offsetY` are clamped into the
 * required bands, so no probe result can park the pill back on the play button.
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
    ? (probe.playButtonRight - rect.left) + VIDEO_ANCHOR_SPEC.minClearance
    : VIDEO_ANCHOR_SPEC.offsetX

  const [minY, maxY] = VIDEO_ANCHOR_SPEC.offsetYRange
  // Centring the pill on the measured control row is what the band bounds; a
  // 48px row already sits below the band, so the clamp is the active rule there.
  const centredY = probe.measured
    ? (rect.bottom - probe.controlCenterY) - CAPSULE_SPEC.height / 2
    : VIDEO_ANCHOR_SPEC.offsetY

  return {
    offsetX: clamp(measuredX, minX, maxX),
    offsetY: clamp(centredY, minY, maxY),
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

/** `document.elementFromPoint`, or `null` where no document exists. */
function defaultHitTest(): ((x: number, y: number) => Element | null) | null {
  if (typeof document === 'undefined') return null
  if (typeof document.elementFromPoint !== 'function') return null
  return (x, y) => {
    const hit = document.elementFromPoint(x, y)
    return hit instanceof Element ? hit : null
  }
}
