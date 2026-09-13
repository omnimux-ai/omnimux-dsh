// @vitest-environment jsdom
/**
 * QA gate for the "add to conversation" loop, driven through the real panel.
 *
 * The capsule only paints its confirmed state from the panel's receipt, so the
 * receipt has to be earned: the media must really land in the draft before the
 * panel reports success. This spec renders the panel in floating-workbench mode,
 * pushes a `MEDIA_ATTACH_REQUEST` at it exactly as the hover capsule does, and
 * inspects the `MEDIA_ATTACH_RESULT` that travels back.
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

const HOVERED_MEDIA = {
  id: 'image:https://cdn.example.com/hero.png',
  type: 'image' as const,
  src: 'https://cdn.example.com/hero.png',
  previewSrc: 'https://cdn.example.com/hero.png',
  pageUrl: 'https://page.example.com/post/1',
  pageTitle: '示例页面',
  width: 640,
  height: 420,
  naturalWidth: 1280,
  naturalHeight: 840,
  alt: '示例图片',
  capturedAt: 1_700_000_000_000,
}

/**
 * A real 4x4 PNG, byte for byte.
 *
 * The success case has to prove the media reached the draft, and the draft
 * intake measures what it receives before mounting it — so the download must
 * answer with decodable image bytes rather than an arbitrary blob.
 */
const PNG_4X4 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR4nGP4z8DwHxkzkC4AADxAH+HggXe0AAAAAElFTkSuQmCC'),
  (char) => char.charCodeAt(0),
)

/** The host's image projection, as `session.history` carries it. */
const IMAGE_LIMITS = {
  maxImageBytes: 5 * 1024 * 1024,
  maxImagesPerMessage: 4,
  maxMessageImageBytes: 12 * 1024 * 1024,
  maxImagePixels: 16_000_000,
  maxImageDimension: 4096,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
}

/** Every message the panel posted back to its parent frame. */
interface PostedMessage {
  source?: unknown
  type?: unknown
  payload?: { id?: unknown; ok?: unknown; reason?: unknown }
}

describe('QA: the hover capsule pushes media into the conversation', () => {
  let root: Root
  let onStatus: ((state: BridgeState, caps: null) => void) | undefined
  let onResumeHint: ((sessionId: string | null) => void) | undefined
  let postMessage: Mock<(message: unknown, targetOrigin?: string) => void>

  beforeEach(() => {
    window.history.replaceState(null, '', 'http://localhost:3000/?mode=float')
    document.body.innerHTML = '<div id="root"></div>'
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    HTMLElement.prototype.scrollTo = vi.fn()
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({ dshSettings: { autoResumeSession: false } })) } },
      windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
    })
    postMessage = vi.fn()
    window.postMessage = postMessage as unknown as typeof window.postMessage

    const unsubscribe = (): void => {}
    panelApi = {
      rpc: async <T = unknown>(method: string): Promise<T> => {
        if (method === 'session.create') return { sessionId: 'session-current' } as T
        // The host ships its image projection with the session history; the
        // panel can only mount an attachment once it has seen it.
        if (method === 'session.history') {
          return { events: [], projections: { asOfSeq: -1, values: { imageLimits: IMAGE_LIMITS } } } as T
        }
        if (method === 'session.prompt') return {} as T
        throw new Error(`unexpected RPC: ${method}`)
      },
      respond: vi.fn(async () => undefined),
      onStatus: vi.fn((callback) => { onStatus = callback; return unsubscribe }),
      onEvent: vi.fn(() => unsubscribe),
      onApprovalRequest: vi.fn(() => unsubscribe),
      onApprovalResolved: vi.fn(() => unsubscribe),
      onTabAffinity: vi.fn(() => unsubscribe),
      onSelection: vi.fn(() => unsubscribe),
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
    await act(async () => { root.render(createElement(App)) })
    await act(async () => {
      onStatus?.('connected', null)
      onResumeHint?.(null)
    })
    // The composer must be live: focusing a disabled field is a no-op, which
    // would make the focus assertion meaningless.
    await vi.waitFor(() => {
      const node = document.querySelector<HTMLTextAreaElement>('.composer textarea')
      expect(node).not.toBeNull()
      expect(node!.disabled).toBe(false)
    })
  }

  /** Pushes one hovered media at the panel, exactly like the capsule does. */
  async function pushHoveredMedia(): Promise<void> {
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'MEDIA_ATTACH_REQUEST', payload: HOVERED_MEDIA },
      }))
    })
  }

  /** The receipt the capsule reads, once it arrives. */
  function receipt(): PostedMessage | undefined {
    return postMessage.mock.calls
      .map(([message]) => message as PostedMessage)
      .find((message) => message.type === 'MEDIA_ATTACH_RESULT')
  }

  it('reports success and focuses the composer when the media downloads', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob([PNG_4X4], { type: 'image/png' }),
    })))
    await startPanel()

    await pushHoveredMedia()
    await vi.waitFor(() => { expect(receipt()).toBeDefined() })

    expect(receipt()?.payload).toMatchObject({ id: HOVERED_MEDIA.id, ok: true })
    // The user can type straight away once the media is mounted.
    expect(document.activeElement?.tagName).toBe('TEXTAREA')
  })

  it('reports success only after the media really landed in the draft', async () => {
    // QA-2: a cross-origin media URL is the expected failure. The download is
    // swallowed inside the panel's image pipeline, so the attachment never
    // happens — yet the capsule is told the media was added.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await startPanel()

    await pushHoveredMedia()
    await vi.waitFor(() => { expect(receipt()).toBeDefined() })

    // The receipt is the only signal the capsule consumes, so a false `ok` here
    // paints "added to the conversation" for media that was never mounted.
    expect(receipt()?.payload).toMatchObject({ id: HOVERED_MEDIA.id, ok: false })
  })

  it('does not report success for a media payload it cannot read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob([]) })))
    await startPanel()

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'MEDIA_ATTACH_REQUEST', payload: { id: 42 } },
      }))
    })

    expect(receipt()).toBeUndefined()
  })
})
