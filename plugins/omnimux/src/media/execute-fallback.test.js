import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { before, after, test } from 'node:test'
import { executeOmnimuxMedia } from './execute.js'
import { OmnimuxError } from './errors.js'
import { SAFE_CHANNEL_MESSAGE } from '../errors/channel-classifier.js'
import { gatewayCandidates } from '../catalog/serving/id-universe.js'

let fixtureHome, previousHome
before(() => { previousHome = process.env.DSH_HOME; fixtureHome = mkdtempSync(join(tmpdir(), 'fallback-home-')); process.env.DSH_HOME = fixtureHome })
after(() => { if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; rmSync(fixtureHome, { recursive: true, force: true }) })

const productId = 'gpt-image-2.5'
const channelMessage = '分组 auto 下模型 gpt-image-2.5 无可用渠道 (distributor) (request id: hidden-id)'
const channelError = () => Object.assign(new Error('Adapter openai-compatible failed'), {
  code: 'ADAPTER_FAILED', cause: Object.assign(new Error(channelMessage), { status: 503 }),
})
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const output = () => ({ outputs: [{ type: 'image', url: 'data:image/png;base64,cG5n' }] })
const assertChannel = (error) => {
  assert.ok(error instanceof OmnimuxError)
  assert.equal(error.code, 'CHANNEL_UNAVAILABLE')
  assert.equal(error.message, SAFE_CHANNEL_MESSAGE)
  assert.equal(error.cause, undefined)
  assert.doesNotMatch(`${error.stack}${JSON.stringify(error)}`, /ADAPTER_FAILED|distributor|分组 auto|request id|hidden-id/)
  return true
}
function inputFor(t, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-fallback-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return Object.assign({ prompt: 'a lamp', dest: join(dir, 'out.png'), model: productId, env: { OMNIMUX_API_KEY: 'sk-fixture' } }, extra)
}
function customSettings() {
  return { scenarioBindings: { image: { channel: 'byok', provider: 'custom' }, video: { channel: 'pending' } },
    byokProviders: [{ provider: 'custom', endpoint: 'https://my-provider.test/v1', models: { image: 'my-image-model' }, capabilities: ['image'] }] }
}
const CUSTOM_MEDIA = { defaultProvider: 'custom', providers: { custom: {
  protocol: 'openai-media', baseUrl: 'https://my-provider.test/v1', apiKeyEnv: 'OMNIMUX_MEDIA_KEY_CUSTOM', models: { image: 'my-image-model' },
} } }
function customCredentials() {
  return { async resolve(ref) { assert.equal(ref, 'OMNIMUX_MEDIA_KEY_CUSTOM'); return { value: 'sk-byok-media' } } }
}

// gpt-image-2.5 has no documented upstream alias; video retains the Seedance alias contract.
test('gpt-image-2.5 declares no upstream-recognised alias, so the real protocol sends one request', async (t) => {
  const bodies = [], signal = new AbortController().signal
  const input = inputFor(t, { signal, aspectRatio: '16:9', resolution: '1K', fetcher: async (url, init) => {
    assert.match(String(url), /images\/generations$/); assert.equal(init.method, 'POST'); bodies.push(JSON.parse(init.body))
    return json({ data: [{ b64_json: 'cG5n' }] })
  } })
  const result = await executeOmnimuxMedia('image', input)
  assert.equal(result.mode, 'live'); assert.equal(input.model, productId)
  assert.deepEqual(bodies, [{ prompt: 'a lamp', size: '16:9', resolution: '1K', n: 1, model: productId }])
  assert.deepEqual(gatewayCandidates(productId), [productId]); assert.equal(readFileSync(input.dest, 'utf8'), 'png')
})
test('structured code-only HTTP failures survive runtime-kit message extraction', async (t) => {
  const models = [], input = inputFor(t, { fetcher: async (_url, init) => {
    models.push(JSON.parse(init.body).model); return json({ error: { code: 'get_channel_failed', message: 'temporarily unavailable' } }, 503)
  } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), assertChannel); assert.deepEqual(models, [productId])
})
test('video fallback moves to the next configured line without switching provider or input', async (t) => {
  // #3516：seedance-2-5 现役分组为 480p（默认）/720p；默认线路声明后空意图会钉住 480p，
  // 线路间的 failover 用显式 allowedGroups 表达（网关 alias 回退只对无分组默认的旧路径有效）。
  const bodies = [], groups = []
  const input = inputFor(t, { model: 'seedance-2-5', operation: 'text_to_video', wait: false, allowedGroups: ['480p', '720p'], fetcher: async (url, init) => {
    assert.match(String(url), /video\/generations$/); bodies.push(JSON.parse(init.body))
    groups.push(new Headers(init.headers).get('X-Omnimux-Group'))
    return bodies.length === 1 ? json({ error: { message: channelMessage } }, 503) : json({ task_id: 'video-alias-task' })
  } })
  const result = await executeOmnimuxMedia('video', input)
  assert.equal(result.mode, 'submitted'); assert.equal(result.taskId, 'video-alias-task'); assert.equal(result.url, null); assert.match(result.taskRef, /^mtask_/)
  // 同一 provider、同一裸模型 ID，只有分组头随线路切换。
  assert.deepEqual(bodies.map((body) => body.model), ['seedance-2-5', 'seedance-2-5'])
  assert.deepEqual(groups, ['seedance-2-5-480p', 'seedance-2-5-720p'])
  assert.deepEqual(Object.assign({}, bodies[0], { model: bodies[1].model }), bodies[1]); assert.equal(input.model, 'seedance-2-5')
})
test('successful primary sends one request only', async (t) => {
  let calls = 0
  const input = inputFor(t, { runtime: { execute: async () => { calls++; return output() } } })
  assert.equal((await executeOmnimuxMedia('image', input)).mode, 'live'); assert.equal(calls, 1)
})
test('two channel failures exhaust the configured line list', async (t) => {
  const models = [], input = inputFor(t, { model: 'seedance-2-5', operation: 'text_to_video', wait: false, allowedGroups: ['480p', '720p'],
    runtime: { execute: async (req) => { models.push(req.input.model); throw channelError() } } })
  await assert.rejects(() => executeOmnimuxMedia('video', input), assertChannel)
  // 两条现役线路都用裸模型 ID 重试；列表耗尽后统一归类为 CHANNEL_UNAVAILABLE。
  assert.deepEqual(models, ['seedance-2-5', 'seedance-2-5']); assert.equal(existsSync(input.dest), false)
})
test('a model with a single gateway candidate exposes only itself', async (t) => {
  assert.deepEqual(gatewayCandidates('doubao-asr-bigmodel'), ['doubao-asr-bigmodel'])
  let calls = 0
  const input = inputFor(t, { model: productId, runtime: { execute: async () => { calls++; throw channelError() } } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), assertChannel); assert.equal(calls, 1)
})
async function failureWithoutRetry(t, error, expectedCode) {
  let calls = 0
  const input = inputFor(t, { runtime: { execute: async () => { calls++; throw error } } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), { code: expectedCode }); assert.equal(calls, 1)
}
test('quota failures never retry', async (t) => failureWithoutRetry(t, Object.assign(new Error('quota exceeded'), { code: 'ADAPTER_FAILED' }), 'quota-exceeded'))
test('auth failures never retry', async (t) => failureWithoutRetry(t, Object.assign(new Error('Invalid token'), { code: 'needs-omnimux' }), 'needs-omnimux'))
test('timeout failures never retry', async (t) => failureWithoutRetry(t, Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), 'ETIMEDOUT'))
test('unknown model failures never retry', async (t) => failureWithoutRetry(t, new OmnimuxError('unknown-model', 'model not found'), 'unknown-model'))
async function explicitHttp(t, status, code) {
  let calls = 0
  const input = inputFor(t, { fetcher: async () => { calls++; return json({ error: { message: channelMessage } }, status) } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), { code }); assert.equal(calls, 1)
}
test('explicit HTTP 401 suppresses alias retry even with channel wording', async (t) => explicitHttp(t, 401, 'needs-omnimux'))
test('explicit HTTP 402 suppresses alias retry even with channel wording', async (t) => explicitHttp(t, 402, 'quota-exceeded'))
test('a different error on the fallback line retains its classification and stops', async (t) => {
  let calls = 0
  const input = inputFor(t, { model: 'seedance-2-5', operation: 'text_to_video', wait: false, allowedGroups: ['480p', '720p'],
    runtime: { execute: async () => {
      if (++calls === 1) throw channelError(); throw new Error('quota exceeded')
    } } })
  await assert.rejects(() => executeOmnimuxMedia('video', input), { code: 'quota-exceeded' }); assert.equal(calls, 2)
})
test('abort between attempts prevents retry and preserves the signal on execution', async (t) => {
  const controller = new AbortController(); let calls = 0
  const input = inputFor(t, { signal: controller.signal, runtime: { execute: async (req) => {
    assert.equal(req.signal, controller.signal); calls++; controller.abort(); throw channelError()
  } } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), assertChannel); assert.equal(calls, 1)
})
test('custom providers do not inherit OmniMux alias retries', async (t) => {
  let calls = 0
  const input = inputFor(t, { model: 'my-image-model', provider: 'custom', runtimeSettings: customSettings(), media: CUSTOM_MEDIA, credentials: customCredentials(),
    runtime: { execute: async () => { calls++; throw channelError() } } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), assertChannel); assert.equal(calls, 1)
})
async function pollFailure(t, status) {
  let posts = 0
  const input = inputFor(t, { fetcher: async (_url, init) => {
    if (init?.method === 'POST') { posts++; return json({ task_id: 'accepted-task' }) }
    return json({ status: 'failed', error: { message: channelMessage } }, status)
  } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), assertChannel); assert.equal(posts, 1)
}
test('poll failure after task creation never resubmits (HTTP 200)', async (t) => pollFailure(t, 200))
test('poll failure after task creation never resubmits (HTTP 503)', async (t) => pollFailure(t, 503))
test('download channel failure after a completed submit never resubmits', async (t) => {
  let posts = 0
  const input = inputFor(t, { fetcher: async (_url, init) => {
    if (init?.method === 'POST') { posts++; return json({ data: [{ url: 'https://cdn.example/out.png' }] }) }
    return json({ error: { message: channelMessage } }, 503)
  } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), assertChannel); assert.equal(posts, 1); assert.equal(existsSync(input.dest), false)
})
async function busyFailure(t, status) {
  let calls = 0
  const input = inputFor(t, { fetcher: async () => { calls++; return json({ error: { message: 'service busy' } }, status) } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), { code: 'ADAPTER_FAILED' }); assert.equal(calls, 1)
}
test('HTTP 429 alone is not sufficient to retry a generation', async (t) => busyFailure(t, 429))
test('HTTP 503 alone is not sufficient to retry a generation', async (t) => busyFailure(t, 503))
test('taskId resume sanitizes poll failure without submitting', async (t) => {
  let posts = 0
  const input = inputFor(t, { taskId: 'existing-task', fetcher: async (_url, init) => {
    if (init?.method === 'POST') posts++; return json({ error: { message: channelMessage } }, 503)
  } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), assertChannel); assert.equal(posts, 0)
})
test('wait=false returns the task submitted by the single gateway candidate', async (t) => {
  const models = [], input = inputFor(t, { wait: false, fetcher: async (_url, init) => {
    models.push(JSON.parse(init.body).model); return json({ task_id: 'single-candidate-task' })
  } })
  const result = await executeOmnimuxMedia('image', input)
  assert.equal(result.mode, 'submitted'); assert.equal(result.taskId, 'single-candidate-task'); assert.equal(result.url, null); assert.match(result.taskRef, /^mtask_/)
  assert.deepEqual(models, [productId]); assert.equal(existsSync(input.dest), false)
})
test('BYOK media sends image to the registered user endpoint, not the official one', async (t) => {
  const requests = [], input = inputFor(t, { model: 'my-image-model', runtimeSettings: customSettings(), media: CUSTOM_MEDIA, credentials: customCredentials(), fetcher: async (url, init) => {
    requests.push({ url: String(url), auth: init.headers.authorization, body: JSON.parse(init.body) }); return json({ data: [{ b64_json: 'cG5n' }] })
  } })
  const result = await executeOmnimuxMedia('image', input)
  assert.equal(result.mode, 'live'); assert.equal(requests.length, 1); assert.equal(requests[0].url, 'https://my-provider.test/v1/images/generations')
  assert.equal(requests[0].auth, 'Bearer sk-byok-media'); assert.equal(requests[0].body.model, 'my-image-model'); assert.equal(readFileSync(input.dest, 'utf8'), 'png')
})
test('BYOK media without a current dedicated key throws unconfigured before HTTP', async (t) => {
  let calls = 0, refs = []
  const input = inputFor(t, { model: 'my-image-model', runtimeSettings: customSettings(), media: CUSTOM_MEDIA,
    credentials: { async resolve(ref) { refs.push(ref); return undefined } }, fetcher: async () => { calls++; return json({}) } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), (error) => error instanceof OmnimuxError && error.code === 'omnimux-unconfigured')
  assert.deepEqual(refs, ['OMNIMUX_MEDIA_KEY_CUSTOM']); assert.equal(calls, 0)
})
test('BYOK media for an unselected kind throws, never falls back to official', async (t) => {
  let calls = 0
  const current = { scenarioBindings: { image: { channel: 'pending' }, video: { channel: 'byok', provider: 'custom' } },
    byokProviders: [{ provider: 'custom', endpoint: 'https://my-provider.test/v1', models: { video: 'my-video-model' }, capabilities: ['video'] }] }
  const input = inputFor(t, { model: 'my-image-model', runtimeSettings: current, media: CUSTOM_MEDIA,
    credentials: { async resolve() { calls++; return { value: 'sk-byok-media' } } }, fetcher: async () => { calls++; return json({ data: [{ b64_json: 'cG5n' }] }) } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), (error) => error instanceof OmnimuxError && error.code === 'omnimux-unconfigured'); assert.equal(calls, 0)
})
test('agent mode rejects a non-official media model without touching any channel', async (t) => {
  let calls = 0
  const input = inputFor(t, { model: 'not-a-listed-media-model', runtimeSettings: { runtimeMode: 'agent', runtimeAgentId: 'claude', runtimeAgentVerified: true },
    fetcher: async () => { calls++; return json({}) } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), (error) => error instanceof OmnimuxError && error.code === 'omnimux-unconfigured'); assert.equal(calls, 0)
})
