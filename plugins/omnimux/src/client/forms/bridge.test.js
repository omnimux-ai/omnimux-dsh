import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createFormsBridge } from './bridge.js'
import { createAttachmentStore } from '../attachments/store.ts'
import { subscribeSessionPrefill, getPendingSessionPrefill, consumeSessionPrefill, resetSessionPrefill } from './session-prefill.js'
afterEach(resetSessionPrefill)
function fixture({ draft = '', failDraft = false, failMaterialize = false } = {}) {
  const store = createAttachmentStore()
  let created = 0, opened = 0, writes = 0, imports = 0
  const sessions = { list: { getSnapshot: () => ({ current: 'old' }), subscribe: () => () => {} },
    create: async ({sessionId}) => { created++; return sessionId }, open: () => { opened++ } }
  const workspaces = { list: { getSnapshot: () => ({ items: [{ workspaceId: 'w', title: 'Workspace', sessionIds: ['old'] }] }), subscribe: () => () => {} } }
  const bridge = createFormsBridge({ sessions, workspaces, store, uuid: () => 'new', window: {},
    request: async path => {
      if (path === '/materialize') { imports++; if (failMaterialize && imports === 1) throw new Error('temporary'); return { files: [{ assetId: 'a', name: 'a.png', kind: 'image', relativePath: 'assets/imported/a.png' }] } }
      return { files: [] }
    } })
  const stop = subscribeSessionPrefill(() => {
    const intent = getPendingSessionPrefill()
    if (intent) consumeSessionPrefill(intent, { sessionId: 'new', draft, inputActions: { setDraft(text) { if (failDraft) throw new Error('reject'); writes++; draft = text; queueMicrotask(() => consumeSessionPrefill(intent, { sessionId: 'new', draft, inputActions: {} })) } } })
  })
  const input = { requestId: 'r', workspaceId: 'w', prompt: 'Prompt', assetIds: ['a'] }
  return { bridge, store, input, stop, counts: () => ({ created, opened, writes, imports }) }
}
test('same request races create one session, imports one set, sets one draft and never sends', async t => {
  const f = fixture(); t.after(f.stop)
  const a = f.bridge.prepareDraft(f.input), b = f.bridge.prepareDraft(f.input)
  assert.equal(a,b)
  assert.deepEqual(await a, { ok: true, sessionId: 'new' })
  assert.deepEqual(await f.bridge.prepareDraft(f.input), { ok: true, sessionId: 'new' })
  assert.deepEqual(f.counts(), { created: 1, opened: 1, writes: 1, imports: 1 })
  assert.equal(f.store.getSnapshot('new').length, 1)
  assert.equal(f.store.getSnapshot('old').length, 0)
})
test('materialization retry retains preallocated session identity', async t => {
  const f = fixture({ failMaterialize: true }); t.after(f.stop)
  assert.equal((await f.bridge.prepareDraft(f.input)).ok, false)
  assert.equal((await f.bridge.prepareDraft(f.input)).ok, true)
  assert.equal(f.counts().created, 1)
})
test('protects target text before any attachment write', async t => {
  const f = fixture({ draft: 'existing' }); t.after(f.stop)
  assert.deepEqual(await f.bridge.prepareDraft(f.input), { ok: false, error: 'draft-protected' })
  assert.equal(f.store.getSnapshot('new').length, 0)
})
test('rolls back only newly attached files when official draft write throws', async t => {
  const f = fixture({ failDraft: true }); t.after(f.stop)
  assert.equal((await f.bridge.prepareDraft(f.input)).ok, false)
  assert.equal(f.store.getSnapshot('new').length, 0)
})
test('rejects reuse of request id for different content', async t => {
  const f = fixture(); t.after(f.stop)
  await f.bridge.prepareDraft(f.input)
  assert.deepEqual(await f.bridge.prepareDraft({ ...f.input, prompt: 'different' }), { ok: false, error: 'request-conflict' })
})
