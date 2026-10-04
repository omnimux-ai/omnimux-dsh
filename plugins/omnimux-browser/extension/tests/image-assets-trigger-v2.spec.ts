// @vitest-environment jsdom
/**
 * V2 media trigger behavior: corner toolbar reuse for saving images to asset library
 * and protecting video cover thumbnails from false image classification (Issue #3053).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MEDIA_TRIGGER_HOST_ID,
  initMediaTrigger,
} from '../src/content/surfaces/media-trigger.ts'
import type { MediaTriggerHandle } from '../src/content/surfaces/media-trigger.ts'
import type { SurfacePageFacts } from '../src/content/surfaces/registry.ts'

const GRID: SurfacePageFacts = { platform: 'tiktok', pageType: 'profile', pathname: '/@cleanlife' }

let handle: MediaTriggerHandle | null = null

function mount(facts: SurfacePageFacts | (() => SurfacePageFacts)): MediaTriggerHandle | null {
  return initMediaTrigger(document, facts, 'www.tiktok.com')
}

function entries(): Element[] {
  const host = document.getElementById(MEDIA_TRIGGER_HOST_ID)
  return [...(host?.shadowRoot?.querySelectorAll('.omt-entry') ?? [])]
}

function fire(target: Element, type: string): void {
  target.dispatchEvent(new Event(type, { bubbles: false }))
}

describe('V2 角标工具栏图片入库复用与视频封面防误存', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    handle?.dispose()
    handle = null
    document.body.innerHTML = ''
    for (const stale of document.querySelectorAll(`#${MEDIA_TRIGGER_HOST_ID}`)) stale.remove()
  })

  afterEach(() => {
    handle?.dispose()
    handle = null
    vi.useRealTimers()
  })

  it('photo 作品第一槽展示资产图形并设置加入资产库文案', () => {
    document.body.innerHTML = `
      <div data-e2e="user-post-item">
        <a href="https://www.tiktok.com/@cleanlife/photo/7412345678901234567">
          <img src="https://p.example.com/photo.jpg" alt="photo" />
        </a>
      </div>`
    handle = mount(GRID)
    const card = document.querySelector('[data-e2e="user-post-item"]')!
    const mark = entries()[0]!

    fire(card, 'pointerenter')
    fire(mark, 'pointerenter')

    const primaryBtn = mark.querySelector('.omt-action[data-action="inspiration"]') as HTMLButtonElement
    expect(primaryBtn.getAttribute('title')).toBe('加入资产库')
    expect(primaryBtn.getAttribute('aria-label')).toBe('加入资产库')
    expect(primaryBtn.innerHTML).toContain('viewBox="0 0 22 22"')
  })

  it('video 作品即使仅显示 img 封面也保持灵感库图样与文案', () => {
    document.body.innerHTML = `
      <div data-e2e="user-post-item">
        <a href="https://www.tiktok.com/@cleanlife/video/7412345678901234567">
          <img src="https://p.example.com/cover.jpg" alt="video cover" />
        </a>
      </div>`
    handle = mount(GRID)
    const card = document.querySelector('[data-e2e="user-post-item"]')!
    const mark = entries()[0]!

    fire(card, 'pointerenter')
    fire(mark, 'pointerenter')

    const primaryBtn = mark.querySelector('.omt-action[data-action="inspiration"]') as HTMLButtonElement
    expect(primaryBtn.getAttribute('title')).toBe('加入灵感库')
    expect(primaryBtn.getAttribute('aria-label')).toBe('加入灵感库')
    expect(primaryBtn.innerHTML).toContain('viewBox="0 0 24 24"')
  })

  it('独立图片卡片第一槽展示资产图形与加入资产库文案', () => {
    document.body.innerHTML = `
      <div data-e2e="user-post-item">
        <img src="https://p.example.com/plain.jpg" alt="plain img" />
      </div>`
    handle = mount(GRID)
    const card = document.querySelector('[data-e2e="user-post-item"]')!
    const mark = entries()[0]!

    fire(card, 'pointerenter')
    fire(mark, 'pointerenter')

    const primaryBtn = mark.querySelector('.omt-action[data-action="inspiration"]') as HTMLButtonElement
    expect(primaryBtn.getAttribute('title')).toBe('加入资产库')
    expect(primaryBtn.getAttribute('aria-label')).toBe('加入资产库')
    expect(primaryBtn.innerHTML).toContain('viewBox="0 0 22 22"')
  })

  it('复制链接与加入对话文案、顺序与图标保持不变', () => {
    document.body.innerHTML = `
      <div data-e2e="user-post-item">
        <img src="https://p.example.com/plain.jpg" alt="plain img" />
      </div>`
    handle = mount(GRID)
    const card = document.querySelector('[data-e2e="user-post-item"]')!
    const mark = entries()[0]!

    fire(card, 'pointerenter')
    fire(mark, 'pointerenter')

    const actions = [...mark.querySelectorAll('.omt-action')].map((el) => el.getAttribute('data-action'))
    expect(actions).toEqual(['inspiration', 'copy', 'attach'])

    const copyBtn = mark.querySelector('.omt-action[data-action="copy"]') as HTMLButtonElement
    expect(copyBtn.getAttribute('title')).toBe('复制')
    expect(copyBtn.getAttribute('aria-label')).toBe('复制')

    const attachBtn = mark.querySelector('.omt-action[data-action="attach"]') as HTMLButtonElement
    expect(attachBtn.getAttribute('title')).toBe('加入对话')
    expect(attachBtn.getAttribute('aria-label')).toBe('加入对话')
  })
})
