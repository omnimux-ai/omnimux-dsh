// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  ANCHOR_GAP,
  resolveAnchorPlacement,
} from '../src/content/tiktok-scene/anchor.ts'

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

const VIEWPORT = { width: 1440, height: 900 }

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('OmniMux 图标定位 — 左栏头像', () => {
  it('贴在头像正上方', () => {
    document.body.innerHTML = '<nav data-e2e="nav-bar"><a href="/@me"><img data-e2e="nav-user-avatar" /></a></nav>'
    const avatar = document.querySelector('[data-e2e="nav-user-avatar"]') as Element
    place(avatar, { top: 780, left: 24, width: 40, height: 40 })

    const placement = resolveAnchorPlacement(document, VIEWPORT)
    expect(placement.source).toBe('avatar')
    expect(placement.left).toBe(24)
    expect(placement.bottom).toBe(VIEWPORT.height - 780 + ANCHOR_GAP)
  })

  it('头像换了标记时，靠左栏底部最后一个方形头像兜底', () => {
    document.body.innerHTML = '<nav data-e2e="nav-bar"><img class="ic" /><img class="me" /></nav>'
    const nav = document.querySelector('nav') as Element
    place(nav, { top: 0, left: 0, width: 232, height: 900 })
    place(document.querySelector('img.ic') as Element, { top: 40, left: 16, width: 32, height: 32 })
    place(document.querySelector('img.me') as Element, { top: 812, left: 20, width: 36, height: 36 })

    const placement = resolveAnchorPlacement(document, VIEWPORT)
    expect(placement.source).toBe('avatar')
    expect(placement.left).toBe(20)
    expect(placement.bottom).toBe(VIEWPORT.height - 812 + ANCHOR_GAP)
  })

  it('头像和左栏都认不出来时退到左下角固定位，图标不会消失', () => {
    document.body.innerHTML = '<main><div>空白页面</div></main>'
    const placement = resolveAnchorPlacement(document, VIEWPORT)
    expect(placement.source).toBe('fallback')
    expect(placement.left).toBeGreaterThan(0)
    expect(placement.bottom).toBeGreaterThan(0)
  })

  it('未登录时只有左栏、没有头像，图标仍停在左栏底部的上方', () => {
    document.body.innerHTML = '<nav data-e2e="nav-bar"><button>登录</button></nav>'
    place(document.querySelector('nav') as Element, { top: 0, left: 0, width: 232, height: 900 })

    const placement = resolveAnchorPlacement(document, VIEWPORT)
    expect(placement.source).toBe('rail')
    expect(placement.bottom).toBeGreaterThan(0)
  })

  it('给出的是视口坐标：页面滚动不影响结果', () => {
    document.body.innerHTML = '<nav data-e2e="nav-bar"><img data-e2e="nav-user-avatar" /></nav>'
    place(document.querySelector('[data-e2e="nav-user-avatar"]') as Element, { top: 300, left: 24, width: 40, height: 40 })
    const placement = resolveAnchorPlacement(document, VIEWPORT)
    // 固定在视口上，跟着视口走：头像位置变了图标就跟着变。
    expect(placement.bottom).toBe(900 - 300 + ANCHOR_GAP)
  })
})
