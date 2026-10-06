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

/** 假资产库：记录调用，支持按 source 查重、重名注入、慢建档与预置资产。 */
function fakeLibrary({ conflictOnFirstSave = false, slowSaveMs = 0, seed = [] } = {}) {
  const calls = { save: [], attach: [] }
  const assets = new Map()
  let seq = 0
  const toRef = (path, index) => ({
    id: `fil_${index}`,
    real_path: path,
    original_name: basename(String(path).replace(/\/+$/, '')),
  })
  const assetNotFound = (assetId) => {
    const error = new Error(`no asset ${assetId}`)
    error.code = 'asset-not-found'
    return error
  }
  for (const row of seed) {
    assets.set(row.id, {
      id: row.id,
      name: row.name ?? row.id,
      type: 'character',
      description: '',
      tags: [],
      source: row.source,
      files: (row.files ?? []).map(toRef),
    })
  }
  return {
    calls,
    assets,
    async saveTypedAsset(input) {
      calls.save.push(input)
      if (slowSaveMs > 0) await new Promise((resolve) => setTimeout(resolve, slowSaveMs))
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
      if (!asset) throw assetNotFound(assetId)
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

/** 造一个「主图 + 多视角都已完成」的形象。 */
function withMultiViewReady(store, paths, name) {
  const { avatar, main } = withMainImage(store, paths, name)
  const turnaround = avatarMultiViewImagePath(paths, avatar.id)
  mkdirSync(dirname(turnaround), { recursive: true })
  writeFileSync(turnaround, 'fake-multi')
  store.addTask(avatar.id, {
    taskId: 'avt_task_00000009',
    kind: 'multiview',
    model: 'm',
    group: '',
    status: 'ready',
    taskRef: 'tr_9',
    destPath: turnaround,
    error: null,
  })
  return { avatar, main, turnaround }
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
  assert.deepEqual(input.tags, ['数字人'])
  assert.equal(input.description, '数字人 · 林晓')
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

// —— 回归：#3176 缺陷 1/2/3 ——

test('回归 3176-1：别的目录引用不算该形象的多视角目录，多视角仍要挂上', async (t) => {
  const { paths, store } = await withEnv(t)
  const { avatar } = withMultiViewReady(store, paths, '目录误判形象')
  const library = fakeLibrary()
  const sync = createLibrarySync({ ctx: { get: () => undefined }, store, paths, assetLibrary: library })
  await sync.syncSheet(avatar.id)

  // 资产里已有一条与多视角无关的目录引用（kind=directory）。
  library.assets.get('ast_1').files.push({
    id: 'fil_dir',
    real_path: '/elsewhere/参考图',
    original_name: '参考图',
    kind: 'directory',
  })

  const first = await sync.syncMultiView(avatar.id)
  assert.equal(first.attached, true, '无关目录不能让多视角归档被静默跳过')
  assert.deepEqual(library.calls.attach.at(-1), {
    assetId: 'ast_1',
    files: [avatarMultiViewDir(paths, avatar.id)],
  })

  // 挂上之后才是幂等：该形象自己的多视角目录不再重复追加。
  const second = await sync.syncMultiView(avatar.id)
  assert.equal(second.attached, false)
  assert.equal(library.calls.attach.length, 1)
})

test('回归 3176-2：记录的 assetId 失效时按来源键自愈并回写', async (t) => {
  const { paths, store } = await withEnv(t)
  const { avatar, main } = withMultiViewReady(store, paths, '自愈形象')
  const source = `omnimux-avatar:${avatar.id}`
  // 资产还在，但 id 与账本里记录的不一致（资产重建/迁移后 id 变了）。
  const library = fakeLibrary({ seed: [{ id: 'ast_new', name: '自愈形象', source, files: [main] }] })
  store.update(avatar.id, { assetId: 'ast_gone' })
  const sync = createLibrarySync({ ctx: { get: () => undefined }, store, paths, assetLibrary: library })

  const result = await sync.syncMultiView(avatar.id)

  assert.equal(result.attached, true, '失效 id 不能让多视角归档永久失败')
  assert.equal(result.assetId, 'ast_new')
  assert.deepEqual(library.calls.attach.at(-1), {
    assetId: 'ast_new',
    files: [avatarMultiViewDir(paths, avatar.id)],
  })
  assert.equal(store.get(avatar.id).assetId, 'ast_new', '自愈后要回写修复过的 id')
})

test('回归 3176-3：并发首次同步只建一条资产（AC4 资产数不变）', async (t) => {
  const { paths, store } = await withEnv(t)
  const { avatar } = withMainImage(store, paths, '并发形象')
  const library = fakeLibrary({ slowSaveMs: 5 })
  const sync = createLibrarySync({ ctx: { get: () => undefined }, store, paths, assetLibrary: library })

  const [first, second] = await Promise.all([sync.syncSheet(avatar.id), sync.syncSheet(avatar.id)])

  assert.equal(library.calls.save.length, 1, '并发首建只能调用一次建档')
  assert.equal(library.assets.size, 1, '并发首建不能造出两条资产')
  assert.equal(first.assetId, second.assetId)
  assert.equal(first.created, true)
  assert.equal(store.get(avatar.id).assetId, first.assetId)

  // 护栏释放后，后续同步仍走「已建档 → 只追加」。
  const third = await sync.syncSheet(avatar.id)
  assert.equal(third.created, false)
  assert.equal(library.calls.save.length, 1)
})
