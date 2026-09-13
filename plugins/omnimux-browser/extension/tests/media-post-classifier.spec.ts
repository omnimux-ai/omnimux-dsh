// @vitest-environment jsdom
/**
 * Post & work classifier contract.
 *
 * The capsule must be offered for creative assets only. These cases pin the two
 * halves of the rule independently:
 *
 *  - the blacklist rejects avatars, UI icons, brand marks and page chrome, at any
 *    size, and
 *  - the allowlist admits a tweet's own photo, a tweet's video, a feed card on a
 *    creator platform and a work image inside a post container.
 *
 * Each case also asserts through the detector, because the product behaviour is
 * "the capsule does not appear", not "a helper returned false".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MIN_POST_MEDIA_SIZE_PX,
  describePostMediaContext,
  isExcludedRegionElement,
  isPostOrWorkMedia,
} from '../src/content/media-hover/classifier.ts'
import { MediaDetector } from '../src/content/media-hover/detector.ts'
import type { HoverCandidate } from '../src/content/media-hover/types.ts'

const VIEWPORT = { width: 1280, height: 800 }

/** jsdom has no layout engine, so every box is declared explicitly. */
function stubBox(element: Element, width: number, height: number, left = 0, top = 0): void {
  element.getBoundingClientRect = () => ({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  }) as DOMRect
}

/** Builds `html` inside the body and returns the first match of `selector`. */
function mount(html: string, selector: string): Element {
  document.body.innerHTML = html
  const element = document.querySelector(selector)
  if (element === null) throw new Error(`nothing matched ${selector}`)
  return element
}

/**
 * The page host every platform case runs as.
 *
 * Passed into the classifier, and into the detector through its environment,
 * rather than written onto `location`: jsdom exposes that as a non-configurable
 * accessor, and injecting it keeps the rule a pure function of the DOM plus the
 * host it was read from.
 */
const PLATFORM_HOST = 'x.com'

/** Drives the detector once over `element`, as the page at `host`. */
function detectOnce(element: Element, host: string = PLATFORM_HOST): HoverCandidate[] {
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

/** A tweet article shaped like the real one, wrapping `inner`. */
function tweetHtml(inner: string): string {
  return '<article data-testid="tweet">'
    + '<div data-testid="User-Name"><div data-testid="UserAvatar-Container">'
    + '<img class="css-9pa8cd" src="https://pbs.twimg.com/profile_images/1/avatar_normal.jpg" alt="头像">'
    + '</div><span>某作者</span></div>'
    + `<div data-testid="tweetPhoto">${inner}</div>`
    + '</article>'
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ------------------------------------------------------------- 排除：头像类 ---

describe('avatars are never offered the capsule, at any size', () => {
  it('rejects an avatar by its class name', () => {
    const avatar = mount(
      '<article class="post"><img class="user-avatar" src="https://cdn.example.com/a/1.png" alt=""></article>',
      'img',
    )
    stubBox(avatar, 220, 220)

    expect(isExcludedRegionElement(avatar)).toBe(true)
    expect(isPostOrWorkMedia(avatar)).toBe(false)
    expect(detectOnce(avatar)).toHaveLength(0)
  })

  it('rejects an avatar by its alt text', () => {
    const avatar = mount(
      '<article class="post"><img src="https://cdn.example.com/a/2.png" alt="作者头像"></article>',
      'img',
    )
    stubBox(avatar, 220, 220)

    expect(isPostOrWorkMedia(avatar)).toBe(false)
    expect(detectOnce(avatar)).toHaveLength(0)
  })

  it('rejects an avatar by its id and by its data-testid', () => {
    const byId = mount('<article class="post"><img id="profile-photo" src="https://cdn.example.com/a/3.png"></article>', 'img')
    stubBox(byId, 240, 240)
    expect(isPostOrWorkMedia(byId)).toBe(false)

    const byTestId = mount(
      '<article class="post"><img data-testid="user-photo" src="https://cdn.example.com/a/4.png"></article>',
      'img',
    )
    stubBox(byTestId, 240, 240)
    expect(isPostOrWorkMedia(byTestId)).toBe(false)
  })

  it('rejects an image inside an avatar wrapper that names nothing itself', () => {
    const wrapped = mount(
      '<article class="post"><div class="avatar"><img src="https://cdn.example.com/a/5.png" alt=""></div></article>',
      'img',
    )
    stubBox(wrapped, 260, 260)

    // The image carries no naming of its own: the wrapper is what disqualifies it.
    expect(wrapped.getAttribute('class')).toBeNull()
    expect(isExcludedRegionElement(wrapped)).toBe(true)
    expect(detectOnce(wrapped)).toHaveLength(0)
  })

  it('rejects an avatar inside a Twitter status and keeps the status photo', () => {
    const photo = mount(
      tweetHtml('<img src="https://pbs.twimg.com/media/ABC123?format=jpg" alt="配图">'),
      '[data-testid="tweetPhoto"] img',
    )
    // The identity image of the same status, the first image in the article.
    const avatar = document.querySelectorAll('img')[0]!
    stubBox(avatar, 200, 200)
    stubBox(photo, 600, 400)

    expect(isPostOrWorkMedia(avatar, PLATFORM_HOST)).toBe(false)
    expect(detectOnce(avatar)).toHaveLength(0)
    // The status's own photo still passes, in the same document.
    expect(isPostOrWorkMedia(photo, PLATFORM_HOST)).toBe(true)
    expect(detectOnce(photo)).toHaveLength(1)
  })

  it('rejects an avatar that clears the post size floor', () => {
    // The regression this classifier exists for: a large avatar used to pass.
    const avatar = mount(
      '<div class="feed"><img class="avatar" src="https://pbs.twimg.com/profile_images/9/big.jpg" alt=""></div>',
      'img',
    )
    stubBox(avatar, 400, 400)

    expect(MIN_POST_MEDIA_SIZE_PX).toBe(120)
    expect(isPostOrWorkMedia(avatar)).toBe(false)
    expect(detectOnce(avatar)).toHaveLength(0)
  })
})

// --------------------------------------------------- 排除：图标 / 徽标 / 表情 ---

describe('UI icons, marks and reactions are never offered the capsule', () => {
  it.each([
    ['icon', '<img class="icon-search" src="https://cdn.example.com/i/1.svg">'],
    ['logo', '<img class="brand-logo" src="https://cdn.example.com/i/2.png">'],
    ['badge', '<img class="verified-badge" src="https://cdn.example.com/i/3.png" alt="已认证">'],
    ['emoji', '<img class="emoji" src="https://cdn.example.com/i/4.png" alt="😀">'],
    ['reaction', '<img data-testid="reaction" src="https://cdn.example.com/i/5.png">'],
    ['spinner', '<img class="loading-spinner" src="https://cdn.example.com/i/6.gif">'],
  ])('rejects a %s image', (_label, html) => {
    const element = mount(`<article class="post">${html}</article>`, 'img')
    stubBox(element, 160, 160)

    expect(isPostOrWorkMedia(element)).toBe(false)
    expect(detectOnce(element)).toHaveLength(0)
  })

  it('rejects an icon that a template wrapped in an article', () => {
    // Container membership alone must not be enough: templates wrap chrome in
    // `<article>` all the time.
    const icon = mount('<article class="post"><img class="icon" src="https://cdn.example.com/i/7.svg"></article>', 'img')
    stubBox(icon, 300, 300)

    expect(isPostOrWorkMedia(icon)).toBe(false)
    expect(detectOnce(icon)).toHaveLength(0)
  })
})

// ----------------------------------------------------- 排除：导航 / 页脚 / 微小 ---

describe('page chrome and undersized images are never offered the capsule', () => {
  it('rejects a large image inside the site header', () => {
    const banner = mount(
      '<header class="site-header"><img src="https://cdn.example.com/hero.png" alt="站点横幅"></header>',
      'img',
    )
    stubBox(banner, 1200, 400)

    expect(isExcludedRegionElement(banner)).toBe(true)
    expect(detectOnce(banner)).toHaveLength(0)
  })

  it('rejects a large image inside the site footer', () => {
    const banner = mount(
      '<footer><img src="https://cdn.example.com/footer.png" alt=""></footer>',
      'img',
    )
    stubBox(banner, 1000, 300)
    expect(detectOnce(banner)).toHaveLength(0)
  })

  it('rejects an image inside the navigation bar', () => {
    const nav = mount(
      '<nav role="navigation"><img src="https://cdn.example.com/nav.png" alt=""></nav>',
      'img',
    )
    stubBox(nav, 800, 200)
    expect(detectOnce(nav)).toHaveLength(0)
  })

  it('rejects an image in a work container below the post size floor', () => {
    const small = mount(
      '<article class="post"><img src="https://cdn.example.com/small.png" alt="缩略图"></article>',
      'img',
    )
    stubBox(small, 119, 119)

    expect(isPostOrWorkMedia(small)).toBe(false)
    expect(detectOnce(small)).toHaveLength(0)
  })

  it('applies the same floor to a video inside a post container', () => {
    // The floor is a statement about media size, not about tags: a player
    // embedded below it is a control-sized decoration.
    document.body.innerHTML = '<article class="post">'
      + '<video poster="https://cdn.example.com/p.jpg" src="/v/clip.mp4"></video></article>'
    const video = document.querySelector('video')!
    stubBox(video, 119, 119)
    expect(isPostOrWorkMedia(video, PLATFORM_HOST)).toBe(false)
    expect(detectOnce(video)).toHaveLength(0)

    stubBox(video, 640, 360)
    expect(isPostOrWorkMedia(video, PLATFORM_HOST)).toBe(true)
    expect(detectOnce(video)).toHaveLength(1)
  })

  it('admits the same image one pixel above the floor', () => {
    const card = mount(
      '<article class="post"><img src="https://cdn.example.com/card.png" alt="作品"></article>',
      'img',
    )
    stubBox(card, 120, 120)

    expect(isPostOrWorkMedia(card)).toBe(true)
    expect(detectOnce(card)).toHaveLength(1)
  })
})

// ------------------------------------------------------------------ 通过：帖子 ---

describe('post and work media are admitted', () => {
  it('admits an image inside an article', () => {
    const image = mount(
      '<article><img src="https://cdn.example.com/work.png" alt="作品图"></article>',
      'img',
    )
    stubBox(image, 800, 600)

    expect(describePostMediaContext(image)).toBe('work-container')
    expect(detectOnce(image)).toHaveLength(1)
  })

  it('admits an image inside a post / entry-content container', () => {
    const inPost = mount('<div class="post-content"><img src="https://cdn.example.com/a.png" alt=""></div>', 'img')
    stubBox(inPost, 640, 480)
    expect(isPostOrWorkMedia(inPost)).toBe(true)

    const inEntry = mount('<div class="entry-content"><img src="https://cdn.example.com/b.png" alt=""></div>', 'img')
    stubBox(inEntry, 640, 480)
    expect(isPostOrWorkMedia(inEntry)).toBe(true)
  })

  it('admits a bare decorative image on a page with no content container', () => {
    // The old detector offered the capsule here. It must not any more: nothing
    // about this image says "post or work".
    const stray = mount('<div><img src="https://cdn.example.com/decor.png" alt=""></div>', 'img')
    stubBox(stray, 900, 900)

    expect(isPostOrWorkMedia(stray)).toBe(false)
    expect(detectOnce(stray)).toHaveLength(0)
  })

  it('keeps a large post image that a theme wrapped in a link', () => {
    const image = mount(
      '<article class="post"><a href="/post/1"><img src="https://cdn.example.com/work.png" alt=""></a></article>',
      'img',
    )
    stubBox(image, 900, 600)
    expect(detectOnce(image)).toHaveLength(1)
  })
})

// --------------------------------------------------------------- 通过：推特/X ---

describe('X/Twitter status media', () => {
  it('admits the status photo', () => {
    const photo = mount(tweetHtml('<img src="https://pbs.twimg.com/media/XYZ?format=jpg" alt="">'), '[data-testid="tweetPhoto"] img')
    stubBox(photo, 600, 400)

    expect(describePostMediaContext(photo, PLATFORM_HOST)).toBe('tweet')
    expect(isPostOrWorkMedia(photo, PLATFORM_HOST)).toBe(true)
    expect(detectOnce(photo)).toHaveLength(1)
  })

  it('admits the status video and its poster', () => {
    document.body.innerHTML = '<article data-testid="tweet">'
      + '<div data-testid="videoComponent"><video poster="https://pbs.twimg.com/poster.jpg" src="blob:https://x.com/abc"></video></div>'
      + '</article>'
    const video = document.querySelector('video')!
    stubBox(video, 600, 340)

    expect(isPostOrWorkMedia(video, PLATFORM_HOST)).toBe(true)
    expect(detectOnce(video)[0]?.payload.type).toBe('video')
  })

  it('rejects a status video with no data-testid wrapper', () => {
    // The status root is the *scope* of the rule, never evidence for it. A player
    // the site embeds outside `videoComponent` / `videoPlayer` is not identified
    // as the status's own media, however large it renders.
    document.body.innerHTML = '<article data-testid="tweet">'
      + '<div class="css-player"><video poster="https://pbs.twimg.com/p.jpg" src="blob:https://x.com/abc"></video></div>'
      + '</article>'
    const video = document.querySelector('video')!
    stubBox(video, 640, 360)

    expect(describePostMediaContext(video, PLATFORM_HOST)).toBe('excluded')
    expect(isPostOrWorkMedia(video, PLATFORM_HOST)).toBe(false)
    expect(detectOnce(video)).toHaveLength(0)
  })

  it('admits the status player as soon as it carries its container', () => {
    // The complement of the case above: same player, same size, one wrapper.
    document.body.innerHTML = '<article data-testid="tweet">'
      + '<div data-testid="videoPlayer"><video poster="https://pbs.twimg.com/p.jpg" src="blob:https://x.com/abc"></video></div>'
      + '</article>'
    const video = document.querySelector('video')!
    stubBox(video, 640, 360)

    expect(isPostOrWorkMedia(video, PLATFORM_HOST)).toBe(true)
    expect(detectOnce(video)).toHaveLength(1)
  })

  it('rejects the status avatar even when it carries no naming', () => {
    // A picture-profile status: the page's largest image is the avatar.
    document.body.innerHTML = '<article data-testid="tweet">'
      + '<div data-testid="User-Name">'
      + '<div><img src="https://pbs.twimg.com/profile_images/7/x.jpg" alt=""></div>'
      + '</div></article>'
    const avatar = document.querySelector('img')!
    stubBox(avatar, 400, 400)

    expect(isPostOrWorkMedia(avatar, PLATFORM_HOST)).toBe(false)
    expect(detectOnce(avatar)).toHaveLength(0)
  })

  it('rejects an image inside a status whose alt names a badge', () => {
    const badge = mount(
      tweetHtml('<img class="r-1kihufy" src="https://pbs.twimg.com/x.svg" alt="Verified account">'),
      '[data-testid="tweetPhoto"] img',
    )
    stubBox(badge, 200, 200)
    expect(detectOnce(badge)).toHaveLength(0)
  })
})

// ------------------------------------------------------- 通过：平台作品卡片 ---

describe('creator platform feed cards', () => {
  it('admits a Xiaohongshu note image', () => {
    document.body.innerHTML = '<section class="note-item"><a><img src="https://sns-img.xhscdn.com/a.jpg" alt=""></a></section>'
    const image = document.querySelector('img')!
    const link = document.querySelector('a')!
    stubBox(image, 400, 520)
    stubBox(link, 400, 520)

    expect(isPostOrWorkMedia(image, 'www.xiaohongshu.com')).toBe(true)
    expect(detectOnce(link, 'www.xiaohongshu.com')).toHaveLength(1)
  })

  it('admits a Bilibili video card thumbnail', () => {
    document.body.innerHTML = '<div class="bili-video-card"><img src="https://i0.hdslb.com/cover.jpg" alt=""></div>'
    const image = document.querySelector('img')!
    stubBox(image, 320, 200)
    expect(isPostOrWorkMedia(image, 'www.bilibili.com')).toBe(true)
    expect(detectOnce(image, 'www.bilibili.com')).toHaveLength(1)
  })

  it('admits a thumbnail reached through its wrapping link', () => {
    // The pointer lands on the `<a>`; the walk has to reach the image inside it.
    document.body.innerHTML = '<div class="bili-video-card"><a href="/video/1">'
      + '<img src="https://i0.hdslb.com/cover2.jpg" alt=""></a></div>'
    const link = document.querySelector('a')!
    const image = document.querySelector('img')!
    stubBox(link, 320, 200)
    stubBox(image, 320, 200)

    expect(isPostOrWorkMedia(image, 'www.bilibili.com')).toBe(true)
    expect(detectOnce(link, 'www.bilibili.com')).toHaveLength(1)
  })

  it('admits a YouTube thumbnail', () => {
    document.body.innerHTML = '<ytd-rich-item-renderer><img src="https://i.ytimg.com/vi/x.jpg" alt=""></ytd-rich-item-renderer>'
    const image = document.querySelector('img')!
    stubBox(image, 360, 202)

    expect(isPostOrWorkMedia(image, 'www.youtube.com')).toBe(true)
    expect(detectOnce(image, 'www.youtube.com')).toHaveLength(1)
  })

  it('does not let another site borrow a platform card class', () => {
    // The host has to match: a bare `ytd-rich-item-renderer` on an unrelated
    // domain proves nothing about the image.
    document.body.innerHTML = '<div class="bili-video-card"><img src="https://cdn.example.com/x.jpg" alt=""></div>'
    const image = document.querySelector('img')!
    stubBox(image, 320, 200)

    expect(isPostOrWorkMedia(image, 'example.com')).toBe(false)
    expect(detectOnce(image, 'example.com')).toHaveLength(0)
  })
})

// ------------------------------------------------- 回归：对抗探针四类边界 ---

describe('the size gate covers every admitting branch', () => {
  it('rejects a 168x94 thumbnail inside a status photo container', () => {
    // The probe's headline case: a status sidebar thumbnail is not a post
    // picture, and the status branch must not be a way around the size floor.
    const photo = mount(
      tweetHtml('<img src="https://pbs.twimg.com/media/SIDE?format=jpg" alt="">'),
      '[data-testid="tweetPhoto"] img',
    )
    stubBox(photo, 168, 94)

    expect(isPostOrWorkMedia(photo, PLATFORM_HOST)).toBe(false)
    expect(detectOnce(photo)).toHaveLength(0)
  })

  it('rejects an undersized status player', () => {
    document.body.innerHTML = '<article data-testid="tweet">'
      + '<div data-testid="videoComponent">'
      + '<video poster="https://pbs.twimg.com/p.jpg" src="blob:https://x.com/a"></video>'
      + '</div></article>'
    const video = document.querySelector('video')!
    stubBox(video, 240, 94)

    expect(isPostOrWorkMedia(video, PLATFORM_HOST)).toBe(false)
    expect(detectOnce(video)).toHaveLength(0)
  })

  it('rejects a 112x70 Bilibili list thumbnail', () => {
    document.body.innerHTML = '<div class="small-item">'
      + '<img src="https://i0.hdslb.com/small.jpg" alt=""></div>'
    const image = document.querySelector('img')!
    stubBox(image, 112, 70)

    expect(isPostOrWorkMedia(image, 'www.bilibili.com')).toBe(false)
    expect(detectOnce(image, 'www.bilibili.com')).toHaveLength(0)
  })

  it('rejects an undersized thumbnail on every other platform card', () => {
    const cases: [string, string, number, number][] = [
      ['www.youtube.com', '<ytd-watch-flexy><img src="https://i.ytimg.com/side.jpg" alt=""></ytd-watch-flexy>', 168, 94],
      ['www.weibo.com', '<div class="card-wrap"><img src="https://wx.example.com/s.jpg" alt=""></div>', 100, 100],
      ['www.tiktok.com', '<div data-e2e="recommend-list-item-container"><img src="https://p.example.com/s.jpg" alt=""></div>', 96, 128],
      ['www.xiaohongshu.com', '<section class="note-item"><img src="https://sns-img.xhscdn.com/s.jpg" alt=""></section>', 108, 144],
    ]
    for (const [host, html, width, height] of cases) {
      document.body.innerHTML = html
      const image = document.querySelector('img')!
      stubBox(image, width, height)

      expect(isPostOrWorkMedia(image, host), `${host} ${width}x${height} rejected`).toBe(false)
      expect(detectOnce(image, host), `${host} ${width}x${height} silent`).toHaveLength(0)
    }
  })

  it('admits at exactly 120x120 on a status and on a platform card alike', () => {
    // One floor, one boundary, one verdict: the gate is shared by every branch,
    // so the same box is admitted or rejected identically wherever it sits.
    const photo = mount(
      tweetHtml('<img src="https://pbs.twimg.com/media/EDGE?format=jpg" alt="">'),
      '[data-testid="tweetPhoto"] img',
    )
    stubBox(photo, 120, 120)
    expect(isPostOrWorkMedia(photo, PLATFORM_HOST)).toBe(true)

    document.body.innerHTML = '<div class="bili-video-card">'
      + '<img src="https://i0.hdslb.com/edge.jpg" alt=""></div>'
    const card = document.querySelector('img')!
    stubBox(card, 120, 120)
    expect(isPostOrWorkMedia(card, 'www.bilibili.com')).toBe(true)

    // One pixel short on either edge is enough to lose it.
    stubBox(card, 119, 120)
    expect(isPostOrWorkMedia(card, 'www.bilibili.com')).toBe(false)
    stubBox(card, 120, 119)
    expect(isPostOrWorkMedia(card, 'www.bilibili.com')).toBe(false)
  })
})

describe('a status root admits nothing on its own', () => {
  it('rejects an unlabeled large image in a status but outside its media containers', () => {
    // The probe's second case: a large portrait inside a status is not the
    // status's media just because the status is a work.
    document.body.innerHTML = '<article data-testid="tweet">'
      + '<div class="css-1dbjc4n"><img src="https://pbs.twimg.com/profile_banners/9/2" alt=""></div>'
      + '</article>'
    const image = document.querySelector('img')!
    stubBox(image, 600, 600)

    expect(describePostMediaContext(image, PLATFORM_HOST)).toBe('excluded')
    expect(isPostOrWorkMedia(image, PLATFORM_HOST)).toBe(false)
    expect(detectOnce(image)).toHaveLength(0)
  })

  it('holds on every spelling of the status host', () => {
    // The exclusivity is a property of the status markup *and* the host, so it
    // must not be borrowed by a subdomain or lost on a redirect-free alias.
    const hosts = ['x.com', 'www.x.com', 'twitter.com', 'mobile.twitter.com']
    document.body.innerHTML = '<article data-testid="tweet">'
      + '<div class="identity"><img src="https://cdn.example.com/id.png" alt=""></div>'
      + '<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/OK?format=jpg" alt=""></div>'
      + '</article>'
    const [banner, photo] = [...document.querySelectorAll('img')] as HTMLImageElement[]
    stubBox(banner!, 800, 800)
    stubBox(photo!, 600, 400)

    for (const host of hosts) {
      expect(isPostOrWorkMedia(banner!, host), `${host} identity image`).toBe(false)
      expect(isPostOrWorkMedia(photo!, host), `${host} status photo`).toBe(true)
    }
  })

  it('keeps the status photo and the status player beside it', () => {
    document.body.innerHTML = '<article data-testid="tweet">'
      + '<div data-testid="User-Name"><img src="https://pbs.twimg.com/profile_images/1/a.jpg" alt=""></div>'
      + '<div class="identity"><img src="https://pbs.twimg.com/profile_banners/1/2" alt=""></div>'
      + '<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/OK?format=jpg" alt=""></div>'
      + '</article>'
    const [avatar, banner, photo] = [...document.querySelectorAll('img')] as HTMLImageElement[]
    stubBox(avatar!, 400, 400)
    stubBox(banner!, 600, 600)
    stubBox(photo!, 600, 400)

    expect(isPostOrWorkMedia(avatar!, PLATFORM_HOST)).toBe(false)
    expect(isPostOrWorkMedia(banner!, PLATFORM_HOST)).toBe(false)
    expect(isPostOrWorkMedia(photo!, PLATFORM_HOST)).toBe(true)
    expect(detectOnce(photo!)).toHaveLength(1)
  })
})

describe('header, nav and footer are found however deeply they are nested', () => {
  /** Wraps `inner` in `depth` nested containers, well past any ancestor budget. */
  function nest(inner: string, depth: number): string {
    const open = '<div class="post">'.repeat(depth)
    return `${open}${inner}${'</div>'.repeat(depth)}`
  }

  it.each([
    ['footer', '<footer>', '</footer>'],
    ['header', '<header>', '</header>'],
    ['nav', '<nav>', '</nav>'],
    ['role=banner', '<div role="banner">', '</div>'],
    ['role=navigation', '<div role="navigation">', '</div>'],
    ['role=contentinfo', '<div role="contentinfo">', '</div>'],
  ])('rejects a large image 26 levels inside a %s', (_label, open, close) => {
    document.body.innerHTML = `${open}${nest('<img src="https://cdn.example.com/deep.png" alt="">', 26)}${close}`
    const image = document.querySelector('img')!
    stubBox(image, 900, 600)

    expect(isExcludedRegionElement(image)).toBe(true)
    expect(isPostOrWorkMedia(image)).toBe(false)
    expect(detectOnce(image)).toHaveLength(0)
  })

  it('still admits a post image at the same depth outside any chrome region', () => {
    // The unbounded query is scoped to the skeleton regions: content nesting is
    // not a reason to reject anything.
    document.body.innerHTML = nest('<img src="https://cdn.example.com/work.png" alt="">', 26)
    const image = document.querySelector('img')!
    stubBox(image, 900, 600)

    expect(isPostOrWorkMedia(image)).toBe(true)
    expect(detectOnce(image)).toHaveLength(1)
  })
})

describe('a descriptive alt or title is not a role', () => {
  it('admits a work image whose alt names a logo', () => {
    const image = mount(
      '<article class="post"><img src="https://cdn.example.com/logo-work.png" alt="品牌logo设计作品"></article>',
      'img',
    )
    stubBox(image, 800, 600)

    expect(isPostOrWorkMedia(image)).toBe(true)
    expect(detectOnce(image)).toHaveLength(1)
  })

  it('admits a work image whose title names a reaction', () => {
    const image = mount(
      '<article class="post"><img src="https://cdn.example.com/rx.png" title="reaction视频封面" alt=""></article>',
      'img',
    )
    stubBox(image, 800, 600)

    expect(isPostOrWorkMedia(image)).toBe(true)
    expect(detectOnce(image)).toHaveLength(1)
  })

  it('still rejects a class or data-testid that names the same words', () => {
    // The role half keeps the full list: an element *declaring itself* a logo or
    // a reaction is chrome, whatever a nearby description says.
    const byClass = mount(
      '<article class="post"><img class="brand-logo" src="https://cdn.example.com/i/1.png" alt="作品"></article>',
      'img',
    )
    stubBox(byClass, 300, 300)
    expect(isPostOrWorkMedia(byClass)).toBe(false)

    const byTestId = mount(
      '<article class="post"><img data-testid="reaction" src="https://cdn.example.com/i/2.png" title="作品"></article>',
      'img',
    )
    stubBox(byTestId, 300, 300)
    expect(isPostOrWorkMedia(byTestId)).toBe(false)
  })

  it('still rejects an alt that names an identity or a mark outright', () => {
    for (const alt of ['作者头像', '作者头像图片', 'Verified account', '用户图标', '加载中 loading']) {
      const image = mount(
        `<article class="post"><img src="https://cdn.example.com/a/9.png" alt="${alt}"></article>`,
        'img',
      )
      stubBox(image, 300, 300)
      expect(isPostOrWorkMedia(image), alt).toBe(false)
    }
  })
})

// -------------------------------------------------------------- 契约一致性 ---

describe('classifier contract', () => {
  it('answers a non-media element with false', () => {
    document.body.innerHTML = '<article><div class="player"></div></article>'
    const div = document.querySelector('div')!
    stubBox(div, 800, 600)
    expect(isPostOrWorkMedia(div)).toBe(false)
  })

  it('keeps the post size floor above the detector floor', () => {
    expect(MIN_POST_MEDIA_SIZE_PX).toBe(120)
    expect(MIN_POST_MEDIA_SIZE_PX).toBeGreaterThan(40)
  })

  it('names the admitting context, and `unknown` for an undecided element', () => {
    const inArticle = mount('<article><img src="https://cdn.example.com/a.png" alt=""></article>', 'img')
    stubBox(inArticle, 400, 300)
    expect(describePostMediaContext(inArticle)).toBe('work-container')

    const stray = mount('<div><img src="https://cdn.example.com/b.png" alt=""></div>', 'img')
    stubBox(stray, 400, 300)
    expect(describePostMediaContext(stray)).toBe('unknown')

    const avatar = mount('<div class="avatar"><img src="https://cdn.example.com/c.png" alt=""></div>', 'img')
    stubBox(avatar, 400, 300)
    expect(describePostMediaContext(avatar)).toBe('excluded')
  })
})
