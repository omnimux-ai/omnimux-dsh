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
  // 2026-10-21 网关对账 #3516 评审修正：seedance-2-5 两档各自锁定固定分辨率，
  // 默认档是 720p 标准版（480p 经济版非默认）；H3 分组退场后用它保留
  // 「候选池 + 每档约束」的通用断言。
  return {
    model: 'seedance-2-5', operation: 'text_to_video', prompt: 'synthetic running horse',
    allowedGroups: ['720p'], duration: 5, resolution: '720p',
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
  // 现役多线路模型 seedance-2-5：720p 标准版是默认档，两档各锁定自己的固定分辨率。
  const groups = getModelChannelGroups('seedance-2-5')
  assert.deepEqual(groups.map((group) => group.id), ['480p', '720p'])
  assert.equal(groups[0].default, undefined)
  assert.equal(groups[1].default, true)
  assert.deepEqual(groups.map((group) => group.constraints?.parameters?.resolution), [
    { fixed: '480p' }, { fixed: '720p' },
  ])
  assert.deepEqual(resolveChannelPlan('seedance-2-5@720p', { allowedGroups: ['480p', '720p'] }).candidates,
    ['seedance-2-5@seedance-2-5-720p', 'seedance-2-5@seedance-2-5-480p'])
  const calls = []
  const input = videoInput(home, 'legal-first-head')
  input.allowedGroups = ['720p']
  input.runtime = { async execute(request) {
    calls.push(request)
    return { taskId: 'synthetic-first-head-task-3312', outputs: [] }
  } }
  const result = await executeOmnimuxMedia('video', input)
  assert.equal(result.mode, 'submitted')
  assert.equal(calls.length, 1)
  assertVideoCall(calls[0], 'seedance-2-5', 5)
  assert.equal(getMediaTaskRecord(result.taskRef).wireModel, 'seedance-2-5')
  assert.equal(getMediaTaskRecord(result.taskRef).group, 'seedance-2-5-720p')
}))

test('3312: a 720p request refuses the allowed 480p tail fixed at 480p before a second runtime call rather than rewriting the user resolution', async () => isolated(async (home) => {
  const calls = []
  const input = videoInput(home, 'incompatible-resolution-tail')
  input.group = '720p'
  input.allowedGroups = ['480p', '720p']
  input.strategy = 'cost_first'
  input.runtime = capturedRuntime(calls)
  let rejection
  try { await executeOmnimuxMedia('video', input) } catch (error) { rejection = error }
  assert.equal(calls.length, 1, 'the head tier must admit the original resolution before runtime')
  assertVideoCall(calls[0], 'seedance-2-5', 5)
  assert.ok(rejection, '720p cannot submit to the fixed-480p tail')
  assert.equal(rejection.code, 'omnimux-invalid-request')
  assert.match(rejection.message, /resolution|480p/)
  assert.equal(input.resolution, '720p', 'the caller resolution is never rewritten')
  assert.equal(input.model, 'seedance-2-5')
  assert.equal(existsSync(input.dest), false)
  const record = findMediaTaskByRequestKey(input.requestKey)
  assert.equal(record.status, 'failed')
  assert.equal(record.upstreamTaskId, undefined)
}))

test('3312: an omitted resolution cannot carry the head default of 720p into a fixed-480p tail', async () => isolated(async (home) => {
  const calls = []
  const input = videoInput(home, 'omitted-resolution-tail')
  delete input.resolution
  input.group = '720p'
  input.allowedGroups = ['480p', '720p']
  input.strategy = 'cost_first'
  input.runtime = capturedRuntime(calls)
  await assert.rejects(() => executeOmnimuxMedia('video', input), { code: 'omnimux-invalid-request' })
  assert.equal(calls.length, 1)
  assertVideoCall(calls[0], 'seedance-2-5', 5)
  assert.equal(Object.hasOwn(input, 'resolution'), false)
}))

test('3312: the default 720p tier keeps a legal submission with the original logical intent and accepted task record', async () => isolated(async (home) => {
  const calls = []
  const input = videoInput(home, 'legal-default-tier')
  input.duration = 5
  input.runtime = { async execute(request) {
    calls.push(request)
    return { taskId: 'synthetic-default-task-3312', outputs: [] }
  } }
  const result = await executeOmnimuxMedia('video', input)
  assert.equal(result.mode, 'submitted')
  assert.equal(result.taskId, 'synthetic-default-task-3312')
  assert.equal(calls.length, 1)
  assertVideoCall(calls[0], 'seedance-2-5', 5)
  assert.equal(input.model, 'seedance-2-5')
  const record = getMediaTaskRecord(result.taskRef)
  assert.equal(record.model, 'seedance-2-5')
  assert.equal(record.wireModel, 'seedance-2-5')
  assert.equal(record.group, 'seedance-2-5-720p')
  assert.equal(record.status, 'submitted')
  assert.equal(record.upstreamTaskId, result.taskId)
}))

test('3312: the explicitly selected 480p economy tier stays usable with its own fixed resolution', async () => isolated(async (home) => {
  const calls = []
  const input = videoInput(home, 'legal-economy-tier')
  input.group = '480p'
  input.allowedGroups = ['480p']
  input.resolution = '480p'
  input.runtime = { async execute(request) {
    calls.push(request)
    return { taskId: 'synthetic-economy-task-3312', outputs: [] }
  } }
  const result = await executeOmnimuxMedia('video', input)
  assert.equal(result.mode, 'submitted')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].input.model, 'seedance-2-5')
  assert.equal(calls[0].input.duration, 5)
  assert.equal(calls[0].input.resolution, '480p')
  const record = getMediaTaskRecord(result.taskRef)
  assert.equal(record.wireModel, 'seedance-2-5')
  assert.equal(record.group, 'seedance-2-5-480p')
}))

test('3312: each explicit tier sends the exact bare wire model and its own group header with unchanged resolution through synthetic HTTP', async () => isolated(async (home) => {
  const posts = []
  const input = videoInput(home, 'legal-wire')
  input.group = '480p'
  input.allowedGroups = ['480p']
  input.resolution = '480p'
  input.fetcher = async (url, init) => {
    assert.equal(String(url), 'https://api.omnimux.ai/v1/video/generations')
    assert.equal(init.method, 'POST')
    posts.push({ body: JSON.parse(init.body), group: new Headers(init.headers).get('x-omnimux-group') })
    return new Response(JSON.stringify({ task_id: 'synthetic-wire-task-3312' }),
      { headers: { 'content-type': 'application/json' } })
  }
  const result = await executeOmnimuxMedia('video', input)
  assert.equal(result.mode, 'submitted')
  assert.equal(posts.length, 1)
  // 模型 ID 保持裸产品 ID；分组头与分辨率都来自所选档位。
  assert.equal(posts[0].body.model, 'seedance-2-5')
  assert.equal(posts[0].group, 'seedance-2-5-480p')
  assert.equal(posts[0].body.duration, 5)
  assert.equal(posts[0].body.resolution, '480p')
  assert.equal(getMediaTaskRecord(result.taskRef).wireModel, 'seedance-2-5')
  assert.equal(getMediaTaskRecord(result.taskRef).group, 'seedance-2-5-480p')
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
