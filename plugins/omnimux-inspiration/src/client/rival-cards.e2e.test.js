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

/** The mixed-type payload both levels render, in Host order. */
const POSTS = [
  // The form is decided by the platform first (tiktok → short video, youtube →
  // long video, instagram → image, x → tweet / tweet with media), so the payload
  // has to vary the platform, not just the declared type.
  { id: 'p1', platform: 'tiktok', type: 'video', cover_src: '/omnimux/inspiration/local/media/c1.jpg', ratio: 0.5625, title: '短视频', velocity: { text: '爆款 23k/h', tier: 'hot' } },
  { id: 'p2', platform: 'youtube', type: 'video', cover_src: '/omnimux/inspiration/local/media/c2.jpg', ratio: 1.7777, title: '长视频', velocity: { text: '均速 1.8k/h', tier: 'average' } },
  { id: 'p3', platform: 'instagram', type: 'image', cover_src: '/omnimux/inspiration/local/media/c3.jpg', ratio: 0.8, title: '图文', velocity: { text: '观察 320/h', tier: 'watch' } },
  { id: 'p4', platform: 'x', type: 'text', title: '纯文本推文', interacted_at: '2026-10-05T09:00:00.000Z' },
  { id: 'p5', platform: 'x', type: 'video', cover_src: '/omnimux/inspiration/local/media/c5.jpg', ratio: 1.7777, title: '带媒体推文', velocity: { text: '观察 480/h', tier: 'watch' } },
]

/**
 * The shape the Host serves for one row. `type` decides the card form; the
 * account block is what the hover overlay shows and must stay out of the
 * default layer.
 */
function hostRow(post) {
  return {
    id: post.id,
    row_id: `acc-1:${post.id}`,
    account_id: 'acc-1',
    title: post.title,
    text: post.title,
    type: post.type,
    ratio: post.ratio ?? null,
    url: `https://x.com/li9292/status/${post.id}`,
    posted_at: '2026-09-12T08:00:00.000Z',
    stats: { views: 12000, likes: 840, comments: 12, shares: 3 },
    interacted_at: post.interacted_at ?? null,
    velocity: post.velocity ?? null,
    cover_src: post.cover_src ?? null,
    source_platform: post.platform,
    account: { id: 'acc-1', nickname: 'Li', handle: '@li9292', platform: post.platform },
  }
}

/** @returns {Array<Record<string, any>>} the payload, in Host order */
function hostPayload() {
  return POSTS.map(hostRow)
}

/**
 * The ratio a rendered card must carry, derived from the spec's table rather
 * than from the component: a text card has no media, an image clamps into
 * 4:5 … 1.91:1, and a video keeps the orientation its cover implies.
 * @param {Record<string, any>} post
 * @returns {number | null}
 */
function specRatio(post) {
  const clampImage = (value) => Math.min(4 / 5, Math.max(1 / 1.91, Number.isFinite(value) ? value : 4 / 5))
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
 * Independent shortest-column greedy over the spec ratios.
 *
 * Deliberately a re-implementation, not a call into `rival-masonry.js`: the
 * point is to disagree with the component when the component is wrong.
 * @param {Array<Record<string, any>>} posts
 * @param {number} columns
 * @returns {number[]} the column index each post must land in, in input order
 */
function expectedColumns(posts, columns) {
  const heights = new Array(columns).fill(0)
  return posts.map((post) => {
    const ratio = specRatio(post)
    const cardHeight = ratio === null ? 1.2 : 1 / ratio + 0.25
    let target = 0
    for (let i = 1; i < columns; i += 1) {
      if (heights[i] < heights[target] - 1e-9) target = i
    }
    heights[target] += cardHeight
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
  const accounts = [{ id: 'acc-1', handle: '@li9292', platform: 'tiktok', refresh_state: 'idle' }]
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
const cardId = (post) => `acc-1:${post.id}`

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
      const mounted = await mountMasonry(width)
      open.push(mounted)
      const expected = expectedColumns(POSTS, columns)
      const cards = cardsOf(mounted.container)
      const actual = POSTS.map((post) => Number(
        cards.find((node) => node.getAttribute('data-card-id') === cardId(post))?.getAttribute('data-col'),
      ))
      assert.deepEqual(
        actual,
        expected,
        'the greedy must pick the shortest column, and this gate recomputes it from the spec table',
      )
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
        overlay.textContent.includes('Li'),
        'the author belongs to the hover layer',
      )
      const defaultLayer = [...card.childNodes]
        .filter((node) => node !== overlay)
        .map((node) => node.textContent ?? '')
        .join(' ')
      for (const text of ['@li9292', 'Li']) {
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
      const done = cardsOf(mounted.container).find((node) => node.getAttribute('data-card-id') === cardId({ id: 'p4' }))
      assert.ok(done.className.includes('is-done'), 'an interacted row must render as processed')
      const live = cardsOf(mounted.container).find((node) => node.getAttribute('data-card-id') === cardId({ id: 'p1' }))
      assert.equal(live.className.includes('is-done'), false, 'an untouched row must not look processed')
    })
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
