import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { executeOmnimuxMedia } from './execute.js'
import { OmnimuxError } from './errors.js'
import { SAFE_CHANNEL_MESSAGE } from '../errors/channel-classifier.js'

const productId = 'grok-imagine-image-2'
const channelMessage = '分组 auto 下模型 grok-imagine-image-2 无可用渠道 (distributor) (request id: hidden-id)'
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

test('real protocol retries one alias, preserves payload and leaves the product selection unchanged', async (t) => {
  const bodies = []
  const signal = new AbortController().signal
  const input = inputFor(t, { signal, aspectRatio: '16:9', resolution: '2K',
    fetcher: async (url, init) => {
      assert.match(String(url), /images\/generations$/)
      assert.equal(init.method, 'POST')
      bodies.push(JSON.parse(init.body))
      return bodies.length === 1 ? json({ error: { message: channelMessage, code: 'get_channel_failed' } }, 503)
        : json({ data: [{ b64_json: 'cG5n' }] })
    },
  })
  const result = await executeOmnimuxMedia('image', input)
  assert.equal(result.mode, 'live')
  assert.equal(input.model, productId)
  assert.deepEqual(bodies.map((body) => body.model), [productId, 'grok-imagine-image'])
  assert.deepEqual({ ...bodies[0], model: bodies[1].model }, bodies[1])
  assert.equal(readFileSync(input.dest, 'utf8'), 'png')
})

test('structured code-only HTTP failures survive runtime-kit message extraction', async (t) => {
  const models = []
  const input = inputFor(t, { fetcher: async (_url, init) => {
    models.push(JSON.parse(init.body).model)
    return models.length === 1 ? json({ error: { code: 'get_channel_failed', message: 'temporarily unavailable' } }, 503)
      : json({ data: [{ b64_json: 'cG5n' }] })
  } })
  assert.equal((await executeOmnimuxMedia('image', input)).mode, 'live')
  assert.deepEqual(models, [productId, 'grok-imagine-image'])
})

test('video fallback uses the documented gateway alias without switching provider or input', async (t) => {
  const bodies = []
  const input = inputFor(t, { model: 'seedance-2-0-fast', operation: 'text_to_video', wait: false, fetcher: async (url, init) => {
    assert.match(String(url), /video\/generations$/)
    bodies.push(JSON.parse(init.body))
    return bodies.length === 1 ? json({ error: { message: channelMessage } }, 503) : json({ task_id: 'video-alias-task' })
  } })
  assert.deepEqual(await executeOmnimuxMedia('video', input), { mode: 'submitted', taskId: 'video-alias-task', url: null })
  assert.deepEqual(bodies.map((body) => body.model), ['seedance-2-0-fast', 'seedance-2.0-fast'])
  assert.deepEqual({ ...bodies[0], model: bodies[1].model }, bodies[1])
  assert.equal(input.model, 'seedance-2-0-fast')
})

test('successful primary sends one request only', async (t) => {
  let calls = 0
  const input = inputFor(t, { runtime: { execute: async () => { calls++; return output() } } })
  assert.equal((await executeOmnimuxMedia('image', input)).mode, 'live')
  assert.equal(calls, 1)
})

test('two channel failures stop after one retry even with three aliases', async (t) => {
  const models = []
  const input = inputFor(t, { runtime: { execute: async (req) => { models.push(req.input.model); throw channelError() } } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), assertChannel)
  assert.deepEqual(models, [productId, 'grok-imagine-image'])
  assert.equal(existsSync(input.dest), false)
})

test('a model without an alias is not retried', async (t) => {
  let calls = 0
  const input = inputFor(t, { model: 'gpt-image-2', runtime: { execute: async () => { calls++; throw channelError() } } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), assertChannel)
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

test('a different error on the alias retains its classification and stops', async (t) => {
  let calls = 0
  const input = inputFor(t, { runtime: { execute: async () => {
    if (++calls === 1) throw channelError()
    throw new Error('quota exceeded')
  } } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), (error) => error.code === 'quota-exceeded')
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

test('wait=false can return the task submitted by the fallback', async (t) => {
  const models = []
  const input = inputFor(t, { wait: false, fetcher: async (_url, init) => {
    models.push(JSON.parse(init.body).model)
    return models.length === 1 ? json({ error: { message: channelMessage } }, 503) : json({ task_id: 'alias-task' })
  } })
  assert.deepEqual(await executeOmnimuxMedia('image', input), { mode: 'submitted', taskId: 'alias-task', url: null })
  assert.deepEqual(models, [productId, 'grok-imagine-image'])
  assert.equal(existsSync(input.dest), false)
})
