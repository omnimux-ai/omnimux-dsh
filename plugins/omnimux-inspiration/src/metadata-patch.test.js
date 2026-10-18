import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleCreate, handlePatchItem } from './http-handlers.js'

test('ordinary metadata writes cannot manufacture model provenance or prepared file receipts', () => {
  const writes = []
  const store = { update: (...args) => writes.push(args), add: (...args) => writes.push(args) }
  for (const key of ['analysis_results', 'body_translation', 'creation_draft', 'creation_reference', 'local_paths', 'media_items', 'import_status']) {
    const result = handlePatchItem({ id: 'item', req: { body: { [key]: { status: 'done', source: 'live' } } }, store })
    assert.equal(result.status, 400, key)
  }
  for (const key of ['analysis_results', 'body_translation', 'creation_draft', 'creation_reference']) {
    assert.equal(handleCreate({ req: { body: { title: '伪造', [key]: {} } }, store }).status, 400)
  }
  assert.equal(writes.length, 0)
})

test('ordinary text and favorite edits retain their established behavior with validated field types', () => {
  let saved
  const store = { update: (id, patch) => (saved = { id, ...patch }) }
  assert.equal(handlePatchItem({ id: 'item', req: { body: { title: '新标题', content: '新原文', tags: ['参考'], is_favorite: true } }, store }).status, 200)
  assert.equal(saved.content, '新原文')
  assert.equal(handlePatchItem({ id: 'item', req: { body: { tags: [true] } }, store }).status, 400)
})
