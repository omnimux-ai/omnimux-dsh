import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { registerDirectMediaRoutes } from './direct-http.js'
import { executeOmnimuxMedia } from './execute.js'
import { resolveExecutionPlan } from './execution-plan.js'
import { createMediaTaskRecord, saveMediaTaskRecord, getMediaTaskRecord, updateMediaTaskRecord, findMediaTaskByRequestKey } from './task-store.js'

async function isolated(run) {
  const home = mkdtempSync(join(tmpdir(), 'media-recovery-3054-')), previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try { await run(home) } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous
    rmSync(home, { recursive: true, force: true })
  }
}
function seed(patch = {}) {
  const record = createMediaTaskRecord(Object.assign({ capability: 'video', model: 'minimax-h3', providerId: 'omnimux', protocol: 'openai-media', baseUrl: 'https://api.omnimux.ai/v1', wireModel: 'minimax-h3', taskPath: 'video/generations', requestKey: 'recovery-fixture' }, patch))
  Object.assign(record, { status: 'submitted', upstreamTaskId: 'task-fixture-3054' }, patch)
  saveMediaTaskRecord(record); return record
}
function request(body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = 'POST'; return req
}
function response() { return { status: 0, writeHead(status) { this.status = status }, end(body) { this.body = JSON.parse(body) } } }
function route(executor) {
  let definition
  registerDirectMediaRoutes({ register(value) { definition = value } }, { executeVideo: executor }); return definition
}
function customSettings() {
  return { scenarioBindings: { image: { channel: 'byok', provider: 'custom' }, video: { channel: 'pending' } },
    byokProviders: [{ provider: 'custom', endpoint: 'https://custom.invalid/v1', models: { image: 'vendor-image' }, capabilities: ['image'] }] }
}
const CUSTOM_MEDIA = { defaultProvider: 'custom', providers: { custom: {
  protocol: 'openai-media', baseUrl: 'https://custom.invalid/v1', apiKeyEnv: 'OMNIMUX_MEDIA_KEY_CUSTOM', models: { image: 'vendor-image' },
} } }
function customSeed() {
  return seed({ capability: 'image', model: 'vendor-image', providerId: 'custom', baseUrl: 'https://custom.invalid/v1', taskPath: 'images/generations', credentialRef: 'OMNIMUX_MEDIA_KEY_CUSTOM' })
}
function completedImage() { return new Response(JSON.stringify({ status: 'completed', data: [{ b64_json: 'cG5n' }] }), { headers: { 'content-type': 'application/json' } }) }

test('3054: explicit configured custom provider is never rewritten into an official request', () => {
  const plan = resolveExecutionPlan({ kind: 'image', req: { provider: 'custom', model: 'gpt-image-2.5' }, current: customSettings() })
  assert.equal(plan.finalReq.provider, 'custom'); assert.equal(plan.isOfficialRequest, false); assert.equal(plan.isByok, true); assert.equal(plan.modelId, 'gpt-image-2.5')
  assert.throws(() => resolveExecutionPlan({ kind: 'image', req: { provider: 'custom', model: 'gpt-image-2.5' }, current: { runtimeMode: 'official' } }), { code: 'omnimux-unconfigured' })
})
test('3054: inline provider credentials resume only on the originally configured origin', async () => isolated(async (home) => {
  const media = { defaultProvider: 'custom', providers: { custom: { protocol: 'openai-media', baseUrl: 'https://custom.invalid/v1', apiKey: 'vendor-fixture', models: { image: 'vendor-image' } } } }
  const record = seed({ capability: 'image', model: 'vendor-image', providerId: 'custom', baseUrl: 'https://custom.invalid/v1', taskPath: 'images/generations', credentialRef: undefined })
  let gets = 0
  const result = await executeOmnimuxMedia('image', { taskRef: record.taskRef, dest: join(home, 'image.png'), media, env: {}, fetcher: async (_url, init) => {
    gets++; assert.equal(new Headers(init.headers).get('authorization'), 'Bearer vendor-fixture'); return completedImage()
  } })
  assert.equal(result.mode, 'live'); assert.equal(gets, 1)
  const other = seed({ capability: 'image', model: 'vendor-image', providerId: 'custom', baseUrl: 'https://old.invalid/v1', taskPath: 'images/generations', credentialRef: undefined, requestKey: 'inline-other-origin' })
  await assert.rejects(() => executeOmnimuxMedia('image', { taskRef: other.taskRef, dest: join(home, 'other.png'), media, env: {}, fetcher: async () => { gets++; return completedImage() } }), { code: 'omnimux-unconfigured' })
  assert.equal(gets, 1)
}))
test('3054: a reused request key cannot relabel cached image bytes as video', async () => isolated(async (home) => {
  const record = seed({ capability: 'image', model: 'gpt-image-2.5' }), file = join(home, 'image.png'); writeFileSync(file, 'png')
  updateMediaTaskRecord(record.taskRef, { status: 'ready', artifact: { cachePath: file } })
  let calls = 0
  const res = response()
  await route(async () => { calls++; return { mode: 'live' } }).handler(request({ kind: 'video', model: 'minimax-h3', prompt: 'new video', requestKey: record.requestKey }), res)
  assert.equal(res.status, 409); assert.equal(calls, 0)
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
    downloads++; return blocked ? new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }) : new Response('png-fixture', { headers: { 'content-type': 'image/png' } })
  } }
  await assert.rejects(() => executeOmnimuxMedia('image', input), { code: 'needs-omnimux' })
  const saved = findMediaTaskByRequestKey(input.requestKey)
  assert.equal(saved.status, 'submitted'); assert.ok(saved.artifact.sourceUrl); blocked = false
  const res = await executeOmnimuxMedia('image', Object.assign({}, input, { taskRef: saved.taskRef }))
  assert.equal(res.mode, 'live'); assert.equal(posts, 1); assert.equal(downloads, 2); assert.ok(existsSync(input.dest))
}))
test('3054: transport/auth/download interruptions retain original accepted task and expose recovery', async () => isolated(async () => {
  for (const code of ['needs-omnimux', 'omnimux-download-failed', 'omnimux-aborted', 'omnimux-request-failed']) {
    const record = seed({ requestKey: code }), definition = route(async () => { throw Object.assign(new Error('temporary fixture interruption'), { code }) }), res = response()
    await definition.handler(request({ kind: 'video', taskRef: record.taskRef }), res)
    assert.equal(res.body.recoverable, true); assert.equal(res.body.taskRef, record.taskRef); assert.equal(getMediaTaskRecord(record.taskRef).status, 'submitted')
    const success = response()
    await route(async (req) => { assert.equal(req.taskRef, record.taskRef); return { mode: 'live', url: 'https://fixture.invalid/video.mp4', taskRef: record.taskRef } }).handler(request({ kind: 'video', taskRef: record.taskRef }), success)
    assert.equal(success.body.mode, 'live')
  }
}))
test('3054: terminal provider failure is explicit and cannot overwrite completed artifact', async () => isolated(async (home) => {
  const record = seed(), failure = Object.assign(new Error('provider rejected this task'), { code: 'omnimux-failed' }), failed = response()
  await route(async () => { throw failure }).handler(request({ kind: 'video', taskRef: record.taskRef }), failed)
  assert.equal(getMediaTaskRecord(record.taskRef).status, 'failed'); assert.equal(failed.body.recoverable, false)
  const file = join(home, 'completed.mp4'); writeFileSync(file, 'fixture video')
  updateMediaTaskRecord(record.taskRef, { status: 'ready', artifact: { cachePath: file } }); updateMediaTaskRecord(record.taskRef, { status: 'failed', error: 'late failure' })
  assert.equal(getMediaTaskRecord(record.taskRef).status, 'ready'); assert.equal(getMediaTaskRecord(record.taskRef).artifact.cachePath, file)
}))
test('3054: collection ignores current BYOK config and consumes persisted original origin/reference', async () => isolated(async (home) => {
  const record = seed({ credentialRef: 'OMNIMUX_API_KEY' }), calls = []
  const result = await executeOmnimuxMedia('video', {
    taskRef: record.taskRef, dest: join(home, 'video.mp4'), runtimeSettings: { runtimeMode: 'key', runtimeMediaProvider: 'custom', runtimeKeyVerified: false, runtimeKeyEndpoint: '', scenarioBindings: { video: { channel: 'pending' } } },
    env: {}, credentials: { resolve: async (ref) => { assert.equal(ref, 'OMNIMUX_API_KEY'); return { value: 'sk-original-fixture' } } }, fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init.method || 'GET', authorization: new Headers(init.headers).get('authorization') })
      if (String(url).endsWith('/content')) return new Response('video fixture bytes', { headers: { 'content-type': 'video/mp4' } })
      return new Response(JSON.stringify({ status: 'succeeded', url: 'https://api.omnimux.ai/v1/videos/task-fixture-3054/content' }), { headers: { 'content-type': 'application/json' } })
    },
  })
  assert.equal(result.mode, 'live'); assert.equal(result.taskRef, record.taskRef); assert.ok(existsSync(join(home, 'video.mp4')))
  assert.ok(calls.every((c) => c.method === 'GET' && c.authorization === 'Bearer sk-original-fixture' && c.url.startsWith('https://api.omnimux.ai/')))
  assert.equal(getMediaTaskRecord(record.taskRef).status, 'ready')
}))
test('3054: accepted wait=true task is persisted before poll failure and does not resubmit same key', async () => isolated(async (home) => {
  let postCount = 0
  const fetcher = async (_url, init) => {
    if (init.method === 'POST') { postCount++; return new Response(JSON.stringify({ task_id: 'task-accepted-fixture' }), { headers: { 'content-type': 'application/json' } }) }
    return new Response(JSON.stringify({ error: { message: 'invalid credential fixture' } }), { status: 401, headers: { 'content-type': 'application/json' } })
  }
  // #3516：改用现役 seedance-2-5（minimax-h3 仅登记不上架，无法承接新提交）。
  const input = { model: 'seedance-2-5', operation: 'text_to_video', prompt: 'a dog in a garden', duration: 5, resolution: '720p', requestKey: 'accepted-wait-fixture', dest: join(home, 'video.mp4'), env: { OMNIMUX_API_KEY: 'sk-fixture' }, fetcher, wait: true }
  await assert.rejects(() => executeOmnimuxMedia('video', input), { code: 'needs-omnimux' })
  const record = findMediaTaskByRequestKey(input.requestKey)
  assert.equal(record.upstreamTaskId, 'task-accepted-fixture'); assert.equal(record.status, 'submitted')
  const repeated = await executeOmnimuxMedia('video', Object.assign({}, input, { wait: false }))
  assert.equal(repeated.taskRef, record.taskRef); assert.equal(postCount, 1)
}))
test('3312: BYOK collection keeps original origin/reference while using the current key after the current scenario becomes pending', async () => isolated(async (home) => {
  const record = customSeed(), current = customSettings(), refs = [], calls = []
  current.scenarioBindings.image = { channel: 'pending' }
  const result = await executeOmnimuxMedia('image', { taskRef: record.taskRef, dest: join(home, 'image.png'), runtimeSettings: current, media: CUSTOM_MEDIA,
    env: { OMNIMUX_MEDIA_KEY_CUSTOM: 'forged-old-key', OMNIMUX_MEDIA_KEY: 'wrong-generic-key' },
    credentials: { async resolve(ref) { refs.push(ref); assert.equal(ref, 'OMNIMUX_MEDIA_KEY_CUSTOM'); return { value: 'current-rotated-key' } } }, fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init.method || 'GET', auth: new Headers(init.headers).get('authorization') }); return completedImage()
    } })
  assert.equal(result.mode, 'live'); assert.equal(result.taskRef, record.taskRef); assert.deepEqual(refs, ['OMNIMUX_MEDIA_KEY_CUSTOM'])
  assert.equal(calls.length, 1); assert.ok(calls[0].url.startsWith('https://custom.invalid/v1/')); assert.equal(calls[0].method, 'GET'); assert.equal(calls[0].auth, 'Bearer current-rotated-key')
  assert.equal(readFileSync(join(home, 'image.png'), 'utf8'), 'png'); assert.equal(getMediaTaskRecord(record.taskRef).baseUrl, 'https://custom.invalid/v1')
}))
test('3312: BYOK collection rejects an origin change before credentials or HTTP', async () => isolated(async (home) => {
  const record = customSeed(), current = customSettings(); current.byokProviders[0].endpoint = 'https://replacement.invalid/v1'
  let calls = 0
  await assert.rejects(() => executeOmnimuxMedia('image', { taskRef: record.taskRef, dest: join(home, 'image.png'), runtimeSettings: current, media: CUSTOM_MEDIA,
    credentials: { async resolve() { calls++; return { value: 'must-not-send' } } }, fetcher: async () => { calls++; return completedImage() } }), { code: 'omnimux-unconfigured' })
  assert.equal(calls, 0); assert.equal(getMediaTaskRecord(record.taskRef).status, 'submitted')
}))
test('3312: BYOK collection rejects pending provider save before credentials or HTTP', async () => isolated(async (home) => {
  const record = customSeed(), current = customSettings(); current.byokProviders[0].saveState = 'pending'
  let calls = 0
  await assert.rejects(() => executeOmnimuxMedia('image', { taskRef: record.taskRef, dest: join(home, 'image.png'), runtimeSettings: current, media: CUSTOM_MEDIA,
    credentials: { async resolve() { calls++; return { value: 'must-not-send' } } }, fetcher: async () => { calls++; return completedImage() } }), { code: 'omnimux-unconfigured' })
  assert.equal(calls, 0); assert.equal(getMediaTaskRecord(record.taskRef).status, 'submitted')
}))
test('3312: accepted custom task collection refuses duplicate or missing current provider identities before credentials', async () => isolated(async (home) => {
  const record = customSeed()
  const current = customSettings()
  current.byokProviders.push({ provider: 'custom', endpoint: 'https://replacement.invalid/v1', saveState: 'pending', models: { image: 'other-image' }, capabilities: ['image'] })
  let calls = 0
  const input = { taskRef: record.taskRef, dest: join(home, 'image.png'), runtimeSettings: current, media: CUSTOM_MEDIA,
    credentials: { async resolve() { calls += 1; return { value: 'synthetic-current-rotated-key' } } },
    fetcher: async () => { calls += 1; return completedImage() } }
  await assert.rejects(() => executeOmnimuxMedia('image', input), { code: 'omnimux-unconfigured' })
  current.byokProviders = []
  await assert.rejects(() => executeOmnimuxMedia('image', input), { code: 'omnimux-unconfigured' })
  current.byokProviders = [{ provider: 'custom', endpoint: '   ', models: { image: 'vendor-image' }, capabilities: ['image'] }]
  await assert.rejects(() => executeOmnimuxMedia('image', input), { code: 'omnimux-unconfigured' })
  current.byokProviders = [{ provider: 'custom', models: { image: 'vendor-image' }, capabilities: ['image'] }]
  await assert.rejects(() => executeOmnimuxMedia('image', input), { code: 'omnimux-unconfigured' })
  assert.equal(calls, 0)
  assert.equal(getMediaTaskRecord(record.taskRef).status, 'submitted')
}))

test('3312: current credential absence cannot revive a legacy inline Config key during collection', async () => isolated(async (home) => {
  const record = customSeed(); let http = 0
  const media = { defaultProvider: 'custom', providers: { custom: {
    protocol: 'openai-media', baseUrl: 'https://custom.invalid/v1', apiKey: 'synthetic-old-config-key', models: { image: 'vendor-image' },
  } } }
  await assert.rejects(() => executeOmnimuxMedia('image', { taskRef: record.taskRef, dest: join(home, 'image.png'),
    runtimeSettings: customSettings(), media, credentials: { async resolve() { return undefined } },
    fetcher: async () => { http += 1; return completedImage() } }), { code: 'omnimux-unconfigured' })
  assert.equal(http, 0)
  assert.equal(getMediaTaskRecord(record.taskRef).status, 'submitted')
}))

test('3312: BYOK collection never falls back to generic or official keys when the recorded dedicated reference is absent', async () => isolated(async (home) => {
  const record = customSeed(), refs = []; let http = 0
  await assert.rejects(() => executeOmnimuxMedia('image', { taskRef: record.taskRef, dest: join(home, 'image.png'), runtimeSettings: customSettings(), media: CUSTOM_MEDIA,
    env: { OMNIMUX_API_KEY: 'sk-wrong-official', OMNIMUX_MEDIA_KEY: 'wrong-generic', OMNIMUX_MEDIA_KEY_CUSTOM: 'forged-dedicated-key' }, credentials: { async resolve(ref) { refs.push(ref); return undefined } },
    fetcher: async () => { http++; return completedImage() } }), { code: 'omnimux-unconfigured' })
  assert.deepEqual(refs, ['OMNIMUX_MEDIA_KEY_CUSTOM']); assert.equal(http, 0); assert.equal(getMediaTaskRecord(record.taskRef).status, 'submitted')
}))
