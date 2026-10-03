// @vitest-environment jsdom
/**
 * Video / image anchor differentiation.
 *
 * A video's bottom-left corner belongs to the player's play control, so the
 * video capsule lives in the top-right corner instead: these cases pin that
 * corner, its 14px insets, the bounded step left of a measured top-right
 * control, the right-edge pinning that makes stage two open leftwards, and the
 * fact that an image keeps the placement it has always had.
 */
import { describe, expect, it } from 'vitest'
import { CAPSULE_SPEC, IMAGE_ANCHOR_POLICY, VIDEO_ANCHOR_SPEC, computeCapsuleGeometry } from '../src/content/media-hover/messages.ts'
import {
  UNMEASURED_CONTROL,
  VideoAnchorProbe,
  isControlSizedElement,
  probePlayControl,
  resolveCapsuleAnchor,
} from '../src/content/media-hover/video-anchor.ts'
import type { AnchorRect } from '../src/content/media-hover/types.ts'

const VIEWPORT = { width: 1280, height: 800 }

function rect(left: number, top: number, width: number, height: number): AnchorRect {
  return { left, top, right: left + width, bottom: top + height, width, height }
}

/** A control element with a declared box, as the probe would hit it. */
function appendControl(left: number, top: number, width: number, height: number, tag = 'button'): Element {
  const control = document.createElement(tag)
  if (tag === 'a') control.setAttribute('href', '/player')
  document.body.appendChild(control)
  control.getBoundingClientRect = () => ({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  }) as DOMRect
  return control
}

describe('video anchor policy', () => {
  const video = rect(0, 0, 640, 360)

  it('anchors the video pill to the top-right corner by default', () => {
    const policy = resolveCapsuleAnchor(video, 'video', UNMEASURED_CONTROL)
    expect(policy.corner).toBe('top-right')
    expect(policy.offsetX).toBe(14)
    expect(policy.offsetY).toBe(14)
    expect(policy.overflow).toBe('clamp')
    expect(VIDEO_ANCHOR_SPEC.offsetX).toBe(14)
    expect(VIDEO_ANCHOR_SPEC.offsetY).toBe(14)
    expect(VIDEO_ANCHOR_SPEC.offsetXRange).toEqual([14, 96])
  })

  it('steps left of a measured top-right control without overlapping it', () => {
    // A 32px control at x 596..628 sits under the probe point: the pill's right
    // edge lands at 596 - clearance, i.e. an inset of 44 + clearance.
    const policy = resolveCapsuleAnchor(video, 'video', {
      controlLeft: 596,
      measured: true,
    })
    expect(policy.offsetX).toBe(video.right - 596 + VIDEO_ANCHOR_SPEC.minClearance)
    expect(VIDEO_ANCHOR_SPEC.minClearance).toBeGreaterThan(0)
  })

  it('keeps the right inset inside the band whatever a probe reports', () => {
    const [min, max] = VIDEO_ANCHOR_SPEC.offsetXRange
    for (const controlLeft of [640, 630, 600, 560, 400, 0]) {
      const policy = resolveCapsuleAnchor(video, 'video', { controlLeft, measured: true })
      expect(policy.offsetX).toBeGreaterThanOrEqual(min)
      expect(policy.offsetX).toBeLessThanOrEqual(max)
      expect(policy.offsetY).toBe(VIDEO_ANCHOR_SPEC.offsetY)
    }
  })

  it('leaves the image placement untouched', () => {
    const policy = resolveCapsuleAnchor(video, 'image')
    expect(policy).toEqual(IMAGE_ANCHOR_POLICY)
    expect(policy.corner ?? 'bottom-left').toBe('bottom-left')
    expect(policy.offsetX).toBe(CAPSULE_SPEC.inset)
    expect(policy.offsetY).toBe(CAPSULE_SPEC.inset)
    expect(policy.overflow).toBe('mirror')
  })
})

describe('geometry with an anchor policy', () => {
  const metrics = { width: CAPSULE_SPEC.width, height: CAPSULE_SPEC.height }

  it('paints the video pill in the top-right corner, pinned by its right edge', () => {
    const anchor = rect(100, 100, 640, 360)
    const geometry = computeCapsuleGeometry(
      anchor,
      metrics,
      VIEWPORT.width,
      VIEWPORT.height,
      resolveCapsuleAnchor(anchor, 'video', UNMEASURED_CONTROL),
    )
    expect(geometry.edge).toBe('right')
    expect(geometry.alignment).toBe('right')
    // Right edge of the reserved footprint sits 14px in from the media's right edge.
    expect(geometry.left + CAPSULE_SPEC.width).toBe(anchor.right - 14)
    // Top edge sits 14px below the media's top edge, far from the bottom controls.
    expect(geometry.top).toBe(anchor.top + 14)
    expect(geometry.top + CAPSULE_SPEC.height).toBeLessThan(anchor.bottom - 48)
  })

  it('keeps the top-right pill inside the viewport', () => {
    for (const [left, top] of [[0, 100], [700, -200], [1200, 100], [-500, 50]]) {
      const anchor = rect(left, top, 640, 360)
      const policy = resolveCapsuleAnchor(anchor, 'video', UNMEASURED_CONTROL)
      const geometry = computeCapsuleGeometry(anchor, metrics, VIEWPORT.width, VIEWPORT.height, policy)
      expect(geometry.left).toBeGreaterThanOrEqual(CAPSULE_SPEC.edgeMargin)
      expect(geometry.left + CAPSULE_SPEC.width)
        .toBeLessThanOrEqual(VIEWPORT.width - CAPSULE_SPEC.edgeMargin)
      expect(geometry.top).toBeGreaterThanOrEqual(CAPSULE_SPEC.edgeMargin)
      expect(geometry.top + CAPSULE_SPEC.height)
        .toBeLessThanOrEqual(VIEWPORT.height - CAPSULE_SPEC.edgeMargin)
    }
  })

  it('keeps the historical image placement byte-for-byte', () => {
    const anchor = rect(200, 100, 640, 360)
    const geometry = computeCapsuleGeometry(anchor, metrics, VIEWPORT.width, VIEWPORT.height)
    expect(geometry.left).toBe(anchor.left + CAPSULE_SPEC.inset)
    expect(geometry.top).toBe(anchor.bottom - CAPSULE_SPEC.inset - CAPSULE_SPEC.height)
    expect(geometry.alignment).toBe('left')
    expect(geometry.edge).toBe('left')
  })

  it('still mirrors an image at the right edge', () => {
    const anchor = rect(1240, 100, 36, 300)
    const geometry = computeCapsuleGeometry(anchor, metrics, VIEWPORT.width, VIEWPORT.height)
    expect(geometry.alignment).toBe('right')
    expect(geometry.edge).toBe('left')
    expect(geometry.left).toBe(anchor.right - CAPSULE_SPEC.inset - CAPSULE_SPEC.width)
  })
})

describe('top-right control probe', () => {
  it('probes the top-right corner and reads the control under it', () => {
    const media = document.createElement('video')
    document.body.appendChild(media)
    const anchor = rect(100, 100, 600, 340)
    const help = appendControl(660, 108, 32, 32)
    const points: Array<[number, number]> = []

    const probe = probePlayControl(media, anchor, (x, y) => { points.push([x, y]); return help })
    expect(points).toEqual([[anchor.right - VIDEO_ANCHOR_SPEC.probeInsetX, anchor.top + VIDEO_ANCHOR_SPEC.probeInsetY]])
    expect(probe.measured).toBe(true)
    expect(probe.controlLeft).toBe(660)
  })

  it('reports nothing when the hit is the media itself', () => {
    const media = document.createElement('video')
    document.body.appendChild(media)
    const probe = probePlayControl(media, rect(0, 0, 600, 340), () => media)
    expect(probe.measured).toBe(false)
  })

  it('ignores a hit that is not control-shaped', () => {
    const media = document.createElement('video')
    document.body.appendChild(media)
    const poster = document.createElement('img')
    poster.setAttribute('src', 'https://cdn.example.com/p.png')
    document.body.appendChild(poster)
    poster.getBoundingClientRect = () => ({
      x: 200, y: 0, left: 200, top: 0, right: 600, bottom: 300,
      width: 400, height: 300, toJSON: () => ({}),
    }) as DOMRect
    expect(probePlayControl(media, rect(0, 0, 600, 340), () => poster).measured).toBe(false)
    expect(isControlSizedElement(poster)).toBe(false)
  })

  it('ignores a control that sits outside the media box', () => {
    const media = document.createElement('video')
    document.body.appendChild(media)
    const far = appendControl(900, 700, 40, 40)
    expect(probePlayControl(media, rect(0, 0, 600, 340), () => far).measured).toBe(false)
  })

  it('treats a missing hit test as no measurement', () => {
    const media = document.createElement('video')
    document.body.appendChild(media)
    expect(probePlayControl(media, rect(0, 0, 600, 340), null).measured).toBe(false)
  })
})

describe('probe cache', () => {
  it('measures once per media per cache window', () => {
    const media = document.createElement('video')
    document.body.appendChild(media)
    const anchor = rect(0, 0, 600, 340)
    let calls = 0
    let now = 1_000
    const cache = new VideoAnchorProbe(() => { calls += 1; return null }, () => now)

    cache.probe(media, anchor)
    cache.probe(media, anchor)
    cache.probe(media, anchor)
    expect(calls).toBe(1)

    now += VIDEO_ANCHOR_SPEC.cacheMs + 1
    cache.probe(media, anchor)
    expect(calls).toBe(2)
  })

  it('re-measures as soon as the media resizes', () => {
    const media = document.createElement('video')
    document.body.appendChild(media)
    let calls = 0
    const cache = new VideoAnchorProbe(() => { calls += 1; return null }, () => 1_000)

    cache.probe(media, rect(0, 0, 600, 340))
    cache.probe(media, rect(0, 0, 600, 500))
    expect(calls).toBe(2)
  })
})
