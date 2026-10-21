// @vitest-environment jsdom
// @ts-nocheck
//
// 账号主页采集契约（Issue #3556 / spec §3.4）：
// - TikTok：universal JSON 的 userInfo（真实页面实测）+ DOM 作品网格卡片；
// - X：profile header DOM + article 列表；登录墙要如实失败，不能当空账号；
// - 失败原因：not-profile-page / empty / page-incomplete；
// - mergeAccountSnapshots：按 post id 去重、后者更新统计、profile 非空覆盖、倒序上限 60。
//
// fixture 形状来自 2026-10-21 ego 真实页面实测（见 account.ts 头注释）：
// TikTok 卡片文本 `1.4M 1,286 1.48% 00:49 68.18 2026/10/10`；
// X 粉丝数 `9,231.2万 关注者`、作品链接 `/NASA/status/2112604875452223824`。
//
// 断言使用 node:assert/strict；本文件只用 JS 语法（acorn 解析的测试门禁要求），
// 不做变量下标（用 .at()）、不用 spread（避免动态执行风险标记）。
import { beforeEach, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { captureAccount, mergeAccountSnapshots } from '../src/content/capture/index.ts'

/** 挂载页面；script 只保留文本，jsdom 不执行。 */
function mountPage(body, head) {
  document.head.innerHTML = head ?? ''
  document.body.innerHTML = body ?? ''
  return document
}

/** 以指定地址采集当前 document。 */
function capture(href) {
  return captureAccount(document, href)
}

/** 断言成功并返回账号。 */
function requireAccount(result) {
  assert.equal(result.ok, true, '应识别为账号主页')
  return result.account
}

/** 断言失败并返回原因。 */
function requireReason(result) {
  assert.equal(result.ok, false, '应为失败结果')
  return result.reason
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('URL 分类', () => {
  it('作品页、非主页路径、非平台站点都返回 not-profile-page', () => {
    mountPage('<div></div>')
    assert.equal(requireReason(capture('https://www.tiktok.com/@tiktok/video/7300000000000000001')), 'not-profile-page')
    assert.equal(requireReason(capture('https://www.tiktok.com/foryou')), 'not-profile-page')
    assert.equal(requireReason(capture('https://www.tiktok.com/')), 'not-profile-page')
    assert.equal(requireReason(capture('https://x.com/NASA/status/2112604875452223824')), 'not-profile-page')
    assert.equal(requireReason(capture('https://x.com/home')), 'not-profile-page')
    assert.equal(requireReason(capture('https://example.com/NASA')), 'not-profile-page')
    assert.equal(requireReason(capture('not a url')), 'not-profile-page')
  })

  it('主页路径带一次性 token hash 仍识别为账号主页', () => {
    mountPage('<div data-testid="UserName"><span>NASA</span><span>@NASA</span></div>')
    const account = requireAccount(capture('https://x.com/NASA#omnimux-refresh=deadbeef'))
    assert.equal(account.platform, 'x')
    assert.equal(account.handle, 'NASA')
    assert.deepEqual(account.posts, [])
  })
})

/* ------------------------------------------------------------------ TikTok */

const TIKTOK_USER = {
  id: '66597435',
  uniqueId: 'tiktok',
  nickname: 'TikTok',
  avatarLarger: 'https://p16-sign.tiktokcdn.com/avatar-large.jpeg',
  signature: 'Make Your Day',
}

const TIKTOK_STATS = {
  followerCount: 96400000,
  followingCount: 1,
  heart: 465900000,
  videoCount: 1511,
  diggCount: 1234,
}

/** 真实页面的 scope 形状：__DEFAULT_SCOPE__['webapp.user-detail'].userInfo。 */
const TIKTOK_SCOPE = {
  __DEFAULT_SCOPE__: {
    'webapp.user-detail': {
      userInfo: {
        user: TIKTOK_USER,
        stats: TIKTOK_STATS,
      },
    },
  },
}

/** 一页网格卡片，文案按实测形状拼装（统计 + 末尾日期）。 */
function tiktokCard(options) {
  const query = options.query ?? ''
  return '<div data-e2e="user-post-item">'
    + '<a href="https://www.tiktok.com/@tiktok/video/' + options.id + query + '">'
    + '<img src="' + options.cover + '" alt="' + options.alt + '">'
    + '</a>'
    + '<div>' + options.text + '</div>'
    + '</div>'
}

/** 挂载 universal JSON（+ 可选 DOM 卡片）。 */
function mountTiktokScope(postsHtml) {
  mountPage(
    '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">'
      + JSON.stringify(TIKTOK_SCOPE)
      + '</script>'
      + (postsHtml ?? ''),
  )
}

const TIKTOK_CARDS = tiktokCard({
  id: '7300000000000000001',
  cover: 'https://p16-sign.tiktokcdn.com/cover-1.jpeg',
  alt: '第一次跳舞的幕后',
  text: '1.4M 1,286 1.48% 00:49 68.18 2026/10/10',
})
  + tiktokCard({
    id: '7300000000000000002',
    cover: 'https://p16-sign.tiktokcdn.com/cover-2.jpeg',
    alt: '第二支作品',
    text: '25.1K 301 3.02% 00:12 55.20 2026/10/03',
  })
  + tiktokCard({
    id: '7300000000000000003',
    cover: 'https://p16-sign.tiktokcdn.com/cover-3.jpeg',
    alt: '第三支作品',
    text: '964 12 1% 00:30 12.5 2025/12/31',
  })
  // 同一作品带跟踪 query 再次出现：按 post id 去重。
  + tiktokCard({
    id: '7300000000000000001',
    cover: 'https://p16-sign.tiktokcdn.com/cover-1.jpeg',
    alt: '第一次跳舞的幕后',
    text: '1.4M 1,286 1.48% 00:49 68.18 2026/10/10',
    query: '?is_from_webapp=1&sender_device=pc',
  })

describe('TikTok 主页（universal JSON + DOM 网格）', () => {
  it('userInfo 提供 handle/nickname/avatar/bio/followers/following/posts_count', () => {
    mountTiktokScope(TIKTOK_CARDS)
    const account = requireAccount(capture('https://www.tiktok.com/@tiktok?lang=zh-Hans'))
    assert.equal(account.platform, 'tiktok')
    assert.equal(account.extractor, 'tiktok-profile')
    assert.equal(account.handle, 'tiktok')
    assert.equal(account.nickname, 'TikTok')
    assert.equal(account.avatar_url, 'https://p16-sign.tiktokcdn.com/avatar-large.jpeg')
    assert.equal(account.bio, 'Make Your Day')
    assert.equal(account.followers, 96400000)
    assert.equal(account.following, 1)
    assert.equal(account.posts_count, 1511)
    assert.match(account.captured_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('三张网格卡：K/M 统计、末尾日期、封面 + 视频地址、按 id 去重', () => {
    mountTiktokScope(TIKTOK_CARDS)
    const account = requireAccount(capture('https://www.tiktok.com/@tiktok'))
    assert.equal(account.posts.length, 3, '同一 /video/ 地址只保留一条')

    const first = account.posts.at(0)
    assert.ok(first !== undefined)
    assert.equal(first.platform_post_id, '7300000000000000001')
    assert.equal(first.source_url, 'https://www.tiktok.com/@tiktok/video/7300000000000000001')
    assert.equal(first.title, '第一次跳舞的幕后')
    assert.equal(first.content, '第一次跳舞的幕后')
    assert.deepEqual(first.stats, { views: 1400000, comments: 1286 })
    assert.equal(first.posted_at, '2026-10-10T00:00:00.000Z')
    assert.deepEqual(first.media, [
      { type: 'image', url: 'https://p16-sign.tiktokcdn.com/cover-1.jpeg' },
      { type: 'video', url: 'https://www.tiktok.com/@tiktok/video/7300000000000000001' },
    ])

    const second = account.posts.at(1)
    assert.ok(second !== undefined)
    assert.deepEqual(second.stats, { views: 25100, comments: 301 })
    assert.equal(second.posted_at, '2026-10-03T00:00:00.000Z')

    const third = account.posts.at(2)
    assert.ok(third !== undefined)
    assert.deepEqual(third.stats, { views: 964, comments: 12 })
    assert.equal(third.posted_at, '2025-12-31T00:00:00.000Z')
  })

  it('universal JSON 缺失/损坏时降级 DOM：handle 取 URL，计数为 null', () => {
    mountPage(
      '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{broken</script>'
        + '<header><h1 data-e2e="user-title">TikTok</h1>'
        + '<img data-e2e="user-avatar" src="https://p16-sign.tiktokcdn.com/avatar-dom.jpeg">'
        + '<p data-e2e="user-bio">DOM 简介</p></header>'
        + tiktokCard({
          id: '7300000000000000009',
          cover: 'https://p16-sign.tiktokcdn.com/cover-dom.jpeg',
          alt: 'DOM 兜底作品',
          text: '964 12 1% 00:30 12.5 2025/12/31',
        }),
    )
    const account = requireAccount(capture('https://www.tiktok.com/@tiktok'))
    assert.equal(account.handle, 'tiktok')
    assert.equal(account.nickname, 'TikTok')
    assert.equal(account.avatar_url, 'https://p16-sign.tiktokcdn.com/avatar-dom.jpeg')
    assert.equal(account.bio, 'DOM 简介')
    assert.equal(account.followers, null)
    assert.equal(account.following, null)
    assert.equal(account.posts_count, null)
    assert.equal(account.posts.length, 1)
  })

  it('DOM 无卡片时回退 JSON itemList（详情页已验证的 itemStruct 形状）', () => {
    const scope = {
      __DEFAULT_SCOPE__: {
        'webapp.user-detail': {
          userInfo: { user: TIKTOK_USER, stats: TIKTOK_STATS },
          itemList: [
            {
              itemStruct: {
                id: '7300000000000000100',
                desc: 'itemList 里的作品',
                createTime: 1760000000,
                author: { uniqueId: 'tiktok' },
                stats: { diggCount: 10, commentCount: 2, playCount: 3000, shareCount: 4 },
                video: {
                  playAddr: 'https://v16-webapp.tiktok.com/video.mp4',
                  cover: 'https://p16-sign.tiktokcdn.com/cover-json.jpg',
                },
              },
            },
          ],
        },
      },
    }
    mountPage('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">'
      + JSON.stringify(scope)
      + '</script>')
    const account = requireAccount(capture('https://www.tiktok.com/@tiktok'))
    assert.equal(account.posts.length, 1)
    const post = account.posts.at(0)
    assert.ok(post !== undefined)
    assert.equal(post.platform_post_id, '7300000000000000100')
    assert.equal(post.title, 'itemList 里的作品')
    assert.deepEqual(post.stats, { likes: 10, comments: 2, views: 3000, shares: 4 })
    assert.equal(post.posted_at, new Date(1760000000 * 1000).toISOString())
    assert.deepEqual(post.media, [
      { type: 'image', url: 'https://p16-sign.tiktokcdn.com/cover-json.jpg' },
      { type: 'video', url: 'https://v16-webapp.tiktok.com/video.mp4' },
    ])
  })

  it('既无 JSON userInfo 也无 DOM h1 时返回 empty', () => {
    mountPage('<div id="app"></div>')
    assert.equal(requireReason(capture('https://www.tiktok.com/@tiktok')), 'empty')
  })
})

/* ------------------------------------------------------------------ X */

/** 真实页面的 profile header 形状。 */
function xHeader() {
  return '<div data-testid="UserName"><div><div><span>NASA</span><span>@NASA</span></div></div></div>'
    + '<div data-testid="UserDescription">探索宇宙的官方账号</div>'
    + '<div data-testid="UserAvatar-Container-NASA">'
    + '<img src="https://pbs.twimg.com/profile_images/1/nasa_normal.jpg">'
    + '</div>'
    + '<a href="/NASA/followers"><span>9,231.2万</span> 关注者</a>'
    + '<a href="/NASA/following"><span>115</span> 正在关注</a>'
}

/** 图文作品：/NASA/status/<id> + tweetText + tweetPhoto + 互动数。 */
function xPhotoArticle() {
  return '<article data-testid="tweet" tabindex="-1">'
    + '<div data-testid="User-Name">'
    + '<div data-testid="Tweet-User-Avatar">'
    + '<img src="https://pbs.twimg.com/profile_images/2/nasa_avatar_normal.jpg">'
    + '</div>'
    + '<div><span>NASA</span><span>@NASA</span></div>'
    + '<a href="/NASA/status/2112604875452223824"><time datetime="2026-10-20T14:03:00.000Z">10月20日</time></a>'
    + '</div>'
    + '<div data-testid="tweetText">Artemis II 任务进展：火箭已转运至发射台。</div>'
    + '<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/GmediaAAA?format=jpg&name=medium" alt=""></div>'
    + '<div role="group">'
    + '<button data-testid="reply" aria-label="1,234 回复"></button>'
    + '<button data-testid="retweet" aria-label="12K 转帖"></button>'
    + '<button data-testid="like" aria-label="2.3万 喜欢"></button>'
    + '<a data-testid="analytics" href="/NASA/status/2112604875452223824/analytics" aria-label="9.2万 次查看"></a>'
    + '</div>'
    + '</article>'
}

/** 视频作品：<video> 的 poster 作封面，mp4 地址作视频媒体。 */
function xVideoArticle() {
  return '<article data-testid="tweet">'
    + '<a href="/NASA/status/2112600000000000001"><time datetime="2026-10-18T09:00:00.000Z"></time></a>'
    + '<div data-testid="tweetText">发射回放</div>'
    + '<video src="https://video.twimg.com/ext_tw_video/123/pu/vid/avc1/720x1280.mp4"'
    + ' poster="https://pbs.twimg.com/amplify_video_thumb/123/img/thumb.jpg"></video>'
    + '<button data-testid="reply" aria-label="34 回复"></button>'
    + '<button data-testid="like" aria-label="1.5K 喜欢"></button>'
    + '</article>'
}

describe('X 主页（profile header + article 列表）', () => {
  it('header 提供昵称/@handle/bio/粉丝（万）/关注/头像', () => {
    mountPage(xHeader() + xPhotoArticle() + xVideoArticle())
    const account = requireAccount(capture('https://x.com/NASA'))
    assert.equal(account.platform, 'x')
    assert.equal(account.extractor, 'x-profile')
    assert.equal(account.handle, 'NASA')
    assert.equal(account.nickname, 'NASA')
    assert.equal(account.bio, '探索宇宙的官方账号')
    assert.equal(account.avatar_url, 'https://pbs.twimg.com/profile_images/1/nasa_normal.jpg')
    assert.equal(account.followers, 92312000)
    assert.equal(account.following, 115)
    assert.equal(account.posts_count, null, 'X header 不渲染作品总数')
  })

  it('两条 article：status id / 时间 / 正文 / 互动数 / 图文 + 视频媒体', () => {
    mountPage(xHeader() + xPhotoArticle() + xVideoArticle())
    const account = requireAccount(capture('https://x.com/NASA'))

    const photo = account.posts.at(0)
    assert.ok(photo !== undefined)
    assert.equal(photo.platform_post_id, '2112604875452223824')
    assert.equal(photo.source_url, 'https://x.com/NASA/status/2112604875452223824')
    assert.equal(photo.title, 'Artemis II 任务进展：火箭已转运至发射台。')
    assert.equal(photo.content, 'Artemis II 任务进展：火箭已转运至发射台。')
    assert.equal(photo.posted_at, '2026-10-20T14:03:00.000Z')
    assert.deepEqual(photo.stats, { comments: 1234, shares: 12000, likes: 23000, views: 92000 })
    assert.deepEqual(photo.media, [
      { type: 'image', url: 'https://pbs.twimg.com/media/GmediaAAA?format=jpg&name=medium' },
    ], '作者头像不算作品媒体')

    const video = account.posts.at(1)
    assert.ok(video !== undefined)
    assert.equal(video.platform_post_id, '2112600000000000001')
    assert.equal(video.source_url, 'https://x.com/NASA/status/2112600000000000001')
    assert.equal(video.posted_at, '2026-10-18T09:00:00.000Z')
    assert.deepEqual(video.stats, { comments: 34, likes: 1500 })
    assert.deepEqual(video.media, [
      { type: 'image', url: 'https://pbs.twimg.com/amplify_video_thumb/123/img/thumb.jpg' },
      { type: 'video', url: 'https://video.twimg.com/ext_tw_video/123/pu/vid/avc1/720x1280.mp4' },
    ])
  })

  it('未登录登录墙（无 article）返回 page-incomplete', () => {
    mountPage('<main><h1>Sign in to X</h1><p>加入对话，关注你感兴趣的人。</p></main>')
    assert.equal(requireReason(capture('https://x.com/NASA')), 'page-incomplete')
  })

  it('有 header 但确实没有作品时返回 ok + posts=[]', () => {
    mountPage(xHeader())
    const account = requireAccount(capture('https://x.com/NASA'))
    assert.deepEqual(account.posts, [])
  })

  it('既无 header 也无登录墙时返回 empty', () => {
    mountPage('<div id="react-root"></div>')
    assert.equal(requireReason(capture('https://twitter.com/NASA')), 'empty')
  })
})

/* ------------------------------------------------------------------ 合并 */

/** 构造一条作品快照。 */
function accountPost(options) {
  return {
    platform_post_id: options.id,
    source_url: 'https://x.com/NASA/status/' + options.id,
    title: options.title ?? '',
    content: options.content ?? '',
    posted_at: options.posted_at ?? null,
    stats: options.stats ?? {},
    media: options.media ?? [],
  }
}

/** 构造一个账号快照。 */
function accountSnapshot(options) {
  return {
    platform: options.platform ?? 'x',
    handle: options.handle,
    nickname: options.nickname ?? '',
    avatar_url: options.avatar_url ?? '',
    bio: options.bio ?? '',
    followers: options.followers ?? null,
    following: options.following ?? null,
    posts_count: options.posts_count ?? null,
    posts: options.posts ?? [],
    captured_at: options.captured_at ?? '2026-10-20T00:00:00.000Z',
    extractor: options.extractor ?? 'x-profile',
  }
}

describe('mergeAccountSnapshots', () => {
  it('没有旧快照时规范化：按时间倒序并截断到 60 条', () => {
    const posts = Array.from({ length: 61 }, (_, index) => accountPost({
      id: '900' + String(index + 1),
      title: '作品 ' + String(index + 1),
      posted_at: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
      stats: { views: index + 1 },
    }))
    const merged = mergeAccountSnapshots(null, accountSnapshot({ handle: 'NASA', posts }))
    assert.equal(merged.posts.length, 60)
    const newest = merged.posts.at(0)
    assert.ok(newest !== undefined)
    assert.equal(newest.platform_post_id, '90061')
    assert.equal(newest.posted_at, '2026-03-02T00:00:00.000Z')
    const last = merged.posts.at(59)
    assert.ok(last !== undefined)
    assert.equal(last.platform_post_id, '9002')
  })

  it('同账号合并：按 id 去重、后者更新统计、profile 非空覆盖、无日期排最后', () => {
    const base = accountSnapshot({
      handle: 'NASA',
      nickname: 'Old',
      bio: '旧简介',
      followers: 100,
      following: 5,
      posts_count: 2,
      posts: [
        accountPost({ id: '1', posted_at: '2026-10-01T00:00:00.000Z', stats: { views: 100, likes: 10 } }),
        accountPost({ id: '2', posted_at: '2026-10-03T00:00:00.000Z', stats: { views: 300 } }),
      ],
    })
    const incoming = accountSnapshot({
      handle: 'nasa',
      nickname: 'New',
      avatar_url: 'https://pbs.twimg.com/profile_images/9/new.jpg',
      bio: '',
      followers: 120,
      following: null,
      posts_count: 3,
      captured_at: '2026-10-21T00:00:00.000Z',
      posts: [
        accountPost({ id: '2', posted_at: '2026-10-03T00:00:00.000Z', stats: { views: 350, likes: 35 } }),
        accountPost({ id: '3', posted_at: '2026-10-05T00:00:00.000Z', stats: { views: 500 } }),
        accountPost({ id: '4', posted_at: null, stats: {} }),
      ],
    })
    const merged = mergeAccountSnapshots(base, incoming)
    assert.equal(merged.handle, 'nasa')
    assert.equal(merged.nickname, 'New')
    assert.equal(merged.avatar_url, 'https://pbs.twimg.com/profile_images/9/new.jpg')
    assert.equal(merged.bio, '旧简介', '新值为空时保留旧简介')
    assert.equal(merged.followers, 120)
    assert.equal(merged.following, 5, '新值为 null 时保留旧关注数')
    assert.equal(merged.posts_count, 3)
    assert.equal(merged.captured_at, '2026-10-21T00:00:00.000Z')
    assert.deepEqual(merged.posts.map((post) => post.platform_post_id), ['3', '2', '1', '4'])
    const updated = merged.posts.at(1)
    assert.ok(updated !== undefined)
    assert.deepEqual(updated.stats, { views: 350, likes: 35 }, '后者更新统计且不清空未变化的键')

    // 输入不被修改。
    assert.equal(base.posts.length, 2)
    assert.equal(incoming.posts.length, 3)
    const baseSecond = base.posts.at(1)
    assert.ok(baseSecond !== undefined)
    assert.deepEqual(baseSecond.stats, { views: 300 })
  })

  it('不同 handle 或不同平台不合并，直接使用新快照', () => {
    const base = accountSnapshot({
      handle: 'NASA',
      posts: [accountPost({ id: '1', posted_at: '2026-10-01T00:00:00.000Z', stats: { views: 100 } })],
    })
    const otherHandle = accountSnapshot({
      handle: 'SpaceX',
      posts: [accountPost({ id: '9', posted_at: '2026-10-02T00:00:00.000Z', stats: { views: 900 } })],
    })
    const mergedHandle = mergeAccountSnapshots(base, otherHandle)
    assert.equal(mergedHandle.handle, 'SpaceX')
    assert.deepEqual(mergedHandle.posts.map((post) => post.platform_post_id), ['9'])

    const otherPlatform = accountSnapshot({
      platform: 'tiktok',
      handle: 'NASA',
      extractor: 'tiktok-profile',
      posts: [accountPost({ id: '7', posted_at: '2026-10-04T00:00:00.000Z', stats: {} })],
    })
    const mergedPlatform = mergeAccountSnapshots(base, otherPlatform)
    assert.equal(mergedPlatform.platform, 'tiktok')
    assert.equal(mergedPlatform.extractor, 'tiktok-profile')
    assert.deepEqual(mergedPlatform.posts.map((post) => post.platform_post_id), ['7'])
  })

  it('handle 大小写与 @ 前缀视为同一账号', () => {
    const base = accountSnapshot({
      handle: '@NASA',
      posts: [accountPost({ id: '1', posted_at: '2026-10-01T00:00:00.000Z', stats: { views: 100 } })],
    })
    const incoming = accountSnapshot({
      handle: 'nasa',
      posts: [accountPost({ id: '2', posted_at: '2026-10-02T00:00:00.000Z', stats: { views: 200 } })],
    })
    const merged = mergeAccountSnapshots(base, incoming)
    assert.deepEqual(merged.posts.map((post) => post.platform_post_id), ['2', '1'])
  })
})
