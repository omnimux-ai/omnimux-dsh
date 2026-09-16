/**
 * Card-region resolver: the single bounding authority that keeps the capsule
 * alive while the pointer interacts with a media card.
 *
 * Moving inside this region never hides the capsule; leaving it is the only
 * pointer-driven hide signal.
 *
 * @module
 */

import { HOVER_REGION } from './messages.ts'
import type { AnchorRect, MediaKind } from './types.ts'

/** Axis-aligned bounding box in viewport coordinates. */
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Converts an AnchorRect or any {left, top, right, bottom} object into a Box. */
export function boxOf(rect: AnchorRect | DOMRect): Box {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  }
}

/** Inflates a box uniformly by `pad` CSS pixels. */
export function inflateBox(box: Box, pad: number): Box {
  return {
    left: box.left - pad,
    top: box.top - pad,
    right: box.right + pad,
    bottom: box.bottom + pad,
  }
}

/** Merges two boxes into their minimal bounding union. */
export function unionBox(a: Box, b: Box): Box {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  }
}

/** Whether a viewport point falls inside the given box. */
export function boxContains(box: Box, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
}

/**
 * Finds the nearest enclosing card-like container ancestor for a media element.
 *
 * Walks up `parentElement` (crossing at most one shadow root) bounded by
 * {@link HOVER_REGION.maxAncestorDepth}. Stops when reaching a skippable element
 * or an element that exceeds the bounded card size ratio.
 */
export function resolveCardContainer(media: Element, rect: AnchorRect): Element | null {
  let node: Element | null = media.parentElement
  if (node === null) {
    const root = media.getRootNode()
    if (root instanceof ShadowRoot && root.host instanceof Element) {
      node = root.host
    }
  }

  const slack = HOVER_REGION.ancestorSlackPx
  const maxW = Math.max(rect.width, 1) * HOVER_REGION.ancestorMaxScale + HOVER_REGION.ancestorMaxExtraPx
  const maxH = Math.max(rect.height, 1) * HOVER_REGION.ancestorMaxScale + HOVER_REGION.ancestorMaxExtraPx

  for (let depth = 0; node !== null && depth < HOVER_REGION.maxAncestorDepth; depth += 1) {
    const tag = node.localName
    if (tag === 'html' || tag === 'body' || tag === 'head') break

    const box = node.getBoundingClientRect()
    if (box.width > 0 && box.height > 0) {
      // If the ancestor already exceeds the card scale ceiling, do not climb further.
      if (box.width > maxW || box.height > maxH) {
        break
      }

      // Check whether this ancestor bounds the media within tolerance.
      const containsMedia =
        box.left <= rect.left + slack &&
        box.top <= rect.top + slack &&
        box.right >= rect.right - slack &&
        box.bottom >= rect.bottom - slack

      if (containsMedia) {
        return node
      }
    }

    const nextParent: Element | null = node.parentElement
    if (nextParent !== null) {
      node = nextParent
    } else {
      const root = node.getRootNode()
      node = root instanceof ShadowRoot && root.host instanceof Element ? root.host : null
    }
  }

  return null
}

/**
 * Per-element card container probe with a bounded cache.
 * Re-measures on element size change or when the cache entry expires.
 */
export class CardRegionProbe {
  private readonly cache = new WeakMap<
    Element,
    { container: Element | null; at: number; width: number; height: number }
  >()
  private readonly now: () => number

  constructor(now: () => number = () => Date.now()) {
    this.now = now
  }

  /** Resolves and memoises the enclosing card container. */
  container(media: Element, rect: AnchorRect): Element | null {
    const at = this.now()
    const width = Math.round(rect.width)
    const height = Math.round(rect.height)
    const cached = this.cache.get(media)
    if (
      cached !== undefined &&
      at - cached.at < HOVER_REGION.cacheMs &&
      cached.width === width &&
      cached.height === height
    ) {
      return cached.container
    }

    const container = resolveCardContainer(media, rect)
    this.cache.set(media, { container, at, width, height })
    return container
  }

  /** Resolves the complete unified hover region for the given media element. */
  region(
    media: Element,
    kind: MediaKind,
    rect: AnchorRect,
    capsuleElement?: Element | null,
  ): Box {
    return resolveCardRegion(media, kind, rect, capsuleElement, this)
  }
}

/**
 * Calculates the total hover active region:
 * media rect + HOVER_REGION.pad
 * ∪ card container rect (for video)
 * ∪ capsule rect + HOVER_REGION.capsulePad (when visible)
 */
export function resolveCardRegion(
  media: Element,
  kind: MediaKind,
  rect: AnchorRect,
  capsuleElement?: Element | null,
  probe?: CardRegionProbe,
): Box {
  // Video bottom controls bar (play/pause, timeline, scrubber) gets a default 48px buffer
  // even if no wrapping card ancestor is found, preventing misjudgment on bare videos.
  const padBottom = kind === 'video' ? 48 : HOVER_REGION.pad
  let region: Box = {
    left: rect.left - HOVER_REGION.pad,
    top: rect.top - HOVER_REGION.pad,
    right: rect.right + HOVER_REGION.pad,
    bottom: rect.bottom + padBottom,
  }

  if (kind === 'video') {
    const container = probe ? probe.container(media, rect) : resolveCardContainer(media, rect)
    if (container !== null && container.isConnected) {
      const cBox = boxOf(container.getBoundingClientRect())
      if (cBox.right > cBox.left && cBox.bottom > cBox.top) {
        region = unionBox(region, cBox)
      }
    }
  }

  if (capsuleElement && capsuleElement.isConnected) {
    const capBox = boxOf(capsuleElement.getBoundingClientRect())
    if (capBox.right > capBox.left && capBox.bottom > capBox.top) {
      region = unionBox(region, inflateBox(capBox, HOVER_REGION.capsulePad))
    }
  }

  return region
}
