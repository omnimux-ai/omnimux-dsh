// @vitest-environment jsdom
/**
 * Round-2 adversarial probe for the hover capsule's creative-asset gate.
 *
 * This file is an independent re-verification of the four boundary defects filed
 * after Round 1. It does not import the Round-1 probe's fixtures: every case
 * mounts its own markup and drives the detector end to end, so a fixture that was
 * quietly reshaped to accept the fix cannot make a case pass here.
 *
 * Each rejection is paired with a control that must still be admitted. A gate
 * that rejects everything would satisfy every "must be rejected" case, so the
 * controls are what make the rejections meaningful.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MIN_POST_MEDIA_SIZE_PX,
  describePostMediaContext,
  isPostOrWorkMedia,
} from '../src/content/media-hover/classifier.ts'
import { MediaDetector } from '../src/content/media-hover/detector.ts'
import { sniffViewportMedia } from '../src/content/media-sniffer.ts'
import type { HoverCandidate } from '../src/content/media-hover/types.ts'

const VIEWPORT = { width: 1280, height: 800 }

/** jsdom has no layout engine, so every box is declared explicitly. */
function stubBox(element: Element, width: number, height: number): void {
  element.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  }) as DOMRect
}

/** Mounts `html` and returns every element matching `selector`. */
function mountAll(html: string, selector: string): Element[] {
  document.body.innerHTML = html
  return [...document.querySelectorAll(selector)]
}

/** Mounts `html` and returns the single element matching `selector`. */
function mount(html: string, selector: string): Element {
  const [first] = mountAll(html, selector)
  if (first === undefined) throw new Error(`nothing matched ${selector}`)
  return first
}

/** The page host the platform-card rules are judged against. */
const X_HOST = 'x.com'

/** Drives the detector once over `element`, as the page at `host`. */
function detectOnce(element: Element, host: string): HoverCandidate[] {
  const hits: HoverCandidate[] = []
  const detector = new MediaDetector(
    { onCandidate: (candidate) => { hits.push(candidate) } },
    {
      elementFromPoint: () => element,
      viewport: () => ({ ...VIEWPORT }),
      now: () => 1_000,
      host: () => host,
    },
  )
  detector.start()
  document.dispatchEvent(new MouseEvent('pointermove', { clientX: 8, clientY: 8, bubbles: true }))
  detector.dispose()
  return hits
}

/** A tweet article whose media slot holds `inner`, shaped like the real DOM. */
function tweetHtml(inner: string): string {
  return '<article data-testid="tweet">'
    + '<div data-testid="User-Name"><div data-testid="UserAvatar-Container">'
    + '<img src="https://pbs.twimg.com/profile_images/1/avatar_normal.jpg" alt="头像">'
    + '</div><span>某作者</span></div>'
    + `<div data-testid="tweetPhoto">${inner}</div>`
    + '</article>'
}

/**
 * Asserts both halves of a rejection: the gate says no *and* the detector really
 * raises nothing, which is the behaviour the user sees.
 *
 * `describePostMediaContext` is deliberately not asserted here: it reports *which
 * context* matched and names no size gate, so an undersized platform card still
 * answers `platform-card` while the gate refuses it. Use
 * {@link expectExcludedContext} when the region or naming is what rejects.
 */
function expectRejected(element: Element, host: string): void {
  expect(isPostOrWorkMedia(element, host)).toBe(false)
  expect(detectOnce(element, host), 'the detector stayed silent').toHaveLength(0)
}

/** Asserts the rejection comes from the blacklist, not from the size gate. */
function expectExcludedContext(element: Element, host: string): void {
  expect(describePostMediaContext(element, host)).toBe('excluded')
}

/** Asserts the element is admitted and that the capsule would actually appear. */
function expectAdmitted(element: Element, host: string): void {
  expect(isPostOrWorkMedia(element, host)).toBe(true)
  expect(detectOnce(element, host), 'the detector offered the capsule').not.toHaveLength(0)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ------------------------------------------- 场景 1：168x94 YouTube 侧栏缩略图 ---

describe('场景 1 · a 168x94 sidebar thumbnail on a platform card', () => {
  it('rejects it inside a YouTube sidebar card', () => {
    const image = mount(
      '<ytd-watch-flexy><div class="sidebar"><ytd-compact-video-renderer>'
      + '<img src="https://i.ytimg.com/vi/sidebar.jpg" alt=""></ytd-compact-video-renderer></div></ytd-watch-flexy>',
      'img',
    )
    stubBox(image, 168, 94)

    expectRejected(image, 'www.youtube.com')
  })

  it('rejects it in the watch column too, and keeps a feed thumbnail beside it', () => {
    const [sidebar, feed] = mountAll(
      '<ytd-watch-flexy><img src="https://i.ytimg.com/vi/side.jpg" alt=""></ytd-watch-flexy>'
      + '<ytd-rich-item-renderer><img src="https://i.ytimg.com/vi/feed.jpg" alt=""></ytd-rich-item-renderer>',
      'img',
    )
    stubBox(sidebar!, 168, 94)
    stubBox(feed!, 360, 202)

    // The whole card is crossed by the gate, not just one of its shapes.
    expectRejected(sidebar!, 'www.youtube.com')
    expectAdmitted(feed!, 'www.youtube.com')
  })
})

// -------------------------------------------------- 场景 2：112x70 B站列表项 ---

describe('场景 2 · a 112x70 list thumbnail on Bilibili', () => {
  it('rejects it inside a small list item', () => {
    const image = mount(
      '<div class="small-item"><a href="/video/1"><img src="https://i0.hdslb.com/small.jpg" alt=""></a></div>',
      'img',
    )
    stubBox(image, 112, 70)

    expectRejected(image, 'www.bilibili.com')
  })

  it('rejects it while the same host still admits a full card', () => {
    const [small, card] = mountAll(
      '<div class="small-item"><img src="https://i0.hdslb.com/s.jpg" alt=""></div>'
      + '<div class="bili-video-card"><img src="https://i0.hdslb.com/c.jpg" alt=""></div>',
      'img',
    )
    stubBox(small!, 112, 70)
    stubBox(card!, 320, 200)

    expectRejected(small!, 'www.bilibili.com')
    expectAdmitted(card!, 'www.bilibili.com')
  })
})

// ------------------------------------------------- 场景 3：60x60 推文图 ---

describe('场景 3 · a 60x60 image inside a tweet', () => {
  it('rejects a 60x60 image in the status photo container', () => {
    const photo = mount(tweetHtml('<img src="https://pbs.twimg.com/media/TINY?format=jpg" alt="">'), '[data-testid="tweetPhoto"] img')
    stubBox(photo, 60, 60)

    expectRejected(photo, X_HOST)
  })

  it('rejects a 60x60 image anywhere else in the status', () => {
    const inline = mount(
      '<article data-testid="tweet"><div class="css-inline">'
      + '<img class="emoji" src="https://abs.twimg.com/emoji/v2/72x72/1f600.png" alt=""></div></article>',
      'img',
    )
    stubBox(inline, 60, 60)

    expectRejected(inline, X_HOST)
    expectExcludedContext(inline, X_HOST)
  })

  it('rejects a 60x60 avatar carved out of a status that has real media', () => {
    const [avatar, photo] = mountAll(
      tweetHtml('<img src="https://pbs.twimg.com/media/OK?format=jpg" alt="">'),
      'img',
    )
    stubBox(avatar!, 60, 60)
    stubBox(photo!, 600, 400)

    expectRejected(avatar!, X_HOST)
    expectAdmitted(photo!, X_HOST)
  })
})

// ------------------------------ 场景 4：200x200 推文根无名大图（无名大图必须拒绝）---

describe('场景 4 · a 200x200 unlabeled image in a status but outside its media containers', () => {
  it('rejects a 200x200 unnamed image under the status root', () => {
    const image = mount(
      '<article data-testid="tweet"><div class="css-1dbjc4n">'
      + '<img src="https://pbs.twimg.com/profile_banners/9/2" alt=""></div></article>',
      'img',
    )
    stubBox(image, 200, 200)

    expectRejected(image, X_HOST)
    expectExcludedContext(image, X_HOST)
  })

  it('rejects it however large it grows, since the root is scope and never evidence', () => {
    const image = mount(
      '<article data-testid="tweet"><div class="identity">'
      + '<img src="https://pbs.twimg.com/profile_banners/9/3" alt=""></div></article>',
      'img',
    )

    for (const [width, height] of [[200, 200], [400, 400], [800, 800], [1200, 630]]) {
      stubBox(image, width!, height!)
      expectRejected(image, X_HOST)
    }
  })

  it('keeps the sibling card thumbnail unadmitted while the status photo passes', () => {
    // The status in full: an identity image, an unlabeled inside-root image, a
    // link-card thumbnail named 缩略图, and the status's own photo. Only the last
    // one is creative work.
    const [identity, inRoot, card, photo] = mountAll(
      '<article data-testid="tweet">'
      + '<div data-testid="User-Name"><img src="https://pbs.twimg.com/profile_images/3/a.jpg" alt=""></div>'
      + '<div class="css-1dbjc4n"><img src="https://pbs.twimg.com/profile_banners/3/4" alt=""></div>'
      + '<div class="card-thumbnail"><img src="https://pbs.twimg.com/card_img/5/x" alt="缩略图"></div>'
      + '<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/OK?format=jpg" alt="配图"></div>'
      + '</article>',
      'img',
    )
    stubBox(identity!, 400, 400)
    stubBox(inRoot!, 200, 200)
    stubBox(card!, 300, 160)
    stubBox(photo!, 600, 400)

    expectRejected(identity!, X_HOST)
    expectRejected(inRoot!, X_HOST)
    expectRejected(card!, X_HOST)
    expectAdmitted(photo!, X_HOST)
  })

  it('admits the status photo while rejecting an inside-root image of the very same size', () => {
    // Size is held constant so the root-exclusivity rule is the only variable.
    const [inRoot, photo] = mountAll(
      '<article data-testid="tweet">'
      + '<div class="css-1dbjc4n"><img src="https://pbs.twimg.com/profile_banners/7/8" alt=""></div>'
      + '<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/SAME?format=jpg" alt=""></div>'
      + '</article>',
      'img',
    )
    stubBox(inRoot!, 320, 320)
    stubBox(photo!, 320, 320)

    expectRejected(inRoot!, X_HOST)
    expectAdmitted(photo!, X_HOST)
  })
})

// ------------------------------------------------- 场景 5：26 层页脚 ---

describe('场景 5 · a footer buried 26 levels deep', () => {
  /** Wraps `inner` in `depth` work-container divs, past any ancestor budget. */
  function nest(inner: string, depth: number): string {
    return `${'<div class="post">'.repeat(depth)}${inner}${'</div>'.repeat(depth)}`
  }

  it.each([
    ['footer', '<footer>', '</footer>'],
    ['header', '<header>', '</header>'],
    ['nav', '<nav>', '</nav>'],
    ['role=banner', '<div role="banner">', '</div>'],
    ['role=navigation', '<div role="navigation">', '</div>'],
    ['role=contentinfo', '<div role="contentinfo">', '</div>'],
  ])('rejects a large image 26 levels inside a %s', (_label, open, close) => {
    const image = mount(`${open}${nest('<img src="https://cdn.example.com/deep.png" alt="作品">', 26)}${close}`, 'img')
    stubBox(image, 900, 600)

    expectRejected(image, 'page.example.com')
  })

  it('rejects it at 40 levels, which is far past the old bounded walk', () => {
    const image = mount(`<footer>${nest('<img src="https://cdn.example.com/deep.png" alt="作品">', 40)}</footer>`, 'img')
    stubBox(image, 900, 600)

    expectRejected(image, 'page.example.com')
  })

  it('rejects it across a shadow boundary, where the parent chain stops', () => {
    const host = document.createElement('div')
    document.body.innerHTML = `<footer></footer>`
    const footer = document.querySelector('footer')!
    const shadow = host.attachShadow({ mode: 'open' })
    const image = document.createElement('img')
    image.setAttribute('src', 'https://cdn.example.com/shadow.png')
    image.setAttribute('alt', '作品')
    shadow.appendChild(image)
    footer.appendChild(host)
    stubBox(image, 900, 600)

    // No `parentElement` path back to the footer exists, so the walk has to
    // restart from the shadow host instead of giving up.
    expectRejected(image, 'page.example.com')
  })

  it('still admits a work image at the same depth outside any chrome region', () => {
    // The unbounded query is scoped to skeleton regions: content nesting alone
    // must never reject a post image.
    const image = mount(nest('<img src="https://cdn.example.com/work.png" alt="作品">', 26), 'img')
    stubBox(image, 900, 600)

    expectAdmitted(image, X_HOST)
    expectRejected(image, 'page.example.com')
  })

  it('still admits a work image 40 levels deep on an ordinary page', () => {
    const image = mount(nest('<img src="https://cdn.example.com/work.png" alt="作品">', 40), 'img')
    stubBox(image, 900, 600)

    expectAdmitted(image, X_HOST)
    expectRejected(image, 'page.example.com')
  })
})

// ------------------------------------- 场景 6：alt / title 含 logo / reaction ---

describe('场景 6 · a descriptive alt or title naming logo / reaction', () => {
  it.each([
    ['品牌logo设计作品'],
    ['reaction视频封面'],
    ['logo'],
    ['reaction'],
    ['我的 logo 作品集'],
    ['Reaction 系列插画'],
  ])('admits a work image whose alt is "%s"', (alt) => {
    const image = mount(`<article class="post"><img src="https://cdn.example.com/w.png" alt="${alt}"></article>`, 'img')
    stubBox(image, 800, 600)

    expectAdmitted(image, X_HOST)
    expectRejected(image, 'page.example.com')
  })

  it.each([
    ['品牌logo设计作品'],
    ['reaction视频封面'],
  ])('admits a work image whose title is "%s"', (title) => {
    const image = mount(`<article class="post"><img src="https://cdn.example.com/w.png" title="${title}" alt=""></article>`, 'img')
    stubBox(image, 800, 600)

    expectAdmitted(image, X_HOST)
    expectRejected(image, 'page.example.com')
  })

  it('admits a logo-worded alt on a platform card the same way', () => {
    const image = mount(
      '<div class="bili-video-card"><img src="https://i0.hdslb.com/logo-work.jpg" alt="logo设计演示"></div>',
      'img',
    )
    stubBox(image, 320, 200)

    expectAdmitted(image, 'www.bilibili.com')
  })

  it('still rejects the same words when they name the element instead of describing it', () => {
    // The role family keeps the full list: an element declaring itself a logo or
    // a reaction is chrome, whatever a nearby description says.
    const byClass = mount('<article class="post"><img class="brand-logo" src="https://cdn.example.com/i/1.png" alt="作品"></article>', 'img')
    stubBox(byClass, 300, 300)
    expectRejected(byClass, 'page.example.com')

    const byTestId = mount('<article class="post"><img data-testid="reaction" src="https://cdn.example.com/i/2.png" title="作品"></article>', 'img')
    stubBox(byTestId, 300, 300)
    expectRejected(byTestId, 'page.example.com')

    const byId = mount('<article class="post"><img id="site-logo" src="https://cdn.example.com/i/3.png" alt="作品"></article>', 'img')
    stubBox(byId, 300, 300)
    expectRejected(byId, 'page.example.com')
  })

  it('still rejects an alt that names an identity or a UI mark outright', () => {
    for (const alt of ['作者头像', '作者头像图片', 'Verified account', '用户图标', '加载中 loading', '帖子水印']) {
      const image = mount(`<article class="post"><img src="https://cdn.example.com/a/9.png" alt="${alt}"></article>`, 'img')
      stubBox(image, 300, 300)
      expectRejected(image, 'page.example.com')
    }
  })
})

// ---------------------------------------- 交叉复验：单一门禁覆盖每条准入分支 ---

describe('cross-check · one size gate covers every admitting branch', () => {
  /** Every branch that can admit media, as `[label, html, selector, host]`. */
  const BRANCHES: [string, string, string, string][] = [
    ['status photo', tweetHtml('<img src="https://pbs.twimg.com/media/B?format=jpg" alt="">'), '[data-testid="tweetPhoto"] img', X_HOST],
    ['status video player', '<article data-testid="tweet"><div data-testid="videoComponent">'
      + '<video poster="https://pbs.twimg.com/p.jpg" src="blob:https://x.com/a"></video></div></article>', 'video', X_HOST],
    ['status video player alias', '<article data-testid="tweet"><div data-testid="videoPlayer">'
      + '<video poster="https://pbs.twimg.com/p.jpg" src="blob:https://x.com/a"></video></div></article>', 'video', X_HOST],
    ['bilibili card', '<div class="bili-video-card"><img src="https://i0.hdslb.com/c.jpg" alt=""></div>', 'img', 'www.bilibili.com'],
    ['youtube card', '<ytd-rich-item-renderer><img src="https://i.ytimg.com/vi/x.jpg" alt=""></ytd-rich-item-renderer>', 'img', 'www.youtube.com'],
    ['xiaohongshu note', '<section class="note-item"><img src="https://sns-img.xhscdn.com/a.jpg" alt=""></section>', 'img', 'www.xiaohongshu.com'],
    ['weibo card', '<div class="card-wrap"><img src="https://wx.example.com/a.jpg" alt=""></div>', 'img', 'www.weibo.com'],
    ['tiktok item', '<div data-e2e="recommend-list-item-container"><img src="https://p.example.com/a.jpg" alt=""></div>', 'img', 'www.tiktok.com'],
    ['work container', '<article class="post"><img src="https://cdn.example.com/w.png" alt="作品"></article>', 'img', X_HOST],
  ]

  it.each(BRANCHES)('rejects %s media one pixel short on either edge', (_label, html, selector, host) => {
    const element = mount(html, selector)

    stubBox(element, 119, 600)
    expectRejected(element, host)

    stubBox(element, 600, 119)
    expectRejected(element, host)

    stubBox(element, 119, 119)
    expectRejected(element, host)
  })

  it.each(BRANCHES)('admits %s media at exactly 120x120', (_label, html, selector, host) => {
    const element = mount(html, selector)
    stubBox(element, 120, 120)

    expectAdmitted(element, host)
  })

  it('pins the gate constant the whole matrix rests on', () => {
    expect(MIN_POST_MEDIA_SIZE_PX).toBe(120)
  })
})

// ------------------------------------- 交叉复验：嗅探器与指针检测器不得分歧 ---

describe('cross-check · the viewport sniffer and the pointer detector agree', () => {
  it('drops chrome and undersized media from the picker, keeps the work image', () => {
    document.body.innerHTML = '<article class="post">'
      + '<img id="work" src="https://cdn.example.com/work.png" alt="作品">'
      + '</article>'
      + '<div class="avatar"><img id="avatar" src="https://cdn.example.com/a.png" alt=""></div>'
      + '<article class="post"><img id="tiny" src="https://cdn.example.com/tiny.png" alt="作品">'
      + '</article>'
    const [work, avatar, tiny] = ['#work', '#avatar', '#tiny'].map((id) => document.querySelector(id)!)
    stubBox(work!, 800, 600)
    stubBox(avatar!, 400, 400)
    stubBox(tiny!, 100, 100)

    const items = sniffViewportMedia(X_HOST)

    // One entry, and it is the work image: the picker must not offer what the
    // capsule refuses, or an avatar would reach a message through the shelf.
    expect(items.map((item) => item.previewSrc)).toEqual(['https://cdn.example.com/work.png'])
    expect(isPostOrWorkMedia(work!, X_HOST)).toBe(true)
    expect(isPostOrWorkMedia(avatar!, X_HOST)).toBe(false)
    expect(isPostOrWorkMedia(tiny!, X_HOST)).toBe(false)
    // Non-whitelisted hosts must yield zero items from the sniffer
    expect(sniffViewportMedia('page.example.com')).toHaveLength(0)
  })

  it('reports nothing for a viewport that holds only chrome', () => {
    document.body.innerHTML = '<header><img src="https://cdn.example.com/hero.png" alt="横幅"></header>'
      + '<div class="css-reaction"><img src="https://cdn.example.com/r.png" alt=""></div>'
    const [hero, reaction] = [...document.querySelectorAll('img')]
    stubBox(hero!, 1200, 400)
    stubBox(reaction!, 300, 300)

    expect(sniffViewportMedia(X_HOST)).toHaveLength(0)
  })
})

// ------------------------------------- 契约固化：描述器与门禁各司其职，永不分歧 ---

describe('contract · one floor, one gate, one verdict per box', () => {
  it('keeps the descriptor about context and the gate about admission', () => {
    // The two answer different questions and must not be conflated: an
    // undersized platform card is still "a platform card" by context, but it is
    // not admissible. Only the gate decides whether the capsule is offered.
    const card = mount('<div class="bili-video-card"><img src="https://i0.hdslb.com/c.jpg" alt=""></div>', 'img')
    stubBox(card, 112, 70)

    expect(describePostMediaContext(card, 'www.bilibili.com')).toBe('platform-card')
    expect(isPostOrWorkMedia(card, 'www.bilibili.com')).toBe(false)
    expect(detectOnce(card, 'www.bilibili.com')).toHaveLength(0)
  })

  it('reads the whole element size, so one short edge is enough to lose it', () => {
    const image = mount('<article class="post"><img src="https://cdn.example.com/w.png" alt="作品"></article>', 'img')

    stubBox(image, 120, 120)
    expect(isPostOrWorkMedia(image, X_HOST)).toBe(true)

    stubBox(image, 119, 120)
    expect(isPostOrWorkMedia(image, X_HOST)).toBe(false)

    stubBox(image, 120, 119)
    expect(isPostOrWorkMedia(image, X_HOST)).toBe(false)

    stubBox(image, 119, 4000)
    expect(isPostOrWorkMedia(image, X_HOST)).toBe(false)

    stubBox(image, 4000, 119)
    expect(isPostOrWorkMedia(image, X_HOST)).toBe(false)
  })

  it('refuses a non-media element whatever its box', () => {
    document.body.innerHTML = '<article class="post"><div class="player"></div></article>'
    const div = document.querySelector('div')!
    stubBox(div, 800, 600)

    expect(isPostOrWorkMedia(div, X_HOST)).toBe(false)
    expect(detectOnce(div, 'page.example.com')).toHaveLength(0)
  })

  it('re-checks the gate when an active candidate later falls below it', () => {
    // `refresh` re-evaluates the live candidate after a scroll or a resize. The
    // gate is one of the checks it repeats, so an element that was admitted at
    // post size and is then laid out small must invalidate rather than keep a
    // capsule on an avatar-sized box.
    const image = mount('<article class="post"><img src="https://cdn.example.com/w.png" alt="作品"></article>', 'img')
    stubBox(image, 800, 600)

    const onCandidate = vi.fn()
    const onInvalidate = vi.fn()
    const detector = new MediaDetector(
      { onCandidate, onInvalidate },
      {
        elementFromPoint: () => image,
        viewport: () => ({ ...VIEWPORT }),
        now: () => 1_000,
        host: () => X_HOST,
      },
    )
    detector.start()
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 8, clientY: 8, bubbles: true }))
    expect(onCandidate).toHaveBeenCalledTimes(1)

    stubBox(image, 100, 100)
    detector.refresh()

    expect(onInvalidate).toHaveBeenCalledWith('scroll')
    detector.dispose()
  })
})
