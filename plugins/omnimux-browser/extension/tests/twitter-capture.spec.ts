// @vitest-environment jsdom
/**
 * Verification for the X/Twitter post capture (Issue #3170).
 *
 * Every case builds a post element from markup and asserts on the returned
 * contract. Three properties matter more than the happy paths and are asserted
 * directly, each because the live site proved a naive version wrong:
 *
 * 1. A counter the page did not render leaves its key out of `stats`, never a
 *    zero — `0` means the page showed a zero.
 * 2. The author's avatar is never mistaken for post media, and the avatar
 *    wrapper is matched by the handle-suffixed test id the site actually ships.
 * 3. A video is one media drawn by two containers sharing one address, so the
 *    shape must read every container while the media list stays distinct.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { extractTweetCapture, tweetCaptureForInspiration } from '../src/content/twitter-capture/extractor.ts'

/** Avatar address in the shape the live header serves (size-suffixed file). */
const AVATAR = 'https://pbs.twimg.com/profile_images/1/avatar_x96.jpg'
const AVATAR_UPSCALED = 'https://pbs.twimg.com/profile_images/1/avatar_400x400.jpg'
const PHOTO_1 = 'https://pbs.twimg.com/media/photo-1.jpg'
const PHOTO_2 = 'https://pbs.twimg.com/media/photo-2.jpg'
const PHOTO_3 = 'https://pbs.twimg.com/media/photo-3.jpg'
const PHOTO_4 = 'https://pbs.twimg.com/media/photo-4.jpg'
const POSTER = 'https://pbs.twimg.com/amplify_video_thumb/1/img/poster.jpg'
const QUOTED_PHOTO = 'https://pbs.twimg.com/media/quoted.jpg'

/**
 * The header every fixture shares: author, handle, badge and timestamp link.
 *
 * The avatar wrapper is written the way the site writes it — the test id carries
 * the handle — because an exact-match selector silently finds nothing there.
 */
function header(options: { handle?: string, name?: string, verified?: boolean, datetime?: string } = {}): string {
  const handle = options.handle ?? 'kai'
  const name = options.name ?? 'Kai'
  const badge = options.verified === false ? '' : '<svg data-testid="icon-verified"></svg>'
  const datetime = options.datetime ?? '2026-10-05T10:00:00.000Z'
  return `
    <div data-testid="User-Name">
      <a role="link" href="/${handle}"><span>${name}</span><span>@${handle}</span></a>
      ${badge}
      <a href="/${handle}/status/1234567890"><time datetime="${datetime}"></time></a>
    </div>
    <div data-testid="UserAvatar-Container-${handle}"><img src="${AVATAR}" /></div>`
}

/** Mounts markup and returns the post element. */
function mount(inner: string): HTMLElement {
  document.body.innerHTML = inner
  const article = document.querySelector<HTMLElement>('article[data-testid="tweet"]')
  if (article === null) throw new Error('fixture did not render a post element')
  return article
}

/** Mounts one post with the shared header. */
function post(body: string, options: Parameters<typeof header>[0] = {}): HTMLElement {
  return mount(`<article data-testid="tweet">${header(options)}${body}</article>`)
}

function photos(...urls: string[]): string {
  return urls.map((url) => `<div data-testid="tweetPhoto"><img src="${url}" /></div>`).join('')
}

beforeEach(() => {
  // Both halves: the sensor's own fixtures leave meta tags in `head`, and a
  // stale one would decide a later case.
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('extractTweetCapture · 地址与作者', () => {
  it('返回永久地址、作者、时间与认证态', () => {
    const capture = extractTweetCapture(post('<div data-testid="tweetText">Hello</div>', { verified: true }))
    expect(capture).not.toBeNull()
    expect(capture?.url).toBe('https://x.com/kai/status/1234567890')
    expect(capture?.author.name).toBe('Kai')
    expect(capture?.author.handle).toBe('kai')
    expect(capture?.author.verified).toBe(true)
    expect(capture?.postedAt).toBe('2026-10-05T10:00:00.000Z')
  })

  it('头像取 handle 后缀的容器，并把尺寸后缀升为大图', () => {
    const capture = extractTweetCapture(post('<div data-testid="tweetText">Avatar</div>'))
    expect(capture?.author.avatar).toBe(AVATAR_UPSCALED)
  })

  it('无时间元素时 postedAt 为 null，不编造时间', () => {
    const article = mount(`<article data-testid="tweet">
      <div data-testid="User-Name"><a role="link" href="/kai"><span>Kai</span><span>@kai</span></a></div>
      <a href="/kai/status/1234567890"></a>
      <div data-testid="tweetText">No time</div>
    </article>`)
    expect(extractTweetCapture(article)?.postedAt).toBeNull()
  })

  it('没有永久地址的元素返回 null', () => {
    document.body.innerHTML = '<article data-testid="tweet"><div data-testid="tweetText">no link</div></article>'
    const bare = document.querySelector<HTMLElement>('article[data-testid="tweet"]')
    expect(bare).not.toBeNull()
    expect(extractTweetCapture(bare as HTMLElement)).toBeNull()
  })

  it('引用帖先出现在 DOM 也不能抢占目标地址、作者、时间和计数', () => {
    const article = mount(`<article data-testid="tweet">
      <div data-testid="quoteTweet">${header({ handle: 'quoted', datetime: '2026-01-01T00:00:00.000Z' })}
        <div data-testid="tweetText">Quoted</div><button data-testid="like" aria-label="999 喜欢"></button>
      </div>
      ${header()}<div data-testid="tweetText">Actual target</div>
      <button data-testid="like" aria-label="2 喜欢"></button>
    </article>`)
    const capture = extractTweetCapture(article)
    expect(capture?.url).toBe('https://x.com/kai/status/1234567890')
    expect(capture?.author.handle).toBe('kai')
    expect(capture?.postedAt).toBe('2026-10-05T10:00:00.000Z')
    expect(capture?.stats).toEqual({ likes: 2 })
    expect(capture?.text).toBe('Actual target')
  })

  it('目标没有自己的永久地址时，不借引用地址或当前页面地址保存', () => {
    window.history.pushState({}, '', '/unrelated/status/555')
    const article = mount(`<article data-testid="tweet"><div data-testid="tweetText">Mine</div>
      <div data-testid="quoteTweet">${header({ handle: 'quoted' })}</div>
    </article>`)
    expect(extractTweetCapture(article)).toBeNull()
  })

  it('永久地址去除媒体子路径和跟踪参数，拒绝外站同形链接', () => {
    const article = mount(`<article data-testid="tweet">
      <a href="https://evil.example/kai/status/1"><time></time></a>
      <a href="https://twitter.com/kai/status/222/video/1?s=20">post</a>
    </article>`)
    expect(extractTweetCapture(article)?.url).toBe('https://x.com/kai/status/222')
  })
})

describe('extractTweetCapture · 类型识别', () => {
  it('纯文字：text，无媒体无封面', () => {
    const capture = extractTweetCapture(post('<div data-testid="tweetText">Just words</div>'))
    expect(capture?.shape).toBe('text')
    expect(capture?.mediaUrls).toEqual([])
    expect(capture?.mediaItems).toEqual([])
    expect(capture?.coverUrl).toBe('')
  })

  it('单图：photo', () => {
    const capture = extractTweetCapture(post(`<div data-testid="tweetText">One</div>${photos(PHOTO_1)}`))
    expect(capture?.shape).toBe('photo')
    expect(capture?.mediaUrls).toEqual([PHOTO_1])
    expect(capture?.coverUrl).toBe(PHOTO_1)
  })

  it('多图：gallery，且按 DOM 顺序保留全部媒体', () => {
    const capture = extractTweetCapture(post(`<div data-testid="tweetText">Many</div>${photos(PHOTO_1, PHOTO_2, PHOTO_3, PHOTO_4)}`))
    expect(capture?.shape).toBe('gallery')
    expect(capture?.mediaUrls).toEqual([PHOTO_1, PHOTO_2, PHOTO_3, PHOTO_4])
    expect(capture?.mediaItems).toEqual([PHOTO_1, PHOTO_2, PHOTO_3, PHOTO_4].map((url) => ({ type: 'image', url })))
  })

  it('视频：video，封面取 poster', () => {
    const capture = extractTweetCapture(post(
      `<div data-testid="tweetText">Watch</div><div data-testid="videoPlayer"><video poster="${POSTER}"></video></div>`,
    ))
    expect(capture?.shape).toBe('video')
    expect(capture?.coverUrl).toBe(POSTER)
    expect(capture?.mediaItems).toEqual([{ type: 'video', url: '', poster_url: POSTER }])
  })

  it('视频同时有预览静图容器时仍是 video，且媒体只算一次', () => {
    // The live site draws a video twice: a still wrapper and the player, both
    // resolving to the same poster address. Deduplicating containers rather than
    // addresses would leave only the still and report the post as `photo`.
    const article = post(`<div data-testid="tweetText">Watch</div>
      <div data-testid="tweetPhoto"><img src="${POSTER}" /></div>
      <div data-testid="videoPlayer"><video poster="${POSTER}"></video></div>`)
    const capture = extractTweetCapture(article)
    expect(capture?.shape).toBe('video')
    expect(capture?.mediaUrls).toEqual([POSTER])
    expect(capture?.mediaItems).toEqual([{ type: 'video', url: '', poster_url: POSTER }])
  })

  it('嵌套播放器是一个视频，保留真实地址、封面与明确的媒体身份', () => {
    const capture = extractTweetCapture(post(`<div data-testid="videoComponent" data-media-id="media-123">
      <div data-testid="videoPlayer"><video poster="${POSTER}" src="https://video.twimg.com/123/video.mp4"></video></div>
    </div>`))
    expect(capture?.mediaItems).toEqual([{
      type: 'video', url: 'https://video.twimg.com/123/video.mp4', poster_url: POSTER, source_id: 'media-123',
    }])
  })

  it('没有地址或只有 blob 的视频仍保留视频缺失位置', () => {
    const capture = extractTweetCapture(post(`<div data-testid="videoPlayer"><video></video></div>
      <div data-testid="videoPlayer"><video src="blob:https://x.com/one"></video></div>`))
    expect(capture?.shape).toBe('video')
    expect(capture?.mediaItems).toEqual([{ type: 'video', url: '' }, { type: 'video', url: '' }])
  })

  it('图片尚未加载地址也保留图片类型与缺失位置', () => {
    const capture = extractTweetCapture(post('<div data-testid="tweetPhoto"><img /></div>'))
    expect(capture?.shape).toBe('photo')
    expect(capture?.mediaItems).toEqual([{ type: 'image', url: '' }])
  })

  it('混合附件按原顺序保留，缺失图片不挪走后续视频', () => {
    const capture = extractTweetCapture(post(`${photos(PHOTO_1)}
      <div data-testid="tweetPhoto"><img /></div>
      <div data-testid="videoPlayer"><video><source src="https://video.twimg.com/one.mp4" /></video></div>
      ${photos(PHOTO_2)}`))
    expect(capture?.mediaItems).toEqual([
      { type: 'image', url: PHOTO_1 }, { type: 'image', url: '' },
      { type: 'video', url: 'https://video.twimg.com/one.mp4' }, { type: 'image', url: PHOTO_2 },
    ])
  })

  it('引用转帖：quote，含被引用作者与正文，地址仍是外层推文', () => {
    const article = post(`<div data-testid="tweetText">My take</div>
      <div data-testid="quoteTweet">
        <div data-testid="User-Name"><a role="link" href="/ada"><span>Ada</span><span>@ada</span></a></div>
        <a href="/ada/status/999"><time datetime="2026-10-04T10:00:00.000Z"></time></a>
        <div data-testid="tweetText">Their words</div>
        <div data-testid="tweetPhoto"><img src="${QUOTED_PHOTO}" /></div>
      </div>`)
    const capture = extractTweetCapture(article)
    expect(capture?.shape).toBe('quote')
    expect(capture?.text).toBe('My take')
    expect(capture?.quoted?.text).toBe('Their words')
    expect(capture?.quoted?.author.handle).toBe('ada')
    expect(capture?.quoted?.coverUrl).toBe(QUOTED_PHOTO)
    expect(capture?.url).toBe('https://x.com/kai/status/1234567890')
    expect(capture?.mediaUrls).toEqual([])
    expect(capture?.mediaItems).toEqual([])
  })

  it('投票：poll，解析选项与票数', () => {
    const article = post(`<div data-testid="tweetText">Pick one</div>
      <div data-testid="cardPoll">
        <div data-testid="cardPollChoice">脚本 52%</div>
        <div data-testid="cardPollChoice">BGM 27%</div>
        <div data-testid="cardPollChoice">其他 21%</div>
        <div>1,204 票 · 剩余 2 天</div>
      </div>`)
    const capture = extractTweetCapture(article)
    expect(capture?.shape).toBe('poll')
    expect(capture?.poll?.options).toEqual([
      { label: '脚本', pct: 52 },
      { label: 'BGM', pct: 27 },
      { label: '其他', pct: 21 },
    ])
    expect(capture?.poll?.votes).toBe(1204)
    expect(capture?.poll?.closesAt).toBe('2')
  })

  it('投票结构读不出两个选项时不产出 poll，退化为 text', () => {
    const article = post(`<div data-testid="tweetText">Pick one</div>
      <div data-testid="cardPoll"><div data-testid="cardPollChoice">只有一行</div></div>`)
    const capture = extractTweetCapture(article)
    expect(capture?.poll).toBeUndefined()
    expect(capture?.shape).toBe('text')
  })

  it('链接卡：link', () => {
    const article = post(`<div data-testid="tweetText">Read this</div>
      <div data-testid="card.wrapper"><div data-testid="card.layoutLarge.media"><img src="${PHOTO_1}" /></div></div>`)
    expect(extractTweetCapture(article)?.shape).toBe('link')
  })

  it('转推：repost，读的是 post 之外的来源行', () => {
    document.body.innerHTML = `<div data-testid="cellInnerDiv">
      <div data-testid="socialContext">Nova 转推了</div>
      <article data-testid="tweet">${header()}<div data-testid="tweetText">Original</div></article>
    </div>`
    const article = document.querySelector<HTMLElement>('article[data-testid="tweet"]')
    expect(extractTweetCapture(article as HTMLElement)?.shape).toBe('repost')
  })

  it('来源行属于兄弟推文时不算转推', () => {
    document.body.innerHTML = `<div data-testid="cellInnerDiv">
      <div data-testid="socialContext">Nova 转推了</div>
      <article data-testid="tweet">${header()}<div data-testid="tweetText">Other</div></article>
    </div>
    <div data-testid="cellInnerDiv">
      <article data-testid="tweet">${header({ handle: 'ren' })}<div data-testid="tweetText">Mine</div></article>
    </div>`
    const mine = document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')[1]
    expect(extractTweetCapture(mine)?.shape).toBe('text')
  })
})

describe('tweetCaptureForInspiration', () => {
  it('保留完整已解码正文，投影真实类型而不是把封面转成图片附件', () => {
    const text = `${'长正文'.repeat(1200)} &amp; 保留实体文本`
    const capture = extractTweetCapture(post(`<div data-testid="tweetText">${text}</div>
      <div data-testid="videoPlayer"><video poster="${POSTER}"></video></div>`))!
    const projected = tweetCaptureForInspiration(capture)
    expect(projected.text).toBe(`${'长正文'.repeat(1200)} & 保留实体文本`)
    expect(projected.posted_at).toBe(capture.postedAt)
    expect(projected.cover_url).toBe(POSTER)
    expect(projected.media_items).toEqual([{ type: 'video', url: '', poster_url: POSTER }])
    expect(projected).not.toHaveProperty('mediaUrls')
    expect(projected).not.toHaveProperty('mediaItems')
  })
})

describe('extractTweetCapture · 缺失即缺键', () => {
  it('互动栏缺失时 stats 不含任何键', () => {
    const capture = extractTweetCapture(post('<div data-testid="tweetText">No counters</div>'))
    expect(capture?.stats).toEqual({})
    expect('likes' in (capture?.stats ?? {})).toBe(false)
    expect('views' in (capture?.stats ?? {})).toBe(false)
  })

  it('只渲染点赞时不补其他计数', () => {
    const article = post(`<div data-testid="tweetText">One counter</div>
      <div data-testid="like" aria-label="1,234 喜欢"></div>`)
    expect(extractTweetCapture(article)?.stats).toEqual({ likes: 1234 })
  })

  it('计数为 0 时保留 0（页面确实渲染了 0）', () => {
    const article = post(`<div data-testid="tweetText">Zero</div>
      <div data-testid="like" aria-label="0 喜欢"></div>`)
    expect(extractTweetCapture(article)?.stats).toEqual({ likes: 0 })
  })

  it('缩写计数按单位解析', () => {
    const article = post(`<div data-testid="tweetText">Abbrev</div>
      <div data-testid="retweet" aria-label="1.2K 转推"></div>
      <a href="/kai/status/1/analytics" aria-label="3.4万 次查看"></a>`)
    const stats = extractTweetCapture(article)?.stats
    expect(stats?.shares).toBe(1200)
    expect(stats?.views).toBe(34000)
  })
})

describe('extractTweetCapture · 不误取', () => {
  it('头像不是推文媒体', () => {
    const article = post(`<div data-testid="tweetText">Avatar first</div>${photos(PHOTO_1)}`)
    // 头像 img 出现在推文图片之前，且位于带 handle 后缀的容器内
    expect(article.querySelector('img')?.getAttribute('src')).toBe(AVATAR)
    const capture = extractTweetCapture(article)
    expect(capture?.mediaUrls).toEqual([PHOTO_1])
    expect(capture?.mediaUrls).not.toContain(AVATAR)
    expect(capture?.coverUrl).toBe(PHOTO_1)
  })

  it('引用卡内的媒体不计入本推文媒体', () => {
    const article = post(`<div data-testid="tweetText">Quote only</div>
      <div data-testid="quoteTweet">
        <div data-testid="tweetText">Theirs</div>
        <div data-testid="tweetPhoto"><img src="${QUOTED_PHOTO}" /></div>
      </div>`)
    expect(extractTweetCapture(article)?.mediaUrls).toEqual([])
  })

  it('引用卡内的认证徽章不算本推文作者认证', () => {
    const article = post(`<div data-testid="tweetText">Mine</div>
      <div data-testid="quoteTweet">
        <div data-testid="User-Name"><a role="link" href="/ada"><span>Ada</span></a><svg data-testid="icon-verified"></svg></div>
        <div data-testid="tweetText">Theirs</div>
      </div>`, { verified: false })
    const capture = extractTweetCapture(article)
    expect(capture?.author.verified).toBe(false)
    expect(capture?.quoted?.author.verified).toBe(true)
  })

  it('composer 形态的引用卡（attachments 包裹）同样被识别', () => {
    const article = post(`<div data-testid="tweetText">Mine</div>
      <div data-testid="attachments">
        <div data-testid="User-Name"><a role="link" href="/ada"><span>Ada</span></a></div>
        <div data-testid="tweetText">Theirs</div>
      </div>`)
    const capture = extractTweetCapture(article)
    expect(capture?.shape).toBe('quote')
    expect(capture?.text).toBe('Mine')
    expect(capture?.quoted?.text).toBe('Theirs')
  })

  it('attachments 只包裹自身媒体时不当作引用', () => {
    const article = post(`<div data-testid="tweetText">Mine</div>
      <div data-testid="attachments">${photos(PHOTO_1)}</div>`)
    const capture = extractTweetCapture(article)
    expect(capture?.shape).toBe('photo')
    expect(capture?.mediaUrls).toEqual([PHOTO_1])
  })
})
