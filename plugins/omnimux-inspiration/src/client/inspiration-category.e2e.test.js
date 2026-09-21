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
import { OFFICIAL_CATEGORIES } from '../gxgen-category-map.js'

/**
 * Browser-shaped render gate for the official 18-industry dropdown (Issue #2507).
 * Live verification evidence: docs/evidence/inspiration-gxgen-category-converge-verify.json
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceEntry = join(here, 'InspirationSection.jsx')
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'category-e2e')

const CATEGORY_LABEL = zh['filter.category']
const EXPECTED_LABELS = ['全部', ...OFFICIAL_CATEGORIES.map((row) => zh[`category.${row.id}`])]

let bundleCounter = 0

async function bundleSection() {
  mkdirSync(cacheDir, { recursive: true })
  const outFile = join(cacheDir, `category-e2e-${bundleCounter}.mjs`)
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
 * @param {{ listStatus?: number, onFetch?: (url: string) => void }} [options]
 */
async function mountSection({ listStatus = 200, onFetch } = {}) {
  const sectionModule = await import(`${await bundleSection()}?e2e=${bundleCounter}`)
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
      return { ok: false, status: 500, json: async () => ({ error: 'unused' }) }
    }
    if (listStatus === 401 && !text.includes('/local')) {
      return { ok: false, status: 401, json: async () => ({ error: 'needs-omnimux' }) }
    }
    const body = text.includes('/local')
      ? { success: true, data: { items, total: items.length, platforms: [{ name: 'tiktok', count: 1 }] } }
      : { success: true, data: { items, total: items.length } }
    return { ok: listStatus === 200, status: listStatus, json: async () => body }
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
    container,
    document: dom.window.document,
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

describe('InspirationSection e2e — official 18-industry dropdown', () => {
  it('offers 全部 plus the 18 official Chinese names and never asks /categories', async () => {
    /** @type {string[]} */
    const fetched = []
    const mounted = await mountSection({ onFetch: (url) => fetched.push(url) })
    try {
      const labels = await openCategoryOptions(mounted)
      assert.deepEqual(labels, EXPECTED_LABELS)
      assert.equal(labels[0], '全部')
      assert.equal(
        fetched.some((url) => url.includes('/categories')),
        false,
        `dropdown must not request /categories: ${JSON.stringify(fetched)}`,
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('still shows 全部+18 when the catalogue is unauthorized', async () => {
    const mounted = await mountSection({ listStatus: 401 })
    try {
      const labels = await openCategoryOptions(mounted)
      assert.deepEqual(labels, EXPECTED_LABELS)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('sends the official id when an industry is chosen', async () => {
    /** @type {string[]} */
    const fetched = []
    const mounted = await mountSection({ onFetch: (url) => fetched.push(url) })
    try {
      await openCategoryOptions(mounted)
      const beauty = [...mounted.container.querySelectorAll('[role="option"]')]
        .find((node) => node.textContent === '美妆护肤')
      assert.ok(beauty, '美妆护肤 must be clickable')
      const before = fetched.length
      await act(async () => {
        beauty.dispatchEvent(new mounted.document.defaultView.MouseEvent('click', { bubbles: true }))
      })
      await mounted.waitFor(() => fetched.slice(before).some((url) => url.includes('category=beauty_skincare')))
      const afterPick = fetched.slice(before)
      const cloudUrls = afterPick.filter((url) => /\/omnimux\/inspiration(\?|$)/.test(url) && !url.includes('/local'))
      const localUrls = afterPick.filter((url) => url.includes('/omnimux/inspiration/local'))
      assert.ok(
        cloudUrls.some((url) => url.includes('category=beauty_skincare')),
        `cloud queries must send the official id: ${JSON.stringify(cloudUrls)}`,
      )
      assert.equal(
        localUrls.length,
        0,
        `全部 + 具体行业 must not re-query the local library: ${JSON.stringify(localUrls)}`,
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})
