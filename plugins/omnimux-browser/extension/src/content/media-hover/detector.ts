/**
 * Detection layer: pointer → page media element, with no UI and no messaging.
 *
 * Three disciplines keep this safe on a page with hundreds of images:
 *
 * - **One** passive `pointermove` listener on the document, never one per image.
 * - `elementFromPoint` resolves the topmost element; the walk to the nearest
 *   `<img>` / `<video>` crosses shadow boundaries and is depth-bounded.
 * - Candidates are cached in a `WeakMap` and re-described only when their media
 *   address changes, so a memoised payload is reused across pointer moves.
 *
 * A resolved media element is still not automatically offered the capsule: the
 * final gate is {@link isPostOrWorkMedia}, which admits posts and works while
 * rejecting avatars, icons, badges and page chrome. Rejections are silent:
 * nothing is created, nothing is reported, no DOM is touched. In particular this
 * layer never starts a runtime message, so hovering cannot cold-start the MV3
 * service worker.
 *
 * @module
 */

import {
  findMediaElement,
  isElementInViewport,
  isEligibleMediaSize,
  isPostOrWorkMedia,
  measureElement,
  mediaIdOf,
  mediaKindOf,
  normalizeMedia,
  resolveMediaSource,
} from './payload.ts'
import { isControlSizedElement } from './video-anchor.ts'
import { normalizeHost } from './classifier.ts'
import type { AnchorRect, HoverCandidate, HoveredMedia } from './types.ts'

/** Listener invoked when a pointer settles on an eligible media element. */
export type CandidateListener = (candidate: HoverCandidate, rect: AnchorRect) => void

/** Invalidation hook: the current candidate moved, resized or detached. */
export type InvalidateListener = (reason: 'scroll' | 'resize' | 'detach') => void

/** Options accepted by {@link MediaDetector}. */
export interface MediaDetectorOptions {
  onCandidate: CandidateListener
  /** Called when the active element's anchor moved or disappeared. */
  onInvalidate?: InvalidateListener
  /** Overrides `document.elementFromPoint`; tests inject a stub here. */
  elementFromPoint?: (x: number, y: number) => Element | null
}

const DEFAULT_VIEWPORT = { width: 1280, height: 800 }

interface MediaFacts {
  src: string
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
}

/**
 * Resolves which media element the pointer is over.
 *
 * Uses hit testing rather than `event.target` so an element covered by an
 * overlay inside the media (a play button, a caption) still resolves to the
 * media itself. The pointer position is handed to {@link findMediaElement} so a
 * transparent click catcher layered over a video resolves to the video beside
 * it, and a control the size of one button ends the search: aiming at play,
 * mute or fullscreen is not a request for the capsule.
 */
export function resolvePointerTarget(
  x: number,
  y: number,
  hitTest: (x: number, y: number) => Element | null,
): Element | null {
  const top = hitTest(x, y)
  if (top === null) return null
  if (isControlSizedElement(top)) return null
  return findMediaElement(top, { x, y })
}

/** Everything the detector needs from the browser, injectable for tests. */
export interface DetectorEnvironment {
  elementFromPoint(x: number, y: number): Element | null
  viewport(): { width: number; height: number }
  now(): number
  /**
   * Page host, used by the post/work classifier's platform rules.
   *
   * Optional so an existing environment stub keeps working; the detector falls
   * back to reading the live document when it is absent.
   */
  host?(): string
}

function browserEnvironment(): DetectorEnvironment {
  return {
    elementFromPoint(x, y) {
      if (typeof document === 'undefined') return null
      if (typeof document.elementFromPoint !== 'function') return null
      const hit = document.elementFromPoint(x, y)
      return hit instanceof Element ? hit : null
    },
    viewport() {
      if (typeof window === 'undefined') return DEFAULT_VIEWPORT
      return {
        width: window.innerWidth || document.documentElement?.clientWidth || DEFAULT_VIEWPORT.width,
        height: window.innerHeight || document.documentElement?.clientHeight || DEFAULT_VIEWPORT.height,
      }
    },
    now: () => Date.now(),
    host() {
      return normalizeHost(globalThis.location?.hostname ?? '')
    },
  }
}

/**
 * Pointer-driven media detector.
 *
 * The detector owns listeners and the candidate cache; the overlay owns timing
 * (debounce, grace period) and presentation.
 */
export class MediaDetector {
  private readonly cache = new WeakMap<Element, HoverCandidate>()
  private readonly options: MediaDetectorOptions
  private readonly env: DetectorEnvironment
  private readonly doc: Document | null

  private bound = false
  private disposed = false
  private current: HoverCandidate | null = null
  private lastMouseTarget: Element | null = null

  constructor(options: MediaDetectorOptions, env: DetectorEnvironment = browserEnvironment()) {
    this.options = options
    this.env = env
    this.doc = typeof document === 'undefined' ? null : document
  }

  /** The candidate currently under the pointer, if any. */
  get active(): HoverCandidate | null {
    return this.current
  }

  /** The page host the post/work classifier judges platform rules against. */
  private pageHost(): string {
    return this.env.host?.() ?? ''
  }

  /** The last media element the pointer resolved to, for quick re-entry. */
  peek(element: Element): HoverCandidate | null {
    const cached = this.cache.get(element)
    if (cached === undefined || cached.disabled) return null
    return cached
  }

  /** Attaches the global pointer listeners. Idempotent. */
  start(): void {
    if (this.bound || this.disposed || this.doc === null) return
    this.doc.addEventListener('pointermove', this.handlePointerMove, { passive: true })
    this.doc.addEventListener('pointerdown', this.handlePointerDown, { passive: true })
    this.bound = true
  }

  /** Detaches every listener and drops the cached candidate. */
  dispose(): void {
    this.disposed = true
    this.clearCandidate()
    if (!this.bound || this.doc === null) return
    this.doc.removeEventListener('pointermove', this.handlePointerMove)
    this.doc.removeEventListener('pointerdown', this.handlePointerDown)
    this.bound = false
  }

  /** Re-evaluates the active candidate after a scroll or a resize. */
  refresh(): void {
    const candidate = this.current
    if (candidate === null) return
    if (!candidate.element.isConnected) {
      this.options.onInvalidate?.('detach')
      return
    }
    const rect = this.rectOf(candidate.element)
    const viewport = this.env.viewport()
    const metric = measureElement(candidate.element)
    const kind = mediaKindOf(candidate.element)
    if (!isElementInViewport(rect, viewport.width, viewport.height)
      || !isEligibleMediaSize(metric.width, metric.height)
      || kind === null
      || !isPostOrWorkMedia(candidate.element, this.pageHost())) {
      this.options.onInvalidate?.('scroll')
      return
    }
    this.options.onCandidate(candidate, rect)
  }

  /** Releases the active candidate without touching listeners. */
  clearCandidate(): void {
    this.current = null
  }

  /** Bounding rect of an element, or an empty box when it reports none. */
  rectOf(element: Element): AnchorRect {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width > 0 ? rect.width : 0,
      height: rect.height > 0 ? rect.height : 0,
    }
  }

  private readonly handlePointerMove = (event: Event): void => {
    if (this.disposed) return
    const point = this.pointOf(event)
    if (point === null) return
    this.lastMouseTarget = event.target instanceof Element ? event.target : null
    const element = resolvePointerTarget(point.x, point.y, (x, y) => this.env.elementFromPoint(x, y))
      ?? this.fallbackTarget()
    if (element === null) {
      this.current = null
      return
    }
    const candidate = this.describe(element)
    if (candidate === null) {
      this.current = null
      return
    }
    this.current = candidate
    this.options.onCandidate(candidate, this.rectOf(element))
  }

  private readonly handlePointerDown = (event: Event): void => {
    if (this.disposed) return
    const point = this.pointOf(event)
    if (point === null) return
    const element = resolvePointerTarget(point.x, point.y, (x, y) => this.env.elementFromPoint(x, y))
    if (element === null) return
    // A press inside the media dismisses the capsule; the page keeps the event.
    if (this.current !== null && this.current.element === element) {
      this.options.onInvalidate?.('detach')
    }
  }

  /**
   * Element lookup fallback for environments without hit testing.
   *
   * Real browsers always have `document.elementFromPoint`; jsdom does not, so
   * tests either stub it or rely on this path.
   */
  private fallbackTarget(): Element | null {
    const target = this.lastMouseTarget
    if (target === null) return null
    const media = findMediaElement(target)
    return media ?? nearestMediaAncestor(target)
  }

  private pointOf(event: Event): { x: number; y: number } | null {
    const candidate = event as { clientX?: unknown; clientY?: unknown }
    const x = typeof candidate.clientX === 'number' ? candidate.clientX : null
    const y = typeof candidate.clientY === 'number' ? candidate.clientY : null
    if (x === null || y === null) return null
    return { x, y }
  }

  /**
   * Resolves or refreshes the cached candidate for an element.
   *
   * @returns `null` when the element is detached, too small, not a post or work
   *   asset, or has no usable media address — the caller then reports "no
   *   candidate" and stays silent.
   */
  private describe(element: Element): HoverCandidate | null {
    if (!element.isConnected) {
      this.cache.delete(element)
      return null
    }
    const kind = mediaKindOf(element)
    if (kind === null) return null

    const metric = measureElement(element)
    if (!isEligibleMediaSize(metric.width, metric.height)) return null

    // The creative-asset gate. It runs before the address ladder because it is
    // the cheapest rejection and the one that decides the product behaviour: a
    // 600px profile avatar is a perfectly resolvable media address that must
    // still never raise the capsule.
    if (!isPostOrWorkMedia(element, this.pageHost())) {
      this.cache.delete(element)
      return null
    }

    const viewport = this.env.viewport()
    if (!isElementInViewport(this.rectOf(element), viewport.width, viewport.height)) return null

    // The cheap identity probe: same ladder as the payload, minus the canvas
    // capture, because this runs on every pointer move and a frame grab does not.
    const src = resolveMediaSource(element, kind, this.baseUrl(), false).src
    if (src === '') return null

    const facts: MediaFacts = {
      src,
      width: Math.round(metric.width),
      height: Math.round(metric.height),
      naturalWidth: 0,
      naturalHeight: 0,
    }
    const cached = this.cache.get(element)
    if (cached !== undefined && !cached.disabled && matchesFacts(cached.payload, facts)) {
      cached.lastSeenAt = this.env.now()
      return cached
    }

    const payload = normalizeMedia(element, kind, this.baseUrl())
    if (payload === null) return null

    const candidate: HoverCandidate = {
      element,
      payload,
      lastSeenAt: this.env.now(),
      disabled: false,
    }
    this.cache.set(element, candidate)
    return candidate
  }

  private baseUrl(): string {
    return this.doc?.location?.href ?? (typeof location === 'undefined' ? '' : location.href)
  }
}

/** Whether a cached payload still matches the element's current facts. */
function matchesFacts(payload: HoveredMedia, facts: MediaFacts): boolean {
  if (payload.width !== facts.width || payload.height !== facts.height) return false
  if (payload.id === mediaIdOf(payload.type, facts.src)) return true
  // A video whose only identity is a captured frame has no cheap address to
  // compare against, so the element-keyed cache wins instead of the ladder
  // re-encoding the same frame on every pointer move.
  return payload.sourceKind === 'frame'
}

/** Walks up from a node looking for a media ancestor (light DOM only). */
function nearestMediaAncestor(element: Element): Element | null {
  let node: Element | null = element
  for (let depth = 0; node !== null && depth < 20; depth += 1) {
    if (node.localName === 'img' || node.localName === 'video') return node
    node = node.parentElement
  }
  return null
}
