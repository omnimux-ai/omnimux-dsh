import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { zh } from './locales.js'

/**
 * Render gate for the 账号监控 feed — the account filter and the works grid.
 *
 * What the tab promises, and what this file pins down:
 *
 *   - the account dimension is a 32px multi-select filter in the shared toolbar
 *     row, and its panel lists every monitored account with its avatar, handle,
 *     platform glyph and work count;
 *   - checking an account narrows the works grid immediately, 反选 inverts and
 *     重置 restores the default — the three rules `rival-filter.js` owns,
 *     observed through the real components;
 *   - the ↗ button opens the creator's profile without touching the selection;
 *   - the works render as the library's own 9:16 cards, with 详情 / 立即复刻 as
 *     their hover actions, and 详情 opens a detail dialog that knows it is not a
 *     library item.
 *
 * Mounted the same way `rivals-layout-render.test.js` mounts: the real
 * `InspirationStage` bundled by esbuild, in jsdom, with `dsh-ui-kit`'s leaf
 * components replaced by `test-fixtures/ui-kit-shim.mjs`.
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceEntry = join(here, 'InspirationStage.jsx')
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'account-monitor-feed')

const RIVAL_PREFIX = '/omnimux/inspiration/local/rival-accounts'

/** Requests one mount may make before the gate calls it a loop. */
const REQUEST_BUDGET = 120

const ACCOUNTS = [
  {
    id: 'ra_alice',
    nickname: 'Alice Studio',
    handle: '@alice',
    platform: 'tiktok',
    profile_url: 'https://www.tiktok.com/@alice',
    refresh_state: 'idle',
    post_count: 2,
  },
  {
    id: 'ra_bob',
    nickname: 'Bob Films',
    handle: '@bob',
    platform: 'x',
    profile_url: 'https://x.com/bob',
    refresh_state: 'idle',
    post_count: 1,
  },
]

const WORK_ALICE = {
  id: 'post_1',
  row_id: 'ra_alice:post_1',
  account_id: 'ra_alice',
  title: 'Alice 的第一条作品',
  url: 'https://www.tiktok.com/@alice/video/1',
  type: 'video',
  duration: 31,
  posted_at: '2026-09-12T08:00:00.000Z',
  stats: { views: 1200, likes: 30, comments: 4, shares: 1 },
  cover_src: '/omnimux/inspiration/local/media/rival-accounts/covers/rival-1.jpg',
  account: {
    id: 'ra_alice',
    nickname: 'Alice Studio',
    handle: '@alice',
    platform: 'tiktok',
    profile_url: 'https://www.tiktok.com/@alice',
    post_count: 2,
  },
}

const WORK_BOB = {
  id: 'post_2',
  row_id: 'ra_bob:post_2',
  account_id: 'ra_bob',
  title: 'Bob 的第一条作品',
  url: 'https://x.com/bob/status/2',
  type: 'video',
  duration: 12,
  posted_at: '2026-09-11T08:00:00.000Z',
  stats: { views: 900, likes: 10, comments: 1, shares: 0 },
  cover_src: '/omnimux/inspiration/local/media/rival-accounts/covers/rival-2.jpg',
  account: {
    id: 'ra_bob',
    nickname: 'Bob Films',
    handle: '@bob',
    platform: 'x',
    profile_url: 'https://x.com/bob',
    post_count: 1,
  },
}

const WORKS = [WORK_ALICE, WORK_BOB]

/** Labels the gate drives the UI by, taken from the plugin's own table. */
const L = {
  tab: zh['tab.rivals'],
  filterTrigger: zh['rivalFilter.trigger'],
  filterTitle: zh['rivalFilter.title'],
  invert: zh['rivalFilter.invert'],
  reset: zh['rivalFilter.reset'],
  some: zh['rivalFilter.some'],
  none: zh['rivalFilter.none'],
  posts: zh['rivalFilter.posts'],
  openProfile: zh['rivalFilter.openProfile'],
  summary: zh['rivalFeed.summary'],
  count: zh['rivalFeed.count'],
  detail: zh['card.cta.detail'],
  replicate: zh['card.cta.try'],
  importBtn: zh['rivalAccounts.import.btn'],
  searchPlaceholder: zh['rivalAccounts.import.searchPlaceholder'],
}

const label = (key, values = {}) => Object.entries(values)
  .reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), key)

let bundleCounter = 0

/**
 * Bundle the stage with the UI-kit shim in place of `dsh-ui-kit`.
 * @returns {Promise<string>} absolute path of the bundled ESM file
 */
async function bundleStage() {
  mkdirSync(cacheDir, { recursive: true })
  const outFile = join(cacheDir, `account-monitor-${bundleCounter}.mjs`)
  bundleCounter += 1
  const result = await esbuild.build({
    absWorkingDir: join(here, '..', '..'),
    entryPoints: [sourceEntry],
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
  if (!code) throw new Error('esbuild produced no bundle for InspirationStage.jsx')
  writeFileSync(outFile, code)
  return outFile
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

/**
 * Mount the stage against a scripted Host whose works are known.
 *
 * A fresh bundle path per mount gives every case its own module registry, which
 * matters because the feed keeps an SWR cache at module scope.
 * @param {{ accounts?: Array<object>, works?: Array<object> }} [options]
 */
async function mountStage(options = {}) {
  const accounts = options.accounts ?? ACCOUNTS
  const works = options.works ?? WORKS
  const stageModule = await import(`${await bundleStage()}?mount=${bundleCounter}`)

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
  })
  const { window } = dom
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousFetch = globalThis.fetch
  const previousIntersectionObserver = globalThis.IntersectionObserver
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT

  globalThis.window = window
  globalThis.document = window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // The deferred page-load path waits for the host auth bridge; without it only
  // the first effect runs and the second load is never attempted.
  window.__omnimuxAuth = { ensureLogin() {} }
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  /** Profiles the gate opened, in order. */
  const opened = []
  window.open = (url) => {
    opened.push(String(url))
    return null
  }

  const calls = []
  globalThis.fetch = async (url, fetchOptions = {}) => {
    const path = String(url)
    const method = fetchOptions?.method ?? 'GET'
    calls.push({ path, method })
    // A gate that fails loudly beats a gate that spins.
    if (calls.length > REQUEST_BUDGET) {
      throw new Error(`request storm: ${calls.length} calls, last ${method} ${path}`)
    }
    // The aggregate feed is a sibling of the per-account routes, not a child,
    // so it is matched before the account-collection fallback.
    if (path.includes(`${RIVAL_PREFIX}/posts`)) {
      const query = new URL(path, 'http://localhost').searchParams
      const requested = (query.get('accounts') || '').split(',').filter(Boolean)
      const keyword = (query.get('q') || '').toLowerCase()
      let items = requested.length > 0
        ? works.filter((row) => requested.includes(row.account_id))
        : works
      if (keyword) {
        items = items.filter((row) => JSON.stringify(row).toLowerCase().includes(keyword))
      }
      return jsonResponse(200, {
        success: true,
        data: {
          items,
          total: items.length,
          page: 1,
          page_size: 20,
          has_more: false,
          requested_accounts: requested.length > 0 ? requested : accounts.map((row) => row.id),
        },
      })
    }
    if (path.includes(RIVAL_PREFIX)) {
      return jsonResponse(200, { success: true, data: { items: accounts, total: accounts.length } })
    }
    if (path.startsWith('/omnimux/inspiration/local')) {
      return jsonResponse(200, { success: true, data: { items: [], total: 0, platforms: [] } })
    }
    return jsonResponse(200, { success: true, data: { items: [], total: 0 } })
  }

  const container = window.document.getElementById('host')
  const reactRoot = createRoot(container)
  const t = (key) => zh[key] || key

  await act(async () => {
    reactRoot.render(React.createElement(stageModule.InspirationStage, { t, visible: true }))
  })
  await settle(container, () => container.querySelector('[data-tab="rivals"]'))

  return {
    container,
    calls,
    document: window.document,
    opened,
    /** Click a node and let the resulting data flow settle. */
    async click(node) {
      assert.ok(node, 'the node to click must exist')
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    },
    /** Switch to the 账号监控 tab and wait for its content to render. */
    async openAccountTab() {
      const button = container.querySelector('[data-tab="rivals"]')
      assert.ok(button, 'the tab bar must render the 账号监控 tab')
      await act(async () => {
        button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      await settle(container, () => button.getAttribute('aria-pressed') === 'true')
      assert.equal(button.getAttribute('aria-pressed'), 'true', 'the 账号监控 tab must activate')
    },
    async unmount() {
      await act(async () => reactRoot.unmount())
      globalThis.window = previousWindow
      globalThis.document = previousDocument
      globalThis.fetch = previousFetch
      globalThis.IntersectionObserver = previousIntersectionObserver
      globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
    },
    close() {
      dom.window.close()
    },
  }
}

/** Pump the microtask/effect queue until `predicate` holds or the budget runs out. */
async function settle(container, predicate) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (predicate()) return true
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
  return false
}

const filterTrigger = (container) => container.querySelector('.omnimux-rival-filter-trigger')
const filterPanel = (container) => container.querySelector('.omnimux-rival-filter-panel')
const filterRows = (container) => [...container.querySelectorAll('.omnimux-rival-filter-row')]
const cards = (container) => [...container.querySelectorAll('[data-inspiration-id]')]
const rowById = (container, id) => filterRows(container).find((node) => node.getAttribute('data-account-id') === id)
const buttonsLabelled = (container, text) => [...container.querySelectorAll('button')]
  .filter((node) => node.textContent.trim() === text)
const summaryCount = (container) => container.querySelector('.omnimux-rival-summary-count')?.textContent.trim()
const triggerText = (container) => filterTrigger(container)?.textContent.trim() || ''

/** Rival feed paths requested so far, in order. */
const feedRequests = (mounted) => mounted.calls
  .filter((call) => call.path.includes(`${RIVAL_PREFIX}/posts`))
  .map((call) => new URL(call.path, 'http://localhost').searchParams)
  .map((params) => params.get('accounts'))

after(() => {
  rmSync(cacheDir, { recursive: true, force: true })
})

describe('账号监控 — 账号筛选（多选）', () => {
  it('renders a 32px-class trigger reading 账号: 全部 (N)', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      const trigger = filterTrigger(mounted.container)
      assert.ok(trigger, 'the toolbar must render the account filter')
      assert.ok(
        triggerText(mounted.container).includes(label(zh['rivalFilter.all'], { n: ACCOUNTS.length })),
        `the trigger must read「账号: 全部 (2)」(got ${JSON.stringify(triggerText(mounted.container))})`,
      )
      assert.equal(trigger.getAttribute('aria-expanded'), 'false', 'the panel starts closed')
      assert.equal(filterPanel(mounted.container), null, 'the panel must not be rendered while closed')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('lists every account with avatar, handle, platform glyph and work count', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await mounted.click(filterTrigger(mounted.container))
      await settle(mounted.container, () => filterRows(mounted.container).length > 0)

      const panel = filterPanel(mounted.container)
      assert.ok(panel, 'clicking the trigger must open the panel')
      assert.ok(panel.textContent.includes(L.filterTitle), 'the panel must carry its title')
      assert.ok(
        panel.textContent.includes(L.invert) && panel.textContent.includes(L.reset),
        'the panel header must offer 反选 and 重置',
      )

      const rows = filterRows(mounted.container)
      assert.equal(rows.length, ACCOUNTS.length, 'every monitored account must have a row')
      for (const account of ACCOUNTS) {
        const row = rowById(mounted.container, account.id)
        assert.ok(row, `the panel must list ${account.id}`)
        assert.ok(row.textContent.includes(account.nickname), `the row must show ${account.nickname}`)
        assert.ok(row.textContent.includes(account.handle), `the row must show ${account.handle}`)
        assert.ok(
          row.textContent.includes(label(L.posts, { n: account.post_count })),
          `the row must show the account's work count (${account.post_count})`,
        )
        assert.equal(row.getAttribute('role'), 'checkbox', 'a row is a checkbox to assistive tech')
        assert.ok(row.querySelector('svg'), 'the row must draw a platform glyph')
      }
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('filters the works when an account is unchecked, then inverts and resets', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => cards(mounted.container).length === WORKS.length)
      assert.equal(cards(mounted.container).length, WORKS.length, 'both accounts\' works start on screen')

      await mounted.click(filterTrigger(mounted.container))
      const aliceRow = rowById(mounted.container, 'ra_alice')
      assert.ok(aliceRow, 'the panel must list ra_alice')

      // Unchecking the first account is a subset: 全部 minus Alice.
      await mounted.click(aliceRow)
      await settle(mounted.container, () => cards(mounted.container).length === 1)
      assert.ok(
        triggerText(mounted.container).includes(label(L.some, { k: 1 })),
        `unchecking one account must read「已选 1 个账号」(got ${JSON.stringify(triggerText(mounted.container))})`,
      )
      assert.equal(
        cards(mounted.container)[0].getAttribute('data-inspiration-id'),
        WORK_BOB.row_id,
        'only the remaining account\'s works may stay on screen',
      )
      assert.ok(
        feedRequests(mounted).includes('ra_bob'),
        `the request must carry the remaining account (got ${JSON.stringify(feedRequests(mounted))})`,
      )

      // 反选 from that subset selects the complement: Alice again.
      await mounted.click(buttonsLabelled(mounted.container, L.invert)[0])
      await settle(mounted.container, () => cards(mounted.container).length === 1)
      assert.equal(
        cards(mounted.container)[0].getAttribute('data-inspiration-id'),
        WORK_ALICE.row_id,
        '反选 must leave the complement on screen',
      )

      // 重置 goes back to the default: every account, every work.
      await mounted.click(buttonsLabelled(mounted.container, L.reset)[0])
      await settle(mounted.container, () => cards(mounted.container).length === WORKS.length)
      assert.ok(
        triggerText(mounted.container).includes(label(zh['rivalFilter.all'], { n: ACCOUNTS.length })),
        '重置 must restore「账号: 全部 (N)」',
      )
      assert.equal(cards(mounted.container).length, WORKS.length, '重置 must restore the whole grid')

      // 反选 from 全部 is the empty set — the one state that only exists on this
      // path, and the trigger has a wording of its own for it.
      await mounted.click(buttonsLabelled(mounted.container, L.invert)[0])
      await settle(mounted.container, () => triggerText(mounted.container).includes(L.none))
      assert.ok(
        triggerText(mounted.container).includes(L.none),
        `inverting 全部 must read「${L.none}」(got ${JSON.stringify(triggerText(mounted.container))})`,
      )
      assert.equal(cards(mounted.container).length, 0, 'an empty selection shows no works')
      // The wire cannot express「nothing」— an omitted `accounts` means every
      // account — so the honest empty state is what the user sees, with a way
      // out of it.
      const emptyText = mounted.container.textContent || ''
      assert.ok(emptyText.includes(zh['rivalFeed.empty.filtered']), 'an empty selection must say why the grid is empty')
      assert.ok(
        buttonsLabelled(mounted.container, L.reset).length > 0,
        'an empty selection must offer a way back',
      )

      // And back out of it with 重置.
      await mounted.click(buttonsLabelled(mounted.container, L.reset)[0])
      await settle(mounted.container, () => cards(mounted.container).length === WORKS.length)
      assert.equal(cards(mounted.container).length, WORKS.length, '重置 must leave the empty state behind')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('opens a creator profile from the row without touching the selection', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await mounted.click(filterTrigger(mounted.container))
      const before = feedRequests(mounted).length

      const jump = rowById(mounted.container, 'ra_alice')
        ?.querySelector(`[aria-label="${L.openProfile}"]`)
      assert.ok(jump, 'the row must carry a profile button')
      await mounted.click(jump)
      await settle(mounted.container, () => mounted.opened.length > 0)

      assert.deepEqual(mounted.opened, [ACCOUNTS[0].profile_url], 'the profile must open in a new tab')
      assert.ok(
        triggerText(mounted.container).includes(label(zh['rivalFilter.all'], { n: ACCOUNTS.length })),
        'opening a profile must not change the selection',
      )
      assert.equal(
        feedRequests(mounted).length,
        before,
        'opening a profile must not refetch the works',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('closes the panel on Escape', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await mounted.click(filterTrigger(mounted.container))
      assert.ok(filterPanel(mounted.container), 'the panel must be open')

      await act(async () => {
        mounted.document.dispatchEvent(new mounted.document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      assert.equal(filterPanel(mounted.container), null, 'Escape must close the panel')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})

describe('账号监控 — 作品网格流', () => {
  it('renders the works as the library 9:16 grid with 详情 / 立即复刻', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => cards(mounted.container).length === WORKS.length)

      const gridNode = mounted.container.querySelector('.omnimux-inspiration-grid')
      assert.ok(gridNode, 'the works must render in the shared grid container')
      assert.ok(
        gridNode.querySelector('[data-inspiration-id]'),
        'the works must be inside that grid, not beside it',
      )
      assert.equal(cards(mounted.container).length, WORKS.length, 'one card per work')
      for (const card of cards(mounted.container)) {
        assert.ok(card.textContent.includes(L.detail), 'the hover CTA must read 详情')
        assert.ok(card.textContent.includes(L.replicate), 'the hover CTA must read 立即复刻')
        assert.ok(
          card.querySelector('.omnimux-inspiration-overlay-play'),
          'the hover overlay must carry the centred play control',
        )
      }

      // The line above the grid says what is being browsed and how much of it.
      assert.ok(
        (mounted.container.textContent || '').includes(L.summary),
        'the summary line must explain what is being browsed',
      )
      assert.equal(
        summaryCount(mounted.container),
        label(L.count, { n: WORKS.length }),
        'the summary line must carry the work count',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('opens a detail dialog that reads as a work, not as a library item', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => cards(mounted.container).length === WORKS.length)

      const detail = buttonsLabelled(mounted.container, L.detail)[0]
      assert.ok(detail, 'a card must offer 详情')
      await mounted.click(detail)
      await settle(mounted.container, () => (mounted.container.textContent || '').includes(zh['rivalFeed.detail.title']))

      const text = mounted.container.textContent || ''
      assert.ok(text.includes(zh['rivalFeed.detail.title']), 'the dialog must title itself')
      assert.ok(text.includes(WORK_ALICE.title), 'the dialog must show the work title')
      assert.ok(text.includes('@alice'), 'the dialog must name the creator')
      assert.ok(
        text.includes(zh['rivalFeed.detail.original']),
        'the dialog must offer the original post',
      )
      // A monitored work is not a library entry: none of the library-only
      // actions may appear in its dialog. Scoped to the dialog — the page around
      // it legitimately offers other actions.
      const dialog = mounted.container.querySelector('[role="dialog"]')
      assert.ok(dialog, 'the detail dialog must render as a dialog')
      for (const libraryOnly of [zh['card.cta.addToConversation'], zh['rivalAccounts.post.toInspiration']]) {
        assert.equal(
          (dialog.textContent || '').includes(libraryOnly),
          false,
          `the detail dialog must not offer the library action「${libraryOnly}」`,
        )
      }
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('shows the library shimmer skeleton while the first request is in flight', async () => {
    const mounted = await mountStage({ works: [] })
    try {
      // No await before the assertion: the first paint is the state under test.
      const button = mounted.container.querySelector('[data-tab="rivals"]')
      await act(async () => {
        button.dispatchEvent(new mounted.document.defaultView.MouseEvent('click', { bubbles: true }))
      })
      const skeleton = mounted.container.querySelector('[data-rival-skeleton="true"]')
      const claimed = (mounted.container.textContent || '').includes(zh['rivalFeed.empty.noPosts'])
      assert.ok(
        skeleton || claimed,
        'the tab must either shimmer or report the settled empty state, never nothing',
      )
      assert.equal(
        skeleton !== null && claimed,
        false,
        'a skeleton and a settled empty state must not be on screen together',
      )
      if (skeleton) {
        assert.equal(
          skeleton.querySelectorAll('.omnimux-inspiration-skel').length,
          10,
          'the skeleton must be the library\'s own 10-block shimmer',
        )
      }
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('offers the import action, not a filter reset, when no account is monitored', async () => {
    const mounted = await mountStage({ accounts: [], works: [] })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => (mounted.container.textContent || '').includes(zh['rivalFeed.empty.noAccounts']))
      const text = mounted.container.textContent || ''
      assert.ok(text.includes(zh['rivalFeed.empty.noAccounts']), 'the no-account empty state must explain itself')
      assert.ok(
        buttonsLabelled(mounted.container, L.importBtn).length > 0,
        'the no-account empty state must offer the import dialog',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})
