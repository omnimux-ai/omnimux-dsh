import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { getModelChannelGroups, resolveChannelPlan } from '../catalog/serving/channel-groups.js'
import { executeOmnimuxMedia } from './execute.js'
import { resolveExecutionPlan } from './execution-plan.js'
import { DIRECT_MEDIA_GENERATE_ROUTE, registerDirectMediaRoutes } from './direct-http.js'
import { findMediaTaskByRequestKey, getMediaTaskRecord } from './task-store.js'
import { flushMediaTaskLog } from './task-log.js'

async function isolated(run) {
  const home = mkdtempSync(join(tmpdir(), 'candidate-intent-3312-'))
  const previousHome = process.env.HOME
  const previousDshHome = process.env.DSH_HOME
  const previousKey = process.env.OMNIMUX_API_KEY
  const previousToken = process.env.OMNIMUX_TOKEN
  const previousFetch = globalThis.fetch
  process.env.HOME = home
  process.env.DSH_HOME = home
  delete process.env.OMNIMUX_API_KEY
  delete process.env.OMNIMUX_TOKEN
  globalThis.fetch = async () => { throw new Error('Real network access is forbidden in this fixture') }
  try { await run(home) } finally {
    await flushMediaTaskLog()
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousDshHome
    if (previousKey === undefined) delete process.env.OMNIMUX_API_KEY
    else process.env.OMNIMUX_API_KEY = previousKey
    if (previousToken === undefined) delete process.env.OMNIMUX_TOKEN
    else process.env.OMNIMUX_TOKEN = previousToken
    globalThis.fetch = previousFetch
    assert.equal(resolve(home), home)
    assert.ok(isAbsolute(home) && home.startsWith(join(tmpdir(), 'candidate-intent-3312-')))
    rmSync(home, { recursive: true, force: true })
  }
}

function videoInput(home, requestKey) {
  // 2026-10-21 网关对账 #3516：H3 分组整体系列退场；现役多线路模型是 seedance-2-5
  //（480p 默认 / 720p），用它保留「候选池 + 约束 + failover」的通用断言。
  return {
    model: 'seedance-2-5@480p', operation: 'text_to_video', prompt: 'synthetic running horse',
    allowedGroups: ['480p', '720p'], duration: 5, resolution: '720p',
    dest: join(home, requestKey + '.mp4'), requestKey, wait: false,
    env: { OMNIMUX_API_KEY: 'sk-synthetic-candidate-fixture' },
    fetcher: async () => { throw new Error('Unexpected HTTP in the runtime fixture') },
  }
}

function unavailable() {
  const error = new Error('synthetic channel unavailable')
  error.code = 'CHANNEL_UNAVAILABLE'
  return error
}

function capturedRuntime(calls) {
  return { async execute(request) {
    calls.push(request)
    if (calls.length === 1) throw unavailable()
    return { taskId: 'synthetic-fallback-task-3312', outputs: [] }
  } }
}

function assertVideoCall(request, model, duration) {
  assert.equal(request.providerId, 'omnimux')
  assert.equal(request.modelId, 'omnimux-video')
  assert.equal(request.input.model, model)
  assert.equal(request.input.duration, duration)
  assert.equal(request.input.resolution, '720p')
  assert.equal(request.metadata.wait, false)
}

function directFixture(home) {
  let route
  const calls = []
  registerDirectMediaRoutes({ register(definition) { route = definition; return () => {} } }, {
    storageDir: join(home, 'direct-ledger'),
    executeImage: async (request) => {
      calls.push(request)
      return { mode: 'submitted', taskId: 'synthetic-direct-task-3312', url: null }
    },
    executeVideo: async () => { throw new Error('Unexpected video executor') },
  })
  assert.equal(route.kind, 'exact')
  assert.equal(route.path, DIRECT_MEDIA_GENERATE_ROUTE)
  return { route, calls }
}

function imageBody(home, requestKey) {
  return { kind: 'image', prompt: 'synthetic image', model: 'gpt-image-2.5', group: 'standard',
    allowedGroups: ['standard', 'economy'], strategy: 'stability_first', provider: 'omnimux',
    dest: join(home, requestKey + '.png'), requestKey, wait: false }
}

async function post(route, body) {
  const request = Readable.from([Buffer.from(JSON.stringify(body), 'utf8')])
  request.method = 'POST'
  request.url = DIRECT_MEDIA_GENERATE_ROUTE
  const response = { status: 0, body: '',
    writeHead(status) { this.status = status },
    end(bodyText) { this.body = bodyText },
  }
  await route.handler(request, response)
  return { status: response.status, body: JSON.parse(response.body) }
}

async function assertDirectRejected(home, body, code) {
  const fixture = directFixture(home)
  assert.throws(() => resolveExecutionPlan({ kind: 'image', req: body }), { code })
  const result = await post(fixture.route, body)
  assert.equal(result.status, 400, 'invalid routing intent is a typed client rejection, not a server failure')
  assert.equal(result.body.ok, false)
  assert.equal(result.body.code, code)
  assert.equal(fixture.calls.length, 0)
  assert.equal(findMediaTaskByRequestKey(body.requestKey), null)
  assert.equal(findMediaTaskByRequestKey(body.requestKey, { storageDir: join(home, 'direct-ledger') }), null)
  assert.equal(existsSync(body.dest), false)
}

test('3312: the delisted H3 series exposes no channel groups while the listed multi-line model resolves legal heads', async () => isolated(async (home) => {
  // #3516：minimax-h3 的 7 条专线随上游渠道停用整体移除。
  assert.deepEqual(getModelChannelGroups('minimax-h3'), [])
  assert.deepEqual(resolveChannelPlan('minimax-h3@standard', { allowedGroups: ['standard', 'task'] }), {
    candidates: [], unresolvedGroups: ['standard', 'task'],
  })
  // 现役多线路模型 seedance-2-5 的合法首行与候选池保持按约束解析。
  assert.deepEqual(resolveChannelPlan('seedance-2-5@480p', { allowedGroups: ['480p', '720p'] }).candidates,
    ['seedance-2-5@seedance-2-5-480p', 'seedance-2-5@seedance-2-5-720p'])
  const calls = []
  const input = videoInput(home, 'legal-first-head')
  input.allowedGroups = ['480p']
  input.runtime = { async execute(request) {
    calls.push(request)
    return { taskId: 'synthetic-first-head-task-3312', outputs: [] }
  } }
  const result = await executeOmnimuxMedia('video', input)
  assert.equal(result.mode, 'submitted')
  assert.equal(calls.length, 1)
  assertVideoCall(calls[0], 'seedance-2-5', 5)
  assert.equal(getMediaTaskRecord(result.taskRef).wireModel, 'seedance-2-5')
  assert.equal(getMediaTaskRecord(result.taskRef).group, 'seedance-2-5-480p')
}))

test('3312: an out-of-range duration is refused before any runtime call instead of being rewritten', async () => isolated(async (home) => {
  const calls = []
  const input = videoInput(home, 'incompatible-duration')
  // seedance-2-5 的 duration 契约是 4–30 秒（allowAuto 允许 -1）；31 秒必须在 runtime 之前拒绝。
  input.duration = 31
  input.runtime = capturedRuntime(calls)
  let rejection
  try { await executeOmnimuxMedia('video', input) } catch (error) { rejection = error }
  assert.equal(calls.length, 0, 'guard must refuse the illegal duration before runtime')
  assert.ok(rejection, 'duration 31 cannot be submitted')
  assert.equal(rejection.code, 'omnimux-invalid-request')
  assert.match(rejection.message, /duration|时长/)
  assert.equal(input.duration, 31, 'the caller duration is never rewritten')
  assert.equal(input.model, 'seedance-2-5@480p')
  assert.equal(existsSync(input.dest), false)
  assert.equal(findMediaTaskByRequestKey(input.requestKey), null)
}))

test('3312: an omitted duration uses the documented head default and never mutates the caller request', async () => isolated(async (home) => {
  const calls = []
  const input = videoInput(home, 'omitted-duration-tail')
  delete input.duration
  input.runtime = capturedRuntime(calls)
  const result = await executeOmnimuxMedia('video', input)
  // 首行失败后回落到兼容的 720p 行，两行都收到契约默认时长 5 秒。
  assert.equal(result.mode, 'submitted')
  assert.equal(calls.length, 2)
  assertVideoCall(calls[0], 'seedance-2-5', 5)
  assertVideoCall(calls[1], 'seedance-2-5', 5)
  assert.equal(Object.hasOwn(input, 'duration'), false)
}))

test('3312: a compatible duration keeps a legal failover successful with the original logical intent and accepted task record', async () => isolated(async (home) => {
  const calls = []
  const input = videoInput(home, 'compatible-tail')
  input.duration = 5
  input.runtime = capturedRuntime(calls)
  const result = await executeOmnimuxMedia('video', input)
  assert.equal(result.mode, 'submitted')
  assert.equal(result.taskId, 'synthetic-fallback-task-3312')
  assert.equal(calls.length, 2)
  assertVideoCall(calls[0], 'seedance-2-5', 5)
  assertVideoCall(calls[1], 'seedance-2-5', 5)
  assert.equal(input.model, 'seedance-2-5@480p')
  const record = getMediaTaskRecord(result.taskRef)
  assert.equal(record.model, 'seedance-2-5')
  assert.equal(record.wireModel, 'seedance-2-5')
  assert.equal(record.group, 'seedance-2-5-720p')
  assert.equal(record.status, 'submitted')
  assert.equal(record.upstreamTaskId, result.taskId)
}))

test('3312: a compatible failover keeps every user parameter intact on the second line', async () => isolated(async (home) => {
  const calls = []
  const input = videoInput(home, 'compatible-video-tail')
  input.allowedGroups = ['480p', '720p']
  input.runtime = capturedRuntime(calls)
  const result = await executeOmnimuxMedia('video', input)
  assert.equal(result.mode, 'submitted')
  assert.equal(calls.length, 2)
  const [first, second] = calls
  assertVideoCall(first, 'seedance-2-5', 5)
  assertVideoCall(second, 'seedance-2-5', 5)
  // 持续时间 / 分辨率 / 提示词在换行后必须逐字保留。
  for (const key of ['duration', 'resolution', 'size', 'prompt', 'operation']) {
    assert.deepEqual(second.input[key], first.input[key], key)
  }
  assert.equal(getMediaTaskRecord(result.taskRef).wireModel, 'seedance-2-5')
  assert.equal(getMediaTaskRecord(result.taskRef).group, 'seedance-2-5-720p')
}))

test('3312: legal failover sends the exact bare wire model and per-line group header with unchanged duration through synthetic HTTP', async () => isolated(async (home) => {
  const posts = []
  const input = videoInput(home, 'compatible-wire')
  input.allowedGroups = ['480p', '720p']
  input.fetcher = async (url, init) => {
    assert.equal(String(url), 'https://api.omnimux.ai/v1/video/generations')
    assert.equal(init.method, 'POST')
    posts.push({ body: JSON.parse(init.body), group: new Headers(init.headers).get('x-omnimux-group') })
    if (posts.length === 1) {
      return new Response(JSON.stringify({ error: { code: 'get_channel_failed', message: 'synthetic channel unavailable' } }),
        { status: 503, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({ task_id: 'synthetic-wire-task-3312' }),
      { headers: { 'content-type': 'application/json' } })
  }
  const result = await executeOmnimuxMedia('video', input)
  assert.equal(result.mode, 'submitted')
  assert.equal(posts.length, 2)
  // 模型 ID 保持裸产品 ID；只有分组头随候选切换。
  assert.equal(posts[0].body.model, 'seedance-2-5')
  assert.equal(posts[1].body.model, 'seedance-2-5')
  assert.equal(posts[0].group, 'seedance-2-5-480p')
  assert.equal(posts[1].group, 'seedance-2-5-720p')
  assert.equal(posts[0].body.duration, 5)
  assert.equal(posts[1].body.duration, 5)
  assert.equal(posts[1].body.resolution, '720p')
  assert.equal(getMediaTaskRecord(result.taskRef).wireModel, 'seedance-2-5')
  assert.equal(getMediaTaskRecord(result.taskRef).group, 'seedance-2-5-720p')
}))

test('3312: an accepted task followed by channel failure never submits a second candidate and keeps its original handle', async () => isolated(async (home) => {
  const calls = []
  const input = videoInput(home, 'accepted-task-no-resubmit')
  input.runtime = { async execute(request) {
    calls.push(request)
    request.metadata.onSubmitted('synthetic-already-accepted-3312')
    throw unavailable()
  } }
  await assert.rejects(() => executeOmnimuxMedia('video', input), { code: 'CHANNEL_UNAVAILABLE' })
  assert.equal(calls.length, 1)
  const record = findMediaTaskByRequestKey(input.requestKey)
  assert.equal(record.status, 'submitted')
  assert.equal(record.upstreamTaskId, 'synthetic-already-accepted-3312')
  assert.equal(record.wireModel, 'seedance-2-5')
  assert.equal(record.collectionErrorCode, 'CHANNEL_UNAVAILABLE')
}))

test('3312: the direct HTTP planner preserves current official Config defaults when saved defaults are invalid', async () => isolated(async (home) => {
  let route, captured
  registerDirectMediaRoutes({ register(definition) { route = definition; return () => {} } }, {
    storageDir: join(home, 'config-default-ledger'),
    runtimeSettings: { defaultImageModel: 'invalid-default' },
    media: { defaultProvider: 'omnimux', providers: { omnimux: { protocol: 'openai-media', baseUrl: 'https://api.omnimux.ai/v1',
      apiKeyEnv: 'OMNIMUX_API_KEY', models: { image: 'gpt-image-2.5-flare' } } } },
    executeImage: async (request) => { captured = request; return { mode: 'submitted', taskId: 'synthetic-config-default' } },
    executeVideo: async () => { throw new Error('Unexpected video executor') },
  })
  const result = await post(route, { kind: 'image', prompt: 'synthetic default', dest: join(home, 'default.png'), wait: false })
  assert.equal(result.status, 200)
  // #3516：已下架的 gpt-image-2.5-flare 作为默认保存值同样被视为无效，
  // 回落到现役 listed 默认 gpt-image-2.5（不再采纳任何不可达模型）。
  assert.equal(captured.model, 'gpt-image-2.5')
}))

test('3312: direct image HTTP rejects a standard head excluded by the economy-only allowed pool before executor or new ledger', async () => isolated(async (home) => {
  const body = imageBody(home, 'direct-head-outside-pool')
  body.allowedGroups = ['economy']
  await assertDirectRejected(home, body, 'unknown-group')
}))

test('3312: direct image HTTP preserves the exact legal allowed pool strategy and provider on the captured executor request', async () => isolated(async (home) => {
  const fixture = directFixture(home)
  const body = imageBody(home, 'direct-legal-pool')
  const result = await post(fixture.route, body)
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  assert.equal(result.body.mode, 'submitted')
  assert.equal(fixture.calls.length, 1)
  assert.equal(fixture.calls[0].model, 'gpt-image-2.5')
  assert.equal(fixture.calls[0].group, 'standard')
  assert.equal(fixture.calls[0].channel, 'standard')
  assert.deepEqual(fixture.calls[0].allowedGroups, ['standard', 'economy'])
  assert.equal(fixture.calls[0].strategy, 'stability_first')
  assert.equal(fixture.calls[0].provider, 'omnimux')
  assert.equal(fixture.calls[0].requestKey, body.requestKey)
}))

test('3312: direct image HTTP rejects inline standard versus economy field conflict before any execution dependency', async () => isolated(async (home) => {
  const body = imageBody(home, 'direct-inline-field-conflict')
  body.model = 'gpt-image-2.5@standard'
  body.group = 'economy'
  await assertDirectRejected(home, body, 'unknown-group')
}))

test('3312: direct image HTTP rejects malformed nonempty allowed entries before any execution dependency', async () => isolated(async (home) => {
  const body = imageBody(home, 'direct-malformed-pool')
  body.allowedGroups = ['standard', 7]
  await assertDirectRejected(home, body, 'omnimux-invalid-request')
}))

test('3312: direct image HTTP rejects a mixed official and BYOK allowed pool before any execution dependency', async () => isolated(async (home) => {
  const body = imageBody(home, 'direct-mixed-pool')
  body.allowedGroups = ['standard', 'byok-custom']
  await assertDirectRejected(home, body, 'omnimux-invalid-request')
}))

test('3312: direct image HTTP rejects a conflicting explicit provider rather than silently replacing it with official', async () => isolated(async (home) => {
  const body = imageBody(home, 'direct-provider-conflict')
  body.provider = 'custom'
  await assertDirectRejected(home, body, 'unknown-group')
}))
