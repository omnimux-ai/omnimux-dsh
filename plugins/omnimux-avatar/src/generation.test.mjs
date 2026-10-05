// 生成编排：校验、提示词拼装、任务账本与错误纪律（不吞错、不造进度）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createGeneration } from './generation.js'
import { avatarDirOf, avatarMainImagePath, avatarMultiViewDir, avatarMultiViewImagePath, resolveAvatarPaths } from './paths.js'
import { AvatarError, createAvatarStore } from './store.js'

async function withEnv(t) {
  const home = await mkdtemp(join(tmpdir(), 'avatar-generation-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const paths = resolveAvatarPaths({ homeDir: home })
  const store = createAvatarStore({ paths })
  return { paths, store }
}

/** 假执行面：记录每次调用，按 impl 返回或抛出。 */
function fakeSeam(impl) {
  return {
    calls: [],
    async execute(input) {
      this.calls.push(input)
      return impl(input, this.calls.length)
    },
  }
}

const okSeam = () =>
  fakeSeam((input) => ({ mode: 'task', taskRef: 'tr_1', dest: input.dest, kind: 'image' }))

const rejectsWith = (code, status) => (error) => {
  assert.ok(error instanceof AvatarError, `期望 AvatarError，实际 ${error?.name}: ${error?.message}`)
  assert.equal(error.code, code)
  if (status !== undefined) assert.equal(error.status, status)
  return true
}

test('非法选项 / 非法档位 → 400 invalid_selection', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '校验形象' })
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: okSeam() })

  await assert.rejects(
    () => generation.submitSheet({ avatarId: avatar.id, model: 'm', tier: 'normal', selection: { gender: ['不存在'] } }),
    rejectsWith('invalid_selection', 400)
  )
  await assert.rejects(
    () => generation.submitSheet({ avatarId: avatar.id, model: 'm', tier: 'nope', selection: { gender: ['female'] } }),
    rejectsWith('invalid_selection', 400)
  )
  assert.equal(store.listTasks(avatar.id).length, 0)
})

test('空选项 + 空方向说明 → 400 invalid_request；方向说明超长同样 400', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '空提交形象' })
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: okSeam() })

  await assert.rejects(
    () => generation.submitSheet({ avatarId: avatar.id, model: 'm', tier: 'normal', selection: {}, brief: '   ' }),
    rejectsWith('invalid_request', 400)
  )
  await assert.rejects(
    () =>
      generation.submitSheet({
        avatarId: avatar.id,
        model: 'm',
        tier: 'normal',
        selection: { gender: ['female'] },
        brief: 'x'.repeat(4001),
      }),
    rejectsWith('invalid_request', 400)
  )
  assert.equal(store.listTasks(avatar.id).length, 0)
})

test('缺少 imageGenerate → 503 needs-provider，且不写任务、不建目录', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '无渠道形象' })
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths })

  await assert.rejects(
    () => generation.submitSheet({ avatarId: avatar.id, model: 'm', tier: 'normal', selection: { gender: ['female'] } }),
    rejectsWith('needs-provider', 503)
  )
  assert.equal(store.listTasks(avatar.id).length, 0)
  assert.equal(existsSync(avatarDirOf(paths, avatar.id)), false)
})

test('提交成功：记录带 taskRef 的任务、落到主图路径并回写设定', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '提交形象' })
  const seam = okSeam()
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: seam })

  const result = await generation.submitSheet({
    avatarId: avatar.id,
    model: 'flux-pro',
    group: '默认组',
    tier: 'normal',
    selection: { gender: ['female'] },
    brief: '冷静一点',
    seed: 42,
  })

  const dest = avatarMainImagePath(paths, avatar.id)
  assert.equal(seam.calls.length, 1)
  assert.equal(seam.calls[0].dest, dest)
  assert.equal(seam.calls[0].aspectRatio, '9:16')
  assert.equal(seam.calls[0].operation, 'text_to_image')
  assert.equal(seam.calls[0].image, undefined)
  assert.equal(seam.calls[0].seed, 42)
  assert.equal(seam.calls[0].wait, false)
  assert.equal(seam.calls[0].requestKey, result.task.taskId)
  assert.match(seam.calls[0].prompt, /Female/)
  assert.match(seam.calls[0].prompt, /冷静一点/)

  assert.equal(result.taskRef, 'tr_1')
  assert.equal(result.dest, dest)
  assert.equal(result.mode, 'task')
  assert.equal(result.task.status, 'generating')
  assert.equal(result.task.destPath, dest)
  assert.match(result.task.taskId, /^avt_task_[0-9a-f]{8}$/)

  const stored = store.get(avatar.id)
  assert.equal(stored.tasks.length, 1)
  assert.equal(stored.tasks[0].taskRef, 'tr_1')
  assert.equal(stored.sheet.tier, 'normal')
  assert.equal(stored.sheet.brief, '冷静一点')
  assert.equal(stored.sheet.seed, 42)
  assert.deepEqual(stored.sheet.selection, { gender: ['female'] })
})

test('带参考图提交时走图生图（不传 operation）', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '图生图形象' })
  const seam = okSeam()
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: seam })

  await generation.submitSheet({
    avatarId: avatar.id,
    model: 'm',
    tier: 'normal',
    selection: { gender: ['female'] },
    image_url: 'https://example.test/a.png',
  })
  assert.equal(seam.calls[0].operation, undefined)
  assert.equal(seam.calls[0].image, 'https://example.test/a.png')
  assert.equal(store.get(avatar.id).sheet.image_url, 'https://example.test/a.png')
})

test('mode=live 直接记 ready', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '实时形象' })
  const seam = fakeSeam((input) => ({ mode: 'live', dest: input.dest, url: 'https://example.test/a.png' }))
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: seam })

  const result = await generation.submitSheet({ avatarId: avatar.id, model: 'm', tier: 'normal', selection: { gender: ['male'] } })
  assert.equal(result.task.status, 'ready')
  assert.equal(result.task.taskRef, null)
})

test('上游抛错：记 failed 并保留上游原文，然后原样上抛', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '失败形象' })
  const seam = fakeSeam(() => {
    throw new Error('上游返回 429')
  })
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: seam })

  await assert.rejects(
    () => generation.submitSheet({ avatarId: avatar.id, model: 'm', tier: 'normal', selection: { gender: ['female'] } }),
    rejectsWith('generation-failed', 502)
  )
  const tasks = store.listTasks(avatar.id)
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].status, 'failed')
  assert.equal(tasks[0].error, '上游返回 429')
  assert.equal(existsSync(avatarMainImagePath(paths, avatar.id)), false)
})

test('上游抛出渠道不可用：保留 code、按 503 上抛且不写假失败记录', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '未登录形象' })
  const seam = fakeSeam(() => {
    const error = new Error('官方账号未登录')
    error.code = 'needs-omnimux'
    throw error
  })
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: seam })

  await assert.rejects(
    () => generation.submitSheet({ avatarId: avatar.id, model: 'm', tier: 'normal', selection: { gender: ['female'] } }),
    rejectsWith('needs-omnimux', 503)
  )
  assert.equal(store.listTasks(avatar.id).length, 0)
})

test('submitMultiView：无已完成主图时拒绝', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '无主图形象' })
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: okSeam() })

  await assert.rejects(
    () => generation.submitMultiView({ avatarId: avatar.id, model: 'm' }),
    rejectsWith('invalid_request', 400)
  )

  // 有 ready 任务但产物已不在盘上：同样拒绝。
  store.addTask(avatar.id, {
    taskId: 'avt_task_00000001',
    kind: 'sheet',
    model: 'm',
    group: '',
    status: 'ready',
    taskRef: 'tr_1',
    destPath: avatarMainImagePath(paths, avatar.id),
    error: null,
  })
  await assert.rejects(
    () => generation.submitMultiView({ avatarId: avatar.id, model: 'm' }),
    rejectsWith('invalid_request', 400)
  )
})

test('submitMultiView：参考图固定为该形象自己的主图，画幅 16:9', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '多视角形象', sheet: { tier: 'normal', selection: { gender: ['female'] }, brief: '高冷' } })
  const main = avatarMainImagePath(paths, avatar.id)
  mkdirSync(dirname(main), { recursive: true })
  writeFileSync(main, 'fake-main')
  store.addTask(avatar.id, {
    taskId: 'avt_task_00000002',
    kind: 'sheet',
    model: 'm',
    group: '',
    status: 'ready',
    taskRef: 'tr_2',
    destPath: main,
    error: null,
  })

  const seam = okSeam()
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: seam })
  const result = await generation.submitMultiView({ avatarId: avatar.id, model: 'm', group: 'g' })

  assert.equal(seam.calls.length, 1)
  assert.equal(seam.calls[0].image, main)
  assert.equal(seam.calls[0].aspectRatio, '16:9')
  assert.equal(seam.calls[0].dest, avatarMultiViewImagePath(paths, avatar.id))
  assert.match(seam.calls[0].prompt, /reference image/)
  assert.equal(existsSync(avatarMultiViewDir(paths, avatar.id)), true)
  assert.equal(result.task.kind, 'multiview')
  assert.equal(store.listTasks(avatar.id).length, 2)
})

test('refreshTask：续取成功记 ready，失败记 failed，绝不编造进度', async (t) => {
  const { paths, store } = await withEnv(t)
  const avatar = store.create({ name: '续取形象' })
  const dest = avatarMainImagePath(paths, avatar.id)
  store.addTask(avatar.id, {
    taskId: 'avt_task_00000003',
    kind: 'sheet',
    model: 'm',
    group: '',
    status: 'generating',
    taskRef: 'tr_3',
    destPath: dest,
    error: null,
  })

  const ok = fakeSeam(() => ({ mode: 'live', taskRef: 'tr_3', dest }))
  const ready = await createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: ok }).refreshTask({
    avatarId: avatar.id,
    taskId: 'avt_task_00000003',
  })
  assert.equal(ok.calls[0].task_ref, 'tr_3')
  assert.equal(ok.calls[0].wait, true)
  assert.equal(ready.status, 'ready')
  assert.equal(ready.destPath, dest)

  // 已是终态：不再调用执行面。
  const again = ok.calls.length
  await createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: ok }).refreshTask({
    avatarId: avatar.id,
    taskId: 'avt_task_00000003',
  })
  assert.equal(ok.calls.length, again)

  // 失败：记 failed + 上游原文。
  store.addTask(avatar.id, {
    taskId: 'avt_task_00000004',
    kind: 'multiview',
    model: 'm',
    group: '',
    status: 'generating',
    taskRef: 'tr_4',
    destPath: dest,
    error: null,
  })
  const bad = fakeSeam(() => {
    throw new Error('任务已过期')
  })
  const failed = await createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: bad }).refreshTask({
    avatarId: avatar.id,
    taskId: 'avt_task_00000004',
  })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.error, '任务已过期')

  // 没有 taskRef 的排队任务：原样返回，不猜状态。
  store.addTask(avatar.id, {
    taskId: 'avt_task_00000005',
    kind: 'sheet',
    model: 'm',
    group: '',
    status: 'queued',
    taskRef: null,
    destPath: dest,
    error: null,
  })
  const idle = fakeSeam(() => ({ mode: 'live' }))
  const untouched = await createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: idle }).refreshTask({
    avatarId: avatar.id,
    taskId: 'avt_task_00000005',
  })
  assert.equal(idle.calls.length, 0)
  assert.equal(untouched.status, 'queued')

  await assert.rejects(
    () => createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: idle }).refreshTask({ avatarId: avatar.id, taskId: 'avt_task_missing' }),
    rejectsWith('task-not-found', 404)
  )
})
