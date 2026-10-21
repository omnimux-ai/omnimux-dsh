import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { DOM_RENDER_LOADERS } from './test-fixtures/dom-render-build.mjs'
import { JSDOM } from 'jsdom'
import { zh } from './locales.js'
import { analysisInputFingerprint } from '../analysis-input.js'
import { IMPORT_POLL_INTERVAL_MS } from './import-status.js'
import { LANDED_PIN_MS } from './import-landing.js'

/**
 * A document has to exist before react-dom is evaluated.
 *
 * `react-dom` snapshots its "is there a DOM" answer in module scope and, when it
 * says no, replaces its `onChange` support with the branch meant for browsers
 * without an `input` event (IE9). In that branch a dispatched `input` event never
 * reaches a handler at all — clicks work, typing silently does nothing, and this
 * gate would then be testing a dialog that can never be submitted.
 */
const bootstrap = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost:3000' })
globalThis.window = bootstrap.window
globalThis.document = bootstrap.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')

/**
 * Landing gate for「导入灵感」.
 *
 * The reported defect: pasting an account profile URL (https://x.com/li9292) and
 * confirming opened a preview modal for a row nobody had asked to look at, whose
 * content — a degraded bare link — was the leftover of sending an account URL
 * through the content importer.
 *
 * This gate mounts the real `InspirationSection` (esbuild bundle + jsdom, the
 * `dsh-ui-kit` leaf components replaced by `test-fixtures/ui-kit-shim.mjs`) against
 * a scripted HTTP stub and drives the real dialog. It asserts what the fix
 * promises:
 *
 *   - an account URL is classified, echoed, imported as an account, never sent to
 *     the content importer, and lands on the 对标账号 tab with no preview modal;
 *   - a content URL is imported as content, lands on a tab that can show the new
 *     card, keeps that card visible, and opens no preview modal;
 *   - a link the Host cannot place is refused with a reason and no request.
 *
 * Reverting the fix is measurable: restoring `setSelectedItem(newItem)` in
 * `handleImportSuccess` makes the "no preview" assertions fail (verified by
 * temporarily adding it back).
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceEntry = join(here, 'InspirationSection.jsx')
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'landing')

const IMPORT_URL_PATH = '/omnimux/inspiration/local/import-url'
const RIVAL_PREFIX = '/omnimux/inspiration/local/rival-accounts'

const PREVIEW_MODAL_SELECTOR = '.omnimux-inspiration-modal-backdrop'

/** Requests one mount may make before the gate calls it a loop (see `fetch` stub). */
const REQUEST_BUDGET = 60

let bundleCounter = 0

/** Locale labels the gate drives the UI by, taken from the plugin's own table. */
const L = {
  importBtn: zh['add.btn'],
  submit: zh['add.submit'],
  urlLabel: zh['add.urlLabel'],
  tabLocal: zh['tab.local'],
  tabPublic: zh['tab.public'],
  tabRivals: zh['tab.rivals'],
  echoAccount: (handle, platform) => zh['rivalAccounts.import.echoAccount']
    .replace('{handle}', handle)
    .replace('{platform}', platform),
  importSuccess: (handle) => zh['rivalAccounts.import.success'].replace('{handle}', handle),
  echoContent: zh['add.echoContent'],
  importedToast: zh['add.importedToast'],
  unrecognized: zh['rivalAccounts.import.unrecognized'],
  autoAnalyze: zh['add.autoAnalyze'],
}

/**
 * Bundle the section with the UI-kit shim in place of `dsh-ui-kit`.
 * @returns {Promise<string>} absolute path of the bundled ESM file
 */
async function bundleSection() {
  mkdirSync(cacheDir, { recursive: true })
  const outFile = join(cacheDir, `landing-${bundleCounter}.mjs`)
  bundleCounter += 1
  const result = await esbuild.build({
    loader: DOM_RENDER_LOADERS,
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
  if (!code) throw new Error('esbuild produced no bundle for InspirationSection.jsx')
  writeFileSync(outFile, code)
  return outFile
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

/**
 * Route one request the way the Host would.
 *
 * Order matters: the rival-accounts paths are a prefix extension of the local
 * library path, so they are matched first.
 * @param {{ classify?: object, accountImport?: object, contentImport?: object,
 *   localItems?: Array<object>, accounts?: Array<object>, localItemGet?: (id: string) => object, paginateLocalItems?: boolean }} routes
 */
function createHost(routes) {
  const state = {
    localItems: routes.localItems ?? [],
    accounts: routes.accounts ?? [],
  }
  const handle = ({ path, method, body }) => {
    if (path.includes(`${RIVAL_PREFIX}/classify`)) {
      return routes.classify ?? jsonResponse(200, { success: true, data: { kind: 'content', platform: 'x' } })
    }
    if (path.includes(`${RIVAL_PREFIX}/posts`)) {
      // One collected work, so landing on the tab is visible as a timeline row
      // rather than inferred from an empty state.
      return jsonResponse(200, {
        success: true,
        data: {
          items: [{
            id: 'post_1',
            row_id: 'acc-1:post_1',
            account_id: 'acc-1',
            title: 'probe work',
            text: 'probe work',
            url: 'https://x.com/li9292/status/1',
            type: 'image',
            posted_at: '2026-09-12T08:00:00.000Z',
            stats: { views: 10, likes: 1, comments: 0, shares: 0 },
            account: { id: 'acc-1', nickname: 'li9292', handle: '@li9292', platform: 'x' },
          }],
          total: 1,
          page: 1,
          page_size: 20,
          has_more: false,
        },
      })
    }
    if (path.includes(RIVAL_PREFIX) && method === 'POST') {
      return routes.accountImport ?? jsonResponse(201, { success: true, data: { id: 'acc-1', handle: '@li9292' } })
    }
    if (path.includes(`${RIVAL_PREFIX}/status`)) {
      return jsonResponse(200, { success: true, data: { paused: { global: false, reason: null } } })
    }
    if (path.includes(RIVAL_PREFIX)) {
      return jsonResponse(200, { success: true, data: { items: state.accounts, total: state.accounts.length } })
    }
    if (path.includes(IMPORT_URL_PATH)) {
      return routes.contentImport ?? jsonResponse(202, { success: true, data: { id: 'local-new-1', title: 'imported' } })
    }
    if (path.startsWith('/omnimux/inspiration/local/')) {
      const id = decodeURIComponent(path.slice('/omnimux/inspiration/local/'.length).split('?')[0])
      if (typeof routes.localItemGet === 'function') return routes.localItemGet(id, { method, body })
      const item = state.localItems.find((row) => String(row.id) === id) || null
      return jsonResponse(200, { success: true, data: item })
    }
    if (path.startsWith('/omnimux/inspiration/local')) {
      const query = new URL(path, 'http://localhost').searchParams
      const page = Number(query.get('page') || 1)
      const size = Number(query.get('page_size') || 20)
      const items = routes.paginateLocalItems ? state.localItems.slice((page - 1) * size, page * size) : state.localItems
      return jsonResponse(200, {
        success: true,
        data: { items, total: state.localItems.length, platforms: [] },
      })
    }
    return jsonResponse(200, { success: true, data: { items: [], total: 0 } })
  }
  return { state, handle }
}

/**
 * Mount the section against the scripted Host and wait for the first paint.
 * @param {ReturnType<typeof createHost>} host
 */
async function mountSection(host, options = {}) {
  const sectionModule = await import(`${await bundleSection()}?mount=${bundleCounter}`)

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
    pretendToBeVisual: true,
  })
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousFetch = globalThis.fetch
  const previousIntersectionObserver = globalThis.IntersectionObserver
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
  const previousSetTimeout = globalThis.setTimeout
  const previousClearTimeout = globalThis.clearTimeout
  const pollTimers = new Map()
  if (options.manualPollClock) {
    globalThis.setTimeout = (fn, ms, ...args) => {
      if (ms !== IMPORT_POLL_INTERVAL_MS && ms !== LANDED_PIN_MS) return previousSetTimeout(fn, ms, ...args)
      const token = {}
      pollTimers.set(token, { callback: () => fn(...args), delay: ms })
      return token
    }
    globalThis.clearTimeout = (token) => {
      if (pollTimers.has(token)) pollTimers.delete(token)
      else previousClearTimeout(token)
    }
  }

  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // The deferred page-load path waits for the host auth bridge; without it only
  // the first effect runs and the second load is never attempted.
  dom.window.__omnimuxAuth = { ensureLogin() {} }
  const observers = []
  globalThis.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this) }
    observe() {}
    unobserve() {}
    disconnect() { this.disconnected = true }
  }

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url)
    const method = options?.method ?? 'GET'
    const body = typeof options?.body === 'string' ? JSON.parse(options.body) : undefined
    calls.push({ path, method, body })
    // A gate that fails loudly beats a gate that spins. A regression that puts a
    // component into a fetch/render loop turns the assertion below into a hang,
    // and a hang hides the reason; the budget is far above what a passing case
    // needs, so it only ever fires on a loop.
    if (calls.length > REQUEST_BUDGET) {
      throw new Error(`request storm: ${calls.length} calls, last ${method} ${path}`)
    }
    return host.handle({ path, method, body })
  }

  const container = dom.window.document.getElementById('host')
  const reactRoot = createRoot(container)
  const t = (key) => zh[key] || key

  await React.act(async () => {
    reactRoot.render(React.createElement(sectionModule.InspirationSection, { t, active: true }))
  })
  await settle(container, () => container.querySelector(`[data-tab="public"]`))

  return {
    container,
    calls,
    /** Requests whose path matches `fragment`, in order. */
    requestsTo(fragment) {
      return calls.filter((call) => call.path.includes(fragment))
    },
    async advancePoll() {
      const due = [...pollTimers.entries()].filter(([, timer]) => timer.delay === IMPORT_POLL_INTERVAL_MS)
      assert.ok(due.length, 'the visible background import must keep a completion poll scheduled')
      await React.act(async () => {
        for (const [token, timer] of due) {
          pollTimers.delete(token)
          timer.callback()
        }
      })
    },
    async loadMore() {
      const observer = [...observers].reverse().find((entry) => !entry.disconnected)
      assert.ok(observer, 'the next page must remain available after refresh')
      await React.act(async () => { observer.callback([{ isIntersecting: true }]) })
    },
    async expirePin() {
      const due = [...pollTimers.entries()].filter(([, timer]) => timer.delay === LANDED_PIN_MS)
      assert.equal(due.length, 1, 'the temporary landing pin must still have a bounded expiry')
      await React.act(async () => {
        for (const [token, timer] of due) {
          pollTimers.delete(token)
          timer.callback()
        }
      })
    },
    async unmount() {
      await React.act(async () => reactRoot.unmount())
      globalThis.setTimeout = previousSetTimeout
      globalThis.clearTimeout = previousClearTimeout
      pollTimers.clear()
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
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
  return false
}

/** The single button whose trimmed text equals `label`. */
function button(container, label) {
  const matches = [...container.querySelectorAll('button')]
    .filter((node) => node.textContent.trim() === label)
  assert.equal(matches.length > 0, true, `no button labelled ${label} (rendered: ${[...container.querySelectorAll('button')].map((n) => n.textContent.trim()).join(' | ')})`)
  return matches[matches.length - 1]
}

/** Type into a React-controlled input the way a user would. */
async function typeInto(input, value) {
  const view = input.ownerDocument.defaultView
  const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value').set
  await React.act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new view.Event('input', { bubbles: true }))
  })
}

/** Move focus away, which is when the dialog asks the Host what the link is. */
async function blur(input) {
  const view = input.ownerDocument.defaultView
  await React.act(async () => {
    input.dispatchEvent(new view.FocusEvent('blur'))
    input.dispatchEvent(new view.FocusEvent('focusout', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function click(node) {
  await React.act(async () => {
    node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** Open the top「导入灵感」dialog and return its URL input. */
async function openImportDialog(mounted) {
  await click(button(mounted.container, L.importBtn))
  const input = mounted.container.querySelector(`input[aria-label="${L.urlLabel}"]`)
  assert.ok(input, 'the import dialog must render its URL field')
  return input
}

/** Paste a URL into the dialog and wait for the verdict to settle. */
async function paste(mounted, url) {
  const input = await openImportDialog(mounted)
  await typeInto(input, url)
  await blur(input)
  return input
}

/** First card rendered by the grid, or null. */
function firstCard(container) {
  return container.querySelector('.omnimux-inspiration-grid > *') || null
}

function cardIds(container) {
  return [...container.querySelectorAll('[data-inspiration-id]')]
    .map((node) => node.getAttribute('data-inspiration-id'))
}

after(() => {
  rmSync(cacheDir, { recursive: true, force: true })
})

describe('import landing — account profile URL', () => {
  it('echoes the account, imports it as an account, and lands on the 账号监控 tab without a preview', async () => {
    const host = createHost({
      classify: jsonResponse(200, {
        success: true,
        data: { kind: 'account', platform: 'x', external_id: 'li9292', handle: '@li9292' },
      }),
      accountImport: jsonResponse(201, {
        success: true,
        data: { id: 'acc-1', handle: '@li9292', platform: 'x', display_name: 'li9292' },
      }),
    })
    // The account filter reloads its own list as soon as the tab mounts, which
    // is how the imported account shows up in the panel we land on.
    host.state.accounts = [{ id: 'acc-1', handle: '@li9292', platform: 'x', display_name: 'li9292', refresh_state: 'idle' }]

    const mounted = await mountSection(host)
    try {
      await paste(mounted, 'https://x.com/li9292')

      const echo = mounted.container.querySelector('.omnimux-inspiration-import-echo')
      assert.ok(echo, 'the dialog must echo what this link is before anything is imported')
      assert.equal(echo.textContent, L.echoAccount('@li9292', zh['platform.x']))
      assert.equal(echo.getAttribute('data-kind'), 'account')

      assert.equal(
        mounted.container.querySelector(`[aria-label="${L.autoAnalyze}"]`),
        null,
        'an account is monitored, not deconstructed: the AI switch has nothing to switch',
      )

      await click(button(mounted.container, L.submit))
      await settle(mounted.container, () => mounted.container.querySelector('.omnimux-rival-root'))

      assert.equal(mounted.requestsTo(IMPORT_URL_PATH).length, 0, 'an account URL must never reach the content importer')
      assert.equal(mounted.requestsTo(`${RIVAL_PREFIX}/classify`).length, 1, 'the verdict is asked once and reused on submit')
      const imports = mounted.calls.filter(
        (call) => call.method === 'POST' && call.path.includes(RIVAL_PREFIX) && !call.path.includes('classify'),
      )
      assert.equal(imports.length, 1, 'exactly one account import')
      assert.equal(imports[0].path, RIVAL_PREFIX)

      // The 账号监控 page is the evidence that the import moved the view: the
      // two-column layout, its account column and the works timeline are all on
      // screen.
      const feed = mounted.container.querySelector('.omnimux-rival-root')
      assert.ok(feed, 'the 账号监控 feed must be on screen')
      const twoColumns = mounted.container.querySelector('.omnimux-rival-layout')
      assert.ok(twoColumns, 'the account import must land on the two-column monitor')
      const timelineReady = await settle(
        mounted.container,
        () => Boolean(twoColumns.querySelector('.omnimux-rival-timeline[data-rival-timeline="true"]')),
      )
      assert.ok(timelineReady, 'the works timeline must be what the account import lands on')
      assert.equal(
        mounted.container.querySelector(`input[aria-label="${L.urlLabel}"]`),
        null,
        'the dialog must close once the account is imported',
      )
      // 导出成功必须留下痕迹：弹窗关掉之后界面上要给一句确认，否则用户看到的
      // 就是「点了导入没反应」。
      assert.ok(
        (mounted.container.textContent || '').includes(L.importSuccess('@li9292')),
        'an account import must confirm itself on the page it lands on',
      )
      const createIndex = mounted.calls.findIndex(
        (call) => call.method === 'POST' && call.path.includes(RIVAL_PREFIX),
      )
      const reloaded = await settle(
        mounted.container,
        () => mounted.calls.some(
          (call, index) => index > createIndex && call.path.includes(`${RIVAL_PREFIX}/posts`),
        ),
      )
      assert.ok(
        reloaded,
        'the works feed must be re-read for the account that was just added',
      )
      // The imported account is already listed in the persistent column — there
      // is no account popover to open first.
      const column = twoColumns.querySelector('.omnimux-rival-accounts')
      assert.ok(column, 'the two-column layout must carry the persistent account column')
      const listed = await settle(
        mounted.container,
        () => Boolean(column.querySelector('[data-account-id="acc-1"]')),
      )
      assert.ok(listed, 'the imported account must be listed in the account column')
      assert.equal(
        mounted.container.querySelector('.omnimux-rival-filter-trigger'),
        null,
        'the retired account filter trigger must not render',
      )
      assert.equal(
        mounted.container.querySelector(PREVIEW_MODAL_SELECTOR),
        null,
        'an account import must not open a preview modal',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})

describe('import landing — content URL', () => {
  it('imports content, follows it to a tab that shows it, and opens no preview', async () => {
    const host = createHost({
      classify: jsonResponse(200, {
        success: true,
        data: { kind: 'content', platform: 'tiktok' },
      }),
      contentImport: jsonResponse(202, {
        success: true,
        data: { id: 'local-new-1', title: '新作品', source_platform: 'tiktok', is_local: true, import_status: 'importing' },
      }),
      localItems: [{ id: 'local-old-1', title: '旧作品', source_platform: 'tiktok', is_local: true }],
    })

    const mounted = await mountSection(host)
    try {
      // Start on the cloud tab: a local row cannot be shown there, so the import
      // has to move the grid.
      await click(mounted.container.querySelector('[data-tab="public"]'))
      await settle(mounted.container, () => mounted.container.querySelector('[data-tab="public"]').getAttribute('aria-pressed') === 'true')

      const input = await openImportDialog(mounted)
      await typeInto(input, 'https://www.tiktok.com/@creator/video/123')
      await blur(input)
      await settle(mounted.container, () => !button(mounted.container, L.submit).disabled)
      await click(button(mounted.container, L.submit))
      await settle(mounted.container, () => firstCard(mounted.container)?.getAttribute('data-inspiration-id') === 'local-new-1')

      assert.equal(mounted.requestsTo(`${RIVAL_PREFIX}/classify`).length, 1, 'analyzes the pasted link and enables submit')
      assert.equal(
        mounted.calls.filter((call) => call.method === 'POST' && call.path.includes(RIVAL_PREFIX) && !call.path.includes('classify')).length,
        0,
        'a content URL must not be imported as an account',
      )
      assert.equal(mounted.requestsTo(IMPORT_URL_PATH).length, 1, 'exactly one content import')

      assert.equal(
        mounted.container.querySelector(`[data-tab="local"]`).getAttribute('aria-pressed'),
        'true',
        'the grid must follow the import to a tab that can show the new row',
      )

      // The reload that the tab switch triggers is answered without the new row:
      // page 1 of a `hot`-sorted list need not contain a row created a second ago.
      // Identical in-flight loads are shared (Issue #2988), so the switch issues
      // one refetch; what matters is that it happened, not how many copies.
      const reloads = mounted.calls.filter((call) => call.path.startsWith('/omnimux/inspiration/local?'))
      assert.ok(reloads.length >= 1, 'the tab switch must have refetched the local list')
      assert.equal(
        cardIds(mounted.container).includes('local-new-1'),
        true,
        'the imported card must survive a reload that does not list it yet',
      )
      assert.equal(
        firstCard(mounted.container)?.getAttribute('data-inspiration-id'),
        'local-new-1',
        'the imported card must be the first card the user sees',
      )
      assert.equal(
        firstCard(mounted.container)?.classList.contains('is-landed'),
        true,
        'the landed card must be highlighted',
      )
      assert.equal(
        mounted.container.querySelector(PREVIEW_MODAL_SELECTOR),
        null,
        'a content import must land on the card, not on a preview modal',
      )

      // 内容导入同样以顶部气泡回执：卡片是「导到了哪」，气泡是「成功了」。
      const pill = mounted.container.querySelector('.omnimux-inspiration-toast')
      assert.ok(pill, 'a content import must confirm itself in the top toast')
      assert.ok(
        (pill.textContent || '').includes(L.importedToast),
        `the toast must say「${L.importedToast}」(got ${JSON.stringify(pill.textContent)})`,
      )
      assert.equal(
        pill.closest('.omnimux-inspiration-grid'),
        null,
        'the confirmation must float above the grid, not sit inside it',
      )

      // Clicking the card still opens the preview: the landing changed, the
      // card's own action did not.
      await click(firstCard(mounted.container))
      assert.ok(mounted.container.querySelector(PREVIEW_MODAL_SELECTOR), 'clicking a card must still open its preview')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('lands on the card for an import the Host answers synchronously', async () => {
    const host = createHost({
      classify: jsonResponse(200, { success: true, data: { kind: 'content', platform: 'tiktok' } }),
      // The non-background answer: the row is already stored when the dialog
      // closes, so the landing has nothing to poll and still must not preview.
      contentImport: jsonResponse(200, {
        success: true,
        data: { id: 'local-new-sync', title: '同步入库', source_platform: 'tiktok', is_local: true, import_status: 'ready' },
      }),
    })

    const mounted = await mountSection(host)
    try {
      await paste(mounted, 'https://www.tiktok.com/@creator/video/999')
      await click(button(mounted.container, L.submit))
      await settle(mounted.container, () => firstCard(mounted.container)?.getAttribute('data-inspiration-id') === 'local-new-sync')

      assert.equal(
        firstCard(mounted.container)?.getAttribute('data-inspiration-id'),
        'local-new-sync',
        'the synchronous import must land on its own card',
      )
      assert.equal(
        mounted.container.querySelector(PREVIEW_MODAL_SELECTOR),
        null,
        'a content import must land on the card, not on a preview modal',
      )
      assert.equal(
        mounted.container.querySelector(`input[aria-label="${L.urlLabel}"]`),
        null,
        'the dialog must close once the row is stored',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('lands the new card on the local library tab', async () => {
    const host = createHost({
      classify: jsonResponse(200, { success: true, data: { kind: 'content', platform: 'tiktok' } }),
      contentImport: jsonResponse(202, {
        success: true,
        data: { id: 'local-new-2', title: '新作品', source_platform: 'tiktok', is_local: true, import_status: 'importing' },
      }),
      localItems: [{ id: 'local-old-1', title: '旧作品', source_platform: 'tiktok', is_local: true }],
    })

    const mounted = await mountSection(host)
    try {
      await paste(mounted, 'https://www.tiktok.com/@creator/video/456')
      const echo = mounted.container.querySelector('.omnimux-inspiration-import-echo')
      assert.equal(echo.textContent, L.echoContent, 'a content link must be echoed as content')

      await click(button(mounted.container, L.submit))
      await settle(mounted.container, () => firstCard(mounted.container)?.getAttribute('data-inspiration-id') === 'local-new-2')

      assert.equal(
        mounted.container.querySelector('[data-tab="local"]').getAttribute('aria-pressed'),
        'true',
        'a content import must land on the local library tab',
      )
      assert.equal(firstCard(mounted.container)?.getAttribute('data-inspiration-id'), 'local-new-2')
      assert.equal(mounted.container.querySelector(PREVIEW_MODAL_SELECTOR), null)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})

describe('import landing — link the Host cannot place', () => {
  it('refuses a kind the Host reports as unknown, with a reason and no request', async () => {
    const host = createHost({
      classify: jsonResponse(200, { success: true, data: { kind: 'unknown', platform: 'facebook' } }),
    })
    const mounted = await mountSection(host)
    try {
      await paste(mounted, 'https://www.facebook.com/some.page')
      await click(button(mounted.container, L.submit))
      await settle(mounted.container, () => mounted.container.querySelector('.omnimux-inspiration-error-text'))

      const error = mounted.container.querySelector('.omnimux-inspiration-error-text')
      assert.ok(error, 'the refusal must be explained, not silently dropped')
      assert.equal(error.textContent, L.unrecognized)
      assert.equal(mounted.requestsTo(IMPORT_URL_PATH).length, 0, 'an unplaceable link must not be imported as content')
      assert.equal(
        mounted.calls.filter((call) => call.method === 'POST' && call.path.includes(RIVAL_PREFIX) && !call.path.includes('classify')).length,
        0,
        'an unplaceable link must not be imported as an account',
      )
      assert.equal(mounted.container.querySelector(PREVIEW_MODAL_SELECTOR), null)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('turns the Host refusal (400 unrecognized-url) into the same localized reason', async () => {
    const host = createHost({
      classify: jsonResponse(400, { code: 'unrecognized-url', error: '无法识别的链接，请输入社媒主页或内容链接' }),
    })
    const mounted = await mountSection(host)
    try {
      await paste(mounted, 'https://www.threads.net/@someone')
      assert.equal(
        mounted.container.querySelector('.omnimux-inspiration-import-echo'),
        null,
        'a refusal is not an echo',
      )
      await settle(mounted.container, () => mounted.container.querySelector('.omnimux-inspiration-error-text'))

      assert.equal(
        mounted.container.querySelector('.omnimux-inspiration-error-text').textContent,
        L.unrecognized,
        'the message must come from the locale table, not from the Host payload',
      )
      assert.equal(mounted.requestsTo(IMPORT_URL_PATH).length, 0)
      assert.equal(mounted.requestsTo(`${RIVAL_PREFIX}/classify`).length, 1, 'analyzes once on blur and remains disabled on refusal')
      assert.equal(button(mounted.container, L.submit).disabled, true, 'submit must remain disabled when url is unrecognized')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})

describe('import landing — unchanged behaviour', () => {
  it('still hides the platform filter while a single platform is known', async () => {
    const host = createHost({
      localItems: [{ id: 'local-1', title: 'one', source_platform: 'tiktok', is_local: true }],
    })
    const mounted = await mountSection(host)
    try {
      assert.equal(
        mounted.container.querySelectorAll(`[aria-haspopup="listbox"][aria-label="${zh['filter.platform']}"]`).length,
        0,
        'the platform gate must keep a single-platform feed free of the dropdown',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('settles a pinned import absent from an empty feed into a selectable four-image card without opening detail', async () => {
    const id = 'local-new-gallery'
    const placeholder = {
      id, title: 'https://x.com/a/status/789', source_platform: 'x', type: 'video',
      import_status: 'importing', import_stage: 'resolving',
    }
    const images = Array.from({ length: 4 }, (_, index) => `https://images.example/${index + 1}.jpg`)
    const completed = {
      ...placeholder, type: 'image', content_shape: 'gallery', import_status: 'ready',
      title: '完成后的图文', content: '完成后的推文正文与四张图片', media_urls: [], media_items: images.map((url) => ({ type: 'image', url })), cover_url: images[0],
    }
    const host = createHost({
      contentImport: jsonResponse(202, { success: true, data: placeholder }),
      localItems: [],
      localItemGet: () => jsonResponse(200, { success: true, data: completed }),
    })
    const mounted = await mountSection(host, { manualPollClock: true })
    try {
      await click(mounted.container.querySelector('[data-tab="local"]'))
      await paste(mounted, placeholder.title)
      await click(button(mounted.container, L.submit))
      await settle(mounted.container, () => cardIds(mounted.container).includes(id))
      const importing = mounted.container.querySelector(`[data-inspiration-id="${id}"]`)
      assert.ok(importing.querySelector('.wf-organic-shimmer'))
      assert.ok(importing.querySelector('.omnimux-inspiration-card-check'), 'the actual 202 row has no is_local; its local API origin must still make it selectable')
      assert.equal(mounted.container.querySelector(PREVIEW_MODAL_SELECTOR), null)

      await mounted.advancePoll()
      const card = mounted.container.querySelector(`[data-inspiration-id="${id}"]`)
      assert.equal(card?.getAttribute('data-card-type'), 'text-media')
      assert.equal(card.querySelector('.omnimux-rival-card-title')?.textContent, completed.content)
      assert.equal(card.querySelector('.omnimux-inspiration-cover-img')?.getAttribute('src'), images[0])
      assert.equal(card.querySelector('.omnimux-inspiration-badge-duration'), null, 'corner badges moved into the hover layer')
      assert.equal(card.querySelector('.wf-organic-shimmer'), null, 'the visible pin must receive the completed row even when no list contains its ID')
      assert.equal(mounted.requestsTo(`/omnimux/inspiration/local/${id}`).length, 1)
      assert.equal(mounted.container.querySelector(PREVIEW_MODAL_SELECTOR), null, 'completion must not open detail')
      await click(card.querySelector('.omnimux-inspiration-card-check'))
      assert.ok(mounted.container.querySelector('.omnimux-inspiration-selection-bar'))
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('refreshes the unfiltered library so a completed import survives its bounded pin expiry', async () => {
    const id = 'persistent-gallery'
    const placeholder = { id, title: 'https://x.com/a/status/794', source_platform: 'x', type: 'video', import_status: 'importing' }
    const images = Array.from({ length: 4 }, (_, index) => `https://images.example/saved-${index + 1}.jpg`)
    const completed = { ...placeholder, title: '已保存图文', content: '完成后仍留在灵感库', type: 'image', content_shape: 'gallery', media_urls: [], media_items: images.map((url) => ({ type: 'image', url })), import_status: 'ready' }
    const host = createHost({
      localItems: [], contentImport: jsonResponse(202, { success: true, data: placeholder }),
      localItemGet: () => {
        host.state.localItems = [completed]
        return jsonResponse(200, { success: true, data: completed })
      },
    })
    const originalHandle = host.handle
    host.handle = (call) => {
      if (call.path === IMPORT_URL_PATH && call.method === 'POST') host.state.localItems = [placeholder]
      return originalHandle(call)
    }
    const mounted = await mountSection(host, { manualPollClock: true })
    try {
      await click(mounted.container.querySelector('[data-tab="local"]'))
      const localLoadsBefore = mounted.calls.filter((call) => call.path.startsWith('/omnimux/inspiration/local?')).length
      await paste(mounted, placeholder.title)
      await click(button(mounted.container, L.submit))
      await settle(mounted.container, () => cardIds(mounted.container).includes(id))
      const loadsAfterImport = mounted.calls.filter((call) => call.path.startsWith('/omnimux/inspiration/local?')).length
      assert.ok(loadsAfterImport > localLoadsBefore, 'importing while already on the local tab must refresh its list')
      await mounted.advancePoll()
      assert.ok(mounted.calls.filter((call) => call.path.startsWith('/omnimux/inspiration/local?')).length > loadsAfterImport, 'completion must refresh beyond the cached importing list')
      await mounted.expirePin()
      const card = mounted.container.querySelector(`[data-inspiration-id="${id}"]`)
      assert.ok(card, 'the backend-listed completed item must remain after the reveal pin expires')
      assert.equal(card.querySelector('.omnimux-rival-card-title')?.textContent, completed.content)
      assert.equal(card.querySelector('.omnimux-inspiration-badge-duration'), null, 'corner badges moved into the hover layer')
      assert.equal(card.querySelector('.wf-organic-shimmer'), null)
      await click(card.querySelector('.omnimux-inspiration-card-check'))
      assert.ok(mounted.container.querySelector('.omnimux-inspiration-selection-bar'))
      assert.equal(mounted.container.querySelector(PREVIEW_MODAL_SELECTOR), null)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('refreshes both loaded pages after completion and keeps the next request on page three', async () => {
    const id = 'paged-import'
    const placeholder = { id, title: 'https://x.com/a/status/795', source_platform: 'x', type: 'link', import_status: 'importing' }
    const completed = { ...placeholder, title: '已完成的新文字', content: '分页完成后的正文', import_status: 'ready' }
    const oldRows = Array.from({ length: 45 }, (_, index) => ({ id: `paged-old-${index + 1}`, title: `原有作品${index + 1}`, type: 'link', source_platform: 'x' }))
    const host = createHost({
      localItems: oldRows, paginateLocalItems: true,
      contentImport: jsonResponse(202, { success: true, data: placeholder }),
      localItemGet: () => {
        host.state.localItems = [completed, ...oldRows]
        return jsonResponse(200, { success: true, data: completed })
      },
    })
    const originalHandle = host.handle
    let holdSecondPage = null
    host.handle = async (call) => {
      if (call.path === IMPORT_URL_PATH && call.method === 'POST') host.state.localItems = [placeholder, ...oldRows]
      if (holdSecondPage && call.path.startsWith('/omnimux/inspiration/local?') && new URL(call.path, 'http://localhost').searchParams.get('page') === '2') await holdSecondPage
      return originalHandle(call)
    }
    const mounted = await mountSection(host, { manualPollClock: true })
    try {
      await click(mounted.container.querySelector('[data-tab="local"]'))
      await mounted.loadMore()
      assert.equal(cardIds(mounted.container).length, 40)
      assert.ok(cardIds(mounted.container).includes('paged-old-39'))
      await paste(mounted, placeholder.title)
      await click(button(mounted.container, L.submit))
      await settle(mounted.container, () => cardIds(mounted.container).includes(id))
      assert.equal(cardIds(mounted.container).length, 40, 'the original local-tab refresh must preserve the loaded depth')

      let releaseSecondPage
      holdSecondPage = new Promise((resolve) => { releaseSecondPage = resolve })
      const listStart = mounted.calls.length
      await mounted.advancePoll()
      assert.equal(cardIds(mounted.container).length, 40, 'a partly refreshed range must not shrink the visible masonry to page one')
      assert.ok(cardIds(mounted.container).includes('paged-old-39'), 'page-two content must remain while its replacement is loading')
      await React.act(async () => { releaseSecondPage(); holdSecondPage = null })
      await settle(mounted.container, () => mounted.container.querySelector(`[data-inspiration-id="${id}"] .omnimux-rival-card-title`)?.textContent === completed.content)
      assert.deepEqual(mounted.calls.slice(listStart).filter((call) => call.path.startsWith('/omnimux/inspiration/local?')).map((call) => new URL(call.path, 'http://localhost').searchParams.get('page')), ['1', '2'])
      await mounted.expirePin()
      assert.equal(cardIds(mounted.container).length, 40)
      assert.ok(cardIds(mounted.container).includes('paged-old-39'))
      assert.ok(cardIds(mounted.container).includes(id), 'the completed item must be held by the refreshed real list')
      await mounted.loadMore()
      assert.equal(new URL(mounted.calls.filter((call) => call.path.startsWith('/omnimux/inspiration/local?')).at(-1).path, 'http://localhost').searchParams.get('page'), '3')
      assert.equal(cardIds(mounted.container).length, 46, 'loading the third page must append its six remaining entries exactly once')
      assert.ok(cardIds(mounted.container).includes('paged-old-45'))
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('continues polling a filtered-out pin through pending updates without inserting it into the filtered list', async () => {
    const id = 'filtered-import'
    const placeholder = { id, title: 'https://x.com/a/status/790', source_platform: 'x', type: 'video', import_status: 'importing', import_stage: 'resolving' }
    const completed = { ...placeholder, type: 'image', import_status: 'ready', content: '最终正文', media_urls: [], media_items: [{ type: 'image', url: 'https://images.example/final.jpg' }] }
    let polls = 0
    const host = createHost({
      localItems: [{ id: 'matching-row', title: '当前筛选匹配的旧行', source_platform: 'x', type: 'video' }],
      contentImport: jsonResponse(202, { success: true, data: placeholder }),
      localItemGet: () => {
        polls += 1
        return jsonResponse(200, { success: true, data: polls < 3 ? { ...placeholder, import_stage: polls === 1 ? 'downloading' : 'analyzing' } : completed })
      },
    })
    const mounted = await mountSection(host, { manualPollClock: true })
    try {
      await click(mounted.container.querySelector('[data-tab="local"]'))
      await paste(mounted, placeholder.title)
      await click(button(mounted.container, L.submit))
      await settle(mounted.container, () => cardIds(mounted.container).includes(id))
      const loadsAfterImport = mounted.calls.filter((call) => call.path.startsWith('/omnimux/inspiration/local?')).length
      await mounted.advancePoll()
      assert.equal(mounted.calls.filter((call) => call.path.startsWith('/omnimux/inspiration/local?')).length, loadsAfterImport, 'pending progress must not reload the list')
      assert.ok(mounted.container.querySelector(`[data-inspiration-id="${id}"]`).textContent.includes(zh['add.status.downloading']))

      await click(mounted.container.querySelector(`[aria-label="${zh['filter.type']}"]`))
      await click([...mounted.container.querySelectorAll('[role="option"]')].find((node) => node.textContent === zh['type.video']))
      await settle(mounted.container, () => mounted.calls.some((call) => call.path.includes('/local?') && call.path.includes('type=video')))
      const loadsAfterFilter = mounted.calls.filter((call) => call.path.startsWith('/omnimux/inspiration/local?')).length
      await mounted.advancePoll()
      assert.equal(polls, 2, 'a list reload missing the pin must not remove it from the polling set')
      assert.equal(mounted.calls.filter((call) => call.path.startsWith('/omnimux/inspiration/local?')).length, loadsAfterFilter)
      await mounted.advancePoll()
      assert.equal(polls, 3)
      assert.equal(mounted.container.querySelector(`[data-inspiration-id="${id}"] .omnimux-rival-card-title`)?.textContent, '最终正文')
      assert.equal(mounted.container.querySelector(PREVIEW_MODAL_SELECTOR), null)

      await mounted.expirePin()
      assert.deepEqual(cardIds(mounted.container), ['matching-row'], 'the completed image must disappear after its reveal pin expires while the active filter still requires videos')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('delivers failed completion to the pin and an already-open matching detail', async () => {
    const id = 'failed-import'
    const placeholder = { id, title: 'https://x.com/a/status/792', source_platform: 'x', type: 'link', import_status: 'importing' }
    let response = jsonResponse(200, { success: true, data: placeholder })
    const host = createHost({
      localItems: [], contentImport: jsonResponse(202, { success: true, data: placeholder }),
      localItemGet: () => response,
    })
    const mounted = await mountSection(host, { manualPollClock: true })
    try {
      await click(mounted.container.querySelector('[data-tab="local"]'))
      await paste(mounted, placeholder.title)
      await click(button(mounted.container, L.submit))
      await settle(mounted.container, () => cardIds(mounted.container).includes(id))
      await click(mounted.container.querySelector(`[data-inspiration-id="${id}"]`))
      const reason = '解析图片失败，请重试'
      response = jsonResponse(200, { success: true, data: { ...placeholder, import_status: 'failed', import_error: reason } })
      await mounted.advancePoll()
      const pinned = mounted.container.querySelector(`[data-inspiration-id="${id}"]`)
      const failureIcon = pinned?.querySelector('.omnimux-inspiration-card-failure')
      assert.ok(failureIcon, 'the failed pin keeps a collapse icon')
      assert.ok(failureIcon.getAttribute('title').includes(reason), 'the reason stays reachable from the icon')
      assert.ok(mounted.container.querySelector(`${PREVIEW_MODAL_SELECTOR} [role="alert"]`)?.textContent.includes(reason), 'only the already-open matching detail should receive the failed row')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('keeps a detail update on the pinned card even when the current list has no matching row', async () => {
    const id = 'updated-pin'
    const row = { id, title: '原始视频标题', source_platform: 'tiktok', source_url: 'https://www.tiktok.com/@creator/video/793', type: 'video', import_status: 'ready', media_urls: ['/omnimux/inspiration/local/media/videos/v_ab12.mp4'] }
    const target = { scope: 'post', directions: ['content', 'expression', 'creative'] }
    const updated = { ...row, title: '详情更新后的标题', analysis_results: { post: { ...target, input_fingerprint: analysisInputFingerprint(row, target), status: 'done', source: 'live', model: 'test-model', result: { summary: '已完成' }, error: null } } }
    const host = createHost({
      localItems: [], contentImport: jsonResponse(200, { success: true, data: row }),
      localItemGet: (key, request) => {
        if (key.endsWith('/analyze')) {
          assert.equal(request.method, 'POST')
          assert.deepEqual(request.body, target)
          return jsonResponse(200, { success: true, data: updated, analysis_key: 'post' })
        }
        return jsonResponse(200, { success: true, data: row })
      },
    })
    const mounted = await mountSection(host)
    try {
      await click(mounted.container.querySelector('[data-tab="local"]'))
      await paste(mounted, 'https://www.tiktok.com/@creator/video/793')
      await click(button(mounted.container, L.submit))
      await settle(mounted.container, () => cardIds(mounted.container).includes(id))
      await click(mounted.container.querySelector(`[data-inspiration-id="${id}"]`))
      await click(button(mounted.container, zh['post.analyzeTarget']))
      assert.ok(await settle(mounted.container, () => mounted.container.querySelector(`[data-inspiration-id="${id}"] .omnimux-rival-card-title`)?.textContent === updated.title))
      const close = mounted.container.querySelector(`${PREVIEW_MODAL_SELECTOR} [aria-label="${zh.close}"]`)
      await click(close)
      assert.equal(mounted.container.querySelector(PREVIEW_MODAL_SELECTOR), null)
      assert.equal(mounted.container.querySelector(`[data-inspiration-id="${id}"] .omnimux-rival-card-title`)?.textContent, updated.title, 'closing detail must not reveal the original stale pin')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('removes a vanished pinned import and its already-open matching detail after a 404', async () => {
    const id = 'removed-import'
    const placeholder = { id, title: 'https://x.com/a/status/791', source_platform: 'x', type: 'link', import_status: 'importing' }
    let response = jsonResponse(200, { success: true, data: placeholder })
    const host = createHost({
      localItems: [], contentImport: jsonResponse(202, { success: true, data: placeholder }),
      localItemGet: () => response,
    })
    const mounted = await mountSection(host, { manualPollClock: true })
    try {
      await click(mounted.container.querySelector('[data-tab="local"]'))
      await paste(mounted, placeholder.title)
      await click(button(mounted.container, L.submit))
      await settle(mounted.container, () => cardIds(mounted.container).includes(id))
      await click(mounted.container.querySelector(`[data-inspiration-id="${id}"]`))
      assert.ok(mounted.container.querySelector(PREVIEW_MODAL_SELECTOR), 'this detail is explicitly opened by the user')
      response = jsonResponse(404, { error: 'not-found' })
      await mounted.advancePoll()
      assert.equal(mounted.container.querySelector(`[data-inspiration-id="${id}"]`), null)
      assert.equal(mounted.container.querySelector(PREVIEW_MODAL_SELECTOR), null, 'a removed pin must not leave a stale open detail')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})
