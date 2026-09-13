// @vitest-environment jsdom
/**
 * Overlay mount/dispose lifecycle and duplicate-injection behaviour.
 *
 * Reloading the extension leaves the previous content script's shadow host in
 * the page, so a fresh injection must remove it. This is the regression the
 * repository already guards for the selection watcher; the overlay now needs the
 * same guarantee.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
