import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StudioStore } from '../src/client/studio-store.js'
import { ScopeRegistry, scopeKey } from '../src/client/scope-registry.js'
import { MockAdapter } from '../src/client/mock-adapter.js'
import { createDocument } from '../src/client/editor-document.js'

function harness() {
  let now = 0, id = 0
  const timers = new Map()
  const clock = { now: () => now, setTimeout: (fn, delay) => { const key = ++id; timers.set(key, { at: now + delay, fn }); return key }, clearTimeout: key => timers.delete(key) }
  const advance = ms => { now += ms; for (const [key, timer] of [...timers]) if (timer.at <= now) { timers.delete(key); timer.fn() } }
  const store = new StudioStore('["cwd",null,"s"]', new MockAdapter(clock))
  store.setVisible(true)
  for (const mode of ['agent', 'video', 'image']) store.updateDraft(mode, { document: createDocument('test prompt') })
  return { store, advance, timers }
}
test('F04 scope tuple isolation and unknown cwd refusal', () => {
  const registry = new ScopeRegistry()
  assert.equal(registry.getOrCreate({ sessionId: 's' }), null)
  assert.equal(scopeKey({ cwd: ' ', sessionId: 's' }), null)
  const instances = []
  for (const cwd of ['/a', '/b']) for (const sessionId of ['1', '2']) instances.push(registry.getOrCreate({ cwd, sessionId }))
  instances.push(registry.getOrCreate({ cwd: '/a', sessionId: '1', repoRoot: '/changed' }))
  assert.equal(new Set(instances).size, 5)
  instances[0].updateDraft('video', { document: createDocument('private') })
  assert.equal(instances[1].getSnapshot().drafts.video.document.parts[0].text, '')
  assert.equal(registry.getOrCreate({ cwd: '/a', sessionId: '1' }), instances[0])
  registry.disposeScope(instances[0].scopeKey)
  assert.notEqual(registry.getOrCreate({ cwd: '/a', sessionId: '1' }), instances[0])
  registry.disposeAll()
  assert.equal(registry.stores.size, 0)
})
test('F06 hide pauses remaining time, cancel/delete refund once and no late callback', () => {
  const { store, advance, timers } = harness()
  const first = store.submitDraft('video').taskId
  advance(1500); store.setVisible(false); advance(10000)
  assert.equal(store.getSnapshot().tasks[0].status, 'pending')
  store.setVisible(true); advance(1999)
  assert.equal(store.getSnapshot().tasks[0].status, 'pending')
  advance(1)
  assert.equal(store.getSnapshot().tasks[0].status, 'completed')
  const credits = store.getSnapshot().mockCredits
  store.deleteTask(first)
  assert.equal(store.getSnapshot().mockCredits, credits)
  const second = store.submitDraft('video').taskId
  store.cancelTask(second); store.cancelTask(second)
  assert.equal(store.getSnapshot().mockCredits, credits)
  store.deleteTask(second); advance(10000)
  assert.equal(store.getSnapshot().tasks.length, 0)
  assert.equal(timers.size, 0)
  store.submitDraft('video'); store.dispose(); advance(10000)
  assert.equal(timers.size, 0)
})
test('F10 immutable complete snapshot, batch four, restore without submission', () => {
  const { store, advance } = harness()
  store.updateDraft('image', { spec: { batchCount: 4, aspect: '1:1' }, references: [{ id: crypto.randomUUID(), slot: 'reference', kind: 'image', source: 'fixture', fixtureId: 'mock:sample-image', name: 'sample', fileId: null, mime: 'image/jpeg' }] })
  const result = store.submitDraft('image')
  assert.equal(result.ok, true)
  const request = store.getSnapshot().tasks[0].request
  assert.equal(request.totalCost, 4)
  assert.equal(request.draft.spec.aspect, '1:1')
  assert(Object.isFrozen(request.draft.references[0]))
  store.updateDraft('image', { spec: { aspect: '9:16' }, document: createDocument('changed') })
  assert.equal(request.prompt, 'test prompt')
  advance(3500)
  assert.equal(store.getSnapshot().tasks[0].results.length, 4)
  assert.equal(new Set(store.getSnapshot().tasks[0].results.map(item => item.id)).size, 4)
  const balance = store.getSnapshot().mockCredits
  store.restoreDraft(result.taskId)
  assert.equal(store.getSnapshot().drafts.image.spec.aspect, '1:1')
  assert.equal(store.getSnapshot().drafts.image.references.length, 1)
  assert.equal(store.getSnapshot().mockCredits, balance)
  assert.equal(store.getSnapshot().tasks.length, 1)
})
test('F10 zero / one-short credits reject without mutations or timers', () => {
  for (const balance of [0, 16]) {
    const { store, timers } = harness()
    store.publish({ mockCredits: balance })
    const snapshot = store.getSnapshot()
    assert.equal(store.submitDraft('video').ok, false)
    assert.equal(store.getSnapshot(), snapshot)
    assert.equal(timers.size, 0)
  }
})
test('F10 same-clock 100 submissions mint UUIDs and preserve 15s / auto', () => {
  const { store } = harness()
  store.updateDraft('video', { spec: { durationMode: 'fixed', durationSeconds: 15, aspect: '1:1' } })
  for (let index = 0; index < 100; index++) assert.equal(store.submitDraft('video').ok, true)
  const tasks = store.getSnapshot().tasks
  assert.equal(new Set(tasks.map(item => item.id)).size, 100)
  assert.match(tasks[0].id, /^[0-9a-f-]{36}$/)
  assert.equal(tasks[0].request.draft.spec.durationSeconds, 15)
  store.updateDraft('video', { spec: { durationMode: 'auto', durationSeconds: null } })
  store.submitDraft('video')
  assert.equal(store.getSnapshot().tasks[0].request.draft.spec.durationMode, 'auto')
  store.dispose()
})
test('F06/F10 adapter failure and partial batch refund once; malicious late outcome ignored', () => {
  let callback
  const adapter = { start: (_request, _signal, cb) => { callback = cb; return { pause() {}, resume() {}, cancel() {} } } }
  const store = new StudioStore('scope', adapter)
  store.updateDraft('image', { document: createDocument('batch'), spec: { batchCount: 4 } })
  store.submitDraft('image')
  callback({ status: 'completed', results: [{}] })
  assert.equal(store.getSnapshot().tasks[0].status, 'failed')
  assert.equal(store.getSnapshot().mockCredits, 3463)
  callback({ status: 'completed', results: [{}, {}, {}, {}] })
  assert.equal(store.getSnapshot().mockCredits, 3463)
  assert.equal(store.getSnapshot().tasks[0].status, 'failed')
})
test('F08 main and detail navigation retain identical draft, invalid submission does not navigate', () => {
  const { store } = harness()
  const draft = store.getSnapshot().drafts.video
  store.navigate('video'); store.navigate('dashboard')
  assert.equal(store.getSnapshot().drafts.video, draft)
  store.updateDraft('video', { document: createDocument() })
  assert.equal(store.submitDraft('video').ok, false)
  assert.equal(store.getSnapshot().view, 'dashboard')
})
test('F10 analysis clears model/spec and creates explicit text sample', () => {
  const { store, advance } = harness()
  store.applyPreset('deconstruct')
  const draft = store.getSnapshot().drafts.agent
  const parts = draft.document.parts.map(part => part.kind === 'url-token' ? { ...part, value: 'https://example.org/video' } : part)
  store.updateDraft('agent', { document: { version: 1, parts } })
  assert.equal(store.getSnapshot().drafts.agent.spec, null)
  assert.equal(store.submitDraft('agent').ok, true)
  advance(3500)
  assert.equal(store.getSnapshot().tasks[0].results[0].kind, 'text')
  assert.equal(store.getSnapshot().tasks[0].request.totalCost, 0)
})
