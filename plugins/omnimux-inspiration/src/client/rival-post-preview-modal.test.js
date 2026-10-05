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
import { zh, en } from './locales.js'
import { toRivalCardRow } from './rival-filter.js'

/**
 * Render gate for RivalPostPreviewModal (R5-② cover field, R5-⑧ colon).
 *
 * The dialog is handed the card descriptor `toRivalCardRow` produces — the
 * same object the grid renders — so this test asserts the dialog's cover
 * reads the descriptor the whitelist actually emits, and that the posted-at
 * line carries no fullwidth colon into the English layer.
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceEntry = join(here, 'test-fixtures', 'rival-modal-stage.jsx')
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'rival-modal-stage')

let bundleCounter = 0

async function bundleStage() {
  mkdirSync(cacheDir, { recursive: true })
  const outFile = join(cacheDir, `rival-modal-stage-${bundleCounter}.mjs`)
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
  if (!code) throw new Error('esbuild produced no bundle for rival-modal-stage.jsx')
  writeFileSync(outFile, code)
  return outFile
}

async function mountModal(row, { locale = 'zh' } = {}) {
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

  const container = window.document.getElementById('host')
  const reactRoot = createRoot(container)
  const dict = locale === 'en' ? en : zh
  const t = (key) => dict[key] || key
  await act(async () => {
    reactRoot.render(React.createElement(stageModule.RivalModalStage, {
      row,
      t,
      busy: false,
      onClose: () => {},
      onReplicate: () => {},
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

const FEED_ROW = {
  id: 'p1',
  row_id: 'ra_1:p1',
  account_id: 'ra_1',
  account: { id: 'ra_1', nickname: 'Higgsfield AI', handle: '@higgsfield_ai', platform: 'x', profile_url: '' },
  type: 'video',
  source_platform: 'x',
  title: 'Movie-grade push-in shot breakdown',
  url: 'https://x.com/higgsfield_ai/status/1',
  cover_src: '/omnimux/inspiration/media/rival-cover-1.jpg',
  posted_at: '2026-10-05T07:00:00.000Z',
  stats: { views: 128000, likes: 8640, comments: 214, shares: 96 },
  duration: 96,
}

describe('RivalPostPreviewModal — 封面与发布时间（第五轮整改）', () => {
  it('renders the cover the card descriptor carries (R5-②)', async () => {
    const card = toRivalCardRow(FEED_ROW)
    assert.ok(card.cover_src, 'the descriptor must keep a dialog-readable cover field')
    const mounted = await mountModal(card)
    try {
      const img = mounted.container.querySelector('.omnimux-rival-detail-cover img')
      assert.ok(img, 'the detail dialog must render a cover <img>')
      assert.ok(String(img.getAttribute('src') || '').includes('rival-cover-1.jpg'),
        `cover src must reach the <img>, got ${img.getAttribute('src')}`)
    } finally {
      await mounted.unmount()
    }
  })

  it('keeps the posted-at line free of the fullwidth colon in the en layer (R5-⑧)', async () => {
    const card = toRivalCardRow(FEED_ROW)
    const mounted = await mountModal(card, { locale: 'en' })
    try {
      const time = mounted.container.querySelector('.omnimux-rival-detail-time')
      assert.ok(time, 'posted_at renders a time line')
      const text = time.textContent || ''
      assert.ok(text.includes('Published'), `en dictionary label, got ${text}`)
      assert.ok(!text.includes('：'), `the en layer must not carry the fullwidth colon, got ${text}`)
      assert.match(text, /ago/, `relative time in English, got ${text}`)
    } finally {
      await mounted.unmount()
    }
  })
})
