/**
 * Issue #2988 end-to-end gate: a slow 爆款趋势 response must not repaint 灵感库.
 *
 * Mounts the real bundled `InspirationSection`, holds the cloud list request
 * until the user has already switched to 灵感库, then releases it and checks the
 * DOM the user actually sees. Also counts first-page requests so the
 * active-effect / auth-ready double fire cannot come back.
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import * as esbuild from 'esbuild'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { zh } from './locales.js'

const here = dirname(fileURLToPath(import.meta.url))
const cacheDir = join(here, '.esbuild-cache', 'feed-race')

async function bundleSection() {
  mkdirSync(cacheDir, { recursive: true })
  const result = await esbuild.build({
    absWorkingDir: join(here, '..', '..'),
    entryPoints: [join(here, 'InspirationSection.jsx')],
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
        build.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: join(here, 'test-fixtures', 'ui-kit-shim.mjs') }))
      },
    }],
  })
  const outFile = join(cacheDir, `section-${Date.now()}.mjs`)
  writeFileSync(outFile, result.outputFiles[0].text)
  return outFile
}

const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body })
const rows = (prefix, count) => Array.from({ length: count }, (_, i) => ({
  id: `${prefix}-${i + 1}`,
  title: `${prefix} ${i + 1}`,
  source_platform: prefix === 'cloud' ? 'tiktok' : 'local',
}))

async function settle(predicate) {
  for (let i = 0; i < 60; i += 1) {
    if (predicate()) return
    await React.act(async () => { await new Promise((r) => setTimeout(r, 10)) })
  }
}

describe('灵感社区 feed race (Issue #2988)', () => {
  it('keeps 灵感库 cards after a slower 爆款趋势 response lands, and loads each tab once', async () => {
    const sectionModule = await import(await bundleSection())
    const dom = new JSDOM('<!DOCTYPE html><div id="host"></div>', { url: 'http://localhost:3000' })
    const previous = {
      window: globalThis.window,
      document: globalThis.document,
      fetch: globalThis.fetch,
      IntersectionObserver: globalThis.IntersectionObserver,
      IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
    }
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
    dom.window.__omnimuxAuth = { ensureLogin() {} }
    globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }

    const calls = []
    let releaseCloud
    const cloudGate = new Promise((resolve) => { releaseCloud = resolve })
    globalThis.fetch = async (input) => {
      const url = new URL(String(input), 'http://localhost:3000')
      calls.push(url.pathname + (url.searchParams.get('page') ? `?page=${url.searchParams.get('page')}` : ''))
      if (url.pathname === '/omnimux/inspiration/local') {
        return jsonResponse({ success: true, data: { items: rows('local', 3), total: 3 } })
      }
      if (url.pathname === '/omnimux/inspiration') {
        await cloudGate
        return jsonResponse({ success: true, data: { items: rows('cloud', 6), total: 40 } })
      }
      return jsonResponse({ success: true, data: { items: [], total: 0 } })
    }

    const container = dom.window.document.getElementById('host')
    const root = createRoot(container)
    const cardIds = () => [...container.querySelectorAll('[data-inspiration-id]')].map((el) => el.getAttribute('data-inspiration-id'))
    const activeTab = () => container.querySelector('[data-tab][aria-pressed="true"]')?.getAttribute('data-tab')
    try {
      await React.act(async () => {
        root.render(React.createElement(sectionModule.InspirationSection, { t: (k) => zh[k] || k, active: true }))
      })
      await settle(() => container.querySelector('[data-tab="local"]'))
      assert.equal(activeTab(), 'public', 'the page opens on 爆款趋势')

      await React.act(async () => { container.querySelector('[data-tab="local"]').click() })
      await settle(() => cardIds()[0] === 'local-1')
      assert.equal(activeTab(), 'local')
      assert.deepEqual(cardIds(), ['local-1', 'local-2', 'local-3'], '灵感库 shows local rows first')

      await React.act(async () => {
        releaseCloud()
        await new Promise((r) => setTimeout(r, 30))
      })
      await settle(() => false)

      assert.equal(activeTab(), 'local', 'the selected tab never moves')
      assert.deepEqual(
        cardIds(),
        ['local-1', 'local-2', 'local-3'],
        'a late 爆款趋势 response must not overwrite the 灵感库 grid',
      )
      assert.equal(
        calls.filter((c) => c === '/omnimux/inspiration?page=1').length,
        1,
        `爆款趋势 first page must be requested once, got ${JSON.stringify(calls)}`,
      )
      assert.equal(
        calls.filter((c) => c === '/omnimux/inspiration/local?page=1').length,
        1,
        `灵感库 first page must be requested once, got ${JSON.stringify(calls)}`,
      )
    } finally {
      await React.act(async () => root.unmount())
      dom.window.close()
      Object.assign(globalThis, previous)
    }
  })
})
