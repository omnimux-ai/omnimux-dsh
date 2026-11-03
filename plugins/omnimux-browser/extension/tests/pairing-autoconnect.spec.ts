// @vitest-environment jsdom

/**
 * One-click pairing has to finish the job on its own.
 *
 * The approval page is the only surface allowed to approve, and it hands the
 * background an address and a token. From there the panel must end up connected
 * with those values filled in. These cases drive the real background and the
 * real panel:
 *
 * - a client another browser evicted (close 4000) used to stay evicted after an
 *   approval, so `startBridge()` returned without ever opening a socket;
 * - a panel opened before the approval only read its form once, so the new
 *   address and token never reached the inputs;
 * - the pair card kept `pairBusy` set forever when the connection never came.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BridgeState } from '../src/background/bridge.ts'
import type { PanelApi } from '../src/panel/api.ts'
import { App } from '../src/panel/App.tsx'

const PAIRED_URL = 'ws://127.0.0.1:45120/ext/bridge'
const PAIRED_TOKEN = 'paired-token'

/** The panel API the App talks to; the pairing card only needs these two. */
let panelApi: PanelApi

vi.mock('../src/panel/api.ts', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, connectPanel: (): PanelApi => panelApi }
})

/** Fake socket with just the surface the bridge client drives. */
class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.CONNECTING
  readonly sent: unknown[] = []

  constructor(readonly url: string) {
    super()
    FakeWebSocket.instances.push(this)
  }

  send(value: string): void {
    this.sent.push(JSON.parse(value))
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  receive(frame: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) }))
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === FakeWebSocket.CLOSED) return
    this.readyState = FakeWebSocket.CLOSED
    this.dispatchEvent(new CloseEvent('close', { code, reason }))
  }
}

function chromeEvent<T extends unknown[]>() {
  const listeners = new Set<(...args: T) => void>()
  return {
    addListener: vi.fn((listener: (...args: T) => void) => { listeners.add(listener) }),
    emit: (...args: T) => { for (const listener of listeners) listener(...args) },
  }
}

function panelPort() {
  const onMessage = chromeEvent<[unknown]>()
  const onDisconnect = chromeEvent<[]>()
  const postMessage = vi.fn()
  const port = {
    name: 'dsh-panel',
    postMessage,
    onMessage,
    onDisconnect,
  } as unknown as chrome.runtime.Port
  return { onDisconnect, onMessage, port, postMessage }
}

function mockBackgroundChrome(options: {
  localGet?: () => Promise<Record<string, unknown>>
  localSet?: (items: Record<string, unknown>) => Promise<void>
} = {}) {
  const onConnect = chromeEvent<[chrome.runtime.Port]>()
  const onAlarm = chromeEvent<[chrome.alarms.Alarm]>()
  const onMessage = chromeEvent<[unknown, chrome.runtime.MessageSender, (response: unknown) => void]>()
  const alarms = {
    create: vi.fn(),
    clear: vi.fn(async () => true),
    onAlarm,
  }
  vi.stubGlobal('chrome', {
    alarms,
    notifications: {
      create: vi.fn(async () => ''),
      clear: vi.fn(async () => true),
      onClicked: chromeEvent<[string]>(),
    },
    runtime: {
      id: 'test-extension',
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onConnect,
      onMessage,
    },
    sidePanel: {
      open: vi.fn(async () => {}),
      setPanelBehavior: vi.fn(async () => {}),
    },
    storage: {
      local: {
        get: vi.fn(options.localGet ?? (async () => ({}))),
        set: vi.fn(options.localSet ?? (async () => {})),
      },
      session: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
    },
    tabs: {
      get: vi.fn(async (tabId: number) => ({ id: tabId, windowId: 1, title: 'Tab', url: 'https://example.com/' } as chrome.tabs.Tab)),
      query: vi.fn(async () => [{ id: 1, windowId: 1, title: 'Tab', url: 'https://example.com/' }] as chrome.tabs.Tab[]),
      create: vi.fn(async () => ({ id: 2, windowId: 1, title: 'Approval', url: 'http://127.0.0.1:45120/ext/pair' } as chrome.tabs.Tab)),
      update: vi.fn(async (tabId: number) => ({ id: tabId, windowId: 1, title: 'Tab', url: 'https://example.com/' } as chrome.tabs.Tab)),
      remove: vi.fn(async () => {}),
      sendMessage: vi.fn(async () => {}),
      onActivated: chromeEvent<[{ tabId: number; windowId: number }]>(),
      onUpdated: chromeEvent<[number, chrome.tabs.TabChangeInfo, chrome.tabs.Tab]>(),
      onReplaced: chromeEvent<[number, number]>(),
      onRemoved: chromeEvent<[number]>(),
    },
    webNavigation: {
      getAllFrames: vi.fn(async () => [{
        tabId: 1,
        frameId: 0,
        parentFrameId: -1,
        documentId: 'document-1',
        url: 'https://example.com/',
      }]),
      onCommitted: chromeEvent<[{ tabId: number; frameId: number }]>(),
    },
    scripting: {
      executeScript: vi.fn(async () => []),
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: chromeEvent<[number]>(),
      onRemoved: chromeEvent<[number]>(),
    },
  } as unknown as typeof chrome)
  return { alarms, onConnect, onMessage }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  FakeWebSocket.instances = []
})

describe('background pairing under an eviction', () => {
  it('clears an evicted bridge and connects with the approved address and token', async () => {
    const persisted: Record<string, unknown>[] = []
    const chromeMock = mockBackgroundChrome({
      localGet: async () => ({ dshSettings: { bridgeUrl: PAIRED_URL, token: 'old-token' } }),
      localSet: async (items) => { persisted.push(items) },
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/ext/bridge-config')) return json({ wsUrl: PAIRED_URL })
      if (url.endsWith('/ext/pair/request')) {
        return json({
          requestId: 'pair-1',
          approveUrl: 'http://127.0.0.1:45120/ext/pair?request=pair-1',
          code: 'ABC-123',
        })
      }
      if (url.includes('/ext/pair/status')) return json({ state: 'approved', token: PAIRED_TOKEN })
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('WebSocket', FakeWebSocket)
    await vi.importActual('../src/background/index.ts')

    const panel = panelPort()
    chromeMock.onConnect.emit(panel.port)
    await vi.waitFor(() => { expect(FakeWebSocket.instances).toHaveLength(1) })
    const evictedSocket = FakeWebSocket.instances[0]!
    evictedSocket.open()
    await vi.waitFor(() => { expect(evictedSocket.sent).toContainEqual(expect.objectContaining({ t: 'hello' })) })
    evictedSocket.receive({
      t: 'hello.ok',
      caps: { textOnly: true, snapshotMaxChars: 32_000, maxInteractiveItems: 60 },
    })
    await vi.waitFor(() => {
      expect(panel.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'status', state: 'connected' }))
    })

    // Another browser takes the single slot: the keepalive must leave it alone,
    // which is the premise the approval below has to break out of.
    evictedSocket.close(4000, 'replaced')
    chromeMock.alarms.onAlarm.emit({ name: 'bridge-keepalive', scheduledTime: Date.now() })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(FakeWebSocket.instances).toHaveLength(1)

    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'PAIR_START' }, {} as chrome.runtime.MessageSender, respond)
    await vi.waitFor(() => {
      expect(respond).toHaveBeenCalledWith({
        ok: true,
        approveUrl: 'http://127.0.0.1:45120/ext/pair?request=pair-1',
        code: 'ABC-123',
      })
    })

    // The status poll runs once a second; an approval must produce a real
    // connection attempt instead of being swallowed by the eviction guard.
    await vi.waitFor(() => { expect(FakeWebSocket.instances).toHaveLength(2) }, { timeout: 4_000 })
    const pairedSocket = FakeWebSocket.instances[1]!
    expect(pairedSocket.url).toBe(PAIRED_URL)
    expect(persisted).toContainEqual({
      dshSettings: expect.objectContaining({ bridgeUrl: PAIRED_URL, token: PAIRED_TOKEN }),
    })
    // The panel opened before the approval is told what was bound, so its form
    // can show the address and token the background just used.
    expect(panel.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'status',
      settings: { bridgeUrl: PAIRED_URL, token: PAIRED_TOKEN },
    }))

    pairedSocket.open()
    await vi.waitFor(() => {
      expect(pairedSocket.sent).toContainEqual(expect.objectContaining({ t: 'hello', token: PAIRED_TOKEN }))
    })
    pairedSocket.receive({
      t: 'hello.ok',
      caps: { textOnly: true, snapshotMaxChars: 32_000, maxInteractiveItems: 60 },
    })
    await vi.waitFor(() => {
      expect(panel.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'status', state: 'connected' }))
    })
  })
})

describe('panel pairing card', () => {
  let root: Root
  let onStatus: ((
    state: BridgeState,
    caps: null,
    boundSettings?: { bridgeUrl: string; token: string },
  ) => void) | undefined

  beforeEach(() => {
    const storage = globalThis.localStorage as Storage | undefined
    if (typeof storage?.clear === 'function') storage.clear()
    document.body.innerHTML = '<div id="root"></div>'
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    HTMLElement.prototype.scrollTo = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    vi.stubGlobal('chrome', {
      i18n: { getUILanguage: () => 'zh-CN' },
      storage: {
        local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      runtime: {
        getURL: (path: string) => `chrome-extension://test/${path}`,
        sendMessage: vi.fn(async () => ({ ok: true, approveUrl: 'http://127.0.0.1:45120/ext/pair', code: 'ABC-123' })),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      tabs: { query: vi.fn(async () => [{ id: 7 }]), sendMessage: vi.fn(async () => undefined) },
      windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
    })

    const rpc = vi.fn(async (method: string, _payload?: unknown) => {
      if (method === 'session.create') return { sessionId: 'session-current' }
      if (method === 'session.history') return { events: [] }
      if (method === 'settings.describe') return { namespaces: [] }
      if (method === 'credentials.describe') return { credentials: {} }
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
      onTaskLocate: vi.fn(() => unsubscribe),
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

  it('fills the bound address and token into an open panel and frees the card', async () => {
    await act(async () => { root.render(createElement(App)) })

    const pairButton = (): HTMLButtonElement => {
      const button = document.querySelector<HTMLButtonElement>('.pair-button')
      if (button === null) throw new Error('pair button not found')
      return button
    }
    await act(async () => { pairButton().click() })
    await vi.waitFor(() => { expect(document.querySelector('.pair-message')?.textContent).toContain('授权码 ABC-123') })
    expect(pairButton().disabled).toBe(true)

    // The approval lands while this panel is open: the address and token come
    // over the status broadcast, before the bridge reports itself connected.
    await act(async () => {
      onStatus?.('stopped', null, { bridgeUrl: PAIRED_URL, token: PAIRED_TOKEN })
    })
    await act(async () => { document.querySelector<HTMLButtonElement>('.settings-trigger')!.click() })
    await vi.waitFor(() => { expect(document.querySelector('.settings')).not.toBeNull() })
    const inputs = document.querySelectorAll<HTMLInputElement>('.settings input')
    expect([...inputs].some((input) => input.value === PAIRED_URL)).toBe(true)
    expect([...inputs].some((input) => input.type === 'password' && input.value === PAIRED_TOKEN)).toBe(true)

    await act(async () => {
      document.querySelector<HTMLButtonElement>('.settings-heading button.icon-button')!.click()
    })
    await vi.waitFor(() => { expect(document.querySelector('.pair-button')).not.toBeNull() })

    // Connected ends the wait; the next drop must offer a button, not a card
    // stuck in "等待授权…" with the click disabled forever.
    await act(async () => { onStatus?.('connected', null) })
    await vi.waitFor(() => { expect(document.querySelector('.pair-card')).toBeNull() })
    await act(async () => { onStatus?.('stopped', null) })
    await vi.waitFor(() => { expect(document.querySelector('.pair-button')).not.toBeNull() })
    expect(pairButton().disabled).toBe(false)
    expect(document.querySelector('.pair-message')).toBeNull()
  })
})

describe('panel status relay', () => {
  it('hands the bound settings of a status message to the panel listener', async () => {
    let receive: ((message: unknown) => void) | undefined
    const port = {
      postMessage: vi.fn(),
      onMessage: { addListener: vi.fn((listener: (message: unknown) => void) => { receive = listener }) },
      onDisconnect: { addListener: vi.fn() },
    }
    vi.stubGlobal('chrome', { runtime: { connect: vi.fn(() => port) } })
    const real = await vi.importActual('../src/panel/api.ts') as { connectPanel: () => PanelApi }
    const api = real.connectPanel()
    const calls: unknown[][] = []
    api.onStatus((...args) => { calls.push(args) })

    receive?.({
      type: 'status',
      state: 'stopped',
      caps: null,
      settings: { bridgeUrl: PAIRED_URL, token: PAIRED_TOKEN },
    })

    expect(calls).toEqual([['stopped', null, { bridgeUrl: PAIRED_URL, token: PAIRED_TOKEN }]])
  })
})
