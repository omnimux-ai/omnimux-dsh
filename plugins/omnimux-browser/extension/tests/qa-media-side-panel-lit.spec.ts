// @vitest-environment jsdom
/**
 * QA gate for the side-panel channel: media that just landed is lit AND carried.
 *
 * The capsule used to be believed only through the floating workstation. With a
 * panel already open the media now arrives over the panel port instead, so this
 * spec drives the real `<App />` in side-panel mode, hands it the payload the way
 * `onMediaAttach` does, and then reads what the model is actually sent.
 *
 * The two halves of the promise are checked where the user can see them: the chip
 * above the input shows the active highlight on its own, and submitting carries
 * the media without a second click.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BridgeState } from '../src/background/bridge.ts'
import type { PanelApi, HoveredMediaMessage } from '../src/panel/api.ts'

let panelApi: PanelApi
let onMediaAttach: ((media: HoveredMediaMessage) => void) | undefined

vi.mock('../src/panel/api.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/panel/api.ts')>(),
  connectPanel: (): PanelApi => panelApi,
}))

import { App } from '../src/panel/App.tsx'

const PNG_4X4 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR4nGP4z8DwHxkzkC4AADxAH+HggXe0AAAAAElFTkSuQmCC'),
  (char) => char.charCodeAt(0),
)

const IMAGE_LIMITS = {
  maxImageBytes: 5 * 1024 * 1024,
  maxImagesPerMessage: 4,
  maxMessageImageBytes: 12 * 1024 * 1024,
  maxImagePixels: 16_000_000,
  maxImageDimension: 4096,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
}

function pageMedia(id: string, src: string): HoveredMediaMessage {
  return { id, type: 'image', src, previewSrc: src, alt: `素材 ${id}` }
}

const FIRST = pageMedia('image:https://cdn.example.com/hero.png', 'https://cdn.example.com/hero.png')
const SECOND = pageMedia('image:https://cdn.example.com/cover.png', 'https://cdn.example.com/cover.png')

describe('QA gate: media delivered to an open side panel', () => {
  let root: Root
  let onStatus: ((state: BridgeState, caps: null) => void) | undefined
  let onResumeHint: ((sessionId: string | null) => void) | undefined
  let promptCalls: Array<{ content?: Array<{ type?: string; text?: string; name?: string }> }>

  beforeEach(() => {
    // A real side panel: no `mode=float`, so nothing renders into an iframe.
    window.history.replaceState(null, '', 'http://localhost:3000/panel.html')
    // Pin the interface language so the chip copy below is the Chinese surface.
    Object.defineProperty(window.navigator, 'language', { value: 'zh-CN', configurable: true })
    Object.defineProperty(window.navigator, 'languages', { value: ['zh-CN'], configurable: true })
    document.body.innerHTML = '<div id="root"></div>'
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    HTMLElement.prototype.scrollTo = vi.fn()
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({ dshSettings: { autoResumeSession: false } })) } },
      windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
    })

    promptCalls = []
    const unsubscribe = (): void => {}
    panelApi = {
      rpc: async <T = unknown>(method: string, payload?: unknown): Promise<T> => {
        if (method === 'session.create') return { sessionId: 'session-current' } as T
        if (method === 'session.history') {
          return { events: [], projections: { asOfSeq: -1, values: { imageLimits: IMAGE_LIMITS } } } as T
        }
        if (method === 'session.prompt') {
          promptCalls.push(payload as { content?: Array<{ type?: string; text?: string }> })
          return {} as T
        }
        throw new Error(`unexpected RPC: ${method}`)
      },
      respond: vi.fn(async () => undefined),
      onStatus: vi.fn((callback) => { onStatus = callback; return unsubscribe }),
      onEvent: vi.fn(() => unsubscribe),
      onApprovalRequest: vi.fn(() => unsubscribe),
      onApprovalResolved: vi.fn(() => unsubscribe),
      onTabAffinity: vi.fn(() => unsubscribe),
      onSelection: vi.fn(() => unsubscribe),
      onMediaAttach: vi.fn((callback) => { onMediaAttach = callback; return unsubscribe }),
      onSessionResumeHint: vi.fn((callback) => { onResumeHint = callback; return unsubscribe }),
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

  async function startPanel(): Promise<void> {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob([PNG_4X4], { type: 'image/png' }),
    })))
    await act(async () => { root.render(createElement(App)) })
    await act(async () => {
      onStatus?.('connected', null)
      onResumeHint?.(null)
    })
    await vi.waitFor(() => {
      const node = document.querySelector<HTMLTextAreaElement>('.composer textarea')
      expect(node).not.toBeNull()
      expect(node!.disabled).toBe(false)
    })
  }

  /**
   * Hands the panel one payload, exactly as the background port message does.
   *
   * The intake is a download plus a decode, so the call is awaited until THIS
   * media is on screen: a second delivery must not start while the first is still
   * being measured, which is a panel-level rejection rather than the case here.
   */
  async function deliver(media: HoveredMediaMessage): Promise<void> {
    await act(async () => { onMediaAttach?.(media) })
    await vi.waitFor(() => {
      const thumbnails = [...document.querySelectorAll<HTMLImageElement>('.media-item-chip img')]
      expect(thumbnails.map((node) => node.getAttribute('src'))).toContain(media.previewSrc)
    })
  }

  function chips(): HTMLDivElement[] {
    return [...document.querySelectorAll<HTMLDivElement>('.media-item-chip')]
  }

  /**
   * The chip showing one media element.
   *
   * The side panel renders the shelf twice (above the composer and inside its
   * footer), and the newest delivery comes first, so a position would be a guess;
   * the thumbnail is the identity the user sees.
   */
  function chipFor(media: HoveredMediaMessage): HTMLDivElement {
    const found = chips().find((chip) => chip.querySelector('img')?.getAttribute('src') === media.previewSrc)
    expect(found, `no chip for ${media.previewSrc}`).toBeDefined()
    return found!
  }

  async function typedText(text: string): Promise<void> {
    const textarea = document.querySelector<HTMLTextAreaElement>('.composer textarea')!
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(textarea, text)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  async function submit(): Promise<void> {
    const button = document.querySelector<HTMLButtonElement>('.clean-send-btn')!
    // The send button stays disabled while the panel is still measuring an
    // attachment, so the click waits for the composer to be genuinely ready.
    await vi.waitFor(() => { expect(button.disabled).toBe(false) })
    await act(async () => { button.click() })
    await vi.waitFor(() => { expect(promptCalls.length).toBeGreaterThan(0) })
  }

  /** The prompt text the model receives, image parts excluded. */
  function promptText(index = -1): string {
    const call = promptCalls.at(index)
    return (call?.content ?? []).filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n')
  }

  it('lights the chip on its own and carries the media when the prompt is sent', async () => {
    await startPanel()
    expect(chips()).toEqual([])

    await deliver(FIRST)

    // Half one: no click was needed for the highlight.
    expect(chips()[0].classList.contains('active')).toBe(true)
    expect(chips()[0].getAttribute('data-tooltip')).toBe('已点亮激活')

    await typedText('照着这个素材做一版')
    await submit()

    // Half two: the model carries the media, both as the real attachment and as
    // the lit-media context line.
    expect(promptText()).toContain(FIRST.src)
    expect(promptText()).toContain('已点亮挂载的页面媒体素材')
    const imageParts = (promptCalls.at(-1)?.content ?? []).filter((part) => part.type === 'image')
    expect(imageParts).toHaveLength(1)
    expect((imageParts[0] as { name?: string }).name).toContain(FIRST.id)
  })

  it.fails('documents defect: a click on a lit chip drops the carried media while every chip stays lit', async () => {
    await startPanel()
    await deliver(FIRST)
    await deliver(SECOND)
    // Both deliveries are on screen and lit, with no click from the user.
    expect(chipFor(FIRST).classList.contains('active')).toBe(true)
    expect(chipFor(SECOND).classList.contains('active')).toBe(true)

    await act(async () => { chipFor(SECOND).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await typedText('两个素材都要')
    await submit()

    // Every chip is still lit on screen, so every one of them must still be
    // carried. Today the click reports an empty list, and the send then carries no
    // lit-media context at all while the cards keep claiming to be active.
    expect(chipFor(FIRST).classList.contains('active')).toBe(true)
    expect(chipFor(SECOND).classList.contains('active')).toBe(true)
    expect(promptText()).toContain('已点亮挂载的页面媒体素材')
    expect(promptText()).toContain(FIRST.src)
    expect(promptText()).toContain(SECOND.src)
  })
})
