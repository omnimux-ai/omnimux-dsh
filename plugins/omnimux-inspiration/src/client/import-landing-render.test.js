import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { JSDOM } from 'jsdom'
import { zh } from './locales.js'

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
  echoContent: zh['add.echoContent'],
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
 *   localItems?: Array<object>, accounts?: Array<object> }} routes
 */
function createHost(routes) {
  const state = {
    localItems: routes.localItems ?? [],
    accounts: routes.accounts ?? [],
  }
  const handle = ({ path, method }) => {
    if (path.includes(`${RIVAL_PREFIX}/classify`)) {
      return routes.classify ?? jsonResponse(200, { success: true, data: { kind: 'content', platform: 'x' } })
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
      const item = state.localItems.find((row) => String(row.id) === id) || null
      return jsonResponse(200, { success: true, data: item })
    }
    if (path.startsWith('/omnimux/inspiration/local')) {
      return jsonResponse(200, {
        success: true,
        data: { items: state.localItems, total: state.localItems.length, platforms: [] },
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
async function mountSection(host) {
  const sectionModule = await import(`${await bundleSection()}?mount=${bundleCounter}`)

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
  })
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousFetch = globalThis.fetch
  const previousIntersectionObserver = globalThis.IntersectionObserver
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT

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
  await settle(container, () => container.querySelector(`[data-tab="all"]`))

  return {
    container,
    calls,
    /** Requests whose path matches `fragment`, in order. */
    requestsTo(fragment) {
      return calls.filter((call) => call.path.includes(fragment))
    },
    async unmount() {
      await React.act(async () => reactRoot.unmount())
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
  it('echoes the account, imports it as an account, and lands on the rival tab without a preview', async () => {
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
    // The panel reloads its own list as soon as it mounts, which is how the new
    // account card shows up on the tab we land on.
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

      // The 对标账号 tab renders its workbench instead of the grid, so the panel
      // on screen *is* the evidence that the import moved the view there.
      assert.ok(mounted.container.querySelector('.omnimux-rival-root'), 'the 对标账号 workbench must be on screen')
      assert.equal(
        mounted.container.querySelector('.omnimux-inspiration-grid'),
        null,
        'the inspiration grid must not be the view an account import lands on',
      )
      assert.equal(
        mounted.container.querySelector(`input[aria-label="${L.urlLabel}"]`),
        null,
        'the dialog must close once the account is imported',
      )
      assert.ok(
        mounted.container.querySelector('[data-account-id="acc-1"]'),
        'the imported account must be in the left column',
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
      await click(button(mounted.container, L.submit))
      await settle(mounted.container, () => firstCard(mounted.container)?.getAttribute('data-inspiration-id') === 'local-new-1')

      assert.equal(mounted.requestsTo(`${RIVAL_PREFIX}/classify`).length, 1, 'submit classifies the pasted link itself')
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
      const reloads = mounted.calls.filter((call) => call.path.startsWith('/omnimux/inspiration/local?'))
      assert.ok(reloads.length >= 2, 'the tab switch must have refetched the local list')
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

  it('keeps the all tab and shows the new card there', async () => {
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
        mounted.container.querySelector('[data-tab="all"]').getAttribute('aria-pressed'),
        'true',
        'the all tab already lists local rows and must be kept',
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
      await click(button(mounted.container, L.submit))
      await settle(mounted.container, () => mounted.container.querySelector('.omnimux-inspiration-error-text'))

      assert.equal(
        mounted.container.querySelector('.omnimux-inspiration-error-text').textContent,
        L.unrecognized,
        'the message must come from the locale table, not from the Host payload',
      )
      assert.equal(mounted.requestsTo(IMPORT_URL_PATH).length, 0)
      assert.equal(mounted.requestsTo(`${RIVAL_PREFIX}/classify`).length, 2, 'blur and submit each ask once')
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

  it('still polls a background import and patches the card when it settles', async () => {
    const importingRow = {
      id: 'local-new-3',
      title: '新作品',
      source_platform: 'tiktok',
      is_local: true,
      import_status: 'importing',
      import_stage: 'resolving',
    }
    const host = createHost({
      classify: jsonResponse(200, { success: true, data: { kind: 'content', platform: 'tiktok' } }),
      contentImport: jsonResponse(202, { success: true, data: importingRow }),
      // The row exists in the library, so the completion poll answers with it
      // rather than reporting the row gone.
      localItems: [importingRow],
    })

    const mounted = await mountSection(host)
    try {
      await paste(mounted, 'https://www.tiktok.com/@creator/video/789')
      await click(button(mounted.container, L.submit))
      await settle(mounted.container, () => cardIds(mounted.container).includes('local-new-3'))

      // The row is still importing, so the card must say so rather than look done.
      const card = mounted.container.querySelector('[data-inspiration-id="local-new-3"]')
      assert.ok(card.textContent.includes(zh['add.status.resolving']) || card.textContent.includes(zh['add.status.downloading']), `the importing card must report its stage (got ${card.textContent})`)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})
