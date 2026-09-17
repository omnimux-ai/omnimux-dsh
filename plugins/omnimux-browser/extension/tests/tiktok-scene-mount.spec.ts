// @vitest-environment jsdom
/**
 * Mount-level behaviour of the TikTok scene.
 *
 * The target decision, the anchor and the menu each have their own unit tests;
 * this file covers the wiring between them — the layer that decides *which* post
 * a click acts on by reading the page, and the layer that decides *whether* the
 * page gets a trigger at all. A bug in either is a wrong download, or a mark
 * stuck to a stranger's avatar, that no unit test of a pure function can catch.
 *
 * The scene is home-feed only, so every case below states the address it stands
 * on: the address is now part of the mount decision.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initTiktokScene, isTikTokScenePath } from '../src/content/tiktok-scene/index.ts'
import { TIKTOK_SCENE_HOST_ID, TIKTOK_TIMING } from '../src/content/tiktok-scene/messages.ts'
import { tiktokCopy } from '../src/content/tiktok-scene/copy.ts'

const HOME = 'https://www.tiktok.com/'
const WATCH = 'https://www.tiktok.com/@cleanlife/video/7412345678901234567'
const OTHER = 'https://www.tiktok.com/@cleanlife/video/7419999999999999999'
const PROFILE = 'https://www.tiktok.com/@cleanlife'
const SEARCH = 'https://www.tiktok.com/search?q=clean'
const EXPLORE = 'https://www.tiktok.com/explore'

let sent: Array<Record<string, unknown>> = []

function setLocation(href: string): void {
  const url = new URL(href)
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { href, hostname: url.hostname, pathname: url.pathname, origin: url.origin },
  })
}

function shadow(): ShadowRoot | null {
  return document.getElementById(TIKTOK_SCENE_HOST_ID)?.shadowRoot ?? null
}

/** jsdom has no layout; give one element the box the browser would report. */
function place(el: Element, box: { top: number; left: number; width: number; height: number }): void {
  const rect = {
    x: box.left,
    y: box.top,
    top: box.top,
    left: box.left,
    right: box.left + box.width,
    bottom: box.top + box.height,
    width: box.width,
    height: box.height,
    toJSON: () => ({}),
  } as DOMRect
  el.getBoundingClientRect = () => rect
}

/**
 * Let the mounted scene's throttled pass and its address re-check run, the way a
 * live page's would.
 *
 * The gate is re-read both on DOM mutations and on a timer, and the mutation
 * path deliberately collapses a burst into one trailing pass, so a case that
 * changes the address waits out one budget before it asserts the new decision.
 */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, TIKTOK_TIMING.rescanThrottleMs + 80))
}

/**
 * Open the toolbar the way a user does — by pointing at the trigger — then click
 * one menu row and let the mounted handler's promise chain settle.
 *
 * Opening matters even though the row's own handler is not gated on it: a row
 * reached without the toolbar ever having shown is a row the user could not have
 * pressed.
 */
async function clickRow(action: string): Promise<void> {
  const root = shadow()
  if (root === null) throw new Error('scene not mounted')
  const anchor = root.querySelector('.omx-anchor') as HTMLElement
  const enter = new Event('pointerenter')
  Object.defineProperty(enter, 'pointerType', { value: 'mouse' })
  anchor.dispatchEvent(enter)
  ;(root.querySelector(`.omx-item[data-action="${action}"]`) as HTMLElement).click()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Point the pointer at a post link the way a user hovering a tile would. */
function hover(anchor: HTMLAnchorElement): void {
  anchor.dispatchEvent(new Event('pointerover', { bubbles: true }))
}

beforeEach(() => {
  document.body.innerHTML = ''
  // `initTiktokScene` disposes its own previous mount before installing a new
  // one, so each case releases the observers, the address watcher and the
  // pointer listeners of the last; this only clears the leftover host element.
  for (const stale of Array.from(document.querySelectorAll(`#${TIKTOK_SCENE_HOST_ID}`))) stale.remove()
  sent = []
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: async (message: Record<string, unknown>) => {
        sent.push(message)
        return { ok: true, result: { ok: true, code: 'exported', filename: 'a.mp4' } }
      },
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TikTok 场景挂载 — 页面范围', () => {
  it('不是 TikTok 页面时不挂任何东西', () => {
    setLocation('https://x.com/home')
    initTiktokScene()
    expect(document.getElementById(TIKTOK_SCENE_HOST_ID)).toBeNull()
  })

  it('首页信息流挂上入口', () => {
    setLocation(HOME)
    initTiktokScene()
    expect(shadow()?.querySelector('.omx-trigger')).not.toBeNull()
  })

  it('首页的两个信息流地址同样挂上入口', () => {
    setLocation('https://www.tiktok.com/foryou')
    initTiktokScene()
    expect(shadow()?.querySelector('.omx-trigger')).not.toBeNull()
  })

  it('作品页也挂入口：单条视频同样要能下载、取原声', () => {
    setLocation(WATCH)
    initTiktokScene()
    expect(shadow()?.querySelector('.omx-trigger')).not.toBeNull()
  })

  it('博主主页不挂入口，避免每个头像都长出一个按钮', () => {
    setLocation(PROFILE)
    initTiktokScene()
    expect(document.getElementById(TIKTOK_SCENE_HOST_ID)).toBeNull()
  })

  it('搜索页与探索页都不挂入口', () => {
    setLocation(SEARCH)
    initTiktokScene()
    expect(document.getElementById(TIKTOK_SCENE_HOST_ID)).toBeNull()

    setLocation(EXPLORE)
    initTiktokScene()
    expect(document.getElementById(TIKTOK_SCENE_HOST_ID)).toBeNull()
  })

  it('重复注入只留一个宿主', () => {
    setLocation(HOME)
    initTiktokScene()
    initTiktokScene()
    expect(document.querySelectorAll(`#${TIKTOK_SCENE_HOST_ID}`).length).toBe(1)
  })

  it('首页判定只认信息流地址', () => {
    expect(isTikTokScenePath('/')).toBe(true)
    expect(isTikTokScenePath('/foryou')).toBe(true)
    expect(isTikTokScenePath('/following')).toBe(true)
    expect(isTikTokScenePath('/@cleanlife')).toBe(false)
    expect(isTikTokScenePath('/@cleanlife/video/7412345678901234567')).toBe(true)
    expect(isTikTokScenePath('/@cleanlife/photo/7412345678901234567')).toBe(true)
    expect(isTikTokScenePath('/search')).toBe(false)
    expect(isTikTokScenePath('/explore')).toBe(false)
    expect(isTikTokScenePath('/messages')).toBe(false)
  })
})

describe('TikTok 场景挂载 — 站内跳转', () => {
  it('从首页点进作品页，入口跟着保留', async () => {
    setLocation(HOME)
    initTiktokScene()
    expect(shadow()?.querySelector('.omx-trigger')).not.toBeNull()

    setLocation(WATCH)
    document.body.appendChild(document.createElement('main'))
    await settle()

    expect(shadow()?.querySelector('.omx-trigger')).not.toBeNull()
  })

  it('从博主主页切回信息流，入口自己回来', async () => {
    setLocation(PROFILE)
    initTiktokScene()
    expect(document.getElementById(TIKTOK_SCENE_HOST_ID)).toBeNull()

    setLocation(HOME)
    document.body.appendChild(document.createElement('main'))
    await settle()

    expect(shadow()?.querySelector('.omx-trigger')).not.toBeNull()
  })

  it('地址被改写但界面没有任何变化时，入口同样按新地址撤掉', async () => {
    setLocation(HOME)
    initTiktokScene()
    expect(shadow()?.querySelector('.omx-trigger')).not.toBeNull()

    // Nothing in the DOM changes: only the address re-check can answer this.
    setLocation(PROFILE)
    await settle()
    expect(document.getElementById(TIKTOK_SCENE_HOST_ID)).toBeNull()

    setLocation(HOME)
    await settle()
    expect(shadow()?.querySelector('.omx-trigger')).not.toBeNull()
  })
})

describe('TikTok 场景挂载 — 首页动作发往哪一条作品', () => {
  it('首页播放器容器里能读出作品编号，下载就发这一条', async () => {
    setLocation(HOME)
    document.body.innerHTML = `
      <section data-e2e="feed-video">
        <a href="https://www.tiktok.com/@cleanlife">author</a>
        <div id="xgwrapper-0-7412345678901234567"></div>
      </section>
    `
    const player = document.getElementById('xgwrapper-0-7412345678901234567') as HTMLElement
    place(player, { top: 200, left: 500, width: 500, height: 600 })

    initTiktokScene()
    await clickRow('video')

    expect(sent).toHaveLength(1)
    expect((sent[0].payload as { url: string }).url).toBe(WATCH)
  })

  it('首页没有正在播放的作品时报“没有可操作的作品”，并且什么也不发', async () => {
    setLocation(HOME)
    initTiktokScene()
    await clickRow('video')

    expect(sent).toHaveLength(0)
    // Read the copy from the same resolver the mount used: the test environment
    // reports an English locale, and the assertion is about which line is shown,
    // not about which language it happens to be in.
    expect(shadow()?.querySelector('.omx-item-detail')?.textContent).toContain(tiktokCopy().noTarget)
  })

  it('首页指针指向某条作品时，用指针指向的那条', async () => {
    setLocation(HOME)
    document.body.innerHTML = `<a href="${OTHER}?lang=zh">tile</a>`
    initTiktokScene()
    hover(document.querySelector('a') as HTMLAnchorElement)
    await clickRow('audio')

    expect(sent).toHaveLength(1)
    expect((sent[0].payload as { url: string }).url).toBe(OTHER)
    expect((sent[0].payload as { kind: string }).kind).toBe('audio')
  })

  it('保存到灵感库走的是入库消息，不是下载消息', async () => {
    setLocation(HOME)
    document.body.innerHTML = `<a href="${WATCH}">tile</a>`
    initTiktokScene()
    hover(document.querySelector('a') as HTMLAnchorElement)
    await clickRow('save')

    expect(sent).toHaveLength(1)
    expect(sent[0].type).toBe('DSH_TIKTOK_SAVE_TO_INSPIRATION')
  })

  it('首页指向图文作品时也照常发出去，让宿主如实回答能不能下', async () => {
    setLocation(HOME)
    // A photo post has no stream, but it is still importable: the decision layer
    // accepts these addresses, so the hover scan must collect them instead of
    // answering "nothing to act on" for a post the user can see.
    document.body.innerHTML = `<a href="https://www.tiktok.com/@cleanlife/photo/7418888888888888888">tile</a>`
    initTiktokScene()
    hover(document.querySelector('a') as HTMLAnchorElement)
    await clickRow('save')

    expect(sent).toHaveLength(1)
    expect((sent[0].payload as { url: string }).url)
      .toBe('https://www.tiktok.com/@cleanlife/photo/7418888888888888888')
  })
})
