// @vitest-environment jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true

/**
 * A capsule attachment arrives lit.
 *
 * Reported defect: after "add to conversation", the media card above the input
 * stayed dim and needed a second click before the model would carry it. These
 * cases cover the two halves of that contract — the port payload is validated
 * and handed to the draft intake, and a chip whose media is attached renders as
 * active without any click.
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectPanel, parseHoveredMediaMessage } from '../src/panel/api.ts'
import { MediaSnifferBar, type SniffedMediaItem } from '../src/panel/components/MediaSnifferBar.tsx'

const MEDIA = {
  id: 'image:https://cdn.example.com/a.png',
  type: 'image' as const,
  src: 'https://cdn.example.com/a.png',
  previewSrc: 'https://cdn.example.com/a.png',
  alt: '示例图片',
}

function stubPort() {
  let receive: ((message: unknown) => void) | undefined
  const port = {
    postMessage: vi.fn(),
    onMessage: { addListener: vi.fn((listener: (message: unknown) => void) => { receive = listener }) },
    onDisconnect: { addListener: vi.fn() },
  }
  vi.stubGlobal('chrome', { runtime: { connect: vi.fn(() => port) } })
  return { receive: (message: unknown) => receive?.(message) }
}

describe('panel media intake', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('delivers page media the worker routed to this panel', () => {
    const { receive } = stubPort()
    const api = connectPanel()
    const seen: unknown[] = []
    api.onMediaAttach((media) => seen.push(media))

    receive({ type: 'media.attach', media: MEDIA })

    expect(seen).toEqual([MEDIA])
  })

  it('ignores an unusable payload instead of mounting it in the draft', () => {
    const { receive } = stubPort()
    const api = connectPanel()
    const seen: unknown[] = []
    api.onMediaAttach((media) => seen.push(media))

    receive({ type: 'media.attach', media: { id: 'x' } })
    receive({ type: 'media.attach', media: { ...MEDIA, src: '' } })
    receive({ type: 'media.attach', media: { ...MEDIA, type: 'audio' } })

    expect(seen).toEqual([])
  })

  it('fills a missing thumbnail from the media address', () => {
    expect(parseHoveredMediaMessage({ ...MEDIA, previewSrc: undefined }))
      .toMatchObject({ previewSrc: MEDIA.src })
  })

  it('stops delivering after the caller unsubscribes', () => {
    const { receive } = stubPort()
    const api = connectPanel()
    const seen: unknown[] = []
    const off = api.onMediaAttach((media) => seen.push(media))

    off()
    receive({ type: 'media.attach', media: MEDIA })

    expect(seen).toEqual([])
  })
})

describe('lit media cards', () => {
  let container: HTMLDivElement
  let root: Root

  const items: SniffedMediaItem[] = [
    { id: 'm1', type: 'video', src: 'https://example.com/v.mp4', previewSrc: 'https://example.com/p.jpg' },
    { id: 'm2', type: 'image', src: 'https://example.com/i.jpg', previewSrc: 'https://example.com/i.jpg' },
  ]

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
    container = document.querySelector('#root') as HTMLDivElement
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
    document.body.innerHTML = ''
  })

  function chip(index: number): HTMLDivElement {
    return container.querySelectorAll('.media-item-chip')[index] as HTMLDivElement
  }

  it('renders an attached item as active without a click', async () => {
    await act(async () => {
      root.render(createElement(MediaSnifferBar, { items, attachedIds: new Set(['m1']) }))
    })

    expect(chip(0).classList.contains('active')).toBe(true)
    expect(chip(0).getAttribute('data-tooltip')).toBe('已点亮激活')
    expect(chip(1).classList.contains('active')).toBe(false)
  })

  it('lights a chip the moment its id becomes attached', async () => {
    await act(async () => {
      root.render(createElement(MediaSnifferBar, { items, attachedIds: new Set<string>() }))
    })
    expect(chip(0).classList.contains('active')).toBe(false)

    await act(async () => {
      root.render(createElement(MediaSnifferBar, { items, attachedIds: new Set(['m1']) }))
    })

    expect(chip(0).classList.contains('active')).toBe(true)
  })

  it('keeps an attached chip lit when the local toggle is undone', async () => {
    await act(async () => {
      root.render(createElement(MediaSnifferBar, { items, attachedIds: new Set(['m2']) }))
    })

    await act(async () => {
      chip(1).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(chip(1).classList.contains('active')).toBe(true)
  })
})
