// @vitest-environment jsdom
/**
 * Tests for the robust multi-layer hover expansion mechanism of the media hover capsule toolbar.
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

describe('media hover capsule robust expansion', () => {
  it('expands to stage two on mouseenter on the capsule element', () => {
    vi.useFakeTimers()
    const { overlay, capsule } = mountedCapsule()
    expect(capsule.classList.contains('is-collapsed')).toBe(true)

    capsule.dispatchEvent(new MouseEvent('mouseenter'))
    expect(capsule.classList.contains('is-expanded')).toBe(true)
    expect(capsule.classList.contains('is-collapsed')).toBe(false)
    overlay.dispose()
  })

  it('expands to stage two on mouseover on the capsule element', () => {
    vi.useFakeTimers()
    const { overlay, capsule } = mountedCapsule()
    expect(capsule.classList.contains('is-collapsed')).toBe(true)

    capsule.dispatchEvent(new MouseEvent('mouseover'))
    expect(capsule.classList.contains('is-expanded')).toBe(true)
    overlay.dispose()
  })

  it('expands when hovering directly on the brand button trigger', () => {
    vi.useFakeTimers()
    const { overlay, capsule, brand } = mountedCapsule()
    expect(capsule.classList.contains('is-collapsed')).toBe(true)

    brand.dispatchEvent(new MouseEvent('mouseenter'))
    expect(capsule.classList.contains('is-expanded')).toBe(true)

    capsule.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(TIMING.collapseGrace)
    expect(capsule.classList.contains('is-collapsed')).toBe(true)

    brand.dispatchEvent(new MouseEvent('pointerenter'))
    expect(capsule.classList.contains('is-expanded')).toBe(true)
    overlay.dispose()
  })

  it('expands when global pointermove detects movement inside the overlay', () => {
    vi.useFakeTimers()
    const { overlay, host, capsule } = mountedCapsule()
    expect(capsule.classList.contains('is-collapsed')).toBe(true)

    // Move directly onto the host/capsule
    const moveEvent = new MouseEvent('pointermove', {
      bubbles: true,
      composed: true,
      clientX: 50,
      clientY: 50,
    })
    host.dispatchEvent(moveEvent)

    expect(capsule.classList.contains('is-expanded')).toBe(true)
    overlay.dispose()
  })

  it('expands via physical bounding box coordinate fallback', () => {
    vi.useFakeTimers()
    const { overlay, capsule } = mountedCapsule()
    expect(capsule.classList.contains('is-collapsed')).toBe(true)

    // Mock bounding rect of capsule at (20, 500, 44, 524)
    vi.spyOn(capsule, 'getBoundingClientRect').mockReturnValue({
      left: 20,
      top: 500,
      right: 44,
      bottom: 524,
      width: 24,
      height: 24,
      x: 20,
      y: 500,
      toJSON: () => ({}),
    })

    // Pointer move at (30, 510) - inside capsule rect
    const moveEvent = new MouseEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      clientX: 30,
      clientY: 510,
    })
    document.dispatchEvent(moveEvent)

    expect(capsule.classList.contains('is-expanded')).toBe(true)
    overlay.dispose()
  })

  it('schedules collapse when moving pointer out of interactive state', () => {
    vi.useFakeTimers()
    const { overlay, host, capsule } = mountedCapsule()

    // Enter interactive
    const enterMove = new MouseEvent('pointermove', {
      bubbles: true,
      composed: true,
      clientX: 50,
      clientY: 50,
    })
    host.dispatchEvent(enterMove)
    expect(capsule.classList.contains('is-expanded')).toBe(true)

    // Move outside overlay
    const leaveMove = new MouseEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      clientX: 800,
      clientY: 800,
    })
    document.body.dispatchEvent(leaveMove)

    vi.advanceTimersByTime(TIMING.collapseGrace - 1)
    expect(capsule.classList.contains('is-expanded')).toBe(true)

    vi.advanceTimersByTime(2)
    expect(capsule.classList.contains('is-collapsed')).toBe(true)
    overlay.dispose()
  })
})
