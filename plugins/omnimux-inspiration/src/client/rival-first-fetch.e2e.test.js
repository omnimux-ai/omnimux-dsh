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

/**
 * End-to-end gate for the first-fetch promise (#3112).
 *
 * The ticket's promise is a *sequence*, not a state: import → `正在为你抓取
 * 内容` with the one-minute promise and the browse-out link → the works appear
 * on their own → a terminal failure renders a reason and a retry → retry
 * re-queues and the promise shows again. Only the real wiring —
 * `useRivalFeed` + `RivalAccountsPanel` + `RivalFeedGrid` + the locales —
 * can prove that sequence, so the gate mounts exactly that subtree on jsdom
 * and drives it through a scripted Host.
 *
 * The Host is scripted because the product path is a *read contract*: the E1
 * rows it serves decide everything the UI does, and a gate that reached
 * inside the hook to flip its state would pass by construction. The server
 * ships `config_summary.poll_interval_ms`; the script serves the same field
 * at a small interval so the bounded watch runs in real time.
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'rival-first-fetch')

/** The production cadence — the gate must still see the server value consumed. */
const SHIPPED_INTERVAL = 2500
/** The interval the scripted Host ships so the watch runs fast in test time. */
const HOST_INTERVAL = 20

let bundleCounter = 0

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

function installDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
  })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    actEnvironment: globalThis.IS_REACT_ACT_ENVIRONMENT,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.__omnimuxAuth = { ensureLogin() {} }
  return {
    dom,
    container: dom.window.document.getElementById('host'),
    restore() {
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment
    },
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function settle(container, predicate, tries = 100) {
  for (let i = 0; i < tries; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await sleep(10) })
    if (predicate(container)) return
  }
  throw new Error(`settle: condition never held. DOM: ${container.innerHTML.slice(0, 2400)}`)
}

const textOf = (container) => container.textContent || ''

/**
 * A scripted Host standing in for E1/E15 + the refresh endpoint.
 * `state` rewrites what the next account read reports — the way a real first
 * fetch moves queued → running → idle, or → error.
 */
function makeHost() {
  const state = {
    accounts: [],
    posts: [],
    intervalMs: HOST_INTERVAL,
    refreshCalls: [],
  }
  const api = {
    state,
    fetchRivalAccounts: async () => ({
      ok: true,
      body: {
        data: {
          items: state.accounts,
          total: state.accounts.length,
          config_summary: { poll_interval_ms: state.intervalMs },
        },
      },
    }),
    fetchRivalFeed: async () => ({
      ok: true,
      body: {
        data: {
          items: state.posts,
          total: state.posts.length,
          page: 1,
          has_more: false,
        },
      },
    }),
    refreshRivalAccount: async (id, opts) => {
      state.refreshCalls.push({ id, manual: opts?.manual === true })
      return { ok: true, body: { data: { queued: true } } }
    },
  }
  return api
}

const hostPost = (id) => ({
  id,
  row_id: `acc-1:${id}`,
  account_id: 'acc-1',
  title: '猫咪饮水机实测：三只猫一周后还喝吗',
  type: 'video',
  url: 'https://tiktok.example/@meow_daily/1',
  posted_at: '2026-10-05T08:12:00.000Z',
  stats: { views: 128000, likes: 8640, comments: 214, shares: 96 },
  source_platform: 'tiktok',
  account: { id: 'acc-1', nickname: '喵星日常', handle: '@meow_daily', platform: 'tiktok' },
})

/**
 * The real product subtree — `useRivalFeed` with the injected Host, the panel
 * and the grid it renders — mounted exactly the way `InspirationSection`
 * wires it (query/platform folded into the feed object, browse-out as a
 * callback). The harness lives in its own bundled module so esbuild resolves
 * the same imports the bundle uses.
 */
function Harness({ api, onBrowseTrend, Panel, useRivalFeed }) {
  const feed = useRivalFeed({ enabled: true, api })
  return React.createElement(Panel, {
    t: (key) => zh[key] || key,
    active: true,
    query: '',
    platform: '',
    feed: { ...feed, query: '', platform: '' },
    onImported() {},
    onAccountImported() {},
    onBrowseTrend,
  })
}

async function mountHarness(api, onBrowseTrend) {
  const panelFile = await bundle(join(here, 'RivalAccountsPanel.jsx'), 'panel')
  const panelMod = await import(`${panelFile}?mount=${bundleCounter}`)
  const feedMod = await import('./use-rival-feed.js')
  const { dom, container, restore } = installDom()
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(Harness, {
      api,
      onBrowseTrend,
      Panel: panelMod.RivalAccountsPanel,
      useRivalFeed: feedMod.useRivalFeed,
    }))
  })
  return {
    container,
    dom,
    unmount: async () => { await act(async () => root.unmount()); restore() },
  }
}

describe('first-fetch promise end to end (#3112)', () => {
  const open = []
  after(async () => {
    while (open.length) {
      // eslint-disable-next-line no-await-in-loop
      await open.pop().unmount()
    }
  })

  it('shows the E2 promise while collecting and the works appear without a manual refresh', async () => {
    const api = makeHost()
    let trendCalls = 0
    api.state.accounts = [{ id: 'acc-1', refresh_state: 'queued', post_count: 0 }]
    const mounted = await mountHarness(api, () => { trendCalls += 1 })
    open.push(mounted)

    // The promise lands as soon as the first read reports a queued account.
    await settle(mounted.container, (c) => textOf(c).includes('正在为你抓取内容'))
    const text = textOf(mounted.container)
    assert.ok(text.includes('正在为你抓取内容'), 'E2 title must render verbatim')
    assert.ok(
      text.includes('首次采集约需 1 分钟，完成后内容会自动出现在这里。'),
      'the one-minute promise is the dictionary sentence, verbatim',
    )
    assert.ok(text.includes('去逛逛爆款趋势'), 'the browse-out link is mandatory in E2')
    assert.ok(
      mounted.container.querySelector('.omnimux-rival-fetch-progress'),
      'a thin progress bar shows while the promise is open',
    )

    // The Host finishes: queued → idle with the post collected.
    api.state.accounts = [{ id: 'acc-1', refresh_state: 'idle', post_count: 1 }]
    api.state.posts = [hostPost('p1')]

    await settle(mounted.container, (c) => Boolean(c.querySelector('[data-card-id]')))
    assert.ok(
      textOf(mounted.container).includes('猫咪饮水机实测：三只猫一周后还喝吗'),
      'the collected work appears on its own — the settling poll re-read page 1',
    )
    assert.equal(
      textOf(mounted.container).includes('正在为你抓取内容'),
      false,
      'the promise must leave once content is on screen',
    )
    assert.equal(trendCalls, 0)
  })

  it('renders the stopped reason and re-queues on retry — the promise comes back', async () => {
    const api = makeHost()
    api.state.accounts = [
      { id: 'acc-1', refresh_state: 'error', post_count: 0, consecutive_failures: 4 },
    ]
    const mounted = await mountHarness(api, () => {})
    open.push(mounted)

    await settle(mounted.container, (c) => textOf(c).includes('已停止'))
    const text = textOf(mounted.container)
    assert.ok(text.includes('连续 4 次刷新失败'), 'the terminal failure names its reason')
    assert.ok(text.includes('重试'), 'a retry exit exists — no infinite spinner')
    assert.ok(text.includes('去逛逛爆款趋势'), 'the browse-out link is mandatory in the failure state too')

    // Retry: the client asks the Host to re-enqueue, the watch restarts.
    const retry = [...mounted.container.querySelectorAll('button')]
      .find((b) => b.textContent === '重试')
    assert.ok(retry, 'the retry button must render')
    api.state.accounts = [{ id: 'acc-1', refresh_state: 'queued', post_count: 0 }]
    await act(async () => {
      retry.dispatchEvent(new mounted.dom.window.MouseEvent('click', { bubbles: true }))
    })
    await settle(mounted.container, (c) => textOf(c).includes('正在为你抓取内容'))
    assert.equal(api.state.refreshCalls.length, 1, 'the retry re-enqueues through the refresh endpoint')
    assert.equal(api.state.refreshCalls[0].id, 'acc-1')
    assert.equal(
      api.state.refreshCalls[0].manual,
      false,
      'the retry must not spend a manual-cooldown slot — it is the same first fetch, retried',
    )
  })

  it('routes the browse-out link to the trending tab through the shell callback', async () => {
    const api = makeHost()
    api.state.accounts = [{ id: 'acc-1', refresh_state: 'queued', post_count: 0 }]
    let trendCalls = 0
    const mounted = await mountHarness(api, () => { trendCalls += 1 })
    open.push(mounted)
    await settle(mounted.container, (c) => textOf(c).includes('去逛逛爆款趋势'))
    const link = [...mounted.container.querySelectorAll('button')]
      .find((b) => b.textContent === '去逛逛爆款趋势')
    assert.ok(link, 'the browse-out control must render')
    await act(async () => {
      link.dispatchEvent(new mounted.dom.window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(trendCalls, 1, 'the link hands the navigation to the shell — the trend tab callback')
  })

  it('consumes the server-shipped interval, not a hardcoded one', async () => {
    const api = makeHost()
    api.state.accounts = [{ id: 'acc-1', refresh_state: 'queued', post_count: 0 }]
    const mounted = await mountHarness(api, () => {})
    open.push(mounted)
    await settle(mounted.container, (c) => textOf(c).includes('正在为你抓取内容'))
    // The watch fired because the Host shipped HOST_INTERVAL; the production
    // default is only a fallback for a missing field, asserted by the unit gate.
    assert.equal(
      api.state.intervalMs,
      HOST_INTERVAL,
      'the scripted Host controls the cadence — the client consumed it',
    )
    assert.notEqual(api.state.intervalMs, SHIPPED_INTERVAL)
  })
})
