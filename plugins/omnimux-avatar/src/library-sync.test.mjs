// 资产库同步：首次建档、二次追加、重名重试、多视角目录幂等与不可用路径。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { createLibrarySync } from './library-sync.js'
import { avatarMainImagePath, avatarMultiViewDir, avatarMultiViewImagePath, resolveAvatarPaths } from './paths.js'
import { AvatarError, createAvatarStore } from './store.js'

async function withEnv(t) {
  const home = await mkdtemp(join(tmpdir(), 'avatar-sync-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const paths = resolveAvatarPaths({ homeDir: home })
  const store = createAvatarStore({ paths })
  return { paths, store }
}

/** 假资产库：记录调用，支持按 source 查重与重名注入。 */
function fakeLibrary({ conflictOnFirstSave = false } = {}) {
  const calls = { save: [], attach: [] }
  const assets = new Map()
  let seq = 0
  const toRef = (path, index) => ({
    id: `fil_${index}`,
    real_path: path,
    original_name: basename(String(path).replace(/\/+$/, '')),
  })
  return {
    calls,
    assets,
    async saveTypedAsset(input) {
      calls.save.push(input)
      if (conflictOnFirstSave && calls.save.length === 1) {
        const error = new Error('an asset with this name already exists')
        error.code = 'name-conflict'
        throw error
      }
      const asset = {
        id: `ast_${(seq += 1)}`,
        name: input.name,
        type: input.type,
        description: input.description,
        tags: input.tags,
        source: input.source,
        files: (input.files ?? []).map(toRef),
      }
      assets.set(asset.id, asset)
      return { asset }
    },
    async attachFiles({ assetId, files }) {
      calls.attach.push({ assetId, files })
      const asset = assets.get(assetId)
      asset.files = [...asset.files, ...(files ?? []).map(toRef)]
      return { asset }
    },
    findBySource(source) {
      const hit = [...assets.values()].find((asset) => asset.source === source)
      return hit ? { ...hit, files: hit.files.map((file) => ({ ...file })) } : null
    },
  }
}

/** 造一个「已完成主图」的形象。 */
function withMainImage(store, paths, name) {
  const avatar = store.create({ name })
  const main = avatarMainImagePath(paths, avatar.id)
  mkdirSync(dirname(main), { recursive: true })
  writeFileSync(main, 'fake-main')
  store.addTask(avatar.id, {
    taskId: 'avt_task_00000001',
    kind: 'sheet',
    model: 'm',
    group: '',
    status: 'ready',
    taskRef: 'tr_1',
    destPath: main,
    error: null,
  })
  return { avatar, main }
}

const rejectsWith = (code, status) => (error) => {
  assert.ok(error instanceof AvatarError, `期望 AvatarError，实际 ${error?.name}`)
  assert.equal(error.code, code)
  if (status !== undefined) assert.equal(error.status, status)
  return true
}

test('首次同步建档：type=character、source 带形象 id、回写 assetId', async (t) => {
  const { paths, store } = await withEnv(t)
  const { avatar, main } = withMainImage(store, paths, '林晓')
  const library = fakeLibrary()
  const sync = createLibrarySync({ ctx: { get: () => undefined }, store, paths, assetLibrary: library })

  const result = await sync.syncSheet(avatar.id)
  assert.equal(result.created, true)
  assert.equal(result.assetId, 'ast_1')
  assert.equal(library.calls.save.length, 1)
  const input = library.calls.save[0]
  assert.equal(input.name, '林晓')
  assert.equal(input.type, 'character')
  assert.equal(input.source, `omnimux-avatar:${avatar.id}`)
  assert.deepEqual(input.files, [main])
  assert.deepEqual(input.tags, ['虚拟形象'])
  assert.equal(input.description, '虚拟形象 · 林晓')
  assert.equal(store.get(avatar.id).assetId, 'ast_1')
  assert.equal(library.calls.attach.length, 0)
})

test('第二次同步只追加文件，不新建资产', async (t) => {
  const { paths, store } = await withEnv(t)
  const { avatar, main } = withMainImage(store, paths, '二次同步')
  const library = fakeLibrary()
  const sync = createLibrarySync({ ctx: { get: () => undefined }, store, paths, assetLibrary: library })

  await sync.syncSheet(avatar.id)
  const second = await sync.syncSheet(avatar.id)
  assert.equal(second.created, false)
  assert.equal(second.assetId, 'ast_1')
  assert.equal(library.calls.save.length, 1)
  assert.equal(library.calls.attach.length, 1)
  assert.deepEqual(library.calls.attach[0], { assetId: 'ast_1', files: [main] })
  assert.equal(library.assets.get('ast_1').files.length, 2)
})

test('资产重名时按 (2) 重试，且名称不超过 40 字符', async (t) => {
  const { paths, store } = await withEnv(t)
  const longName = '长'.repeat(40)
  const { avatar } = withMainImage(store, paths, longName)
  const library = fakeLibrary({ conflictOnFirstSave: true })
  const sync = createLibrarySync({ ctx: { get: () => undefined }, store, paths, assetLibrary: library })

  const result = await sync.syncSheet(avatar.id)
  assert.equal(library.calls.save.length, 2)
  assert.equal(library.calls.save[0].name, longName)
  assert.equal(library.calls.save[1].name, `${'长'.repeat(36)} (2)`)
  assert.equal(library.calls.save[1].name.length, 40)
  assert.equal(result.assetId, 'ast_1')
  assert.equal(result.created, true)
})

test('多视角同步：挂目录、幂等，不覆盖封面', async (t) => {
  const { paths, store } = await withEnv(t)
  const { avatar, main } = withMainImage(store, paths, '多视角同步')
  const turnaround = avatarMultiViewImagePath(paths, avatar.id)
  mkdirSync(dirname(turnaround), { recursive: true })
  writeFileSync(turnaround, 'fake-multi')
  store.addTask(avatar.id, {
    taskId: 'avt_task_00000002',
    kind: 'multiview',
    model: 'm',
    group: '',
    status: 'ready',
    taskRef: 'tr_2',
    destPath: turnaround,
    error: null,
  })

  const library = fakeLibrary()
  const sync = createLibrarySync({ ctx: { get: () => undefined }, store, paths, assetLibrary: library })
  await sync.syncSheet(avatar.id)

  const first = await sync.syncMultiView(avatar.id)
  assert.equal(first.attached, true)
  assert.deepEqual(library.calls.attach[0], { assetId: 'ast_1', files: [avatarMultiViewDir(paths, avatar.id)] })

  const second = await sync.syncMultiView(avatar.id)
  assert.equal(second.attached, false)
  assert.equal(library.calls.attach.length, 1)

  // 封面仍是主图对应的第一条引用，目录只是追加。
  const asset = library.assets.get('ast_1')
  assert.equal(asset.files[0].real_path, main)
  assert.equal(asset.files.at(-1).original_name, '多视角')
})

test('status 是纯读：报告 assetId / hasSheet / hasMultiViewFolder', async (t) => {
  const { paths, store } = await withEnv(t)
  const { avatar } = withMainImage(store, paths, '状态形象')
  const library = fakeLibrary()
  const sync = createLibrarySync({ ctx: { get: () => undefined }, store, paths, assetLibrary: library })

  const before = sync.status(avatar.id)
  assert.deepEqual(before, { assetId: null, hasSheet: true, hasMultiViewFolder: false })
  assert.equal(store.get(avatar.id).assetId, null)
  assert.equal(library.calls.save.length, 0)

  await sync.syncSheet(avatar.id)
  const after = sync.status(avatar.id)
  assert.equal(after.assetId, 'ast_1')
  assert.equal(after.hasSheet, true)
  assert.equal(after.hasMultiViewFolder, false)
})

test('缺少 assetLibrary → 503 needs-assets', async (t) => {
  const { paths, store } = await withEnv(t)
  const { avatar } = withMainImage(store, paths, '无资产库')
  const sync = createLibrarySync({ ctx: { get: () => undefined }, store, paths })

  await assert.rejects(() => sync.syncSheet(avatar.id), rejectsWith('needs-assets', 503))
  await assert.rejects(() => sync.syncMultiView(avatar.id), rejectsWith('needs-assets', 503))
  assert.throws(() => sync.status(avatar.id), rejectsWith('needs-assets', 503))
})

test('没有已完成主图时拒绝同步', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '无主图同步' })
  const sync = createLibrarySync({ ctx: { get: () => undefined }, store, paths, assetLibrary: fakeLibrary() })

  await assert.rejects(() => sync.syncSheet(avatar.id), rejectsWith('invalid_request', 400))
})

test('未建档时 syncMultiView 先自动建档', async (t) => {
  const { paths, store } = await withEnv(t)
  const { avatar } = withMainImage(store, paths, '自动建档')
  const turnaround = avatarMultiViewImagePath(paths, avatar.id)
  mkdirSync(dirname(turnaround), { recursive: true })
  writeFileSync(turnaround, 'fake-multi')
  store.addTask(avatar.id, {
    taskId: 'avt_task_00000003',
    kind: 'multiview',
    model: 'm',
    group: '',
    status: 'ready',
    taskRef: 'tr_3',
    destPath: turnaround,
    error: null,
  })

  const library = fakeLibrary()
  const sync = createLibrarySync({ ctx: { get: () => undefined }, store, paths, assetLibrary: library })
  const result = await sync.syncMultiView(avatar.id)
  assert.equal(library.calls.save.length, 1)
  assert.equal(result.attached, true)
  assert.equal(store.get(avatar.id).assetId, 'ast_1')
})

test('资产库抛出的非重名错误按原 code 上抛，不吞成成功', async (t) => {
  const { paths, store } = await withEnv(t)
  const { avatar } = withMainImage(store, paths, '错误形象')
  const library = fakeLibrary()
  library.saveTypedAsset = async () => {
    const error = new Error('path is not readable')
    error.code = 'path-denied'
    throw error
  }
  const sync = createLibrarySync({ ctx: { get: () => undefined }, store, paths, assetLibrary: library })

  await assert.rejects(() => sync.syncSheet(avatar.id), rejectsWith('path-denied', 400))
  assert.equal(store.get(avatar.id).assetId, null)
})
