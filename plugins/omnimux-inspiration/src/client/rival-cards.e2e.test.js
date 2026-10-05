import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { zh } from './locales.js'
import { toRivalCardRow } from './rival-filter.js'

/**
 * End-to-end gate for the account-monitor card shapes and the waterfall (#3110).
 *
 * Two levels, because the promise has two halves and neither level can see both:
 *
 *   1. **The container** — the real `RivalMasonry` + `RivalPostCard` +
 *      `rival-styles` + `rival-tokens`, mounted at an explicit width. jsdom does
 *      no layout, so the width is passed in and the geometry becomes
 *      deterministic; the gate then recomputes the expected placement *itself*
 *      (independent shortest-column greedy over the ratios it derives from the
 *      spec's type table) and compares it against the rendered `data-col`. A
 *      gate that asked the component what it decided would pass by construction.
 *
 *   2. **The page wiring** — the real `InspirationStage`, driven through the tab
 *      bar to 账号监控, so a break in the chain (a renamed prop, a dropped
 *      callback, the grid no longer reading the Host's rows) fails here rather
 *      than in production.
 *
 * What it asserts, and why each one is worth a gate:
 *
 *   - five card types render, each with the media ratio its type promises,
 *     taken from the spec's §9.1/§9.3 table;
 *   - the column count follows the shared core's breakpoints at the widths the
 *     spec names, so nobody re-introduces a hand-written breakpoint list;
 *   - every card lands in the shortest column, recomputed independently;
 *   - **DOM order equals the order the Host returned** (V4). This is the one a
 *     "one flex container per column" implementation would silently break: it
 *     renders correctly but reads column-first, so Tab and screen readers walk
 *     the grid sideways. The assertion is on `querySelectorAll` order, which is
 *     exactly the order assistive tech sees;
 *   - the default state keeps author, time, metrics and actions inside
 *     `.omnimux-rival-card-overlay` — asserted structurally (subtree membership)
 *     rather than by computed visibility, because jsdom applies no stylesheet;
 *   - a row the Host marked as interacted renders in the processed state.
 *
 * Reverting the fix is measurable: rendering one flex container per column, or
 * dropping `--rival-media-ratio` from the media element, fails the placement and
 * ratio assertions below.
 *
 * Boundary this file does NOT cover (QA report-2 §2③): the placement oracle
 * (`specHeightPx`/`expectedColumns`) recomputes the same per-type geometry the
 * implementation's `rivalCardHeightPx` produces — the two are deliberately
 * formula-identical. So the assertions here prove「决策与给定几何一致」
 * (every card lands in the greedy shortest column), never「几何与真实渲染
 * 一致」. A change that alters the height model but leaves the greedy column
 * order untouched (e.g. long-video clamp 2, title line-height 18→30) would
 * pass this layer. Geometry correctness is carried by the real-browser
 * measurement instead — recompute entry:
 * `docs/evidence/account-monitor-v2-cards-3110/rectify-placement-measure.json`.
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'rival-cards')

const RIVAL_PREFIX = '/omnimux/inspiration/local/rival-accounts'

/** Widths the spec names, and the column count the shared core must produce. */
const BREAKPOINTS = [
  { width: 1440, columns: 6 },
  { width: 1164, columns: 5 },
  { width: 1163, columns: 4 },
  { width: 928, columns: 4 },
  { width: 927, columns: 3 },
  { width: 692, columns: 3 },
]

/** Requests one mount may make before the gate calls it a loop. */
const REQUEST_BUDGET = 120

let bundleCounter = 0

/**
 * Bundle an entry with the UI-kit shim in place of `dsh-ui-kit`.
 * @param {string} entry absolute path of the entry module
 * @param {string} tag cache-file prefix, so the two entries never collide
 * @returns {Promise<string>} absolute path of the bundled ESM file
 */
async function bundle(entry, tag) {
  mkdirSync(cacheDir, { recursive: true })
  const outFile = join(cacheDir, `${tag}-${bundleCounter}.mjs`)
  bundleCounter += 1
  const result = await esbuild.build({
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
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
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

/**
 * The §9.4 twelve-card sequence, in Host order (推荐位 1–12).
 *
 * Twelve cards over five columns is the smallest payload that can tell the
 * spec's shortest-column greedy from round-robin: with five cards every
 * implementation lands them 0..4 and the assertion proves nothing. This is
 * also the exact sequence the QA pass caught mis-placed (D1), pinned here as
 * a regression fixture.
 *
 * What jsdom cannot see: it does no layout, so card geometry, spacing,
 * contrast and filters are out of scope for this file — those are verified in
 * the real-browser acceptance pass. This layer asserts *decisions* (which
 * column each card was assigned), not pixels.
 */
const POSTS = [
  { id: 'p1', account: 'meow', platform: 'tiktok', type: 'video', cover_src: '/m/c1.jpg', ratio: 0.5625, title: '猫咪饮水机实测：三只猫一周后还喝吗', velocity: { text: '爆款 23k/h', tier: 'hot' }, match: { label: '高契合' } },
  { id: 'p2', account: 'pet', platform: 'youtube', type: 'video', cover_src: '/m/c2.jpg', ratio: 1.7778, title: '2026 十款智能喂食器横评', velocity: { text: '爆款 42k/h', tier: 'hot' }, match: { label: '可参考' }, interacted_at: '2026-10-05T09:12:00.000Z' },
  { id: 'p3', account: 'home', platform: 'instagram', type: 'image', cover_src: '/m/c3.jpg', ratio: 0.8, title: '小户型猫爬架一体收纳方案', velocity: { text: '飙升 3.4k/h', tier: 'rising' }, match: { label: '高契合' } },
  { id: 'p11', account: 'higgs', platform: 'x', type: 'text', title: '做了三个月 AI 视效，最大的体会是：镜头语言比模型更重要。同一段提示词，加上「低机位缓推」和「焦点从前景移到人物」，成片质感直接上一个台阶。很多人卡在画面抖、主体漂，其实是没给运动加约束。下周把团队内部在用的 12 种运镜模板整理出来，评论区告诉我你最想先看哪一种。', velocity: { text: '飙升 2.6k/h', tier: 'rising' }, match: { label: '可参考' } },
  { id: 'p4', account: 'higgs', platform: 'x', type: 'video', cover_src: '/m/c4.jpg', ratio: 1.7778, title: '电影级推拉镜头拆解：同一个人物，三种运镜节奏，情绪完全不同。提示词和参数都放在视频最后。', velocity: { text: '飙升 1.2k/h', tier: 'rising' }, match: { label: '可参考' }, in_library: true },
  { id: 'p5', account: 'fur', platform: 'tiktok', type: 'video', cover_src: '/m/c5.jpg', ratio: 0.5625, title: '生骨肉配比入门：一周备餐流程', velocity: { text: '均速 1.8k/h', tier: 'average' } },
  { id: 'p6', account: 'runway', platform: 'x', type: 'video', cover_src: '/m/c6.jpg', ratio: 1.7778, title: 'Gen-3 运动笔刷实战：沙、烟、水花三种粒子，笔刷方向决定轨迹，强度决定扩散范围。', velocity: { text: '观察 480/h', tier: 'watch' }, interacted_at: '2026-10-04T22:05:00.000Z' },
  { id: 'p12', account: 'runway', platform: 'x', type: 'text', title: '角色一致性终于不用靠抽卡了：一张参考图，跨镜头保持同一张脸。', velocity: { text: '观察 260/h', tier: 'watch' }, interacted_at: '2026-10-05T10:36:00.000Z' },
  { id: 'p7', account: 'ootd', platform: 'instagram', type: 'image', cover_src: '/m/c7.jpg', ratio: 1, title: '通勤胶囊衣橱：7 件单品 21 套', velocity: { text: '观察 320/h', tier: 'watch' } },
  { id: 'p8', account: 'meow', platform: 'tiktok', type: 'video', cover_src: '/m/c8.jpg', ratio: 0.5625, title: '半夜跑酷实录：监控视角全程', velocity: { text: '该号 4.2x', tier: 'relative' } },
  { id: 'p9', account: 'pet', platform: 'youtube', type: 'video', cover_src: '/m/c9.jpg', ratio: 1.7778, title: '猫砂盆除臭终极方案对比', velocity: { text: '飙升 6.8k/h', tier: 'rising' }, match: { label: '高契合' }, in_library: true },
  { id: 'p10', account: 'home', platform: 'instagram', type: 'image', cover_src: '/m/c10.jpg', ratio: 0.8, title: '阳台改造：宠物友好绿植角', velocity: { text: '爆款 21k/h', tier: 'hot' }, match: { label: '可参考' } },
]

/** Account per card (§9.4 account column). */
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
 * The shape the Host serves for one row. `type` decides the card form; the
 * account block is what the hover overlay shows and must stay out of the
 * default layer.
 */
function hostRow(post) {
  const account = ACCOUNTS[post.account]
  return {
    id: post.id,
    row_id: `${account.id}:${post.id}`,
    account_id: account.id,
    title: post.title,
    text: post.title,
    type: post.type,
    ratio: post.ratio ?? null,
    url: `https://${post.platform}.example/${account.handle}/${post.id}`,
    posted_at: '2026-10-05T08:12:00.000Z',
    stats: { views: 128000, likes: 8640, comments: 214, shares: 96 },
    interacted_at: post.interacted_at ?? null,
    in_library: post.in_library === true,
    velocity: post.velocity ?? null,
    match: post.match ?? null,
    cover_src: post.cover_src ?? null,
    source_platform: post.platform,
    account: { id: account.id, nickname: account.nickname, handle: account.handle, platform: account.platform },
  }
}

/** @returns {Array<Record<string, any>>} the payload, in Host order */
function hostPayload() {
  return POSTS.map(hostRow)
}

/**
 * The ratio a rendered card must carry, derived from the spec's table rather
 * than from the component: a text card has no media, an image clamps into
 * 4:5 … 1.91:1, and a video keeps the orientation its type implies.
 * @param {Record<string, any>} post
 * @returns {number | null}
 */
function specRatio(post) {
  const clampImage = (value) => Math.min(1.91, Math.max(0.8, Number.isFinite(value) ? value : 0.8))
  const platform = post.platform
  if (platform === 'tiktok' || platform === 'douyin' || platform === 'kuaishou') return 9 / 16
  if (platform === 'youtube') return 16 / 9
  if (platform === 'x' || platform === 'twitter' || platform === 'threads') {
    const hasMedia = String(post.cover_src || '') !== '' || post.type === 'video' || post.type === 'image'
    if (!hasMedia) return null
    return post.type === 'image' ? clampImage(Number(post.ratio)) : 16 / 9
  }
  return post.type === 'video' ? 9 / 16 : clampImage(Number(post.ratio))
}

/**
 * The spec's card geometry in pixels (§9.1 + §9.3), re-derived independently —
 * deliberately NOT the implementation's own measure: the gate's value is that
 * it can disagree with the component when the component is wrong.
 *
 * border-box: 1px top + 1px bottom border; inner width = columnWidth − 2.
 * Media cards: media (inner ÷ ratio) + title zone (top 10 + bottom 12, lines ×
 * 18) where the line count is a *rendered* estimate (CJK ≈ 13px, ASCII ≈
 * 0.55×), never the clamp cap itself. Text cards: 12+12 padding, optional
 * 28+8 pill row, body lines × 20 at 14px units, min height 144.
 * @param {Record<string, any>} post
 * @param {number} columnWidth
 * @returns {number}
 */
function specHeightPx(post, columnWidth) {
  const inner = columnWidth - 2
  const widthPx = (text, unit) => [...String(text || '')]
    .reduce((sum, ch) => sum + (ch.codePointAt(0) > 0x2e7f ? unit : unit * 0.55), 0)
  const platform = post.platform
  const isX = platform === 'x' || platform === 'twitter' || platform === 'threads'
  const isText = isX && String(post.cover_src || '') === '' && post.type !== 'video' && post.type !== 'image'
  const pill = post.velocity ? 36 : 0
  if (isText) {
    const lines = Math.max(1, Math.min(8, Math.ceil(widthPx(post.title, 14) / (inner - 24))))
    return Math.max(144, 24 + pill + lines * 20 + 2)
  }
  if (isX) {
    const lines = Math.max(1, Math.min(3, Math.ceil(widthPx(post.title, 14) / (inner - 24))))
    return Math.max(144, 24 + pill + lines * 20 + 10 + (inner - 24) / specRatio(post) + 2)
  }
  const lines = Math.max(1, Math.min(2, Math.ceil(widthPx(post.title, 13) / (columnWidth - 26))))
  return inner / specRatio(post) + 22 + lines * 18 + 2
}

/**
 * Independent shortest-column greedy over spec-pixel heights + 16px gap.
 * @param {Array<Record<string, any>>} posts
 * @param {number} columns
 * @param {number} columnWidth
 * @returns {number[]} the column index each post must land in, in input order
 */
function expectedColumns(posts, columns, columnWidth) {
  const bottoms = new Array(columns).fill(0)
  return posts.map((post) => {
    let target = 0
    for (let i = 1; i < columns; i += 1) {
      if (bottoms[i] < bottoms[target] - 1e-9) target = i
    }
    bottoms[target] += specHeightPx(post, columnWidth) + 16
    return target
  })
}

/**
 * Mount the real masonry container at a fixed width.
 * @param {number} containerWidth
 */
async function mountMasonry(containerWidth) {
  const mod = await import(`${await bundle(join(here, 'RivalMasonry.jsx'), 'masonry')}?mount=${bundleCounter}`)
  const { dom, container, restore } = installDom()
  globalThis.fetch = async () => jsonResponse(200, { success: true, data: { items: [], total: 0 } })
  const t = (key) => zh[key] || key
  const root = createRoot(container)
  await act(async () => {
    root.render(
      React.createElement(mod.RivalMasonry, {
        cards: hostPayload().map(toRivalCardRow),
        t,
        containerWidth,
        onDetail() {},
        onReplicate() {},
        onDeconstruct() {},
        onMarkDone() {},
      }),
    )
  })
  return {
    dom,
    container,
    unmount: async () => { await act(async () => root.unmount()); restore() },
  }
}

/**
 * Mount the real stage and drive it to 账号监控.
 * @returns {Promise<{ container: HTMLElement, unmount: () => Promise<void> }>}
 */
async function mountStageOnAccounts() {
  const mod = await import(`${await bundle(join(here, 'InspirationStage.jsx'), 'stage')}?mount=${bundleCounter}`)
  const { dom, container, restore } = installDom()
  const accounts = Object.values(ACCOUNTS).map((a) => ({ id: a.id, handle: a.handle, platform: a.platform, refresh_state: 'idle' }))
  let calls = 0
  globalThis.fetch = async (url) => {
    const path = String(url)
    calls += 1
    if (calls > REQUEST_BUDGET) throw new Error(`request storm: ${calls} calls, last ${path}`)
    if (path.includes(`${RIVAL_PREFIX}/status`)) {
      return jsonResponse(200, { success: true, data: { paused: { global: false, reason: null } } })
    }
    if (path.includes(`${RIVAL_PREFIX}/posts`)) {
      return jsonResponse(200, {
        success: true,
        data: { items: hostPayload(), total: POSTS.length, page: 1, page_size: 20, has_more: false },
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
  await settle(container, (node) => Boolean(node.querySelector('[data-rival-grid="true"]')))
  return {
    container,
    unmount: async () => { await act(async () => root.unmount()); restore() },
  }
}

/**
 * The card id a row renders as. `toRivalCardRow` adopts the Host's `row_id`
 * (`<account>:<post>`) as the card id, so the assertions key on that, not on the
 * bare post id.
 * @param {{ id: string }} post
 */
const cardId = (post) => `${ACCOUNTS[post.account || 'meow'].id}:${post.id}`

/** @returns {HTMLElement[]} the rendered cards, in DOM order */
const cardsOf = (container) => [...container.querySelectorAll('[data-card-id]')]

describe('account-monitor card shapes and waterfall (#3110)', () => {
  const open = []

  after(async () => {
    while (open.length) {
      // eslint-disable-next-line no-await-in-loop
      await open.pop().unmount()
    }
  })

  describe('the container lays cards out by content type', () => {
    it('renders all five card forms', async () => {
      const mounted = await mountMasonry(1440)
      open.push(mounted)
      const types = new Set(cardsOf(mounted.container).map((card) => card.getAttribute('data-card-type')))
      assert.deepEqual(
        [...types].sort(),
        ['image', 'long-video', 'short-video', 'text', 'text-media'],
        'every content type must have its own card form',
      )
    })

    it('gives each media card the ratio its type promises', async () => {
      const mounted = await mountMasonry(1440)
      open.push(mounted)
      const cards = cardsOf(mounted.container)
      for (const post of POSTS) {
        const card = cards.find((node) => node.getAttribute('data-card-id') === cardId(post))
        assert.ok(card, `card ${cardId(post)} must render`)
        const media = card.querySelector('.omnimux-rival-card-media')
        const expected = specRatio(post)
        if (expected === null) {
          assert.equal(media, null, `${post.type} has no media, so it must render none`)
          continue
        }
        assert.ok(media, `${post.type} must render its media`)
        const ratio = Number(media.style.getPropertyValue('--rival-media-ratio'))
        assert.ok(
          Math.abs(ratio - expected) < 0.01,
          `${cardId(post)} (${post.type}) must reserve ${expected.toFixed(4)}, got ${ratio}`,
        )
      }
    })

    for (const { width, columns } of BREAKPOINTS) {
      it(`uses ${columns} columns at ${width}px`, async () => {
        const mounted = await mountMasonry(width)
        open.push(mounted)
        const grid = mounted.container.querySelector('[data-rival-grid="true"]')
        assert.ok(grid, 'the masonry grid must render')
        assert.equal(
          Number(grid.getAttribute('data-columns')),
          columns,
          `${width}px must resolve to ${columns} columns through the shared core`,
        )
      })
    }

    it('places every card in the shortest column, recomputed independently', async () => {
      const width = 1164
      const columns = 5
      const columnWidth = (width - 16 * (columns - 1)) / columns // §9.3 等分列宽 = 220px
      const mounted = await mountMasonry(width)
      open.push(mounted)
      const expected = expectedColumns(POSTS, columns, columnWidth)
      const cards = cardsOf(mounted.container)
      const actual = POSTS.map((post) => Number(
        cards.find((node) => node.getAttribute('data-card-id') === cardId(post))?.getAttribute('data-col'),
      ))
      assert.deepEqual(
        actual,
        expected,
        `every card must land in the column that was shortest at placement time, recomputed from the spec's pixel geometry (expected ${expected.join(',')})`,
      )
    })

    it('renders the AI breakdown secondary action — the production wiring must reach the card', async () => {
      const mounted = await mountMasonry(1164)
      open.push(mounted)
      const card = cardsOf(mounted.container).find((node) => node.getAttribute('data-card-id') === cardId({ account: 'meow', id: 'p1' }))
      const act = card.querySelector('[data-act="deconstruct"]')
      assert.ok(act, 'the hover layer must carry the AI breakdown button — PM B2: it never rendered in production')
      assert.equal(act.textContent.trim(), zh['rivalFeed.card.deconstruct'])
    })

    it('keeps DOM order equal to the order the Host returned', async () => {
      const mounted = await mountMasonry(1440)
      open.push(mounted)
      assert.deepEqual(
        cardsOf(mounted.container).map((card) => card.getAttribute('data-card-id')),
        POSTS.map(cardId),
        'a column-first render would read sideways to Tab and screen readers',
      )
    })

    it('keeps the default layer to media, pill and title — author and actions stay in the hover overlay', async () => {
      const mounted = await mountMasonry(1440)
      open.push(mounted)
      const card = cardsOf(mounted.container).find((node) => node.getAttribute('data-card-id') === cardId({ id: 'p1' }))
      const overlay = card.querySelector('.omnimux-rival-card-overlay')
      assert.ok(overlay, 'the card must own a hover overlay')
      assert.ok(
        overlay.textContent.includes('喵星日常'),
        'the author belongs to the hover layer',
      )
      const defaultLayer = [...card.childNodes]
        .filter((node) => node !== overlay)
        .map((node) => node.textContent ?? '')
        .join(' ')
      for (const text of ['@meow_daily', '喵星日常']) {
        assert.equal(
          defaultLayer.includes(text),
          false,
          `${text} must not be in the default layer — the spec keeps it for hover`,
        )
      }
      // The three default-visible things are on screen: media, pill and title.
      assert.ok(card.querySelector('.omnimux-rival-card-media'), 'media is default-visible')
      assert.ok(card.querySelector('.omnimux-rival-card-title'), 'the title is default-visible')
      const pill = card.querySelector('.omnimux-rival-vpill, .omnimux-rival-pill-row')
      assert.ok(pill, `the velocity pill is default-visible; card html: ${card.outerHTML.slice(0, 900)}`)
    })

    it('renders an interacted row in the processed state', async () => {
      const mounted = await mountMasonry(1440)
      open.push(mounted)
      const done = cardsOf(mounted.container).find((node) => node.getAttribute('data-card-id') === cardId({ account: 'pet', id: 'p2' }))
      assert.ok(done, 'the interacted card must render')
      assert.ok(done.className.includes('is-done'), 'an interacted row must render as processed')
      const live = cardsOf(mounted.container).find((node) => node.getAttribute('data-card-id') === cardId({ account: 'meow', id: 'p1' }))
      assert.equal(live.className.includes('is-done'), false, 'an untouched row must not look processed')
    })
  })

    it('keeps a skeleton visible while an appended page loads', async () => {
      const mod = await import(`${await bundle(join(here, 'RivalFeedGrid.jsx'), 'feedgrid')}?mount=${bundleCounter}`)
      const { dom, container, restore } = installDom()
      try {
        const t = (key) => zh[key] || key
        const root = createRoot(container)
        await act(async () => {
          root.render(React.createElement(mod.RivalFeedGrid, {
            t,
            cards: hostPayload().map(toRivalCardRow),
            loading: false,
            loadingMore: true,
            emptyKind: 'no-posts',
            onResetFilters() {},
            onImport() {},
            onDetail() {},
            onReplicate() {},
          }))
        })
        const skeleton = container.querySelector('[data-rival-loadmore-skeleton]')
        assert.ok(skeleton, 'an append in flight must keep the shimmer visible below the cards')
        assert.equal(
          skeleton.querySelectorAll('.omnimux-inspiration-skel').length,
          10,
          'the append skeleton reuses the same 10-block shimmer as the first paint',
        )
        assert.equal(cardsOf(container).length, POSTS.length, 'existing cards stay rendered while appending')
        await act(async () => { root.unmount() })
      } finally {
        restore()
      }
    })

  describe('the account-monitor page renders the grid', () => {
    it('shows the Host rows as cards once the tab is selected', async () => {
      const mounted = await mountStageOnAccounts()
      open.push(mounted)
      const ids = cardsOf(mounted.container).map((card) => card.getAttribute('data-card-id'))
      for (const post of POSTS) {
        assert.ok(ids.includes(cardId(post)), `${cardId(post)} must reach the grid through the real page wiring`)
      }
    })
  })
})
