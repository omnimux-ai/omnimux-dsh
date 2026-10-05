// 形象库存储：增删改查、任务账本、原子落盘与数据目录回收。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { avatarDirOf, resolveAvatarPaths } from './paths.js'
import { AvatarError, createAvatarStore, latestTaskOf } from './store.js'

/** 每个用例独立临时家目录，绝不触碰真实 $DSH_HOME。 */
async function withStore(t) {
  const home = await mkdtemp(join(tmpdir(), 'avatar-store-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const paths = resolveAvatarPaths({ homeDir: home })
  return { paths, store: createAvatarStore({ paths }) }
}

const rejectsWith = (code, status) => (error) => {
  assert.ok(error instanceof AvatarError, `期望 AvatarError，实际 ${error?.name}`)
  assert.equal(error.code, code)
  if (status !== undefined) assert.equal(error.status, status)
  return true
}

test('create / get / list / update / remove 与名称冲突', async (t) => {
  const { store } = await withStore(t)

  const created = store.create({ name: ' 林晓 ', sheet: { tier: 'normal', selection: { gender: ['female'] } } })
  assert.match(created.id, /^avt_[0-9a-f]{8}$/)
  assert.equal(created.name, '林晓')
  assert.equal(created.sheet.tier, 'normal')
  assert.deepEqual(created.sheet.selection, { gender: ['female'] })
  assert.equal(created.assetId, null)
  assert.equal(created.assetSource, `omnimux-avatar:${created.id}`)
  assert.deepEqual(created.tasks, [])
  assert.equal(store.revision(), 1)

  assert.deepEqual(store.get(created.id), created)
  assert.equal(store.list().length, 1)
  assert.equal(store.list()[0].id, created.id)

  // 重名：409，且不静默改名。
  assert.throws(() => store.create({ name: '林晓' }), rejectsWith('name-conflict', 409))
  assert.equal(store.list().length, 1)

  // 未知 id：404。
  assert.throws(() => store.get('avt_deadbeef'), rejectsWith('avatar-not-found', 404))

  // 名称规则：超长 / 斜杠 / 控制字符。
  assert.throws(() => store.create({ name: 'x'.repeat(41) }), rejectsWith('invalid_name', 400))
  assert.throws(() => store.create({ name: 'a/b' }), rejectsWith('invalid_name', 400))
  assert.throws(() => store.create({ name: 'a\u0007b' }), rejectsWith('invalid_name', 400))
  assert.throws(() => store.create({ name: '   ' }), rejectsWith('invalid_name', 400))

  // 只改名称。
  const renamed = store.update(created.id, { name: '林晓二' })
  assert.equal(renamed.name, '林晓二')
  assert.equal(renamed.id, created.id)

  // 只改设定：未传字段保持原值。
  const patched = store.update(created.id, { sheet: { brief: '冷静一点' } })
  assert.equal(patched.sheet.brief, '冷静一点')
  assert.equal(patched.sheet.tier, 'normal')
  assert.deepEqual(patched.sheet.selection, { gender: ['female'] })

  // 改名撞已有名称：409。
  const other = store.create({ name: '阿岚' })
  assert.throws(() => store.update(other.id, { name: '林晓二' }), rejectsWith('name-conflict', 409))

  const removed = store.remove(other.id)
  assert.deepEqual(removed, { id: other.id, deleted: true })
  assert.equal(store.list().length, 1)
  assert.throws(() => store.get(other.id), rejectsWith('avatar-not-found', 404))
})

test('任务账本：add / update / remove / find / list', async (t) => {
  const { store } = await withStore(t)
  const avatar = store.create({ name: '任务形象' })
  const base = {
    taskId: 'avt_task_00000001',
    kind: 'sheet',
    model: 'm1',
    group: 'g1',
    status: 'queued',
    taskRef: null,
    destPath: '/tmp/main.png',
    error: null,
  }

  const added = store.addTask(avatar.id, base)
  assert.equal(added.taskId, base.taskId)
  assert.equal(added.status, 'queued')
  assert.equal(store.listTasks(avatar.id).length, 1)
  assert.equal(store.findTask(avatar.id, base.taskId).destPath, '/tmp/main.png')
  assert.equal(store.findTask(avatar.id, 'avt_task_missing'), null)
  assert.equal(latestTaskOf(store.get(avatar.id)).taskId, base.taskId)

  const updated = store.updateTask(avatar.id, base.taskId, { status: 'ready', taskRef: 'tr_9' })
  assert.equal(updated.status, 'ready')
  assert.equal(updated.taskRef, 'tr_9')
  assert.equal(updated.destPath, '/tmp/main.png')

  assert.throws(() => store.updateTask(avatar.id, 'avt_task_missing', { status: 'ready' }), rejectsWith('task-not-found', 404))

  // 多视角任务后写，成为 latestTask。
  const multi = store.addTask(avatar.id, { ...base, taskId: 'avt_task_00000002', kind: 'multiview', destPath: '/tmp/turnaround.png' })
  assert.equal(multi.kind, 'multiview')
  assert.equal(store.listTasks(avatar.id).length, 2)
  assert.equal(latestTaskOf(store.get(avatar.id)).taskId, 'avt_task_00000002')

  assert.deepEqual(store.removeTask(avatar.id, base.taskId), { taskId: base.taskId, deleted: true })
  assert.equal(store.listTasks(avatar.id).length, 1)
  assert.throws(() => store.removeTask(avatar.id, base.taskId), rejectsWith('task-not-found', 404))
})

test('原子落盘可被新实例读回，且返回值是深拷贝', async (t) => {
  const { paths, store } = await withStore(t)
  const avatar = store.create({ name: '持久化形象', sheet: { tier: 'freak', selection: { hair: ['h_short'] } } })
  store.addTask(avatar.id, {
    taskId: 'avt_task_00000003',
    kind: 'sheet',
    model: 'm2',
    group: '',
    status: 'generating',
    taskRef: 'tr_3',
    destPath: join(paths.dataDir, avatar.id, 'main.png'),
    error: null,
  })
  const revision = store.revision()
  assert.equal(existsSync(`${paths.libraryFile}.tmp`), false)

  const reloaded = createAvatarStore({ paths })
  assert.equal(reloaded.revision(), revision)
  const again = reloaded.get(avatar.id)
  assert.equal(again.name, '持久化形象')
  assert.equal(again.sheet.tier, 'freak')
  assert.deepEqual(again.sheet.selection, { hair: ['h_short'] })
  assert.equal(again.tasks.length, 1)
  assert.equal(again.tasks[0].taskRef, 'tr_3')

  // 深拷贝：外部改动不影响库内状态。
  again.name = '被改坏'
  again.tasks[0].status = 'failed'
  const fresh = reloaded.get(avatar.id)
  assert.equal(fresh.name, '持久化形象')
  assert.equal(fresh.tasks[0].status, 'generating')

  const listed = reloaded.list()
  listed[0].sheet.brief = '外部写入'
  assert.equal(reloaded.get(avatar.id).sheet.brief, '')
})

test('remove 会回收该形象的数据目录', async (t) => {
  const { paths, store } = await withStore(t)
  const avatar = store.create({ name: '待删除形象' })
  const dir = avatarDirOf(paths, avatar.id)
  mkdirSync(join(dir, '多视角'), { recursive: true })
  writeFileSync(join(dir, 'main.png'), 'fake-image')
  writeFileSync(join(dir, '多视角', 'turnaround.png'), 'fake-multi')
  assert.equal(existsSync(dir), true)

  store.remove(avatar.id)
  assert.equal(existsSync(dir), false)
  assert.equal(existsSync(avatarDirOf(paths, avatar.id)), false)
})

test('账本损坏时明确报错，不静默清空', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'avatar-store-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const paths = resolveAvatarPaths({ homeDir: home })
  mkdirSync(paths.dir, { recursive: true })
  writeFileSync(paths.libraryFile, '{ not json')

  assert.throws(() => createAvatarStore({ paths }), rejectsWith('library-corrupt', 500))
})
