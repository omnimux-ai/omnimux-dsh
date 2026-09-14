// @vitest-environment jsdom
/**
 * What the user sees after pressing 保存并连接.
 *
 * The settings view used to answer a click with nothing at all: a failed save
 * was reported to a state the settings view never rendered, a lost reply left
 * the caller waiting forever, and a settings store that failed to load left the
 * whole form silently inert. These cases drive the real component and assert
 * the visible outcome of each one.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { BridgeState } from '../src/background/bridge.ts'
import type { PanelApi } from '../src/panel/api.ts'

let panelApi: PanelApi

vi.mock('../src/panel/api.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/panel/api.ts')>(),
  connectPanel: (): PanelApi => panelApi,
}))

import { App } from '../src/panel/App.tsx'

interface ChromeHarness {
  set: Mock<(patch: Record<string, unknown>) => Promise<void>>
  get: Mock<(key: string) => Promise<Record<string, unknown>>>
}

/** Installs the extension APIs the panel reaches for while showing settings. */
function stubChrome(stored: Record<string, unknown> = {}): ChromeHarness {
  const set = vi.fn(async () => undefined)
  const get = vi.fn(async (key: string) => (key in stored ? { [key]: stored[key] } : {}))
  vi.stubGlobal('chrome', {
    // Chinese UI so the assertions read the copy the user sees.
    i18n: { getUILanguage: () => 'zh-CN' },
    storage: {
      local: { get, set },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      sendMessage: vi.fn(async () => undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    tabs: { query: vi.fn(async () => [{ id: 7 }]), sendMessage: vi.fn(async () => undefined) },
    windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
  })
  return { set, get }
}

describe('the settings save button', () => {
  let root: Root
  let onStatus: ((state: BridgeState, caps: null) => void) | undefined
  let rpc: Mock<(method: string, payload?: unknown) => Promise<unknown>>
  let updateSettings: Mock<(next: unknown) => Promise<void>>
  let chromeHarness: ChromeHarness

  beforeEach(() => {
    // Node's own webstorage global can shadow jsdom's and has no clear().
    const storage = globalThis.localStorage as Storage | undefined
    if (typeof storage?.clear === 'function') storage.clear()
    document.body.innerHTML = '<div id="root"></div>'
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    HTMLElement.prototype.scrollTo = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    chromeHarness = stubChrome()

    rpc = vi.fn(async (method: string) => {
      if (method === 'session.create') return { sessionId: 'session-current' }
      if (method === 'session.history') return { events: [] }
      if (method === 'settings.describe') return { namespaces: [] }
      if (method === 'credentials.describe') return { credentials: {} }
      throw new Error(`unexpected RPC: ${method}`)
    })
    const unsubscribe = (): void => {}
    updateSettings = vi.fn(async () => {})
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
      updateSettings: updateSettings as unknown as PanelApi['updateSettings'],
      requestStatus: vi.fn(async () => {}),
    }
    root = createRoot(document.querySelector('#root')!)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function openSettings(): Promise<void> {
    await act(async () => { root.render(createElement(App)) })
    await act(async () => { onStatus?.('connected', null) })
    await vi.waitFor(() => { expect(document.querySelector('.settings-trigger')).not.toBeNull() })
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.settings-trigger')!.click()
    })
    await vi.waitFor(() => { expect(document.querySelector('.settings-actions')).not.toBeNull() })
  }

  function saveButton(): HTMLButtonElement {
    const button = document.querySelector<HTMLButtonElement>('.settings-actions button.primary')
    if (button === null) throw new Error('save button not found')
    return button
  }

  function feedback(): string | null {
    return document.querySelector('.settings-feedback')?.textContent?.trim() ?? null
  }

  function bridgeInput(): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>('.settings input')
    if (input === null) throw new Error('bridge input not found')
    return input
  }

  async function clickSave(): Promise<void> {
    await act(async () => { saveButton().click() })
  }

  it('locks the button while the save is in flight', async () => {
    let release: (() => void) | undefined
    updateSettings.mockImplementation(async () => {
      await new Promise<void>((resolve) => { release = resolve })
    })
    await openSettings()

    await act(async () => {
      saveButton().click()
      // The click handler awaits the port, so the in-flight state is observable
      // before the promise settles.
      await Promise.resolve()
    })

    expect(saveButton().disabled).toBe(true)
    expect(saveButton().textContent).toContain('保存中')

    // A second click while the first is in flight must not issue another write.
    await clickSave()
    expect(updateSettings).toHaveBeenCalledTimes(1)

    await act(async () => { release?.(); await Promise.resolve() })
  })

  it('confirms a successful save and then closes the settings view', async () => {
    await openSettings()

    await clickSave()

    await vi.waitFor(() => { expect(feedback()).toContain('设置已保存') })
    // The view closes itself on a short beat so the confirmation is readable.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 800)) })
    expect(document.querySelector('.settings-actions')).toBeNull()
  })

  it('reports a failed save in place, keeps the view open, and retries', async () => {
    updateSettings.mockRejectedValueOnce(new Error('模拟存储写入失败'))
    await openSettings()

    await clickSave()

    await vi.waitFor(() => { expect(feedback()).toContain('保存失败：模拟存储写入失败') })
    expect(document.querySelector('.settings-feedback.error')).not.toBeNull()
    expect(document.querySelector('.settings-actions')).not.toBeNull()
    expect(saveButton().disabled).toBe(false)
    expect(saveButton().textContent).toContain('重试保存')

    // Retrying after the underlying problem is gone saves and closes.
    updateSettings.mockImplementation(async () => {})
    await clickSave()
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 800)) })
    expect(document.querySelector('.settings-actions')).toBeNull()
    expect(updateSettings).toHaveBeenCalledTimes(2)
  })

  it('shows a blocked relay draft next to the button instead of only in the relay section', async () => {
    rpc.mockImplementation(async (method: string) => {
      if (method === 'session.create') return { sessionId: 'session-current' }
      if (method === 'session.history') return { events: [] }
      if (method === 'settings.describe') {
        return {
          namespaces: [{
            ns: 'llm-pi-ai',
            value: {
              providers: {
                'relay-alpha': {
                  displayName: '中转甲',
                  api: 'openai-completions',
                  baseURL: 'https://relay.example.com/v1',
                  models: [{ id: 'model-a' }],
                },
              },
            },
          }],
        }
      }
      if (method === 'credentials.describe') return { credentials: {} }
      throw new Error(`unexpected RPC: ${method}`)
    })
    await openSettings()

    // Empty the relay profile's name: the save is blocked before it reaches the
    // port, which used to leave the click with nothing on screen.
    const nameInput = document.querySelector<HTMLInputElement>('.relay-config input')
    expect(nameInput).not.toBeNull()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(nameInput!, '')
      nameInput!.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await clickSave()

    await vi.waitFor(() => { expect(feedback()).toContain('请填写档案名称') })
    expect(document.querySelector('.settings-actions')).not.toBeNull()
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('keeps the form usable and saving when the settings store cannot be read', async () => {
    chromeHarness.get.mockRejectedValue(new Error('模拟设置读取失败'))
    await openSettings()

    // The form is editable rather than a silently inert copy of the defaults.
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(bridgeInput(), 'ws://127.0.0.1:45999/ext/bridge')
      bridgeInput().dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(bridgeInput().value).toBe('ws://127.0.0.1:45999/ext/bridge')

    await clickSave()

    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(updateSettings.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      bridgeUrl: 'ws://127.0.0.1:45999/ext/bridge',
    }))
  })
})
