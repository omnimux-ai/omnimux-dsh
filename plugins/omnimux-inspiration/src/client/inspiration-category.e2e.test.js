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
 * Render gate for the dynamic category dropdown (Issue #2497).
 *
 * The category dropdown used to render 9 hardcoded e-commerce buckets while
 * the cloud catalogue's `category` field is free text (`digital`,
 * `Health & Wellness`, …) — selecting any of them emptied the grid. This gate
 * bundles the real `InspirationSection.jsx`, mounts it in jsdom against a
 * stubbed Host, and asserts on the rendered DOM that the dropdown now offers
 * the catalogue's own categories, degrades to 全部-only on failure, and stops
 * asking for categories on the 本地 tab. The `dsh-ui-kit` leaves are replaced
 * by `test-fixtures/ui-kit-shim.mjs` (same DOM contract; the kit's lib pulls
 * in `.module.css` that esbuild cannot inline).
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceEntry = join(here, 'InspirationSection.jsx')
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'category-section')

/** aria-label the section puts on the category dropdown (`filter.category`). */
const CATEGORY_LABEL = zh['filter.category']
/** The fixed first option every category dropdown must lead with. */
const ALL_LABEL = zh['category.all']

let bundleCounter = 0

async function bundleSection() {
  mkdirSync(cacheDir, { recursive: true })
  const outFile = join(cacheDir, `category-section-${bundleCounter}.mjs`)
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

/**
 * Mount the section against a stubbed Host.
 * @param {{ categories: { ok: boolean, status?: number, body?: any }, onFetch?: (url: string) => void }} options
 *   categories: the answer `/omnimux/inspiration/categories` returns.
 */
async function mountSection({ categories, onFetch } = {}) {
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
  dom.window.__omnimuxAuth = { ensureLogin() {} }
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  const items = [
    { id: 'item-1', title: 'item 1', source_platform: 'tiktok', is_local: false },
    { id: 'item-2', title: 'item 2', source_platform: 'x', is_local: true },
  ]
  globalThis.fetch = async (url) => {
    const text = String(url)
    onFetch?.(text)
    if (text.includes('/omnimux/inspiration/categories')) {
      return {
        ok: categories?.ok !== false,
        status: categories?.status ?? (categories?.ok === false ? 500 : 200),
        json: async () => categories?.body ?? { data: [] },
      }
    }
    const body = text.includes('/local')
      ? { success: true, data: { items, total: items.length, platforms: [{ name: 'tiktok', count: 1 }] } }
      : { success: true, data: { items, total: items.length } }
    return { ok: true, status: 200, json: async () => body }
  }

  const container = dom.window.document.getElementById('host')
  const reactRoot = createRoot(container)
  const t = (key) => zh[key] || key

  await act(async () => {
    reactRoot.render(React.createElement(sectionModule.InspirationSection, { t, active: true }))
  })
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (container.querySelector(`[aria-label="${CATEGORY_LABEL}"]`)) break
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }

  return {
    document: dom.window.document,
    container,
    /** Wait until `probe()` is truthy (or the budget runs out). */
    async waitFor(probe, budgetMs = 2000) {
      const start = Date.now()
      for (;;) {
        const value = probe()
        if (value) return value
        if (Date.now() - start > budgetMs) return null
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20))
        })
      }
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

/**
 * Open the category dropdown and return its option labels.
 * @param {{ container: HTMLElement, document: Document }} mounted
 */
async function openCategoryOptions(mounted) {
  const trigger = mounted.container.querySelector(`[aria-haspopup="listbox"][aria-label="${CATEGORY_LABEL}"]`)
  assert.ok(trigger, 'the category dropdown trigger must render')
  await act(async () => {
    trigger.dispatchEvent(new mounted.document.defaultView.MouseEvent('click', { bubbles: true }))
  })
  const listbox = trigger.parentElement.querySelector('[role="listbox"]')
  assert.ok(listbox, 'clicking the category trigger must open a listbox')
  return [...listbox.querySelectorAll('[role="option"]')].map((node) => node.textContent)
}

after(() => {
  rmSync(cacheDir, { recursive: true, force: true })
})

describe('InspirationSection render gate — dynamic category dropdown', () => {
  it('offers the catalogue categories the hub aggregated, led by 全部', async () => {
    /** @type {string[]} */
    const fetched = []
    const mounted = await mountSection({
      categories: {
        ok: true,
        body: {
          data: [
            { name: 'digital', count: 1178 },
            { name: 'Health & Wellness', count: 300 },
          ],
        },
      },
      onFetch: (url) => fetched.push(url),
    })
    try {
      // Wait for the aggregate answer to land before opening: the menu renders
      // the options live, so the list must already carry them.
      await mounted.waitFor(() => fetched.some((url) => url.includes('/categories')))
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
      const labels = await openCategoryOptions(mounted)
      assert.equal(labels[0], ALL_LABEL, 'the first option must be exactly 全部')
      assert.ok(labels.includes('digital'), `expected digital in ${JSON.stringify(labels)}`)
      assert.ok(labels.includes('Health & Wellness'), `expected Health & Wellness in ${JSON.stringify(labels)}`)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('degrades to the 全部-only set when the aggregate request fails', async () => {
    const mounted = await mountSection({ categories: { ok: false, status: 500 } })
    try {
      const labels = await openCategoryOptions(mounted)
      assert.deepEqual(labels, [ALL_LABEL], 'a failed aggregate must leave exactly the 全部 option')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('stops requesting categories on the 本地 tab', async () => {
    /** @type {string[]} */
    const fetched = []
    const mounted = await mountSection({
      categories: { ok: true, body: { data: [{ name: 'digital', count: 1 }] } },
      onFetch: (url) => fetched.push(url),
    })
    try {
      // The default 全部 tab legitimately asked once on mount; the gate is that
      // switching to 本地 does not ask again.
      const before = fetched.filter((url) => url.includes('/categories')).length
      const localTab = mounted.container.querySelector('[data-tab="local"]')
      assert.ok(localTab, 'the 本地 tab must render')
      await act(async () => {
        localTab.dispatchEvent(new mounted.document.defaultView.MouseEvent('click', { bubbles: true }))
      })
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
      })
      const after = fetched.filter((url) => url.includes('/categories')).length
      assert.equal(after, before, 'the 本地 tab must not request the category aggregate')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})
