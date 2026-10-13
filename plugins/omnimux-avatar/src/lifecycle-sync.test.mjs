import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createAvatarStore } from './store.js'
import { resolveAvatarPaths } from './paths.js'
import { createGeneration } from './generation.js'
import { isTerminalStatus, parseTaskMeta, taskKind, parentTaskId } from './client/lib/history.js'
import { multiViewState, partitionTasks } from './client/lib/multiview.js'

async function setup(t) {
  const home = await mkdtemp(join(tmpdir(), 'avatar-sync-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const paths = resolveAvatarPaths({ homeDir: home })
  const store = createAvatarStore({ paths })
  return { home, paths, store, avatar: store.create({ name: '历史角色' }) }
}

const input = (avatarId, brief = '第一张') => ({ avatarId, model: 'image-test', group: 'test-group', tier: 'normal', selection: { gender: ['female'] }, brief })

test('本地完成态可以结束主图与多视角追踪', () => {
  assert.equal(isTerminalStatus('ready'), true)
  assert.equal(multiViewState({ status: 'ready' }), 'ready')
})

test('账本保留每个任务自己的参数和父任务，而非读取当前角色设定', async t => {
  const { paths, store, avatar } = await setup(t)
  const params = { tier: 'normal', selection: { gender: ['female'] }, brief: '旧图', size: '9:16' }
  store.addTask(avatar.id, { taskId: 'sheet-1', kind: 'sheet', status: 'ready', input: params })
  store.addTask(avatar.id, { taskId: 'mv-1', kind: 'multiview', status: 'ready', parentTaskId: 'sheet-1', input: { kind: 'multiview', parent_task_id: 'sheet-1' } })
  const reload = createAvatarStore({ paths })
  const [sheet, child] = reload.listTasks(avatar.id)
  assert.deepEqual(parseTaskMeta(sheet), params)
  assert.equal(taskKind(child), 'multiview')
  assert.equal(parentTaskId(child), 'sheet-1')
  const grouped = partitionTasks([child, sheet])
  assert.deepEqual(grouped.roots.map(row => row.taskId), ['sheet-1'])
  assert.equal(grouped.childByParent.get('sheet-1').taskId, 'mv-1')
})

test('重复生图不覆盖历史文件；派生严格使用选中的父图及参数', async t => {
  const { paths, store, avatar } = await setup(t)
  const calls = []
  const seam = { async execute(request) {
    calls.push(request)
    mkdirSync(dirname(request.dest), { recursive: true })
    writeFileSync(request.dest, request.prompt)
    return { mode: 'live', dest: request.dest }
  } }
  const generation = createGeneration({ store, paths, imageGenerate: seam })
  const first = await generation.submitSheet(input(avatar.id, '旧设定'))
  const firstBytes = readFileSync(first.dest, 'utf8')
  const second = await generation.submitSheet(input(avatar.id, '新设定'))
  assert.notEqual(second.dest, first.dest)
  assert.equal(readFileSync(first.dest, 'utf8'), firstBytes)
  assert.equal(parseTaskMeta(first.task).brief, '旧设定')
  const derived = await generation.submitMultiView({ avatarId: avatar.id, model: 'image-test', group: 'test-group', parentTaskId: first.task.taskId })
  assert.equal(calls.at(-1).image, first.dest)
  assert.match(calls.at(-1).prompt, /旧设定/)
  assert.doesNotMatch(calls.at(-1).prompt, /新设定/)
  assert.equal(derived.task.parentTaskId, first.task.taskId)
  await assert.rejects(generation.submitMultiView({ avatarId: avatar.id, parentTaskId: 'unknown-parent' }), error => error.code === 'invalid_request')
})

test('刷新未完成响应不能提前写为ready，已有句柄恢复不提交新任务', async t => {
  const { paths, store, avatar } = await setup(t)
  const calls = []
  const seam = { async execute(request) {
    calls.push(request)
    return { mode: 'submitted', taskRef: 'same-ref', dest: request.dest }
  } }
  const generation = createGeneration({ store, paths, imageGenerate: seam })
  const submitted = await generation.submitSheet(input(avatar.id))
  const refreshed = await generation.refreshTask({ avatarId: avatar.id, taskId: submitted.task.taskId })
  assert.equal(refreshed.status, 'generating')
  assert.equal(calls.at(-1).taskRef, 'same-ref')
  assert.equal(calls.at(-1).prompt, undefined)
})

test('同一父图的派生行按真实时间选择最新而非缺失网页id', () => {
  const rows = [
    { taskId: 'parent', kind: 'sheet' },
    { taskId: 'child-new', kind: 'multiview', parentTaskId: 'parent', createdAt: '2026-10-13T03:00:00Z' },
    { taskId: 'child-old', kind: 'multiview', parentTaskId: 'parent', createdAt: '2026-10-13T02:00:00Z' },
  ]
  assert.equal(partitionTasks(rows).childByParent.get('parent').taskId, 'child-new')
})
