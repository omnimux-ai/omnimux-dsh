import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import '../../tests/fixtures/dom-bootstrap.mjs'
import { act } from 'react'
import { zh } from './locales.js'
import { analysisInputFingerprint } from '../analysis-input.js'
import { IMPORT_POLL_INTERVAL_MS } from './import-status.js'

// Real-browser component verification precedes this regression test:
// .agent-reports/inspiration-analysis-state/browser/01-clicked.png,
// 02-reopened.png, 03-done.png and 04-failed.png (Ego + synthetic HTTP server).
// This offline component test does not establish live-model or full-app acceptance.
const require = createRequire(import.meta.url)
async function previewService() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('./preview-service.jsx', import.meta.url))],
    bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic',
    external: ['react', 'react-dom', 'react-dom/client'],
    alias: { 'dsh-ui-kit': fileURLToPath(new URL('../../tests/fixtures/ui-kit-shim.mjs', import.meta.url)) },
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports)
  return module.exports.registerPreviewService
}
const response = (row, status = 200) => {
  const data = structuredClone(row)
  return { ok: status < 400, status, json: async () => ({ data }) }
}

test('analysis stays disabled across owner preview reopen, settles live and rejects stale reads', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000', pretendToBeVisual: true })
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const timers = new Map()
  globalThis.setTimeout = (fn, ms, ...args) => {
    if (ms !== IMPORT_POLL_INTERVAL_MS) return previous.setTimeout(fn, ms, ...args)
    const token = {}; timers.set(token, () => fn(...args)); return token
  }
  globalThis.clearTimeout = token => timers.delete(token) || previous.clearTimeout(token)
  const original = { id: 'analysis-owner', title: '分析状态', content: '用于验证的原文', is_local: true }
  let stored = structuredClone(original), submissions = 0, complete, pendingRead, releaseRead
  globalThis.fetch = async (url, init = {}) => {
    if ((init.method || 'GET') === 'GET') {
      const captured = response(stored)
      if (pendingRead) { pendingRead = false; return new Promise(resolve => { releaseRead = () => resolve(captured) }) }
      return captured
    }
    assert.equal(String(url), `/omnimux/inspiration/local/${original.id}/analyze`)
    submissions++
    const selection = JSON.parse(init.body)
    const oldResult = stored.analysis_results?.post?.result
    stored = { ...stored, analysis_results: { post: { ...selection, status: 'running', source: 'live', input_fingerprint: analysisInputFingerprint(stored, selection), result: oldResult || null } } }
    return new Promise(resolve => {
      complete = status => {
        stored = { ...stored, analysis_results: { post: { ...stored.analysis_results.post, status, result: status === 'done' ? { markdown: '新的分析结果' } : null, error: status === 'failed' ? '本次失败，请重试' : null } } }
        resolve(response(stored, status === 'failed' ? 502 : 200))
      }
    })
  }
  const flush = async fn => act(async () => { fn?.(); await new Promise(resolve => previous.setTimeout(resolve, 0)) })
  const button = label => [...dom.window.document.querySelectorAll('.omnimux-post-analysis button')].find(node => node.textContent.trim() === label)
  const click = async node => { assert.ok(node); await flush(() => node.click()) }
  const busy = () => {
    const node = button('解析中...'); assert.ok(node); assert.equal(node.disabled, true); assert.equal(node.getAttribute('aria-busy'), 'true'); return node
  }
  const tick = async () => {
    const due = [...timers]; assert.ok(due.length, 'running analysis must keep a refresh scheduled')
    await flush(() => { for (const [token, fn] of due) { timers.delete(token); fn() } })
  }
  let dispose, close
  try {
    const register = await previewService(); dispose = register(key => zh[key] || key, dom.window)
    const open = async () => flush(() => { close = dom.window.__omnimuxInspirationPreview.open({ row: original }) })
    await open()
    await click(button(zh['post.analyzeTarget'])); const running = busy()
    await click(running); assert.equal(submissions, 1, 'disabled native click must not submit again')
    await flush(() => close()); await open(); busy(); assert.equal(submissions, 1)
    await flush(() => complete('done')); await tick()
    assert.equal(button('解析中...'), undefined); assert.equal(button(zh['post.reanalyze']).disabled, false)
    assert.match(dom.window.document.querySelector('.omnimux-post-result').textContent, /新的分析结果/)

    await click(button(zh['post.reanalyze'])); await click(button(zh['post.reanalyze'])); busy()
    await flush(() => close()); await open(); busy()
    assert.ok(dom.window.document.querySelector('.omnimux-post-result'), 'busy state also covers the saved-result view')
    await flush(() => complete('failed')); await tick()
    assert.match(dom.window.document.querySelector('.omnimux-post-analysis [role="alert"]').textContent, /本次失败/)
    assert.equal(button(zh['post.reanalyze']).disabled, false)

    await click(button(zh['post.reanalyze'])); busy(); assert.equal(submissions, 3)
    pendingRead = true; await tick(); assert.equal(typeof releaseRead, 'function')
    await flush(() => complete('done')); await flush(releaseRead)
    assert.equal(button('解析中...'), undefined, 'a GET begun before completion cannot restore running')
    assert.ok(dom.window.document.querySelector('.omnimux-post-result'))
    await flush(() => close()); assert.equal(dom.window.document.querySelector('.omnimux-post-detail'), null)
    assert.equal(timers.size, 0, 'unmount releases analysis timers')
  } finally {
    await flush(() => dispose?.()); dom.window.close()
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.fetch = previous.fetch; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
    globalThis.setTimeout = previous.setTimeout; globalThis.clearTimeout = previous.clearTimeout
  }
})

// Verified first in Ego for #3412: browser/01-pending.png, 07-result.png and
// 12-text-pending-result.png. This checks recovery UI, not real model quality.
test('pending media service preserves body analysis and explicit confirmation never starts a paid request', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000', pretendToBeVisual: true })
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const row = { id: 'service-recovery', title: '服务恢复', content: '正文可以独立分析', is_local: true, media_items: [{ type: 'video', url: '/omnimux/inspiration/local/media/videos/fixture.mp4' }] }
  let service = { revision: 7, channel: 'pending', configured: false, imageToolConfigured: false }
  const writes = []
  globalThis.fetch = async (url, init = {}) => {
    if (String(url) === '/omnimux/analysis/service') {
      if (init.method === 'PUT') { writes.push(JSON.parse(init.body)); service = { ...service, revision: 8, channel: 'official', configured: true } }
      return { ok: true, status: 200, json: async () => structuredClone(service) }
    }
    assert.equal(init.method || 'GET', 'GET', 'service confirmation must not submit analysis')
    assert.equal(String(url), `/omnimux/inspiration/local/${row.id}`)
    return response(row)
  }
  const flush = async fn => act(async () => { fn?.(); await new Promise(resolve => setTimeout(resolve, 0)) })
  const button = label => [...dom.window.document.querySelectorAll('.omnimux-post-analysis button')].find(node => node.textContent.trim() === label)
  let dispose, close
  try {
    const register = await previewService(); dispose = register(key => zh[key] || key, dom.window)
    const open = () => flush(() => { close = dom.window.__omnimuxInspirationPreview.open({ row }) })
    await open()
    assert.equal(button(zh['post.analyzeTarget']).disabled, true)
    assert.ok(button(zh['post.useOfficialService']))
    await flush(() => button(zh['post.body']).click())
    assert.equal(button(zh['post.analyzeTarget']).disabled, false, 'text-only scope keeps its own configured route')
    assert.equal(button(zh['post.useOfficialService']), undefined)
    await flush(() => button(zh['post.wholePost']).click())
    await flush(() => button(zh['post.useOfficialService']).click())
    assert.deepEqual(writes, [{ expectedRevision: 7, channel: 'official' }])
    assert.equal(button(zh['post.analyzeTarget']).disabled, false)
    await flush(() => close()); await open()
    assert.equal(button(zh['post.useOfficialService']), undefined, 'reopen reads the saved service')
    assert.equal(button(zh['post.analyzeTarget']).disabled, false)
  } finally {
    await flush(() => dispose?.()); dom.window.close()
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.fetch = previous.fetch; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
})
