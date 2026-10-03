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
 * Render gate for the 灵感库 bulk-selection bar.
 *
 * Ticking a local card used to mark the card but never show the bar
 * (「已选 N 项 / 全选本地 / 取消选择 / 删除 (N)」): the bar sat inside the
 * 爆款趋势-only secondary filter row, while selection only exists on 灵感库.
 * This mounts the real `InspirationSection`, switches to 灵感库, ticks a card
 * and asserts the bar appears and 「取消选择」 dismisses it.
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceEntry = join(here, 'InspirationSection.jsx')
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'selection-bar')

let bundleCounter = 0

async function bundleSection() {
  mkdirSync(cacheDir, { recursive: true })
  const outFile = join(cacheDir, `section-${bundleCounter}.mjs`)
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

async function mountSection() {
  const sectionModule = await import(`${await bundleSection()}?mount=${bundleCounter}`)
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
  })
  const saved = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
    IntersectionObserver: globalThis.IntersectionObserver,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.__omnimuxAuth = { ensureLogin() {} }
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const items = [1, 2].map((n) => ({ id: `local-${n}`, title: `local ${n}`, source_platform: 'tiktok', is_local: true }))
  globalThis.fetch = async (url) => {
    const text = String(url)
    if (text.includes('/omnimux/inspiration/categories')) {
      return { ok: false, status: 500, json: async () => ({ error: 'unused' }) }
    }
    const body = text.includes('/local')
      ? { success: true, data: { items, total: items.length, platforms: [{ name: 'tiktok', count: 2 }] } }
      : { success: true, data: { items: [], total: 0 } }
    return { ok: true, status: 200, json: async () => body }
  }

  const container = dom.window.document.getElementById('host')
  const reactRoot = createRoot(container)
  const t = (key) => zh[key] || key
  await act(async () => {
    reactRoot.render(React.createElement(sectionModule.InspirationSection, { t, active: true }))
  })

  const waitFor = async (probe, budgetMs = 2000) => {
    const start = Date.now()
    for (;;) {
      const value = probe()
      if (value) return value
      if (Date.now() - start > budgetMs) return null
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
    }
  }
  const click = async (el) => {
    await act(async () => {
      el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })
  }
  return {
    container,
    waitFor,
    click,
    async unmount() {
      await act(async () => reactRoot.unmount())
      globalThis.window = saved.window
      globalThis.document = saved.document
      globalThis.fetch = saved.fetch
      globalThis.IntersectionObserver = saved.IntersectionObserver
      globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
      dom.window.close()
    },
  }
}

const buttonByText = (container, text) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text) || null

after(() => {
  rmSync(cacheDir, { recursive: true, force: true })
})

describe('灵感库 bulk-selection bar', () => {
  it('appears after ticking a local card and 取消选择 dismisses it', async () => {
    const mounted = await mountSection()
    try {
      const localTab = await mounted.waitFor(() => mounted.container.querySelector('[data-tab="local"]'))
      assert.ok(localTab, 'the 灵感库 tab must render')
      await mounted.click(localTab)

      const checks = await mounted.waitFor(() => {
        const found = mounted.container.querySelectorAll(`[aria-label="${zh['select.toggle']}"]`)
        return found.length > 0 ? found : null
      })
      assert.ok(checks, '灵感库 cards must render their selection checkbox')
      await mounted.click(checks[0])

      const clear = await mounted.waitFor(() => buttonByText(mounted.container, zh['select.clear']))
      assert.ok(clear, 'ticking a card must show 「取消选择」')
      assert.ok(
        mounted.container.textContent.includes(zh['select.count'].replace('{n}', '1')),
        'the bar must read 「已选 1 项」',
      )
      assert.ok(buttonByText(mounted.container, zh['select.delete'].replace('{n}', '1')), 'the bar must offer 删除 (1)')
      assert.equal(
        mounted.container.querySelector(`[aria-label="${zh['filter.country']}"]`),
        null,
        '灵感库 must still not show the cloud secondary filters',
      )

      await mounted.click(clear)
      const gone = await mounted.waitFor(() => !buttonByText(mounted.container, zh['select.clear']))
      assert.ok(gone, '「取消选择」 must dismiss the bar')
    } finally {
      await mounted.unmount()
    }
  })
})
