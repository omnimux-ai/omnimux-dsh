import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StudioStore } from '../src/client/studio-store.js'
import { createDocument, validateDocument, validateToken } from '../src/client/editor-document.js'

const malformed = [null, {}, { version: 2, parts: [] }, { version: 1, parts: null }, { version: 1, parts: [null] }, { version: 1, parts: [{ id: 'a', kind: 'text', text: 1 }] }, { version: 1, parts: [{ id: 'a', kind: 'unknown', value: 'x' }] }, { version: 1, parts: [{ id: 'a', kind: 'text', text: 'x' }, { id: 'a', kind: 'text', text: 'y' }] }]

test('malformed external documents are rejected without publishing or losing the current draft', () => {
  const store = new StudioStore('scope')
  for (const document of malformed) {
    assert.equal(validateDocument(document), false)
    const before = store.getSnapshot()
    store.updateDraft('video', { document })
    assert.equal(store.getSnapshot(), before)
    assert(store.validateDraft({ ...before.drafts.video, document }).errors.length > 0)
  }
  assert.equal(validateToken({ value: 17 }).validation, 'invalid')
  store.dispose()
})

test('reference slots retain portrait and reject cross-mode references without charging', () => {
  const store = new StudioStore('scope')
  const ref = { id: crypto.randomUUID(), slot: 'edit-portrait', kind: 'image', source: 'fixture', fixtureId: 'mock:sample-image', fileId: null, name: 'portrait', mime: 'image/jpeg' }
  store.updateDraft('video', { document: createDocument('portrait edit'), references: [ref] })
  assert.equal(store.submitDraft('video').ok, true)
  assert.deepEqual(store.getSnapshot().tasks[0].request.draft.references, [ref])
  store.updateDraft('video', { submode: 'firstlast' })
  const before = store.getSnapshot()
  assert.equal(store.submitDraft('video').ok, false)
  assert.equal(store.getSnapshot(), before)
  store.dispose()
})

test('synchronous malformed adapter results fail and refund exactly once', () => {
  for (const outcome of [null, { status: 'completed', results: [{}] }, { status: 'completed', results: [{ id: 'x', kind: 'text', fixtureId: 'mock:sample-text', mediaState: 'ready', actualMetadata: {} }] }]) {
    let cancelled = 0
    const store = new StudioStore('scope', { start(_request, _signal, callback) {
      callback(outcome)
      callback(outcome)
      return { pause() {}, resume() {}, cancel() { cancelled++ } }
    } })
    store.updateDraft('video', { document: createDocument('valid prompt') })
    assert.equal(store.submitDraft('video').ok, true)
    assert.equal(store.getSnapshot().tasks[0].status, 'failed')
    assert.equal(store.getSnapshot().mockCredits, 3463)
    assert.equal(store.jobs.size, 0)
    assert.equal(cancelled, 1)
    store.dispose()
  }
})
