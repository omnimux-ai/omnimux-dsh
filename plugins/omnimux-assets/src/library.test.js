import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createLibraryStore } from './library.js'
import { createMappingStore } from './mappings.js'
import { AssetsError } from './mappings.js'
import { DISK_HEADROOM_BYTES, copyIntoVault } from './ingest.js'

let root
let realFile

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'assets-library-'))
  realFile = join(root, 'hero.png')
  writeFileSync(realFile, 'png')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function makeStore() {
  return createLibraryStore({
    paths: {
      dir: join(root, 'store'),
      libraryFile: join(root, 'store', 'library.json'),
      filesDir: join(root, 'store', 'data', 'files'),
    },
  })
}

describe('LibraryStore add/list', () => {
  it('creates a named character with no files', async () => {
    const store = makeStore()
    const asset = await store.add({ name: '林晓', type: 'character', description: '冷白皮长直发' })
    assert.match(asset.id, /^ast_[0-9a-f]{8}$/)
    assert.equal(asset.type, 'character')
    assert.equal(asset.handle, '林晓')
    assert.equal(asset.cite, '@角色/林晓')
    assert.equal(asset.files.length, 0)
    assert.equal(store.revision(), 1)
  })

  it('falls into custom when type is omitted', async () => {
    const store = makeStore()
    const asset = await store.add({ name: '未分类草稿' })
    assert.equal(asset.type, 'custom')
  })

  it('rejects blank names, slashes, and duplicates', async () => {
    const store = makeStore()
    await assert.rejects(() => store.add({ name: '  ' }), (error) => error.code === 'name-required')
    await assert.rejects(() => store.add({ name: 'a/b' }), (error) => error.code === 'name-invalid')
    await store.add({ name: '林晓', type: 'character' })
    await assert.rejects(() => store.add({ name: '林晓', type: 'scene' }), (error) => error.code === 'name-conflict')
  })

  it('search hits description and tags', async () => {
    const store = makeStore()
    await store.add({ name: '林晓', type: 'character', description: '冷白皮', tags: ['女主'] })
    await store.add({ name: '雨夜便利店', type: 'scene', description: '霓虹' })
    assert.equal(store.list({ query: '冷白' }).length, 1)
    assert.equal(store.list({ query: '女主' })[0].name, '林晓')
    assert.equal(store.list({ type: 'scene' }).length, 1)
  })
})

describe('LibraryStore copy-on-ingest', () => {
  it('copies the source and keeps serving after the original is deleted', async () => {
    const store = makeStore()
    const asset = await store.add({
      name: '定妆',
      type: 'character',
      files: [{ real_path: realFile }],
    })
    assert.equal(asset.files.length, 1)
    assert.equal(asset.files[0].relative_path.startsWith(`data/files/${asset.id}/`), true)
    assert.equal(asset.files[0].relative_path.includes('/Users'), false)
    assert.notEqual(asset.files[0].real_path, realFile)
    assert.equal(readFileSync(asset.files[0].real_path, 'utf8'), 'png')
    const ledger = JSON.parse(readFileSync(join(root, 'store', 'library.json'), 'utf8'))
    assert.equal(JSON.stringify(ledger).includes('/Users'), false)
    assert.equal(ledger.assets[0].files[0].relative_path, asset.files[0].relative_path)
    assert.equal(ledger.assets[0].files[0].real_path, undefined)

    rmSync(realFile)
    const view = store.getView(asset.id)
    assert.equal(view.files.length, 1)
    assert.equal(readFileSync(view.files[0].real_path, 'utf8'), 'png')
  })

  it('skips missing paths on create and hides files whose managed copy vanishes', async () => {
    const store = makeStore()
    const missingAtCreate = join(root, 'never-there.jpg')
    const asset = await store.add({
      name: '定妆',
      type: 'character',
      files: [{ real_path: realFile }, { real_path: missingAtCreate }],
    })
    assert.equal(asset.files.length, 1)

    const gone = join(root, 'gone.jpg')
    writeFileSync(gone, 'jpg')
    const updated = await store.update(asset.id, { files: [{ real_path: realFile }, { real_path: gone }] })
    assert.equal(updated.files.length, 2)
    rmSync(updated.files[1].real_path)
    const view = store.getView(asset.id)
    assert.equal(view.files.length, 1)
    assert.equal(view.missing_file_count, 1)
    assert.equal(statSync(realFile).isFile(), true)
  })

  it('keeps a folder as one file ref and lists one directory layer at a time', async () => {
    const store = makeStore()
    const pack = join(root, 'pack')
    mkdirSync(join(pack, 'looks'), { recursive: true })
    writeFileSync(join(pack, 'cover.png'), 'png')
    writeFileSync(join(pack, 'looks', 'front.png'), 'png')
    const asset = await store.add({ name: '风格包A', type: 'style', files: [{ real_path: pack }] })
    assert.equal(asset.files.length, 1)
    assert.equal(asset.files[0].kind, 'directory')
    const rootLayer = store.listFileEntries(asset.id, asset.files[0].id, '')
    assert.equal(rootLayer.entries.some((row) => row.name === 'cover.png' && !row.is_dir), true)
    assert.equal(rootLayer.entries.some((row) => row.name === 'looks' && row.is_dir), true)
    assert.equal(rootLayer.entries.some((row) => row.name === 'front.png'), false)
    const nested = store.listFileEntries(asset.id, asset.files[0].id, 'looks')
    assert.deepEqual(nested.entries.map((row) => row.name), ['front.png'])
    const preview = store.resolvePreview(asset.id, asset.files[0].id, 'looks/front.png')
    assert.equal(preview.mime, 'image/png')
    assert.equal(preview.absolutePath.endsWith('front.png'), true)
    assert.throws(() => store.resolvePreview(asset.id, asset.files[0].id, ''), (error) => error.code === 'path-not-dir')
    assert.throws(
      () => store.listFileEntries(asset.id, asset.files[0].id, '../'),
      (error) => error.code === 'path-denied' || error.code === 'path-not-found',
    )
  })

  it('resolves an entry path for reveal without leaving the file root', async () => {
    const store = makeStore()
    const pack = join(root, 'pack-reveal')
    mkdirSync(join(pack, 'looks'), { recursive: true })
    writeFileSync(join(pack, 'cover.png'), 'png')
    writeFileSync(join(pack, 'looks', 'front.png'), 'png')
    const asset = await store.add({ name: '风格包B', type: 'style', files: [{ real_path: pack }] })
    const fileId = asset.files[0].id

    const folder = store.resolveEntryPath(asset.id, fileId, '')
    assert.equal(folder.isDirectory, true)
    assert.equal(folder.absolutePath.startsWith(join(root, 'store')), true)

    const nested = store.resolveEntryPath(asset.id, fileId, 'looks')
    assert.equal(nested.isDirectory, true)
    assert.equal(nested.absolutePath.endsWith('looks'), true)

    const file = store.resolveEntryPath(asset.id, fileId, 'cover.png')
    assert.equal(file.isDirectory, false)
    assert.equal(file.absolutePath.endsWith('cover.png'), true)

    assert.throws(() => store.resolveEntryPath(asset.id, fileId, '../../..'), (error) => error.code === 'path-denied')
    assert.throws(() => store.resolveEntryPath('ast_missing', fileId, ''), (error) => error.code === 'asset-not-found')
    assert.throws(() => store.resolveEntryPath(asset.id, 'nope', ''), (error) => error.code === 'path-not-found')

    const single = await store.add({ name: '单文件', type: 'custom', files: [{ real_path: realFile }] })
    assert.throws(
      () => store.resolveEntryPath(single.id, single.files[0].id, 'nested.png'),
      (error) => error.code === 'path-not-dir',
    )
    assert.equal(store.resolveEntryPath(single.id, single.files[0].id, '').isDirectory, false)
  })

  it('remove recycles the managed copy and never unlinks the original', async () => {
    const store = makeStore()
    const asset = await store.add({ name: '林晓', files: [{ real_path: realFile }] })
    const managed = asset.files[0].real_path
    assert.equal(existsSync(managed), true)
    store.remove(asset.id)
    assert.equal(store.list().length, 0)
    assert.equal(statSync(realFile).isFile(), true)
    assert.equal(existsSync(managed), false)
    assert.equal(existsSync(join(root, 'store', 'data', 'files', asset.id)), false)
  })
})

describe('LibraryStore mapping migrate', () => {
  it('turns each mapping into a custom path-ref asset then copies on list', async () => {
    const mappings = createMappingStore({
      paths: {
        mappingsFile: join(root, 'store', 'mappings.json'),
        scansDir: join(root, 'store', 'scans'),
      },
    })
    const dir = join(root, 'brand')
    mkdirSync(dir)
    writeFileSync(join(dir, 'logo.png'), 'png')
    mappings.add(dir, '品牌素材')
    const store = makeStore()
    const result = store.migrateMappings(mappings)
    assert.equal(result.migrated, 1)
    const listed = store.list()
    assert.equal(listed.length, 1)
    assert.equal(listed[0].type, 'custom')
    assert.equal(listed[0].source, 'migrated-mapping')
    assert.equal(listed[0].files[0].relative_path.startsWith(`data/files/${listed[0].id}/`), true)
    assert.notEqual(listed[0].files[0].real_path, dir)
    const second = store.migrateMappings(mappings)
    assert.equal(second.migrated, 0)
    assert.equal(store.list().length, 1)
  })
})

describe('copyIntoVault disk + escape', () => {
  it('throws disk-space-insufficient when free is below headroom', async () => {
    await assert.rejects(
      () => copyIntoVault({
        sourceAbs: realFile,
        destDir: join(root, 'store', 'data', 'files', 'ast_x'),
        vaultRoot: join(root, 'store'),
        statfs: () => ({ bavail: 1, bsize: 1 }),
      }),
      (error) => error instanceof AssetsError && error.code === 'disk-space-insufficient',
    )
    const copied = await copyIntoVault({
      sourceAbs: realFile,
      destDir: join(root, 'store', 'data', 'files', 'ast_ok'),
      vaultRoot: join(root, 'store'),
      statfs: () => ({ bavail: DISK_HEADROOM_BYTES + 10_000, bsize: 1 }),
    })
    assert.equal(copied.relativePath.startsWith('data/files/ast_ok/'), true)
  })

  it('refuses destinations that escape the vault', async () => {
    await assert.rejects(
      () => copyIntoVault({
        sourceAbs: realFile,
        destDir: join(root, 'outside'),
        vaultRoot: join(root, 'store'),
      }),
      (error) => error instanceof AssetsError && error.code === 'path-denied',
    )
  })
})

describe('LibraryStore appendFiles', () => {
  it('appends refs without re-copying the existing ones', async () => {
    const store = makeStore()
    const asset = await store.add({ name: '追加角色', type: 'character', files: [{ real_path: realFile }] })
    const firstId = asset.files[0].id
    const second = join(root, 'second.png')
    writeFileSync(second, 'png2')

    const appended = await store.appendFiles(asset.id, [{ real_path: second }])
    assert.equal(appended.files.length, 2)
    assert.equal(appended.files[0].id, firstId)
    assert.equal(appended.files[0].relative_path, asset.files[0].relative_path)
    assert.equal(readFileSync(appended.files[0].real_path, 'utf8'), 'png')
    assert.equal(readFileSync(appended.files[1].real_path, 'utf8'), 'png2')
    // 既有引用没有被重拷：受管目录里恰好两份文件
    assert.equal(readdirSync(join(root, 'store', 'data', 'files', asset.id)).length, 2)
    assert.equal(store.get(asset.id).files.length, 2)
  })

  it('keeps the original cover when files are appended', async () => {
    const store = makeStore()
    const asset = await store.add({ name: '封面不动', type: 'character', files: [{ real_path: realFile }] })
    const coverId = asset.cover_file_id
    const second = join(root, 'second.png')
    writeFileSync(second, 'png2')

    const appended = await store.appendFiles(asset.id, [{ real_path: second }])
    assert.equal(appended.cover_file_id, coverId)
    assert.equal(appended.cover.id, coverId)
    assert.equal(store.get(asset.id).cover_file_id, coverId)
  })

  it('is a no-op for an empty list and for paths that do not exist', async () => {
    const store = makeStore()
    const asset = await store.add({ name: '空追加', type: 'character', files: [{ real_path: realFile }] })
    const before = store.revision()

    const empty = await store.appendFiles(asset.id, [])
    assert.equal(empty.files.length, 1)
    assert.equal(store.revision(), before)

    const missing = await store.appendFiles(asset.id, [{ real_path: join(root, 'never-there.png') }])
    assert.equal(missing.files.length, 1)
    assert.equal(store.revision(), before)
    assert.equal(readdirSync(join(root, 'store', 'data', 'files', asset.id)).length, 1)
  })

  it('throws asset-not-found for an unknown asset id', async () => {
    const store = makeStore()
    await assert.rejects(
      () => store.appendFiles('ast_missing', [{ real_path: realFile }]),
      (error) => error instanceof AssetsError && error.code === 'asset-not-found',
    )
  })

  it('adds a folder as exactly one directory ref and keeps the image cover', async () => {
    const store = makeStore()
    const asset = await store.add({ name: '多视角', type: 'character', files: [{ real_path: realFile }] })
    const coverId = asset.cover_file_id
    const pack = join(root, 'views')
    mkdirSync(join(pack, 'looks'), { recursive: true })
    writeFileSync(join(pack, 'front.png'), 'png')

    const appended = await store.appendFiles(asset.id, [{ real_path: pack }])
    assert.equal(appended.files.length, 2)
    assert.equal(appended.files[1].kind, 'directory')
    assert.equal(appended.cover_file_id, coverId)
    assert.equal(appended.cover.kind, 'image')
    const entries = store.listFileEntries(asset.id, appended.files[1].id, '')
    assert.equal(entries.entries.some((row) => row.name === 'front.png' && !row.is_dir), true)
  })
})

describe('LibraryStore findBySource', () => {
  it('matches exactly, misses to null, and prefers the most recently updated', async () => {
    const store = makeStore()
    const first = await store.add({ name: '来源一', type: 'character', source: 'cloud:abc' })
    const found = store.findBySource('cloud:abc')
    assert.equal(found.id, first.id)
    assert.equal(found.source, 'cloud:abc')
    assert.equal(store.findBySource('cloud:other'), null)
    assert.equal(store.findBySource('cloud:ab'), null)

    // 返回浅拷贝：改它不污染账本
    found.name = '被改写'
    assert.equal(store.get(first.id).name, '来源一')

    await new Promise((resolve) => { setTimeout(resolve, 10) })
    const second = await store.add({ name: '来源二', type: 'character', source: 'cloud:abc' })
    assert.equal(store.findBySource('cloud:abc').id, second.id)
  })
})
