// @vitest-environment jsdom
/**
 * Tests for video hover toolbar visibility & player controls bar avoidance.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TIMING } from '../src/content/media-hover/messages.ts'
import {
  MediaOverlay,
  MEDIA_OVERLAY_HOST_ID,
  initMediaHoverOverlay,
} from '../src/content/media-hover/overlay.ts'

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

describe('video hover toolbar visibility guarantees', () => {
  it('strictly forces is-visible when expanding even if previously hidden', () => {
    const { overlay, capsule } = mountedCapsule()
    // Simulate hide
    capsule.classList.remove('is-visible')
    expect(capsule.classList.contains('is-visible')).toBe(false)

    // Expand must restore visibility contract
    capsule.dispatchEvent(new MouseEvent('mouseenter'))
    expect(capsule.classList.contains('is-visible')).toBe(true)
    expect(capsule.classList.contains('is-expanded')).toBe(true)
    overlay.dispose()
  })

  it('keeps capsule visible when pointer moves in bottom controls area', () => {
    vi.useFakeTimers()
    const { overlay, host, capsule } = mountedCapsule()

    // Mock anchor element with video payload
    const video = document.createElement('video')
    document.body.appendChild(video)
    vi.spyOn(video, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      right: 900,
      bottom: 550,
      width: 800,
      height: 500,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    })

    // Feed video candidate
    overlay['showNow']({
      element: video,
      payload: {
        id: 'test_vid',
        type: 'video',
        src: 'https://cdn.example.com/v.mp4',
        pageUrl: 'https://x.com/post/1',
        pageTitle: 'Post Video',
      },
    })

    expect(capsule.classList.contains('is-visible')).toBe(true)

    // Pointer moves into bottom controls region (e.g. y = 570, which is below rect.bottom 550)
    const moveInControls = new MouseEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 570,
    })
    document.dispatchEvent(moveInControls)

    // Advance grace timer
    vi.advanceTimersByTime(TIMING.leaveGrace + 10)

    // Capsule MUST NOT be hidden in video controls region
    expect(capsule.classList.contains('is-visible')).toBe(true)
    overlay.dispose()
  })

  it('does not falsely treat internal pointerleave as document exit', () => {
    const { overlay, capsule } = mountedCapsule()
    expect(capsule.classList.contains('is-visible')).toBe(true)

    // Dispatch pointerleave on documentElement with client coordinates inside viewport
    const leaveEvent = new Event('pointerleave', { bubbles: true })
    Object.defineProperty(leaveEvent, 'clientX', { value: 300 })
    Object.defineProperty(leaveEvent, 'clientY', { value: 400 })
    Object.defineProperty(leaveEvent, 'relatedTarget', { value: document.body })

    document.documentElement.dispatchEvent(leaveEvent)

    // Must not be hidden because coordinates are well within viewport
    expect(capsule.classList.contains('is-visible')).toBe(true)
    overlay.dispose()
  })
})
