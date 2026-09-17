// @vitest-environment jsdom
/**
 * The card trigger: two-stage reveal, one mark per work card, and a gate that
 * follows the address.
 *
 * The product rule under test is that nothing is on screen until the pointer
 * rests on the work — a grid of decorated cards reads as somebody else's product
 * pasted over TikTok. So the first stage is the card's own hover and the second
 * is the mark's; a case that still passes with either stage dropped is not
 * testing the rule.
 *
 * The behaviour itself was observed in a real browser first; the retained
 * evidence is `.agent-reports/browser-surfaces-issue-2144/evidence/`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MEDIA_TRIGGER_HOST_ID,
  initMediaTrigger,
  workCardSelectorFor,
} from '../src/content/surfaces/media-trigger.ts'
import type { MediaTriggerHandle } from '../src/content/surfaces/media-trigger.ts'
import type { SurfacePageFacts } from '../src/content/surfaces/registry.ts'

const GRID: SurfacePageFacts = { platform: 'tiktok', pageType: 'profile', pathname: '/@cleanlife' }
const FEED: SurfacePageFacts = { platform: 'tiktok', pageType: 'home', pathname: '/foryou' }

const CARD = `
  <div data-e2e="user-post-item">
    <a href="https://www.tiktok.com/@cleanlife/video/7412345678901234567">
      <img src="https://p.example.com/cover.jpg" alt="cover" />
    </a>
  </div>`

let handle: MediaTriggerHandle | null = null

function mount(facts: SurfacePageFacts | (() => SurfacePageFacts)): MediaTriggerHandle | null {
  return initMediaTrigger(document, facts, 'www.tiktok.com')
}

function entries(): Element[] {
  const host = document.getElementById(MEDIA_TRIGGER_HOST_ID)
  return [...(host?.shadowRoot?.querySelectorAll('.omt-entry') ?? [])]
}

/** jsdom does not ship PointerEvent in every version; the type is what the listener reads. */
function fire(target: Element, type: string): void {
  target.dispatchEvent(new Event(type, { bubbles: false }))
}

beforeEach(() => {
  handle?.dispose()
  handle = null
  document.body.innerHTML = CARD
  for (const stale of document.querySelectorAll(`#${MEDIA_TRIGGER_HOST_ID}`)) stale.remove()
})

describe('卡片触发按钮', () => {
  it('门禁不允许时根本不挂载', () => {
    expect(mount(FEED)).toBeNull()
    expect(document.getElementById(MEDIA_TRIGGER_HOST_ID)).toBeNull()
  })

  it('网格页每张卡片一个标记，且初始不显示', () => {
    handle = mount(GRID)
    expect(handle).not.toBeNull()
    const marks = entries()
    expect(marks).toHaveLength(1)
    expect(marks[0]!.classList.contains('is-revealed')).toBe(false)
    expect(marks[0]!.classList.contains('is-open')).toBe(false)
    expect(marks[0]!.querySelector('.omt-trigger')).not.toBeNull()
  })

  it('鼠标悬停卡片才显形，离开就收回去', () => {
    handle = mount(GRID)
    const card = document.querySelector('[data-e2e="user-post-item"]')!
    const mark = entries()[0]!

    fire(card, 'pointerenter')
    expect(mark.classList.contains('is-revealed')).toBe(true)

    fire(card, 'pointerleave')
    expect(mark.classList.contains('is-revealed')).toBe(false)
  })

  it('悬停小图标本身才展开工具栏', () => {
    handle = mount(GRID)
    const mark = entries()[0]!

    fire(mark, 'pointerenter')
    expect(mark.classList.contains('is-open')).toBe(true)
    // A toolbar cannot be open on a mark the user cannot see.
    expect(mark.classList.contains('is-revealed')).toBe(true)

    fire(mark, 'pointerleave')
    expect(mark.classList.contains('is-open')).toBe(false)
    expect(mark.classList.contains('is-revealed')).toBe(false)
  })

  it('工具栏里三个动作齐全', () => {
    handle = mount(GRID)
    const actions = [...entries()[0]!.querySelectorAll('.omt-action')].map((el) => el.getAttribute('data-action'))
    expect(actions).toEqual(['inspiration', 'copy', 'attach'])
  })

  it('地址换成不该挂的页面后，标记自己撤掉', () => {
    let facts: SurfacePageFacts = GRID
    handle = mount(() => facts)
    expect(entries()).toHaveLength(1)

    facts = FEED
    handle!.reposition()
    expect(entries()).toHaveLength(0)
  })

  it('卡片被移除后，它的标记也跟着走', () => {
    handle = mount(GRID)
    expect(entries()).toHaveLength(1)

    document.querySelector('[data-e2e="user-post-item"]')!.remove()
    handle!.reposition()
    expect(entries()).toHaveLength(0)
  })

  it('释放后宿主从页面消失', () => {
    handle = mount(GRID)
    expect(document.getElementById(MEDIA_TRIGGER_HOST_ID)).not.toBeNull()

    handle!.dispose()
    handle = null
    expect(document.getElementById(MEDIA_TRIGGER_HOST_ID)).toBeNull()
  })

  it('选择器与平台表一致', () => {
    expect(workCardSelectorFor('www.tiktok.com')).not.toBeNull()
  })
})
