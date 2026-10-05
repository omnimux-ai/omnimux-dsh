// HTTP 路由：宿主鉴权先行、写路由同源/JSON/体积门、静态预设图 Range、错误永不变成成功。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGeneration } from './generation.js'
import { registerAvatarRoutes } from './http.js'
import { createLibrarySync } from './library-sync.js'
import { resolveAvatarPaths } from './paths.js'
import { createAvatarStore } from './store.js'

const PRESET_NAME = 'abcdef12.webp'
const PRESET_BYTES = Buffer.from('webp-bytes-'.repeat(8))
const TASK_IMAGE_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('task-image-bytes-'.repeat(4)),
])

/** 起一个只服务该插件的真实 HTTP 服务；每个用例独立临时家目录。 */
async function boot(t, { connection } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'avatar-http-'))
  t.after(() => rm(home, { recursive: true, force: true }))

  const presetsDir = join(home, 'presets')
  mkdirSync(presetsDir, { recursive: true })
  writeFileSync(join(presetsDir, PRESET_NAME), PRESET_BYTES)

  const paths = { ...resolveAvatarPaths({ homeDir: home }), presetsDir }
  const store = createAvatarStore({ paths })
  const seam = {
    calls: [],
    async execute(input) {
      this.calls.push(input)
      return { mode: 'live', taskRef: 'tr_http', dest: input.dest, kind: 'image' }
    },
  }
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths, imageGenerate: seam })
  const librarySync = createLibrarySync({
    ctx: { get: () => undefined },
    store,
    paths,
    assetLibrary: { async saveTypedAsset() {}, async attachFiles() {}, findBySource: () => null },
  })

  const services = {
    connection: connection === undefined ? { requestRejection: () => undefined } : connection,
  }
  let handler
  registerAvatarRoutes(
    { register(route) { handler = route.handler; return () => {} } },
    { store, generation, librarySync, paths, ctx: { get: (name) => services[name] } }
  )
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  const post = (path, body, headers = {}) =>
    fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  return { origin, paths, store, services, seam, post }
}

test('宿主鉴权先行：未授权 401、连接座位缺失 503', async (t) => {
  const { origin, services } = await boot(t, {
    connection: { requestRejection: (req) => (req.headers.cookie === 'session=authorized' ? undefined : 401) },
  })

  const denied = await fetch(`${origin}/api/omnimux/avatar/taxonomy`)
  assert.equal(denied.status, 401)
  assert.equal((await denied.json()).success, false)

  const allowed = await fetch(`${origin}/api/omnimux/avatar/taxonomy`, { headers: { Cookie: 'session=authorized' } })
  assert.equal(allowed.status, 200)

  services.connection = undefined
  const missing = await fetch(`${origin}/api/omnimux/avatar/taxonomy`, { headers: { Cookie: 'session=authorized' } })
  assert.equal(missing.status, 503)
  const body = await missing.json()
  assert.equal(body.success, false)
  assert.equal(body.error.code, 'needs-connection')
})

test('写路由：跨站、非同源、非 JSON 一律拒绝', async (t) => {
  const { origin, post, store } = await boot(t)

  const crossSite = await post('/api/omnimux/avatar/avatars', { name: '甲' }, { 'sec-fetch-site': 'cross-site' })
  assert.equal(crossSite.status, 403)

  const crossOrigin = await post('/api/omnimux/avatar/avatars', { name: '甲' }, { Origin: 'http://attacker.test' })
  assert.equal(crossOrigin.status, 403)

  const badType = await post('/api/omnimux/avatar/avatars', { name: '甲' }, { 'Content-Type': 'text/plain' })
  assert.equal(badType.status, 415)

  assert.equal(store.list().length, 0)

  const ok = await post('/api/omnimux/avatar/avatars', { name: '甲' })
  assert.equal(ok.status, 200)
  assert.equal(store.list().length, 1)
})

test('形象 CRUD 路由与 revision', async (t) => {
  const { origin, post } = await boot(t)
  const url = (path) => `${origin}/api/omnimux/avatar${path}`

  const created = await post('/api/omnimux/avatar/avatars', { name: '林晓', sheet: { tier: 'normal', selection: { gender: ['female'] } } })
  assert.equal(created.status, 200)
  const createdBody = await created.json()
  assert.equal(createdBody.success, true)
  assert.match(createdBody.avatar.id, /^avt_[0-9a-f]{8}$/)
  const id = createdBody.avatar.id

  const conflict = await post('/api/omnimux/avatar/avatars', { name: '林晓' })
  assert.equal(conflict.status, 409)
  const conflictBody = await conflict.json()
  assert.equal(conflictBody.success, false)
  assert.equal(conflictBody.error.code, 'name-conflict')

  const listed = await (await fetch(url('/avatars'))).json()
  assert.equal(listed.success, true)
  assert.equal(listed.revision, 1)
  assert.equal(listed.avatars.length, 1)
  assert.equal(listed.avatars[0].latestTask, null)

  const updated = await post('/api/omnimux/avatar/avatars/update', { id, name: '林晓二' })
  assert.equal((await updated.json()).avatar.name, '林晓二')

  const noConfirm = await post('/api/omnimux/avatar/avatars/delete', { id })
  assert.equal(noConfirm.status, 400)
  assert.equal((await noConfirm.json()).error.code, 'confirmation-required')

  const removed = await post('/api/omnimux/avatar/avatars/delete', { id, confirm: true })
  assert.equal(removed.status, 200)
  assert.deepEqual(await removed.json(), { success: true, deleted: true })

  const empty = await (await fetch(url('/avatars'))).json()
  assert.equal(empty.avatars.length, 0)
  assert.equal(empty.revision, 3)
})

test('生成、多视角与任务路由共享同一套服务', async (t) => {
  const { origin, post, store, paths, seam } = await boot(t)
  const url = (path) => `${origin}/api/omnimux/avatar${path}`

  const avatar = (await (await post('/api/omnimux/avatar/avatars', { name: '生成形象' })).json()).avatar

  const sheet = await post('/api/omnimux/avatar/sheet', {
    avatarId: avatar.id,
    model: 'flux-pro',
    group: '默认组',
    tier: 'normal',
    selection: { gender: ['female'] },
    brief: '冷静',
  })
  assert.equal(sheet.status, 200)
  const sheetBody = await sheet.json()
  assert.equal(sheetBody.success, true)
  assert.equal(sheetBody.mode, 'live')
  assert.equal(sheetBody.taskRef, 'tr_http')
  assert.match(sheetBody.task.taskId, /^avt_task_[0-9a-f]{8}$/)
  assert.equal(seam.calls[0].wait, false)

  const tasks = await (await fetch(url(`/tasks?avatarId=${avatar.id}`))).json()
  assert.equal(tasks.success, true)
  assert.equal(tasks.tasks.length, 1)

  const taskId = sheetBody.task.taskId
  const one = await (await fetch(url(`/task?avatarId=${avatar.id}&taskId=${taskId}`))).json()
  assert.equal(one.task.status, 'ready')

  // 主图落盘后才可以派生多视角。
  writeFileSync(join(paths.dataDir, avatar.id, 'main.png'), 'fake-main')
  const refreshed = await (await fetch(url(`/task?avatarId=${avatar.id}&taskId=${taskId}&refresh=1`))).json()
  assert.equal(refreshed.task.status, 'ready')

  const multi = await post('/api/omnimux/avatar/multiview', { avatarId: avatar.id, model: 'flux-pro' })
  assert.equal(multi.status, 200)
  const multiBody = await multi.json()
  assert.equal(multiBody.task.kind, 'multiview')
  assert.equal(seam.calls.at(-1).aspectRatio, '16:9')
  assert.equal(seam.calls.at(-1).image, join(paths.dataDir, avatar.id, 'main.png'))

  const removed = await post('/api/omnimux/avatar/tasks/delete', { avatarId: avatar.id, taskId })
  assert.equal(removed.status, 200)
  assert.equal(store.listTasks(avatar.id).length, 1)
})

test('taxonomy 只回六个字段并带 etag；presets 回快照', async (t) => {
  const { origin } = await boot(t)
  const tax = await fetch(`${origin}/api/omnimux/avatar/taxonomy`)
  assert.equal(tax.status, 200)
  assert.equal(tax.headers.get('cache-control'), 'private, max-age=300')
  const taxBody = await tax.json()
  assert.equal(taxBody.success, true)
  assert.equal(taxBody.data.rules, undefined)
  assert.equal(taxBody.data.counts, undefined)
  assert.equal(typeof taxBody.data.version, 'number')
  assert.equal(taxBody.data.categories.length, 18)
  assert.match(taxBody.etag, /^[0-9a-f]{16}$/)

  const presets = await (await fetch(`${origin}/api/omnimux/avatar/presets`)).json()
  assert.equal(presets.success, true)
  assert.ok(Array.isArray(presets.data.items))
  assert.ok(presets.data.items.length > 0)
})

test('预设图片：只认白名单路径、支持 Range、越界 416', async (t) => {
  const { origin } = await boot(t)
  const asset = (query, headers) =>
    fetch(`${origin}/api/omnimux/avatar/presets/asset?path=${encodeURIComponent(query)}`, { headers })

  const full = await asset(`/influencer-presets/${PRESET_NAME}`)
  assert.equal(full.status, 200)
  assert.equal(full.headers.get('content-type'), 'image/webp')
  assert.equal(full.headers.get('cache-control'), 'private, max-age=86400')
  assert.equal(full.headers.get('accept-ranges'), 'bytes')
  assert.equal((await full.arrayBuffer()).byteLength, PRESET_BYTES.length)

  const ranged = await asset(`/influencer-presets/${PRESET_NAME}`, { Range: 'bytes=0-9' })
  assert.equal(ranged.status, 206)
  assert.equal(ranged.headers.get('content-range'), `bytes 0-9/${PRESET_BYTES.length}`)
  assert.equal((await ranged.arrayBuffer()).byteLength, 10)

  const beyond = await asset(`/influencer-presets/${PRESET_NAME}`, { Range: `bytes=${PRESET_BYTES.length}-` })
  assert.equal(beyond.status, 416)

  assert.equal((await asset('/influencer-presets/../../etc/passwd')).status, 404)
  assert.equal((await asset('/influencer-presets/ZZZZZZZZ.webp')).status, 404)
  assert.equal((await asset('/influencer-presets/deadbeef.webp')).status, 404)
  assert.equal((await asset('/other/abcdef12.webp')).status, 404)
})

test('任务成图：经形象→任务解析、支持 Range、越权与丢文件都 404、路径参数无效', async (t) => {
  const { origin, post, paths } = await boot(t)
  const url = (path) => `${origin}/api/omnimux/avatar${path}`

  const owner = (await (await post('/api/omnimux/avatar/avatars', { name: '图主' })).json()).avatar
  const other = (await (await post('/api/omnimux/avatar/avatars', { name: '他人' })).json()).avatar

  const submitted = await (
    await post('/api/omnimux/avatar/sheet', {
      avatarId: owner.id,
      model: 'flux-pro',
      tier: 'normal',
      selection: { gender: ['female'] },
    })
  ).json()
  const taskId = submitted.task.taskId

  // 文件还没落盘时，任务载荷不给地址——不给「点进去 404」的假入口。
  const pending = await (await fetch(url(`/tasks?avatarId=${owner.id}`))).json()
  assert.equal(pending.tasks[0].imageUrl, undefined)

  // 主图落在任务自己的 destPath 上（服务端就是这么记的）。
  const dest = join(paths.dataDir, owner.id, 'main.png')
  mkdirSync(join(paths.dataDir, owner.id), { recursive: true })
  writeFileSync(dest, TASK_IMAGE_BYTES)

  const listed = await (await fetch(url(`/tasks?avatarId=${owner.id}`))).json()
  const imageUrl = `/api/omnimux/avatar/task/image?avatarId=${owner.id}&taskId=${taskId}`
  assert.equal(listed.tasks[0].imageUrl, imageUrl)

  const one = await (await fetch(url(`/task?avatarId=${owner.id}&taskId=${taskId}`))).json()
  assert.equal(one.task.imageUrl, imageUrl)

  const full = await fetch(`${origin}${imageUrl}`)
  assert.equal(full.status, 200)
  assert.equal(full.headers.get('content-type'), 'image/png')
  assert.equal(full.headers.get('accept-ranges'), 'bytes')
  assert.equal(Buffer.from(await full.arrayBuffer()).equals(TASK_IMAGE_BYTES), true)

  const ranged = await fetch(`${origin}${imageUrl}`, { headers: { Range: 'bytes=0-7' } })
  assert.equal(ranged.status, 206)
  assert.equal(ranged.headers.get('content-range'), `bytes 0-7/${TASK_IMAGE_BYTES.length}`)
  assert.equal((await ranged.arrayBuffer()).byteLength, 8)

  const beyond = await fetch(`${origin}${imageUrl}`, { headers: { Range: `bytes=${TASK_IMAGE_BYTES.length}-` } })
  assert.equal(beyond.status, 416)

  // 别人的任务 id：形象存在但任务不属于它 → 404，且不泄露任何路径。
  assert.equal((await fetch(url(`/task/image?avatarId=${other.id}&taskId=${taskId}`))).status, 404)
  assert.equal((await fetch(url(`/task/image?avatarId=${owner.id}&taskId=avt_task_deadbeef`))).status, 404)

  // 原始路径参数一律不认：没有标识 → 400；带上也不改变实际取的文件。
  const rawOnly = await fetch(url(`/task/image?path=${encodeURIComponent(dest)}`))
  assert.equal(rawOnly.status, 400)
  assert.equal((await rawOnly.json()).error.code, 'invalid_request')

  const withRaw = await fetch(`${origin}${imageUrl}&path=${encodeURIComponent('/etc/passwd')}`)
  assert.equal(withRaw.status, 200)
  assert.equal(Buffer.from(await withRaw.arrayBuffer()).equals(TASK_IMAGE_BYTES), true)

  // 文件被删：404 且带文件自己的错误码，而不是 500。
  await rm(dest, { force: true })
  const gone = await fetch(`${origin}${imageUrl}`)
  assert.equal(gone.status, 404)
  const goneBody = await gone.json()
  assert.equal(goneBody.success, false)
  assert.equal(goneBody.error.code, 'ENOENT')

  const afterDelete = await (await fetch(url(`/tasks?avatarId=${owner.id}`))).json()
  assert.equal(afterDelete.tasks[0].imageUrl, undefined)
})

test('错误永不变成 200：非法选项、未知路由、错误方法、超大请求体', async (t) => {
  const { origin, post } = await boot(t)
  const url = (path) => `${origin}/api/omnimux/avatar${path}`

  const avatar = (await (await post('/api/omnimux/avatar/avatars', { name: '错误形象' })).json()).avatar

  const badSelection = await post('/api/omnimux/avatar/sheet', {
    avatarId: avatar.id,
    model: 'm',
    tier: 'normal',
    selection: { gender: ['不存在'] },
  })
  assert.equal(badSelection.status, 400)
  const badBody = await badSelection.json()
  assert.equal(badBody.success, false)
  assert.equal(badBody.error.code, 'invalid_selection')

  const noProvider = await fetch(`${origin}/api/omnimux/avatar/avatars`)
  assert.equal(noProvider.status, 200)

  assert.equal((await fetch(url('/task?avatarId=avt_deadbeef&taskId=x'))).status, 404)
  assert.equal((await fetch(url('/nope'))).status, 404)
  assert.equal((await fetch(url('/avatars'), { method: 'PUT' })).status, 405)

  const huge = await post('/api/omnimux/avatar/avatars', { name: 'x', sheet: { brief: 'x'.repeat(70 * 1024) } })
  assert.equal(huge.status, 413)

  const brokenJson = await post('/api/omnimux/avatar/avatars', '{ not json')
  assert.equal(brokenJson.status, 400)
  assert.equal((await brokenJson.json()).error.code, 'invalid_json')
})

test('缺少生成渠道时提交返回 503 needs-provider，不产生假任务', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'avatar-http-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const paths = resolveAvatarPaths({ homeDir: home })
  const store = createAvatarStore({ paths })
  const avatar = store.create({ name: '无渠道' })
  const generation = createGeneration({ ctx: { get: () => undefined }, store, paths })
  const librarySync = createLibrarySync({ ctx: { get: () => undefined }, store, paths, assetLibrary: {} })

  let handler
  registerAvatarRoutes(
    { register(route) { handler = route.handler; return () => {} } },
    { store, generation, librarySync, paths, connection: { requestRejection: () => undefined } }
  )
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`

  const response = await fetch(`${origin}/api/omnimux/avatar/sheet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ avatarId: avatar.id, model: 'm', tier: 'normal', selection: { gender: ['female'] } }),
  })
  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.success, false)
  assert.equal(body.error.code, 'needs-provider')
  assert.equal(store.listTasks(avatar.id).length, 0)
})
