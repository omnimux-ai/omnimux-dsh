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
/**
 * Word-boundary line model mirroring the implementation's `rivalWrapLines`
 * (R4): CJK breaks per character, half-width runs are unbreakable words,
 * line-trailing whitespace is swallowed, overlong words occupy one line.
 * Kept formula-identical by design — see the file header: this layer asserts
 * decisions agree with the given geometry, never that the geometry matches a
 * real layout engine. Geometry correctness is carried by real-browser
 * measurement.
 */
const SPACE_FACTOR_E2E = { 0x1680: 0.450, 0x2000: 0.489, 0x2002: 0.489, 0x2001: 0.989, 0x2003: 0.989, 0x2004: 0.322, 0x2005: 0.239, 0x2006: 0.155, 0x2008: 0.286, 0x2009: 0.130, 0x200a: 0.060, 0x205f: 0.211, 0x3000: 1.0, 0x00a0: 0.271, 0x202f: 0.130, 0x2007: 0.619 }
const GLYPH_WIDTH_FACTOR_E2E = {
  ' ': 0.271, '!': 0.300, '"': 0.467, '#': 0.619, '$': 0.619, '%': 0.915,
  '&': 0.701, "'": 0.286, '(': 0.371, ')': 0.371, '*': 0.461, '+': 0.619,
  ',': 0.286, '-': 0.461, '.': 0.286, '/': 0.294, ':': 0.286, ';': 0.286,
  '<': 0.619, '=': 0.619, '>': 0.619, '?': 0.502, '@': 0.907,
  '0': 0.619, '1': 0.453, '2': 0.593, '3': 0.616, '4': 0.633,
  '5': 0.607, '6': 0.626, '7': 0.559, '8': 0.628, '9': 0.626,
  A: 0.663, B: 0.647, C: 0.705, D: 0.716, E: 0.585, F: 0.561,
  G: 0.736, H: 0.731, I: 0.257, J: 0.527, K: 0.648, L: 0.557,
  M: 0.863, N: 0.731, O: 0.761, P: 0.625, Q: 0.761, R: 0.643,
  S: 0.627, T: 0.623, U: 0.727, V: 0.663, W: 0.957, X: 0.668,
  Y: 0.645, Z: 0.651,
  '[': 0.371, '\\': 0.294, ']': 0.371, '^': 0.619, '_': 0.573, '`': 0.489,
  a: 0.541, b: 0.603, c: 0.549, d: 0.603, e: 0.561, f: 0.351,
  g: 0.599, h: 0.578, i: 0.236, j: 0.236, k: 0.532, l: 0.242,
  m: 0.859, n: 0.573, o: 0.580, p: 0.600, q: 0.599, r: 0.370,
  s: 0.513, t: 0.353, u: 0.573, v: 0.531, w: 0.764, x: 0.514,
  y: 0.532, z: 0.528,
  '{': 0.371, '|': 0.248, '}': 0.371, '~': 0.619,
}
const WORD_WIDTH_E2E = (word, unit) => [...word].reduce((sum, c) => {
  const cp = c.codePointAt(0)
  if (cp === 0xfeff || cp === 0x2060 || cp === 0x200b) return sum
  if (cp > 0x2e7f) return sum + unit
  return sum + unit * (SPACE_FACTOR_E2E[cp] ?? GLYPH_WIDTH_FACTOR_E2E[c] ?? 0.592)
}, 0)
const LINE_START_FORBIDDEN_E2E = /[，。、；：？！）］｝》」』〞〟‥…‰％]/
// drift guard: GLYPH_WIDTH_FACTOR_E2E must stay identical to
// GLYPH_WIDTH_FACTOR in rival-masonry.js (assert.equal'd below).
assert.equal(GLYPH_WIDTH_FACTOR_E2E['#'], 0.619, 'glyph table smoke')

const LINE_END_FORBIDDEN_E2E = /[（［｛《〈「『【〔［]/

function specWrapLines(text, unit, lineWidth) {
  const width = Math.max(1, lineWidth - 0.5) // assert.equal'd vs Chrome: sub-px boundary tolerance
  const atoms = []
  let open = null
  for (const ch of String(text || '')) {
    const cp = ch.codePointAt(0)
    // Collapsible break whitespace + line/paragraph separators (R6).
    if (cp === 0x0020 || cp === 0x0009 || cp === 0x000a || cp === 0x000d || cp === 0x000c
      || cp === 0x2028 || cp === 0x2029) {
      open = null; atoms.push({ space: true, collapsible: true, w: 0.271 }); continue
    }
    // UAX#14 BA non-collapsible spaces + ZWSP + ideographic space (R6).
    if (cp === 0x1680 || (cp >= 0x2000 && cp <= 0x2006) || (cp >= 0x2008 && cp <= 0x200a)
      || cp === 0x205f || cp === 0x3000 || cp === 0x200b) {
      open = null; atoms.push({ space: true, collapsible: false, w: SPACE_FACTOR_E2E[cp] ?? 0.271 }); continue
    }
    // Non-breaking spaces, figure space and zero-width joiners stay glued (R5/R6).
    if (cp === 0x00a0 || cp === 0x202f || cp === 0x2007 || cp === 0xfeff || cp === 0x2060) {
      if (!open) { open = { word: '' }; atoms.push(open) }
      open.word += ch
      continue
    }
    if (cp > 0x2e7f) { open = null; atoms.push({ cjk: ch }); continue }
    if (!open) { open = { word: '' }; atoms.push(open) }
    open.word += ch
    // UAX#14: a line may break after '-' — it joins the left segment (R5).
    if (cp === 0x2d || cp === 0x2010) open = null
  }
  const widths = atoms.map((atom) => (atom.cjk ? unit : atom.word ? WORD_WIDTH_E2E(atom.word, unit) : 0))
  let lines = 1
  let used = 0
  let lastAtomW = 0
  let pendingCollapsible = false
  let pendingWidth = 0
  for (let i = 0; i < atoms.length; i += 1) {
    const atom = atoms[i]
    if (atom.space) {
      if (atom.collapsible && pendingCollapsible) continue
      if (atom.collapsible) pendingCollapsible = true
      pendingWidth += atom.w * unit
      continue
    }
    const w = widths[i]
    const glue = pendingWidth > 0 && used > 0 ? pendingWidth : 0
    pendingCollapsible = false
    pendingWidth = 0
    if (used === 0) { used = Math.min(w, width); lastAtomW = used; continue }
    if (used + glue + w <= width) {
      // 行尾禁则：开类标点不能悬挂行尾——随下一内容原子一起换行。
      if (atom.cjk && LINE_END_FORBIDDEN_E2E.test(atom.cjk)) {
        let nextW = 0
        let j = i + 1
        for (; j < atoms.length; j += 1) {
          const n = atoms[j]
          if (n.space) { nextW += n.w * unit; continue }
          nextW += widths[j]
          break
        }
        if (j < atoms.length && used + glue + w + nextW > width) {
          lines += 1
          used = Math.min(w, width)
          lastAtomW = w
          continue
        }
      }
      used += glue + w; lastAtomW = w; continue
    }
    lines += 1
    if (atom.cjk && lastAtomW > 0 && LINE_START_FORBIDDEN_E2E.test(atom.cjk)) {
      // kinsoku: a closing punctuation cannot open a line — the previous
      // character drops down with it (assert.equal'd in the pin test).
      used = Math.min(lastAtomW + w, width)
    } else {
      used = Math.min(w, width)
    }
    lastAtomW = w
  }
  return lines
}
// The oracle must never silently drift from the implementation again: the
// smoke value below is asserted inside a test (see "pins the R6 codepoint
// classes"), but a wrong constant is caught earliest right here.
assert.equal(specWrapLines('onetwothree fourfivesix', 14, 60), 2, 'spec oracle smoke')

function specHeightPx(post, columnWidth) {
  const inner = columnWidth - 2
  const platform = post.platform
  const isX = platform === 'x' || platform === 'twitter' || platform === 'threads'
  const isText = isX && String(post.cover_src || '') === '' && post.type !== 'video' && post.type !== 'image'
  // R4-1: the pill row only exists when velocity carries a non-empty text —
  // same predicate as `rivalHasPill` in the implementation and the DOM.
  const pill = post.velocity && String(post.velocity.text || '') !== '' ? 36 : 0
  if (isText) {
    const lines = Math.max(1, Math.min(8, specWrapLines(post.title, 14, inner - 24)))
    return Math.max(144, 24 + pill + lines * 20 + 2)
  }
  if (isX) {
    const lines = Math.max(1, Math.min(3, specWrapLines(post.title, 14, inner - 24)))
    return Math.max(144, 24 + pill + lines * 20 + 10 + (inner - 24) / specRatio(post) + 2)
  }
  const lines = Math.max(1, Math.min(2, specWrapLines(post.title, 13, columnWidth - 26)))
  return Math.max(144, inner / specRatio(post) + 22 + lines * 18 + 2)
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

describe('the spec wrap oracle mirrors the implementation (#3110 R6)', () => {
  it('pins the R6 codepoint classes with exact line counts', () => {
    const words = ['abcdef', 'ghijkl', 'mnopqr', 'stuvwx', 'yzabcd']
    // One word per 60px line: breakable separators must give exactly 5 lines,
    // glued separators exactly 1 — same expectation the unit suite and the
    // Chrome probe enforce on rivalWrapLines itself.
    const breakable = [0x0020, 0x0009, 0x000a, 0x000d, 0x000c, 0x2028, 0x2029,
      0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
      0x2008, 0x2009, 0x200a, 0x200b, 0x205f, 0x3000]
    for (const cp of breakable) {
      const sep = String.fromCodePoint(cp)
      assert.equal(specWrapLines(words.join(sep), 14, 60), 5, `U+${cp.toString(16).toUpperCase().padStart(4, '0')} must be breakable`)
    }
    const glued = [0x00a0, 0x202f, 0x2007, 0xfeff, 0x2060, 0x000b, 0x2011]
    for (const cp of glued) {
      const sep = String.fromCodePoint(cp)
      assert.equal(specWrapLines(words.join(sep), 14, 60), 1, `U+${cp.toString(16).toUpperCase().padStart(4, '0')} must stay glued`)
    }
    // NBSP still keeps its word-wide run intact at a wider width too.
    // 行宽 3 字（42px，有效 41.5 容差后 2 字/行）、8 字串、禁则标点落第
    // 7 字：无禁则时 4 行；Chrome 把前一字带回后该行再容不下 → 5 行。
    assert.equal(specWrapLines('一二三四五六，七八', 14, 42), 5, 'kinsoku pull-back must add the line Chrome adds')
    assert.equal(specWrapLines('word boundaries', 14, 194), 1)
  })
})

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

    it('renders kit Buttons with a real label span and pills in the production shape (#3166-②)', async () => {
      // R8 装置整改：shim Button 此前渲染裸文本节点，省略号规则
      //（.omnimux-rival-act-btn > span:text-overflow）在装置里匹配不到任何
      // 元素——该修复曾连续两轮不可见。此用例把生产 DOM 形状钉在渲染层：
      // 每个 act 按钮必须有一个 .label span（生产 Button.tsx 同构）。
      const mounted = await mountMasonry(1440)
      open.push(mounted)
      const card = cardsOf(mounted.container)[0]
      const actions = [...card.querySelectorAll('.omnimux-rival-act-btn, .omnimux-rival-act-primary')]
      assert.ok(actions.length > 0, 'the hover layer must render action buttons')
      for (const btn of actions) {
        const label = btn.querySelector('span.label')
        assert.ok(label, `${btn.className} must render its text inside a .label span (production kit DOM)`)
        assert.equal(label.textContent, btn.textContent, 'the label span carries the whole button text')
      }
      const pill = card.querySelector('.omnimux-rival-vpill')
      assert.ok(pill, 'the velocity pill must render')
      assert.match(pill.className, /\bon-(media|surface)\b/, 'the pill carries its surface class for the contrast tokens')
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
