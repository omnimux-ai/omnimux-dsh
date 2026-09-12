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
 * Render gate for the platform filter (P2-8 / P2-E).
 *
 * The previous version of this gate asserted on the *source text* of
 * `InspirationSection.jsx` with a regex. That is not a constraint: commenting the
 * call out (`{/* buildPlatformFilterOptions(availablePlatforms, t) *\/}`) or
 * making the condition dead (`buildPlatformFilterOptions(...) && null ?`) still
 * matches the regex while the dropdown never renders.
 *
 * This gate instead bundles the real `.jsx` with esbuild, mounts it in jsdom with
 * a stubbed feed response and asserts on the rendered DOM. The `dsh-ui-kit` leaf
 * components are replaced by `test-fixtures/ui-kit-shim.mjs` (the production kit's
 * lib pulls in `.module.css`, which esbuild cannot inline); the gate itself —
 * whether `InspirationSection` renders the platform dropdown — is plugin code and
 * is exercised for real.
 *
 * Measured behaviour of this gate against deliberate stubs is documented in the
 * suite's own failure output: a commented-out call and a dead condition both fail
 * the "two platforms" assertion, and a component replaced by a stub fails the
 * "trigger opens a listbox" assertion.
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceEntry = join(here, 'InspirationSection.jsx')
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'section')

/** aria-label the section puts on the platform dropdown (`filter.platform`). */
const PLATFORM_LABEL = zh['filter.platform']
/** aria-label of the always-rendered type dropdown, used as a "mounted" probe. */
const TYPE_LABEL = zh['filter.type']

let bundleCounter = 0

/**
 * Bundle the section with the UI-kit shim in place of `dsh-ui-kit`.
 * @returns {Promise<string>} absolute path of the bundled ESM file
 */
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

/**
 * Mount the section against a stubbed feed and wait until it has rendered items.
 *
 * A fresh bundle path per mount gives every case its own module registry, which
 * matters because the feed keeps an SWR cache at module scope — reusing one
 * instance across cases would serve the first case's payload from cache.
 * @param {string[]} platformNames platforms the stubbed feed reports
 * @returns {Promise<{ document: Document, container: HTMLElement, unmount: () => Promise<void>, close: () => void }>}
 */
async function mountSection(platformNames) {
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

  const items = platformNames.map((name, index) => ({
    id: `item-${index + 1}`,
    title: `item ${index + 1}`,
    source_platform: name,
    is_local: index % 2 === 0,
  }))
  globalThis.fetch = async (url) => {
    const body = String(url).includes('/local')
      ? { success: true, data: { items, total: items.length, platforms: platformNames.map((name) => ({ name, count: 1 })) } }
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
    if (container.querySelector(`[aria-label="${TYPE_LABEL}"]`)) break
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }

  return {
    document: dom.window.document,
    container,
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
 * Platform dropdown triggers rendered on screen.
 * @param {HTMLElement} container
 * @returns {Element[]}
 */
function platformTriggers(container) {
  return [...container.querySelectorAll(`[aria-haspopup="listbox"][aria-label="${PLATFORM_LABEL}"]`)]
}

after(() => {
  rmSync(cacheDir, { recursive: true, force: true })
})

describe('InspirationSection render gate — platform dropdown', () => {
  it('renders no platform dropdown while a single platform is known', async () => {
    const mounted = await mountSection(['tiktok'])
    try {
      // The section itself did render — otherwise the assertion below would pass
      // for the wrong reason.
      assert.ok(
        mounted.container.querySelector(`[aria-label="${TYPE_LABEL}"]`),
        'the section must render its filter bar (type dropdown missing => nothing mounted)',
      )
      assert.equal(
        platformTriggers(mounted.container).length,
        0,
        'a single known platform must not produce a platform dropdown',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('renders exactly one platform dropdown once two platforms are known', async () => {
    const mounted = await mountSection(['tiktok', 'x'])
    try {
      assert.equal(
        platformTriggers(mounted.container).length,
        1,
        'two known platforms must produce exactly one platform dropdown',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('offers the known platforms and the all-entry in the opened menu', async () => {
    const mounted = await mountSection(['tiktok', 'douyin'])
    try {
      const [trigger] = platformTriggers(mounted.container)
      assert.ok(trigger, 'a two-platform feed must render the dropdown trigger')
      const listboxesBefore = mounted.container.querySelectorAll('[role="listbox"]').length

      await act(async () => {
        trigger.dispatchEvent(new mounted.document.defaultView.MouseEvent('click', { bubbles: true }))
      })

      const listboxesAfter = mounted.container.querySelectorAll('[role="listbox"]').length
      assert.ok(
        listboxesAfter > listboxesBefore,
        'clicking the platform trigger must open a listbox (trigger is not wired to a menu)',
      )
      const openedOptions = [...mounted.container.querySelectorAll('[role="option"]')].map((node) => node.textContent)
      for (const label of ['TikTok', 'Douyin', zh['platform.all']]) {
        assert.ok(
          openedOptions.includes(label),
          `the opened menu must offer ${label} (got ${JSON.stringify(openedOptions)})`,
        )
      }
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})
