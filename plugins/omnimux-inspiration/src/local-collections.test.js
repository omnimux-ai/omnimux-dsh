import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStore } from './local-store.js'

const roots = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function setup(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'inspiration-collections-'))
  roots.push(dir)
  const paths = { dir, libraryFile: join(dir, 'library.json'), mediaDir: join(dir, 'media'), coversDir: join(dir, 'media/covers'), videosDir: join(dir, 'media/videos'), imagesDir: join(dir, 'media/images') }
  const store = createLocalStore({ paths, recycleFile: async () => assert.fail('collection operations must not recycle media'), ...options })
  for (let n = 1; n <= 8; n++) store.add({ id: `item-${n}`, title: `参考${n}`, source_platform: n === 1 ? 'youtube' : 'x', content: n === 2 ? '搜索成员内容' : '', created_at: `2026-01-0${n}T00:00:00.000Z` })
  return { store, paths, bytes: () => readFileSync(paths.libraryFile, 'utf8') }
}
const hasStatus = (status) => (error) => error.status === status

describe('local inspiration collections', () => {
  it('loads old files, persists ordered local members and preserves every old mutation path', async () => {
    const { store, paths, bytes } = setup()
    const legacy = JSON.parse(bytes())
    delete legacy.collections
    legacy.extra = { kept: true }
    writeFileSync(paths.libraryFile, JSON.stringify(legacy))
    assert.deepEqual(store.collections(), { collections: [], collection_names: [] })
    const result = store.createCollection('  我的参考  ', ['item-2', 'item-1', 'item-2'])
    assert.equal(result.data.title, '我的参考')
    assert.deepEqual(result.data.item_ids, ['item-2', 'item-1'])
    assert.equal(result.data.item_count, 2)
    store.add({ id: 'later', title: '后来加入' })
    store.update('item-2', { content: '编辑后的正文', is_favorite: true, creation_draft: { text: '保留草稿' } })
    await store.replace('item-1', { title: '重新导入', tags: ['新标签'] })
    const reopened = createLocalStore({ paths })
    assert.deepEqual(reopened.collections().collections[0].item_ids, ['item-2', 'item-1'])
    assert.equal(reopened.collections().collections[0].preview_items[0].content, '编辑后的正文')
    assert.deepEqual(JSON.parse(bytes()).extra, { kept: true })
    await store.delete('item-2')
    assert.deepEqual(store.collections().collections[0].item_ids, ['item-1'])
    await store.deleteBatch(['item-1', 'unknown'])
    assert.equal(store.collections().collections[0].item_count, 0)
    assert.equal(store.collections().collections.length, 1)
  })

  it('filters root rows before paging and keeps old all-items semantics and collection member order', () => {
    const { store } = setup()
    const group = store.createCollection('旅行创意', ['item-2', 'item-1', 'item-8', 'item-7']).data
    const root = store.list({ root_only: true, page: 2, page_size: 2 })
    assert.equal(root.total, 4)
    assert.equal(root.page_size, 2)
    assert.deepEqual(root.items.map((item) => item.id), ['item-4', 'item-3'])
    assert.equal(root.collections[0].item_count, 4)
    assert.deepEqual(root.collections[0].preview_items.map((item) => item.id), ['item-2', 'item-1', 'item-8'])
    assert.deepEqual(root.collection_names, ['旅行创意'])
    assert.equal(store.list().total, 8)
    assert.equal(store.list().collections, undefined)
    const inside = store.list({ collection_id: group.id, sort: 'views', page: 2, page_size: 2 })
    assert.deepEqual(inside.items.map((item) => item.id), ['item-8', 'item-7'])
    assert.equal(inside.collection.id, group.id)
    assert.equal(store.list({ root_only: true, q: '旅行' }).collections.length, 1)
    const byMember = store.list({ root_only: true, q: '搜索成员' })
    assert.equal(byMember.total, 0)
    assert.equal(byMember.collections.length, 1)
    assert.equal(byMember.collections[0].preview_items.length, 3)
    assert.deepEqual(store.list({ root_only: true, q: '不匹配' }).collections, [])
    assert.equal(store.list({ root_only: true, platform: 'youtube' }).collections.length, 1)
    assert.equal(store.list({ root_only: true, q: '旅行', platform: 'tiktok' }).collections.length, 0)
    assert.throws(() => store.list({ collection_id: 'missing' }), hasStatus(404))
  })

  it('derives read-only membership for get/list/snapshots after re-import without persisting it to items', async () => {
    const { store, paths, bytes } = setup()
    const group = store.createCollection('重新导入归属', ['item-1', 'item-2']).data
    assert.equal(store.get('item-1').collection_id, group.id)
    assert.equal(Object.hasOwn(store.get('item-3'), 'collection_id'), false)
    assert.equal(store.list().items.find((row) => row.id === 'item-1').collection_id, group.id)
    assert.ok(store.list({ collection_id: group.id }).items.every((row) => row.collection_id === group.id))
    assert.ok(store.list({ root_only: true }).items.every((row) => !Object.hasOwn(row, 'collection_id')))
    const snapshot = store.snapshotForRead()
    store.cacheReadSnapshot(snapshot)
    assert.equal(store.get('item-1', snapshot).collection_id, group.id)
    await store.replace('item-1', { title: '重新导入已完成' })
    assert.equal(store.get('item-1').collection_id, group.id)
    assert.equal(store.get('item-1').title, '重新导入已完成')
    store.update('item-1', { ...store.get('item-1'), collection_id: 'forged-collection' })
    assert.equal(store.get('item-1').collection_id, group.id)
    assert.ok(JSON.parse(bytes()).items.every((row) => !Object.hasOwn(row, 'collection_id')))
    const latest = store.snapshotForRead()
    store.cacheReadSnapshot(latest)
    const removed = createLocalStore({ paths }).removeCollectionItems(group.id, ['item-1'])
    assert.equal(Object.hasOwn(store.get('item-1', latest), 'collection_id'), false)
    assert.equal(Object.hasOwn(store.list().items.find((row) => row.id === 'item-1'), 'collection_id'), false)
    assert.equal(createLocalStore({ paths }).get('item-2').collection_id, group.id)
    assert.equal(removed.data.item_count, 1)
  })

  it('rejects invalid names and foreign/missing members atomically, and appends duplicate same-group members once', () => {
    const { store, bytes } = setup()
    for (const title of ['', '  ', '字'.repeat(21), '😀'.repeat(21), null]) assert.throws(() => store.createCollection(title, ['item-1', 'item-2']), hasStatus(400))
    const group = store.createCollection('😀'.repeat(20), ['item-1', 'item-2']).data
    const second = store.createCollection('第二组', ['item-3', 'item-4']).data
    const original = bytes()
    for (const work of [
      () => store.createCollection(group.title, ['item-5', 'item-6']),
      () => store.createCollection('重复素材', ['item-5', 'item-5']),
      () => store.createCollection('云端素材', ['item-5', 'cloud-only']),
      () => store.addCollectionItems(group.id, ['item-5', 'item-3']),
      () => store.addCollectionItems(group.id, ['item-5', 'missing']),
      () => store.renameCollection(group.id, second.title),
    ]) { assert.throws(work); assert.equal(bytes(), original) }
    const joined = store.addCollectionItems(group.id, ['item-2', 'item-5', 'item-5'])
    assert.deepEqual(joined.data.item_ids, ['item-1', 'item-2', 'item-5'])
    const same = store.addCollectionItems(group.id, ['item-5'])
    assert.equal(same.undo_token, null)
    const removed = store.removeCollectionItems(group.id, ['item-1', 'item-2', 'item-5'])
    assert.equal(removed.data.item_count, 0)
    assert.equal(store.get('item-1').title, '参考1')
    assert.equal(store.list({ root_only: true }).collections.length, 2)
  })

  it('undoes creation and relationship edits without overwriting new rows or newer item fields', () => {
    const { store } = setup()
    const created = store.createCollection('创建撤销', ['item-1', 'item-2'])
    store.update('item-1', { content: '较新的正文', is_favorite: true, analysis_results: { body: { status: 'done' } } })
    store.add({ id: 'new', title: '操作后新增' })
    store.undoCollection(created.undo_token)
    assert.equal(store.collections().collections.length, 0)
    assert.equal(store.get('item-1').content, '较新的正文')
    assert.equal(store.get('item-1').is_favorite, true)
    assert.equal(store.get('new').title, '操作后新增')
    assert.throws(() => store.undoCollection(created.undo_token), hasStatus(409))
    const group = store.createCollection('原名称', ['item-1', 'item-2']).data
    const rename = store.renameCollection(group.id, '新名称')
    store.undoCollection(rename.undo_token)
    assert.equal(store.collections().collections[0].title, '原名称')
    const added = store.addCollectionItems(group.id, ['item-3'])
    store.undoCollection(added.undo_token)
    assert.deepEqual(store.collections().collections[0].item_ids, ['item-1', 'item-2'])
    const removed = store.removeCollectionItems(group.id, ['item-1'])
    store.undoCollection(removed.undo_token)
    assert.deepEqual(store.collections().collections[0].item_ids, ['item-1', 'item-2'])
  })

  it('refuses expired, restarted, intervened, deleted-member and claimed-member undo rather than reviving data', async () => {
    const { store, paths, bytes } = setup()
    const created = store.createCollection('第一组', ['item-1', 'item-2'])
    const group = created.data
    store.renameCollection(group.id, '已经改名')
    let original = bytes()
    assert.throws(() => store.undoCollection(created.undo_token), hasStatus(409))
    assert.equal(bytes(), original)
    const removed = store.removeCollectionItems(group.id, ['item-1'])
    await store.delete('item-1')
    original = bytes()
    assert.throws(() => store.undoCollection(removed.undo_token), hasStatus(409))
    assert.equal(bytes(), original)
    assert.equal(store.get('item-1'), null)
    store.add({ id: 'item-1', title: '重新建立的同名ID' })
    assert.throws(() => store.undoCollection(removed.undo_token), hasStatus(409))
    const more = store.addCollectionItems(group.id, ['item-3'])
    await store.deleteBatch(['item-3'])
    assert.throws(() => store.undoCollection(more.undo_token), hasStatus(409))
    const released = store.removeCollectionItems(group.id, ['item-2'])
    store.createCollection('另一组', ['item-2', 'item-4'])
    assert.throws(() => store.undoCollection(released.undo_token), hasStatus(409))
    const renamed = store.renameCollection(group.id, '重启前')
    assert.throws(() => createLocalStore({ paths }).undoCollection(renamed.undo_token), hasStatus(409))
    const expired = createLocalStore({ paths, collectionUndoTtlMs: -1 })
    const operation = expired.renameCollection(group.id, '过期操作')
    assert.throws(() => expired.undoCollection(operation.undo_token), hasStatus(409))
  })

  it('keeps concurrent import completions, item edits and collection mutations without dropping relationships', async () => {
    const { store } = setup()
    const group = store.createCollection('并行操作', ['item-1', 'item-2']).data
    await Promise.all([
      store.replace('item-1', { title: '完成导入一' }),
      store.replace('item-2', { title: '完成导入二' }),
      Promise.resolve().then(() => store.addCollectionItems(group.id, ['item-3'])),
      Promise.resolve().then(() => store.update('item-4', { content: '保留分析结果' })),
    ])
    assert.deepEqual(store.collections().collections[0].item_ids, ['item-1', 'item-2', 'item-3'])
    assert.equal(store.get('item-1').title, '完成导入一')
    assert.equal(store.get('item-2').title, '完成导入二')
    assert.equal(store.get('item-4').content, '保留分析结果')
  })

  it('fails closed on corrupted or unwritable storage without changing original bytes or issuing usable undo', () => {
    const { store, paths, bytes } = setup()
    const valid = bytes()
    for (const invalid of ['{broken', '{"items": {}}', '{"items": [], "collections": {}}']) {
      writeFileSync(paths.libraryFile, invalid)
      for (const work of [() => store.add({ title: '禁止覆盖' }), () => store.update('item-1', { title: '禁止覆盖' }), () => store.createCollection('禁止覆盖', ['item-1', 'item-2'])]) assert.throws(work, hasStatus(500))
      assert.equal(bytes(), invalid)
    }
    writeFileSync(paths.libraryFile, valid)
    const original = bytes()
    const blockedParent = join(paths.dir, 'blocked-parent')
    writeFileSync(blockedParent, 'ordinary-file')
    const writeFailure = createLocalStore({ paths: { ...paths, imagesDir: join(blockedParent, 'images') } })
    assert.throws(() => writeFailure.createCollection('无法写入', ['item-1', 'item-2']))
    assert.equal(bytes(), original)
    // A directory at the target path reliably fails even when tests run as root.
    const blocked = createLocalStore({ paths: { ...paths, libraryFile: paths.dir } })
    assert.throws(() => blocked.createCollection('不可写', ['item-1', 'item-2']), hasStatus(500))
    assert.equal(bytes(), original)
    const futurePaths = { ...paths, dir: join(paths.dir, 'blocked'), libraryFile: join(paths.dir, 'blocked/library.json') }
    writeFileSync(futurePaths.dir, 'ordinary-file')
    const cannotCreate = createLocalStore({ paths: futurePaths })
    assert.throws(() => cannotCreate.add({ title: '不可写路径' }))
    assert.equal(bytes(), original)
  })
})
