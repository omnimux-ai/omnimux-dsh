// @vitest-environment jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true

/**
 * The two message shapes — `specs/browser-attach-media.spec.md` §3.5, AC-10…AC-12.
 *
 * A user message says "this much went out": 48px chips, nothing to browse. An
 * assistant message is the deliverable and keeps the gallery #1806 shipped. The
 * two share one fetch path (`session.attachment`) and one full-screen viewer, so
 * this suite also pins that the compact shape did not grow a second one.
 *
 * jsdom has no layout engine, so the pixel geometry asserted here is read from
 * the CSS rules that produce it; the measured numbers come from the real-browser
 * harness and are recorded in
 * `.agent-reports/browser-attach-media/message-modes.png`.
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MessageImages } from '../src/panel/MessageImages.tsx'
import { PANEL_COPY } from '../src/panel/strings.ts'
import type { PanelApi } from '../src/panel/api.ts'
import type { MediaAttachmentRef } from '../src/panel/attachments.ts'

const CSS = readFileSync(resolve(__dirname, '../src/panel/styles.css'), 'utf8')

/** Body of a top-level rule, e.g. ruleBody('.media-chip') for `.media-chip { … }`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = CSS.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))
  expect(match, `styles.css has no rule for ${selector}`).not.toBeNull()
  return match![1]!
}

function attachment(index: number): MediaAttachmentRef {
  return {
    attachmentId: `a${index}`,
    mediaType: 'image/png',
    bytes: 3,
    width: 480,
    height: 270,
    name: `素材 ${index}`,
  }
}

function bodyFor(entry: MediaAttachmentRef): string {
  return btoa(String.fromCharCode(Number(/\d+/.exec(entry.attachmentId)?.[0] ?? '0')))
}

function srcFor(entry: MediaAttachmentRef): string {
  return `data:${entry.mediaType};base64,${bodyFor(entry)}`
}

interface Harness {
  api: PanelApi
  calls: string[]
}

/** A `PanelApi` whose only job is `session.attachment`, counting every call. */
function fakeApi(images: readonly MediaAttachmentRef[]): Harness {
  const byId = new Map(images.map((entry) => [entry.attachmentId, entry]))
  const calls: string[] = []
  const api = {
    rpc(method: string, payload?: unknown): Promise<unknown> {
      if (method !== 'session.attachment') throw new Error(`unexpected rpc ${method}`)
      const attachmentId = String((payload as { attachmentId?: unknown } | undefined)?.attachmentId ?? '')
      calls.push(attachmentId)
      const entry = byId.get(attachmentId)
      if (entry === undefined) throw new Error(`unknown attachment ${attachmentId}`)
      return Promise.resolve({ attachment: entry, data: bodyFor(entry) })
    },
  }
  return { api: api as unknown as PanelApi, calls }
}

describe('message images: user receipt vs assistant gallery', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
    container = document.querySelector('#root') as HTMLDivElement
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
    document.body.innerHTML = ''
  })

  async function render(
    images: readonly MediaAttachmentRef[],
    api: PanelApi,
    align: 'start' | 'end',
  ): Promise<void> {
    await act(async () => {
      root.render(createElement(MessageImages, { images, sessionId: 's1', api, align, copy: PANEL_COPY.zh }))
    })
  }

  const chips = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('.media-chip')]
  const thumbs = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('.rail .thumb')]
  const dialog = (): HTMLElement | null => container.querySelector('[role="dialog"]')

  async function click(element: Element | null | undefined): Promise<void> {
    expect(element, 'expected a clickable element').toBeTruthy()
    await act(async () => { element!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  }

  // --------------------------------------------------------------------- AC-10

  it('AC-10: a user message renders silent 48px chips and no gallery', async () => {
    const images = [1, 2, 3, 4].map(attachment)
    await render(images, fakeApi(images).api, 'end')

    expect(chips()).toHaveLength(4)
    // Every element the gallery owns is absent, not merely hidden.
    expect(container.querySelector('.gallery')).toBeNull()
    expect(container.querySelector('.stage-box')).toBeNull()
    expect(container.querySelector('.rail')).toBeNull()
    expect(container.querySelector('.stage-count')).toBeNull()
    expect(container.querySelector('.stage-kind')).toBeNull()
    expect(container.textContent).not.toMatch(/1 \/ 4/)
    // Images carry no play overlay: only video does, and this draft has none.
    expect(chips().every((chip) => chip.querySelectorAll('svg').length === 0)).toBe(true)

    // The chips are the product's own 48px / 9px / 6px box, and they wrap.
    const chipRule = ruleBody('.media-chip')
    expect(chipRule).toMatch(/(?:^|\n)\s*width:\s*48px;/)
    expect(chipRule).toMatch(/(?:^|\n)\s*height:\s*48px;/)
    expect(chipRule).toMatch(/(?:^|\n)\s*border-radius:\s*9px;/)
    expect(chipRule).toMatch(/(?:^|\n)\s*flex:\s*0 0 auto;/)
    const rowRule = ruleBody('.media-chips')
    expect(rowRule).toMatch(/(?:^|\n)\s*display:\s*flex;/)
    expect(rowRule).toMatch(/(?:^|\n)\s*flex-wrap:\s*wrap;/)
    expect(rowRule).toMatch(/(?:^|\n)\s*gap:\s*6px;/)
  })

  it('AC-10: every user chip shows the attachment bytes the host returned', async () => {
    const images = [1, 2, 3].map(attachment)
    const { api, calls } = fakeApi(images)
    await render(images, api, 'end')

    expect(calls).toEqual(['a1', 'a2', 'a3'])
    expect(chips().map((chip) => chip.querySelector('img')?.getAttribute('src')))
      .toEqual(images.map(srcFor))
  })

  it('AC-10: a single user image is still just one chip', async () => {
    const images = [attachment(1)]
    await render(images, fakeApi(images).api, 'end')

    expect(chips()).toHaveLength(1)
    expect(container.querySelector('.gallery')).toBeNull()
    expect(container.querySelector('.stage-count')).toBeNull()
  })

  // --------------------------------------------------------------------- AC-11

  it('AC-11: an assistant message keeps the #1806 gallery untouched', async () => {
    const images = [1, 2, 3, 4].map(attachment)
    await render(images, fakeApi(images).api, 'start')

    expect(chips()).toHaveLength(0)
    expect(container.querySelector('.gallery')).not.toBeNull()
    expect(container.querySelector('.stage-box')).not.toBeNull()
    expect(thumbs()).toHaveLength(4)
    expect(container.querySelector('.stage-count')?.textContent).toBe('1 / 4')
    expect(container.querySelector('.stage-kind')?.textContent).toBe('PNG')
    // The stage carries the first attachment's bytes, and the first thumb is selected.
    expect(container.querySelector('.stage-box img,video')?.getAttribute('src')).toBe(srcFor(images[0]!))
    expect(thumbs().map((thumb) => thumb.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false'])
  })

  it('AC-11: selecting a thumb still swaps the stage and the counter', async () => {
    const images = [1, 2, 3, 4].map(attachment)
    await render(images, fakeApi(images).api, 'start')

    await click(thumbs()[2])

    expect(container.querySelector('.stage-count')?.textContent).toBe('3 / 4')
    expect(container.querySelector('.stage-box img,video')?.getAttribute('src')).toBe(srcFor(images[2]!))
  })

  // --------------------------------------------------------------------- AC-12

  it('AC-12: a user chip opens the same full-screen viewer the gallery uses', async () => {
    const images = [1, 2, 3].map(attachment)
    const { api, calls } = fakeApi(images)
    await render(images, api, 'end')

    expect(dialog()).toBeNull()
    await click(chips()[1])

    const viewer = dialog()
    expect(viewer).not.toBeNull()
    expect(viewer!.getAttribute('aria-modal')).toBe('true')
    // The viewer opens ON the chip that was clicked, from the bytes already fetched.
    expect(viewer!.querySelector('.image-lightbox-count')?.textContent).toBe('2 / 3')
    expect(viewer!.querySelector('.image-lightbox-media img')?.getAttribute('src')).toBe(srcFor(images[1]!))
    // ...and it offers the whole message, not just the clicked chip.
    expect(viewer!.querySelectorAll('.image-lightbox-strip .thumb')).toHaveLength(3)
    // No second fetch path: the chips' three calls are all that happened.
    expect(calls).toEqual(['a1', 'a2', 'a3'])
  })

  it('AC-12: the viewer keeps working after a user message switches to a gallery', async () => {
    const images = [1, 2].map(attachment)
    const { api, calls } = fakeApi(images)

    await render(images, api, 'end')
    await click(chips()[0])
    expect(dialog()!.querySelector('.image-lightbox-media img')?.getAttribute('src')).toBe(srcFor(images[0]!))
    await act(async () => { dialog()!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(dialog()).toBeNull()

    await render(images, api, 'start')
    await click(container.querySelector('.stage-box'))
    expect(dialog()!.querySelector('.image-lightbox-media img')?.getAttribute('src')).toBe(srcFor(images[0]!))
    // One shared data path: the same attachments are not fetched a second time
    // just because the shape changed.
    expect(calls).toEqual(['a1', 'a2'])
  })

  it('AC-12: a user chip with a pending download opens nothing and never breaks', async () => {
    const images = [attachment(1)]
    let resolveBody: ((value: unknown) => void) | undefined
    const api = {
      rpc: (): Promise<unknown> => new Promise((resolve) => { resolveBody = resolve }),
    } as unknown as PanelApi
    await render(images, api, 'end')
    expect(chips()).toHaveLength(1)

    await click(chips()[0])
    // The viewer opens, but with no bytes to show yet.
    expect(dialog()).not.toBeNull()
    expect(dialog()!.querySelector('.image-lightbox-media img')).toBeNull()

    await act(async () => {
      resolveBody?.({ attachment: images[0], data: bodyFor(images[0]!) })
    })
    expect(dialog()!.querySelector('.image-lightbox-media img')?.getAttribute('src')).toBe(srcFor(images[0]!))
  })

  it('AC-10: an empty attachment list renders nothing in either shape', async () => {
    const { api } = fakeApi([])
    await render([], api, 'end')
    expect(container.querySelector('.gallery')).toBeNull()
    expect(chips()).toEqual([])

    await render([], api, 'start')
    expect(container.querySelector('.gallery')).toBeNull()
    expect(chips()).toEqual([])
  })
})
