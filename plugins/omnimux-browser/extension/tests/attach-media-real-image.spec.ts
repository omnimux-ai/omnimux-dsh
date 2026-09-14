// @vitest-environment jsdom
/**
 * Lit page media becomes a real image attachment.
 *
 * Contract: `specs/browser-attach-media.spec.md` — an image the user lights on the
 * page is downloaded by the panel, admitted by the SAME `prepareImageFiles` the
 * picker uses, and sent as image bytes; its address never rides the message body.
 * A video cannot use the attachment channel (`IMAGE_MEDIA_TYPES` admits images
 * only), so it keeps travelling as a URL.
 *
 * Every case drives the real `<App />`; the only stand-ins are the browser
 * plumbing the panel expects (a dsh port, storage, and `fetch`).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BridgeState } from '../src/background/bridge.ts'
import type { HoveredMediaMessage, PanelApi } from '../src/panel/api.ts'
import type { SniffedMediaItem } from '../src/panel/components/MediaSnifferBar.tsx'

let panelApi: PanelApi
let onStatus: ((state: BridgeState, caps: null) => void) | undefined
let onResumeHint: ((sessionId: string | null) => void) | undefined
let onMediaAttach: ((media: HoveredMediaMessage) => void) | undefined

vi.mock('../src/panel/api.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/panel/api.ts')>(),
  connectPanel: (): PanelApi => panelApi,
}))

import { App } from '../src/panel/App.tsx'
import {
  attachFailureLine,
  downloadPageMedia,
  MediaDownloadError,
  MEDIA_DOWNLOAD_TIMEOUT_MS,
} from '../src/panel/attachments.ts'
import { PANEL_COPY } from '../src/panel/strings.ts'

const copy = PANEL_COPY.zh

/** The host's image projection, as `session.history` carries it. */
const IMAGE_LIMITS = {
  maxImageBytes: 5 * 1024 * 1024,
  maxImagesPerMessage: 4,
  maxMessageImageBytes: 12 * 1024 * 1024,
  maxImagePixels: 16_000_000,
  maxImageDimension: 4096,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
}

/** A real 4x4 PNG, byte for byte. */
const PNG_4X4 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR4nGP4z8DwHxkzkC4AADxAH+HggXe0AAAAAElFTkSuQmCC'),
  (char) => char.charCodeAt(0),
)

interface CapturedPrompt {
  content?: Array<{ type?: string; text?: string; mediaType?: string; name?: string; data?: string }>
}

function imageItem(url: string, alt?: string, id = `image:${url}`): SniffedMediaItem {
  return { id, type: 'image', src: url, previewSrc: url, ...(alt === undefined ? {} : { alt }) }
}

function videoItem(url: string, previewSrc: string, alt?: string): SniffedMediaItem {
  return { id: `video:${url}`, type: 'video', src: url, previewSrc, ...(alt === undefined ? {} : { alt }) }
}

/** A response the panel can turn into a `File` without touching the network. */
function imageResponse(bytes: Uint8Array = PNG_4X4, type = 'image/png'): Response {
  const body = new Uint8Array(bytes).buffer as ArrayBuffer
  return { ok: true, status: 200, blob: async () => new Blob([body], { type }) } as unknown as Response
}

describe('lit page media becomes a real attachment', () => {
  let root: Root
  let promptCalls: CapturedPrompt[]
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Floating mode: the panel takes shelf fixtures over `window.postMessage`,
    // which is also how the real page sensor feeds it.
    window.history.replaceState(null, '', 'http://localhost:3000/?mode=float')
    Object.defineProperty(window.navigator, 'language', { value: 'zh-CN', configurable: true })
    Object.defineProperty(window.navigator, 'languages', { value: ['zh-CN'], configurable: true })
    document.body.innerHTML = '<div id="root"></div>'
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    HTMLElement.prototype.scrollTo = vi.fn()
    // jsdom has no image decoder; `prepareImageFiles` measures through
    // `createImageBitmap` when it exists, so the measurement stays real code.
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 640, height: 360, close: () => {} })))
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({ dshSettings: { autoResumeSession: false } })) } },
      windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
      runtime: { sendMessage: vi.fn(async () => null) },
      tabs: { query: vi.fn(async () => []), sendMessage: vi.fn(async () => null) },
    })

    promptCalls = []
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const unsubscribe = (): void => {}
    panelApi = {
      rpc: async <T = unknown>(method: string, payload?: unknown): Promise<T> => {
        if (method === 'session.create') return { sessionId: 'session-current' } as T
        if (method === 'session.history') {
          return { events: [], projections: { asOfSeq: -1, values: { imageLimits: IMAGE_LIMITS } } } as T
        }
        if (method === 'session.prompt') {
          promptCalls.push(payload as CapturedPrompt)
          return {} as T
        }
        if (method === 'session.selectModel' || method === 'session.cancel') return {} as T
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
    vi.useRealTimers()
  })

  async function startPanel(): Promise<void> {
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

  /** Publish the page's sensed media into the lit shelf. */
  async function publish(items: SniffedMediaItem[]): Promise<void> {
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'MEDIA_SNIFFED_RESULT', payload: items } }))
    })
    await vi.waitFor(() => {
      const shown = [...document.querySelectorAll('.media-item-chip')].map(chipSrc)
      expect(shown).toEqual(items.map((item) => item.previewSrc))
    })
  }

  function chipSrc(chip: Element): string | null {
    return chip.querySelector('img')?.getAttribute('src') ?? null
  }

  function chipFor(item: SniffedMediaItem): HTMLDivElement {
    const found = [...document.querySelectorAll<HTMLDivElement>('.media-item-chip')]
      .find((chip) => chipSrc(chip) === item.previewSrc)
    expect(found, `no chip for ${item.previewSrc}`).toBeDefined()
    return found!
  }

  /** Light a chip the way a user does. Nothing is awaited: the intake is async. */
  async function light(item: SniffedMediaItem): Promise<void> {
    await act(async () => { chipFor(item).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  }

  /** The URLs the panel actually requested from the page — not its own bridge probe. */
  function mediaFetches(): string[] {
    return fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('cdn.example.com'))
  }

  function draftImageSrcs(): string[] {
    return [...document.querySelectorAll<HTMLImageElement>('.draft-images img')].map((img) => img.getAttribute('src') ?? '')
  }

  async function waitForDraft(count: number): Promise<void> {
    await vi.waitFor(() => { expect(draftImageSrcs()).toHaveLength(count) })
  }

  function errorText(): string | null {
    return document.querySelector('.error')?.textContent ?? null
  }

  async function waitForError(): Promise<void> {
    await vi.waitFor(() => { expect(errorText()).not.toBeNull() })
  }

  function promptText(index = -1): string {
    return (promptCalls.at(index)?.content ?? []).filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n')
  }

  function promptImages(index = -1) {
    return (promptCalls.at(index)?.content ?? []).filter((part) => part.type === 'image')
  }

  async function type(text: string): Promise<void> {
    const textarea = document.querySelector<HTMLTextAreaElement>('.composer textarea')!
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(textarea, text)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  async function submit(): Promise<void> {
    const button = document.querySelector<HTMLButtonElement>('.clean-send-btn')!
    await vi.waitFor(() => { expect(button.disabled).toBe(false) })
    await act(async () => { button.click() })
    await vi.waitFor(() => { expect(promptCalls.length).toBeGreaterThan(0) })
  }

  // ---------------------------------------------------------------- AC-1 / AC-3

  it('AC-1 + AC-3: lighting an image puts it in the draft and sends real bytes', async () => {
    fetchMock.mockResolvedValue(imageResponse())
    await startPanel()
    const hero = imageItem('https://cdn.example.com/hero.png', '主视觉')
    await publish([hero])

    await light(hero)

    // AC-1: the draft holds the downloaded image, as a data URL.
    await waitForDraft(1)
    const drafts = draftImageSrcs()
    expect(drafts[0].startsWith('data:image/png;base64,')).toBe(true)

    await type('照着这个素材做一版')
    await submit()

    // AC-3: the model is handed the bytes, not a promise to fetch them.
    const images = promptImages()
    expect(images).toHaveLength(1)
    expect(images[0]).toMatchObject({ type: 'image', mediaType: 'image/png' })
    expect(images[0].data).toBe(drafts[0].slice('data:image/png;base64,'.length))
    expect((images[0].data ?? '').length).toBeGreaterThan(0)
    expect(images[0].name).toContain(hero.id)
  })

  it('AC-2: the body keeps the user text and drops the image address', async () => {
    fetchMock.mockResolvedValue(imageResponse())
    await startPanel()
    const hero = imageItem('https://cdn.example.com/hero.png', '主视觉')
    await publish([hero])

    await light(hero)
    await waitForDraft(1)
    await type('照着这个素材做一版')
    await submit()

    expect(promptText()).toBe('照着这个素材做一版')
    expect(promptText()).not.toContain('https://cdn.example.com/hero.png')
    expect(promptText()).not.toContain('已点亮挂载的页面媒体素材')
  })

  // ---------------------------------------------------------------------- AC-9

  it('AC-9: nothing is fetched until the user lights a chip', async () => {
    fetchMock.mockResolvedValue(imageResponse())
    await startPanel()
    const hero = imageItem('https://cdn.example.com/hero.png', '主视觉')
    const clip = videoItem('https://cdn.example.com/clip.mp4', 'https://cdn.example.com/clip.jpg', '原片')
    await publish([hero, clip])

    expect(mediaFetches()).toEqual([])

    await light(hero)
    await waitForDraft(1)

    expect(mediaFetches()).toEqual([hero.src])
  })

  // ---------------------------------------------------------------------- AC-4

  it('AC-4a: a failed download is reported, and leaves no half-attached media', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await startPanel()
    const hero = imageItem('https://cdn.example.com/hero.png', '主视觉')
    await publish([hero])

    await light(hero)
    await vi.waitFor(() => { expect(errorText()).toBe(copy.app.attachMediaDownloadFailed('主视觉')) })

    expect(draftImageSrcs()).toEqual([])
    expect(mediaFetches()).toEqual([hero.src])
  })

  it('AC-4b: a download that never answers times out with its own message', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    await startPanel()
    const hero = imageItem('https://cdn.example.com/hero.png', '主视觉')
    await publish([hero])

    await light(hero)
    await act(async () => { await vi.advanceTimersByTimeAsync(MEDIA_DOWNLOAD_TIMEOUT_MS + 10) })

    expect(errorText()).toBe(copy.app.attachMediaTimeout('主视觉', Math.round(MEDIA_DOWNLOAD_TIMEOUT_MS / 1000)))
    expect(draftImageSrcs()).toEqual([])
  })

  it('AC-4c: a download outside IMAGE_MEDIA_TYPES is refused by the shared intake', async () => {
    fetchMock.mockResolvedValue(imageResponse(new Uint8Array([1, 2, 3]), 'image/svg+xml'))
    await startPanel()
    const vector = imageItem('https://cdn.example.com/vector.svg', '图标')
    await publish([vector])

    await light(vector)
    await waitForError()

    // The refusal carries the download's own file name, exactly like a paste.
    expect(errorText()).toMatch(/^page-media-image:https:\/\/cdn\.example\.com\/vector\.svg\./)
    expect(errorText()).toContain('不是当前 dsh 宿主支持的图片格式。')
    expect(draftImageSrcs()).toEqual([])
  })

  it('AC-4d: an image over the projected byte limit is refused by the shared intake', async () => {
    fetchMock.mockResolvedValue(imageResponse(new Uint8Array(IMAGE_LIMITS.maxImageBytes + 1)))
    await startPanel()
    const huge = imageItem('https://cdn.example.com/huge.png', '巨图')
    await publish([huge])

    await light(huge)
    await waitForError()

    expect(errorText()).toContain('超过单张图片')

    expect(errorText()).toMatch(/^page-media-image:https:\/\/cdn\.example\.com\/huge\.png\.[a-z]+ 超过单张图片 5 MB 的限制。$/)
    expect(draftImageSrcs()).toEqual([])
  })

  // ---------------------------------------------------------------------- AC-5

  it('AC-5: one failure never cancels the next item, and pasted images append', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://cdn.example.com/broken.png') throw new TypeError('Failed to fetch')
      return imageResponse()
    })
    await startPanel()
    const broken = imageItem('https://cdn.example.com/broken.png', '坏图')
    const good = imageItem('https://cdn.example.com/good.png', '好图')
    await publish([broken, good])

    await light(broken)
    await vi.waitFor(() => { expect(errorText()).toBe(copy.app.attachMediaDownloadFailed('坏图')) })

    await light(good)
    // The successful item lands, and the stale failure line is cleared.
    await waitForDraft(1)
    await vi.waitFor(() => { expect(errorText()).toBeNull() })
    // Exactly one image: the refused one never reached the draft.
    expect(mediaFetches()).toEqual([broken.src, good.src])

    // A hand-picked file joins the same draft instead of replacing it.
    const input = document.querySelector<HTMLInputElement>('.image-file-input')!
    const pasted = new File([PNG_4X4], 'pasted.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [pasted], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await vi.waitFor(() => { expect(draftImageSrcs()).toHaveLength(2) })
  })

  // ---------------------------------------------------------------------- AC-6

  it('AC-6: a video keeps its address in the body and is never downloaded', async () => {
    fetchMock.mockResolvedValue(imageResponse())
    await startPanel()
    const clip = videoItem('https://cdn.example.com/clip.mp4', 'https://cdn.example.com/clip.jpg', '原片')
    await publish([clip])

    await light(clip)
    expect(mediaFetches()).toEqual([])
    expect(draftImageSrcs()).toEqual([])

    await type('看看这段')
    await submit()

    expect(promptText()).toContain('已点亮挂载的页面媒体素材')
    expect(promptText()).toContain('[媒体 1] (VIDEO): https://cdn.example.com/clip.mp4')
    expect(promptImages()).toHaveLength(0)
  })

  // ---------------------------------------------------------------------- AC-7

  it('AC-7: the lit shelf renders no format text at all', async () => {
    await startPanel()
    const hero = imageItem('https://cdn.example.com/hero.png', '主视觉')
    const clip = videoItem('https://cdn.example.com/clip.mp4', 'https://cdn.example.com/clip.jpg', '原片')
    await publish([hero, clip])

    expect(document.querySelectorAll('.media-type-badge')).toHaveLength(0)
    expect(chipFor(hero).textContent).toBe('')
    expect(chipFor(clip).textContent).toBe('')
    expect(chipFor(hero).querySelectorAll('svg')).toHaveLength(0)
    expect([...document.querySelectorAll('.media-item-chip')].map((chip) => chip.textContent).join('')).not.toMatch(/JPG|PNG|MP4|VIDEO/)
  })

  it('AC-6 + AC-7: a video chip carries exactly one inline SVG play icon', async () => {
    await startPanel()
    const clip = videoItem('https://cdn.example.com/clip.mp4', 'https://cdn.example.com/clip.jpg', '原片')
    await publish([clip])

    const svg = chipFor(clip).querySelector('svg')
    expect(svg).not.toBeNull()
    expect(chipFor(clip).querySelectorAll('svg')).toHaveLength(1)
    expect(svg!.parentElement?.className).toBe('media-play-badge')
    expect(svg!.getAttribute('aria-hidden')).toBe('true')
  })

  // -------------------------------------------------- hover capsule (port path)

  it('AC-1: media the worker routed to an open panel also lands as a real image', async () => {
    fetchMock.mockResolvedValue(imageResponse())
    await startPanel()

    await act(async () => {
      onMediaAttach?.({
        id: 'image:https://cdn.example.com/routed.png',
        type: 'image',
        src: 'https://cdn.example.com/routed.png',
        previewSrc: 'https://cdn.example.com/routed.png',
        alt: '路由素材',
      })
    })
    await vi.waitFor(() => { expect(draftImageSrcs()).toHaveLength(1) })

    await type('用这张')
    await submit()
    expect(promptImages()).toHaveLength(1)
    expect(promptText()).not.toContain('routed.png')
  })
})

describe('downloadPageMedia', () => {
  it('names the file after the lit media and keeps the declared type', async () => {
    const file = await downloadPageMedia('https://cdn.example.com/a.png', 'image:1', {
      fetchImpl: (async () => imageResponse(new Uint8Array([1, 2, 3]), 'image/jpeg')) as unknown as typeof fetch,
    })

    expect(file.type).toBe('image/jpeg')
    expect(file.name).toBe('page-media-image:1.jpeg')
    expect(file.size).toBe(3)
  })

  it('normalizes the image/jpg alias and falls back to the URL extension', async () => {
    const aliased = await downloadPageMedia('https://cdn.example.com/a', 'x', {
      fetchImpl: (async () => imageResponse(new Uint8Array([1]), 'image/jpg')) as unknown as typeof fetch,
    })
    expect(aliased.type).toBe('image/jpeg')

    const byExtension = await downloadPageMedia('https://cdn.example.com/b.webp?w=2', 'y', {
      fetchImpl: (async () => imageResponse(new Uint8Array([1]), '')) as unknown as typeof fetch,
    })
    expect(byExtension.type).toBe('image/webp')
  })

  it('leaves an unidentifiable response untyped so the shared intake refuses it', async () => {
    const file = await downloadPageMedia('https://cdn.example.com/stream', 'z', {
      fetchImpl: (async () => imageResponse(new Uint8Array([1]), '')) as unknown as typeof fetch,
    })
    expect(file.type).toBe('')
  })

  it('reports a non-ok response, an empty body, and a timeout as their own failures', async () => {
    await expect(downloadPageMedia('https://cdn.example.com/404', 'x', {
      fetchImpl: (async () => ({ ok: false, status: 404 }) as unknown as Response) as unknown as typeof fetch,
    })).rejects.toMatchObject({ name: 'MediaDownloadError', reason: 'download-failed' })

    await expect(downloadPageMedia('https://cdn.example.com/empty', 'x', {
      fetchImpl: (async () => imageResponse(new Uint8Array(0))) as unknown as typeof fetch,
    })).rejects.toMatchObject({ reason: 'download-failed' })

    const hanging = (async (_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })) as unknown as typeof fetch
    await expect(downloadPageMedia('https://cdn.example.com/slow', 'x', { fetchImpl: hanging, timeoutMs: 5 }))
      .rejects.toMatchObject({ reason: 'timeout' })

    expect(new MediaDownloadError('timeout')).toMatchObject({ name: 'MediaDownloadError', reason: 'timeout' })
  })
})

describe('attachFailureLine', () => {
  const summary = copy.app.attachMediaSummary

  it('says nothing without a failure and speaks plainly for a single one', () => {
    expect(attachFailureLine([], 2, summary)).toBeNull()
    expect(attachFailureLine(['A 失败'], 2, summary)).toBe('A 失败')
  })

  it('collapses several failures into one summary instead of one line per item', () => {
    const line = attachFailureLine(['A 失败', 'B 失败', 'C 失败'], 4, summary)
    expect(line).toBe(summary(3, 4, 'A 失败'))
    expect(line).toBe('4 个素材中有 3 个未加入待发区 —— A 失败')
    expect(PANEL_COPY.en.app.attachMediaSummary(3, 4, 'A failed'))
      .toBe('3 of 4 page media are not in your message — A failed')
  })
})
