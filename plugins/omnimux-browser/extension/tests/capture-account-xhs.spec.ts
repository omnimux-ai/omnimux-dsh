// @vitest-environment jsdom
// @ts-nocheck
//
// 小红书主页采集契约（Issue #3839 / spec §4.4）：
// - 内联 state：`window.__INITIAL_STATE__.user` 的 userPageData + notes；
// - DOM 兜底：`section.note-item` 网格，permalink 用卡片原始 href（保住 xsec_token）；
// - 登录墙 / 半加载页面必须是 page-incomplete，绝不冒充空账号；
// - 非主页路径（/explore/<id>）是 not-profile-page。
//
// fixture 字段名来自 opencli 的 `clis/xiaohongshu/user-helpers.js` 与 browser-act 的
// xiaohongshu-user-profile skill（两者都在登录态真实页面上跑过）：basicInfo.nickname /
// imageb / desc，interactions[{type:'fans'|'follows'|'interaction', count:'23904'}]，
// notes 是 [tab[], …]，每项 { noteCard: {...}, xsecToken }。
//
// 断言使用 node:assert/strict；本文件只用 JS 语法（acorn 解析的测试门禁要求），
// 不做变量下标（用 .at()）、不用 spread。
import { beforeEach, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { captureAccount } from '../src/content/capture/index.ts'

const UID = '5bac4e3f7a4c7300016a6b88'
const PROFILE_URL = 'https://www.xiaohongshu.com/user/profile/' + UID

/** 挂载页面；script 只保留文本，jsdom 不执行。 */
function mountPage(body, head) {
  document.head.innerHTML = head ?? ''
  document.body.innerHTML = body ?? ''
  return document
}

/** 把一段 state 表达式挂成内联 script（与真实页面一致：`window.__INITIAL_STATE__ = {...}`）。 */
function mountState(stateLiteral) {
  mountPage('<script>window.__INITIAL_STATE__ = ' + stateLiteral + ';</script>')
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

/* ------------------------------------------------------------------ fixture */

/** 主页头部：昵称/头像/简介 + 三项互动数（fans/follows/interaction）。 */
const USER_PAGE_DATA = {
  basicInfo: {
    nickname: 'LaLaIrene',
    imageb: 'https://sns-avatar-qc.xhscdn.com/avatar/1.jpg',
    desc: '常驻上海的旅行博主',
    gender: 1,
  },
  interactions: [
    { type: 'follows', name: '关注', count: '361' },
    { type: 'fans', name: '粉丝', count: '2.3万' },
    { type: 'interaction', name: '获赞与收藏', count: '1086463' },
  ],
}

/** 一条图文笔记的 noteCard（字段取自 opencli 适配器实测形状）。 */
function noteCard(options) {
  return {
    noteId: options.id,
    type: options.type ?? 'normal',
    displayTitle: options.title,
    interactInfo: {
      likedCount: options.liked ?? '5149',
      collectedCount: options.collected ?? '4170',
      commentCount: options.comment ?? '390',
    },
    cover: { urlDefault: options.cover, urlPre: options.cover + '-pre' },
  }
}

/** 真实 store 的 notes 形态：`[tab[], tab[]]`，每项 `{ noteCard, xsecToken }`。 */
function userState(notes) {
  return {
    user: {
      userPageData: USER_PAGE_DATA,
      notes,
    },
  }
}

const NOTES = [
  [
    { noteCard: noteCard({ id: '6a1f0c2e0000000011019ab1', title: '第一站：武夷山', cover: 'https://sns-webpic-qc.xhscdn.com/1.jpg' }), xsecToken: 'TOKEN-A' },
    { noteCard: noteCard({ id: '6a1f0c2e0000000011019ab2', title: '第二站：平潭岛', cover: 'https://sns-webpic-qc.xhscdn.com/2.jpg' }), xsecToken: 'TOKEN-B' },
  ],
  [],
]

describe('小红书主页（内联 __INITIAL_STATE__）', () => {
  it('userPageData 提供昵称/头像/简介/粉丝；notes 展开成笔记', () => {
    mountState(JSON.stringify(userState(NOTES)))
    const account = requireAccount(capture(PROFILE_URL))
    assert.equal(account.platform, 'xiaohongshu')
    assert.equal(account.extractor, 'xiaohongshu-profile')
    assert.equal(account.handle, UID)
    assert.equal(account.nickname, 'LaLaIrene')
    assert.equal(account.avatar_url, 'https://sns-avatar-qc.xhscdn.com/avatar/1.jpg')
    assert.equal(account.bio, '常驻上海的旅行博主')
    assert.equal(account.followers, 23000)
    assert.equal(account.following, 361)
    // 主页头部不渲染笔记总数：拿不到就留 null，不编造。
    assert.equal(account.posts_count, null)
    assert.equal(account.posts.length, 2)
    assert.match(account.captured_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('每条笔记：noteId / 带 xsec_token 的 source_url / 封面 / 点赞收藏 / 时间', () => {
    mountState(JSON.stringify(userState(NOTES)))
    const account = requireAccount(capture(PROFILE_URL))
    const first = account.posts.at(0)
    assert.equal(first.platform_post_id, '6a1f0c2e0000000011019ab1')
    assert.equal(first.source_url, 'https://www.xiaohongshu.com/explore/6a1f0c2e0000000011019ab1?xsec_token=TOKEN-A&xsec_source=pc_user')
    assert.equal(first.title, '第一站：武夷山')
    assert.equal(first.posted_at, null, '卡片没带时间就不编时间')
    assert.deepEqual(first.stats, { likes: 5149, comments: 390, collects: 4170 })
    assert.deepEqual(first.media, [
      { type: 'image', url: 'https://sns-webpic-qc.xhscdn.com/1.jpg' },
    ])
  })

  it('无 xsec_token 时 source_url 用 /user/profile/<uid>/<noteId>', () => {
    mountState(JSON.stringify(userState([[
      { noteCard: noteCard({ id: '6a1f0c2e0000000011019ab3', title: '无 token 笔记', cover: 'https://sns-webpic-qc.xhscdn.com/3.jpg' }) },
    ]], [])))
    const account = requireAccount(capture(PROFILE_URL))
    const post = account.posts.at(0)
    assert.equal(post.source_url, 'https://www.xiaohongshu.com/user/profile/' + UID + '/6a1f0c2e0000000011019ab3')
  })

  it('视频笔记：type=video 且拿到地址时追加 video 媒体', () => {
    mountState(JSON.stringify(userState([[
      {
        noteCard: {
          noteId: '6a1f0c2e0000000011019ab4',
          type: 'video',
          displayTitle: '海岛 vlog',
          interactInfo: { likedCount: '120', collectedCount: '8' },
          cover: { urlDefault: 'https://sns-webpic-qc.xhscdn.com/4.jpg' },
          video: { media: { stream: { h264: [{ masterUrl: 'https://sns-video-bd.xhscdn.com/4.mp4' }] } } },
        },
        xsecToken: 'TOKEN-V',
      },
    ]], [])))
    const account = requireAccount(capture(PROFILE_URL))
    const post = account.posts.at(0)
    assert.equal(post.platform_post_id, '6a1f0c2e0000000011019ab4')
    assert.deepEqual(post.media, [
      { type: 'image', url: 'https://sns-webpic-qc.xhscdn.com/4.jpg' },
      { type: 'video', url: 'https://sns-video-bd.xhscdn.com/4.mp4' },
    ])
  })

  it('Pinia ref 形态（{_value}）与 undefined 字面量都能读', () => {
    mountState('{"user":{"userPageData":{"_value":'
      + JSON.stringify(USER_PAGE_DATA)
      + '},"notes":{"_value":'
      + JSON.stringify(NOTES)
      + '}},"search":undefined}')
    const account = requireAccount(capture(PROFILE_URL))
    assert.equal(account.nickname, 'LaLaIrene')
    assert.equal(account.followers, 23000)
    assert.equal(account.posts.length, 2)
  })

  it('脱敏计数（带 + 尾缀）不当成精确数字', () => {
    mountState(JSON.stringify({
      user: {
        userPageData: {
          basicInfo: { nickname: '被风控的号', desc: '' },
          interactions: [
            { type: 'follows', count: '10+' },
            { type: 'fans', count: '1万+' },
          ],
        },
        notes: NOTES,
      },
    }))
    const account = requireAccount(capture(PROFILE_URL))
    assert.equal(account.followers, null)
    assert.equal(account.following, null)
  })

  it('带时间的笔记按最新在前排序，无时间的排最后', () => {
    mountState(JSON.stringify({
      user: {
        userPageData: USER_PAGE_DATA,
        notes: [[
          { noteCard: { noteId: '6a1f0c2e0000000011019af1', displayTitle: '旧笔记', time: 1700000000000 }, xsecToken: 'T1' },
          { noteCard: { noteId: '6a1f0c2e0000000011019af2', displayTitle: '新笔记', time: 1760000000000 }, xsecToken: 'T2' },
          { noteCard: { noteId: '6a1f0c2e0000000011019af3', displayTitle: '无时间笔记' }, xsecToken: 'T3' },
        ], []],
      },
    }))
    const account = requireAccount(capture(PROFILE_URL))
    assert.deepEqual(
      account.posts.map((post) => post.platform_post_id),
      ['6a1f0c2e0000000011019af2', '6a1f0c2e0000000011019af1', '6a1f0c2e0000000011019af3'],
    )
    assert.equal(account.posts.at(0).posted_at, new Date(1760000000000).toISOString())
    assert.equal(account.posts.at(1).posted_at, new Date(1700000000000).toISOString())
    assert.equal(account.posts.at(2).posted_at, null)
  })

  it('notes 是数字键对象映射的页面形态也能展开', () => {
    // browser-act 的 skill 把 notes[0] 当成「数字键 → 卡片」的映射读取；
    // 两种形态都要能取到笔记，否则一次页面改版就退回 DOM。
    mountState(JSON.stringify({
      user: {
        userPageData: USER_PAGE_DATA,
        notes: [
          {
            0: { noteCard: noteCard({ id: '6a1f0c2e0000000011019ab7', title: '映射形态笔记', cover: 'https://sns-webpic-qc.xhscdn.com/7.jpg' }), xsecToken: 'TOKEN-M' },
          },
        ],
      },
    }))
    const account = requireAccount(capture(PROFILE_URL))
    assert.equal(account.posts.length, 1)
    const post = account.posts.at(0)
    assert.equal(post.platform_post_id, '6a1f0c2e0000000011019ab7')
    assert.equal(post.title, '映射形态笔记')
    assert.equal(post.source_url, 'https://www.xiaohongshu.com/explore/6a1f0c2e0000000011019ab7?xsec_token=TOKEN-M&xsec_source=pc_user')
  })
})

/* ------------------------------------------------------------------ DOM 兜底 */

/** 无 state 时的卡片网格：卡片里有原始 /explore/ href（含 token）与封面、标题、点赞。 */
function domCard(options) {
  return '<section class="note-item">'
    + '<a href="' + options.href + '"><img src="' + options.cover + '" alt="' + (options.alt ?? '') + '"></a>'
    + '<div class="footer"><a class="title"><span>' + options.title + '</span></a>'
    + '<span class="like-wrapper"><span class="count">' + options.likes + '</span></span></div>'
    + '</section>'
}

const DOM_GRID = domCard({
  href: '/explore/6a1f0c2e0000000011019ac1?xsec_token=DOM-TOKEN&xsec_source=pc_user',
  cover: 'https://sns-webpic-qc.xhscdn.com/dom-1.jpg',
  title: 'DOM 兜底笔记一',
  likes: '1.2万',
})
  + domCard({
    href: '/explore/6a1f0c2e0000000011019ac2?xsec_token=DOM-TOKEN-2&xsec_source=pc_user',
    cover: 'https://sns-webpic-qc.xhscdn.com/dom-2.jpg',
    title: 'DOM 兜底笔记二',
    likes: '88',
  })

describe('小红书主页（DOM 兜底）', () => {
  it('无 state 时读 section.note-item 网格，permalink 用卡片原始 href', () => {
    mountPage(DOM_GRID)
    const account = requireAccount(capture(PROFILE_URL))
    assert.equal(account.platform, 'xiaohongshu')
    assert.equal(account.handle, UID)
    assert.equal(account.posts.length, 2)
    const first = account.posts.at(0)
    assert.equal(first.platform_post_id, '6a1f0c2e0000000011019ac1')
    assert.equal(
      first.source_url,
      'https://www.xiaohongshu.com/explore/6a1f0c2e0000000011019ac1?xsec_token=DOM-TOKEN&xsec_source=pc_user',
      '原始 href 的 xsec_token 必须保留',
    )
    assert.equal(first.title, 'DOM 兜底笔记一')
    assert.deepEqual(first.stats, { likes: 12000 })
    assert.deepEqual(first.media, [
      { type: 'image', url: 'https://sns-webpic-qc.xhscdn.com/dom-1.jpg' },
    ])
    const second = account.posts.at(1)
    assert.equal(second.platform_post_id, '6a1f0c2e0000000011019ac2')
    assert.deepEqual(second.stats, { likes: 88 })
  })

  it('无 state 时资料字段从 DOM 头部读，计数留空不编造', () => {
    mountPage('<div class="user-info">'
      + '<span class="user-name">DOM 昵称</span>'
      + '<p class="user-desc">DOM 简介</p>'
      + '<img src="https://sns-avatar-qc.xhscdn.com/avatar/dom.jpg">'
      + '</div>'
      + DOM_GRID)
    const account = requireAccount(capture(PROFILE_URL))
    assert.equal(account.nickname, 'DOM 昵称')
    assert.equal(account.bio, 'DOM 简介')
    assert.equal(account.avatar_url, 'https://sns-avatar-qc.xhscdn.com/avatar/dom.jpg')
    assert.equal(account.followers, null)
    assert.equal(account.posts_count, null)
    assert.equal(account.posts.length, 2)
  })

  it('无 state 时从渲染标签读关注/粉丝/笔记数，脱敏值仍留空', () => {
    mountPage('<div class="user-info"><span class="user-name">DOM 昵称</span>'
      + '<p class="user-desc">DOM 简介</p></div>'
      + '<div class="user-interactions"><span><b>361</b> 关注</span><span><b>2.3万</b> 粉丝</span>'
      + '<span><b>1086463</b> 获赞与收藏</span></div>'
      + '<div class="reds-tab-item">笔记・12</div>'
      + DOM_GRID)
    const account = requireAccount(capture(PROFILE_URL))
    assert.equal(account.following, 361)
    assert.equal(account.followers, 23000)
    assert.equal(account.posts_count, 12)
    assert.equal(account.posts.length, 2)
  })

  it('卡片里的作者头像不会被当成封面', () => {
    mountPage('<section class="note-item">'
      + '<a class="cover" href="/explore/6a1f0c2e0000000011019ae1"><img src="https://sns-webpic-qc.xhscdn.com/real-cover.jpg"></a>'
      + '<a class="author" href="/user/profile/' + UID + '"><img src="https://sns-avatar-qc.xhscdn.com/avatar/me.jpg"></a>'
      + '<div class="footer"><a class="title"><span>有作者头像的卡片</span></a>'
      + '<span class="like-wrapper"><span class="count">7</span></span></div>'
      + '</section>')
    const account = requireAccount(capture(PROFILE_URL))
    const post = account.posts.at(0)
    assert.equal(post.platform_post_id, '6a1f0c2e0000000011019ae1')
    assert.deepEqual(post.media, [
      { type: 'image', url: 'https://sns-webpic-qc.xhscdn.com/real-cover.jpg' },
    ])
  })

  it('卡片同时有裸 /explore 链接与带 token 的可见链接时，取带 token 的那条', () => {
    // 实测卡片：一条隐藏的裸 /explore/<id>，加一条可见的
    // /user/profile/<author>/<id>?xsec_token=…；后者才是能打开笔记的地址。
    mountPage('<section class="note-item">'
      + '<a class="cover" href="/explore/6a1f0c2e0000000011019ad1"><img src="https://sns-webpic-qc.xhscdn.com/tok.jpg"></a>'
      + '<a class="title" href="/user/profile/' + UID + '/6a1f0c2e0000000011019ad1?xsec_token=REAL-TOKEN&xsec_source=pc_user"><span>带 token 的笔记</span></a>'
      + '</section>')
    const account = requireAccount(capture(PROFILE_URL))
    const post = account.posts.at(0)
    assert.equal(post.platform_post_id, '6a1f0c2e0000000011019ad1')
    assert.equal(
      post.source_url,
      'https://www.xiaohongshu.com/user/profile/' + UID + '/6a1f0c2e0000000011019ad1?xsec_token=REAL-TOKEN&xsec_source=pc_user',
    )
    assert.equal(post.title, '带 token 的笔记')
  })
})

/* ------------------------------------------------------------------ 失败原因 */

describe('小红书失败原因', () => {
  it('登录墙路径 /login 返回 page-incomplete', () => {
    mountPage('<div class="login-container"><h1>登录后查看</h1></div>')
    assert.equal(requireReason(capture('https://www.xiaohongshu.com/login?redirectPath=%2Fuser%2Fprofile%2F' + UID)), 'page-incomplete')
  })

  it('空页面（无 state、无卡片）返回 page-incomplete，不是空账号', () => {
    mountPage('<div id="app"></div>')
    assert.equal(requireReason(capture(PROFILE_URL)), 'page-incomplete')
  })

  it('只有 state.user 但没有 notes 的半加载页面返回 page-incomplete', () => {
    mountState(JSON.stringify({ user: { userPageData: USER_PAGE_DATA } }))
    assert.equal(requireReason(capture(PROFILE_URL)), 'page-incomplete')
  })

  it('笔记页 /explore/<id> 与非主页路径返回 not-profile-page', () => {
    mountState(JSON.stringify(userState(NOTES)))
    assert.equal(requireReason(capture('https://www.xiaohongshu.com/explore/6a1f0c2e0000000011019ab1')), 'not-profile-page')
    assert.equal(requireReason(capture('https://www.xiaohongshu.com/')), 'not-profile-page')
    assert.equal(requireReason(capture('https://www.xiaohongshu.com/user/profile/not-a-uid')), 'not-profile-page')
    assert.equal(requireReason(capture('https://www.xiaohongshu.com/user/profile/' + UID + '/6a1f0c2e0000000011019ab1')), 'not-profile-page')
  })

  it('其它平台主页不受影响，未知 host 仍是 not-profile-page', () => {
    mountState(JSON.stringify(userState(NOTES)))
    assert.equal(requireReason(capture('https://example.com/user/profile/' + UID)), 'not-profile-page')
  })
})
