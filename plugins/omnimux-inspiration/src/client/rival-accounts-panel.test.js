import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { JSDOM } from 'jsdom'
import './test-fixtures/dom-bootstrap.mjs'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { zh } from './locales.js'

/**
 * Re-entry guard gate for RivalAccountsPanel (R5-⑨).
 *
 * busyId is a single ticket: clicking「立即复刻」on card A and then card B
 * while A is in flight must not start a second addRivalPostToSession run —
 * and A's `finally` must not clear B's busy ticket. The orchestrator is
 * stubbed (never resolves until released) so the click sequence is observed
 * at the seam that actually costs work.
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceEntry = join(here, 'test-fixtures', 'rival-panel-stage.jsx')
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'rival-panel-stage')

const calls = []
let release = null
const STUB_ADD_TO_CHAT = `
export async function addRivalPostToSession(post, account) {
  globalThis.__calls.push([post && post.id, account && account.id])
  await new Promise((resolve) => { globalThis.__release = resolve })
  return { ok: true }
}
`

let bundleCounter = 0

async function bundleStage() {
  mkdirSync(cacheDir, { recursive: true })
  const outFile = join(cacheDir, `rival-panel-stage-${bundleCounter}.mjs`)
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
      name: 'test-stubs',
      setup(build) {
        build.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: shimEntry }))
        build.onResolve({ filter: /rival-add-to-chat\.js$/ }, (args) => ({
          path: args.path,
          namespace: 'stub-add',
        }))
        build.onLoad({ filter: /.*/, namespace: 'stub-add' }, () => ({
          contents: STUB_ADD_TO_CHAT,
          loader: 'js',
        }))
      },
    }],
  })
  const code = result.outputFiles?.[0]?.text
  if (!code) throw new Error('esbuild produced no bundle for rival-panel-stage.jsx')
  writeFileSync(outFile, code)
  return outFile
}

const t = (key) => zh[key] || key

const cardA = {
  id: 'ra_1:p1', post_id: 'p1', account_id: 'ra_1',
  card_type: 'short-video', type: 'video',
  title: 'card A', cover_key: '/m/a.jpg', source_platform: 'tiktok',
  source_url: 'https://tiktok.example/a', posted_at: '2026-10-05T08:00:00.000Z',
  stats: { views: 1 },
  account: { id: 'ra_1', nickname: 'A', handle: '@a', platform: 'tiktok' },
}
const cardB = { ...cardA, id: 'ra_2:p2', post_id: 'p2', account_id: 'ra_2', title: 'card B' }

async function mountPanel() {
  const stageModule = await import(`${await bundleStage()}?mount=${bundleCounter}`)
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
  })
  const { window } = dom
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  globalThis.window = window
  globalThis.document = window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.__calls = calls
  globalThis.__release = null

  const container = window.document.getElementById('host')
  const reactRoot = createRoot(container)
  const feed = {
    cards: [cardA, cardB],
    loading: false,
    loadingMore: false,
    total: 2,
    accounts: [{ id: 'ra_1' }, { id: 'ra_2' }],
    error: null,
    query: '',
    platform: '',
    emptySelection: false,
    resetAccounts: () => {},
  }
  await act(async () => {
    reactRoot.render(React.createElement(stageModule.RivalPanelStage, {
      t,
      feed,
      active: true,
      onImported: () => {},
      onAccountImported: () => {},
    }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return {
    container,
    document: window.document,
    async unmount() {
      await act(async () => reactRoot.unmount())
      globalThis.window = previousWindow
      globalThis.document = previousDocument
    },
  }
}

describe('RivalAccountsPanel — 「立即复刻」重入守卫（R5-⑨）', () => {
  it('a second replicate click while one is in flight does not start a second run', async () => {
    calls.length = 0
    const mounted = await mountPanel()
    try {
      const click = async (id) => {
        const button = mounted.container.querySelector(
          `.omnimux-rival-card[data-card-id="${id}"] .omnimux-rival-act-primary`,
        )
        assert.ok(button, `replicate button for ${id}`)
        await act(async () => {
          button.dispatchEvent(new mounted.document.defaultView.MouseEvent('click', { bubbles: true }))
        })
      }
      await click('ra_1:p1')
      assert.equal(calls.length, 1, 'first click starts the orchestrator')
      await click('ra_2:p2')
      assert.equal(calls.length, 1, 'the second click while busy must be swallowed by the re-entry guard')
      const releaseNow = globalThis.__release
      assert.ok(releaseNow, 'the in-flight run is still pending')
      await act(async () => {
        releaseNow()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      // After the first run settles a fresh click works again.
      await click('ra_2:p2')
      assert.equal(calls.length, 2, 'after release the next card may replicate')
    } finally {
      await mounted.unmount()
    }
  })
})
