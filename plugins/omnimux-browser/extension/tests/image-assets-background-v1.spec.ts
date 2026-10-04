// @vitest-environment jsdom
/**
 * V1 worker behaviour for DSH_MEDIA_TO_ASSETS.
 *
 * The worker must relay a confirmed image payload to exactly one authenticated
 * local host over the existing bridge: the socket that completed hello and
 * negotiated the `imageAssetSave` capability. Unpaired, uncapable, or
 * unreachable hosts answer `host-unavailable`; a request that went out but
 * lost its receipt answers `save-unconfirmed`; a bare `ok` with an empty or
 * shapeless result is never reported as a save; the extension-local
 * inspiration store and multi-host port scanning must not be involved.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.CONNECTING
  readonly sent: Array<Record<string, unknown>> = []

  constructor(readonly url: string) {
    super()
    FakeWebSocket.instances.push(this)
  }

  send(value: string): void {
    this.sent.push(JSON.parse(value) as Record<string, unknown>)
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
    emitAsync: async (...args: T) => { for (const listener of listeners) listener(...args) },
  }
}

function panelPort() {
  const onMessage = chromeEvent<[unknown]>()
  const onDisconnect = chromeEvent<[]>()
  const port = {
    name: 'dsh-panel',
    postMessage: vi.fn(),
    onMessage,
    onDisconnect,
  } as unknown as chrome.runtime.Port
  return { onDisconnect, onMessage, port }
}

function mockChrome(options: {
  localGet?: () => Promise<Record<string, unknown>>
} = {}) {
  const onConnect = chromeEvent<[chrome.runtime.Port]>()
  const onMessage = chromeEvent<[unknown, chrome.runtime.MessageSender, (response: unknown) => void]>()
  const onAlarm = chromeEvent<[chrome.alarms.Alarm]>()
  const alarms = { create: vi.fn(), clear: vi.fn(async () => true), onAlarm }
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
        set: vi.fn(async () => {}),
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
      remove: vi.fn(async () => {}),
      sendMessage: vi.fn(async () => {}),
      onActivated: chromeEvent<[{ tabId: number; windowId: number }]>(),
      onUpdated: chromeEvent<[number, chrome.tabs.TabChangeInfo, chrome.tabs.Tab]>(),
      onReplaced: chromeEvent<[number, number]>(),
      onRemoved: chromeEvent<[number]>(),
    },
    webNavigation: {
      getAllFrames: vi.fn(async () => [{ tabId: 1, frameId: 0, parentFrameId: -1, documentId: 'd1', url: 'https://example.com/' }]),
      onCommitted: chromeEvent<[{ tabId: number; frameId: number }]>(),
    },
    scripting: { executeScript: vi.fn(async () => []) },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: chromeEvent<[number]>(),
      onRemoved: chromeEvent<[number]>(),
    },
  } as unknown as typeof chrome)
  return { alarms, onConnect, onMessage, storage: chrome.storage }
}

const IMAGE = {
  id: 'image:https://cdn.example.com/photo.png',
  type: 'image',
  src: 'https://cdn.example.com/photo.png',
  previewSrc: 'https://cdn.example.com/photo.png',
  pageUrl: 'https://page.example.com/post/1',
  pageTitle: '示例页面',
  width: 480,
  height: 320,
  naturalWidth: 960,
  naturalHeight: 640,
  alt: '示例图片',
  capturedAt: 1_700_000_000_000,
}

const SENDER = { id: 'test-extension', tab: { id: 7, windowId: 3 }, frameId: 0 } as unknown as chrome.runtime.MessageSender

const BASE_CAPS = { textOnly: true, snapshotMaxChars: 32_000, maxInteractiveItems: 60 }
const ASSET_CAPS = { ...BASE_CAPS, imageAssetSave: true }

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => { setTimeout(resolve, 0) })
}

/** Boots the module, claims the bridge and completes hello with the given caps. */
async function pairedBridge(caps: Record<string, unknown>, fetchMock = vi.fn(async (_input: unknown) => new Response(JSON.stringify({
  wsUrl: 'ws://127.0.0.1:45120/ext/bridge',
}), { status: 200 }))) {
  expect(typeof fetchMock).toBe('function')
  const chromeMock = mockChrome()
  // A BridgeClient whose socket closed keeps reconnecting for the lifetime of
  // its module: instances an earlier test leaked sit before this offset, so
  // every assertion below is relative instead of absolute.
  const baseIndex = FakeWebSocket.instances.length
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('WebSocket', FakeWebSocket)
  await import('../src/background/index.ts')

  const panel = panelPort()
  chromeMock.onConnect.emit(panel.port)
  await vi.waitFor(() => { expect(FakeWebSocket.instances.length > baseIndex).toBe(true) })
  const socket = FakeWebSocket.instances[baseIndex]!
  socket.open()
  await flush()
  socket.receive({ t: 'hello.ok', caps })
  await flush()
  return { chromeMock, socket, baseIndex }
}

function rpcFrames(socket: FakeWebSocket): Array<Record<string, unknown>> {
  return socket.sent.filter((frame) => frame.t === 'rpc')
}

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  FakeWebSocket.instances = []
})

describe('DSH_MEDIA_TO_ASSETS relay', () => {
  it('forwards the image to omnimux.saveImageAsset on the paired host and returns the strict receipt', async () => {
    const { chromeMock, socket } = await pairedBridge(ASSET_CAPS)

    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: 'req-42' }, SENDER, respond)
    await vi.waitFor(() => { expect(rpcFrames(socket)).toHaveLength(1) })

    const frame = rpcFrames(socket)[0]!
    expect(frame.method).toBe('omnimux.saveImageAsset')
    const args = frame.payload as Record<string, unknown>
    expect(args.requestId).toBe('req-42')
    expect(args.url).toBe('https://cdn.example.com/photo.png')
    expect(args.pageUrl).toBe('https://page.example.com/post/1')
    expect(args.title).toBe('示例图片')

    socket.receive({
      t: 'rpc.result',
      id: frame.id,
      ok: true,
      result: { status: 'saved', assetId: 'asset-1', fileId: 'file-1', lrev: 9 },
    })
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    expect(respond).toHaveBeenCalledWith({
      ok: true,
      result: { status: 'saved', assetId: 'asset-1', fileId: 'file-1', lrev: 9 },
    })
  })

  it('answers duplicate receipts through the same envelope', async () => {
    const { chromeMock, socket } = await pairedBridge(ASSET_CAPS)
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: 'req-1' }, SENDER, respond)
    await vi.waitFor(() => { expect(rpcFrames(socket)).toHaveLength(1) })
    socket.receive({ t: 'rpc.result', id: rpcFrames(socket)[0]!.id, ok: true, result: { status: 'duplicate', assetId: 'a', fileId: 'f', lrev: 3 } })
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    expect(respond).toHaveBeenCalledWith({ ok: true, result: { status: 'duplicate', assetId: 'a', fileId: 'f', lrev: 3 } })
  })

  it('generates a bounded request id when the page omitted one', async () => {
    const { chromeMock, socket } = await pairedBridge(ASSET_CAPS)
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE }, SENDER, respond)
    await vi.waitFor(() => { expect(rpcFrames(socket)).toHaveLength(1) })
    const args = rpcFrames(socket)[0]!.payload as Record<string, unknown>
    expect(typeof args.requestId).toBe('string')
    expect((args.requestId as string).length).toBeGreaterThan(0)
    expect((args.requestId as string).length).toBeLessThanOrEqual(128)
  })

  it('uses the page title when the image has no alt text', async () => {
    const { chromeMock, socket } = await pairedBridge(ASSET_CAPS)
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: { ...IMAGE, alt: '' }, requestId: 'r' }, SENDER, respond)
    await vi.waitFor(() => { expect(rpcFrames(socket)).toHaveLength(1) })
    expect((rpcFrames(socket)[0]!.payload as Record<string, unknown>).title).toBe('示例页面')
  })
})

describe('host gating', () => {
  it('refuses to write when hello negotiated no imageAssetSave capability', async () => {
    const { chromeMock, socket } = await pairedBridge(BASE_CAPS)
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: 'r' }, SENDER, respond)
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    expect(respond).toHaveBeenCalledWith({ ok: false, error: { code: 'host-unavailable' } })
    expect(rpcFrames(socket)).toHaveLength(0)
  })

  it('refuses when no bridge connection exists at all', async () => {
    const chromeMock = mockChrome()
    const baseIndex = FakeWebSocket.instances.length
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })))
    vi.stubGlobal('WebSocket', FakeWebSocket)
    await import('../src/background/index.ts')
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: 'r' }, SENDER, respond)
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    expect(respond).toHaveBeenCalledWith({ ok: false, error: { code: 'host-unavailable' } })
    expect(FakeWebSocket.instances.length).toEqual(baseIndex)
  })

  it('never falls back to the extension-local inspiration store or the port-scan write', async () => {
    const fetchMock = vi.fn(async (_input: unknown) => new Response(JSON.stringify({
      wsUrl: 'ws://127.0.0.1:45120/ext/bridge',
    }), { status: 200 }))
    expect(fetchMock.length).toBe(1)
    const { chromeMock, socket } = await pairedBridge(BASE_CAPS, fetchMock)
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: 'r' }, SENDER, respond)
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    expect(respond).toHaveBeenCalledWith({ ok: false, error: { code: 'host-unavailable' } })
    // The only fetches allowed are the bridge discovery probes; an inspiration
    // fallback would reach /omnimux/inspiration/local on some port.
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls.every((url) => !url.includes('/omnimux/inspiration'))).toBe(true)
    expect(chromeMock.storage.local.set).not.toHaveBeenCalledWith(expect.objectContaining({ dshMediaInspiration: expect.anything() }))
    expect(rpcFrames(socket)).toHaveLength(0)
  })
})

describe('payload validation', () => {
  it('rejects a video payload without touching the bridge', async () => {
    const { chromeMock, socket } = await pairedBridge(ASSET_CAPS)
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: { ...IMAGE, type: 'video', id: 'video:x' }, requestId: 'r' }, SENDER, respond)
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    expect(respond).toHaveBeenCalledWith({ ok: false, error: { code: 'invalid-media' } })
    expect(rpcFrames(socket)).toHaveLength(0)
  })

  it('rejects a non-fetchable source without touching the bridge', async () => {
    const { chromeMock, socket } = await pairedBridge(ASSET_CAPS)
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: { ...IMAGE, src: 'blob:https://page/x' }, requestId: 'r' }, SENDER, respond)
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    expect(respond).toHaveBeenCalledWith({ ok: false, error: { code: 'invalid-media' } })
    expect(rpcFrames(socket)).toHaveLength(0)
  })
})

describe('receipt honesty', () => {
  it('answers save-unconfirmed when the host acknowledges but returns an empty result', async () => {
    const { chromeMock, socket } = await pairedBridge(ASSET_CAPS)
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: 'r' }, SENDER, respond)
    await vi.waitFor(() => { expect(rpcFrames(socket)).toHaveLength(1) })
    socket.receive({ t: 'rpc.result', id: rpcFrames(socket)[0]!.id, ok: true, result: {} })
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    expect(respond).toHaveBeenCalledWith({ ok: false, error: { code: 'save-unconfirmed' } })
  })

  it('answers save-unconfirmed when a saved receipt lacks real asset ids', async () => {
    const { chromeMock, socket } = await pairedBridge(ASSET_CAPS)
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: 'r' }, SENDER, respond)
    await vi.waitFor(() => { expect(rpcFrames(socket)).toHaveLength(1) })
    socket.receive({ t: 'rpc.result', id: rpcFrames(socket)[0]!.id, ok: true, result: { status: 'saved', assetId: '', fileId: '', lrev: 2 } })
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    expect(respond).toHaveBeenCalledWith({ ok: false, error: { code: 'save-unconfirmed' } })
  })

  it('answers save-unconfirmed when the socket dies before the receipt', async () => {
    const { chromeMock, socket } = await pairedBridge(ASSET_CAPS)
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: 'r' }, SENDER, respond)
    await vi.waitFor(() => { expect(rpcFrames(socket)).toHaveLength(1) })
    socket.close(1006, 'lost')
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    const answer = respond.mock.calls[0]![0] as { ok: boolean; error?: { code?: string } }
    expect(answer.ok).toBe(false)
    expect(answer.error?.code).toBe('save-unconfirmed')
  })

  it('passes a business failure through as an outer-ok outcome', async () => {
    const { chromeMock, socket } = await pairedBridge(ASSET_CAPS)
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: 'r' }, SENDER, respond)
    await vi.waitFor(() => { expect(rpcFrames(socket)).toHaveLength(1) })
    socket.receive({ t: 'rpc.result', id: rpcFrames(socket)[0]!.id, ok: true, result: { status: 'http-error', statusCode: 404 } })
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    expect(respond).toHaveBeenCalledWith({ ok: true, result: { status: 'http-error', statusCode: 404 } })
  })

  it('translates a host rpc error carrying a business status into the outcome', async () => {
    const { chromeMock, socket } = await pairedBridge(ASSET_CAPS)
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: 'r' }, SENDER, respond)
    await vi.waitFor(() => { expect(rpcFrames(socket)).toHaveLength(1) })
    socket.receive({ t: 'rpc.result', id: rpcFrames(socket)[0]!.id, ok: false, error: { code: 'storage-failed', message: 'disk full' } })
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    expect(respond).toHaveBeenCalledWith({ ok: true, result: { status: 'storage-failed' } })
  })

  it('answers save-unconfirmed when the receipt carries a malformed revision', async () => {
    // lrev parity with the host parser (src/protocol.ts): a saved/duplicate
    // receipt only counts with a safe non-negative integer revision.
    const { chromeMock, socket } = await pairedBridge(ASSET_CAPS)
    for (const [index, lrev] of ['2', 1.5, -1, Number.MAX_SAFE_INTEGER + 1, Number.NaN].entries()) {
      const respond = vi.fn()
      chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: `bad-${index}` }, SENDER, respond)
      await vi.waitFor(() => { expect(rpcFrames(socket)).toHaveLength(index + 1) })
      socket.receive({ t: 'rpc.result', id: rpcFrames(socket)[index]!.id, ok: true, result: { status: 'saved', assetId: 'a', fileId: 'f', lrev } })
      await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
      const answer = respond.mock.calls[0]![0] as { ok: boolean; error?: { code?: string } }
      expect(answer.ok).toBe(false)
      expect(answer.error?.code).toBe('save-unconfirmed')
    }
  })

  it('does not write to another host when the receipt is lost', async () => {
    const fetchMock = vi.fn(async (_input: unknown) => new Response(JSON.stringify({
      wsUrl: 'ws://127.0.0.1:45120/ext/bridge',
    }), { status: 200 }))
    expect(fetchMock.length).toBe(1)
    const { chromeMock, socket } = await pairedBridge(ASSET_CAPS, fetchMock)
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: 'r' }, SENDER, respond)
    await vi.waitFor(() => { expect(rpcFrames(socket)).toHaveLength(1) })
    socket.close(1006, 'lost')
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    // The lost receipt stays unknown: no save rpc may be re-sent, on this or
    // any later socket generation.
    const saveRpcs = FakeWebSocket.instances.flatMap((instance) =>
      instance.sent.filter((frame) => frame.t === 'rpc' && frame.method === 'omnimux.saveImageAsset'))
    expect(saveRpcs.length).toBe(1)
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls.every((url) => !url.includes('saveImageAsset') && !url.includes('/omnimux/inspiration'))).toBe(true)
  })
})

describe('pairing target binding', () => {
  it('keeps the approved token when the worker boots cold (settings load lands after approval)', async () => {
    // The bug this guards: loadSettings() resolves late and overwrites the
    // settings object persistSettings() already wrote for the approved pair.
    // The pairing socket itself is unaffected (its url/token were snapshotted
    // at start()), but every later startBridge() re-authenticates with the
    // clobbered empty token — observable on the next start()'s hello.
    let releaseLoad!: (value: Record<string, unknown>) => void
    const slowStorage = new Promise<Record<string, unknown>>((resolve) => { releaseLoad = resolve })
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.includes('/ext/pair/request')) {
        return new Response(JSON.stringify({
          requestId: 'pair-cold',
          approveUrl: 'http://127.0.0.1:45120/approve?pair-cold',
          code: '99',
        }), { status: 200 })
      }
      if (url.includes('/ext/pair/status')) {
        return new Response(JSON.stringify({ state: 'approved', token: 'tk-cold' }), { status: 200 })
      }
      return new Response(JSON.stringify({ wsUrl: 'ws://127.0.0.1:45120/ext/bridge' }), { status: 200 })
    })
    const chromeMock = mockChrome({ localGet: () => slowStorage })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('WebSocket', FakeWebSocket)
    await import('../src/background/index.ts')

    const tabs = chrome.tabs as unknown as Record<string, unknown>
    const query = tabs.query as ReturnType<typeof vi.fn>
    query.mockResolvedValueOnce([])
    Object.assign(tabs, { create: vi.fn(async () => ({ id: 5 })), update: vi.fn(async () => ({})) })

    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'PAIR_START' }, SENDER, respond)
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    expect(respond.mock.calls[0]![0]).toEqual(expect.objectContaining({ ok: true }))
    // Approval resolves, THEN the slow settings load finally lands.
    await new Promise((resolve) => { setTimeout(resolve, 1_300) })
    releaseLoad({})

    const approvedUrl = 'ws://127.0.0.1:45120/ext/bridge'
    const helloWithToken = (instance: FakeWebSocket, token: string): boolean =>
      instance.sent.some((f) => f.t === 'hello' && f.token === token)
    // Open candidates as they appear: hello is sent only after open().
    await vi.waitFor(
      () => {
        for (const candidate of FakeWebSocket.instances.filter((i) => i.url === approvedUrl)) candidate.open()
        const hit = FakeWebSocket.instances.some(
          (i) => i.url === approvedUrl && helloWithToken(i, 'tk-cold'),
        )
        expect(hit).toEqual(true)
      },
      { timeout: 10_000, interval: 50 },
    )
    const pairedSocket = FakeWebSocket.instances.find(
      (i) => i.url === approvedUrl && helloWithToken(i, 'tk-cold'),
    )!
    const pairedIndex = FakeWebSocket.instances.indexOf(pairedSocket)
    // A later startBridge (e.g. a settings touch) must still authenticate with
    // the approved token — under the clobber it sends the empty default.
    const update = vi.fn()
    chromeMock.onMessage.emit(
      { type: 'SETTINGS_UPDATED', payload: { bridgeUrl: approvedUrl } },
      SENDER,
      update,
    )
    await vi.waitFor(
      () => {
        for (const candidate of FakeWebSocket.instances.filter((i) => i.url === approvedUrl)) candidate.open()
        const hit = FakeWebSocket.instances.some(
          (i, index) => index > pairedIndex && i.url === approvedUrl && helloWithToken(i, 'tk-cold'),
        )
        expect(hit).toEqual(true)
      },
      { timeout: 10_000, interval: 50 },
    )
  })

  it('persists the approved bridge address together with the token and handshakes with them', async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: { method?: string }) => {
      const url = String(input)
      if (url.includes('/ext/pair/request')) {
        return new Response(JSON.stringify({
          requestId: 'pair-9',
          approveUrl: 'http://127.0.0.1:45120/approve?pair-9',
          code: '4242',
        }), { status: 200 })
      }
      if (url.includes('/ext/pair/status')) {
        return new Response(JSON.stringify({ state: 'approved', token: '  tk-pair-9  ' }), { status: 200 })
      }
      if (url.includes('/ext/bridge-config') || init?.method === undefined) {
        return new Response(JSON.stringify({ wsUrl: 'ws://127.0.0.1:45120/ext/bridge' }), { status: 200 })
      }
      return new Response(null, { status: 503 })
    })
    const chromeMock = mockChrome()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('WebSocket', FakeWebSocket)
    await import('../src/background/index.ts')

    // The approval page must open for the pairing to proceed at all; the mock
    // installs the tab API on the chrome global itself.
    const tabs = chrome.tabs as unknown as Record<string, unknown>
    const query = tabs.query as ReturnType<typeof vi.fn>
    expect(typeof query.mockResolvedValueOnce).toBe('function')
    query.mockResolvedValueOnce([])
    Object.assign(tabs, {
      create: vi.fn(async () => ({ id: 99, windowId: 1 })),
      update: vi.fn(async () => ({ id: 1 })),
    })

    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'PAIR_START' }, SENDER, respond)
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    const pairingAnswer = respond.mock.calls[0]![0] as { ok: boolean }
    expect(pairingAnswer.ok).toBe(true)

    // Once approved, the paired socket goes to the instance the user approved
    // — persisted as the full bridgeUrl — authenticated with the issued token.
    // A leaked reconnect from an earlier module may still be opening sockets,
    // so the pairing socket is picked by its approved url, then by the token
    // its hello presents.
    const approvedUrl = 'ws://127.0.0.1:45120/ext/bridge'
    await vi.waitFor(
      () => {
        const fresh = FakeWebSocket.instances.filter((i) => i.url === approvedUrl)
        expect(fresh.length > 0).toEqual(true)
      },
      { timeout: 10_000, interval: 50 },
    )
    // hello is only sent after the socket opens; every approved-url socket gets
    // opened so the pairing generation can authenticate itself.
    for (const candidate of FakeWebSocket.instances.filter((i) => i.url === approvedUrl)) {
      candidate.open()
    }
    await flush()
    await vi.waitFor(
      () => {
        const hit = FakeWebSocket.instances.some(
          (i) => i.url === approvedUrl && i.sent.some((f) => f.t === 'hello' && f.token === 'tk-pair-9'),
        )
        expect(hit).toEqual(true)
      },
      { timeout: 10_000, interval: 50 },
    )
    const socket = FakeWebSocket.instances.find(
      (i) => i.url === approvedUrl && i.sent.some((f) => f.t === 'hello' && f.token === 'tk-pair-9'),
    )!
    expect(socket.url).toEqual(approvedUrl)
    const persistedWrites = async (): Promise<Array<{ bridgeUrl?: string; token?: string }>> => {
      const all = (chromeMock.storage.local.set as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0] as Record<string, unknown>)
      return all
        .filter((record) => typeof record.dshSettings === 'object' && record.dshSettings !== null)
        .map((record) => record.dshSettings as { bridgeUrl?: string; token?: string })
    }
    await vi.waitFor(async () => {
      const written = await persistedWrites()
      expect(written.length).toBeGreaterThan(0)
    })
    const settingsWritten = await persistedWrites()
    const lastWrite = settingsWritten[settingsWritten.length - 1]!
    expect(lastWrite.bridgeUrl).toEqual(approvedUrl)
    expect(lastWrite.token).toEqual('tk-pair-9')

    await flush()
    socket.receive({ t: 'hello.ok', caps: ASSET_CAPS })
    await flush()
    const hello = socket.sent.find((frame) => frame.t === 'hello')
    expect(hello?.token).toEqual('tk-pair-9')

    // The newly paired socket is a real save target once hello completes.
    const save = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: 'pair-save' }, SENDER, save)
    await vi.waitFor(() => { expect(rpcFrames(socket)).toHaveLength(1) })
    socket.receive({ t: 'rpc.result', id: rpcFrames(socket)[0]!.id, ok: true, result: { status: 'saved', assetId: 'a', fileId: 'f', lrev: 0 } })
    await vi.waitFor(() => { expect(save).toHaveBeenCalled() })
    const saveAnswer = save.mock.calls[0]![0] as { ok: boolean; result?: { status?: string } }
    expect(saveAnswer.ok).toBe(true)
    expect(saveAnswer.result?.status).toBe('saved')
  })
})

import { saveImageAssetRpc, type SaveImageTarget } from '../src/background/save-image-assets.ts'

describe('hello generation target binding', () => {
  it('refuses to dispatch on a newer hello generation than the captured local target', async () => {
    // The captured target carries the generation of the socket that completed
    // hello. When the live client has advanced past it (reconnect or retarget),
    // the captured write must answer host-unavailable without sending.
    const rpc = { request: vi.fn(async () => ({ status: 'saved', assetId: 'a', fileId: 'f', lrev: 1 })) }
    const target: SaveImageTarget = {
      rpc,
      localTarget: { generation: 3, url: 'ws://127.0.0.1:45120/ext/bridge', caps: { imageAssetSave: true } },
      currentHelloGeneration: () => 4,
      locale: 'zh',
    }
    const answer = await saveImageAssetRpc(target, IMAGE as Parameters<typeof saveImageAssetRpc>[1], 'req-stale')
    expect(answer).toEqual({ ok: false, error: { code: 'host-unavailable' } })
    expect(rpc.request.mock.calls).toEqual([])
  })

  it('dispatches exactly once on the generation that completed hello', async () => {
    const rpc = { request: vi.fn(async () => ({ status: 'saved', assetId: 'a', fileId: 'f', lrev: 1 })) }
    const target: SaveImageTarget = {
      rpc,
      localTarget: { generation: 3, url: 'ws://127.0.0.1:45120/ext/bridge', caps: { imageAssetSave: true } },
      currentHelloGeneration: () => 3,
      locale: 'zh',
    }
    const answer = await saveImageAssetRpc(target, IMAGE as Parameters<typeof saveImageAssetRpc>[1], 'req-live')
    expect(answer).toEqual({ ok: true, result: { status: 'saved', assetId: 'a', fileId: 'f', lrev: 1 } })
    expect(rpc.request.mock.calls).toEqual([['omnimux.saveImageAsset', {
      requestId: 'req-live',
      url: 'https://cdn.example.com/photo.png',
      pageUrl: 'https://page.example.com/post/1',
      title: '示例图片',
    }]])
  })
})

describe('capability freshness across reconnects', () => {
  it('reconnecting after a lost receipt never re-dispatches the save on the new generation', async () => {
    const { chromeMock, socket, baseIndex } = await pairedBridge(ASSET_CAPS)
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: 'lost-receipt' }, SENDER, respond)
    await vi.waitFor(() => { expect(rpcFrames(socket)).toHaveLength(1) })
    socket.close(1006, 'lost')
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    expect(respond.mock.calls[0]![0]).toEqual({ ok: false, error: { code: 'save-unconfirmed' } })

    // The client reconnects into a new hello generation (same url is enough):
    // nothing may re-issue the earlier write.
    await vi.waitFor(
      () => { expect(FakeWebSocket.instances.length > baseIndex + 1).toBe(true) },
      { timeout: 10_000, interval: 50 },
    )
    const socket2 = FakeWebSocket.instances[baseIndex + 1]!
    socket2.open()
    await flush()
    socket2.receive({ t: 'hello.ok', caps: ASSET_CAPS })
    await flush()
    expect(rpcFrames(socket2).filter((frame) => frame.method === 'omnimux.saveImageAsset')).toEqual([])
    expect(rpcFrames(socket).filter((frame) => frame.method === 'omnimux.saveImageAsset')).toHaveLength(1)
  })

  it('does not reuse stale caps while a new socket is still waiting for hello', async () => {
    const { chromeMock, socket, baseIndex } = await pairedBridge(ASSET_CAPS)
    socket.close(1006, 'lost')
    await vi.waitFor(
      () => { expect(FakeWebSocket.instances.length > baseIndex + 1).toBe(true) },
      { timeout: 10_000, interval: 50 },
    )
    const socket2 = FakeWebSocket.instances[baseIndex + 1]!
    socket2.open()
    await flush()
    // The replacement socket has connected but its hello has not been
    // answered: the previous generation's imageAssetSave cap is stale and
    // must not authorize a write.
    const respond = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: 'stale-caps' }, SENDER, respond)
    await vi.waitFor(() => { expect(respond).toHaveBeenCalled() })
    expect(respond).toHaveBeenCalledWith({ ok: false, error: { code: 'host-unavailable' } })
    const saveRpcsOnSocket2 = rpcFrames(socket2).filter((frame) => frame.method === 'omnimux.saveImageAsset')
    expect(saveRpcsOnSocket2).toHaveLength(0)

    // After hello completes without the capability, the refusal stands.
    socket2.receive({ t: 'hello.ok', caps: BASE_CAPS })
    await flush()
    const respond2 = vi.fn()
    chromeMock.onMessage.emit({ type: 'DSH_MEDIA_TO_ASSETS', payload: IMAGE, requestId: 'post-hello' }, SENDER, respond2)
    await vi.waitFor(() => { expect(respond2).toHaveBeenCalled() })
    expect(respond2).toHaveBeenCalledWith({ ok: false, error: { code: 'host-unavailable' } })
    const saveRpcsOnSocket2b = rpcFrames(socket2).filter((frame) => frame.method === 'omnimux.saveImageAsset')
    expect(saveRpcsOnSocket2b).toHaveLength(0)
  })
})
