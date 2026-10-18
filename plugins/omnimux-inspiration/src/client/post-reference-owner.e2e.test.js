import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import './test-fixtures/dom-bootstrap.mjs'
import React, { act } from 'react'
import { zh } from './locales.js'

// Written after the real owner-preview UI verification recorded in
// .agent-reports/inspiration-post-implementation/browser/{03,04,05}-*.png.
// This is a component integration E2E with offline service/session receipts.
// It does not establish native-dialog, video decoding, or live-model acceptance.
const require = createRequire(import.meta.url)

async function ownerService() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('./preview-service.jsx', import.meta.url))],
    bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic',
    external: ['react', 'react-dom', 'react-dom/client'],
    alias: { 'dsh-ui-kit': fileURLToPath(new URL('./test-fixtures/ui-kit-shim.mjs', import.meta.url)) },
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports)
  return module.exports.registerPreviewService
}

const response = data => ({ ok: true, status: 200, json: async () => ({ data }) })

test('E2E: owner preview restores the saved body reference and closes only after a confirmed prepared handoff', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000', pretendToBeVisual: true })
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let stored = { id: 'owner-body-reference', title: '完整原帖', content: '这段完整正文用于创作参考', source_url: 'https://x.com/example/status/123', source_platform: 'x', is_local: true }
  const writes = []
  const receipts = []
  let dispose
  let close
  let closed = 0
  const sessionResults = [{ ok: false, error: '会话暂时不可用，请重试' }, { ok: true, sessionId: 'confirmed-session' }]
  const click = async node => {
    assert.ok(node, 'the requested user-facing control must exist')
    await act(async () => node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  }
  const drawer = () => dom.window.document.querySelector('.omnimux-post-creation-drawer')
  const button = (root, key) => [...root.querySelectorAll('button')].find(node => node.textContent === zh[key])
  const flush = async fn => act(async () => { fn?.(); await new Promise(resolve => setTimeout(resolve, 20)) })
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url)
    if ((init.method || 'GET') === 'GET') return response(stored)
    const payload = JSON.parse(init.body)
    assert.ok(['/omnimux/inspiration/local/owner-body-reference/creation-draft', '/omnimux/inspiration/local/owner-body-reference/creation-reference'].includes(path))
    writes.push({ path, payload })
    stored = { ...stored, creation_draft: payload.draft }
    if (path.endsWith('/creation-reference')) stored = { ...stored, creation_reference: { id: '05b87448-689b-4b28-a8f0-4e1df69d1d40', text: payload.draft.text, basis: payload.draft.basis, reference_count: payload.draft.references.length, prepared_at: '2026-10-18T13:00:00.000Z' } }
    return response(stored)
  }
  try {
    const register = await ownerService()
    dispose = register(key => zh[key] || key, dom.window)
    const open = () => {
      close = dom.window.__omnimuxInspirationPreview.open({ row: stored, onClose: () => { closed++ }, onReplicate: async row => { receipts.push(row); return sessionResults.shift() } })
    }
    await flush(open)
    assert.ok(dom.window.document.querySelector('dialog.omnimux-inspiration-preview-layer'))
    await click(dom.window.document.querySelector('.omnimux-post-original [aria-pressed]'))
    await click(button(dom.window.document, 'post.create'))
    const field = drawer().querySelectorAll('textarea')[1]
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(field, '只借鉴原帖的开场结构，保留我的这句要求')
      field.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    await click(button(drawer(), 'post.saveDraft'))
    assert.equal(writes.length, 1)
    assert.deepEqual(stored.creation_draft.references, [{ kind: 'body' }])
    const savedText = stored.creation_draft.text
    await flush(() => close())
    await flush(open)
    await click(button(dom.window.document, 'post.create'))
    assert.equal(drawer().querySelectorAll('textarea')[1].value, savedText, 'reopening the owner preview must restore the server-saved manual draft')
    await click(button(drawer(), 'post.useInChat'))
    assert.equal(receipts.length, 1)
    assert.equal(drawer().querySelector('[role="alert"]').textContent, '会话暂时不可用，请重试')
    assert.equal(drawer().querySelectorAll('textarea')[1].value, savedText)
    assert.equal(closed, 1, 'only the earlier explicit close has completed')
    await click(button(drawer(), 'post.useInChat'))
    await flush()
    assert.equal(receipts.length, 2)
    assert.deepEqual(receipts[1], stored, 'handoff must carry the complete service-prepared saved row')
    assert.equal(receipts[1].creation_reference.text, savedText)
    assert.equal(writes.filter(call => call.path.endsWith('/creation-reference')).length, 2)
    assert.equal(closed, 2)
    assert.equal(dom.window.document.querySelector('dialog.omnimux-inspiration-preview-layer'), null)
  } finally {
    await flush(() => dispose?.())
    dom.window.close()
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.fetch = previous.fetch
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
})
