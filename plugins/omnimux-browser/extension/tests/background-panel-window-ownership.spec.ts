// @vitest-environment jsdom
/**
 * The window ownership rule for page media.
 *
 * Reported defect: with the native side panel already open, pressing the
 * capsule's "add to conversation" icon expanded the floating workstation beside
 * it, so one window showed the same conversation twice. These cases drive the
 * real background entry point and assert on the wire traffic: the capsule is
 * told whether a panel is connected, and media only ever opens a panel when no
 * panel can take it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HoveredMedia } from '../src/content/media-hover/types.ts'

function chromeEvent<T extends unknown[]>() {
  const listeners = new Set<(...args: T) => void>()
  return {
    addListener: vi.fn((listener: (...args: T) => void) => { listeners.add(listener) }),
    removeListener: vi.fn((listener: (...args: T) => void) => { listeners.delete(listener) }),
    emit: (...args: T) => { for (const listener of listeners) listener(...args) },
  }
}

function panelPort() {
  const onMessage = chromeEvent<[unknown]>()
  const onDisconnect = chromeEvent<[]>()
  const postMessage = vi.fn()
  const port = { name: 'dsh-panel', postMessage, onMessage, onDisconnect } as unknown as chrome.runtime.Port
  return { onDisconnect, onMessage, port, postMessage }
}

function tab(tabId: number, windowId: number): chrome.tabs.Tab {
  return {
    id: tabId,
    index: 0,
    pinned: false,
    highlighted: true,
    active: true,
    incognito: false,
    selected: true,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    windowId,
    title: `Tab ${tabId}`,
    url: `https://example.com/${tabId}`,
  }
}

const MEDIA: HoveredMedia = {
  id: 'image:https://cdn.example.com/a.png',
  type: 'image',
  src: 'https://cdn.example.com/a.png',
  previewSrc: 'https://cdn.example.com/a.png',
  pageUrl: 'https://example.com/1',
  pageTitle: 'Example page',
  width: 480,
  height: 320,
  naturalWidth: 960,
  naturalHeight: 640,
  alt: '示例图片',
  capturedAt: 1_700_000_000_000,
}

function mockChrome() {
  const onConnect = chromeEvent<[chrome.runtime.Port]>()
  const onMessage = chromeEvent<[unknown, chrome.runtime.MessageSender, (response: unknown) => void]>()
  const open = vi.fn(async () => {})
  const query = vi.fn(async () => [tab(1, 1)])
  const sendMessage = vi.fn(async () => undefined)
  vi.stubGlobal('chrome', {
    alarms: { create: vi.fn(), clear: vi.fn(async () => true), onAlarm: chromeEvent<[chrome.alarms.Alarm]>() },
    notifications: { create: vi.fn(async () => ''), clear: vi.fn(async () => true), onClicked: chromeEvent<[string]>() },
    action: { onClicked: chromeEvent<[chrome.tabs.Tab]>() },
    runtime: {
      id: 'test-extension',
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onConnect,
      onMessage,
    },
    sidePanel: { open, setPanelBehavior: vi.fn(async () => {}) },
    storage: {
      local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
    },
    tabs: {
      get: vi.fn(async (tabId: number) => tab(tabId, 1)),
      query,
      sendMessage,
      onActivated: chromeEvent<[{ tabId: number; windowId: number }]>(),
      onUpdated: chromeEvent<[number, chrome.tabs.TabChangeInfo, chrome.tabs.Tab]>(),
      onReplaced: chromeEvent<[number, number]>(),
      onRemoved: chromeEvent<[number]>(),
    },
    webNavigation: { onCommitted: chromeEvent<[{ tabId: number; frameId: number }]>() },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: chromeEvent<[number]>(),
      onRemoved: chromeEvent<[number]>(),
    },
  } as unknown as typeof chrome)
  return { onConnect, onMessage, open, sendMessage }
}

/** Boots the worker, optionally with a panel already connected in `windowId`. */
async function bootWorker(options: { withPanel?: boolean } = {}) {
  const chromeMock = mockChrome()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })))
  await import('../src/background/index.ts')
  await vi.waitFor(() => { expect(chromeMock.onMessage.addListener).toHaveBeenCalled() })

  if (options.withPanel !== true) return { ...chromeMock, panel: null }
  const panel = panelPort()
  chromeMock.onConnect.emit(panel.port)
  panel.onMessage.emit({ type: 'panel.window', windowId: 1 })
  await vi.waitFor(() => {
    expect(panel.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'selection' }))
  })
  panel.postMessage.mockClear()
  return { ...chromeMock, panel }
}

function ask(runtimeMessages: ReturnType<typeof chromeEvent<[unknown, chrome.runtime.MessageSender, (response: unknown) => void]>>, windowId: number) {
  const respond = vi.fn()
  runtimeMessages.emit({ type: 'DSH_CHECK_SIDE_PANEL_OPEN' }, { id: 'test-extension', tab: tab(1, windowId) } as chrome.runtime.MessageSender, respond)
  return respond
}

function attach(
  runtimeMessages: ReturnType<typeof chromeEvent<[unknown, chrome.runtime.MessageSender, (response: unknown) => void]>>,
  windowId: number,
) {
  const respond = vi.fn()
  runtimeMessages.emit(
    { type: 'DSH_OPEN_ASSISTANT_WITH_MEDIA', payload: MEDIA },
    { id: 'test-extension', tab: tab(1, windowId) } as chrome.runtime.MessageSender,
    respond,
  )
  return respond
}

function mediaAttachMessages(postMessage: ReturnType<typeof vi.fn>): unknown[] {
  return postMessage.mock.calls
    .map(([message]) => message as { type?: string; media?: unknown })
    .filter((message) => message.type === 'media.attach')
    .map((message) => message.media)
}

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('side panel availability', () => {
  it('reports an active side panel while a panel port is connected', async () => {
    const { onMessage, panel } = await bootWorker({ withPanel: true })

    expect(panel).not.toBeNull()
    expect(ask(onMessage, 1)).toHaveBeenCalledWith({ ok: true, active: true })
  })

  it('reports no side panel for a window that has none', async () => {
    const { onMessage } = await bootWorker()

    expect(ask(onMessage, 1)).toHaveBeenCalledWith({ ok: true, active: false })
  })

  it('does not count a panel of another window', async () => {
    const { onMessage } = await bootWorker({ withPanel: true })

    expect(ask(onMessage, 7)).toHaveBeenCalledWith({ ok: true, active: false })
  })

  it('stops reporting a panel once its port disconnects', async () => {
    const { onMessage, panel } = await bootWorker({ withPanel: true })
    expect(ask(onMessage, 1)).toHaveBeenCalledWith({ ok: true, active: true })

    panel?.onDisconnect.emit()

    expect(ask(onMessage, 1)).toHaveBeenCalledWith({ ok: true, active: false })
  })
})

describe('media delivery with a panel already open', () => {
  it('hands the media to the connected panel instead of opening anything', async () => {
    const { onMessage, open, panel } = await bootWorker({ withPanel: true })

    const respond = attach(onMessage, 1)

    expect(mediaAttachMessages(panel!.postMessage)).toEqual([
      expect.objectContaining({ id: MEDIA.id, src: MEDIA.src }),
    ])
    expect(open).not.toHaveBeenCalled()
    expect(respond).toHaveBeenCalledWith({ ok: true, result: { channel: 'side-panel', tabId: 1, active: true } })
  })

  it('opens the panel and keeps the media for it when none is connected', async () => {
    const { onMessage, open } = await bootWorker()

    const respond = attach(onMessage, 1)

    expect(open).toHaveBeenCalledWith({ windowId: 1 })
    expect(respond).toHaveBeenCalledWith({ ok: true, result: { channel: 'side-panel', tabId: 1, active: false } })
  })

  it('does not offer this window media to another window panel', async () => {
    const { onMessage, panel } = await bootWorker({ withPanel: true })

    // The tab lives in window 7; the connected panel belongs to window 1.
    attach(onMessage, 7)

    expect(mediaAttachMessages(panel!.postMessage)).toEqual([])
  })

  it('rejects a malformed payload without touching the panel', async () => {
    const { onMessage, panel } = await bootWorker({ withPanel: true })
    const respond = vi.fn()

    onMessage.emit(
      { type: 'DSH_OPEN_ASSISTANT_WITH_MEDIA', payload: { id: 'x' } },
      { id: 'test-extension', tab: tab(1, 1) } as chrome.runtime.MessageSender,
      respond,
    )

    expect(mediaAttachMessages(panel!.postMessage)).toEqual([])
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ ok: false }))
  })
})
