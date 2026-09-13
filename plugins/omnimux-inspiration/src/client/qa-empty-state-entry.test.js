/**
 * QA 独立回归门禁（验收方新增，不属于被测提交 5f9c9a741）。
 *
 * 被测提交自带的门禁没有锁住两条验收契约：
 *   1. 「空态里的导入按钮」这第二条导入入口 —— 把账号监控页内弹窗到外壳的
 *      回调切断后，全量 738 项仍然全绿；
 *   2. 空态图标必须恰好 48px（design.md §5.7）—— 把 48 改回修复前的 40，
 *      全量 738 项 + UI01~UI10 静态门禁依旧全绿。
 * 本文件把这两条钉死。
 */

import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { JSDOM } from 'jsdom'
import './test-fixtures/dom-bootstrap.mjs'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { zh } from './locales.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceEntry = join(here, 'InspirationStage.jsx')
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'qa-independent')

const RIVAL_PREFIX = '/omnimux/inspiration/local/rival-accounts'
const NEW_ACCOUNT_ID = 'ra_gethullo'
const NEW_ACCOUNT_URL = 'https://www.tiktok.com/@gethullo'
const REQUEST_BUDGET = 120

const ACCOUNTS = [{
  id: 'ra_alice', nickname: 'Alice Studio', handle: '@alice', platform: 'tiktok',
  profile_url: 'https://www.tiktok.com/@alice', refresh_state: 'idle', post_count: 0,
}]

const L = {
  importBtn: zh['rivalAccounts.import.btn'],
  panelUrlLabel: zh['rivalAccounts.import.urlLabel'],
  panelSubmit: zh['rivalAccounts.import.submit'],
  emptyTitle: zh['rivalFeed.empty.noPostsTitle'],
  importSuccess: (handle) => zh['rivalAccounts.import.success'].replace('{handle}', handle),
}

let bundleCounter = 0

async function bundleStage() {
  mkdirSync(cacheDir, { recursive: true })
  const outFile = join(cacheDir, `qa-stage-${bundleCounter}.mjs`)
  bundleCounter += 1
  const result = await esbuild.build({
    absWorkingDir: join(here, '..', '..'),
    entryPoints: [sourceEntry],
    bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', write: false, logLevel: 'silent',
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    plugins: [{
      name: 'ui-kit-shim',
      setup(build) { build.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: shimEntry })) },
    }],
  })
  const code = result.outputFiles?.[0]?.text
  if (!code) throw new Error('esbuild produced no bundle')
  writeFileSync(outFile, code)
  return outFile
}

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

async function mountStage(options = {}) {
  const accounts = [...(options.accounts ?? ACCOUNTS)]
  const works = options.works ?? []
  const stageModule = await import(`${await bundleStage()}?mount=${bundleCounter}`)

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', { url: 'http://localhost:3000' })
  const { window } = dom
  const previous = {
    window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch,
    IO: globalThis.IntersectionObserver, act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  }
  globalThis.window = window
  globalThis.document = window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.__omnimuxAuth = { ensureLogin() {} }
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }

  const calls = []
  globalThis.fetch = async (url, fetchOptions = {}) => {
    const path = String(url)
    const method = fetchOptions?.method ?? 'GET'
    calls.push({ path, method })
    if (calls.length > REQUEST_BUDGET) throw new Error(`request storm: ${calls.length}`)
    if (path.includes(`${RIVAL_PREFIX}/posts`)) {
      return jsonResponse(200, { success: true, data: { items: works, total: works.length, page: 1, has_more: false } })
    }
    if (path.includes(`${RIVAL_PREFIX}/classify`)) {
      return jsonResponse(200, {
        success: true,
        data: { kind: 'account', platform: 'tiktok', external_id: 'gethullo', handle: '@gethullo' },
      })
    }
    if (path.includes(RIVAL_PREFIX) && method === 'POST') {
      const created = {
        id: NEW_ACCOUNT_ID, nickname: 'Gethullo', handle: '@gethullo', platform: 'tiktok',
        profile_url: NEW_ACCOUNT_URL, refresh_state: 'idle', post_count: 0,
      }
      accounts.push(created)
      return jsonResponse(201, { success: true, data: created })
    }
    if (path.includes(RIVAL_PREFIX)) {
      return jsonResponse(200, { success: true, data: { items: accounts, total: accounts.length } })
    }
    return jsonResponse(200, { success: true, data: { items: [], total: 0, platforms: [] } })
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
    async click(node) {
      assert.ok(node, 'the node to click must exist')
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    },
    async openAccountTab() {
      const button = container.querySelector('[data-tab="rivals"]')
      assert.ok(button, 'the tab bar must render the 账号监控 tab')
      await act(async () => {
        button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      await settle(container, () => button.getAttribute('aria-pressed') === 'true')
    },
    async unmount() {
      await act(async () => reactRoot.unmount())
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.fetch = previous.fetch
      globalThis.IntersectionObserver = previous.IO
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
    },
    close() { dom.window.close() },
  }
}

async function settle(container, predicate) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (predicate()) return true
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)) })
  }
  return false
}

const buttonsLabelled = (container, text) => [...container.querySelectorAll('button')]
  .filter((node) => node.textContent.trim() === text)

async function typeInto(input, value) {
  const view = input.ownerDocument.defaultView
  const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new view.Event('input', { bubbles: true }))
  })
}

after(() => rmSync(cacheDir, { recursive: true, force: true }))

describe('QA 独立门禁 — 空态图标规格与第二条导入入口', () => {
  it('the empty state icon is exactly 48px, per design.md §5.7', async () => {
    const mounted = await mountStage({ works: [] })
    try {
      await mounted.openAccountTab()
      const shown = await settle(mounted.container, () => (mounted.container.textContent || '').includes(L.emptyTitle))
      assert.ok(shown, 'the empty state must render')

      const icon = mounted.container.querySelector('.dshUk-EmptyState-iconWrap svg')
      assert.ok(icon, 'the empty state must open with a vector icon')
      assert.equal(icon.getAttribute('width'), '48', 'the empty-state icon must be 48px wide')
      assert.equal(icon.getAttribute('height'), '48', 'the empty-state icon must be 48px tall')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('the empty state import button produces the same notice + reload as the top entry', async () => {
    const mounted = await mountStage({ works: [] })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => (mounted.container.textContent || '').includes(L.emptyTitle))

      // 第二条入口：空态里的「导入对标账号」打开的是账号监控页内的弹窗。
      const emptyAction = buttonsLabelled(mounted.container, L.importBtn)[0]
      assert.ok(emptyAction, 'the empty state must offer the import action')
      await mounted.click(emptyAction)

      const input = mounted.container.querySelector(`input[aria-label="${L.panelUrlLabel}"]`)
      assert.ok(input, 'the account-monitor import dialog must open from the empty state')
      await typeInto(input, NEW_ACCOUNT_URL)

      const submit = buttonsLabelled(mounted.container, L.panelSubmit)[0]
      assert.ok(submit, 'the account-monitor dialog must render its submit control')
      await mounted.click(submit)

      const noticed = await settle(
        mounted.container,
        () => (mounted.container.textContent || '').includes(L.importSuccess('@gethullo')),
      )
      assert.ok(noticed, 'the second import entry must leave the same confirmation behind')

      const createIndex = mounted.calls.findIndex((c) => c.method === 'POST' && c.path.includes(RIVAL_PREFIX))
      assert.ok(createIndex >= 0, 'the import must reach the Host')
      const after = mounted.calls.slice(createIndex + 1)
      assert.ok(
        after.some((c) => c.path.includes(`${RIVAL_PREFIX}/posts`)),
        'the second import entry must re-read the works feed too',
      )
      assert.ok(
        after.some((c) => c.method === 'GET' && c.path.includes(RIVAL_PREFIX) && !c.path.includes('/posts')),
        'the second import entry must re-read the account list too',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})
