// @vitest-environment jsdom
//
// 6 平台作品提取 + 通用兜底的扩展侧契约（Issue #3472）。
// 断言使用 node:assert/strict（仓库 guard-anti-cheat 只放行既有风险的 expect 调用）；
// 为保证写入门禁可做静态检查，本文件不使用 TS 专有语法（类型标注 / as / import type）。
//
// 每个平台一个 fixture HTML/JSON，断言标题/正文/作者/媒体直链/统计/发布时间；
// 另外覆盖：无专用 JSON 时的通用兜底、空页面 null、media 上限截断。
import { beforeEach, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { capturePost } from '../src/content/capture/index.ts'

/** 挂载页面并返回 document；script 只保留文本，jsdom 不执行。 */
function mountPage(options) {
  document.head.innerHTML = options.head ?? ''
  document.body.innerHTML = options.body ?? ''
  if (options.title !== undefined) document.title = options.title
  return document
}

/** 以指定地址抓取当前 document。 */
function capture(href) {
  return capturePost(document, { href })
}

/** 断言非空并返回，避免每个用例重复判空。 */
function requirePost(post) {
  assert.ok(post !== null, 'capturePost 不应返回 null')
  return post
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.title = ''
})

describe('YouTube 提取（ytInitialPlayerResponse）', () => {
  const PLAYER_RESPONSE = {
    videoDetails: {
      videoId: 'abc123',
      title: '测试视频标题',
      author: '创作者频道',
      shortDescription: '视频描述第一行\n第二行',
      viewCount: '12345',
      lengthSeconds: '62',
      channelId: 'UC123',
      thumbnail: {
        thumbnails: [
          { url: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg', width: 480, height: 360 },
          { url: 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg', width: 1280, height: 720 },
        ],
      },
    },
    microformat: {
      playerMicroformatRenderer: {
        title: '测试视频标题',
        publishDate: '2026-10-01T08:00:00-07:00',
        uploadDate: '2026-10-01T08:00:00-07:00',
        ownerProfileUrl: 'http://www.youtube.com/@creator',
        ownerChannelName: '创作者频道',
      },
    },
    streamingData: {
      formats: [
        { mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', url: 'https://rr1.googlevideo.com/videoplayback?itag=18', height: 360, bitrate: 500000 },
        { mimeType: 'video/mp4; codecs="avc1.640028, mp4a.40.2"', url: 'https://rr1.googlevideo.com/videoplayback?itag=22', height: 720, bitrate: 2000000 },
      ],
      adaptiveFormats: [
        { mimeType: 'video/mp4; codecs="avc1.640028"', url: 'https://rr1.googlevideo.com/adaptive-video', height: 1080 },
        { mimeType: 'audio/mp4; codecs="mp4a.40.2"', url: 'https://rr1.googlevideo.com/adaptive-audio' },
      ],
    },
  }

  function mountWatchPage() {
    mountPage({
      head: `<link rel="canonical" href="https://www.youtube.com/watch?v=abc123">
        <meta property="og:title" content="OG 标题">
        <meta property="og:image" content="https://i.ytimg.com/vi/abc123/og.jpg">`,
      body: `<script>var ytInitialPlayerResponse = ${JSON.stringify(PLAYER_RESPONSE)};</script>`,
    })
  }

  it('取 videoDetails/microformat 与最高质量 muxed mp4', () => {
    mountWatchPage()
    const post = requirePost(capture('https://www.youtube.com/watch?v=abc123&t=10'))
    assert.equal(post.platform, 'youtube')
    assert.equal(post.title, '测试视频标题')
    assert.equal(post.content, '视频描述第一行\n第二行')
    assert.deepEqual(post.author, { name: '创作者频道', handle: 'creator' })
    assert.equal(post.content_shape, 'video')
    assert.equal(post.source_url, 'https://www.youtube.com/watch?v=abc123')
    assert.equal(post.cover_url, 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg')
    assert.deepEqual(post.stats, { views: 12345 })
    assert.equal(post.posted_at, new Date('2026-10-01T08:00:00-07:00').toISOString())
    // 只有 muxed（含 mp4a）的 formats 入选；adaptive 的 video-only 1080p 不取。
    assert.deepEqual(post.media, [{ type: 'video', url: 'https://rr1.googlevideo.com/videoplayback?itag=22' }])
  })

  it('没有 playerResponse 时退回 og/meta', () => {
    mountPage({
      head: `<meta property="og:title" content="只有 meta 的视频页">
        <meta property="og:description" content="meta 描述">
        <meta property="og:image" content="https://i.ytimg.com/vi/abc123/og.jpg">`,
    })
    const post = requirePost(capture('https://www.youtube.com/watch?v=abc123'))
    assert.equal(post.platform, 'youtube')
    assert.equal(post.title, '只有 meta 的视频页')
    assert.equal(post.content, 'meta 描述')
    assert.equal(post.media.length, 0, '解析不到播放地址时媒体为空，交给旧导入链路')
  })
})

describe('TikTok 提取（__UNIVERSAL_DATA_FOR_REHYDRATION__）', () => {
  function mountScope(scope, canonical) {
    mountPage({
      head: `<link rel="canonical" href="${canonical}">`,
      body: `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: scope })}</script>`,
    })
  }

  it('视频作品：desc/author/stats/playAddr/cover', () => {
    mountScope({
      'webapp.video-detail': {
        itemInfo: {
          itemStruct: {
            id: '7300000000000000000',
            desc: 'TikTok 标题行\n第二行描述',
            createTime: 1728000000,
            author: { uniqueId: 'tiktokuser', nickname: 'TikTok 作者' },
            stats: { diggCount: 1200, commentCount: 34, shareCount: 56, playCount: 78900, collectCount: 12 },
            video: {
              playAddr: 'https://v16-webapp.tiktok.com/video.mp4',
              cover: 'https://p16-sign.tiktokcdn.com/cover.jpg',
              duration: 15,
            },
          },
        },
      },
    }, 'https://www.tiktok.com/@tiktokuser/video/7300000000000000000')
    const post = requirePost(capture('https://www.tiktok.com/@tiktokuser/video/7300000000000000000'))
    assert.equal(post.platform, 'tiktok')
    assert.equal(post.title, 'TikTok 标题行')
    assert.equal(post.content, 'TikTok 标题行\n第二行描述')
    assert.deepEqual(post.author, { name: 'TikTok 作者', handle: 'tiktokuser' })
    assert.equal(post.content_shape, 'video')
    assert.deepEqual(post.media, [{ type: 'video', url: 'https://v16-webapp.tiktok.com/video.mp4' }])
    assert.equal(post.cover_url, 'https://p16-sign.tiktokcdn.com/cover.jpg')
    assert.deepEqual(post.stats, { likes: 1200, comments: 34, shares: 56, views: 78900, collects: 12 })
    assert.equal(post.posted_at, new Date(1728000000 * 1000).toISOString())
    assert.equal(post.source_url, 'https://www.tiktok.com/@tiktokuser/video/7300000000000000000')
  })

  it('图集作品：imagePost 每张取 urlList 中最大的一张', () => {
    mountScope({
      'webapp.post-detail': {
        itemInfo: {
          itemStruct: {
            id: '7300000000000000001',
            desc: 'TikTok 图集标题',
            author: { uniqueId: 'tiktokphoto', nickname: '图集作者' },
            stats: { diggCount: 7 },
            imagePost: {
              images: [
                { imageURL: { urlList: ['https://p16-sign.tiktokcdn.com/small-1.jpg', 'https://p16-sign.tiktokcdn.com/large-1.jpg'] } },
                { imageURL: { urlList: ['https://p16-sign.tiktokcdn.com/large-2.jpg'] } },
              ],
            },
          },
        },
      },
    }, 'https://www.tiktok.com/@tiktokphoto/photo/7300000000000000001')
    const post = requirePost(capture('https://www.tiktok.com/@tiktokphoto/photo/7300000000000000001'))
    assert.equal(post.content_shape, 'gallery')
    assert.deepEqual(post.media, [
      { type: 'image', url: 'https://p16-sign.tiktokcdn.com/large-1.jpg' },
      { type: 'image', url: 'https://p16-sign.tiktokcdn.com/large-2.jpg' },
    ])
    assert.equal(post.cover_url, 'https://p16-sign.tiktokcdn.com/large-1.jpg')
  })
})

describe('X 提取（复用 twitter-capture）', () => {
  function mountTweet(options = {}) {
    const videoSrc = options.videoSrc === undefined ? '' : ` src="${options.videoSrc}"`
    const poster = options.poster === undefined ? 'https://pbs.twimg.com/poster.jpg' : options.poster
    mountPage({
      body: `<article data-testid="tweet" tabindex="-1">
        <div data-testid="User-Name">
          <a role="link" href="/kai"><span>Kai</span><span>@kai</span></a>
          <a href="/kai/status/1234567890"><time datetime="2026-10-05T10:00:00.000Z"></time></a>
        </div>
        <div data-testid="tweetText">X 帖子第一行
第二行</div>
        <div data-testid="videoComponent"><video${videoSrc} poster="${poster}"></video></div>
        <div role="group" aria-label="1.2万 次查看">
          <button data-testid="like" aria-label="1.2万 喜欢"></button>
          <button data-testid="reply" aria-label="34 回复"></button>
          <button data-testid="retweet" aria-label="56 转帖"></button>
        </div>
      </article>`,
    })
  }

  it('直播回放只有缩略图时按图片处理，不把 .jpg 标成视频', () => {
    mountTweet()
    const post = requirePost(capture('https://x.com/kai/status/1234567890'))
    assert.equal(post.platform, 'x')
    assert.equal(post.source_url, 'https://x.com/kai/status/1234567890')
    assert.equal(post.title, 'X 帖子第一行')
    assert.equal(post.content, 'X 帖子第一行\n第二行')
    assert.deepEqual(post.author, { name: 'Kai', handle: 'kai' })
    assert.equal(post.content_shape, 'photo')
    assert.deepEqual(post.media, [{ type: 'image', url: 'https://pbs.twimg.com/poster.jpg' }])
    assert.equal(post.cover_url, 'https://pbs.twimg.com/poster.jpg')
    assert.equal(post.stats?.likes, 12000)
    assert.equal(post.stats?.comments, 34)
    assert.equal(post.stats?.shares, 56)
    assert.equal(post.stats?.views, 12000)
    assert.equal(post.posted_at, '2026-10-05T10:00:00.000Z')
  })

  it('媒体类型按地址判定：图片扩展名优先，不把回放缩略图当视频', () => {
    mountTweet({ poster: 'https://prod-fastly-us-east-1.video.pscp.tv/Transcoding/thumbnail/a.jpg?token=1' })
    const post = requirePost(capture('https://x.com/kai/status/1234567890'))
    assert.equal(post.media[0].type, 'image')
    assert.equal(post.media[0].url, 'https://prod-fastly-us-east-1.video.pscp.tv/Transcoding/thumbnail/a.jpg?token=1')
  })

  it('没有可保存帖子的页面返回 null', () => {
    mountPage({ body: '<main><div>登录时间线</div></main>' })
    assert.equal(capture('https://x.com/home'), null)
  })
})

describe('Instagram 提取（shortcode_media JSON）', () => {
  /** key 由字符串拼进 JSON，避免测试里出现动态计算属性。 */
  function mountMedia(key, media) {
    const payload = '{' + JSON.stringify(key) + ':' + JSON.stringify(media) + '}'
    mountPage({ body: `<script type="application/json">${payload}</script>` })
  }

  it('视频作品：video_url/caption/owner/stats', () => {
    mountMedia('xdt_shortcode_media', {
      __typename: 'XDTGraphVideo',
      shortcode: 'ABC123',
      is_video: true,
      display_url: 'https://scontent.cdninstagram.com/cover.jpg',
      video_url: 'https://scontent.cdninstagram.com/video.mp4',
      edge_media_to_caption: { edges: [{ node: { text: 'IG 标题行\n文字描述' } }] },
      owner: { username: 'iguser', full_name: 'IG 作者' },
      edge_liked_by: { count: 4321 },
      edge_media_to_comment: { count: 12 },
      video_view_count: 98765,
      taken_at_timestamp: 1728000000,
    })
    const post = requirePost(capture('https://www.instagram.com/p/ABC123/'))
    assert.equal(post.platform, 'instagram')
    assert.equal(post.title, 'IG 标题行')
    assert.equal(post.content, 'IG 标题行\n文字描述')
    assert.deepEqual(post.author, { name: 'IG 作者', handle: 'iguser' })
    assert.equal(post.content_shape, 'video')
    assert.deepEqual(post.media, [{ type: 'video', url: 'https://scontent.cdninstagram.com/video.mp4' }])
    assert.equal(post.cover_url, 'https://scontent.cdninstagram.com/cover.jpg')
    assert.deepEqual(post.stats, { likes: 4321, comments: 12, views: 98765 })
    assert.equal(post.posted_at, new Date(1728000000 * 1000).toISOString())
    assert.equal(post.source_url, 'https://www.instagram.com/p/ABC123/')
  })

  it('sidecar 轮播：children 逐条取图/视频', () => {
    mountMedia('shortcode_media', {
      shortcode: 'CAROUSEL1',
      is_video: false,
      display_url: 'https://scontent.cdninstagram.com/cover.jpg',
      edge_media_to_caption: { edges: [{ node: { text: '轮播标题' } }] },
      owner: { username: 'carouseluser', full_name: '轮播作者' },
      edge_sidecar_to_children: {
        edges: [
          { node: { is_video: false, display_url: 'https://scontent.cdninstagram.com/p1.jpg' } },
          { node: { is_video: true, display_url: 'https://scontent.cdninstagram.com/p2.jpg', video_url: 'https://scontent.cdninstagram.com/p2.mp4' } },
        ],
      },
    })
    const post = requirePost(capture('https://www.instagram.com/p/CAROUSEL1/'))
    assert.equal(post.content_shape, 'video')
    assert.deepEqual(post.media, [
      { type: 'image', url: 'https://scontent.cdninstagram.com/p1.jpg' },
      { type: 'video', url: 'https://scontent.cdninstagram.com/p2.mp4' },
    ])
  })
})

describe('抖音提取（_ROUTER_DATA 内联 JSON）', () => {
  const ROUTER_DATA = {
    loaderData: {
      'video_(id)/page': {
        videoInfoRes: {
          item_list: [{
            aweme_id: '7126745726494825736',
            desc: '抖音标题行\n抖音描述',
            create_time: 1728000000,
            author: { nickname: '抖音作者', unique_id: 'douyin_user', short_id: '123' },
            video: {
              play_addr: { url_list: ['https://v3-dy.douyinvod.com/play.mp4'] },
              cover: { url_list: ['https://p3-sign.douyinpic.com/cover.jpg'] },
              duration: 15000,
            },
            statistics: { digg_count: 1000, comment_count: 20, share_count: 30, collect_count: 40 },
          }],
        },
      },
    },
  }

  it('从 _ROUTER_DATA 找到作品结构', () => {
    const href = 'https://www.douyin.com/video/7126745726494825736?previous_page=app_code_link'
    mountPage({ body: `<script>window._ROUTER_DATA = ${JSON.stringify(ROUTER_DATA)};</script>` })
    const post = requirePost(capture(href))
    assert.equal(post.platform, 'douyin')
    assert.equal(post.title, '抖音标题行')
    assert.equal(post.content, '抖音标题行\n抖音描述')
    assert.deepEqual(post.author, { name: '抖音作者', handle: 'douyin_user' })
    assert.equal(post.content_shape, 'video')
    assert.deepEqual(post.media, [{ type: 'video', url: 'https://v3-dy.douyinvod.com/play.mp4' }])
    assert.equal(post.cover_url, 'https://p3-sign.douyinpic.com/cover.jpg')
    assert.deepEqual(post.stats, { likes: 1000, comments: 20, shares: 30, collects: 40 })
    assert.equal(post.posted_at, new Date(1728000000 * 1000).toISOString())
    // 去掉了 query，host 用 aweme_id 去重。
    assert.equal(post.source_url, 'https://www.douyin.com/video/7126745726494825736')
  })

  it('内联 JSON 被风控移除时退回 [data-e2e] DOM', () => {
    mountPage({
      body: `<main>
        <h1 data-e2e="video-desc">DOM 抖音标题</h1>
        <span data-e2e="user-name">DOM 抖音作者</span>
        <video poster="https://p3-sign.douyinpic.com/poster.jpg"><source src="https://v3-dy.douyinvod.com/dom.mp4"></video>
      </main>`,
    })
    const post = requirePost(capture('https://www.douyin.com/video/7000000000000000000'))
    assert.equal(post.platform, 'douyin')
    assert.equal(post.title, 'DOM 抖音标题')
    assert.equal(post.content, 'DOM 抖音标题')
    assert.equal(post.author.name, 'DOM 抖音作者')
    assert.equal(post.content_shape, 'video')
    assert.deepEqual(post.media, [{ type: 'video', url: 'https://v3-dy.douyinvod.com/dom.mp4' }])
    assert.equal(post.cover_url, 'https://p3-sign.douyinpic.com/poster.jpg')
  })

  it('空页面返回 null（风控下不制造假数据）', () => {
    mountPage({ body: '<div id="app"></div>' })
    assert.equal(capture('https://www.douyin.com/video/7000000000000000000'), null)
  })
})

describe('小红书提取（__INITIAL_STATE__）', () => {
  const NOTE = {
    noteId: 'abc123def',
    title: '小红书标题',
    desc: '小红书描述文本',
    time: 1728000000000,
    user: { nickname: '小红薯作者', userId: 'xhs_user_1' },
    imageList: [
      { urlDefault: 'https://sns-img.xhscdn.com/1.jpg', urlPre: 'https://sns-img.xhscdn.com/1-pre.jpg' },
      { urlDefault: 'https://sns-img.xhscdn.com/2.jpg' },
    ],
    interactInfo: { likedCount: 321, commentCount: 22, shareCount: 11, collectedCount: 99 },
  }

  it('state 里的 undefined 字面量容错，仍能解析作品', () => {
    const state = '{"note":{"noteDetailMap":{"abc123def":{"note":' + JSON.stringify(NOTE) + '}}},"user":undefined}'
    mountPage({ body: `<script>window.__INITIAL_STATE__ = ${state};</script>` })
    const post = requirePost(capture('https://www.xiaohongshu.com/explore/abc123def'))
    assert.equal(post.platform, 'xiaohongshu')
    assert.equal(post.title, '小红书标题')
    assert.equal(post.content, '小红书描述文本')
    assert.deepEqual(post.author, { name: '小红薯作者', handle: 'xhs_user_1' })
    assert.equal(post.content_shape, 'gallery')
    assert.deepEqual(post.media, [
      { type: 'image', url: 'https://sns-img.xhscdn.com/1.jpg' },
      { type: 'image', url: 'https://sns-img.xhscdn.com/2.jpg' },
    ])
    assert.equal(post.cover_url, 'https://sns-img.xhscdn.com/1.jpg')
    assert.deepEqual(post.stats, { likes: 321, comments: 22, shares: 11, collects: 99 })
    assert.equal(post.posted_at, new Date(1728000000000).toISOString())
    assert.equal(post.source_url, 'https://www.xiaohongshu.com/explore/abc123def')
  })

  it('视频笔记：取 stream 里的 masterUrl', () => {
    const note = {
      noteId: 'video1',
      title: '小红书视频标题',
      desc: '视频笔记描述',
      time: 1728000000000,
      user: { nickname: '视频作者', userId: 'xhs_video_user' },
      imageList: [{ urlDefault: 'https://sns-img.xhscdn.com/cover.jpg' }],
      video: { media: { stream: { h264: [{ masterUrl: 'https://sns-video.xhscdn.com/video.mp4' }] } } },
    }
    mountPage({ body: `<script>window.__INITIAL_STATE__ = ${JSON.stringify({ note: { noteDetailMap: { id1: { note } } } })};</script>` })
    const post = requirePost(capture('https://www.xiaohongshu.com/explore/id1'))
    assert.equal(post.content_shape, 'video')
    assert.deepEqual(post.media, [
      { type: 'image', url: 'https://sns-img.xhscdn.com/cover.jpg' },
      { type: 'video', url: 'https://sns-video.xhscdn.com/video.mp4' },
    ])
  })
})

describe('通用兜底（og / JSON-LD / DOM）', () => {
  const JSON_LD = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: 'JSON-LD 名称',
    headline: 'JSON-LD 标题',
    contentUrl: 'https://cdn.example.com/jsonld.mp4',
    datePublished: '2026-10-01',
    thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
  }

  function mountGeneric() {
    mountPage({
      head: `<meta property="og:title" content="通用作品标题">
        <meta property="og:description" content="通用作品描述">
        <meta property="og:image" content="https://cdn.example.com/cover.jpg">
        <meta name="author" content="通用作者">
        <script type="application/ld+json">${JSON.stringify(JSON_LD)}</script>`,
      body: `<article>
        <video poster="https://cdn.example.com/poster.jpg"><source src="https://cdn.example.com/inline.mp4"></video>
        <img src="https://cdn.example.com/photo-1.jpg" width="800" height="600">
        <img src="https://cdn.example.com/photo-2.jpg" width="800" height="600">
        <img src="https://cdn.example.com/avatar-strip.jpg" width="48" height="48">
      </article>`,
    })
  }

  it('未知站点只拼 og/JSON-LD 素材与主视频，不收正文全部图片', () => {
    mountGeneric()
    const post = requirePost(capture('https://example.com/work/42'))
    assert.equal(post.platform, 'web')
    assert.equal(post.title, '通用作品标题')
    assert.equal(post.content, '通用作品描述')
    assert.equal(post.author.name, '通用作者')
    assert.equal(post.content_shape, 'video')
    assert.equal(post.cover_url, 'https://cdn.example.com/cover.jpg')
    assert.equal(post.posted_at, '2026-10-01T00:00:00.000Z')
    // 顺序：<video> 内联播放地址 → JSON-LD contentUrl → og 图 → JSON-LD 缩略图；
    // 正文 photo-1/photo-2 不再被当成作品素材。
    assert.deepEqual(post.media, [
      { type: 'video', url: 'https://cdn.example.com/inline.mp4' },
      { type: 'video', url: 'https://cdn.example.com/jsonld.mp4' },
      { type: 'image', url: 'https://cdn.example.com/cover.jpg' },
      { type: 'image', url: 'https://cdn.example.com/thumb.jpg' },
    ])
  })

  it('只有 og:title 的站点也能保存（媒体为空，交给旧链路）', () => {
    mountPage({ head: '<meta property="og:title" content="仅标题页面">' })
    const post = requirePost(capture('https://example.com/work/7'))
    assert.equal(post.platform, 'web')
    assert.equal(post.title, '仅标题页面')
    assert.equal(post.media.length, 0)
  })

  it('空页面返回 null', () => {
    mountPage({})
    assert.equal(capture('https://example.com/empty'), null)
  })

  it('无 og 的正文页只取第一张主图（不再收录 20 张正文图）', () => {
    const images = Array.from({ length: 25 }, (_, index) =>
      `<img src="https://cdn.example.com/cap-${index + 1}.jpg" width="800" height="600">`).join('')
    mountPage({
      head: '<meta property="og:title" content="图片上限页面">',
      body: `<article>${images}</article>`,
    })
    const post = requirePost(capture('https://example.com/work/many'))
    assert.equal(post.media.length, 1)
    assert.equal(post.content_shape, 'photo')
    assert.equal(post.media[0].url, 'https://cdn.example.com/cap-1.jpg')
  })

  it('cookie 来自 document.cookie，随作品一起回传', () => {
    mountGeneric()
    document.cookie = 'dsh_capture_probe=1'
    const post = requirePost(capture('https://example.com/work/42'))
    assert.match(post.cookie ?? '', /dsh_capture_probe=1/)
    document.cookie = 'dsh_capture_probe=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('host 按 dot boundary 分派，notx.com 不被当成 X', () => {
    mountPage({
      head: '<meta property="og:title" content="仿冒站点主页">',
      body: '<article><img src="https://cdn.example.com/a.jpg" width="800" height="600"></article>',
    })
    const post = requirePost(capture('https://notx.com/kai/status/1'))
    assert.equal(post.platform, 'web')
  })
})

// 以下用例的数据结构来自 2026-10-21 ego-browser 注入真实页面后的实测结果
// （Issue #3485）：Instagram 的 Relay 包装（items 深度 15）、抖音 MAIN world
// 桥接节点、小红书带 xsec_token 的详情地址。
describe('真实页面结构（ego 注入验证，Issue #3485）', () => {
  /** 把 items 包进 Instagram 页面的 Relay 形状，深度确保超过旧 14 层上限。 */
  function relayWrapped(items) {
    const payload = {
      require: [
        ['ScheduledServerJS', 'handle', null, [
          ['__bbox', { result: { data: { xdt_api__v1__media__shortcode__web_info: { items } } } }],
        ]],
      ],
    }
    return { a: { b: { c: payload } } }
  }

  it('Instagram: 真实 Relay 形状的 items[0]（视频 + 作者 + 统计）', () => {
    const item = {
      pk: '4011477195854994819',
      code: 'DeroUGDhF2D',
      taken_at: 1792425706,
      media_type: 2,
      video_versions: [{ url: 'https://scontent.cdninstagram.com/o1/v/t2/reel.mp4', width: 720, height: 1280 }],
      image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/v/t51/cover.jpg' }] },
      user: { username: 'instagram', full_name: 'Instagram' },
      caption: { text: 'new NBA season prep with @jordanclarksons' },
      like_count: 132587,
      comment_count: 9539,
      play_count: 98765,
    }
    mountPage({ body: '<script type="application/json">' + JSON.stringify(relayWrapped([item])) + '</script>' })
    const post = requirePost(capture('https://www.instagram.com/instagram/reel/DeroUGDhF2D/'))
    assert.equal(post.platform, 'instagram')
    assert.equal(post.content_shape, 'video')
    assert.deepEqual(post.media, [{ type: 'video', url: 'https://scontent.cdninstagram.com/o1/v/t2/reel.mp4' }])
    assert.deepEqual(post.author, { name: 'Instagram', handle: 'instagram' })
    assert.equal(post.title, 'new NBA season prep with @jordanclarksons')
    assert.deepEqual(post.stats, { likes: 132587, comments: 9539, views: 98765 })
    assert.equal(post.cover_url, 'https://scontent.cdninstagram.com/v/t51/cover.jpg')
  })

  it('Instagram: 真实 carousel 多图按 gallery', () => {
    const item = {
      pk: 'carousel-1',
      code: 'ABC123',
      taken_at: 1792425706,
      media_type: 8,
      carousel_media: [
        { image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/p1.jpg' }] } },
        { image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/p2.jpg' }] } },
      ],
      user: { username: 'gallery_owner', full_name: 'Gallery Owner' },
      caption: { text: 'two photos' },
    }
    mountPage({ body: '<script type="application/json">' + JSON.stringify(relayWrapped([item])) + '</script>' })
    const post = requirePost(capture('https://www.instagram.com/p/ABC123/'))
    assert.equal(post.content_shape, 'gallery')
    assert.deepEqual(post.media.map((entry) => entry.url), [
      'https://scontent.cdninstagram.com/p1.jpg',
      'https://scontent.cdninstagram.com/p2.jpg',
    ])
    assert.deepEqual(post.author, { name: 'Gallery Owner', handle: 'gallery_owner' })
  })

  it('抖音: MAIN world 桥接的 aweme_detail 提供作者与 play_addr', () => {
    const bridge = {
      aweme_detail: {
        aweme_id: '7680138095160806708',
        desc: '终于有一天，我走进了现实版的《动物世界》',
        author: { nickname: '马玉晗Martin', unique_id: 'Martin998' },
        video: {
          play_addr: { url_list: ['https://v26-web.douyinvod.com/802f9a117264d5d/video.mp4'] },
          cover: { url_list: ['https://p3-pc-sign.douyinpic.com/image-cut-tos-priv/cover.jpg'] },
        },
        statistics: { digg_count: 795, comment_count: 66, share_count: 149, collect_count: 104 },
        create_time: 1760000000,
      },
    }
    mountPage({
      body: '<script type="application/json" id="omnimux-douyin-capture">' + JSON.stringify(bridge) + '</script>',
    })
    const post = requirePost(capture('https://www.douyin.com/video/7680138095160806708'))
    assert.equal(post.platform, 'douyin')
    assert.equal(post.content_shape, 'video')
    assert.deepEqual(post.author, { name: '马玉晗Martin', handle: 'Martin998' })
    assert.deepEqual(post.media, [{ type: 'video', url: 'https://v26-web.douyinvod.com/802f9a117264d5d/video.mp4' }])
    assert.deepEqual(post.stats, { likes: 795, comments: 66, shares: 149, collects: 104 })
    assert.equal(post.cover_url, 'https://p3-pc-sign.douyinpic.com/image-cut-tos-priv/cover.jpg')
  })

  it('小红书: 带 xsec_token 的详情地址被完整保留', () => {
    const note = {
      noteId: '6ad05a55000000001802a9fc',
      title: '海外创意钩子分享',
      desc: '笔记正文',
      time: 1728000000000,
      user: { nickname: 'Miss圆滚滚', userId: '5b5e7e4ee8ac2b449a5f7a00' },
      imageList: [{ urlDefault: 'https://sns-webpic-qc.xhscdn.com/note.jpg' }],
      interactInfo: { likedCount: 12, commentCount: 3 },
    }
    mountPage({
      body: '<script>window.__INITIAL_STATE__ = ' + JSON.stringify({ note: { noteDetailMap: { id1: { note } } } }) + ';</script>',
    })
    const href = 'https://www.xiaohongshu.com/explore/6ad05a55000000001802a9fc?xsec_token=TOKEN123&xsec_source=pc_feed'
    const post = requirePost(capture(href))
    assert.equal(post.source_url, href)
    assert.equal(post.cover_url, 'https://sns-webpic-qc.xhscdn.com/note.jpg')
    assert.deepEqual(post.author, { name: 'Miss圆滚滚', handle: '5b5e7e4ee8ac2b449a5f7a00' })
  })
})
