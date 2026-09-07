import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'node:test'
import { createRecordStore } from './store.js'
import { createMediaStore } from './media.js'

it('rejects incomplete disk records without rewriting or losing original data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'publish-boundary-'))
  const file = join(dir, 'records.json')
  try {
    const original = JSON.stringify({ schema: 1, revision: 8, records: [{ id: 'partial', type: 'video' }] })
    writeFileSync(file, original)
    assert.throws(() => createRecordStore({ paths: { recordsFile: file } }), { code: 'invalid-record' })
    assert.equal(readFileSync(file, 'utf8'), original)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

it('keeps unknown persisted task states without inventing publishing or success', () => {
  const dir = mkdtempSync(join(tmpdir(), 'publish-boundary-'))
  const file = join(dir, 'records.json')
  try {
    const store = createRecordStore({ paths: { recordsFile: file } })
    const record = store.create({ type: 'video' })
    const [task] = store.materialize(record.id, [{ id: 'official', platform: 'tiktok', provider: 'tiktok_direct' }])
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    raw.records[0].subtasks[0].status = 'future_state'
    writeFileSync(file, JSON.stringify(raw))
    const reloaded = createRecordStore({ paths: { recordsFile: file } })
    assert.equal(reloaded.getView(record.id).aggregate, 'draft')
    assert.equal(reloaded.getView(record.id).subtasks[0].status, 'future_state')
    assert.equal(reloaded.recover(), false)
    reloaded.updateTask(task.id, { status: 'published' })
    assert.equal(reloaded.getView(record.id).aggregate, 'published')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

it('keeps store methods and clone isolation stable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'publish-boundary-'))
  try {
    const store = createRecordStore({ paths: { recordsFile: join(dir, 'records.json') } })
    assert.deepEqual(Object.keys(store).sort(), [
      'create', 'get', 'getView', 'listViews', 'update', 'remove', 'assignAccounts', 'materialize',
      'updateTask', 'findTask', 'findTaskAnywhere', 'setUploads', 'setRecordError', 'recover', 'revision',
    ].sort())
    const record = store.create({ type: 'video', settings: { nested: { value: 1 } } })
    record.settings.nested.value = 9
    const copy = store.get(record.id)
    copy.settings.nested.value = 8
    assert.equal(store.getView(record.id).settings.nested.value, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

it('validates media disk rows without rewriting an incomplete index', () => {
  const dir = mkdtempSync(join(tmpdir(), 'publish-boundary-'))
  const file = join(dir, 'media.json')
  try {
    const original = JSON.stringify({ schema: 1, revision: 4, media: [{ sha256: 'incomplete' }] })
    writeFileSync(file, original)
    assert.throws(() => createMediaStore({ paths: { mediaIndexFile: file, mediaDir: join(dir, 'media') } }), { code: 'invalid-media' })
    assert.equal(readFileSync(file, 'utf8'), original)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
