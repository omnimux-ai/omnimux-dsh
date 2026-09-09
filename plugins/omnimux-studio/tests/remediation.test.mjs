import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { StudioStore } from '../src/client/studio-store.js'
import { createDocument } from '../src/client/editor-document.js'
import { DASHBOARD_ASSETS } from '../src/client/mock-data.js'
const require = createRequire(import.meta.url)
const inert = { start() { return { pause() {}, resume() {}, cancel() {} } } }

test('real bundle evaluated ten times leaves Host style identity and bytes unchanged', async () => {
  const bundled = await build({ entryPoints: [new URL('../src/client/index.js', import.meta.url).pathname], bundle: true, platform: 'node', format: 'cjs', loader: { '.css': 'text', '.js': 'jsx' }, external: ['react', 'react-dom', 'react-dom/*', '@deepseek-ai/*'], write: false })
  const dom = new JSDOM('<head><style id="host">body { color: red }</style></head><body></body>')
  const document = dom.window.document
  const original = document.head.innerHTML
  const host = document.querySelector('#host')
  try {
    for (let cycle = 0; cycle < 10; cycle++) {
      const module = { exports: {} }
      vm.runInNewContext(bundled.outputFiles[0].text, { module, exports: module.exports, require, document, crypto, URL, structuredClone, AbortController, setTimeout, clearTimeout, console })
      assert.equal(document.head.innerHTML, original)
      const effects = [], tabs = new Map(), locales = new Map()
      module.exports.apply({ inject() {} })
      assert.equal(document.head.innerHTML, original)
      module.exports.apply({ inject(_names, callback) { callback({
        effect(factory) { effects.push(factory()) },
        locale: { register(ns, value) { locales.set(ns, value); return () => locales.delete(ns) }, bind: () => key => key },
        betterSidebar: { registerTab(tab) { tabs.set(tab.id, tab); return () => tabs.delete(tab.id) } },
      }) } })
      assert.equal(document.querySelectorAll('style').length, 2)
      assert.equal(tabs.size, 1)
      for (const dispose of effects.reverse()) dispose()
      assert.equal(tabs.size, 0)
      assert.equal(locales.size, 0)
      assert.equal(document.head.innerHTML, original)
      assert.equal(document.querySelector('#host'), host)
    }
  } finally { dom.window.close() }
})
test('fixture references preserve full identity in frozen request and reject each missing field', () => {
  const ref = { id: 'reference-a', slot: 'reference', kind: 'image', source: 'fixture', fixtureId: 'mock:sample-image', fileId: null, name: 'Mock sample', mime: 'image/jpeg' }
  for (const missing of [null, 'id', 'fileId', 'name', 'mime', 'fixtureId']) {
    const store = new StudioStore('qa', inert)
    try {
      const reference = { ...ref }
      if (missing) delete reference[missing]
      store.updateDraft('image', { document: createDocument('sample'), references: [reference] })
      const before = store.getSnapshot()
      assert.equal(store.submitDraft('image').ok, missing === null)
      if (missing) assert.equal(store.getSnapshot(), before)
      else { assert.deepEqual(store.getSnapshot().tasks[0].request.draft.references, [ref]); assert.ok(Object.isFrozen(store.getSnapshot().tasks[0].request.draft.references[0])) }
    } finally { store.dispose() }
  }
})
test('cancel wins before abort callbacks, subscriber reentry and late completion', () => {
  let callback
  const store = new StudioStore('qa', { start(_request, signal, cb) { callback = cb; signal.addEventListener('abort', () => cb({ status: 'failed', results: [] })); return { pause() {}, resume() {}, cancel() { cb({ status: 'failed', results: [] }) } } } })
  store.updateDraft('video', { document: createDocument('sample') })
  const { taskId } = store.submitDraft('video')
  const unsubscribe = store.subscribe(() => store.cancelTask(taskId))
  store.cancelTask(taskId)
  callback({ status: 'completed', results: [] })
  assert.equal(store.getSnapshot().mockCredits, 3463)
  assert.equal(store.getSnapshot().tasks[0].status, 'cancelled')
  assert.equal(store.jobs.size, 0)
  unsubscribe(); store.dispose()
})
test('scene filter uses real fixtures, survives navigation and does not alter image dimensions', () => {
  const store = new StudioStore('qa', inert)
  store.setFilter({ resolution: '2K', aspect: '1:1' })
  for (const item of DASHBOARD_ASSETS) {
    store.setSceneFilter(item.type)
    store.navigate('image'); store.navigate('dashboard')
    assert.deepEqual(DASHBOARD_ASSETS.filter(row => row.type === store.getSnapshot().sceneFilter), [item])
    assert.equal(store.getSnapshot().filters.resolution, '2K')
    assert.equal(store.getSnapshot().filters.aspect, '1:1')
  }
  const before = store.getSnapshot()
  store.setSceneFilter('unknown'); assert.equal(store.getSnapshot(), before)
  store.setSceneFilter(null); assert.equal(store.getSnapshot().sceneFilter, null)
  store.dispose()
})
