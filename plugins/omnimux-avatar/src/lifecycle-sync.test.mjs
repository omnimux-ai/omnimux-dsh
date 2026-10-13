import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { resolveAvatarArtifact } from './artifact.js'
import { createAvatarStore } from './store.js'
import { resolveAvatarPaths } from './paths.js'
import { createGeneration } from './generation.js'
import { isTerminalStatus, parseTaskMeta, taskKind, parentTaskId } from './client/lib/history.js'
import { multiViewState, partitionTasks } from './client/lib/multiview.js'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import Module, { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

async function setup(t) {
  const home = await mkdtemp(join(tmpdir(), 'avatar-sync-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const paths = resolveAvatarPaths({ homeDir: home })
  const store = createAvatarStore({ paths })
  return { home, paths, store, avatar: store.create({ name: '历史角色' }) }
}

const input = (avatarId, brief = '第一张') => ({ avatarId, model: 'image-test', group: 'test-group', tier: 'normal', selection: { gender: ['female'] }, brief })

test('任务文件解析拒绝库外路径且保留真实所属身份', async t => {
  const { home, paths, avatar } = await setup(t)
  const file = join(paths.dataDir, avatar.id, 'owned.png')
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, 'owned')
  assert.match(resolveAvatarArtifact(paths,avatar.id,file), /owned\.png$/)
  const outside = join(home,'outside.png');writeFileSync(outside,'outside')
  assert.throws(() => resolveAvatarArtifact(paths,avatar.id,outside),error => error.code === 'path-denied')
})

test('已受理图片下载出错仍保留原任务引用可续取', async t => {
  const { paths,store,avatar } = await setup(t)
  const calls=[]
  const seam={async execute(request){calls.push(request);if(!request.taskRef){const error=new Error('download interrupted');error.taskRef='accepted-original';throw error}return {mode:'submitted',taskRef:request.taskRef}}}
  const generation=createGeneration({paths,store,imageGenerate:seam})
  await assert.rejects(generation.submitSheet(input(avatar.id)))
  const task=store.listTasks(avatar.id)[0]
  assert.equal(task.status,'generating')
  assert.equal(task.taskRef,'accepted-original')
  await generation.refreshTask({avatarId:avatar.id,taskId:task.taskId})
  assert.equal(calls.at(-1).taskRef,'accepted-original')
  assert.equal(calls.at(-1).prompt,undefined)
})

test('已受理图片鉴权中断保留原身份而不是再次提交',async t=>{
 const {paths,store,avatar}=await setup(t)
 let submissions=0
 const generation=createGeneration({paths,store,imageGenerate:{async execute(request){if(request.taskRef)return {mode:'submitted'};submissions++;const error=Object.assign(new Error('登录已失效'),{code:'needs-omnimux',taskRef:'paid-original'});throw error}}})
 await assert.rejects(generation.submitSheet(input(avatar.id)))
 const task=store.listTasks(avatar.id)[0]
 assert.equal(task.taskRef,'paid-original');assert.equal(task.status,'generating')
 await generation.refreshTask({avatarId:avatar.id,taskId:task.taskId})
 assert.equal(submissions,1)
})

test('提交返回前重启留下的queued可按原requestKey找回已接受任务', async t => {
  const { paths,store,avatar } = await setup(t)
  store.addTask(avatar.id,{taskId:'avt_task_11223344',kind:'sheet',status:'queued',destPath:join(paths.dataDir,avatar.id,'existing.png')})
  const calls=[]
  const generation=createGeneration({paths,store,imageGenerate:{findAccepted(key){assert.equal(key,'avt_task_11223344');return {taskRef:'persisted-ref'}},async execute(request){calls.push(request);return {mode:'submitted'}}}})
  const task=await generation.refreshTask({avatarId:avatar.id,taskId:'avt_task_11223344'})
  assert.equal(task.taskRef,'persisted-ref')
  assert.equal(calls.length,1)
  assert.equal(calls[0].taskRef,'persisted-ref')
  assert.equal(calls[0].prompt,undefined)
})

test('删除首份完成记录后新图不能覆盖遗留成品',async t=>{
 const {paths,store,avatar}=await setup(t)
 const generation=createGeneration({paths,store,imageGenerate:{async execute(request){writeFileSync(request.dest,request.prompt);return {mode:'live',dest:request.dest}}}})
 const first=(await generation.submitSheet(input(avatar.id,'原成品'))).task
 const original=readFileSync(first.destPath,'utf8')
 store.removeTask(avatar.id,first.taskId)
 const second=(await generation.submitSheet(input(avatar.id,'新成品'))).task
 assert.notEqual(second.destPath,first.destPath)
 assert.equal(readFileSync(first.destPath,'utf8'),original)
})

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

test('真实提交钩子对已受理任务发起续取而非仅反复读取本地状态', async t => {
  const built = await build({ entryPoints: [fileURLToPath(new URL('./client/hooks/use-tasks.js', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'] })
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const keys = ['window', 'document', 'navigator', 'fetch', 'IS_REACT_ACT_ENVIRONMENT']
  const saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of keys) Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true, writable: true })
  const reads = []
  const task = { taskId: 'accepted-task', kind: 'sheet', status: 'generating', taskRef: 'upstream-task' }
  globalThis.fetch = async (url, options = {}) => {
    let body
    if (options.method === 'POST') body = { success: true, task, taskRef: 'upstream-task' }
    else { reads.push(String(url)); body = { success: true, task: { ...task, status: String(url).includes('refresh=1') ? 'ready' : 'generating' } } }
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
  }
  const production = new Module(fileURLToPath(import.meta.url))
  production.filename = fileURLToPath(import.meta.url)
  production.paths = Module._nodeModulePaths(fileURLToPath(new URL('.', import.meta.url)))
  production.require = createRequire(import.meta.url)
  production._compile(built.outputFiles[0].text, production.filename)
  let api
  function Harness() { api = production.exports.useSheetSubmit({ avatarId: 'avatar' }); return null }
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  })
  await act(async () => root.render(React.createElement(Harness)))
  let result
  await act(async () => { result = await api.submit({ avatarId: 'avatar' }) })
  assert.equal(reads.some(url => url.includes('refresh=1')), true)
  assert.equal(result.status, 'ready')
  let fulfill
  globalThis.fetch=()=>new Promise(resolve=>{fulfill=resolve})
  let stale
  await act(async()=>{stale=api.submit({avatarId:'avatar'})})
  await act(async()=>api.reset())
  await act(async()=>{fulfill(new Response(JSON.stringify({success:true,task,taskRef:'upstream-task'})));result=await stale})
  assert.equal(result,null)
  assert.equal(api.pending,null)
  assert.equal(api.submitting,false)
})

test('同一父图的派生行按真实时间选择最新而非缺失网页id', () => {
  const rows = [
    { taskId: 'parent', kind: 'sheet' },
    { taskId: 'child-new', kind: 'multiview', parentTaskId: 'parent', createdAt: '2026-10-13T03:00:00Z' },
    { taskId: 'child-old', kind: 'multiview', parentTaskId: 'parent', createdAt: '2026-10-13T02:00:00Z' },
  ]
  assert.equal(partitionTasks(rows).childByParent.get('parent').taskId, 'child-new')
})
