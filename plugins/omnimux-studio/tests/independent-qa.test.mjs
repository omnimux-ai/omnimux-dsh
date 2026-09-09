import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { StudioStore } from '../src/client/studio-store.js'
import { ScopeRegistry } from '../src/client/scope-registry.js'
import { createDocument, validateDocument } from '../src/client/editor-document.js'

const require = createRequire(import.meta.url)
const inert = { start() { return { pause() {}, resume() {}, cancel() {} } } }
function storeFor(mode = 'video', adapter = inert) {
  const store = new StudioStore('qa-scope', adapter)
  store.updateDraft(mode, { document: createDocument('QA prompt') })
  return store
}
test('QA01 sparse document is rejected before entering immutable draft', () => {
  const store = storeFor()
  try {
    const parts = new Array(2); parts[1] = createDocument('text').parts[0]
    assert.equal(validateDocument({ version: 1, parts }), false)
  } finally { store.dispose() }
})
test('QA02 reference snapshot rejects missing identity and metadata', () => {
  const store = storeFor('image')
  try {
    store.updateDraft('image', { references: [{ slot: 'reference', kind: 'image', source: 'fixture', fixtureId: 'mock:sample-image' }] })
    const before = store.getSnapshot()
    assert.equal(store.submitDraft('image').ok, false)
    assert.equal(store.getSnapshot(), before)
  } finally { store.dispose() }
})
test('QA03 draft mode cannot be reassigned through a patch', () => {
  const store = storeFor()
  try {
    store.updateDraft('video', { mode: 'image', modelId: 'mock:nano-2', spec: { resolution: '2K', aspect: 'Auto', durationMode: 'none', durationSeconds: null, batchCount: 4 } })
    assert.equal(store.getSnapshot().drafts.video.mode, 'video')
  } finally { store.dispose() }
})
test('QA04 cancelling with synchronous failure callback refunds once', () => {
  const store = storeFor('video', { start(_request, _signal, callback) { return { pause() {}, resume() {}, cancel() { callback({ status: 'failed', results: [] }) } } } })
  try {
    const { taskId } = store.submitDraft('video')
    store.cancelTask(taskId)
    assert.equal(store.getSnapshot().mockCredits, 3463)
    assert.equal(store.getSnapshot().tasks[0].status, 'cancelled')
  } finally { store.dispose() }
})
test('QA05 independent scopes keep task completion and balance isolated', () => {
  const callbacks = []
  const registry = new ScopeRegistry(() => ({ start(_r, _s, callback) { callbacks.push(callback); return { pause() {}, resume() {}, cancel() {} } } }))
  try {
    const a = registry.getOrCreate({ cwd: '/a', sessionId: 'same' })
    const b = registry.getOrCreate({ cwd: '/b', sessionId: 'same' })
    a.updateDraft('video', { document: createDocument('private-a') }); b.updateDraft('image', { document: createDocument('private-b') })
    a.submitDraft('video'); b.submitDraft('image')
    callbacks[0]({ status: 'failed', results: [] })
    assert.equal(a.getSnapshot().mockCredits, 3463)
    assert.equal(b.getSnapshot().mockCredits, 3462)
    assert.equal(b.getSnapshot().tasks[0].status, 'pending')
    registry.disposeScope(a.scopeKey)
    callbacks[0]({ status: 'failed', results: [] })
    assert.equal(b.getSnapshot().tasks.length, 1)
  } finally { registry.disposeAll() }
})
test('QA06 actual bundled kit installs no styles before dependencies become available', async () => {
  const dom = new JSDOM('<!doctype html><head></head><body></body>')
  try {
    const bundle = await build({ entryPoints: [new URL('../src/client/index.js', import.meta.url).pathname], bundle: true, platform: 'node', format: 'cjs', loader: { '.css': 'text', '.js': 'jsx' }, external: ['react', 'react-dom', 'react-dom/*', '@deepseek-ai/*'], write: false })
    const module = { exports: {} }
    vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, document: dom.window.document, crypto, URL, structuredClone, AbortController, setTimeout, clearTimeout, console,
      require: name => name.startsWith('@deepseek-ai/') ? {} : require(name) })
    module.exports.apply({ inject() {} })
    assert.equal(dom.window.document.head.querySelectorAll('style').length, 0)
  } finally { dom.window.close() }
})
test('QA07 sparse adapter batch is not a successful four-result batch', () => {
  let callback
  const store = storeFor('image', { start(_r, _s, cb) { callback = cb; return { pause() {}, resume() {}, cancel() {} } } })
  try {
    store.updateDraft('image', { spec: { batchCount: 4 } })
    store.submitDraft('image')
    callback({ status: 'completed', results: new Array(4) })
    assert.equal(store.getSnapshot().tasks[0].status, 'failed')
    assert.equal(store.getSnapshot().mockCredits, 3463)
  } finally { store.dispose() }
})
test('QA08 unknown video submode fails validation', () => {
  const store = storeFor()
  try { store.updateDraft('video', { submode: 'unknown' }); assert.equal(store.submitDraft('video').ok, false) }
  finally { store.dispose() }
})
test('QA09 boundary length and batch validation stay atomic', () => {
  for (const [mode, limit] of [['image', 2000], ['video', 8000]]) {
    const store = storeFor(mode)
    try {
      store.updateDraft(mode, { document: createDocument('x'.repeat(limit)) })
      assert.equal(store.submitDraft(mode).ok, true)
      store.updateDraft(mode, { document: createDocument('x'.repeat(limit + 1)) })
      const before = store.getSnapshot()
      assert.equal(store.submitDraft(mode).ok, false)
      assert.equal(store.getSnapshot(), before)
    } finally { store.dispose() }
  }
})
