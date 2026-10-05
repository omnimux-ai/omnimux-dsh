// Agent 工具：九个工具全部注册、schema 合法、execute 委托同一套 store/service。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createGeneration } from './generation.js'
import { createLibrarySync } from './library-sync.js'
import { avatarMainImagePath, avatarMultiViewImagePath, resolveAvatarPaths } from './paths.js'
import { createAvatarStore } from './store.js'
import { AVATAR_TOOL_NAMES, registerAvatarTools } from './tools.js'

/** 假资产库：只记录调用，供 avatar_library_sync 断言。 */
function fakeLibrary() {
  const calls = { save: [], attach: [] }
  const assets = new Map()
  let seq = 0
  return {
    calls,
    assets,
    async saveTypedAsset(input) {
      calls.save.push(input)
      const asset = { id: `ast_${(seq += 1)}`, name: input.name, type: input.type, source: input.source, files: [...(input.files ?? [])] }
      assets.set(asset.id, asset)
      return { asset }
    },
    async attachFiles({ assetId, files }) {
      calls.attach.push({ assetId, files })
      return { asset: assets.get(assetId) }
    },
    findBySource(source) {
      return [...assets.values()].find((asset) => asset.source === source) ?? null
    },
  }
}

async function withTools(t) {
  const home = await mkdtemp(join(tmpdir(), 'avatar-tools-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const paths = resolveAvatarPaths({ homeDir: home })
  const store = createAvatarStore({ paths })

  const seam = {
    calls: [],
    async execute(input) {
      this.calls.push(input)
      return { mode: 'live', taskRef: 'tr_tool', dest: input.dest }
    },
  }
  const library = fakeLibrary()
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: seam })
  const librarySync = createLibrarySync({ ctx: { get: () => undefined }, store, paths, assetLibrary: library })

  const tools = []
  const ctx = { tools: { register(tool) { tools.push(tool) } } }
  registerAvatarTools(ctx, { store, generation, librarySync })

  const byName = new Map(tools.map((tool) => [tool.name, tool]))
  return { paths, store, seam, library, tools, byName }
}

test('九个工具全部注册，schema 是合法的 object 且禁止额外字段', async (t) => {
  const { tools, byName } = await withTools(t)
  assert.deepEqual(tools.map((tool) => tool.name), [...AVATAR_TOOL_NAMES])
  assert.equal(tools.length, 9)

  for (const tool of tools) {
    assert.equal(typeof tool.description, 'string', `${tool.name} 缺少描述`)
    assert.ok(tool.description.length > 0, `${tool.name} 描述为空`)
    assert.equal(tool.parameters.type, 'object', `${tool.name} 参数不是 object`)
    assert.equal(tool.parameters.additionalProperties, false, `${tool.name} 允许了额外字段`)
    assert.equal(typeof tool.parameters.properties, 'object')
    assert.equal(typeof tool.execute, 'function')
    assert.equal(tool.output.schema.type, 'object')
  }

  // 破坏性工具必须同时要求 id 与 confirm。
  assert.deepEqual(byName.get('avatar_delete').parameters.required.sort(), ['confirm', 'id'])
  assert.equal(byName.get('avatar_delete').parameters.properties.confirm.type, 'boolean')
  assert.deepEqual(byName.get('avatar_create').parameters.required, ['name'])
  assert.deepEqual(byName.get('avatar_generate').parameters.required.sort(), ['avatarId', 'model', 'selection', 'tier'])
  assert.deepEqual(byName.get('avatar_library_sync').parameters.properties.kind.enum, ['sheet', 'multiview', 'both'])
})

test('avatar_create / list / get / update / delete 委托同一 store', async (t) => {
  const { store, byName } = await withTools(t)

  const created = await byName.get('avatar_create').execute({ name: '工具形象', sheet: { tier: 'normal', selection: { gender: ['female'] } } })
  assert.match(created.avatar.id, /^avt_[0-9a-f]{8}$/)
  assert.equal(store.list().length, 1)

  const listed = await byName.get('avatar_list').execute({})
  assert.equal(listed.avatars.length, 1)
  assert.equal(listed.revision, store.revision())
  assert.equal(listed.avatars[0].latestTask, null)

  const got = await byName.get('avatar_get').execute({ id: created.avatar.id })
  assert.equal(got.avatar.name, '工具形象')
  await assert.rejects(() => byName.get('avatar_get').execute({ id: 'avt_deadbeef' }), (error) => error.code === 'avatar-not-found')

  const updated = await byName.get('avatar_update').execute({ id: created.avatar.id, name: '工具形象二' })
  assert.equal(updated.avatar.name, '工具形象二')
  assert.equal(store.get(created.avatar.id).name, '工具形象二')

  await assert.rejects(
    () => byName.get('avatar_delete').execute({ id: created.avatar.id }),
    (error) => error.code === 'confirmation-required' && error.status === 400
  )
  await assert.rejects(
    () => byName.get('avatar_delete').execute({ id: created.avatar.id, confirm: false }),
    (error) => error.code === 'confirmation-required'
  )
  assert.equal(store.list().length, 1)

  const removed = await byName.get('avatar_delete').execute({ id: created.avatar.id, confirm: true })
  assert.deepEqual(removed, { deleted: true, id: created.avatar.id })
  assert.equal(store.list().length, 0)
})

test('avatar_generate / multiview / tasks 委托同一生成服务', async (t) => {
  const { paths, store, seam, byName } = await withTools(t)

  const created = await byName.get('avatar_create').execute({ name: '生成工具形象' })
  const id = created.avatar.id

  const generated = await byName.get('avatar_generate').execute({
    avatarId: id,
    model: 'flux-pro',
    tier: 'normal',
    selection: { gender: ['female'] },
    brief: '冷静',
  })
  assert.equal(generated.mode, 'live')
  assert.equal(generated.taskRef, 'tr_tool')
  assert.equal(seam.calls.length, 1)
  assert.equal(store.listTasks(id).length, 1)
  assert.equal(store.get(id).sheet.brief, '冷静')

  const tasks = await byName.get('avatar_tasks').execute({ avatarId: id })
  assert.equal(tasks.tasks.length, 1)
  assert.equal(tasks.tasks[0].status, 'ready')

  const one = await byName.get('avatar_tasks').execute({ avatarId: id, taskId: generated.task.taskId })
  assert.equal(one.task.taskId, generated.task.taskId)

  // 尚无主图（live 提交不落盘）→ 多视角必须拒绝。
  await assert.rejects(
    () => byName.get('avatar_multiview').execute({ avatarId: id, model: 'flux-pro' }),
    (error) => error.code === 'invalid_request'
  )

  const main = avatarMainImagePath(paths, id)
  mkdirSync(dirname(main), { recursive: true })
  writeFileSync(main, 'fake-main')
  const multi = await byName.get('avatar_multiview').execute({ avatarId: id, model: 'flux-pro' })
  assert.equal(multi.task.kind, 'multiview')
  assert.equal(seam.calls.at(-1).aspectRatio, '16:9')
  assert.equal(seam.calls.at(-1).image, main)

  await assert.rejects(
    () => byName.get('avatar_tasks').execute({ avatarId: id, taskId: 'avt_task_missing' }),
    (error) => error.code === 'task-not-found'
  )
})

test('avatar_library_sync 委托同一同步服务并回写 assetId', async (t) => {
  const { paths, store, library, byName } = await withTools(t)

  const created = await byName.get('avatar_create').execute({ name: '同步工具形象' })
  const id = created.avatar.id
  const main = avatarMainImagePath(paths, id)
  mkdirSync(dirname(main), { recursive: true })
  writeFileSync(main, 'fake-main')
  store.addTask(id, {
    taskId: 'avt_task_00000001',
    kind: 'sheet',
    model: 'm',
    group: '',
    status: 'ready',
    taskRef: 'tr_1',
    destPath: main,
    error: null,
  })

  const synced = await byName.get('avatar_library_sync').execute({ avatarId: id, kind: 'sheet' })
  assert.equal(synced.sheet.created, true)
  assert.equal(library.calls.save.length, 1)
  assert.equal(library.calls.save[0].type, 'character')
  assert.equal(library.calls.save[0].source, `omnimux-avatar:${id}`)
  assert.equal(store.get(id).assetId, synced.sheet.assetId)

  const turnaround = avatarMultiViewImagePath(paths, id)
  mkdirSync(dirname(turnaround), { recursive: true })
  writeFileSync(turnaround, 'fake-multi')
  store.addTask(id, {
    taskId: 'avt_task_00000002',
    kind: 'multiview',
    model: 'm',
    group: '',
    status: 'ready',
    taskRef: 'tr_2',
    destPath: turnaround,
    error: null,
  })

  const both = await byName.get('avatar_library_sync').execute({ avatarId: id })
  assert.equal(both.sheet.created, false)
  assert.equal(both.multiview.attached, true)
  // 已有档案：主图追加一次 + 多视角目录追加一次，共两次，且不新建资产。
  assert.equal(library.calls.save.length, 1)
  assert.equal(library.calls.attach.length, 2)
  assert.deepEqual(library.calls.attach.at(-1).files, [join(paths.dataDir, id, '多视角')])
})
