// @vitest-environment jsdom
/**
 * Mount-level behaviour of the TikTok scene.
 *
 * The target decision, the anchor and the menu each have their own unit tests;
 * this file covers the wiring between them — the layer that decides *which* post
 * a click acts on by reading the page. A bug here is a wrong download that no
 * unit test of a pure function can catch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initTiktokScene } from '../src/content/tiktok-scene/index.ts'
import { tiktokCopy } from '../src/content/tiktok-scene/copy.ts'
import { TIKTOK_SCENE_HOST_ID } from '../src/content/tiktok-scene/messages.ts'

const WATCH = 'https://www.tiktok.com/@cleanlife/video/7412345678901234567'
const OTHER = 'https://www.tiktok.com/@cleanlife/video/7419999999999999999'
const PROFILE = 'https://www.tiktok.com/@cleanlife'
const SEARCH = 'https://www.tiktok.com/search?q=clean'

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

/** Click one menu row and let the mounted handler's promise chain settle. */
async function clickRow(action: string): Promise<void> {
  const root = shadow()
  if (root === null) throw new Error('scene not mounted')
  ;(root.querySelector('.omx-trigger') as HTMLElement).click()
  ;(root.querySelector(`.omx-item[data-action="${action}"]`) as HTMLElement).click()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Point the pointer at a post link the way a user hovering a grid tile would. */
function hover(anchor: HTMLAnchorElement): void {
  anchor.dispatchEvent(new Event('pointerover', { bubbles: true }))
}

beforeEach(() => {
  document.body.innerHTML = ''
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

  it('作品页挂上入口', () => {
    setLocation(WATCH)
    initTiktokScene()
    expect(shadow()?.querySelector('.omx-trigger')).not.toBeNull()
  })

  it('重复注入只留一个宿主', () => {
    setLocation(WATCH)
    initTiktokScene()
    initTiktokScene()
    expect(document.querySelectorAll(`#${TIKTOK_SCENE_HOST_ID}`).length).toBe(1)
  })
})

describe('TikTok 场景挂载 — 动作发往哪一条作品', () => {
  it('作品页点下载，用当前页面的作品地址', async () => {
    setLocation(`${WATCH}?is_from_webapp=1`)
    initTiktokScene()
    await clickRow('video')

    expect(sent).toHaveLength(1)
    expect((sent[0].payload as { url: string }).url).toBe(WATCH)
  })

  it('博主主页点下载，用指针指向的那条', async () => {
    setLocation(PROFILE)
    document.body.innerHTML = `<a href="${OTHER}?lang=zh">tile</a>`
    initTiktokScene()
    hover(document.querySelector('a') as HTMLAnchorElement)
    await clickRow('audio')

    expect(sent).toHaveLength(1)
    expect((sent[0].payload as { url: string }).url).toBe(OTHER)
    expect((sent[0].payload as { kind: string }).kind).toBe('audio')
  })

  it('博主主页没有指向时报“没有可操作的作品”，并且什么也不发', async () => {
    setLocation(PROFILE)
    document.body.innerHTML = `<a href="${OTHER}">tile</a>`
    initTiktokScene()
    await clickRow('video')

    expect(sent).toHaveLength(0)
    // Read the copy from the same resolver the mount used: the test environment
    // reports an English locale, and the assertion is about which line is shown,
    // not about which language it happens to be in.
    expect(shadow()?.querySelector('.omx-item-detail')?.textContent).toContain(tiktokCopy().noTarget)
  })

  it('搜索页即使渲染了作品链接也不猜，宁可什么都不做', async () => {
    setLocation(SEARCH)
    document.body.innerHTML = `<a href="${WATCH}">result</a>`
    initTiktokScene()
    await clickRow('video')

    expect(sent).toHaveLength(0)
  })

  it('保存到灵感库走的是入库消息，不是下载消息', async () => {
    setLocation(WATCH)
    initTiktokScene()
    await clickRow('save')

    expect(sent).toHaveLength(1)
    expect(sent[0].type).toBe('DSH_TIKTOK_SAVE_TO_INSPIRATION')
  })
})
