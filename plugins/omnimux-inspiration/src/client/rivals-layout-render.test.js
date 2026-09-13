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
 * Layout gate for the four inspiration tabs.
 *
 * The reported defect: 对标账号 rendered *instead of* the page shell. Selecting
 * the tab replaced the whole view — no 「导入灵感」 button, no tab bar — and the
 * workbench's own row (「导入对标账号」/「全部刷新」/「只看潜力帖」 plus its account
 * search and platform filter) sat where the page header had been, which made one
 * same-level tab read as a separate sub-page.
 *
 * This gate mounts the real `InspirationStage` (esbuild bundle + jsdom, the
 * `dsh-ui-kit` leaf components replaced by `test-fixtures/ui-kit-shim.mjs`) and
 * drives the real tab bar. The stage, not just the section, is the mount point on
 * purpose: the title and the subtitle live in the stage's `PageHeader`, and "the
 * shell is still the shell" has to be asserted over the whole shell.
 *
 * It asserts what the fix promises:
 *
 *   - on every tab, the heading, the「导入灵感」button, a four-item tab bar and a
 *     filter row are on screen;
 *   - the shell is not remounted by a tab switch (the same DOM nodes survive a
 *     trip to 对标账号 and back);
 *   - the content tabs keep the library's own filters, the platform gate
 *     included, while 对标账号 swaps the row to the account filters and drops the
 *     library-only second row;
 *   - the workbench's three former header buttons are inside the content area,
 *     never siblings of the shell.
 *
 * Reverting the fix is measurable: restoring the `if (tab === 'rivals') return …`
 * early return in `InspirationSection.jsx` fails every shell assertion below
 * (verified by temporarily adding it back).
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceEntry = join(here, 'InspirationStage.jsx')
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'rivals-layout')

const RIVAL_PREFIX = '/omnimux/inspiration/local/rival-accounts'

/** Requests one mount may make before the gate calls it a loop. */
const REQUEST_BUDGET = 120

const TABS = ['all', 'local', 'public', 'rivals']

/** Labels the gate drives the UI by, taken from the plugin's own table. */
const L = {
  title: zh['title'],
  subtitle: zh['subtitle'],
  importBtn: zh['add.btn'],
  rivalImportBtn: zh['rivalAccounts.import.btn'],
  rivalSearch: zh['rivalAccounts.import.searchPlaceholder'],
  librarySearch: zh['filter.search'],
  platform: zh['filter.platform'],
  type: zh['filter.type'],
  sort: zh['filter.sort'],
  country: zh['filter.country'],
  refreshAll: zh['rivalAccounts.refresh.all'],
  potentialFilter: zh['rivalAccounts.potential.filter'],
}

let bundleCounter = 0

/**
 * Bundle the stage with the UI-kit shim in place of `dsh-ui-kit`.
 * @returns {Promise<string>} absolute path of the bundled ESM file
 */
async function bundleStage() {
  mkdirSync(cacheDir, { recursive: true })
  const outFile = join(cacheDir, `rivals-layout-${bundleCounter}.mjs`)
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
 * Mount the stage against a scripted Host.
 *
 * A fresh bundle path per mount gives every case its own module registry, which
 * matters because the feed keeps an SWR cache at module scope.
 * @param {{ platforms?: string[], accounts?: Array<object> }} [options]
 */
async function mountStage(options = {}) {
  const platforms = options.platforms ?? ['tiktok']
  const accounts = options.accounts ?? [{ id: 'acc-1', handle: '@li9292', platform: 'tiktok', refresh_state: 'idle' }]
  const stageModule = await import(`${await bundleStage()}?mount=${bundleCounter}`)

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
  globalThis.fetch = async (url, fetchOptions = {}) => {
    const path = String(url)
    const method = fetchOptions?.method ?? 'GET'
    calls.push({ path, method })
    // A gate that fails loudly beats a gate that spins.
    if (calls.length > REQUEST_BUDGET) {
      throw new Error(`request storm: ${calls.length} calls, last ${method} ${path}`)
    }
    // The rival paths are a prefix extension of the library path, so they are
    // matched first.
    if (path.includes(`${RIVAL_PREFIX}/status`)) {
      return jsonResponse(200, { success: true, data: { paused: { global: false, reason: null } } })
    }
    if (path.includes(RIVAL_PREFIX) && /\/posts(\?|$)/.test(path)) {
      return jsonResponse(200, { success: true, data: { items: [], total: 0, carry_over: 0 } })
    }
    if (path.includes(RIVAL_PREFIX)) {
      return jsonResponse(200, { success: true, data: { items: accounts, total: accounts.length } })
    }
    if (path.startsWith('/omnimux/inspiration/local')) {
      const items = [{ id: 'item-1', title: 'item 1', source_platform: platforms[0], is_local: true }]
      return jsonResponse(200, {
        success: true,
        data: { items, total: items.length, platforms: platforms.map((name) => ({ name, count: 1 })) },
      })
    }
    return jsonResponse(200, { success: true, data: { items: [], total: 0 } })
  }

  const container = dom.window.document.getElementById('host')
  const reactRoot = createRoot(container)
  const t = (key) => zh[key] || key

  await act(async () => {
    reactRoot.render(React.createElement(stageModule.InspirationStage, { t, visible: true }))
  })
  await settle(container, () => container.querySelector('[data-tab="all"]'))

  return {
    container,
    calls,
    /** Requests whose path matches `fragment`, in order. */
    requestsTo(fragment) {
      return calls.filter((call) => call.path.includes(fragment))
    },
    /** Switch tabs through the real tab bar and wait for the switch to render. */
    async openTab(tabId) {
      const button = container.querySelector(`[data-tab="${tabId}"]`)
      assert.ok(button, `the tab bar must render a ${tabId} tab`)
      await act(async () => {
        button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      await settle(container, () => container.querySelector(`[data-tab="${tabId}"]`)?.getAttribute('aria-pressed') === 'true')
      // Reported as one condition with one message: whether the tab became
      // active and whether the tab bar survived it are the same question here,
      // and the defect this gate guards against fails both at once.
      assert.equal(
        container.querySelector(`[data-tab="${tabId}"]`)?.getAttribute('aria-pressed'),
        'true',
        `selecting the ${tabId} tab must activate it and leave the tab bar on screen`,
      )
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

const heading = (container) => container.querySelector('h1')
const hasText = (container, selector, text) => [...container.querySelectorAll(selector)]
  .some((node) => node.textContent.trim() === text)
const buttonsLabelled = (container, label) => [...container.querySelectorAll('button')]
  .filter((node) => node.textContent.trim() === label)
const tabButtons = (container) => [...container.querySelectorAll('[data-tab]')]
const searchInput = (container) => container.querySelector('input[type="search"]')
const platformTriggers = (container) => [...container.querySelectorAll(`[aria-haspopup="listbox"][aria-label="${L.platform}"]`)]
const subfilterRow = (container) => container.querySelector('.omnimux-inspiration-subfilter-row')
const rivalRoot = (container) => container.querySelector('.omnimux-rival-root')
const grid = (container) => container.querySelector('.omnimux-inspiration-grid')
const importButton = (container) => buttonsLabelled(container, L.importBtn)[0] || null

/**
 * Everything the shell owns, whatever tab is selected.
 * @param {HTMLElement} container
 * @param {string} tabId
 */
function assertShellOnScreen(container, tabId) {
  const where = `[${tabId}]`
  assert.equal(
    heading(container)?.textContent,
    L.title,
    `${where} the page title must stay on screen`,
  )
  assert.ok(
    hasText(container, 'p', L.subtitle),
    `${where} the page subtitle must stay on screen`,
  )
  assert.ok(
    importButton(container),
    `${where} the 导入灵感 button must stay on screen`,
  )
  assert.deepEqual(
    tabButtons(container).map((node) => node.getAttribute('data-tab')),
    TABS,
    `${where} the four tabs must stay on screen, as siblings, in order`,
  )
  assert.ok(
    searchInput(container),
    `${where} the filter row must stay on screen`,
  )
  assert.ok(
    container.querySelector('[aria-haspopup="listbox"]'),
    `${where} the filter row must keep a dropdown`,
  )

  // Requirement 3: none of the shell's own nodes may be owned by the workbench.
  for (const [name, node] of [
    ['the title', heading(container)],
    ['the 导入灵感 button', importButton(container)],
    ['the tab bar', tabButtons(container)[0]],
    ['the filter row', searchInput(container)],
  ]) {
    assert.equal(
      node.closest('.omnimux-rival-root'),
      null,
      `${where} ${name} must belong to the shell, not to the 对标账号 workbench`,
    )
  }
}

after(() => {
  rmSync(cacheDir, { recursive: true, force: true })
})

describe('inspiration tabs — shared shell', () => {
  it('keeps the shell on screen on every tab, 对标账号 included', async () => {
    const mounted = await mountStage({ platforms: ['tiktok', 'x'] })
    try {
      for (const tabId of TABS) {
        await mounted.openTab(tabId)
        assertShellOnScreen(mounted.container, tabId)
      }

      // The workbench is swapped into the content area, not over the shell.
      assert.ok(rivalRoot(mounted.container), '[rivals] the workbench must render in the content area')
      assert.equal(grid(mounted.container), null, '[rivals] the library grid must not render behind the workbench')
      assert.ok(
        rivalRoot(mounted.container).contains(buttonsLabelled(mounted.container, L.refreshAll)[0]),
        '[rivals] 全部刷新 must sit inside the workbench content area',
      )
      assert.ok(
        rivalRoot(mounted.container).contains(buttonsLabelled(mounted.container, L.potentialFilter)[0]),
        '[rivals] 只看潜力帖 must sit inside the workbench content area',
      )
      assert.equal(
        buttonsLabelled(mounted.container, L.rivalImportBtn).length,
        0,
        '[rivals] a populated account list must not keep a second import button at the top of the page',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('does not remount the shell when leaving and returning to 对标账号', async () => {
    const mounted = await mountStage({ platforms: ['tiktok', 'x'] })
    try {
      const before = {
        heading: heading(mounted.container),
        importButton: importButton(mounted.container),
        tabBar: tabButtons(mounted.container)[0].parentElement,
        tabButtons: tabButtons(mounted.container),
      }

      await mounted.openTab('rivals')
      assert.ok(rivalRoot(mounted.container), '[rivals] the workbench must be on screen')
      // Every tab switch in between still shows the shell's own nodes.
      assertShellOnScreen(mounted.container, 'rivals')

      await mounted.openTab('all')
      assertShellOnScreen(mounted.container, 'all')

      assert.equal(heading(mounted.container), before.heading, 'the heading DOM node must survive a tab switch')
      assert.equal(importButton(mounted.container), before.importButton, 'the 导入灵感 node must survive a tab switch')
      assert.equal(
        tabButtons(mounted.container)[0].parentElement,
        before.tabBar,
        'the tab bar DOM node must survive a tab switch',
      )
      assert.deepEqual(
        tabButtons(mounted.container),
        before.tabButtons,
        'the four tab nodes must be the same nodes after a round trip',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})

describe('inspiration tabs — filter row follows the tab', () => {
  it('keeps the library filters on the content tabs, platform gate included', async () => {
    const gated = await mountStage({ platforms: ['tiktok'] })
    try {
      for (const tabId of ['all', 'local', 'public']) {
        await gated.openTab(tabId)
        assert.equal(
          searchInput(gated.container)?.getAttribute('aria-label'),
          L.librarySearch,
          `[${tabId}] the library search must stay the row's search box`,
        )
        for (const label of [L.type, L.sort]) {
          assert.ok(
            gated.container.querySelector(`[aria-label="${label}"]`),
            `[${tabId}] the library filter ${label} must stay on the row`,
          )
        }
        assert.ok(subfilterRow(gated.container), `[${tabId}] the library second filter row must stay`)
        assert.equal(
          platformTriggers(gated.container).length,
          0,
          `[${tabId}] a single known platform must not produce a platform dropdown`,
        )
      }
    } finally {
      await gated.unmount()
      gated.close()
    }

    const open = await mountStage({ platforms: ['tiktok', 'x'] })
    try {
      await open.openTab('public')
      assert.equal(
        platformTriggers(open.container).length,
        1,
        '[public] two known platforms must produce exactly one platform dropdown',
      )
    } finally {
      await open.unmount()
      open.close()
    }
  })

  it('swaps the row to the account filters on 对标账号', async () => {
    const mounted = await mountStage({ platforms: ['tiktok', 'x'] })
    try {
      await mounted.openTab('rivals')

      assert.equal(
        searchInput(mounted.container)?.getAttribute('aria-label'),
        L.rivalSearch,
        '[rivals] the row search box must be the account search',
      )
      assert.equal(
        subfilterRow(mounted.container),
        null,
        '[rivals] the library-only second filter row must not be shown over accounts',
      )
      assert.equal(
        mounted.container.querySelector(`[aria-label="${L.type}"]`),
        null,
        '[rivals] the library content filters must not be shown over accounts',
      )
      assert.ok(
        mounted.requestsTo(RIVAL_PREFIX).length > 0,
        '[rivals] the row must be driving the account list',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('opens the account platforms from the shell row and queries the account list with them', async () => {
    const mounted = await mountStage({ platforms: ['tiktok', 'x'] })
    try {
      await mounted.openTab('rivals')

      const [trigger] = platformTriggers(mounted.container)
      assert.ok(trigger, '[rivals] the row must render the platform dropdown for accounts')
      await act(async () => {
        trigger.dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      const options = [...mounted.container.querySelectorAll('[role="option"]')]
      const labels = options.map((node) => node.textContent)
      for (const label of [zh['platform.tiktok'], zh['platform.instagram'], zh['platform.all']]) {
        assert.ok(
          labels.includes(label),
          `[rivals] the account platform dropdown must offer ${label} (got ${JSON.stringify(labels)})`,
        )
      }

      const before = mounted.requestsTo(RIVAL_PREFIX).length
      const tiktok = options.find((node) => node.textContent === zh['platform.tiktok'])
      await act(async () => {
        tiktok.dispatchEvent(new mounted.container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      await settle(mounted.container, () => mounted.requestsTo(RIVAL_PREFIX).length > before)

      const filtered = mounted.requestsTo(RIVAL_PREFIX).filter((call) => call.path.includes('platform=tiktok'))
      assert.ok(
        filtered.length > 0,
        `[rivals] picking a platform in the shell row must reach the account query (got ${JSON.stringify(mounted.requestsTo(RIVAL_PREFIX).map((call) => call.path))})`,
      )
      // The shell itself is untouched by a filter change.
      assertShellOnScreen(mounted.container, 'rivals')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})
