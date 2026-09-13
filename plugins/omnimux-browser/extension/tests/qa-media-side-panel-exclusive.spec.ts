// @vitest-environment jsdom
/**
 * QA gate, cross-layer: one window never shows the conversation twice.
 *
 * Verifies the headline requirement end to end through production code only —
 * the real page transport, the real action bridge, the real background worker and
 * a real panel port — instead of the two halves separately. With a side panel
 * connected in the page's window, "add to conversation" must put the media on that
 * panel's port and must never touch the floating workstation handle, which is
 * left installed precisely so that a wrong path would be observable here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaActionBridge, browserTransport } from '../src/content/media-hover/actions.ts'
import { hoverCopy } from '../src/content/media-hover/copy.ts'
import { RUNTIME_MESSAGE } from '../src/content/media-hover/messages.ts'
import type { HoveredMedia } from '../src/content/media-hover/types.ts'

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

function chromeEvent<T extends unknown[]>() {
  const listeners = new Set<(...args: T) => void>()
  return {
    addListener: vi.fn((listener: (...args: T) => void) => { listeners.add(listener) }),
    removeListener: vi.fn((listener: (...args: T) => void) => { listeners.delete(listener) }),
    emit: (...args: T) => { for (const listener of listeners) listener(...args) },
  }
}

type RuntimeMessageEvent = ReturnType<typeof chromeEvent<[
  unknown,
  chrome.runtime.MessageSender,
  (response: unknown) => void,
]>>

/**
 * A runtime whose `sendMessage` really reaches the worker's own listener.
 *
 * The capsule asks the worker over this channel, so a stub that answered on its
 * own would test the stub instead of the routing rule.
 */
function runtimeSendMessage(onMessage: RuntimeMessageEvent) {
  return vi.fn((message: unknown) => new Promise<unknown>((resolve) => {
    let settled = false
    const respond = (response: unknown) => {
      if (settled) return
      settled = true
      resolve(response)
    }
    onMessage.emit(message, {
      id: 'test-extension',
      tab: { id: 1, windowId: 1, url: 'https://example.com/1' },
    } as chrome.runtime.MessageSender, respond)
    // A listener that never answers must not hang the caller.
    setTimeout(() => respond(undefined), 0)
  }))
}

function mockChrome() {
  const onConnect = chromeEvent<[chrome.runtime.Port]>()
  const onMessage = chromeEvent<[unknown, chrome.runtime.MessageSender, (response: unknown) => void]>()
  const open = vi.fn(async () => {})
  vi.stubGlobal('chrome', {
    alarms: { create: vi.fn(), clear: vi.fn(async () => true), onAlarm: chromeEvent<[chrome.alarms.Alarm]>() },
    notifications: { create: vi.fn(async () => ''), clear: vi.fn(async () => true), onClicked: chromeEvent<[string]>() },
    action: { onClicked: chromeEvent<[chrome.tabs.Tab]>() },
    runtime: {
      id: 'test-extension',
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onConnect,
      onMessage,
      sendMessage: runtimeSendMessage(onMessage),
    },
    sidePanel: { open, setPanelBehavior: vi.fn(async () => {}) },
    storage: {
      local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
    },
    tabs: {
      get: vi.fn(async () => ({ id: 1, windowId: 1, url: 'https://example.com/1' })),
      query: vi.fn(async () => [{ id: 1, windowId: 1, url: 'https://example.com/1' }]),
      sendMessage: vi.fn(async () => undefined),
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
  return { onConnect, onMessage, open }
}

type Workstation = { openWithMedia: ReturnType<typeof vi.fn>; isOpen: () => boolean }

/** Boots the worker and installs a floating workstation that records its use. */
async function boot(options: { withPanel?: boolean } = {}) {
  const chromeMock = mockChrome()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })))
  await import('../src/background/index.ts')
  await vi.waitFor(() => { expect(chromeMock.onMessage.addListener).toHaveBeenCalled() })

  const workstation: Workstation = { openWithMedia: vi.fn(async () => true), isOpen: () => false }
  ;(globalThis as Record<string, unknown>).__dshBrowserWorkstation = workstation

  let panel: { postMessage: ReturnType<typeof vi.fn> } | null = null
  if (options.withPanel === true) {
    const onPanelMessage = chromeEvent<[unknown]>()
    const postMessage = vi.fn()
    const port = {
      name: 'dsh-panel',
      postMessage,
      onMessage: onPanelMessage,
      onDisconnect: chromeEvent<[]>(),
    } as unknown as chrome.runtime.Port
    chromeMock.onConnect.emit(port)
    onPanelMessage.emit({ type: 'panel.window', windowId: 1 })
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'selection' }))
    })
    postMessage.mockClear()
    panel = { postMessage }
  }
  return { ...chromeMock, panel, workstation }
}

function mediaAttachCalls(postMessage: ReturnType<typeof vi.fn>) {
  return postMessage.mock.calls
    .map(([message]) => message as { type?: string; media?: unknown })
    .filter((message) => message.type === 'media.attach')
    .map((message) => message.media)
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__dshBrowserWorkstation
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('QA gate: an open side panel owns the conversation', () => {
  it('routes the media to the panel port and never wakes the floating workstation', async () => {
    const { open, panel, workstation } = await boot({ withPanel: true })
    const bridge = new MediaActionBridge(browserTransport(() => hoverCopy('zh')))

    const outcome = await bridge.attachToConversation(MEDIA)

    expect(outcome).toMatchObject({ ok: true, status: 'attached', channel: 'side-panel' })
    // The floating workstation was installed and is reachable: only the routing
    // rule keeps it shut.
    expect(workstation.openWithMedia).not.toHaveBeenCalled()
    // Nothing had to be opened either: the panel already on screen took the media.
    expect(open).not.toHaveBeenCalled()
    expect(mediaAttachCalls(panel!.postMessage)).toEqual([
      expect.objectContaining({ id: MEDIA.id, src: MEDIA.src }),
    ])
  })

  it('drives the floating workstation only when the worker proves no panel is open', async () => {
    const { panel, workstation } = await boot()
    const bridge = new MediaActionBridge(browserTransport(() => hoverCopy('zh')))

    const outcome = await bridge.attachToConversation(MEDIA)

    expect(outcome).toMatchObject({ ok: true, channel: 'workbench' })
    expect(workstation.openWithMedia).toHaveBeenCalledTimes(1)
    expect(panel).toBeNull()
  })

  it('never wakes the workstation when the worker cannot be reached at all', async () => {
    const { workstation } = await boot()
    // The worker behind the page is gone: every runtime message from the capsule
    // is rejected, so the panel question has no answer to trust.
    const chromeMock = chrome as unknown as { runtime: { sendMessage: unknown } }
    chromeMock.runtime.sendMessage = vi.fn(async () => { throw new Error('receiving end does not exist') })
    const bridge = new MediaActionBridge(browserTransport(() => hoverCopy('zh')))

    const outcome = await bridge.attachToConversation(MEDIA)

    expect(workstation.openWithMedia).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ ok: false, status: 'failed' })
    expect(RUNTIME_MESSAGE.checkSidePanelOpen).toBe('DSH_CHECK_SIDE_PANEL_OPEN')
  })
})
