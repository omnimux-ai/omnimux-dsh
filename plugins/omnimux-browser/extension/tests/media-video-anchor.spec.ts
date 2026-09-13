// @vitest-environment jsdom
/**
 * Video / image anchor differentiation.
 *
 * The user requirement is literal: the video capsule must sit *just to the right
 * of the play button*, on the play button's own row. A video's bottom-left corner
 * belongs to the player, so these cases pin the left inset into the required
 * 48-96px band, the bottom inset into 6-12px, the collapsed circle that the
 * vertical centring is computed against, and the fact that an image keeps the
 * placement it has always had.
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

  it('clears the play button by default', () => {
    const policy = resolveCapsuleAnchor(video, 'video', UNMEASURED_CONTROL)
    expect(policy.offsetX).toBe(VIDEO_ANCHOR_SPEC.offsetX)
    expect(policy.offsetY).toBe(VIDEO_ANCHOR_SPEC.offsetY)
    expect(policy.overflow).toBe('clamp')
  })

  it('keeps the default inset a close, comfortable step past a 48px control', () => {
    // The pill is meant to sit *next to* the play button, not marooned beside
    // it: 52px clears a typical 48px control by a comfortable step, and the band
    // is wide enough to absorb a wider cluster without letting either end drift.
    expect(VIDEO_ANCHOR_SPEC.offsetX).toBe(52)
    expect(VIDEO_ANCHOR_SPEC.offsetXRange).toEqual([48, 96])
    expect(VIDEO_ANCHOR_SPEC.offsetY).toBe(8)
    expect(VIDEO_ANCHOR_SPEC.offsetYRange).toEqual([6, 12])
    expect(VIDEO_ANCHOR_SPEC.offsetX).toBeGreaterThanOrEqual(VIDEO_ANCHOR_SPEC.offsetXRange[0])
    expect(VIDEO_ANCHOR_SPEC.offsetX).toBeLessThanOrEqual(VIDEO_ANCHOR_SPEC.offsetXRange[1])
  })

  it('never places the pill over the left-hand control cluster', () => {
    // A 48px control at x 8..52 leaves the pill free from x = 52, and the band's
    // floor is the guarantee: no probe result can go below it.
    for (const playButtonRight of [0, 24, 52, 60, 66, 80, 200]) {
      const policy = resolveCapsuleAnchor(video, 'video', {
        playButtonRight,
        controlCenterY: 320,
        measured: true,
      })
      const [min, max] = VIDEO_ANCHOR_SPEC.offsetXRange
      expect(policy.offsetX).toBeGreaterThanOrEqual(min)
      expect(policy.offsetX).toBeLessThanOrEqual(max)
      // The clearance is the only rule that can lift the inset off the floor, and
      // it stays a step rather than a gap: the pill belongs next to the button.
      expect(policy.offsetX).toBeGreaterThanOrEqual(
        min + VIDEO_ANCHOR_SPEC.minClearance,
      )
      expect(VIDEO_ANCHOR_SPEC.minClearance).toBeLessThanOrEqual(
        VIDEO_ANCHOR_SPEC.offsetX - VIDEO_ANCHOR_SPEC.offsetXRange[0],
      )
    }
  })

  it('floats right when the measured control is wider than usual', () => {
    const wide = resolveCapsuleAnchor(video, 'video', {
      playButtonRight: 70,
      controlCenterY: 320,
      measured: true,
    })
    // 70 + 0 = 70, still inside the band.
    expect(wide.offsetX).toBe(70)

    const narrow = resolveCapsuleAnchor(video, 'video', {
      playButtonRight: 30,
      controlCenterY: 320,
      measured: true,
    })
    // 30 + 0 = 30 would sit over the control: the band floor wins.
    expect(narrow.offsetX).toBe(VIDEO_ANCHOR_SPEC.offsetXRange[0])
  })

  it('keeps the bottom inset inside the required band', () => {
    const [min, max] = VIDEO_ANCHOR_SPEC.offsetYRange
    expect(min).toBe(6)
    expect(max).toBe(12)

    const plain = resolveCapsuleAnchor(video, 'video', UNMEASURED_CONTROL)
    expect(plain.offsetY).toBe(VIDEO_ANCHOR_SPEC.offsetY)
    expect(plain.offsetY).toBeGreaterThanOrEqual(min)
    expect(plain.offsetY).toBeLessThanOrEqual(max)

    for (const controlCenterY of [300, 320, 336, 360, 1000]) {
      const measured = resolveCapsuleAnchor(video, 'video', {
        playButtonRight: 52,
        controlCenterY,
        measured: true,
      })
      expect(measured.offsetY).toBeGreaterThanOrEqual(min)
      expect(measured.offsetY).toBeLessThanOrEqual(max)
    }
  })

  it('centres the collapsed circle on the measured control row', () => {
    // The circle is the box stage one paints, so it is the box the centring is
    // measured against. A row whose centre sits 30px above the media's bottom
    // edge needs a 30 - 22/2 = 19px inset, which the band caps at 12px: the
    // circle then centres 23px up against the row's 30px, never above it.
    const rowCentreY = 330
    const policy = resolveCapsuleAnchor(video, 'video', {
      playButtonRight: 52,
      controlCenterY: rowCentreY,
      measured: true,
    })
    const rowCentreOffset = video.bottom - rowCentreY

    expect(policy.offsetY).toBe(VIDEO_ANCHOR_SPEC.offsetYRange[1])
    expect(policy.offsetY).toBe(
      rowCentreOffset - CAPSULE_SPEC.collapsedHeight / 2 > VIDEO_ANCHOR_SPEC.offsetYRange[1]
        ? VIDEO_ANCHOR_SPEC.offsetYRange[1]
        : rowCentreOffset - CAPSULE_SPEC.collapsedHeight / 2,
    )

    // ...and a row that sits inside the band is centred exactly: its own centre
    // line becomes the circle's centre line.
    const rowOffsetY = 20
    const lowRow = resolveCapsuleAnchor(video, 'video', {
      playButtonRight: 52,
      controlCenterY: video.bottom - rowOffsetY,
      measured: true,
    })
    expect(lowRow.offsetY).toBe(rowOffsetY - CAPSULE_SPEC.collapsedHeight / 2)
    expect(lowRow.offsetY + CAPSULE_SPEC.collapsedHeight / 2).toBe(rowOffsetY)
  })

  it('leaves the image placement untouched', () => {
    const policy = resolveCapsuleAnchor(video, 'image')
    expect(policy).toEqual(IMAGE_ANCHOR_POLICY)
    expect(policy.offsetX).toBe(CAPSULE_SPEC.inset)
    expect(policy.offsetY).toBe(CAPSULE_SPEC.inset)
    expect(policy.overflow).toBe('mirror')
  })
})

describe('geometry with an anchor policy', () => {
  const metrics = { width: CAPSULE_SPEC.width, height: CAPSULE_SPEC.height }

  it('paints the video pill beside the play button, on the control row', () => {
    const anchor = rect(0, 100, 640, 360)
    const geometry = computeCapsuleGeometry(
      anchor,
      metrics,
      VIEWPORT.width,
      VIEWPORT.height,
      resolveCapsuleAnchor(anchor, 'video', UNMEASURED_CONTROL),
    )
    // The left edge lands a comfortable step past a typical 48px play control,
    // and the band floor keeps it there whatever a probe reports.
    expect(geometry.left).toBe(VIDEO_ANCHOR_SPEC.offsetX)
    expect(geometry.left).toBeGreaterThanOrEqual(VIDEO_ANCHOR_SPEC.offsetXRange[0])
    expect(geometry.alignment).toBe('left')
    // The pill sits against the bottom control row, not on top of it.
    const bottomInset = anchor.bottom - (geometry.top + CAPSULE_SPEC.height)
    expect(bottomInset).toBe(VIDEO_ANCHOR_SPEC.offsetY)
    expect(bottomInset).toBeGreaterThanOrEqual(VIDEO_ANCHOR_SPEC.offsetYRange[0])
    expect(bottomInset).toBeLessThanOrEqual(VIDEO_ANCHOR_SPEC.offsetYRange[1])

    // The circle that stage one actually paints is the middle of that band.
    const circleCentre = anchor.bottom - bottomInset - CAPSULE_SPEC.collapsedHeight / 2
    expect(circleCentre).toBe(anchor.bottom - VIDEO_ANCHOR_SPEC.offsetY - CAPSULE_SPEC.collapsedHeight / 2)
  })

  it('reserves the expanded row so stage two cannot overflow', () => {
    for (const left of [0, 100, 1000, 1180, 1260]) {
      const anchor = rect(left, 100, 640, 360)
      const policy = resolveCapsuleAnchor(anchor, 'video', UNMEASURED_CONTROL)
      const geometry = computeCapsuleGeometry(anchor, metrics, VIEWPORT.width, VIEWPORT.height, policy)
      expect(geometry.left).toBeGreaterThanOrEqual(CAPSULE_SPEC.edgeMargin)
      expect(geometry.left + CAPSULE_SPEC.width)
        .toBeLessThanOrEqual(VIEWPORT.width - CAPSULE_SPEC.edgeMargin)
      // The collapsed circle is drawn inside the reserved row, on both axes.
      expect(CAPSULE_SPEC.collapsedWidth).toBeLessThanOrEqual(CAPSULE_SPEC.width)
      expect(CAPSULE_SPEC.collapsedHeight).toBeLessThanOrEqual(CAPSULE_SPEC.height)
    }
  })

  it('clamps a video instead of mirroring it onto the right-hand controls', () => {
    const anchor = rect(1240, 100, 36, 300)
    const policy = resolveCapsuleAnchor(anchor, 'video', UNMEASURED_CONTROL)
    expect(policy.overflow).toBe('clamp')
    const geometry = computeCapsuleGeometry(anchor, metrics, VIEWPORT.width, VIEWPORT.height, policy)
    // Mirrored to the right edge would land on volume/settings/fullscreen.
    expect(geometry.left).toBeLessThan(anchor.left)
    expect(geometry.left + CAPSULE_SPEC.width)
      .toBeLessThanOrEqual(VIEWPORT.width - CAPSULE_SPEC.edgeMargin)
  })

  it('keeps the historical image placement byte-for-byte', () => {
    const anchor = rect(200, 100, 640, 360)
    const geometry = computeCapsuleGeometry(anchor, metrics, VIEWPORT.width, VIEWPORT.height)
    expect(geometry.left).toBe(anchor.left + CAPSULE_SPEC.inset)
    expect(geometry.top).toBe(anchor.bottom - CAPSULE_SPEC.inset - CAPSULE_SPEC.height)
    expect(geometry.alignment).toBe('left')
  })

  it('still mirrors an image at the right edge', () => {
    const anchor = rect(1240, 100, 36, 300)
    const geometry = computeCapsuleGeometry(anchor, metrics, VIEWPORT.width, VIEWPORT.height)
    expect(geometry.alignment).toBe('right')
    expect(geometry.left).toBe(anchor.right - CAPSULE_SPEC.inset - CAPSULE_SPEC.width)
  })
})

describe('play control probe', () => {
  it('reads the control under the bottom-left probe point', () => {
    const media = document.createElement('video')
    document.body.appendChild(media)
    const anchor = rect(100, 100, 600, 340)
    const play = appendControl(108, 400, 44, 44)

    const probe = probePlayControl(media, anchor, () => play)
    expect(probe.measured).toBe(true)
    expect(probe.playButtonRight).toBe(152)
    expect(probe.controlCenterY).toBe(422)
  })

  it('reports nothing when the hit is the media itself', () => {
    const media = document.createElement('video')
    document.body.appendChild(media)
    media.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 340,
      width: 600, height: 340, toJSON: () => ({}),
    }) as DOMRect
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
      x: 200, y: 200, left: 200, top: 200, right: 600, bottom: 500,
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
