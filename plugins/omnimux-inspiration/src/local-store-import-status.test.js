import assert from 'node:assert/strict'
import { after, beforeEach, describe, it } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStore } from './local-store.js'

/**
 * Gate for the persistence half of the background-import contract.
 *
 * `buildRow` is a whitelist constructor, not a spread: a field that is missing
 * from it is dropped on the next `writeAll()`. The failure mode is nasty enough to
 * deserve its own gate — `update()` merges the patch in memory, so the row looks
 * correct for the rest of the request and only loses the field once it is read
 * back from disk. A background import would answer 202 and then sit at
 * "resolving" forever with nothing anywhere reporting an error.
 */
const IMPORT_FIELDS = ['import_status', 'import_stage', 'import_error', 'import_started_at']

describe('local store — import status fields survive the row whitelist', () => {
  let tmp
  let paths

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'omnimux-store-import-'))
    paths = {
      dir: tmp,
      libraryFile: join(tmp, 'library.json'),
      mediaDir: join(tmp, 'media'),
      coversDir: join(tmp, 'media', 'covers'),
      videosDir: join(tmp, 'media', 'videos'),
      imagesDir: join(tmp, 'media', 'images'),
    }
  })

  after(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('persists them through add()', () => {
    const store = createLocalStore({ paths })
    const startedAt = '2026-09-12T08:00:00.000Z'
    const created = store.add({
      title: 'https://x.com/creator/status/1',
      source_url: 'https://x.com/creator/status/1',
      import_status: 'importing',
      import_stage: 'resolving',
      import_started_at: startedAt,
    })

    // Rebuilt from disk, so this can only pass if `buildRow` kept the fields.
    const persisted = createLocalStore({ paths }).get(created.id)
    assert.equal(persisted.import_status, 'importing')
    assert.equal(persisted.import_stage, 'resolving')
    assert.equal(persisted.import_started_at, startedAt)
    assert.equal(persisted.import_error, null)
  })

  it('persists them through update()', () => {
    const store = createLocalStore({ paths })
    const created = store.add({ title: 'row', source_url: 'https://x.com/creator/status/2' })
    for (const field of IMPORT_FIELDS) {
      assert.ok(field in created, `buildRow must declare ${field}`)
    }
    // A fresh row is a completed import, not a pending one.
    assert.equal(created.import_status, 'ready')
    assert.equal(created.import_stage, null)

    store.update(created.id, { import_status: 'importing', import_stage: 'downloading' })

    const persisted = createLocalStore({ paths }).get(created.id)
    assert.equal(persisted.import_status, 'importing')
    assert.equal(persisted.import_stage, 'downloading')
  })

  it('persists them through replace()', async () => {
    const store = createLocalStore({ paths })
    const created = store.add({
      title: 'row',
      type: 'link',
      source_url: 'https://x.com/creator/status/3',
      import_status: 'importing',
      import_stage: 'resolving',
      import_started_at: '2026-09-12T08:00:00.000Z',
    })

    await store.replace(created.id, {
      title: 'row',
      type: 'video',
      source_url: 'https://x.com/creator/status/3',
      import_status: 'failed',
      import_stage: null,
      import_error: '导入中断或超时，请重试',
    })

    const persisted = createLocalStore({ paths }).get(created.id)
    assert.equal(persisted.import_status, 'failed')
    assert.equal(persisted.import_stage, null)
    assert.equal(persisted.import_error, '导入中断或超时，请重试')
  })

  it('keeps a row written before the field existed readable', () => {
    const store = createLocalStore({ paths })
    const created = store.add({ title: 'legacy', source_url: 'https://x.com/creator/status/4' })
    // Rewrite the library the way an older build would have: no status fields at
    // all. Nothing in the store may require them to be present.
    const library = JSON.parse(readFileSync(paths.libraryFile, 'utf8'))
    for (const field of IMPORT_FIELDS) delete library.items[0][field]
    writeFileSync(paths.libraryFile, JSON.stringify(library), 'utf8')

    const reread = createLocalStore({ paths }).get(created.id)
    for (const field of IMPORT_FIELDS) {
      assert.equal(reread[field], undefined, `${field} must stay absent on a legacy row`)
    }
    // The read side is what supplies the default; the stored row stays untouched.
    assert.equal('import_status' in reread, false)
  })
})
