// @vitest-environment jsdom
/**
 * The two settings switches: their storage contract, their defaults, and the two
 * channels a change travels on.
 *
 * The behaviours that matter to the product are the defaults (a switch the user
 * never touched must leave its feature on), the cross-world channel (a content
 * script shares the *page's* localStorage, so only `chrome.storage.local` can
 * carry a panel decision into a tab) and the malformed-value rule (a stray value
 * must not leave a feature half-on).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FEATURE_FLAG,
  FEATURE_FLAG_DEFAULT,
  FEATURE_FLAG_MESSAGE,
  featureFlagMessage,
  featureFlagUpdateFromMessage,
  isFeatureFlagKey,
  parseFlagValue,
  readFlag,
  readFlagSync,
  subscribeFlag,
  watchFlag,
  writeFlag,
} from '../src/feature-flags.ts'

/**
 * Installs a real in-memory `localStorage`.
 *
 * The mirror is what makes the panel paint before the async read lands, so it
 * has to be exercised for real; this environment leaves jsdom's own
 * implementation empty.
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

interface ChromeStub {
  chrome: unknown
  storage: {
    get: ReturnType<typeof vi.fn>
    set: ReturnType<typeof vi.fn>
    onChanged: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> }
    emit: (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, area?: string) => void
  }
  runtime: {
    onMessage: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> }
    emit: (message: unknown) => void
  }
}

/**
 * Installs a `chrome` stub whose storage behaves like the real area: `set`
 * records the value and `get` reads it back, so a write followed by a read in
 * the test exercises the same path the extension takes.
 */
function stubChrome(initial: Record<string, unknown> = {}): ChromeStub {
  const store: Record<string, unknown> = { ...initial }
  const storageListeners: Array<(changes: Record<string, unknown>, area: string) => void> = []
  const messageListeners: Array<(message: unknown) => unknown> = []

  const storage = {
    get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
    set: vi.fn(async (patch: Record<string, unknown>) => { Object.assign(store, patch) }),
    onChanged: {
      addListener: vi.fn((fn: (changes: Record<string, unknown>, area: string) => void) => { storageListeners.push(fn) }),
      removeListener: vi.fn((fn: (changes: Record<string, unknown>, area: string) => void) => {
        const at = storageListeners.indexOf(fn)
        if (at >= 0) storageListeners.splice(at, 1)
      }),
      emit(changes: Record<string, { newValue?: unknown }>, area = 'local'): void {
        for (const fn of [...storageListeners]) fn(changes, area)
      },
    },
    emit: (changes: Record<string, { newValue?: unknown }>, area = 'local'): void => {
      for (const fn of [...storageListeners]) fn(changes as Record<string, unknown>, area)
    },
  }

  const runtime = {
    onMessage: {
      addListener: vi.fn((fn: (message: unknown) => unknown) => { messageListeners.push(fn) }),
      removeListener: vi.fn((fn: (message: unknown) => unknown) => {
        const at = messageListeners.indexOf(fn)
        if (at >= 0) messageListeners.splice(at, 1)
      }),
      emit: (message: unknown): void => { for (const fn of [...messageListeners]) fn(message) },
    },
    emit: (message: unknown): void => { for (const fn of [...messageListeners]) fn(message) },
  }

  const chrome = { storage: { local: storage, onChanged: storage.onChanged }, runtime: { onMessage: runtime.onMessage } }
  vi.stubGlobal('chrome', chrome)
  return { chrome, storage, runtime }
}

beforeEach(() => {
  stubLocalStorage()
})

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('switch keys and defaults', () => {
  it('names the two storage keys the panel and the content scripts share', () => {
    expect(FEATURE_FLAG.fab).toBe('omnimux_fab_enabled')
    expect(FEATURE_FLAG.mediaHover).toBe('omnimux_media_hover_enabled')
    expect(FEATURE_FLAG_DEFAULT).toBe(true)
    expect(isFeatureFlagKey(FEATURE_FLAG.fab)).toBe(true)
    expect(isFeatureFlagKey(FEATURE_FLAG.mediaHover)).toBe(true)
  })

  it('recognises only its own keys', () => {
    expect(isFeatureFlagKey('omnimux_theme_mode')).toBe(false)
    expect(isFeatureFlagKey('')).toBe(false)
    expect(isFeatureFlagKey(undefined)).toBe(false)
    expect(isFeatureFlagKey(7)).toBe(false)
  })

  it('reads every absent or malformed value as enabled', () => {
    expect(parseFlagValue(undefined)).toBe(true)
    expect(parseFlagValue(null)).toBe(true)
    expect(parseFlagValue('')).toBe(true)
    expect(parseFlagValue('yes')).toBe(true)
    expect(parseFlagValue(0)).toBe(true)
  })

  it('keeps an explicit off decision', () => {
    expect(parseFlagValue(false)).toBe(false)
    expect(parseFlagValue('false')).toBe(false)
    expect(parseFlagValue(true)).toBe(true)
    expect(parseFlagValue('true')).toBe(true)
  })
})

describe('reading a switch', () => {
  it('defaults to on when nothing was ever stored', async () => {
    stubChrome()
    await expect(readFlag(FEATURE_FLAG.fab)).resolves.toBe(true)
    await expect(readFlag(FEATURE_FLAG.mediaHover)).resolves.toBe(true)
    expect(readFlagSync(FEATURE_FLAG.fab)).toBe(true)
  })

  it('reports the stored decision from chrome.storage.local', async () => {
    stubChrome({ [FEATURE_FLAG.fab]: false, [FEATURE_FLAG.mediaHover]: true })
    await expect(readFlag(FEATURE_FLAG.fab)).resolves.toBe(false)
    await expect(readFlag(FEATURE_FLAG.mediaHover)).resolves.toBe(true)
  })

  it('falls back to the mirror when chrome.storage is unavailable', async () => {
    localStorage.setItem(FEATURE_FLAG.mediaHover, 'false')
    expect(readFlagSync(FEATURE_FLAG.mediaHover)).toBe(false)
    await expect(readFlag(FEATURE_FLAG.mediaHover)).resolves.toBe(false)
  })

  it('falls back to the mirror when the storage read rejects', async () => {
    const stub = stubChrome()
    stub.storage.get.mockRejectedValueOnce(new Error('storage unavailable'))
    localStorage.setItem(FEATURE_FLAG.fab, 'false')
    await expect(readFlag(FEATURE_FLAG.fab)).resolves.toBe(false)
  })
})

describe('writing a switch', () => {
  it('persists into chrome.storage.local and mirrors it for the first paint', async () => {
    const stub = stubChrome()
    await writeFlag(FEATURE_FLAG.fab, false)
    await writeFlag(FEATURE_FLAG.mediaHover, false)

    expect(stub.storage.set).toHaveBeenCalledWith({ [FEATURE_FLAG.fab]: false })
    expect(stub.storage.set).toHaveBeenCalledWith({ [FEATURE_FLAG.mediaHover]: false })
    expect(readFlagSync(FEATURE_FLAG.fab)).toBe(false)
    expect(readFlagSync(FEATURE_FLAG.mediaHover)).toBe(false)
    await expect(readFlag(FEATURE_FLAG.fab)).resolves.toBe(false)
  })

  it('round-trips a switch back on', async () => {
    stubChrome({ [FEATURE_FLAG.fab]: false })
    await writeFlag(FEATURE_FLAG.fab, true)
    expect(readFlagSync(FEATURE_FLAG.fab)).toBe(true)
    await expect(readFlag(FEATURE_FLAG.fab)).resolves.toBe(true)
  })

  it('never throws when the extension storage is missing', async () => {
    localStorage.clear()
    await expect(writeFlag(FEATURE_FLAG.fab, false)).resolves.toBeUndefined()
    expect(readFlagSync(FEATURE_FLAG.fab)).toBe(false)
  })

  it('keeps the mirror when the async half rejects', async () => {
    const stub = stubChrome()
    stub.storage.set.mockRejectedValueOnce(new Error('quota exceeded'))
    await expect(writeFlag(FEATURE_FLAG.mediaHover, false)).resolves.toBeUndefined()
    expect(readFlagSync(FEATURE_FLAG.mediaHover)).toBe(false)
  })
})

describe('following a switch', () => {
  it('reports a local storage change of its own key', () => {
    const stub = stubChrome()
    const seen: boolean[] = []
    watchFlag(FEATURE_FLAG.fab, (enabled) => { seen.push(enabled) })

    stub.storage.emit({ [FEATURE_FLAG.fab]: { newValue: false } })
    stub.storage.emit({ [FEATURE_FLAG.fab]: { newValue: true } })
    expect(seen).toEqual([false, true])
  })

  it('ignores another key and another storage area', () => {
    const stub = stubChrome()
    const listener = vi.fn()
    watchFlag(FEATURE_FLAG.fab, listener)

    stub.storage.emit({ [FEATURE_FLAG.mediaHover]: { newValue: false } })
    stub.storage.emit({ [FEATURE_FLAG.fab]: { newValue: false } }, 'sync')
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops reporting after unsubscribing', () => {
    const stub = stubChrome()
    const listener = vi.fn()
    const unsubscribe = watchFlag(FEATURE_FLAG.fab, listener)

    unsubscribe()
    stub.storage.emit({ [FEATURE_FLAG.fab]: { newValue: false } })
    expect(listener).not.toHaveBeenCalled()
    expect(stub.storage.onChanged.removeListener).toHaveBeenCalledTimes(1)
  })

  it('answers the message the panel sends to the active tab', () => {
    const stub = stubChrome()
    const seen: boolean[] = []
    const unsubscribe = subscribeFlag(FEATURE_FLAG.mediaHover, (enabled) => { seen.push(enabled) })

    stub.runtime.emit(featureFlagMessage(FEATURE_FLAG.mediaHover, false))
    stub.runtime.emit(featureFlagMessage(FEATURE_FLAG.fab, false))
    expect(seen).toEqual([false])

    unsubscribe()
    stub.runtime.emit(featureFlagMessage(FEATURE_FLAG.mediaHover, true))
    expect(seen).toEqual([false])
  })

  it('answers storage changes as well as messages', () => {
    const stub = stubChrome()
    const listener = vi.fn()
    const unsubscribe = subscribeFlag(FEATURE_FLAG.fab, listener)

    stub.storage.emit({ [FEATURE_FLAG.fab]: { newValue: false } })
    stub.runtime.emit(featureFlagMessage(FEATURE_FLAG.fab, true))
    expect(listener).toHaveBeenNthCalledWith(1, false)
    expect(listener).toHaveBeenNthCalledWith(2, true)

    unsubscribe()
    expect(stub.runtime.onMessage.removeListener).toHaveBeenCalledTimes(1)
  })

  it('subscribes safely where no extension runtime exists', () => {
    const unsubscribe = subscribeFlag(FEATURE_FLAG.fab, () => {})
    expect(() => unsubscribe()).not.toThrow()
  })
})

describe('the panel-to-tab message', () => {
  it('carries the key and the new value', () => {
    const message = featureFlagMessage(FEATURE_FLAG.mediaHover, false)
    expect(message).toEqual({
      action: FEATURE_FLAG_MESSAGE,
      key: 'omnimux_media_hover_enabled',
      enabled: false,
    })
    expect(featureFlagUpdateFromMessage(message)).toEqual({
      key: FEATURE_FLAG.mediaHover,
      enabled: false,
    })
  })

  it('rejects every unrelated message on the same channel', () => {
    expect(featureFlagUpdateFromMessage(null)).toBeNull()
    expect(featureFlagUpdateFromMessage('OMNIMUX_FEATURE_FLAG')).toBeNull()
    expect(featureFlagUpdateFromMessage({ action: 'GET_PAGE_CONTEXT' })).toBeNull()
    expect(featureFlagUpdateFromMessage({ action: FEATURE_FLAG_MESSAGE, key: 'unknown' })).toBeNull()
    expect(featureFlagUpdateFromMessage({ action: FEATURE_FLAG_MESSAGE })).toBeNull()
  })
})
