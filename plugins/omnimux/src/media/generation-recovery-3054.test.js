import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { registerDirectMediaRoutes } from './direct-http.js'
import { executeOmnimuxMedia } from './execute.js'
import { resolveExecutionPlan } from './execution-plan.js'
import { createMediaTaskRecord, saveMediaTaskRecord, getMediaTaskRecord, updateMediaTaskRecord, findMediaTaskByRequestKey } from './task-store.js'

async function isolated(run) {
  const home = mkdtempSync(join(tmpdir(), 'media-recovery-3054-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try { await run(home) } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    rmSync(home, { recursive: true, force: true })
  }
}
function seed(patch = {}) {
  const record = createMediaTaskRecord({ capability: 'video', model: 'minimax-h3', providerId: 'omnimux', protocol: 'openai-media', baseUrl: 'https://api.omnimux.ai/v1', wireModel: 'minimax-h3', taskPath: 'video/generations', requestKey: 'recovery-fixture', ...patch })
  Object.assign(record, { status: 'submitted', upstreamTaskId: 'task-fixture-3054' }, patch)
  saveMediaTaskRecord(record)
  return record
}
function request(body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = 'POST'; return req
}
function response() { return { status: 0, writeHead(status) { this.status = status }, end(body) { this.body = JSON.parse(body) } } }
function route(executor) {
  let definition
  registerDirectMediaRoutes({ register(value) { definition = value } }, { executeVideo: executor })
  return definition
}

test('3054: explicit custom provider is never rewritten into an official request', () => {
  const plan = resolveExecutionPlan({ kind: 'image', req: { provider: 'custom', model: 'gpt-image-2.5' }, current: { runtimeMode: 'official' } })
  assert.equal(plan.finalReq.provider, 'custom')
  assert.equal(plan.isOfficialRequest, false)
})

test('3054: inline provider credentials resume only on the originally configured origin', async () => isolated(async (home) => {
  const media = { defaultProvider: 'custom', providers: { custom: { protocol: 'openai-media', baseUrl: 'https://custom.invalid/v1', apiKey: 'vendor-fixture', models: { image: 'vendor-image' } } } }
  const record = seed({ capability: 'image', model: 'vendor-image', providerId: 'custom', baseUrl: 'https://custom.invalid/v1', taskPath: 'images/generations', credentialRef: undefined })
  let gets = 0
  const result = await executeOmnimuxMedia('image', { taskRef: record.taskRef, dest: join(home, 'image.png'), media, env: {}, fetcher: async (_url, init) => {
    gets++
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer vendor-fixture')
    return new Response(JSON.stringify({ status: 'completed', data: [{ b64_json: 'cG5n' }] }), { headers: { 'content-type': 'application/json' } })
  } })
  assert.equal(result.mode, 'live')
  assert.equal(gets, 1)
}))

test('3054: a reused request key cannot relabel cached image bytes as video', async () => isolated(async (home) => {
  const record = seed({ capability: 'image', model: 'gpt-image-2.5' })
  const file = join(home, 'image.png'); writeFileSync(file, 'png')
  updateMediaTaskRecord(record.taskRef, { status: 'ready', artifact: { cachePath: file } })
  let calls = 0
  const res = response()
  await route(async () => { calls++; return { mode: 'live' } }).handler(request({ kind: 'video', model: 'minimax-h3', prompt: 'new video', requestKey: record.requestKey }), res)
  assert.equal(res.status, 409)
  assert.equal(calls, 0)
}))

test('3054: missing cached artifact never reports live or automatically resubmits', async () => isolated(async (home) => {
  const record = seed({ upstreamTaskId: undefined })
  updateMediaTaskRecord(record.taskRef, { status: 'ready', artifact: { cachePath: join(home, 'missing.mp4') } })
  let calls = 0
  await assert.rejects(() => executeOmnimuxMedia('video', { model: 'minimax-h3', requestKey: record.requestKey, prompt: 'same request', dest: join(home, 'video.mp4'), env: { OMNIMUX_API_KEY: 'sk-fixture' }, fetcher: async () => { calls++; } }), { code: 'omnimux-artifact-unavailable' })
  assert.equal(calls, 0)
}))

test('3054: synchronous URL accepted before download failure is recovered without another POST', async () => isolated(async (home) => {
  let posts = 0, downloads = 0, blocked = true
  const input = { model: 'gpt-image-2.5', operation: 'text_to_image', prompt: 'a dog in a garden', requestKey: 'sync-url-fixture', dest: join(home, 'image.png'), env: { OMNIMUX_API_KEY: 'sk-fixture' }, fetcher: async (_url, init) => {
    if (init.method === 'POST') { posts++; return new Response(JSON.stringify({ data: [{ url: 'https://api.omnimux.ai/v1/images/sync-fixture/content' }] }), { headers: { 'content-type': 'application/json' } }) }
    downloads++
    return blocked ? new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }) : new Response('png-fixture', { headers: { 'content-type': 'image/png' } })
  } }
  await assert.rejects(() => executeOmnimuxMedia('image', input), { code: 'needs-omnimux' })
  const saved = findMediaTaskByRequestKey(input.requestKey)
  assert.equal(saved.status, 'submitted')
  assert.ok(saved.artifact.sourceUrl)
  blocked = false
  const res = await executeOmnimuxMedia('image', { ...input, taskRef: saved.taskRef })
  assert.equal(res.mode, 'live')
  assert.equal(posts, 1)
  assert.equal(downloads, 2)
  assert.ok(existsSync(input.dest))
}))

test('3054: transport/auth/download interruptions retain original accepted task and expose recovery', async () => isolated(async () => {
  for (const code of ['needs-omnimux', 'omnimux-download-failed', 'omnimux-aborted', 'omnimux-request-failed']) {
    const record = seed({ requestKey: code })
    const definition = route(async () => { throw Object.assign(new Error('temporary fixture interruption'), { code }) })
    const res = response()
    await definition.handler(request({ kind: 'video', taskRef: record.taskRef }), res)
    assert.equal(res.body.recoverable, true)
    assert.equal(res.body.taskRef, record.taskRef)
    assert.equal(getMediaTaskRecord(record.taskRef).status, 'submitted')
    const success = response()
    await route(async (req) => {
      assert.equal(req.taskRef, record.taskRef)
      return { mode: 'live', url: 'https://fixture.invalid/video.mp4', taskRef: record.taskRef }
    }).handler(request({ kind: 'video', taskRef: record.taskRef }), success)
    assert.equal(success.body.mode, 'live')
  }
}))

test('3054: terminal provider failure is explicit and cannot overwrite completed artifact', async () => isolated(async (home) => {
  const record = seed()
  const failure = Object.assign(new Error('provider rejected this task'), { code: 'omnimux-failed' })
  const failed = response()
  await route(async () => { throw failure }).handler(request({ kind: 'video', taskRef: record.taskRef }), failed)
  assert.equal(getMediaTaskRecord(record.taskRef).status, 'failed')
  assert.equal(failed.body.recoverable, false)
  const file = join(home, 'completed.mp4'); writeFileSync(file, 'fixture video')
  updateMediaTaskRecord(record.taskRef, { status: 'ready', artifact: { cachePath: file } })
  updateMediaTaskRecord(record.taskRef, { status: 'failed', error: 'late failure' })
  assert.equal(getMediaTaskRecord(record.taskRef).status, 'ready')
  assert.equal(getMediaTaskRecord(record.taskRef).artifact.cachePath, file)
}))

test('3054: collection ignores current BYOK config and consumes persisted original origin/reference', async () => isolated(async (home) => {
  const record = seed({ credentialRef: 'OMNIMUX_API_KEY' })
  const calls = []
  const result = await executeOmnimuxMedia('video', {
    taskRef: record.taskRef, dest: join(home, 'video.mp4'),
    runtimeSettings: { runtimeMode: 'key', runtimeMediaProvider: 'custom', runtimeKeyVerified: false, runtimeKeyEndpoint: '' },
    env: {}, credentials: { resolve: async (ref) => {
      assert.equal(ref, 'OMNIMUX_API_KEY'); return { value: 'sk-original-fixture' }
    } },
    fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init.method || 'GET', authorization: new Headers(init.headers).get('authorization') })
      if (String(url).endsWith('/content')) return new Response('video fixture bytes', { headers: { 'content-type': 'video/mp4' } })
      return new Response(JSON.stringify({ status: 'succeeded', url: 'https://api.omnimux.ai/v1/videos/task-fixture-3054/content' }), { headers: { 'content-type': 'application/json' } })
    },
  })
  assert.equal(result.mode, 'live')
  assert.equal(result.taskRef, record.taskRef)
  assert.ok(existsSync(join(home, 'video.mp4')))
  assert.ok(calls.every((c) => c.method === 'GET' && c.authorization === 'Bearer sk-original-fixture' && c.url.startsWith('https://api.omnimux.ai/')))
  assert.equal(getMediaTaskRecord(record.taskRef).status, 'ready')
}))

test('3054: accepted wait=true task is persisted before poll failure and does not resubmit same key', async () => isolated(async (home) => {
  let postCount = 0
  const fetcher = async (_url, init) => {
    if (init.method === 'POST') { postCount++; return new Response(JSON.stringify({ task_id: 'task-accepted-fixture' }), { headers: { 'content-type': 'application/json' } }) }
    return new Response(JSON.stringify({ error: { message: 'invalid credential fixture' } }), { status: 401, headers: { 'content-type': 'application/json' } })
  }
  const input = { model: 'minimax-h3', operation: 'text_to_video', prompt: 'a dog in a garden', duration: 5, resolution: '2K', requestKey: 'accepted-wait-fixture', dest: join(home, 'video.mp4'), env: { OMNIMUX_API_KEY: 'sk-fixture' }, fetcher, wait: true }
  await assert.rejects(() => executeOmnimuxMedia('video', input), { code: 'needs-omnimux' })
  const record = findMediaTaskByRequestKey(input.requestKey)
  assert.equal(record.upstreamTaskId, 'task-accepted-fixture')
  assert.equal(record.status, 'submitted')
  const repeated = await executeOmnimuxMedia('video', { ...input, wait: false })
  assert.equal(repeated.taskRef, record.taskRef)
  assert.equal(postCount, 1)
}))
