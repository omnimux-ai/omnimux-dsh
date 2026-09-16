// @vitest-environment jsdom
/**
 * Where the TikTok trigger lands, read off the mounted element.
 *
 * This is the integration point: it goes through the same path the page does —
 * mount the scene, let it measure, read back the inline position — so it fails
 * if the anchor layer and its only consumer ever disagree, which unit tests of
 * either half cannot see.
 *
 * The file used to assert the video's lower-left corner in four of its cases.
 * That placement was the direction the user rejected; the trigger now follows the
 * avatar the page actually renders, in both of the layouts the probe measured.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TIKTOK_SCENE_HOST_ID, mountTiktokScene } from '../src/content/tiktok-scene/menu.ts'
import { tiktokCopy } from '../src/content/tiktok-scene/copy.ts'
import { ANCHOR_GAP } from '../src/platform/anchor.ts'
import type { TiktokSceneHandle } from '../src/content/tiktok-scene/menu.ts'

const COPY = tiktokCopy('zh')
const DESKTOP = { width: 1920, height: 929 }
const PORTRAIT = { width: 430, height: 932 }

let mounted: TiktokSceneHandle | null = null

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

/** Lay out a page from markup, giving each selector the box the browser would report. */
function page(markup: string, boxes: Record<string, { top: number; left: number; width: number; height: number }>): void {
  document.body.innerHTML = markup
  for (const [selector, box] of Object.entries(boxes)) {
    const el = document.querySelector(selector)
    if (el === null) throw new Error(`fixture has no ${selector}`)
    place(el, box)
  }
}

/** Mount the scene against a viewport of the given size. */
function mountAt(viewport: { width: number; height: number }): TiktokSceneHandle {
  window.innerWidth = viewport.width
  window.innerHeight = viewport.height
  mounted = mountTiktokScene({ doc: document, copy: COPY, run: async () => ({ ok: true, code: 'exported' }) })
  return mounted
}

/** The positioned layer inside the shadow root. */
function anchorEl(): HTMLElement {
  const host = document.getElementById(TIKTOK_SCENE_HOST_ID)
  const root = host?.shadowRoot
  if (root === null || root === undefined) throw new Error('scene not mounted')
  return root.querySelector('.omx-anchor') as HTMLElement
}

/** The trigger's resolved box, in viewport coordinates. */
function placement(): { left: number; bottom: number } {
  const el = anchorEl()
  return {
    left: Number.parseFloat(el.style.left),
    bottom: Number.parseFloat(el.style.bottom),
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  mounted?.dispose()
  mounted = null
})

describe('TikTok 图标定位 — 桌面左栏页', () => {
  it('① 命中 [data-e2e="nav-profile"] img 后，图标贴该头像正上方 8px (AC-102)', () => {
    // 实测 A：左栏头像 32×32 @left=20, top=472；页面同时有一个 0 宽的 aside
    // 和一条覆盖视口中心的视频，二者都不得影响这条判定。
    page(
      '<div data-e2e="nav-profile"><img id="me" /></div><aside id="ghost"></aside><video id="feed"></video>',
      {
        '#me': { top: 472, left: 20, width: 32, height: 32 },
        '#ghost': { top: 0, left: 1920, width: 0, height: 929 },
        '#feed': { top: 16, left: 702, width: 501, height: 897 },
      },
    )
    mountAt(DESKTOP)

    expect(placement().left).toBe(20)
    expect(placement().bottom).toBe(DESKTOP.height - 472 + ANCHOR_GAP)
  })

  it('页面有视频但没有头像时停在兜底，不走「视频左下角」 (AC-105)', () => {
    page('<main><video id="feed"></video></main>', {
      '#feed': { top: 0, left: 0, width: 430, height: 883 },
    })
    mountAt(PORTRAIT)

    expect(placement()).toEqual({ left: 12, bottom: 88 })
  })

  it('④ 侧栏内 96×96 的方形头像被认出，图标贴其上方（不落停车位）', () => {
    page('<div id="rail"><img id="me" /><img id="promo" /></div>', {
      '#rail': { top: 0, left: 0, width: 232, height: 929 },
      '#me': { top: 40, left: 68, width: 96, height: 96 },
      '#promo': { top: 700, left: 16, width: 48, height: 48 },
    })
    mountAt(DESKTOP)

    expect(placement().left).toBe(68)
    expect(placement().bottom).toBe(DESKTOP.height - 40 + ANCHOR_GAP)
    expect(placement()).not.toEqual({ left: 16, bottom: 96 })
  })

  it('左栏认出来但没有头像时停在左栏底部停车位', () => {
    page('<aside id="rail"><button>登录</button></aside>', {
      '#rail': { top: 0, left: 0, width: 232, height: 929 },
    })
    mountAt(DESKTOP)

    expect(placement()).toEqual({ left: 16, bottom: 96 })
  })
})

describe('TikTok 图标定位 — 竖向布局', () => {
  it('⑤ 右侧操作栏顶部的头像被认出，图标贴其上方，不掉回硬编码坐标 (AC-103)', () => {
    // 实测 C：全部 hook 落空，`nav` 是 168×28 的顶部标签栏，头像只在贴右缘的
    // 操作栏里。栏内头像在顶部，其下紧跟着「+」关注按钮，再往下还有一张方图
    // （DOM 序在头像之后，位置却在下方）——它不能被当成头像。
    page(
      '<nav id="tabs"><img id="tab" /></nav><div id="bar"><img id="author" /><span id="follow" /><img id="sticker" /></div><video id="feed"></video>',
      {
        '#tabs': { top: 8, left: 131, width: 168, height: 28 },
        '#tab': { top: 8, left: 140, width: 28, height: 28 },
        '#bar': { top: 60, left: 375, width: 55, height: 700 },
        '#author': { top: 68, left: 379, width: 48, height: 48 },
        '#follow': { top: 124, left: 391, width: 24, height: 24 },
        '#sticker': { top: 300, left: 379, width: 48, height: 48 },
        '#feed': { top: 0, left: 0, width: 430, height: 883 },
      },
    )
    mountAt(PORTRAIT)

    expect(placement().left).toBe(379)
    expect(placement().bottom).toBe(PORTRAIT.height - 68 + ANCHOR_GAP)
    expect(placement()).not.toEqual({ left: 16, bottom: 96 })
    expect(placement()).not.toEqual({ left: 12, bottom: 88 })
  })

  it('② `nav` 是 168×28 顶部标签栏时不得当作侧栏', () => {
    page('<nav id="tabs"><img id="tab" /></nav>', {
      '#tabs': { top: 8, left: 131, width: 168, height: 28 },
      '#tab': { top: 8, left: 140, width: 28, height: 28 },
    })
    mountAt(PORTRAIT)

    expect(placement()).toEqual({ left: 12, bottom: 88 })
  })

  it('③ `aside` 为 0 宽时不可用', () => {
    page('<aside id="ghost"><img id="me" /></aside>', {
      '#ghost': { top: 0, left: 1920, width: 0, height: 929 },
      '#me': { top: 472, left: 1922, width: 32, height: 32 },
    })
    mountAt(DESKTOP)

    expect(placement()).toEqual({ left: 12, bottom: 88 })
  })
})

describe('TikTok 图标定位 — 兜底', () => {
  it('什么都认不出来时退到左下角停车位，图标不会消失 (AC-104)', () => {
    page('<main id="content"><div>空白页面</div></main>', {
      '#content': { top: 0, left: 0, width: 1920, height: 929 },
    })
    mountAt(DESKTOP)

    expect(placement()).toEqual({ left: 12, bottom: 88 })
  })

  it('给出的是视口坐标：页面滚动不影响结果', () => {
    page('<div data-e2e="nav-profile"><img id="me" /></div>', {
      '#me': { top: 300, left: 24, width: 40, height: 40 },
    })
    mountAt(DESKTOP)

    // 固定在视口上，跟着视口走：头像位置变了图标就跟着变。
    expect(placement().bottom).toBe(929 - 300 + ANCHOR_GAP)
  })
})
