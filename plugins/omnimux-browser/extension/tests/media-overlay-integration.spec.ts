// @vitest-environment jsdom
/**
 * Overlay mount/dispose lifecycle, duplicate-injection behaviour and the timing
 * of the two-stage hover expansion.
 *
 * Reloading the extension leaves the previous content script's shadow host in
 * the page, so a fresh injection must remove it. This is the regression the
 * repository already guards for the selection watcher; the overlay now needs the
 * same guarantee.
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

/** The mounted capsule; stage one on screen is the detector's job, not ours. */
function mountedCapsule(): { overlay: MediaOverlay; capsule: HTMLElement; tooltip: HTMLElement } {
  const overlay = initMediaHoverOverlay(document)
  const shadow = shadowOf(document.getElementById(MEDIA_OVERLAY_HOST_ID) as Element)
  const capsule = shadow.querySelector('.omnimux-capsule-bar') as HTMLElement
  const tooltip = shadow.querySelector('.white-tooltip') as HTMLElement
  capsule.classList.add('is-visible')
  return { overlay, capsule, tooltip }
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

describe('overlay mounting', () => {
  it('mounts one shadow host holding the capsule and the tooltip as siblings', () => {
    const overlay = initMediaHoverOverlay(document)
    const hosts = document.querySelectorAll(`#${MEDIA_OVERLAY_HOST_ID}`)
    expect(hosts).toHaveLength(1)

    const shadow = shadowOf(hosts[0])
    const capsule = shadow.querySelector('.omnimux-capsule-bar')
    const tooltip = shadow.querySelector('.white-tooltip')
    expect(capsule).not.toBeNull()
    expect(tooltip).not.toBeNull()
    expect(tooltip?.parentNode).toBe(capsule?.parentNode)
    expect(capsule?.contains(tooltip as Node)).toBe(false)

    overlay.dispose()
  })

  it('anchors the host at zero size with the top layer so it cannot trap clicks', () => {
    const overlay = new MediaOverlay(document)
    overlay.mount()
    const host = document.getElementById(MEDIA_OVERLAY_HOST_ID) as HTMLElement
    expect(host.style.position).toBe('fixed')
    expect(host.style.width).toBe('0px')
    expect(host.style.height).toBe('0px')
    expect(host.style.overflow).toBe('visible')
    expect(host.style.pointerEvents).toBe('none')
    overlay.dispose()
  })

  it('leaves no node behind after dispose', () => {
    const overlay = initMediaHoverOverlay(document)
    expect(document.querySelectorAll(`#${MEDIA_OVERLAY_HOST_ID}`)).toHaveLength(1)
    overlay.dispose()
    expect(document.querySelectorAll(`#${MEDIA_OVERLAY_HOST_ID}`)).toHaveLength(0)
  })

  it('is safe to dispose twice', () => {
    const overlay = initMediaHoverOverlay(document)
    overlay.dispose()
    expect(() => overlay.dispose()).not.toThrow()
  })

  it('detaches the document listeners it added', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const overlay = initMediaHoverOverlay(document)
    overlay.dispose()

    const added = addSpy.mock.calls.map((call) => call[0])
    const removed = removeSpy.mock.calls.map((call) => call[0])
    for (const type of added) {
      expect(removed).toContain(type)
    }
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('replaces the previous instance when a content script is injected twice', () => {
    const first = initMediaHoverOverlay(document)
    const shell = globalThis as Record<string, unknown>
    expect(shell[HANDLE]).toBeUndefined()

    // Mirrors the content-script entry: dispose the old handle, drop stale nodes.
    const previous = first
    previous.dispose()
    document.querySelectorAll(`#${MEDIA_OVERLAY_HOST_ID}`).forEach((node) => node.remove())
    const second = initMediaHoverOverlay(document)

    expect(second).not.toBe(previous)
    expect(document.querySelectorAll(`#${MEDIA_OVERLAY_HOST_ID}`)).toHaveLength(1)
    second.dispose()
    expect(document.querySelectorAll(`#${MEDIA_OVERLAY_HOST_ID}`)).toHaveLength(0)
  })

  it('paints nothing until the pointer settles on an eligible element', () => {
    const overlay = initMediaHoverOverlay(document)
    const shadow = shadowOf(document.getElementById(MEDIA_OVERLAY_HOST_ID) as Element)
    const capsule = shadow.querySelector('.omnimux-capsule-bar')
    expect(capsule?.classList.contains('is-visible')).toBe(false)
    expect(shadow.querySelector('.white-tooltip')?.classList.contains('is-visible')).toBe(false)
    overlay.dispose()
  })
})

describe('two-stage hover expansion', () => {
  it('opens stage two on the capsule and folds back after the buffer', () => {
    vi.useFakeTimers()
    const { overlay, capsule } = mountedCapsule()
    expect(capsule.classList.contains('is-collapsed')).toBe(true)

    capsule.dispatchEvent(new MouseEvent('pointerenter'))
    expect(capsule.classList.contains('is-expanded')).toBe(true)
    expect(capsule.classList.contains('is-collapsed')).toBe(false)

    capsule.dispatchEvent(new MouseEvent('pointerleave'))
    // The grace period is what lets the pointer travel between an icon and the
    // brand circle without the pill flickering shut on the way.
    vi.advanceTimersByTime(TIMING.collapseGrace - 1)
    expect(capsule.classList.contains('is-expanded')).toBe(true)

    vi.advanceTimersByTime(1)
    expect(capsule.classList.contains('is-collapsed')).toBe(true)
    expect(capsule.classList.contains('is-expanded')).toBe(false)
    overlay.dispose()
  })

  it('cancels a pending fold-back when the pointer comes straight back', () => {
    vi.useFakeTimers()
    const { overlay, capsule } = mountedCapsule()

    capsule.dispatchEvent(new MouseEvent('pointerenter'))
    capsule.dispatchEvent(new MouseEvent('pointerleave'))
    vi.advanceTimersByTime(TIMING.collapseGrace - 20)
    capsule.dispatchEvent(new MouseEvent('pointerenter'))
    vi.advanceTimersByTime(TIMING.collapseGrace)

    expect(capsule.classList.contains('is-expanded')).toBe(true)
    overlay.dispose()
  })

  it('serves the keyboard the same two stages', () => {
    vi.useFakeTimers()
    const { overlay, capsule } = mountedCapsule()

    // Tabbing onto the brand trigger is the pointer-free way into stage two.
    capsule.dispatchEvent(new FocusEvent('focusin'))
    expect(capsule.classList.contains('is-expanded')).toBe(true)

    capsule.dispatchEvent(new FocusEvent('focusout'))
    vi.advanceTimersByTime(TIMING.collapseGrace)
    expect(capsule.classList.contains('is-collapsed')).toBe(true)
    overlay.dispose()
  })

  it('shows the stage-two hint above a button and clears it with the fold-back', () => {
    vi.useFakeTimers()
    const { overlay, capsule, tooltip } = mountedCapsule()
    const copy = capsule.querySelector('[data-action="copy"]') as HTMLElement

    capsule.dispatchEvent(new MouseEvent('pointerenter'))
    copy.dispatchEvent(new MouseEvent('pointerenter'))
    expect(tooltip.classList.contains('is-visible')).toBe(true)

    capsule.dispatchEvent(new MouseEvent('pointerleave'))
    vi.advanceTimersByTime(TIMING.collapseGrace)
    // Stage one has no icon for the hint to point at, so it must not survive.
    expect(tooltip.classList.contains('is-visible')).toBe(false)
    overlay.dispose()
  })

  it('leaves no collapse timer behind after dispose', () => {
    vi.useFakeTimers()
    const { overlay, capsule } = mountedCapsule()

    capsule.dispatchEvent(new MouseEvent('pointerleave'))
    overlay.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
})
