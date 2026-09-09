import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createMappingStore } from './mappings.js'

/** Temp-dir fixtures only; never touches the real ~/.dsh. */
let root
let realDir

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'assets-mappings-'))
  realDir = join(root, 'scan-target')
  mkdirSync(realDir)
  writeFileSync(join(realDir, 'hero.png'), 'png')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function makeStore() {
  return createMappingStore({
    paths: {
      mappingsFile: join(root, 'store', 'mappings.json'),
      scansDir: join(root, 'store', 'scans'),
    },
  })
}

describe('MappingStore add/list', () => {
  it('adds a mapping and returns a runtime view', () => {
    const store = makeStore()
    const mapping = store.add(realDir, '品牌素材')
    assert.match(mapping.id, /^map_[0-9a-f]{8}$/)
    assert.equal(mapping.real_path, realDir)
    assert.equal(mapping.last_scanned_at, null)
    assert.equal(store.revision(), 1)

    const views = store.list()
    assert.equal(views.length, 1)
    assert.equal(views[0].status, 'ok')
    assert.equal(views[0].file_count, 0)
    assert.equal(views[0].display_name, '品牌素材')
  })

  it('allows several mappings onto the same real path', () => {
    const store = makeStore()
    store.add(realDir, '素材 A')
    store.add(realDir, '素材 B')
    assert.equal(store.list().length, 2)
    assert.equal(store.revision(), 2)
  })

  it('rejects missing paths and blank names', () => {
    const store = makeStore()
    assert.throws(() => store.add(join(root, 'nope'), 'x'), (error) => error.code === 'path-not-found')
    assert.throws(() => store.add(realDir, '   '), (error) => error.code === 'name-required')
    assert.equal(store.revision(), 0)
  })

  it('accepts a file path as a file-kind mapping', () => {
    const store = makeStore()
    const mapping = store.add(join(realDir, 'hero.png'), '单图')
    assert.equal(mapping.kind, 'file')
    const view = store.getView(mapping.id)
    assert.equal(view.kind, 'file')
    assert.equal(view.status, 'ok')
    const dir = store.add(realDir, '目录')
    assert.equal(dir.kind, 'directory')
  })
})

describe('MappingStore rename/remove', () => {
  it('renames and bumps revision', () => {
    const store = makeStore()
    const mapping = store.add(realDir, 'old')
    const renamed = store.rename(mapping.id, 'new')
    assert.equal(renamed.display_name, 'new')
    assert.equal(store.revision(), 2)
    assert.throws(() => store.rename('map_missing', 'x'), (error) => error.code === 'mapping-not-found')
  })

  it('remove only deletes the record — real files stay untouched', () => {
    const store = makeStore()
    const mapping = store.add(realDir, '素材')
    store.writeScan(mapping.id, [{ name: 'hero.png' }])
    store.remove(mapping.id)
    assert.equal(store.list().length, 0)
    assert.equal(store.revision(), 2)
    // red line: the real directory and its files are still there
    const info = statSync(join(realDir, 'hero.png'))
    assert.equal(info.isFile(), true)
    // own scan cache was dropped too
    assert.equal(store.readScan(mapping.id), null)
    assert.throws(() => store.remove(mapping.id), (error) => error.code === 'mapping-not-found')
  })
})

describe('MappingStore scan cache + touchScan', () => {
  it('stores and reads scan caches, counts in views', () => {
    const store = makeStore()
    const mapping = store.add(realDir, '素材')
    assert.equal(store.readScan(mapping.id), null)
    const files = [{ name: 'hero.png', relative_path: 'hero.png' }]
    store.writeScan(mapping.id, files)
    assert.deepEqual(store.readScan(mapping.id), files)
    const view = store.getView(mapping.id)
    assert.equal(view.file_count, 1)
  })

  it('touchScan stamps last_scanned_at and bumps revision', () => {
    const store = makeStore()
    const mapping = store.add(realDir, '素材')
    store.touchScan(mapping.id)
    assert.equal(store.revision(), 2)
    const view = store.getView(mapping.id)
    assert.equal(typeof view.last_scanned_at, 'string')
    assert.notEqual(view.last_scanned_at, null)
  })
})

describe('MappingStore persistence', () => {
  it('persists 0600 and reloads across store instances', () => {
    const mappingsFile = join(root, 'store', 'mappings.json')
    const first = makeStore()
    first.add(realDir, '素材')
    const mode = statSync(mappingsFile).mode & 0o777
    assert.equal(mode, 0o600)

    const second = createMappingStore({
      paths: { mappingsFile, scansDir: join(root, 'store', 'scans') },
    })
    assert.equal(second.revision(), 1)
    assert.equal(second.list().length, 1)
    assert.equal(second.list()[0].display_name, '素材')
  })

  it('falls back to an empty registry on corrupted JSON', () => {
    const mappingsFile = join(root, 'store', 'mappings.json')
    mkdirSync(join(root, 'store'), { recursive: true })
    writeFileSync(mappingsFile, '{oops', { mode: 0o600 })
    const store = createMappingStore({
      paths: { mappingsFile, scansDir: join(root, 'store', 'scans') },
    })
    assert.equal(store.revision(), 0)
    assert.equal(store.list().length, 0)
    store.add(realDir, '恢复后的映射')
    const reopened = createMappingStore({
      paths: { mappingsFile, scansDir: join(root, 'store', 'scans') },
    })
    assert.equal(reopened.list().length, 1)
  })
})
