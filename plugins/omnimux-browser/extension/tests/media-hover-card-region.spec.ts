// @vitest-environment jsdom
/**
 * Tests for card-region hover lock and jitter-free visibility guarantees (Issue #2058).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOVER_REGION, TIMING } from '../src/content/media-hover/messages.ts'
import {
  CardRegionProbe,
  boxContains,
  resolveCardContainer,
  resolveCardRegion,
} from '../src/content/media-hover/card-region.ts'
import {
  MEDIA_OVERLAY_HOST_ID,
  MediaOverlay,
  initMediaHoverOverlay,
} from '../src/content/media-hover/overlay.ts'
import type { AnchorRect, HoverCandidate } from '../src/content/media-hover/types.ts'

const HANDLE = '__dshBrowserMediaOverlay'

function shadowOf(host: Element): ShadowRoot {
  const shadow = host.shadowRoot
  if (shadow === null) throw new Error('host has no shadow root')
  return shadow
}

function mountedCapsule(): {
  overlay: MediaOverlay
  host: HTMLElement
  capsule: HTMLElement
  brand: HTMLButtonElement
  tooltip: HTMLElement
} {
  const overlay = initMediaHoverOverlay(document)
  overlay.setEnabled(true)
  const host = document.getElementById(MEDIA_OVERLAY_HOST_ID) as HTMLElement
  const shadow = shadowOf(host)
  const capsule = shadow.querySelector('.omnimux-capsule-bar') as HTMLElement
  const brand = shadow.querySelector('.omnimux-capsule-brand') as HTMLButtonElement
  const tooltip = shadow.querySelector('.white-tooltip') as HTMLElement
  capsule.classList.add('is-visible')
  return { overlay, host, capsule, brand, tooltip }
}

beforeEach(() => {
  document.body.innerHTML = ''
  document.documentElement.querySelectorAll(`#${MEDIA_OVERLAY_HOST_ID}`).forEach((node) => node.remove())
  if (typeof (globalThis as any).PointerEvent === 'undefined') {
    ;(globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {}
  }
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
  })
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[HANDLE]
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('card-region resolver & caching', () => {
  it('resolves enclosing card container within bounded ratio', () => {
    const card = document.createElement('div')
    card.className = 'post-card'
    const video = document.createElement('video')
    card.appendChild(video)
    document.body.appendChild(card)

    const vRect: AnchorRect = { left: 100, top: 100, right: 700, bottom: 500, width: 600, height: 400 }
    vi.spyOn(video, 'getBoundingClientRect').mockReturnValue(vRect as DOMRect)
    // Card bounds video with 20px padding (740x440)
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      left: 80,
      top: 80,
      right: 720,
      bottom: 520,
      width: 640,
      height: 440,
    } as DOMRect)

    const container = resolveCardContainer(video, vRect)
    expect(container).toBe(card)

    const region = resolveCardRegion(video, 'video', vRect)
    expect(region.left).toBe(80)
    expect(region.top).toBe(80)
    expect(region.right).toBe(720)
    // 548 reflects union of card container (520) and video bottom 48px control buffer (500 + 48)
    expect(region.bottom).toBe(548)
    expect(boxContains(region, 200, 200)).toBe(true)
    expect(boxContains(region, 750, 200)).toBe(false)
  })

  it('rejects oversized full-page ancestor containers', () => {
    const hugePage = document.createElement('div')
    hugePage.className = 'huge-scroller'
    const video = document.createElement('video')
    hugePage.appendChild(video)
    document.body.appendChild(hugePage)

    const vRect: AnchorRect = { left: 100, top: 100, right: 300, bottom: 300, width: 200, height: 200 }
    // Container is 2000x2000, which exceeds 200 * 1.5 + 64 = 364
    vi.spyOn(hugePage, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 2000,
      bottom: 2000,
      width: 2000,
      height: 2000,
    } as DOMRect)

    const container = resolveCardContainer(video, vRect)
    expect(container).toBeNull()

    // Falls back to media rect + pad
    const region = resolveCardRegion(video, 'video', vRect)
    expect(region.left).toBe(vRect.left - HOVER_REGION.pad)
    expect(region.right).toBe(vRect.right + HOVER_REGION.pad)
  })

  it('caches container probe and invalidates on element size change', () => {
    let now = 1000
    const probe = new CardRegionProbe(() => now)
    const card = document.createElement('div')
    const video = document.createElement('video')
    card.appendChild(video)
    document.body.appendChild(card)

    const vRect: AnchorRect = { left: 100, top: 100, right: 500, bottom: 400, width: 400, height: 300 }
    const spy = vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      left: 90,
      top: 90,
      right: 510,
      bottom: 410,
      width: 420,
      height: 320,
    } as DOMRect)

    const c1 = probe.container(video, vRect)
    expect(c1).toBe(card)
    expect(spy).toHaveBeenCalledTimes(1)

    // Call again with same size -> memoised
    const c2 = probe.container(video, vRect)
    expect(c2).toBe(card)
    expect(spy).toHaveBeenCalledTimes(1)

    // Size changes -> cache invalidation
    const changedRect: AnchorRect = { ...vRect, width: 450 }
    probe.container(video, changedRect)
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

describe('overlay card-region visibility contract', () => {
  it('keeps capsule visible when pointer moves in card padding or controls bar', () => {
    vi.useFakeTimers()
    const { overlay, capsule } = mountedCapsule()

    const card = document.createElement('div')
    card.className = 'card'
    const video = document.createElement('video')
    card.appendChild(video)
    document.body.appendChild(card)

    const vRect: AnchorRect = { left: 100, top: 100, right: 700, bottom: 450, width: 600, height: 350 }
    const cRect = { left: 80, top: 80, right: 720, bottom: 510, width: 640, height: 430 } // extra padding & bottom bar

    vi.spyOn(video, 'getBoundingClientRect').mockReturnValue(vRect as DOMRect)
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(cRect as DOMRect)

    // Emulate candidate show
    const candidate: HoverCandidate = {
      element: video,
      payload: {
        id: 'video_card_test_01',
        type: 'video',
        src: 'https://example.com/test.mp4',
        previewSrc: 'https://example.com/test.mp4',
        pageUrl: 'https://example.com',
        pageTitle: 'Test',
        width: 600,
        height: 350,
        naturalWidth: 1920,
        naturalHeight: 1080,
        alt: '',
        capturedAt: Date.now(),
      },
      lastSeenAt: Date.now(),
      disabled: false,
    }
    overlay['handleCandidate'](candidate)
    vi.advanceTimersByTime(TIMING.enterDebounce + 50)
    expect(capsule.classList.contains('is-visible')).toBe(true)

    // 1. Pointer moves to right padding area (outside video rect, inside card rect)
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 710,
        clientY: 250,
        bubbles: true,
      }),
    )
    vi.advanceTimersByTime(TIMING.leaveGrace + 50)
    expect(capsule.classList.contains('is-visible')).toBe(true)

    // 2. Pointer moves to bottom control bar area (y = 490, outside video rect, inside card rect)
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 400,
        clientY: 490,
        bubbles: true,
      }),
    )
    vi.advanceTimersByTime(TIMING.leaveGrace + 50)
    expect(capsule.classList.contains('is-visible')).toBe(true)

    // 3. leftmedia event from detector does NOT hide capsule while pointer stays in card
    overlay['handleInvalidate']('leftmedia')
    vi.advanceTimersByTime(TIMING.leaveGrace + 50)
    expect(capsule.classList.contains('is-visible')).toBe(true)

    // 4. Pointer truly leaves card (x = 850, y = 600)
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 850,
        clientY: 600,
        bubbles: true,
      }),
    )
    vi.advanceTimersByTime(TIMING.leaveGrace + 50)
    expect(capsule.classList.contains('is-visible')).toBe(false)

    overlay.dispose()
  })

  it('preserves capsule visibility on resting pointer (idle timer collapses stage two without hiding)', () => {
    vi.useFakeTimers()
    const { overlay, capsule } = mountedCapsule()

    const video = document.createElement('video')
    document.body.appendChild(video)
    const vRect: AnchorRect = { left: 100, top: 100, right: 600, bottom: 400, width: 500, height: 300 }
    vi.spyOn(video, 'getBoundingClientRect').mockReturnValue(vRect as DOMRect)

    const candidate: HoverCandidate = {
      element: video,
      payload: {
        id: 'idle_video_test',
        type: 'video',
        src: 'https://example.com/idle.mp4',
        previewSrc: 'https://example.com/idle.mp4',
        pageUrl: 'https://example.com',
        pageTitle: 'Test',
        width: 500,
        height: 300,
        naturalWidth: 1280,
        naturalHeight: 720,
        alt: '',
        capturedAt: Date.now(),
      },
      lastSeenAt: Date.now(),
      disabled: false,
    }
    overlay['handleCandidate'](candidate)
    vi.advanceTimersByTime(TIMING.enterDebounce + 50)
    expect(capsule.classList.contains('is-visible')).toBe(true)

    // User rests cursor at (300, 200) inside video
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 300,
        clientY: 200,
        bubbles: true,
      }),
    )
    // Advance past idle dismiss window (3500ms)
    vi.advanceTimersByTime(TIMING.idleDismiss + 200)

    // Capsule MUST remain visible, not disappear
    expect(capsule.classList.contains('is-visible')).toBe(true)
    expect(capsule.classList.contains('is-collapsed')).toBe(true)

    overlay.dispose()
  })

  it('immediately hides on true teardown signals (blur, disconnect)', () => {
    const { overlay, capsule } = mountedCapsule()
    const video = document.createElement('video')
    document.body.appendChild(video)
    vi.spyOn(video, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      right: 500,
      bottom: 400,
      width: 400,
      height: 300,
    } as DOMRect)

    const candidate: HoverCandidate = {
      element: video,
      payload: {
        id: 'teardown_test',
        type: 'video',
        src: 'https://example.com/t.mp4',
        previewSrc: 'https://example.com/t.mp4',
        pageUrl: 'https://example.com',
        pageTitle: 'Test',
        width: 400,
        height: 300,
        naturalWidth: 800,
        naturalHeight: 600,
        alt: '',
        capturedAt: Date.now(),
      },
      lastSeenAt: Date.now(),
      disabled: false,
    }
    overlay['handleCandidate'](candidate)
    capsule.classList.add('is-visible')

    // Window blur must tear down immediately
    window.dispatchEvent(new Event('blur'))
    expect(capsule.classList.contains('is-visible')).toBe(false)

    overlay.dispose()
  })
})
