// @vitest-environment jsdom
/**
 * The page side of the two switches: a tab obeys the panel's decision whether it
 * learns about it at injection time (the stored value) or while it is running
 * (a storage change, or the message the panel sends to the active tab).
 *
 * Off has to mean off: the hover capsule releases its detector and its pointer
 * listeners rather than merely hiding a node, and the floating ball is taken off
 * screen, so a disabled feature costs the page nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_FLAG, FEATURE_FLAG_MESSAGE } from '../src/feature-flags.ts'
import { MEDIA_OVERLAY_HOST_ID, MediaOverlay, initMediaHoverOverlay } from '../src/content/media-hover/overlay.ts'
import { initFabCompanion } from '../src/content/fab-companion.ts'

interface RuntimeStub {
  listeners: Array<(message: unknown) => unknown>
  emit: (message: unknown) => void
}

interface StorageStub {
  store: Record<string, unknown>
  listeners: Array<(changes: Record<string, unknown>, area: string) => void>
  emitChange: (key: string, newValue: unknown) => void
}

/**
 * Installs a `chrome` stub that answers storage reads from `store` and lets a
 * test fire both channels the panel writes to.
 */
function stubChrome(store: Record<string, unknown> = {}): { storage: StorageStub; runtime: RuntimeStub } {
  const storage: StorageStub = {
    store: { ...store },
    listeners: [],
    emitChange(key: string, newValue: unknown): void {
      for (const listener of [...storage.listeners]) listener({ [key]: { newValue } }, 'local')
    },
  }
  const runtime: RuntimeStub = {
    listeners: [],
    emit(message: unknown): void {
      for (const listener of [...runtime.listeners]) listener(message)
    },
  }

  vi.stubGlobal('chrome', {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      sendMessage: vi.fn(async () => undefined),
      onMessage: {
        addListener: (fn: (message: unknown) => unknown) => { runtime.listeners.push(fn) },
        removeListener: (fn: (message: unknown) => unknown) => {
          const at = runtime.listeners.indexOf(fn)
          if (at >= 0) runtime.listeners.splice(at, 1)
        },
      },
    },
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in storage.store ? { [key]: storage.store[key] } : {})),
        set: vi.fn(async (patch: Record<string, unknown>) => { Object.assign(storage.store, patch) }),
      },
      onChanged: {
        addListener: (fn: (changes: Record<string, unknown>, area: string) => void) => { storage.listeners.push(fn) },
        removeListener: (fn: (changes: Record<string, unknown>, area: string) => void) => {
          const at = storage.listeners.indexOf(fn)
          if (at >= 0) storage.listeners.splice(at, 1)
        },
      },
    },
  })
  return { storage, runtime }
}

/** Lets every pending async read settle. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Installs a real in-memory `localStorage`.
 *
 * A content script shares the page's storage, so `readFlagSync` has to read the
 * page's mirror rather than a stub that always answers `null`; this environment
 * leaves jsdom's own implementation empty.
 */
function stubLocalStorage(): void {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string): string | null => store.get(key) ?? null,
      setItem: (key: string, value: string): void => { store.set(key, String(value)) },
      removeItem: (key: string): void => { store.delete(key) },
      clear: (): void => { store.clear() },
      key: (index: number): string | null => [...store.keys()][index] ?? null,
      get length(): number { return store.size },
    },
  })
}

/** The capture-phase document events the hover detector listens on. */
const DETECTOR_EVENTS = ['pointermove', 'pointerover', 'pointerout'] as const

function shadowHost(): ShadowRoot {
  const host = document.getElementById(MEDIA_OVERLAY_HOST_ID)
  if (host?.shadowRoot === null || host?.shadowRoot === undefined) throw new Error('overlay host is not mounted')
  return host.shadowRoot
}

function fabElement(): HTMLElement {
  const host = document.getElementById('omnimux-companion-root')
  const fab = host?.shadowRoot?.getElementById('omnimux-fab-btn')
  if (fab === null || fab === undefined) throw new Error('companion ball is not mounted')
  return fab
}

function stopCompanion(): void {
  const shell = window as unknown as { __omnimux_fab_unsubscribe?: () => void }
  shell.__omnimux_fab_unsubscribe?.()
  delete shell.__omnimux_fab_unsubscribe
}

beforeEach(() => {
  stubLocalStorage()
  document.body.innerHTML = ''
  document.documentElement.querySelectorAll(`#${MEDIA_OVERLAY_HOST_ID}`).forEach((node) => node.remove())
  document.getElementById('omnimux-companion-root')?.remove()
})

afterEach(() => {
  stopCompanion()
  delete (globalThis as Record<string, unknown>).__dshBrowserWorkstation
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the hover capsule switch', () => {
  it('listens to the page by default, so an untouched switch keeps the feature on', async () => {
    stubChrome()
    const overlay = initMediaHoverOverlay(document)
    await settle()
    expect(overlay.isEnabled()).toBe(true)
    overlay.dispose()
  })

  it('never observes the page when the stored switch is off', async () => {
    stubChrome({ [FEATURE_FLAG.mediaHover]: false })
    const addSpy = vi.spyOn(document, 'addEventListener')
    const overlay = initMediaHoverOverlay(document)
    await settle()

    expect(overlay.isEnabled()).toBe(false)
    const added = addSpy.mock.calls.map((call) => call[0])
    for (const type of DETECTOR_EVENTS) expect(added).not.toContain(type)
    overlay.dispose()
  })

  it('releases the detector and the pointer listeners when switched off', async () => {
    stubChrome()
    const overlay = initMediaHoverOverlay(document)
    await settle()
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const addSpy = vi.spyOn(document, 'addEventListener')

    overlay.setEnabled(false)
    expect(overlay.isEnabled()).toBe(false)
    const removed = removeSpy.mock.calls.map((call) => call[0])
    for (const type of DETECTOR_EVENTS) expect(removed).toContain(type)

    removeSpy.mockClear()
    overlay.setEnabled(true)
    expect(overlay.isEnabled()).toBe(true)
    const reAdded = addSpy.mock.calls.map((call) => call[0])
    for (const type of DETECTOR_EVENTS) expect(reAdded).toContain(type)
    overlay.dispose()
  })

  it('hides the capsule and folds the state back when switched off mid-hover', async () => {
    stubChrome()
    const overlay = initMediaHoverOverlay(document)
    await settle()
    const capsule = shadowHost().querySelector('.omnimux-capsule-bar') as HTMLElement
    capsule.classList.add('is-visible')
    // The pointer reached the pill, so stage two is open when the user flips it.
    capsule.dispatchEvent(new MouseEvent('pointerenter'))
    expect(capsule.classList.contains('is-expanded')).toBe(true)

    overlay.setEnabled(false)
    expect(capsule.classList.contains('is-visible')).toBe(false)
    expect(capsule.classList.contains('is-expanded')).toBe(false)
    expect(capsule.classList.contains('is-collapsed')).toBe(true)
    overlay.dispose()
  })

  it('follows a switch flipped while the page is open', async () => {
    const stub = stubChrome()
    const overlay = initMediaHoverOverlay(document)
    await settle()
    expect(overlay.isEnabled()).toBe(true)

    stub.storage.emitChange(FEATURE_FLAG.mediaHover, false)
    expect(overlay.isEnabled()).toBe(false)

    stub.storage.emitChange(FEATURE_FLAG.mediaHover, true)
    expect(overlay.isEnabled()).toBe(true)
    overlay.dispose()
  })

  it('follows the message the panel sends to the active tab', async () => {
    const stub = stubChrome()
    const overlay = initMediaHoverOverlay(document)

    stub.runtime.emit({ action: FEATURE_FLAG_MESSAGE, key: FEATURE_FLAG.mediaHover, enabled: false })
    expect(overlay.isEnabled()).toBe(false)

    // Another tab's switch, or another feature's, must not move this overlay.
    stub.runtime.emit({ action: FEATURE_FLAG_MESSAGE, key: FEATURE_FLAG.fab, enabled: false })
    expect(overlay.isEnabled()).toBe(false)

    stub.runtime.emit({ action: FEATURE_FLAG_MESSAGE, key: FEATURE_FLAG.mediaHover, enabled: true })
    expect(overlay.isEnabled()).toBe(true)
    overlay.dispose()
  })

  it('stops following the switch once disposed', async () => {
    const stub = stubChrome()
    const overlay = new MediaOverlay(document)
    overlay.mount()
    overlay.dispose()

    expect(stub.storage.listeners).toHaveLength(0)
    expect(stub.runtime.listeners).toHaveLength(0)
    expect(() => stub.storage.emitChange(FEATURE_FLAG.mediaHover, true)).not.toThrow()
  })

  it('keeps the shadow tree mounted while switched off, so switching back needs no rebuild', async () => {
    stubChrome({ [FEATURE_FLAG.mediaHover]: false })
    const overlay = initMediaHoverOverlay(document)
    await settle()

    expect(document.querySelectorAll(`#${MEDIA_OVERLAY_HOST_ID}`)).toHaveLength(1)
    expect(shadowHost().querySelector('.omnimux-capsule-bar')).not.toBeNull()

    overlay.setEnabled(true)
    expect(document.querySelectorAll(`#${MEDIA_OVERLAY_HOST_ID}`)).toHaveLength(1)
    overlay.dispose()
  })
})

describe('the floating ball switch', () => {
  it('shows the ball by default', async () => {
    stubChrome()
    initFabCompanion()
    await settle()
    expect(fabElement().style.display).toBe('')
  })

  it('takes the ball off screen when the stored switch is off', async () => {
    stubChrome({ [FEATURE_FLAG.fab]: false })
    initFabCompanion()
    await settle()
    expect(fabElement().style.display).toBe('none')
  })

  it('takes the ball off screen on a storage change and brings it back', async () => {
    const stub = stubChrome()
    initFabCompanion()
    await settle()
    const fab = fabElement()

    stub.storage.emitChange(FEATURE_FLAG.fab, false)
    expect(fab.style.display).toBe('none')

    stub.storage.emitChange(FEATURE_FLAG.fab, true)
    expect(fab.style.display).toBe('')
  })

  it('ignores a switch change that belongs to another feature', async () => {
    const stub = stubChrome()
    initFabCompanion()
    await settle()

    stub.storage.emitChange(FEATURE_FLAG.mediaHover, false)
    stub.runtime.emit({ action: FEATURE_FLAG_MESSAGE, key: FEATURE_FLAG.mediaHover, enabled: false })
    expect(fabElement().style.display).toBe('')
  })

  it('keeps the ball on where the extension offers no switch channel', async () => {
    // A context with no `chrome.storage` still gets the default, so the switch
    // can only ever be turned off on purpose.
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `chrome-extension://test/${path}`,
        onMessage: { addListener: (): void => {}, removeListener: (): void => {} },
      },
    })
    initFabCompanion()
    await settle()
    expect(fabElement().style.display).toBe('')
  })
})
