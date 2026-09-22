import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { executeOmnimuxMedia } from './execute.js'
import { OmnimuxError } from './errors.js'
import { SAFE_CHANNEL_MESSAGE } from '../errors/channel-classifier.js'
import { gatewayCandidates } from '../catalog/serving/id-universe.js'

const AUDIO_BYTES = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00])

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
  return { prompt: 'a lamp', dest: join(dir, 'out.png'), model: productId, env: { OMNIMUX_API_KEY: 'fixture-key' }, ...extra }
}

// 2026-09-14 #1751（评审次要-2）：gpt-image-2.5 无上游承认的别名 —— `gpt-image-2-5` 拼写被上游
// 明写否决（与 gpt-image-2-hd / gpt-image2-hd 同源同口径），故它只剩单一网关候选、不会重试。
test('gpt-image-2.5 declares no upstream-recognised alias, so the real protocol sends one request', async (t) => {
  const bodies = []
  const signal = new AbortController().signal
  const input = inputFor(t, { signal, aspectRatio: '16:9', resolution: '2K',
    fetcher: async (url, init) => {
      assert.match(String(url), /images\/generations$/)
      assert.equal(init.method, 'POST')
      bodies.push(JSON.parse(init.body))
      return json({ data: [{ b64_json: 'cG5n' }] })
    },
  })
  const result = await executeOmnimuxMedia('image', input)
  assert.equal(result.mode, 'live')
  assert.equal(input.model, productId)
  // 单次请求锁死 payload：vendor 字段映射完毕，model 由协议持有，不存在第二次别名改写。
  assert.deepEqual(bodies, [
    { prompt: 'a lamp', size: '1792x1024', quality: 'standard', n: 1, model: productId },
  ])
  assert.deepEqual(gatewayCandidates(productId), [productId])
  assert.equal(readFileSync(input.dest, 'utf8'), 'png')
})

test('structured code-only HTTP failures survive runtime-kit message extraction', async (t) => {
  const models = []
  const input = inputFor(t, { fetcher: async (_url, init) => {
    models.push(JSON.parse(init.body).model)
    return json({ error: { code: 'get_channel_failed', message: 'temporarily unavailable' } }, 503)
  } })
  // 分类仍然成立（code → CHANNEL_UNAVAILABLE，且上游文案不泄漏）；无别名可退，故只发一次请求。
  await assert.rejects(() => executeOmnimuxMedia('image', input), assertChannel)
  assert.deepEqual(models, [productId])
})

// 2026-09-14 #1751：图片侧默认型号 gpt-image-2.5 已无别名，别名重试的覆盖由 video 路径承担
// （seedance-2-5 → 上游承认的 seedance-2.5）。
test('video fallback uses the documented gateway alias without switching provider or input', async (t) => {
  const bodies = []
  const input = inputFor(t, { model: 'seedance-2-5', operation: 'text_to_video', wait: false, fetcher: async (url, init) => {
    assert.match(String(url), /video\/generations$/)
    bodies.push(JSON.parse(init.body))
    return bodies.length === 1 ? json({ error: { message: channelMessage } }, 503) : json({ task_id: 'video-alias-task' })
  } })
  assert.deepEqual(await executeOmnimuxMedia('video', input), { mode: 'submitted', taskId: 'video-alias-task', url: null })
  assert.deepEqual(bodies.map((body) => body.model), ['seedance-2-5', 'seedance-2.5'])
  assert.deepEqual({ ...bodies[0], model: bodies[1].model }, bodies[1])
  assert.equal(input.model, 'seedance-2-5')
})

test('successful primary sends one request only', async (t) => {
  let calls = 0
  const input = inputFor(t, { runtime: { execute: async () => { calls++; return output() } } })
  assert.equal((await executeOmnimuxMedia('image', input)).mode, 'live')
  assert.equal(calls, 1)
})

test('two channel failures exhaust the gateway alias list', async (t) => {
  const models = []
  const input = inputFor(t, {
    model: 'seedance-2-5', operation: 'text_to_video', wait: false,
    runtime: { execute: async (req) => { models.push(req.input.model); throw channelError() } },
  })
  await assert.rejects(() => executeOmnimuxMedia('video', input), assertChannel)
  assert.deepEqual(models, ['seedance-2-5', 'seedance-2.5'])
  assert.equal(existsSync(input.dest), false)
})

test('a model with a single gateway candidate is not retried', async (t) => {
  assert.deepEqual(gatewayCandidates('doubao-asr-bigmodel'), ['doubao-asr-bigmodel'])
  let calls = 0
  const input = inputFor(t, {
    model: 'doubao-asr-bigmodel',
    audio: `data:audio/mpeg;base64,${AUDIO_BYTES.toString('base64')}`,
    runtime: { execute: async () => { calls++; throw channelError() } },
  })
  await assert.rejects(() => executeOmnimuxMedia('stt', input), assertChannel)
  assert.equal(calls, 1)
})

for (const [label, error, expectedCode] of [
  ['quota', Object.assign(new Error('quota exceeded'), { code: 'ADAPTER_FAILED' }), 'quota-exceeded'],
  ['auth', Object.assign(new Error('Invalid token'), { code: 'needs-omnimux' }), 'needs-omnimux'],
  ['timeout', Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), 'ETIMEDOUT'],
  ['unknown model', new OmnimuxError('unknown-model', 'model not found'), 'unknown-model'],
]) {
  test(`${label} failures never retry`, async (t) => {
    let calls = 0
    const input = inputFor(t, { runtime: { execute: async () => { calls++; throw error } } })
    await assert.rejects(() => executeOmnimuxMedia('image', input), (failure) => failure.code === expectedCode)
    assert.equal(calls, 1)
  })
}

for (const [status, code] of [[401, 'needs-omnimux'], [402, 'quota-exceeded']]) {
  test(`explicit HTTP ${status} suppresses alias retry even with channel wording`, async (t) => {
    let calls = 0
    const input = inputFor(t, { fetcher: async () => {
      calls++
      return json({ error: { message: channelMessage } }, status)
    } })
    await assert.rejects(() => executeOmnimuxMedia('image', input), (error) => error.code === code)
    assert.equal(calls, 1)
  })
}

// 别名路径仍存在（video seedance-2-5 → seedance-2.5）：第二次尝试上的另一种错误必须保留
// 它自己的分类并立刻停止，不得被当作渠道不可用继续退避。
test('a different error on the alias retains its classification and stops', async (t) => {
  let calls = 0
  const input = inputFor(t, {
    model: 'seedance-2-5', operation: 'text_to_video', wait: false,
    runtime: { execute: async () => {
      if (++calls === 1) throw channelError()
      throw new Error('quota exceeded')
    } },
  })
  await assert.rejects(() => executeOmnimuxMedia('video', input), (error) => error.code === 'quota-exceeded')
  assert.equal(calls, 2)
})

test('abort between attempts prevents retry and preserves the signal on execution', async (t) => {
  const controller = new AbortController()
  let calls = 0
  const input = inputFor(t, { signal: controller.signal, runtime: { execute: async (req) => {
    assert.equal(req.signal, controller.signal)
    calls++
    controller.abort()
    throw channelError()
  } } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), assertChannel)
  assert.equal(calls, 1)
})

test('custom providers do not inherit OmniMux alias retries', async (t) => {
  let calls = 0
  const input = inputFor(t, {
    provider: 'custom', media: { defaultProvider: 'custom', providers: { custom: {
      protocol: 'openai-media', baseUrl: 'https://custom.example/v1', apiKey: 'none', models: { image: productId },
    } } }, runtime: { execute: async () => { calls++; throw channelError() } },
  })
  await assert.rejects(() => executeOmnimuxMedia('image', input), assertChannel)
  assert.equal(calls, 1)
})

for (const status of [200, 503]) {
  test(`poll failure after task creation never resubmits (HTTP ${status})`, async (t) => {
    let posts = 0
    const input = inputFor(t, { fetcher: async (_url, init) => {
      if (init?.method === 'POST') { posts++; return json({ task_id: 'accepted-task' }) }
      return json({ status: 'failed', error: { message: channelMessage } }, status)
    } })
    await assert.rejects(() => executeOmnimuxMedia('image', input), assertChannel)
    assert.equal(posts, 1)
  })
}

test('download channel failure after a completed submit never resubmits', async (t) => {
  let posts = 0
  const input = inputFor(t, { fetcher: async (_url, init) => {
    if (init?.method === 'POST') { posts++; return json({ data: [{ url: 'https://cdn.example/out.png' }] }) }
    return json({ error: { message: channelMessage } }, 503)
  } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), assertChannel)
  assert.equal(posts, 1)
  assert.equal(existsSync(input.dest), false)
})

for (const status of [429, 503]) {
  test(`HTTP ${status} alone is not sufficient to retry a generation`, async (t) => {
    let calls = 0
    const input = inputFor(t, { fetcher: async () => { calls++; return json({ error: { message: 'service busy' } }, status) } })
    await assert.rejects(() => executeOmnimuxMedia('image', input), (error) => error.code === 'ADAPTER_FAILED')
    assert.equal(calls, 1)
  })
}

test('taskId resume sanitizes poll failure without submitting', async (t) => {
  let posts = 0
  const input = inputFor(t, { taskId: 'existing-task', fetcher: async (_url, init) => {
    if (init?.method === 'POST') posts++
    return json({ error: { message: channelMessage } }, 503)
  } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), assertChannel)
  assert.equal(posts, 0)
})

// gpt-image-2.5 无别名可退：wait=false 直接返回单一网关候选提交的任务，且只发一次请求。
test('wait=false returns the task submitted by the single gateway candidate', async (t) => {
  const models = []
  const input = inputFor(t, { wait: false, fetcher: async (_url, init) => {
    models.push(JSON.parse(init.body).model)
    return json({ task_id: 'single-candidate-task' })
  } })
  assert.deepEqual(await executeOmnimuxMedia('image', input), { mode: 'submitted', taskId: 'single-candidate-task', url: null })
  assert.deepEqual(models, [productId])
  assert.equal(existsSync(input.dest), false)
})

// BYOK: the user's own key covers image, so the request goes to their endpoint.
test('BYOK media sends image to the user endpoint, not the official one', async (t) => {
  const requests = []
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-byok-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const result = await executeOmnimuxMedia('image', {
    prompt: 'a lamp',
    dest: join(dir, 'out.png'),
    runtimeSettings: {
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://my-provider.test/v1',
      runtimeKeyModel: 'my-image-model',
      runtimeKeyVerified: true,
      runtimeMediaImage: true,
    },
    credentials: {
      async resolve(ref) {
        if (ref === 'OMNIMUX_BYOK_API_KEY') return { value: 'sk-byok-media' }
        return undefined
      },
    },
    fetcher: async (url, init) => {
      requests.push({ url, auth: init.headers.authorization, body: JSON.parse(init.body) })
      return json({ data: [{ b64_json: 'cG5n' }] })
    },
  })
  assert.equal(result.mode, 'live')
  assert.equal(requests.length, 1)
  assert.ok(requests[0].url.startsWith('https://my-provider.test/v1'))
  assert.equal(requests[0].auth, 'Bearer sk-byok-media')
  assert.equal(requests[0].body.model, 'my-image-model')
})

// BYOK without a stored key fails before any request.
test('BYOK media without a stored key throws unconfigured', async (t) => {
  const input = inputFor(t, {
    runtimeSettings: {
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://my-provider.test/v1',
      runtimeKeyModel: 'my-model',
      runtimeKeyVerified: true,
      runtimeMediaImage: true,
    },
    credentials: { async resolve() { return undefined } },
    fetcher: async () => json({}),
  })
  await assert.rejects(
    () => executeOmnimuxMedia('image', input),
    (error) => error instanceof OmnimuxError && error.code === 'omnimux-unconfigured',
  )
})

// BYOK for a media kind not selected does not override the official route.
test('BYOK media for an unselected kind keeps the official route', async (t) => {
  const requests = []
  const input = inputFor(t, {
    runtimeSettings: {
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://my-provider.test/v1',
      runtimeKeyModel: 'my-model',
      runtimeKeyVerified: true,
      runtimeMediaImage: false,
      runtimeMediaVideo: true,
    },
    fetcher: async (url, init) => {
      requests.push({ url })
      return json({ data: [{ b64_json: 'cG5n' }] })
    },
  })
  const result = await executeOmnimuxMedia('image', input)
  assert.equal(result.mode, 'live')
  assert.equal(requests.length, 1)
  assert.ok(!requests[0].url.startsWith('https://my-provider.test'), 'unselected kind must not use BYOK')
})
