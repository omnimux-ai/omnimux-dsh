import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { DOM_RENDER_LOADERS } from './test-fixtures/dom-render-build.mjs'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { zh } from './locales.js'

/**
 * End-to-end gate for the 账号监控 page wiring after #3432.
 *
 * The monitor used to be a toolbar popover plus a flat masonry of 9:16 work
 * cards. It is now a two-column page: a persistent account column on the left
 * and a native-looking, single-column timeline on the right. The card shapes
 * and the waterfall geometry still exist for the library tab and are pinned by
 * their own unit suites (`rival-post-card.test.js` / `rival-masonry.test.js`);
 * this file only asserts the page contract:
 *
 *   - the real `InspirationStage`, driven through the tab bar, renders the
 *     Host's rows as timeline items — never as masonry cards;
 *   - rows are ordered newest first, and each row carries the platform-like
 *     anatomy plus every monitor action (original / replicate / deconstruct /
 *     mark done);
 *   - the bottom sentinel appends the next page without reordering the rows
 *     already on screen;
 *   - checking an account in the persistent column narrows the timeline through
 *     the same `accounts` query parameter.
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'rival-cards')

const RIVAL_PREFIX = '/omnimux/inspiration/local/rival-accounts'

/** Requests one mount may make before the gate calls it a loop. */
const REQUEST_BUDGET = 120

let bundleCounter = 0

/**
 * Bundle an entry with the UI-kit shim in place of `dsh-ui-kit`.
 * @param {string} entry absolute path of the entry module
 * @param {string} tag cache-file prefix
 * @returns {Promise<string>} absolute path of the bundled ESM file
 */
async function bundle(entry, tag) {
  mkdirSync(cacheDir, { recursive: true })
  const outFile = join(cacheDir, `${tag}-${bundleCounter}.mjs`)
  bundleCounter += 1
  const result = await esbuild.build({
    loader: DOM_RENDER_LOADERS,
    absWorkingDir: join(here, '..', '..'),
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    plugins: [{
      name: 'ui-kit-shim',
      setup(build) {
        build.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: shimEntry }))
      },
    }],
  })
  const code = result.outputFiles?.[0]?.text
  if (!code) throw new Error(`esbuild produced no bundle for ${entry}`)
  writeFileSync(outFile, code)
  return outFile
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

/**
 * Install a jsdom window and the globals React needs, and return a teardown.
 * @returns {{ dom: JSDOM, container: HTMLElement, restore: () => void }}
 */
function installDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
  })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
    IntersectionObserver: globalThis.IntersectionObserver,
    actEnvironment: globalThis.IS_REACT_ACT_ENVIRONMENT,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // The deferred page-load path waits for the host auth bridge; without it only
  // the first effect runs and the second load is never attempted.
  dom.window.__omnimuxAuth = { ensureLogin() {} }
  const restore = () => {
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.fetch = previous.fetch
    globalThis.IntersectionObserver = previous.IntersectionObserver
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment
  }
  return { dom, container: dom.window.document.getElementById('host'), restore }
}

/**
 * Let effects and microtasks settle until `predicate` holds.
 * @param {HTMLElement} container
 * @param {() => boolean} predicate
 */
async function settle(container, predicate) {
  for (let i = 0; i < 40; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
    if (predicate(container)) return
  }
  throw new Error('settle: the condition never became true')
}

/** Account per card. */
const ACCOUNTS = {
  meow: { id: 'ra_1', nickname: '喵星日常', handle: '@meow_daily', platform: 'tiktok' },
  pet: { id: 'ra_2', nickname: '宠物品鉴所', handle: '@pet_review', platform: 'youtube' },
  home: { id: 'ra_3', nickname: '家居灵感库', handle: '@home_inspo', platform: 'instagram' },
  higgs: { id: 'ra_4', nickname: 'Higgsfield AI', handle: '@higgsfield_ai', platform: 'x' },
  runway: { id: 'ra_5', nickname: 'Runway', handle: '@runwayml', platform: 'x' },
  fur: { id: 'ra_6', nickname: '毛孩子食堂', handle: '@fur_kitchen', platform: 'tiktok' },
  ootd: { id: 'ra_7', nickname: '穿搭研究所', handle: '@ootd_lab', platform: 'instagram' },
}

/**
 * The Host payload, newest first. `posted_at` is assigned from the index so the
 * fixture's order *is* the publish order: an implementation that renders the
 * Host's array verbatim and one that re-sorts by time agree on this fixture,
 * which is what the page promises either way.
 */
const POSTS = [
  { id: 'p1', account: ACCOUNTS.meow, platform: 'tiktok', type: 'video', duration: 31, cover: '/m/c1.jpg', title: '猫咪饮水机实测：三只猫一周后还喝吗', done: false },
  { id: 'p2', account: ACCOUNTS.pet, platform: 'youtube', type: 'video', duration: 128, cover: '/m/c2.jpg', title: '2026 十款智能喂食器横评', done: true },
  { id: 'p3', account: ACCOUNTS.home, platform: 'instagram', type: 'image', cover: '/m/c3.jpg', title: '小户型猫爬架一体收纳方案', done: false },
  { id: 'p11', account: ACCOUNTS.higgs, platform: 'x', type: 'text', cover: null, title: '做了三个月 AI 视效，最大的体会是：镜头语言比模型更重要。同一段提示词，加上「低机位缓推」和「焦点从前景移到人物」，成片质感直接上一个台阶。', done: false },
  { id: 'p4', account: ACCOUNTS.higgs, platform: 'x', type: 'video', duration: 88, cover: '/m/c4.jpg', title: '电影级推拉镜头拆解：同一个人物，三种运镜节奏，情绪完全不同。', done: false },
  { id: 'p5', account: ACCOUNTS.fur, platform: 'tiktok', type: 'video', duration: 42, cover: '/m/c5.jpg', title: '生骨肉配比入门：一周备餐流程', done: false },
  { id: 'p6', account: ACCOUNTS.runway, platform: 'x', type: 'video', duration: 64, cover: '/m/c6.jpg', title: 'Gen-3 运动笔刷实战：沙、烟、水花三种粒子。', done: false },
  { id: 'p7', account: ACCOUNTS.ootd, platform: 'instagram', type: 'image', cover: '/m/c7.jpg', title: '通勤胶囊衣橱：7 件单品 21 套', done: true },
  { id: 'p8', account: ACCOUNTS.meow, platform: 'tiktok', type: 'video', duration: 12, cover: '/m/c8.jpg', title: '半夜跑酷实录：监控视角全程', done: false },
  { id: 'p9', account: ACCOUNTS.pet, platform: 'youtube', type: 'video', duration: 355, cover: '/m/c9.jpg', title: '猫砂盆除臭终极方案对比', done: false },
]

/**
 * The shape the Host serves for one row.
 * @param {Record<string, any>} post
 * @param {number} index
 */
function hostRow(post, index) {
  const account = post.account
  const base = Date.parse('2026-10-05T08:12:00.000Z')
  const numericId = `7698442056158465${String(index).padStart(3, '0')}`
  const url = post.platform === 'tiktok' ? `https://www.tiktok.com/${account.handle}/video/${numericId}`
    : post.platform === 'x' ? `https://x.com/${account.handle}/status/${numericId}`
      : post.platform === 'youtube' ? `https://www.youtube.com/shorts/yt${index}`
        : `https://www.instagram.com/p/ig${index}/`
  return {
    id: post.id,
    row_id: `${account.id}:${post.id}`,
    account_id: account.id,
    title: post.title,
    text: post.title,
    type: post.type,
    url,
    posted_at: new Date(base - index * 3_600_000).toISOString(),
    duration: typeof post.duration === 'number' ? post.duration : null,
    stats: { views: 128000, likes: 8640, comments: 214, shares: 96 },
    interacted_at: post.done ? '2026-10-05T09:12:00.000Z' : null,
    in_library: post.done === true,
    cover_src: post.id === 'p1' ? 'https://cdn.example/tiktok-cover.heic' : post.cover,
    video_src: post.id === 'p1' ? 'https://cdn.example/tiktok-video.mp4' : '',
    source_platform: post.platform,
    account: { id: account.id, nickname: account.nickname, handle: account.handle, platform: account.platform },
  }
}

/** @returns {Array<Record<string, any>>} the payload, newest first */
function hostPayload() {
  return POSTS.map(hostRow)
}

/** The timeline's `data-card-id` for a fixture post. */
const cardId = (post) => `${post.account.id}:${post.id}`

/**
 * Mount the real stage and drive it to 账号监控.
 *
 * `requestedPages` is module state because the mount keeps the same signature
 * (and therefore the same import site) the pre-#3432 gate had; the append test
 * sets it immediately before mounting.
 */
let requestedPages = null

/** DELETE receipt of the 更多 menu; set right before a mount, like `requestedPages`. */
let removeStatus = 200

async function mountStageOnAccounts() {
  const mod = await import(`${await bundle(join(here, 'InspirationStage.jsx'), 'stage')}?mount=${bundleCounter}`)
  const { dom, container, restore } = installDom()
  const accounts = Object.values(ACCOUNTS).map((account) => ({
    id: account.id,
    handle: account.handle,
    platform: account.platform,
    refresh_state: 'idle',
  }))
  const pages = requestedPages ?? [hostPayload()]
  requestedPages = null
  const deleteStatus = removeStatus
  removeStatus = 200
  const postsRequests = []
  const requests = []
  const deferredAppends = []
  const observers = []
  globalThis.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback
      this.disconnected = false
      observers.push(this)
    }
    observe() {}
    unobserve() {}
    disconnect() { this.disconnected = true }
  }
  let calls = 0
  globalThis.fetch = async (url, fetchOptions = {}) => {
    const path = String(url)
    const method = fetchOptions?.method ?? 'GET'
    calls += 1
    requests.push({ path, method })
    if (calls > REQUEST_BUDGET) throw new Error(`request storm: ${calls} calls, last ${path}`)
    // 「更多」菜单的删除：DELETE 之后账号从 Host 副本里消失，重读就看不到它。
    if (path.includes(RIVAL_PREFIX) && method === 'DELETE') {
      if (deleteStatus >= 400) return jsonResponse(deleteStatus, { success: false, error: 'remove-failed' })
      const id = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1))
      const index = accounts.findIndex((account) => account.id === id)
      assert.equal(index >= 0, true, `the DELETE must name a monitored account (got ${id})`)
      accounts.splice(index, 1)
      return jsonResponse(200, { success: true, data: { id } })
    }
    if (path.includes(`${RIVAL_PREFIX}/status`)) {
      return jsonResponse(200, { success: true, data: { paused: { global: false, reason: null } } })
    }
    if (path.includes(`${RIVAL_PREFIX}/posts`)) {
      const query = new URL(path, 'http://localhost').searchParams
      const requested = (query.get('accounts') || '').split(',').filter(Boolean)
      const page = Number(query.get('page') || 1)
      postsRequests.push(query.toString())
      const all = pages.flat().filter((row) => row && row.account)
      const entry = pages.at(page - 1)
      const visible = (requested.length > 0
        ? all.filter((row) => requested.includes(row.account.id))
        : (entry && Array.isArray(entry.rows) ? entry.rows : (entry ?? [])))
        .filter((row) => accounts.some((account) => account.id === row.account.id))
      if (entry && entry.fail) {
        return jsonResponse(500, { success: false, error: 'feed-page-failed' })
      }
      if (entry && entry.deferred) {
        await new Promise((resolve) => { deferredAppends.push(resolve) })
      }
      return jsonResponse(200, {
        success: true,
        data: {
          items: visible,
          total: requested.length > 0 ? visible.length : all.length,
          page,
          page_size: 20,
          has_more: requested.length === 0 && page < pages.length,
        },
      })
    }
    if (path.includes(RIVAL_PREFIX)) {
      return jsonResponse(200, { success: true, data: { items: accounts, total: accounts.length } })
    }
    return jsonResponse(200, {
      success: true,
      data: { items: [], total: 0, platforms: [{ name: 'tiktok', count: 1 }] },
    })
  }
  const root = createRoot(container)
  const Stage = mod.InspirationStage ?? mod.default
  await act(async () => { root.render(React.createElement(Stage, { t: (key) => zh[key] || key })) })
  await settle(container, (node) => Boolean(node.querySelector('[data-tab="rivals"]')))
  const tab = container.querySelector('[data-tab="rivals"]')
  await act(async () => { tab.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  await settle(container, (node) => Boolean(node.querySelector('[data-rival-timeline="true"]')))
  return {
    container,
    postsRequests,
    requests,
    /** Release the oldest deferred page-2 answer, newest last. */
    releaseAppend() {
      const release = deferredAppends.shift()
      assert.ok(release, 'a deferred append must be in flight')
      release()
    },
    /** Cross the timeline's bottom sentinel the way a scroll would. */
    async loadMore() {
      const observer = observers.slice().reverse().find((entry) => !entry.disconnected)
      assert.ok(observer, 'the timeline must keep an append sentinel while more pages exist')
      await act(async () => { observer.callback([{ isIntersecting: true }]) })
    },
    unmount: async () => { await act(async () => root.unmount()); restore() },
  }
}

/** @returns {HTMLElement[]} the timeline rows, in DOM order */
const itemsOf = (container) => Array.from(container.querySelectorAll('.omnimux-rival-timeline-item'))

/** @returns {string[]} the timeline row ids, in DOM order */
const itemIds = (container) => itemsOf(container).map((node) => node.getAttribute('data-card-id'))

const rowOf = (container, post) => itemsOf(container).find((node) => node.getAttribute('data-card-id') === cardId(post))

const actionsOf = (row) => Array.from(row.querySelectorAll('[data-act]'))
  .map((node) => node.getAttribute('data-act'))

after(() => {
  rmSync(cacheDir, { recursive: true, force: true })
})

describe('账号监控 — timeline page wiring (#3432)', () => {
  /** @type {Array<{ unmount: () => Promise<void> }>} */
  const open = []

  after(async () => {
    while (open.length) {
      // eslint-disable-next-line no-await-in-loop
      await open.pop().unmount()
    }
  })

  it('renders the Host rows as a single-column timeline, never as masonry cards', async () => {
    const mounted = await mountStageOnAccounts()
    open.push(mounted)
    assert.deepEqual(itemIds(mounted.container), POSTS.map(cardId), 'every Host row must reach the timeline in publish order')
    assert.equal(mounted.container.querySelector('.omnimux-rival-masonry'), null, 'the retired masonry must not render on the account monitor')
    assert.equal(mounted.container.querySelector('.omnimux-rival-card'), null, 'the retired work card must not render on the account monitor')
    const timeline = mounted.container.querySelector('[data-rival-timeline="true"]')
    assert.equal(timeline.getAttribute('role'), 'feed', 'the timeline must present itself as a feed')
    assert.equal(timeline.getAttribute('aria-busy'), 'false')
    // One row per post: the DOM order is the reading order.
    assert.equal(itemsOf(mounted.container).length, POSTS.length)
    assert.equal(rowOf(mounted.container, POSTS[0]).getAttribute('data-platform'), 'tiktok')
  })

  it('presents the compact account column without health text or work counts', async () => {
    const mounted = await mountStageOnAccounts()
    open.push(mounted)
    const column = mounted.container.querySelector('.omnimux-rival-accounts')
    assert.ok(column, 'the page must render the persistent account column')
    const rows = [...column.querySelectorAll('.omnimux-rival-filter-row')]
    assert.equal(rows.length, Object.keys(ACCOUNTS).length, 'every monitored account must have a row')
    assert.equal(column.querySelectorAll('.omnimux-rival-filter-platform svg').length, rows.length, 'every row must show the platform glyph')
    assert.equal(column.querySelectorAll('.omnimux-rival-accounts-summary').length, 0, 'the all-selected header must not repeat the account count')
    assert.equal(column.textContent.includes('选择要查看的账号'), false, 'the header must not carry the retired hint line')
    const all = column.querySelector('.omnimux-rival-accounts-all')
    assert.equal(all?.classList.contains('is-selected'), true, '全部 must be the default target')
    assert.equal(all?.getAttribute('aria-current'), 'page', '全部 must be the current page')
    assert.equal(column.querySelector('input[type="checkbox"]'), null, 'the multi-select checkboxes must be gone')
    const groupTitles = Array.from(column.querySelectorAll('.omnimux-rival-account-group-title'))
      .map((node) => node.textContent.trim())
      .sort()
    assert.deepEqual(
      groupTitles,
      [zh['platform.tiktok'], zh['platform.youtube'], zh['platform.instagram'], 'X'].sort(),
      'every platform must get its own titled group',
    )
    for (const row of rows) {
      assert.equal(row.querySelector('.omnimux-rival-filter-select').getAttribute('role'), 'button', 'the row main area is a single-select target, not a checkbox')
      assert.equal(row.getAttribute('data-selected'), 'false', 'no row starts selected while 全部 is current')
      assert.equal(row.textContent.includes('个作品'), false, 'the row must not show a work count')
      assert.equal(row.textContent.includes('正常'), false, 'the row must not spell out its health status')
      assert.equal(row.querySelector('.omnimux-rival-filter-warning'), null, 'a healthy fixture row carries no warning icon')
    }
  })

  it('renders a silent first-frame preview for a HEIC TikTok cover (#3469)', async () => {
    const mounted = await mountStageOnAccounts()
    open.push(mounted)
    const row = rowOf(mounted.container, POSTS[0])
    assert.ok(row, 'the newest TikTok post must render a row')
    const video = row.querySelector('.omnimux-rival-timeline-video')
    assert.ok(video, 'a HEIC TikTok video must render an inline <video> preview')
    assert.match(video.getAttribute('src'), /tiktok-video\.mp4#t=0\.1$/, 'the preview must seek its first frame')
    assert.equal(video.muted, true, 'the timeline preview must stay silent')
    assert.equal(video.getAttribute('preload'), 'metadata', 'the preview must only preload metadata')
    assert.equal(row.querySelector('.omnimux-rival-timeline-media img'), null, 'the undecodable HEIC <img> must be gone')
  })

  it('opens the official embedded player from a timeline row (#3462)', async () => {
    const mounted = await mountStageOnAccounts()
    open.push(mounted)
    const row = rowOf(mounted.container, POSTS[0])
    assert.ok(row, 'the newest post must render a row')
    assert.equal(mounted.container.querySelector('.omnimux-rival-detail-player-frame'), null, 'no player may load before the detail opens')
    const play = row.querySelector('.omnimux-rival-timeline-play')
    assert.ok(play, 'a video row must expose the play action')
    await act(async () => {
      play.dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    await settle(mounted.container, () => Boolean(mounted.container.querySelector('.omnimux-rival-detail-player-frame')))
    const frame = mounted.container.querySelector('.omnimux-rival-detail-player-frame')
    assert.match(frame.getAttribute('src'), /^https:\/\/www\.tiktok\.com\/player\/v1\/7698442056158465\d{3}$/, 'a TikTok row must open the TikTok embed')
    assert.match(frame.getAttribute('allow'), /encrypted-media/, 'the player must allow encrypted media')
    assert.equal(frame.hasAttribute('allowfullscreen'), true, 'the player must allow fullscreen')
    assert.equal(frame.getAttribute('loading'), 'lazy', 'the player must load lazily')
    assert.equal(frame.getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin', 'the player must trim the referrer')
    assert.match(frame.getAttribute('title'), /Judy's Family Cafe|喵星日常/, 'the player title must name the author')
    assert.match(mounted.container.querySelector('.omnimux-rival-detail-cover').getAttribute('style') || '', /aspect-ratio/, 'the player box must carry the post ratio')
    assert.equal(mounted.container.querySelector('.omnimux-rival-detail-cover img'), null, 'the embed replaces the static cover')
  })

  it('opens a card-style X embed even when the post has no ratio (#3462)', async () => {
    const mounted = await mountStageOnAccounts()
    open.push(mounted)
    const xPost = POSTS.find((post) => post.platform === 'x' && post.type === 'video')
    const row = rowOf(mounted.container, xPost)
    await act(async () => {
      row.dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    await settle(mounted.container, () => Boolean(mounted.container.querySelector('.omnimux-rival-detail-player-frame')))
    const frame = mounted.container.querySelector('.omnimux-rival-detail-player-frame')
    assert.match(frame.getAttribute('src'), /^https:\/\/platform\.twitter\.com\/embed\/Tweet\.html\?id=\d+$/, 'an X row must use the tweet embed')
    const box = mounted.container.querySelector('.omnimux-rival-detail-cover')
    assert.ok(box.classList.contains('is-card'), 'X embeds are full cards, not media-ratio players')
    assert.equal(box.getAttribute('style'), null, 'the X card height comes from the shared modal cap')
    assert.match(frame.getAttribute('title'), /推特 \(X\)/, 'the X player title must be localized')
  })

  it('renders each row with the native anatomy and every monitor action', async () => {
    const mounted = await mountStageOnAccounts()
    open.push(mounted)
    const post = POSTS[0]
    const row = rowOf(mounted.container, post)
    assert.ok(row, 'the newest post must render a row')
    const account = post.account

    assert.ok(row.classList.contains('omnimux-rival-timeline-item'))
    assert.ok(row.querySelector('.omnimux-rival-timeline-avatar'), 'the row must carry the author avatar (or its initial fallback)')
    assert.equal(row.querySelector('.omnimux-rival-timeline-author')?.textContent, account.nickname)
    assert.ok(row.querySelector('.omnimux-rival-timeline-platform svg'), 'the row must draw the platform mark')
    assert.equal(row.querySelector('.omnimux-rival-timeline-handle')?.textContent, account.handle)
    assert.match(row.querySelector('.omnimux-rival-timeline-time')?.textContent || '', /前|ago/, 'the row must carry a relative publish time')
    assert.equal(row.querySelector('.omnimux-rival-timeline-body')?.textContent, post.title, 'the row must show the post body')
    assert.ok(row.querySelector('.omnimux-rival-timeline-media'), 'a media post must reserve its media block')
    assert.ok(row.querySelector('.omnimux-rival-timeline-play'), 'a video post must carry the play badge')
    const metrics = row.querySelector('.omnimux-rival-timeline-metrics')?.textContent || ''
    for (const label of [zh['rivalAccounts.post.views'], zh['rivalAccounts.post.likes'], zh['rivalAccounts.post.comments'], zh['rivalAccounts.post.shares']]) {
      assert.ok(metrics.includes(label), `the metrics line must name「${label}」(got ${JSON.stringify(metrics)})`)
    }
    assert.deepEqual(actionsOf(row), ['original', 'replicate', 'deconstruct', 'markDone'], 'the hover row must carry the four monitor actions')

    // A text-only post has no media block, and a done row renders as processed.
    const textRow = rowOf(mounted.container, POSTS[3])
    assert.equal(textRow.querySelector('.omnimux-rival-timeline-media'), null, 'a text post has no media block')
    const doneRow = rowOf(mounted.container, POSTS[1])
    assert.ok(doneRow.classList.contains('is-done'), 'an interacted row must render as processed')
    assert.equal(actionsOf(doneRow).includes('markDone'), false, 'a processed row offers no second mark-done action')
  })

  it('appends the next page at the bottom without reordering the rows already shown', async () => {
    const payload = hostPayload()
    requestedPages = [payload.slice(0, 6), payload.slice(6)]
    const mounted = await mountStageOnAccounts()
    open.push(mounted)
    assert.deepEqual(itemIds(mounted.container), payload.slice(0, 6).map((row) => row.row_id), 'only the first page is on screen before the sentinel is crossed')
    assert.equal(mounted.container.querySelectorAll('.omnimux-rival-timeline-sentinel').length, 1, 'a page with more rows must keep its append sentinel')

    await mounted.loadMore()
    await settle(mounted.container, () => itemsOf(mounted.container).length === payload.length)
    assert.deepEqual(itemIds(mounted.container), payload.map((row) => row.row_id), 'the appended page must land below the rows already on screen, in publish order')
    assert.ok(mounted.postsRequests.some((query) => /(?:^|&)page=2(?:&|$)/.test(query)), 'crossing the sentinel must request the next page')
    assert.equal(mounted.container.querySelectorAll('.omnimux-rival-timeline-sentinel').length, 0, 'the sentinel goes away once the last page is on screen')
  })

  it('stops appending after a failed next page and never retries in a loop', async () => {
    const payload = hostPayload()
    requestedPages = [payload.slice(0, 6), { fail: true }]
    const mounted = await mountStageOnAccounts()
    open.push(mounted)
    assert.equal(mounted.container.querySelectorAll('.omnimux-rival-timeline-sentinel').length, 1, 'page one keeps its sentinel')

    await mounted.loadMore()
    await settle(mounted.container, () => mounted.postsRequests.some((query) => /(?:^|&)page=2(?:&|$)/.test(query)))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 120)) })
    const pageTwo = () => mounted.postsRequests.filter((query) => /(?:^|&)page=2(?:&|$)/.test(query)).length
    assert.equal(pageTwo(), 1, 'a failed append must be requested exactly once')
    assert.equal(mounted.container.querySelectorAll('.omnimux-rival-timeline-sentinel').length, 0, 'a failed append must remove the sentinel instead of retrying it')
    assert.equal(mounted.container.querySelectorAll('.omnimux-rival-timeline-skel').length, 0, 'a failed append must clear its skeleton')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)) })
    assert.equal(pageTwo(), 1, 'no background retry may follow the failure')
  })

  it('keeps the newer append in flight when a stale page-2 answer arrives (#3434)', async () => {
    const payload = hostPayload()
    requestedPages = [payload.slice(0, 6), { rows: payload.slice(6), deferred: true }]
    const mounted = await mountStageOnAccounts()
    open.push(mounted)
    await mounted.loadMore()
    await settle(mounted.container, () => mounted.postsRequests.some((query) => /(?:^|&)page=2(?:&|$)/.test(query)))
    const pageTwo = () => mounted.postsRequests.filter((query) => /(?:^|&)page=2(?:&|$)/.test(query)).length

    // Swap the selection while the first page-2 answer is still pending.
    const higgs = ACCOUNTS.higgs
    const pendingRow = mounted.container.querySelector(`.omnimux-rival-accounts [data-account-id="${higgs.id}"]`)
    await act(async () => {
      pendingRow.dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 30))
    })

    // Back to all accounts, then start a second page-2 append while the first is
    // still pending.
    const all = mounted.container.querySelector('.omnimux-rival-accounts-all')
    await act(async () => {
      all.dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    await settle(mounted.container, () => mounted.container.querySelectorAll('.omnimux-rival-timeline-item').length === 6)
    await mounted.loadMore()
    await settle(mounted.container, () => pageTwo() === 2)
    assert.equal(mounted.container.querySelectorAll('.omnimux-rival-timeline-skel').length, 3, 'the second append must own the in-flight skeleton')

    // The stale answer resolves first: it must not clear the second append's
    // loading flag, so its skeleton has to stay until the second answer lands.
    mounted.releaseAppend()
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 80)) })
    assert.equal(mounted.container.querySelectorAll('.omnimux-rival-timeline-skel').length, 3, 'a stale answer must not clear the newer append flag')
    assert.equal(pageTwo(), 2, 'a stale answer must not unlock a third page-2 fetch')

    mounted.releaseAppend()
    await settle(mounted.container, () => mounted.container.querySelectorAll('.omnimux-rival-timeline-item').length === payload.length)
    assert.equal(mounted.container.querySelectorAll('.omnimux-rival-timeline-skel').length, 0, 'the current append must clear its own skeleton when it lands')
    assert.equal(pageTwo(), 2, 'the same page must not be fetched again after recovery')
  })

  it('narrows the timeline to one account through the persistent account column', async () => {
    const mounted = await mountStageOnAccounts()
    open.push(mounted)
    const higgs = ACCOUNTS.higgs
    const row = mounted.container.querySelector(`.omnimux-rival-accounts [data-account-id="${higgs.id}"]`)
    const all = mounted.container.querySelector('.omnimux-rival-accounts-all')
    assert.ok(row, 'the left column must list every monitored account')
    assert.equal(all.classList.contains('is-selected'), true, '全部 must be the current target before any click')
    assert.equal(all.getAttribute('aria-current'), 'page', '全部 must be marked as the current page')
    assert.equal(row.querySelector('.omnimux-rival-filter-select').getAttribute('role'), 'button', 'the row main area is a single-select navigation target')
    assert.equal(row.getAttribute('data-selected'), 'false', 'no account starts selected')

    await act(async () => {
      row.dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    const expected = POSTS.filter((post) => post.account === higgs).map(cardId)
    await settle(mounted.container, () => itemIds(mounted.container).length === expected.length)
    assert.deepEqual(itemIds(mounted.container), expected, 'the timeline must keep only the clicked account\'s posts')
    assert.equal(row.getAttribute('data-selected'), 'true', 'the clicked row must be selected')
    assert.equal(row.querySelector('.omnimux-rival-filter-select').getAttribute('aria-current'), 'true', 'the clicked row is the current page')
    assert.equal(all.classList.contains('is-selected'), false, '全部 must give up the highlight')
    const selectionQuery = mounted.postsRequests.find((query) => query.includes('accounts='))
    assert.ok(selectionQuery, `the selection must reach the feed as the accounts parameter (got ${JSON.stringify(mounted.postsRequests)})`)
    assert.equal(new URLSearchParams(selectionQuery).get('accounts'), higgs.id, 'the accounts parameter must carry only the clicked account')

    await act(async () => {
      all.dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    await settle(mounted.container, () => itemIds(mounted.container).length === POSTS.length)
    assert.equal(itemIds(mounted.container).length, POSTS.length, '全部 must restore every account\'s timeline')
    assert.equal(all.classList.contains('is-selected'), true, '全部 must be highlighted again')
    assert.equal(row.getAttribute('data-selected'), 'false', 'the row must be released when 全部 is clicked again')
  })

  it('deletes an account from the 更多 menu only after confirmation, then refreshes the page', async () => {
    const mounted = await mountStageOnAccounts()
    open.push(mounted)
    const higgs = ACCOUNTS.higgs
    const row = mounted.container.querySelector(`.omnimux-rival-accounts [data-account-id="${higgs.id}"]`)
    assert.ok(row, 'the left column must list the account to delete')
    const all = mounted.container.querySelector('.omnimux-rival-accounts-all')
    const more = row.querySelector('.omnimux-rival-filter-more')
    assert.ok(more, 'the row must carry its 更多 button')
    assert.equal(more.getAttribute('aria-label'), zh['rivalAccounts.column.more'], '更多 must label the row action')

    const feedRequestsBefore = mounted.postsRequests.length
    await act(async () => {
      more.dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    const menu = mounted.container.querySelector('.omnimux-rival-menu')
    assert.ok(menu, '更多 must open the account menu')
    assert.equal(menu.getAttribute('role'), 'menu', 'the menu must present itself as a menu')
    assert.ok([...menu.querySelectorAll('.omnimux-rival-menu-item')].some((node) => node.textContent.trim() === zh['rivalAccounts.column.remove']), 'the menu must offer 删除')
    assert.ok([...menu.querySelectorAll('.omnimux-rival-menu-item')].some((node) => node.textContent.trim() === zh['rivalAccounts.column.refresh']), 'the menu must offer 刷新')
    assert.equal(row.getAttribute('data-selected'), 'false', 'opening 更多 must not switch accounts')
    assert.equal(all.classList.contains('is-selected'), true, '全部 must stay the current target')
    assert.equal(mounted.postsRequests.length, feedRequestsBefore, 'opening the menu must not refetch the feed')

    // 单击删除只打开发送确认弹窗，不 DELETE。
    const deleteItem = [...menu.querySelectorAll('.omnimux-rival-menu-item')].find((node) => node.textContent.trim() === zh['rivalAccounts.column.remove'])
    await act(async () => {
      deleteItem.dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    assert.equal(mounted.requests.filter((request) => request.method === 'DELETE').length, 0, 'opening the confirmation must not delete')
    const dialog = mounted.container.querySelector('[role="dialog"]')
    assert.ok(dialog, '删除 must open the confirmation dialog')
    assert.match(dialog.textContent, /确认删除/, 'the dialog must ask for confirmation')
    assert.match(dialog.textContent, new RegExp(higgs.handle.replace('@', '@?')), 'the dialog must name the account')

    // 确认按钮才真的 DELETE。
    await act(async () => {
      [...dialog.querySelectorAll('button')].find((node) => node.textContent.trim() === zh['rivalAccounts.column.removeConfirm'])
        .dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    await settle(mounted.container, () => !mounted.container.querySelector(`.omnimux-rival-accounts [data-account-id="${higgs.id}"]`))
    assert.equal(mounted.container.querySelector(`.omnimux-rival-accounts [data-account-id="${higgs.id}"]`), null, 'the deleted account must leave the column')
    const deletes = mounted.requests.filter((request) => request.method === 'DELETE')
    assert.equal(deletes.length, 1, 'the deletion is one DELETE request')
    assert.equal(deletes[0].path.endsWith(`/${higgs.id}`), true, `the DELETE must target the account (got ${deletes[0].path})`)
    assert.equal(mounted.container.querySelector('.omnimux-rival-menu'), null, 'the menu must close once the deletion lands')
    const deleteIndex = mounted.requests.findIndex((request) => request.method === 'DELETE')
    const after = mounted.requests.slice(deleteIndex + 1)
    assert.equal(after.some((request) => request.path.includes(`${RIVAL_PREFIX}/posts`)), true, 'the works must be re-read after the deletion')
    assert.equal(after.some((request) => request.method === 'GET' && request.path.includes(RIVAL_PREFIX) && !request.path.includes('/posts')), true, 'the account list must be re-read after the deletion')
    assert.equal(mounted.container.querySelectorAll('.omnimux-rival-accounts [data-account-id]').length, Object.keys(ACCOUNTS).length - 1, 'the column must lose exactly the deleted account')
  })

  it('keeps the row and shows the menu error when the deletion is rejected', async () => {
    removeStatus = 500
    const mounted = await mountStageOnAccounts()
    open.push(mounted)
    const higgs = ACCOUNTS.higgs
    const row = mounted.container.querySelector(`.omnimux-rival-accounts [data-account-id="${higgs.id}"]`)
    assert.ok(row, 'the left column must list the account to delete')
    const more = row.querySelector('.omnimux-rival-filter-more')
    assert.ok(more, 'the row must carry its 更多 button')

    await act(async () => {
      more.dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    const menu = mounted.container.querySelector('.omnimux-rival-menu')
    assert.ok(menu, '更多 must open the account menu on a failing Host too')
    await act(async () => {
      [...menu.querySelectorAll('.omnimux-rival-menu-item')].find((node) => node.textContent.trim() === zh['rivalAccounts.column.remove'])
        .dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    const dialog = mounted.container.querySelector('[role="dialog"]')
    await act(async () => {
      [...dialog.querySelectorAll('button')].find((node) => node.textContent.trim() === zh['rivalAccounts.column.removeConfirm'])
        .dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    await settle(mounted.container, () => (mounted.container.querySelector('[role="dialog"]')?.textContent || '').includes(zh['rivalAccounts.column.removeFailed']))
    assert.ok(mounted.container.querySelector('[role="dialog"]')?.textContent.includes(zh['rivalAccounts.column.removeFailed']), 'the failure must use the dialog copy')
    assert.ok(mounted.container.querySelector(`.omnimux-rival-accounts [data-account-id="${higgs.id}"]`), 'a rejected deletion must keep the account row')
    assert.equal(mounted.requests.filter((request) => request.method === 'DELETE').length, 1, 'a rejected deletion must not be retried')
    assert.equal(mounted.container.querySelectorAll('.omnimux-rival-accounts [data-account-id]').length, Object.keys(ACCOUNTS).length, 'the column must keep every account on a failure')
  })

  it('returns to 全部 after the currently selected account is deleted', async () => {
    const mounted = await mountStageOnAccounts()
    open.push(mounted)
    const higgs = ACCOUNTS.higgs
    const row = mounted.container.querySelector(`.omnimux-rival-accounts [data-account-id="${higgs.id}"]`)
    assert.ok(row, 'the left column must list the account to delete')
    const all = mounted.container.querySelector('.omnimux-rival-accounts-all')

    await act(async () => {
      row.dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    const selectedPosts = POSTS.filter((post) => post.account === higgs).map(cardId)
    await settle(mounted.container, () => itemIds(mounted.container).length === selectedPosts.length)
    assert.deepEqual(itemIds(mounted.container), selectedPosts, 'the clicked account is the whole timeline')
    assert.equal(all.classList.contains('is-selected'), false, '全部 must give up the highlight while an account is current')

    const more = mounted.container.querySelector(`.omnimux-rival-accounts [data-account-id="${higgs.id}"]`).querySelector('.omnimux-rival-filter-more')
    await act(async () => {
      more.dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    const menu = mounted.container.querySelector('.omnimux-rival-menu')
    await act(async () => {
      [...menu.querySelectorAll('.omnimux-rival-menu-item')].find((node) => node.textContent.trim() === zh['rivalAccounts.column.remove'])
        .dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    const dialog = mounted.container.querySelector('[role="dialog"]')
    await act(async () => {
      [...dialog.querySelectorAll('button')].find((node) => node.textContent.trim() === zh['rivalAccounts.column.removeConfirm'])
        .dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    await settle(
      mounted.container,
      () => !mounted.container.querySelector(`.omnimux-rival-accounts [data-account-id="${higgs.id}"]`)
        && mounted.container.querySelector('.omnimux-rival-accounts-all')?.classList.contains('is-selected') === true,
    )
    assert.equal(mounted.container.querySelector('.omnimux-rival-accounts-all').classList.contains('is-selected'), true, '删除当前账号后必须回到「全部」')
    assert.equal(mounted.container.querySelector('.omnimux-rival-accounts-all').getAttribute('aria-current'), 'page', '全部 must be the current page again')
    assert.equal(mounted.container.querySelectorAll('.omnimux-rival-accounts [data-account-id][data-selected="true"]').length, 0, 'the deleted row must not leave a selection behind')
    const deleteIndex = mounted.requests.findIndex((request) => request.method === 'DELETE')
    const after = mounted.requests.slice(deleteIndex + 1)
    const feedsAfter = after.filter((request) => request.path.includes(`${RIVAL_PREFIX}/posts`))
    assert.equal(feedsAfter.some((request) => new URL(request.path, 'http://localhost').searchParams.get('accounts') === null), true, 'the fallback request must be「全部」')
    const remaining = POSTS.filter((post) => post.account !== higgs).map(cardId)
    await settle(mounted.container, () => itemIds(mounted.container).length === remaining.length)
    assert.deepEqual(itemIds(mounted.container), remaining, '全部 after the deletion shows only the remaining accounts')
  })
})
