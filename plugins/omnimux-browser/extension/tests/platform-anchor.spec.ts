// @vitest-environment jsdom
/**
 * Side-rail detection, avatar recognition and placement.
 *
 * Every geometric case here is transcribed from the live probe
 * (`evidence/live-probe.md`), including the three that broke the previous
 * implementation: an `aside` that measures 0x929 at left=1920, a `nav` that is a
 * 168x28 top tab bar, and a portrait page where every named hook misses and the
 * avatar only exists inside the right-hand action bar. A selector matching is not
 * evidence of anything here; the box it produced is.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  ANCHOR_GAP,
  EDGE_FRACTION,
  MAX_AVATAR_PX,
  MAX_RAIL_WIDTH_FRACTION,
  MIN_AVATAR_PX,
  SQUARE_TOLERANCE,
  detectAnchorLayout,
  findAvatarElement,
  findSideRailElement,
  isSideRailRect,
  measureAnchorFacts,
  resolveAnchorPlacement,
  resolvePlatformAnchor,
} from '../src/platform/anchor.ts'
import { platformById } from '../src/platform/registry.ts'
import type { AnchorFacts } from '../src/platform/anchor.ts'
import type { AnchorRect } from '../src/content/media-hover/types.ts'
import type { PlatformEntry } from '../src/platform/registry.ts'

/** A measurement-rectangle, in the shape the anchor layer reads. */
function rect(left: number, top: number, width: number, height: number): AnchorRect {
  return { left, top, right: left + width, bottom: top + height, width, height }
}

/** jsdom has no layout; give one element the box the browser would report. */
function place(el: Element, box: { top: number; left: number; width: number; height: number }): void {
  const r = {
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
  el.getBoundingClientRect = () => r
}

/** A page of markup, with the boxes the browser would report for it. */
function page(markup: string, boxes: Record<string, { top: number; left: number; width: number; height: number }>): void {
  document.body.innerHTML = markup
  for (const [selector, box] of Object.entries(boxes)) {
    const el = document.querySelector(selector)
    if (el === null) throw new Error(`fixture has no ${selector}`)
    place(el, box)
  }
}

/** Viewport of the desktop probe and of the portrait probe. */
const DESKTOP = { width: 1920, height: 929 }
const NARROW = { width: 1416, height: 1802 }
const PORTRAIT = { width: 430, height: 932 }

/** The desktop probe's own rail page: hook avatar, ghost aside, feed video. */
const DESKTOP_MARKUP = `
  <div data-e2e="nav-profile"><img id="me" /></div>
  <aside id="ghost"></aside>
  <video id="feed"></video>
`
const DESKTOP_BOXES = {
  '#me': { top: 472, left: 20, width: 32, height: 32 },
  '#ghost': { top: 0, left: 1920, width: 0, height: 929 },
  '#feed': { top: 16, left: 702, width: 501, height: 897 },
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('侧栏谓词 — 每个条件都对应一次真机反例', () => {
  it('常量就是规格里的值，替换成本是改这几行', () => {
    expect(EDGE_FRACTION).toBe(0.08)
    expect(MAX_RAIL_WIDTH_FRACTION).toBe(0.5)
    expect(ANCHOR_GAP).toBe(8)
    expect(MIN_AVATAR_PX).toBe(24)
    expect(MAX_AVATAR_PX).toBe(128)
    expect(SQUARE_TOLERANCE).toBeCloseTo(0.2)
  })

  it('① 宽度为 0 的 aside 不是侧栏（实测 A：0×929 @left=1920）', () => {
    expect(isSideRailRect(rect(1920, 0, 0, 929), DESKTOP)).toBe(false)
  })

  it('① 高度为 0 的容器不是侧栏', () => {
    expect(isSideRailRect(rect(0, 0, 232, 0), DESKTOP)).toBe(false)
  })

  it('② 不贴左缘的容器不是侧栏', () => {
    // 1440 宽的 8% 是 115.2，left=200 明显偏出。
    expect(isSideRailRect(rect(200, 0, 232, 900), { width: 1440, height: 900 })).toBe(false)
  })

  it('② 贴右缘的容器是侧栏（竖向布局的右侧操作栏）', () => {
    // 实测 C：comment-icon 62×65 @left=375，视口 430 宽。
    expect(isSideRailRect(rect(375, 60, 55, 700), PORTRAIT)).toBe(true)
  })

  it('② 两侧都不贴的容器不是侧栏', () => {
    expect(isSideRailRect(rect(300, 60, 55, 700), PORTRAIT)).toBe(false)
  })

  it('② 边界取等号时仍算贴边', () => {
    const viewport = { width: 1000, height: 900 }
    expect(isSideRailRect(rect(80, 0, 200, 900), viewport)).toBe(true)
    expect(isSideRailRect(rect(80.1, 0, 200, 900), viewport)).toBe(false)
    expect(isSideRailRect(rect(720, 0, 200, 900), viewport)).toBe(true)
    expect(isSideRailRect(rect(719.9, 0, 200, 900), viewport)).toBe(false)
  })

  it('③ 宽于半屏的容器不是侧栏（那是整页包裹层）', () => {
    expect(isSideRailRect(rect(0, 0, 800, 900), { width: 1440, height: 900 })).toBe(false)
  })

  it('③ 边界取等号时仍算侧栏', () => {
    const viewport = { width: 1000, height: 900 }
    expect(isSideRailRect(rect(0, 0, 500, 900), viewport)).toBe(true)
    expect(isSideRailRect(rect(0, 0, 501, 900), viewport)).toBe(false)
  })

  it('④ 宽大于高的容器不是侧栏（实测 C：168×28 顶部标签栏）', () => {
    expect(isSideRailRect(rect(131, 8, 168, 28), PORTRAIT)).toBe(false)
  })

  it('五条都满足时才是侧栏', () => {
    expect(isSideRailRect(rect(0, 0, 232, 900), DESKTOP)).toBe(true)
    expect(isSideRailRect(rect(20, 0, 232, 900), NARROW)).toBe(true)
  })
})

describe('侧栏查找 — 具名容器优先，落空才走结构扫描', () => {
  it('命中选择器且盒子合格时用它', () => {
    page('<aside id="rail"></aside>', { '#rail': { top: 0, left: 0, width: 232, height: 929 } })
    expect(findSideRailElement(document, DESKTOP)?.id).toBe('rail')
  })

  it('具名容器全落空时，贴右缘的竖长容器仍能被找到（实测 C 的形态）', () => {
    page('<div id="bar"></div>', { '#bar': { top: 60, left: 375, width: 55, height: 700 } })
    expect(findSideRailElement(document, PORTRAIT)?.id).toBe('bar')
  })

  it('页面没有侧栏时返回 null，不编一个出来', () => {
    page('<main id="content"></main>', { '#content': { top: 0, left: 0, width: 1920, height: 929 } })
    expect(findSideRailElement(document, DESKTOP)).toBeNull()
  })
})

describe('布局判定 — 只看有没有合格的侧栏', () => {
  it('侧栏合格就是 side-rail', () => {
    expect(detectAnchorLayout({ rail: rect(0, 0, 232, 1802) }, NARROW)).toBe('side-rail')
  })

  it('被谓词否掉的 aside 不算数（实测 A：0×929 @left=1920）', () => {
    expect(detectAnchorLayout({ rail: rect(1920, 0, 0, 929) }, DESKTOP)).toBe('unknown')
  })

  it('顶部横向标签栏不算数（实测 C：168×28）', () => {
    expect(detectAnchorLayout({ rail: rect(131, 8, 168, 28) }, PORTRAIT)).toBe('unknown')
  })

  it('贴右缘的操作栏算数', () => {
    expect(detectAnchorLayout({ rail: rect(375, 60, 55, 700) }, PORTRAIT)).toBe('side-rail')
  })

  it('什么都没有的页面是 unknown', () => {
    expect(detectAnchorLayout({ rail: null }, DESKTOP)).toBe('unknown')
  })

  it('页面上的视频不参与判定（AC-207）', () => {
    // 实测 A 的视频覆盖视口中心 (960,464)，旧实现据此把桌面页读成沉浸式。
    page('<video id="feed"></video>', { '#feed': { top: 16, left: 702, width: 501, height: 897 } })
    const facts = measureAnchorFacts(document, DESKTOP)
    expect(facts.layout).toBe('unknown')
  })
})

describe('头像识别 — 具名 hook 优先', () => {
  it('① 命中 [data-e2e="nav-profile"] img（实测 A 的真实信号）', () => {
    page(DESKTOP_MARKUP, DESKTOP_BOXES)

    const avatar = findAvatarElement(document, DESKTOP)
    expect(avatar?.id).toBe('me')

    const facts = measureAnchorFacts(document, DESKTOP)
    expect(facts.avatar).toMatchObject({ left: 20, top: 472, width: 32, height: 32 })
  })

  it('命中 [data-e2e="nav-user-avatar"] 时也用它', () => {
    page('<div id="wrap"><img id="ava" data-e2e="nav-user-avatar" /></div>', {
      '#wrap': { top: 800, left: 16, width: 48, height: 48 },
      '#ava': { top: 800, left: 16, width: 36, height: 36 },
    })

    expect(findAvatarElement(document, DESKTOP)?.id).toBe('ava')
  })

  it('hook 命中时不套用结构扫描的尺寸上界（页面自己说这是头像）', () => {
    page('<div data-e2e="nav-profile"><img id="me" /></div>', {
      '#me': { top: 100, left: 20, width: 200, height: 200 },
    })

    expect(findAvatarElement(document, DESKTOP)?.id).toBe('me')
  })
})

describe('头像识别 — 结构扫描限定在侧栏容器内', () => {
  it('④ hook 全落空时取栏内最靠上的合法方图（96×96 也算，不取 DOM 序最后一张）', () => {
    page('<div id="rail"><img id="me" /><img id="promo" /></div>', {
      '#rail': { top: 0, left: 0, width: 232, height: 929 },
      '#me': { top: 40, left: 68, width: 96, height: 96 },
      '#promo': { top: 700, left: 16, width: 48, height: 48 },
    })

    expect(findAvatarElement(document, DESKTOP)?.id).toBe('me')

    const placement = resolvePlatformAnchor(platformById('tiktok'), 'scene', document, DESKTOP, { box: 48 })
    expect(placement.source).toBe('avatar-above')
    expect(placement.left).toBe(68)
    expect(placement.bottom).toBe(DESKTOP.height - 40 + ANCHOR_GAP)
  })

  it('⑤ 竖向布局：操作栏顶部的头像被认出，图标贴其上方 (AC-103)', () => {
    // 实测 C 的形状：hook 全落空，`nav` 是 168×28 的顶部标签栏，头像在贴右缘的
    // 操作栏里——栏内头像在顶部，其下紧跟着「+」关注按钮，再往下才是点赞/评论
    // 那排图标（图形，不是照片）和一张运营方图。
    page('<div id="bar"><img id="author" /><span id="follow" /><img id="sticker" /></div>', {
      '#bar': { top: 60, left: 375, width: 55, height: 700 },
      '#author': { top: 68, left: 379, width: 48, height: 48 },
      '#follow': { top: 124, left: 391, width: 24, height: 24 },
      '#sticker': { top: 300, left: 379, width: 48, height: 48 },
    })

    expect(findAvatarElement(document, PORTRAIT)?.id).toBe('author')

    const placement = resolvePlatformAnchor(platformById('tiktok'), 'scene', document, PORTRAIT, { box: 48 })
    expect(placement.source).toBe('avatar-above')
    expect(placement.left).toBe(379)
    expect(placement.bottom).toBe(PORTRAIT.height - 68 + ANCHOR_GAP)
  })

  it('栏内有多张方图时，带关注按钮的那张胜出（即使它不是最靠上的）', () => {
    // 归属谓词优先于位置谓词，也优先于 DOM 序：方图里只有头像下面挂着关注
    // 按钮，而那张运营方图在 DOM 里排在最后、视觉上却在最上面——取「最后一张」
    // 或取「最靠上一张」都会选中它。
    page('<div id="bar"><img id="author" /><span id="follow" /><img id="sticker" /></div>', {
      '#bar': { top: 60, left: 375, width: 55, height: 700 },
      '#author': { top: 300, left: 379, width: 48, height: 48 },
      '#follow': { top: 356, left: 391, width: 24, height: 24 },
      '#sticker': { top: 64, left: 379, width: 40, height: 40 },
    })

    expect(findAvatarElement(document, PORTRAIT)?.id).toBe('author')
  })

  it('关注按钮离得太远时不算归属证据，回到最靠上那张', () => {
    // 头像 300..348，按钮 400 起：间距 52px 超出 8..24px 的窗口，不是这一张的按钮。
    page('<div id="bar"><img id="author" /><img id="sticker" /><span id="follow" /></div>', {
      '#bar': { top: 60, left: 375, width: 55, height: 700 },
      '#author': { top: 300, left: 379, width: 48, height: 48 },
      '#sticker': { top: 64, left: 379, width: 40, height: 40 },
      '#follow': { top: 400, left: 391, width: 24, height: 24 },
    })

    expect(findAvatarElement(document, PORTRAIT)?.id).toBe('sticker')
  })

  it('头像下方的方图如果和头像差不多大，就不算关注按钮', () => {
    // 关注按钮比头像小。一个 44×44 的元素挂在 48px 头像下面更像另一张图，
    // 所以归属不成立，回到「最靠上」那条。
    page('<div id="bar"><img id="author" /><div id="near" /><img id="sticker" /></div>', {
      '#bar': { top: 60, left: 375, width: 55, height: 700 },
      '#author': { top: 300, left: 379, width: 48, height: 48 },
      '#near': { top: 356, left: 379, width: 44, height: 44 },
      '#sticker': { top: 64, left: 379, width: 40, height: 40 },
    })

    expect(findAvatarElement(document, PORTRAIT)?.id).toBe('sticker')
  })

  it('② 顶部标签栏内的图片不算头像', () => {
    page('<nav id="tabs"><img id="tab" /></nav>', {
      '#tabs': { top: 8, left: 131, width: 168, height: 28 },
      '#tab': { top: 8, left: 140, width: 28, height: 28 },
    })

    expect(findAvatarElement(document, PORTRAIT)).toBeNull()
  })

  it('③ 0 宽 aside 内的图片不算头像（实测 A：0×929 @left=1920）', () => {
    page('<aside id="ghost"><img id="me" /></aside>', {
      '#ghost': { top: 0, left: 1920, width: 0, height: 929 },
      '#me': { top: 472, left: 1922, width: 32, height: 32 },
    })

    expect(findAvatarElement(document, DESKTOP)).toBeNull()
  })

  it('⑥ 栏内的大图（视频封面）不算头像', () => {
    page('<aside id="rail"><img id="cover" /></aside>', {
      '#rail': { top: 0, left: 0, width: 232, height: 929 },
      '#cover': { top: 300, left: 16, width: 300, height: 300 },
    })

    expect(findAvatarElement(document, DESKTOP)).toBeNull()
  })

  it('栏内非方形的图片不算头像', () => {
    page('<aside id="rail"><img id="banner" /></aside>', {
      '#rail': { top: 0, left: 0, width: 232, height: 929 },
      '#banner': { top: 300, left: 16, width: 200, height: 100 },
    })

    expect(findAvatarElement(document, DESKTOP)).toBeNull()
  })

  it('小于 24px 的图片不算头像（那是图标）', () => {
    page('<aside id="rail"><img id="icon" /></aside>', {
      '#rail': { top: 0, left: 0, width: 232, height: 929 },
      '#icon': { top: 40, left: 16, width: 20, height: 20 },
    })

    expect(findAvatarElement(document, DESKTOP)).toBeNull()
  })

  it('长宽差超过 20% 的图片不算头像', () => {
    page('<aside id="rail"><img id="odd" /></aside>', {
      '#rail': { top: 0, left: 0, width: 232, height: 929 },
      // 60 与 40 相差 20，是较长边 60 的 33%，超出容差。
      '#odd': { top: 700, left: 16, width: 60, height: 40 },
    })

    expect(findAvatarElement(document, DESKTOP)).toBeNull()
  })

  it('没有侧栏时不做全页扫描（视频封面不会被当成头像）', () => {
    page('<main id="feed"><img id="cover" /></main>', {
      '#feed': { top: 0, left: 360, width: 1120, height: 929 },
      '#cover': { top: 100, left: 700, width: 400, height: 400 },
    })

    expect(findAvatarElement(document, DESKTOP)).toBeNull()
  })
})

describe('放置 — 紧贴头像正上方', () => {
  it('左边缘取自头像，下边缘取自头像上边缘 + 8px', () => {
    page(DESKTOP_MARKUP, DESKTOP_BOXES)

    const facts = measureAnchorFacts(document, DESKTOP)
    const placement = resolveAnchorPlacement(facts, ['avatar-above', 'viewport-corner-left'], { box: 48 })

    expect(placement.source).toBe('avatar-above')
    expect(placement.left).toBe(20)
    expect(placement.bottom).toBe(DESKTOP.height - 472 + ANCHOR_GAP)
  })

  it('头像在视口外时不产生负数坐标', () => {
    const facts: AnchorFacts = {
      doc: document,
      viewport: DESKTOP,
      layout: 'unknown',
      rail: null,
      avatar: rect(-40, -30, 32, 32),
    }

    expect(resolveAnchorPlacement(facts, ['avatar-above'], { box: 48 }))
      .toEqual({ left: 0, bottom: DESKTOP.height + 30 + ANCHOR_GAP, source: 'avatar-above' })
  })

  it('没有头像但认出了侧栏时停在侧栏停车位 (AC-104)', () => {
    page('<aside id="rail"><button>登录</button></aside>', {
      '#rail': { top: 0, left: 0, width: 232, height: 929 },
    })

    const placement = resolvePlatformAnchor(platformById('tiktok'), 'scene', document, DESKTOP, { box: 48 })

    expect(placement.source).toBe('side-rail-parking')
    expect(placement).toMatchObject({ left: 16, bottom: 96 })
  })

  it('页面什么都没认出来时落在左下角停车位 (AC-104)', () => {
    page('<main id="content"><div>空白页面</div></main>', {
      '#content': { top: 0, left: 0, width: 1920, height: 929 },
    })

    const placement = resolvePlatformAnchor(platformById('tiktok'), 'scene', document, DESKTOP, { box: 48 })

    expect(placement.source).toBe('viewport-corner-left')
    expect(placement).toMatchObject({ left: 12, bottom: 88 })
  })

  it('链上的步骤全部答不上来时，仍然返回一个位置而不是抛错', () => {
    const facts: AnchorFacts = {
      doc: document,
      viewport: DESKTOP,
      layout: 'unknown',
      rail: null,
      avatar: null,
    }

    expect(resolveAnchorPlacement(facts, ['avatar-above'], { box: 48 }))
      .toEqual({ left: 12, bottom: 88, source: 'viewport-corner-left' })
  })

  it('页面有视频但没有头像时，落点是兜底而不是视频左上角 (AC-105)', () => {
    page('<main><video id="feed"></video></main>', {
      '#feed': { top: 16, left: 702, width: 501, height: 897 },
    })

    const placement = resolvePlatformAnchor(platformById('tiktok'), 'scene', document, DESKTOP, { box: 48 })

    expect(placement.source).toBe('viewport-corner-left')
    expect(placement.left).not.toBe(702 + 16)
  })
})

describe('X 品牌链 — 逐像素复现改造前的几何 (AC-501)', () => {
  it('有 Grok 抽屉时停在它正上方 12px', () => {
    const grok = document.createElement('div')
    grok.setAttribute('data-testid', 'GrokDrawerHeader')
    place(grok, { top: 795, left: 1845, width: 55, height: 55 })
    document.body.appendChild(grok)

    const placement = resolvePlatformAnchor(platformById('twitter'), 'brand', document, DESKTOP, { box: 55 })

    expect(placement.source).toBe('stack-above')
    expect(placement.left).toBe(1845)
    // top = 795 − (55 + 12) = 728；bottom = 929 − 728 − 55 = 146。
    expect(placement.bottom).toBe(146)
  })

  it('只有 Chat 抽屉时隔两个身位停在它上方（rank=2）', () => {
    const chat = document.createElement('div')
    chat.setAttribute('data-testid', 'chat-drawer-main')
    place(chat, { top: 862, left: 1845, width: 55, height: 55 })
    document.body.appendChild(chat)

    const placement = resolvePlatformAnchor(platformById('twitter'), 'brand', document, DESKTOP, { box: 55 })

    // top = 862 − 2 × 67 = 728，与 Grok 分支同一个结果。
    expect(placement.bottom).toBe(146)
  })

  it('两个抽屉都在时 Grok 优先（链的声明顺序）', () => {
    const grok = document.createElement('div')
    grok.setAttribute('data-testid', 'GrokDrawerHeader')
    place(grok, { top: 795, left: 1845, width: 55, height: 55 })
    document.body.appendChild(grok)

    const chat = document.createElement('div')
    chat.setAttribute('data-testid', 'chat-drawer-main')
    // 刻意放在与 Grok 不同的位置：两条分支若都停在 1845/862 上，
    // 断言就分不出是谁答的。
    place(chat, { top: 800, left: 1700, width: 55, height: 55 })
    document.body.appendChild(chat)

    const placement = resolvePlatformAnchor(platformById('twitter'), 'brand', document, DESKTOP, { box: 55 })

    // Grok (rank 1, top 795) → bottom 146；Chat (rank 2, top 800) → bottom 208。
    expect(placement.left).toBe(1845)
    expect(placement.bottom).toBe(146)
  })

  it('没有抽屉时落在右下角：1920−20−55 = 1845，929−146−55 = 728', () => {
    const placement = resolvePlatformAnchor(platformById('twitter'), 'brand', document, DESKTOP, { box: 55 })

    expect(placement.source).toBe('viewport-corner-right')
    expect(placement.left).toBe(1845)
    // bottom = 146 → 组件按 top 定位时 y = 929 − 146 − 55 = 728。
    expect(placement.bottom).toBe(146)
    expect(DESKTOP.height - placement.bottom - 55).toBe(728)
  })

  it('角落停车位贴着视口边缘时不会跑出屏幕', () => {
    const tiny = { width: 40, height: 40 }
    const placement = resolvePlatformAnchor(platformById('twitter'), 'brand', document, tiny, { box: 55 })
    expect(placement.left).toBeGreaterThanOrEqual(10)
  })
})

describe('可扩展性 — 新平台只加数据 (AC-601)', () => {
  it('解析器不认识任何平台名，换一条声明就换一套位置', () => {
    const custom: PlatformEntry = {
      id: 'generic',
      label: { full: 'Custom', short: 'C' },
      hosts: ['custom.example'],
      pageTypes: [() => 'home'],
      glyph: platformById('generic').glyph,
      inputSelectors: platformById('generic').inputSelectors,
      anchor: {
        // 一条声明里同时有「贴头像」和「角落」两步：第一步答不上来才走第二步。
        brand: { default: ['avatar-above', { strategy: 'stack-above', selectors: ['#nowhere'], rank: 1, gapPx: 12 }, 'viewport-corner-left'] },
        scene: null,
      },
    }

    const placement = resolvePlatformAnchor(custom, 'brand', document, DESKTOP, { box: 48 })

    expect(placement.source).toBe('viewport-corner-left')
    expect(placement).toMatchObject({ left: 12, bottom: 88 })
  })
})
