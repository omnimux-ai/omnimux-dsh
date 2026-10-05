// 自动入库接线：任务转 ready 的那一刻必须触发一次资产库归档（AC4/AC5 的唯一执行路径）。
// 归档失败不得把已产出的图改写成失败任务 —— 原因落在 syncError 上，任务保持 ready。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createGeneration } from './generation.js'
import { avatarMainImagePath, resolveAvatarPaths } from './paths.js'
import { createAvatarStore } from './store.js'

async function withEnv(t) {
  const home = await mkdtemp(join(tmpdir(), 'avatar-archive-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const paths = resolveAvatarPaths({ homeDir: home })
  const store = createAvatarStore({ paths })
  return { paths, store }
}

/** 直接出图的假执行面：mode:'live' 意味着任务提交即 ready。 */
function liveSeam() {
  return {
    calls: [],
    async execute(input) {
      this.calls.push(input)
      return { mode: 'live', taskRef: null, dest: input.dest }
    },
  }
}

/** 需要轮询的假执行面：返回 taskRef，任务停在 generating。 */
function queuedSeam(taskRef = 'tr_1') {
  return {
    calls: [],
    async execute(input) {
      this.calls.push(input)
      return { mode: 'task', taskRef, dest: input.dest }
    },
  }
}

/** 归档回调的调用记录器。 */
function recorder(impl) {
  const seen = []
  const fn = async (avatarId, kind) => {
    seen.push({ avatarId, kind })
    if (impl) return impl(avatarId, kind)
    return undefined
  }
  fn.seen = seen
  return fn
}

const SHEET_INPUT = { tier: 'normal', selection: { gender: ['female'] }, brief: '' }

function putMainImage(paths, avatarId) {
  const dest = avatarMainImagePath(paths, avatarId)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, 'png')
  return dest
}

test('live 主图 → 触发一次 sheet 归档，任务 ready 且 syncError 为空', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '归档形象' })
  const onReady = recorder()
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: liveSeam(), onReady })

  const result = await generation.submitSheet({ avatarId: avatar.id, model: 'm', ...SHEET_INPUT })

  assert.equal(onReady.seen.length, 1)
  assert.deepEqual(onReady.seen[0], { avatarId: avatar.id, kind: 'sheet' })
  assert.equal(result.task.status, 'ready')
  assert.equal(result.task.syncError, null)
})

// 手动补偿（POST /sync）成功后必须清掉未入库标记，否则界面会一直显示「尚未保存到资产库」。
test('clearSyncError：补偿成功清掉 syncError，无标记时不误报', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '补偿形象' })
  const generation = createGeneration({
    ctx: { get: () => undefined },
    store,
    paths,
    imageGenerate: liveSeam(),
    onReady: recorder(async () => {
      throw new Error('资产库不可用')
    }),
  })

  const result = await generation.submitSheet({ avatarId: avatar.id, model: 'm', ...SHEET_INPUT })
  assert.equal(result.task.status, 'ready', '归档失败不得把已产出的图改成失败任务')
  assert.equal(result.task.syncError, '资产库不可用')
  // readyTaskOf 只认产物仍在盘上的任务（与自动归档同一判据），所以这里要把主图落到盘上。
  putMainImage(paths, avatar.id)

  assert.equal(generation.clearSyncError(avatar.id, 'sheet'), 1)
  const after = store.get(avatar.id).tasks.find((task) => task.taskId === result.task.taskId)
  assert.equal(after.syncError, null, '补偿成功后必须清掉未入库标记')
  assert.equal(after.status, 'ready', '清标记不得改任务状态')

  assert.equal(generation.clearSyncError(avatar.id, 'sheet'), 0, '没有标记时不应重复计数')
})

test('排队中的任务不触发归档（只有 ready 才入库）', async (t) => {  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '排队形象' })
  const onReady = recorder()
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: queuedSeam(), onReady })

  const result = await generation.submitSheet({ avatarId: avatar.id, model: 'm', ...SHEET_INPUT })

  assert.equal(result.task.status, 'generating')
  assert.equal(onReady.seen.length, 0)
})

test('归档失败不把已产出的图变成失败任务：保持 ready 并记下 syncError', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '归档失败形象' })
  const onReady = recorder(() => {
    throw new Error('资产库不可用')
  })
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: liveSeam(), onReady })

  const result = await generation.submitSheet({ avatarId: avatar.id, model: 'm', ...SHEET_INPUT })

  assert.equal(result.task.status, 'ready', '图已产出，任务不能因归档失败而变 failed')
  assert.equal(result.task.syncError, '资产库不可用')
  assert.equal(store.get(avatar.id).tasks[0].syncError, '资产库不可用')
})

test('没有 onReady 时是纯 no-op，不报错也不写 syncError', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '无归档形象' })
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: liveSeam() })

  const result = await generation.submitSheet({ avatarId: avatar.id, model: 'm', ...SHEET_INPUT })

  assert.equal(result.task.status, 'ready')
  assert.equal(result.task.syncError, null)
})

// —— 回归：#3176 缺陷 5 ——

test('回归 3176-5：改任务记录写不进去时，归档失败原因仍要落盘且任务保持 ready', async (t) => {
  const { paths, store: real } = await withEnv(t)
  const avatar = real.create({ name: '落盘失败形象' })
  // 只让 updateTask 写不进账本（落盘失败/记录缺失），其余读写照常。
  const store = {
    ...real,
    updateTask: () => {
      throw new Error('persist-failed')
    },
  }
  const onReady = recorder(() => {
    throw new Error('资产库不可用')
  })
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: liveSeam(), onReady })

  const result = await generation.submitSheet({ avatarId: avatar.id, model: 'm', ...SHEET_INPUT })

  assert.equal(result.task.status, 'ready')
  assert.equal(result.task.syncError, '资产库不可用')
  const persisted = real.get(avatar.id).tasks[0]
  assert.equal(persisted.status, 'ready', '归档失败绝不能改任务状态')
  assert.equal(persisted.syncError, '资产库不可用', 'syncError 必须真的写进账本，不能只留在返回值里')
})

test('refreshTask 轮询到 ready → 触发 sheet 归档', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '轮询形象' })
  const onReady = recorder()
  const seam = queuedSeam('tr_poll')
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: seam, onReady })

  const submitted = await generation.submitSheet({ avatarId: avatar.id, model: 'm', ...SHEET_INPUT })
  assert.equal(onReady.seen.length, 0)

  // 第二跳：续取时上游返回 live。
  seam.execute = async (input) => ({ mode: 'live', taskRef: input.task_ref, dest: input.dest })
  const refreshed = await generation.refreshTask({ avatarId: avatar.id, taskId: submitted.task.taskId })

  assert.equal(refreshed.status, 'ready')
  assert.equal(onReady.seen.length, 1)
  assert.equal(onReady.seen[0].kind, 'sheet')
})

test('live 多视角 → 触发 multiview 归档（不是 sheet）', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '多视角形象' })
  const onReady = recorder()
  const seam = liveSeam()
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: seam, onReady })

  await generation.submitSheet({ avatarId: avatar.id, model: 'm', ...SHEET_INPUT })
  putMainImage(paths, avatar.id)
  onReady.seen.length = 0

  const result = await generation.submitMultiView({ avatarId: avatar.id, model: 'm' })

  assert.equal(result.task.status, 'ready')
  assert.equal(onReady.seen.length, 1)
  assert.deepEqual(onReady.seen[0], { avatarId: avatar.id, kind: 'multiview' })
})
