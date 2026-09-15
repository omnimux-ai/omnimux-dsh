// @vitest-environment jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true

/**
 * Conversation media gallery — acceptance criteria AC-1…AC-15 from
 * `specs/browser-media-gallery.spec.md` §4.
 *
 * jsdom has no layout engine, so every `scrollWidth` / `offsetHeight` /
 * `clientWidth` read is 0 and any comparison built on them is a **structural
 * placeholder**, not a measurement — those lines are marked as such below.
 * Geometry is really guarded in two other places: the CSS rules that produce
 * each metric are asserted by text here, and the measured numbers come from the
 * real-browser harness under `tests/harness/`, recorded in
 * `.agent-reports/browser-media-gallery/geometry-report.json`.
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MessageImages } from '../src/panel/MessageImages.tsx'
import { PANEL_COPY } from '../src/panel/strings.ts'
import { renderMarkdown } from '../src/panel/markdown.ts'
import type { PanelApi } from '../src/panel/api.ts'
import type { MediaAttachmentRef } from '../src/panel/attachments.ts'

const GALLERY_CSS = readFileSync(resolve(__dirname, '../src/panel/styles.css'), 'utf8')

/** Body of a top-level rule, e.g. ruleBody('.rail') for `.rail { … }`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = GALLERY_CSS.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))
  expect(match, `styles.css has no rule for ${selector}`).not.toBeNull()
  return match![1]!
}

function imageAttachment(index: number, overrides: Partial<MediaAttachmentRef> = {}): MediaAttachmentRef {
  return {
    attachmentId: `a${index}`,
    mediaType: 'image/png',
    bytes: 3,
    width: 480,
    height: 270,
    name: `素材 ${index}`,
    ...overrides,
  }
}

function videoAttachment(index: number): MediaAttachmentRef {
  return imageAttachment(index, { mediaType: 'video/mp4', width: 520, height: 318, name: `视频 ${index}` })
}

/**
 * The host answers one `session.attachment` call with one attachment's bytes, so
 * every fixture must carry a **different** body. With a single shared payload a
 * `src` assertion cannot tell which attachment reached the stage, and AC-3's
 * "the stage changes to the third one" would pass no matter which thumb was
 * clicked.
 */
function bodyFor(attachment: MediaAttachmentRef): string {
  const index = Number(/\d+/.exec(attachment.attachmentId)?.[0] ?? '0')
  return btoa(String.fromCharCode(index))
}

/** The exact `src` the panel must build for a given attachment. */
function srcFor(attachment: MediaAttachmentRef): string {
  return `data:${attachment.mediaType};base64,${bodyFor(attachment)}`
}

interface Harness {
  api: PanelApi
  calls: string[]
}

/**
 * A `PanelApi` whose only job is `session.attachment`. `handler` decides
 * whether a given attachment resolves, rejects, or never settles.
 */
function fakeApi(handler: (attachmentId: string) => Promise<unknown>): Harness {
  const calls: string[] = []
  const api = {
    rpc(method: string, payload?: unknown): Promise<unknown> {
      if (method !== 'session.attachment') throw new Error(`unexpected rpc ${method}`)
      const attachmentId = String((payload as { attachmentId?: unknown } | undefined)?.attachmentId ?? '')
      calls.push(attachmentId)
      return handler(attachmentId)
    },
  }
  return { api: api as unknown as PanelApi, calls }
}

/** Resolve every attachment with its own valid base64 body. */
function resolvesAll(images: readonly MediaAttachmentRef[]): Harness {
  const byId = new Map(images.map((image) => [image.attachmentId, image]))
  return fakeApi(async (attachmentId) => {
    const attachment = byId.get(attachmentId)
    if (attachment === undefined) throw new Error(`unknown attachment ${attachmentId}`)
    return { attachment, data: bodyFor(attachment) }
  })
}

describe('conversation media gallery', () => {
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

  /**
   * Renders the component for the ASSISTANT case by default.
   *
   * Per `specs/browser-attach-media.spec.md` §3.5 the two message kinds now render
   * differently: `align="end"` (the user's own message) is a row of 48px chips,
   * while `align="start"` (the assistant's message) keeps the browseable gallery
   * this suite was written for. The gallery assertions below therefore address the
   * assistant shape; the user shape has its own suite in
   * `message-images-user-chips.spec.ts`.
   */
  async function render(
    images: readonly MediaAttachmentRef[],
    api: PanelApi,
    align: 'start' | 'end' = 'start',
  ): Promise<void> {
    await act(async () => {
      root.render(createElement(MessageImages, { images, sessionId: 's1', api, align, copy: PANEL_COPY.zh }))
    })
  }

  const gallery = (): HTMLElement => container.querySelector('.gallery') as HTMLElement
  const stage = (): HTMLElement => container.querySelector('.stage-box') as HTMLElement
  const rail = (): HTMLElement | null => container.querySelector('.rail')
  const thumbs = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('.rail .thumb')]
  const dialog = (): HTMLElement | null => container.querySelector('[role="dialog"]')
  const count = (): string => container.querySelector('.stage-count')?.textContent ?? ''
  const stageSrc = (): string | null => stage().querySelector('img,video')?.getAttribute('src') ?? null

  async function click(element: Element | null | undefined): Promise<void> {
    expect(element, 'expected a clickable element').toBeTruthy()
    await act(async () => {
      element!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }

  async function press(key: string): Promise<void> {
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    })
  }

  it('AC-1 single attachment: stage only, no rail, no counter, stage spans the container', async () => {
    const images = [imageAttachment(1)]
    await render(images, resolvesAll(images).api)

    expect(rail()).toBeNull()
    expect(gallery().classList.contains('single')).toBe(true)
    expect(stage()).toBeTruthy()
    expect(container.querySelector('.stage-count')).toBeNull()
    // The stage is a direct child of the gallery — nothing sits beside it.
    expect(stage().parentElement).toBe(gallery())
    // No side layout exists at all: the stacked arrangement is fixed and has no
    // switch. The class check is a documentation-level guard (only a class
    // literally named `gallery.side` can trip it); the CSS text guard below is
    // the same, and the real structural proof is the sibling order in AC-2.
    expect(gallery().classList.contains('side')).toBe(false)
    expect(GALLERY_CSS).not.toContain('gallery.side')
    expect(ruleBody('.gallery')).toMatch(/(?:^|\n)\s*flex-direction:\s*column;/)
    expect(ruleBody('.gallery')).toMatch(/(?:^|\n)\s*width:\s*100%;/)
    expect(ruleBody('.stage-box')).toMatch(/(?:^|\n)\s*width:\s*100%;/)
    expect(ruleBody('.stage-box')).not.toMatch(/margin-right/)
    // Structural placeholder: jsdom reports 0 for both sides.
    expect(gallery().scrollWidth).toBeLessThanOrEqual(gallery().clientWidth + 1)
  })

  it('AC-2 four attachments: four thumbs in a row-direction tablist below the stage', async () => {
    const images = [1, 2, 3, 4].map((index) => imageAttachment(index))
    await render(images, resolvesAll(images).api)

    expect(thumbs()).toHaveLength(4)
    expect(rail()!.getAttribute('role')).toBe('tablist')
    expect(thumbs()[0]!.getAttribute('role')).toBe('tab')
    expect(ruleBody('.rail')).toMatch(/(?:^|\n)\s*flex-direction:\s*row;/)
    // Stacked order, read off the rendered tree: the rail follows the stage as
    // its next sibling, so the thumbnails sit under the stage, not beside it.
    expect(stage().nextElementSibling).toBe(rail())
    expect(gallery().classList.contains('side')).toBe(false)
  })

  it('AC-3 selecting the third thumb swaps the stage, the counter and aria-selected', async () => {
    const images = [1, 2, 3, 4].map((index) => imageAttachment(index))
    await render(images, resolvesAll(images).api)

    expect(count()).toBe('1 / 4')
    expect(stageSrc()).toBe(srcFor(images[0]!))

    await click(thumbs()[2])

    // The stage must carry the *third* attachment's bytes — not merely "some
    // src" that all four fixtures happen to share.
    expect(stageSrc()).toBe(srcFor(images[2]!))
    expect(stageSrc()).not.toBe(srcFor(images[0]!))
    expect(srcFor(images[2]!)).not.toBe(srcFor(images[0]!))
    expect(count()).toBe('3 / 4')
    expect(thumbs().map((thumb) => thumb.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true', 'false'])
  })

  it('AC-4 clicking the stage opens a dialog listing every attachment', async () => {
    const images = [1, 2, 3, 4].map((index) => imageAttachment(index))
    await render(images, resolvesAll(images).api)

    expect(dialog()).toBeNull()
    await click(stage())

    expect(dialog()).not.toBeNull()
    expect(dialog()!.getAttribute('aria-modal')).toBe('true')
    expect(dialog()!.querySelectorAll('.thumb')).toHaveLength(4)
  })

  it('AC-5 arrow keys page the dialog and wrap at both ends', async () => {
    const images = [1, 2, 3].map((index) => imageAttachment(index))
    await render(images, resolvesAll(images).api)
    await click(stage())

    const lightboxCount = (): string => dialog()!.querySelector('.image-lightbox-count')!.textContent!

    expect(lightboxCount()).toBe('1 / 3')
    await press('ArrowRight')
    expect(lightboxCount()).toBe('2 / 3')
    expect(dialog()!.querySelector('.image-lightbox-media img')!.getAttribute('src')).toBe(srcFor(images[1]!))
    await press('ArrowRight')
    expect(lightboxCount()).toBe('3 / 3')
    await press('ArrowRight')
    expect(lightboxCount()).toBe('1 / 3')
    await press('ArrowLeft')
    expect(lightboxCount()).toBe('3 / 3')
  })

  it('AC-6 Escape closes the dialog', async () => {
    const images = [1, 2].map((index) => imageAttachment(index))
    await render(images, resolvesAll(images).api)
    await click(stage())
    expect(dialog()).not.toBeNull()

    await press('Escape')

    expect(dialog()).toBeNull()
  })

  it('AC-7 while the request is pending the stage shows a placeholder, never a broken image', async () => {
    const images = [imageAttachment(1), imageAttachment(2)]
    const never = fakeApi(() => new Promise(() => {}))
    await render(images, never.api)

    const box = stage()
    expect(box.querySelector('img')).toBeNull()
    expect(box.querySelector('video')).toBeNull()
    expect(box.querySelector('.stage-skeleton')).not.toBeNull()
    expect(box.hasAttribute('disabled')).toBe(true)
  })

  it('AC-8 a rejected request offers retry, and retry asks the host again', async () => {
    const images = [imageAttachment(1)]
    let fail = true
    const { api, calls } = fakeApi(async () => {
      if (fail) throw new Error('attachment unavailable')
      return { attachment: images[0]!, data: bodyFor(images[0]!) }
    })
    await render(images, api)

    expect(calls).toEqual(['a1'])
    expect(container.querySelector('.stage-retry')).not.toBeNull()
    expect(container.querySelector('.stage-fail')).not.toBeNull()
    expect(stage().querySelector('img')).toBeNull()

    fail = false
    await click(container.querySelector('.stage-retry'))

    expect(calls).toEqual(['a1', 'a1'])
    expect(container.querySelector('.stage-fail')).toBeNull()
    expect(stageSrc()).toBe(srcFor(images[0]!))
  })

  it('AC-9 a 300px container does not overflow horizontally', async () => {
    const images = [1, 2, 3, 4, 5, 6, 7, 8].map((index) => imageAttachment(index))
    container.style.width = '300px'
    await render(images, resolvesAll(images).api)

    // Structural placeholder: jsdom has no layout engine, so both sides are 0.
    // The rules that actually keep the narrow column from overflowing are
    // asserted next, and the measured geometry comes from the browser harness.
    expect(gallery().scrollWidth).toBeLessThanOrEqual(gallery().clientWidth + 1)
    expect(ruleBody('.gallery')).toMatch(/(?:^|\n)\s*max-width:\s*100%;/)
    expect(ruleBody('.stage-box')).toMatch(/(?:^|\n)\s*width:\s*100%;/)
    expect(ruleBody('.rail')).toMatch(/(?:^|\n)\s*overflow-x:\s*auto;/)
  })

  it('AC-10 eight attachments keep the rail and the gallery from growing the row', async () => {
    const images = [1, 2, 3, 4, 5, 6, 7, 8].map((index) => imageAttachment(index))
    await render(images, resolvesAll(images).api)

    expect(thumbs()).toHaveLength(8)
    // The budget the gallery promises: rail height + the gap above it must stay
    // within the 59px AC-10 allows above the stage.
    const railHeight = Number(/(?:^|\n)\s*height:\s*(\d+)px;/.exec(ruleBody('.rail'))![1])
    const galleryGap = Number(/(?:^|\n)\s*gap:\s*(\d+)px;/.exec(ruleBody('.gallery'))![1])
    expect(railHeight).toBe(52)
    expect(railHeight + galleryGap).toBeLessThanOrEqual(59)
    // Structural placeholders: jsdom reports 0 for every box metric.
    expect(gallery().offsetHeight).toBeLessThanOrEqual(stage().offsetHeight + 59)
    expect(rail()!.offsetHeight).toBeLessThanOrEqual(railHeight)
    // The rules that make the two numbers above true.
    expect(ruleBody('.rail')).toMatch(/(?:^|\n)\s*flex:\s*0 0 auto;/)
    expect(ruleBody('.rail')).toMatch(/(?:^|\n)\s*overflow-x:\s*auto;/)
    expect(ruleBody('.stage-box')).toMatch(/(?:^|\n)\s*max-height:\s*236px;/)
    expect(ruleBody('.stage-box')).toMatch(/(?:^|\n)\s*min-height:\s*104px;/)
  })

  it('AC-11 a video attachment renders a controlled stage video and a silent muted thumb with a play icon', async () => {
    const images = [videoAttachment(1), imageAttachment(2)]
    await render(images, resolvesAll(images).api)

    const stageVideo = stage().querySelector('video')!
    expect(stageVideo.getAttribute('src')).toBe(srcFor(images[0]!))
    expect(stageVideo.hasAttribute('controls')).toBe(true)
    expect(stageVideo.getAttribute('preload')).toBe('metadata')
    expect(stageVideo.hasAttribute('playsinline')).toBe(true)
    expect(stageVideo.hasAttribute('autoplay')).toBe(false)

    const thumbVideo = thumbs()[0]!.querySelector('video')!
    expect(thumbVideo.muted).toBe(true)
    expect(thumbVideo.hasAttribute('controls')).toBe(false)
    expect(thumbs()[0]!.querySelector('.thumb-play svg')).not.toBeNull()

    // The badge must follow the media type of whatever is on stage, not echo a
    // constant: switching to the image thumb has to change it.
    expect(container.querySelector('.stage-kind')!.textContent).toBe('MP4')
    await click(thumbs()[1])
    expect(stage().querySelector('video')).toBeNull()
    expect(container.querySelector('.stage-kind')!.textContent).toBe('PNG')
    expect(stageSrc()).toBe(srcFor(images[1]!))
  })

  it('AC-12 reply images render hardened (no-referrer, lazy)', async () => {
    const html = renderMarkdown('![](https://a/b.png)')

    expect(html).toMatch(/<img[^>]*src="https:\/\/a\/b\.png"[^>]*referrerpolicy="no-referrer"[^>]*loading="lazy"/)
  })

  it('AC-13 reply video keeps the element and gains controls', async () => {
    const html = renderMarkdown('<video src="https://a/b.mp4"></video>')

    expect(html).toContain('<video')
    // Anchored to the video tag itself: a bare `controls` substring would also
    // be satisfied by unrelated text anywhere in the fragment.
    expect(html).toMatch(/<video[^>]*\bcontrols\b/)
    expect(html).toContain('src="https://a/b.mp4"')
    expect(html).toContain('referrerpolicy="no-referrer"')
    expect(html).toContain('preload="none"')
    expect(html).toContain('playsinline')
  })

  it('AC-14 javascript: and data: media addresses never reach the output', async () => {
    const html = renderMarkdown([
      '<img src="javascript:alert(1)">',
      '<img src="data:image/png;base64,AAAA">',
      '<video src="javascript:alert(2)" poster="data:image/png;base64,AAAA"></video>',
      '[坏链](javascript:alert(3))',
    ].join('\n\n'))

    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('data:')
    expect(html).not.toContain('alert(')
  })

  it('AC-15 plain text is untouched, an empty attachment list renders nothing, and gallery state stays internal', async () => {
    const plain = renderMarkdown('plain text only')
    expect(plain).toContain('plain text only')
    expect(plain).not.toContain('<img')
    expect(plain).not.toContain('<video')

    await render([], resolvesAll([]).api)
    expect(container.querySelector('.gallery')).toBeNull()

    // The message row is memoized: the component must stay memo-wrapped, and a
    // fresh array instance carrying the same attachments must not refetch.
    const memoType = (MessageImages as unknown as { $$typeof?: symbol }).$$typeof
    expect(memoType).toBe(Symbol.for('react.memo'))

    const images = [imageAttachment(1), imageAttachment(2)]
    const { api, calls } = resolvesAll(images)
    await render(images, api)
    expect(calls).toEqual(['a1', 'a2'])
    await render([...images], api)
    expect(calls).toEqual(['a1', 'a2'])
  })
})
