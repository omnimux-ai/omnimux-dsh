// @vitest-environment jsdom
/**
 * The two settings switches as the user actually meets them: rendered in the
 * settings view, on by default, and persisting plus broadcasting the moment they
 * are flipped.
 *
 * The panel is the only writer of these switches, so this spec drives the real
 * component: what the page side can rely on is not that a handler exists but
 * that a click on the switch reaches `chrome.storage.local` and the active tab.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { BridgeState } from '../src/background/bridge.ts'
import type { PanelApi } from '../src/panel/api.ts'
import { FEATURE_FLAG, FEATURE_FLAG_MESSAGE } from '../src/feature-flags.ts'

let panelApi: PanelApi

// Keep the real module's exports: the panel's error mapping uses PanelRpcError.
vi.mock('../src/panel/api.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/panel/api.ts')>(),
  connectPanel: (): PanelApi => panelApi,
}))

import { App } from '../src/panel/App.tsx'

const TAB_ID = 7

interface ChromeHarness {
  set: Mock<(patch: Record<string, unknown>) => Promise<void>>
  sendMessage: Mock<(tabId: number, message: unknown) => Promise<unknown>>
}

/** Installs the extension APIs the panel reaches for while showing settings. */
function stubChrome(stored: Record<string, unknown> = {}): ChromeHarness {
  const set = vi.fn(async () => undefined)
  const sendMessage = vi.fn(async () => undefined)
  vi.stubGlobal('chrome', {
    // Chinese UI so the assertions read the copy the user sees.
    i18n: { getUILanguage: () => 'zh-CN' },
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in stored ? { [key]: stored[key] } : {})),
        set,
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      sendMessage: vi.fn(async () => undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    tabs: { query: vi.fn(async () => [{ id: TAB_ID }]), sendMessage },
    windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
  })
  return { set, sendMessage }
}

describe('the page-surface switches in the settings view', () => {
  let root: Root
  let onStatus: ((state: BridgeState, caps: null) => void) | undefined
  let rpc: Mock<(method: string, payload?: unknown) => Promise<unknown>>
  let chromeHarness: ChromeHarness

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    HTMLElement.prototype.scrollTo = vi.fn()
    // No local bridge in this environment: the workspace probe falls back.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    chromeHarness = stubChrome()

    rpc = vi.fn(async (method: string) => {
      if (method === 'session.create') return { sessionId: 'session-current' }
      if (method === 'session.history') return { events: [] }
      throw new Error(`unexpected RPC: ${method}`)
    })
    const unsubscribe = (): void => {}
    panelApi = {
      rpc: async <T = unknown>(method: string, payload?: unknown): Promise<T> => await rpc(method, payload) as T,
      respond: vi.fn(async () => undefined),
      onStatus: vi.fn((callback) => { onStatus = callback; return unsubscribe }),
      onEvent: vi.fn(() => unsubscribe),
      onApprovalRequest: vi.fn(() => unsubscribe),
      onApprovalResolved: vi.fn(() => unsubscribe),
      onTabAffinity: vi.fn(() => unsubscribe),
      onSelection: vi.fn(() => unsubscribe),
      onMediaAttach: vi.fn(() => unsubscribe),
      onSessionResumeHint: vi.fn(() => unsubscribe),
      respondToApproval: vi.fn(async () => {}),
      resolveTabAffinity: vi.fn(async () => {}),
      rebindTabAffinity: vi.fn(async () => {}),
      clearSelection: vi.fn(async () => {}),
      registerWindow: vi.fn(async () => {}),
      setActiveSession: vi.fn(async () => {}),
      updateSettings: vi.fn(async () => {}),
      requestStatus: vi.fn(async () => {}),
    }
    root = createRoot(document.querySelector('#root')!)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** Renders the panel, connects it, and opens the settings view. */
  async function openSettings(): Promise<void> {
    await act(async () => { root.render(createElement(App)) })
    await act(async () => { onStatus?.('connected', null) })
    await vi.waitFor(() => { expect(document.querySelector('.settings-trigger')).not.toBeNull() })
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.settings-trigger')!.click()
    })
    await vi.waitFor(() => { expect(document.querySelectorAll('.settings .feature-switch')).toHaveLength(2) })
  }

  /** The switch input of one card, in the order the view renders them. */
  function switchAt(index: number): HTMLInputElement {
    const cards = document.querySelectorAll('.settings .feature-switch')
    const input = cards[index]?.querySelector<HTMLInputElement>('.setting-toggle-input')
    if (input === null || input === undefined) throw new Error(`switch not found at index ${index}`)
    return input
  }

  it('shows a floating-ball card and an image-toolbar card, both switched on', async () => {
    await openSettings()

    const cards = document.querySelectorAll('.settings .feature-switch')
    expect(cards[0]?.querySelector('.settings-card-heading')?.textContent).toBe('悬浮球')
    expect(cards[0]?.querySelector('.setting-toggle-copy strong')?.textContent).toBe('启用悬浮球')
    expect(cards[0]?.querySelector('.setting-toggle-copy small')?.textContent).toBe('控制网页右下角全局悬浮球是否显示')

    expect(cards[1]?.querySelector('.settings-card-heading')?.textContent).toBe('图片工具栏')
    expect(cards[1]?.querySelector('.setting-toggle-copy strong')?.textContent).toBe('悬停在图片上时显示')
    expect(cards[1]?.querySelector('.setting-toggle-copy small')?.textContent).toMatch(/胶囊工具栏/)

    expect(switchAt(0).checked).toBe(true)
    expect(switchAt(1).checked).toBe(true)
  })

  it('persists the switch and tells the active tab when the floating ball is turned off', async () => {
    await openSettings()

    await act(async () => { switchAt(0).click() })

    expect(switchAt(0).checked).toBe(false)
    expect(chromeHarness.set).toHaveBeenCalledWith({ [FEATURE_FLAG.fab]: false })
    await vi.waitFor(() => {
      expect(chromeHarness.sendMessage).toHaveBeenCalledWith(TAB_ID, {
        action: FEATURE_FLAG_MESSAGE,
        key: FEATURE_FLAG.fab,
        enabled: false,
      })
    })
    // The other switch is untouched: the two are independent features.
    expect(switchAt(1).checked).toBe(true)
  })

  it('persists the switch and tells the active tab when the image toolbar is turned off', async () => {
    await openSettings()

    await act(async () => { switchAt(1).click() })

    expect(switchAt(1).checked).toBe(false)
    expect(chromeHarness.set).toHaveBeenCalledWith({ [FEATURE_FLAG.mediaHover]: false })
    await vi.waitFor(() => {
      expect(chromeHarness.sendMessage).toHaveBeenCalledWith(TAB_ID, {
        action: FEATURE_FLAG_MESSAGE,
        key: FEATURE_FLAG.mediaHover,
        enabled: false,
      })
    })
  })

  it('opens on the stored decision rather than the default', async () => {
    chromeHarness = stubChrome({ [FEATURE_FLAG.mediaHover]: false })
    await openSettings()

    await vi.waitFor(() => { expect(switchAt(1).checked).toBe(false) })
    expect(switchAt(0).checked).toBe(true)
  })
})
