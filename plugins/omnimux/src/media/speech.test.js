import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { executeOmnimuxAudio, pollAudioTask } from './audio.js'
import { executeOmnimuxMedia } from './execute.js'
import { OmnimuxError } from './errors.js'
import { assertGuardOutput, assertGuardSubmit } from '../catalog/contract/submit-guard/index.js'

const model = 'seed-audio-1.0'
const voice = 'zh_male_guanggaojieshuo_uranus_bigtts'
const env = { OMNIMUX_API_KEY: 'sk-fixture', OMNIMUX_BASE_URL: 'https://speech.example/v1/' }
const bytes = Buffer.from([0x49, 0x44, 0x33, 0, 1, 255])
const response = (headers = {}, body = bytes) => new Response(body, { headers: { 'content-type': 'audio/mpeg', ...headers } })
function destFor(t) {
  const dir = mkdtempSync(join(tmpdir(), 'seed-audio-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return join(dir, 'nested', 'speech.mp3')
}

for (const id of [undefined, model, 'doubao-seed-audio-1.0', 'seed-audio']) {
  test(`synchronous speech writes raw bytes and sends canonical defaults for ${id ?? 'default route'}`, async (t) => {
    const dest = destFor(t)
    const calls = []
    const result = await executeOmnimuxAudio({
      dest, prompt: '  文本内容\n第二段  ', model: id, env, wait: false,
      runtime: { execute() { assert.fail('speech must not create an async runtime task') } },
      fetcher: async (url, options) => {
        calls.push({ url, ...options, body: JSON.parse(options.body) })
        return response({ 'x-audio-duration': '3.75', 'x-audio-url': 'https://cdn.example/listen.mp3' })
      },
    })
    assert.deepEqual(result, { mode: 'live', model, duration: 3.75, url: 'https://cdn.example/listen.mp3', dest })
    assert.deepEqual(readFileSync(dest), bytes)
    assert.equal(calls.length, 1, 'no polling or preview URL download')
    assert.equal(calls[0].url, 'https://speech.example/v1/audio/speech')
    assert.equal(calls[0].method, 'POST')
    assert.equal(calls[0].headers.authorization, 'Bearer sk-fixture')
    assert.equal(calls[0].headers['content-type'], 'application/json')
    assert.deepEqual(calls[0].body, { model, input: '  文本内容\n第二段  ', voice, speed: 1, response_format: 'mp3' })
  })
}

for (const [format, mime] of [['mp3', 'audio/mpeg'], ['wav', 'audio/wav'], ['pcm', 'audio/pcm']]) {
  test(`shared audio execution supports ${format} without optional response headers`, async (t) => {
    const dest = destFor(t)
    const result = await executeOmnimuxMedia('audio', {
      dest, prompt: 'Hello', operation: 'text_to_speech', env: {}, format,
      voice: 'ICL_uranus_en_female_charlie_tob', speed: 1.25,
      credentials: { async resolve(ref) { return ref === 'OMNIMUX_API_KEY' ? { value: 'sk-credential-fixture' } : undefined } },
      fetcher: async (_url, options) => {
        assert.deepEqual(JSON.parse(options.body), {
          model, input: 'Hello', voice: 'ICL_uranus_en_female_charlie_tob', speed: 1.25, response_format: format,
        })
        assert.equal(options.headers.authorization, 'Bearer sk-credential-fixture')
        return response({ 'content-type': `${mime}; charset=binary` })
      },
    })
    assert.deepEqual(result, { mode: 'live', model, duration: undefined, url: undefined, dest })
    assert.deepEqual(readFileSync(dest), bytes)
  })
}

test('admission fails before auth or HTTP for invalid speech input', async (t) => {
  let authCalls = 0, httpCalls = 0
  for (const invalid of [{ prompt: '' }, { prompt: '  ' }, { voice: 'alloy' }, { speed: NaN }, { speed: '1' }, { format: 'ogg' }, { model: 'suno' }]) {
    const dest = destFor(t)
    await assert.rejects(executeOmnimuxAudio({
      dest, prompt: 'hi', env: {}, ...invalid,
      store: { async resolve() { authCalls++; return 'fixture' } },
      fetcher: async () => { httpCalls++; return response() },
    }), (err) => err instanceof OmnimuxError && err.code === 'omnimux-invalid-request')
    assert.equal(existsSync(dest), false)
  }
  assert.equal(authCalls, 0)
  assert.equal(httpCalls, 0)
})

test('valid speech without auth never issues a request', async (t) => {
  await assert.rejects(executeOmnimuxAudio({
    dest: destFor(t), prompt: 'hi', env: {}, fetcher: () => assert.fail('unauthenticated HTTP'),
  }), { code: 'needs-omnimux' })
})

for (const [status, body, code] of [
  [401, 'unauthorized', 'needs-omnimux'], [402, 'payment required', 'quota-exceeded'],
  [429, JSON.stringify({ error: { code: 'insufficient_user_quota' } }), 'quota-exceeded'],
  [429, 'rate limited', 'omnimux-request-failed'], [500, 'sk-secret upstream detail', 'omnimux-request-failed'],
  [503, JSON.stringify({ error: { code: 'CHANNEL_UNAVAILABLE' } }), 'CHANNEL_UNAVAILABLE'],
  [201, 'unexpected success', 'omnimux-request-failed'], [204, null, 'omnimux-request-failed'],
]) {
  test(`speech classifies HTTP ${status} and never writes an error response`, async (t) => {
    const dest = destFor(t)
    await assert.rejects(executeOmnimuxAudio({ dest, prompt: 'hi', env,
      fetcher: async () => new Response(body, { status }),
    }), (err) => err instanceof OmnimuxError && err.code === code && err.status === status && !err.message.includes('sk-secret'))
    assert.equal(existsSync(dest), false)
  })
}

test('invalid duration headers stay unknown rather than zero or NaN', async (t) => {
  for (const duration of ['', 'unknown', '-1', 'Infinity']) {
    const result = await executeOmnimuxAudio({ dest: destFor(t), prompt: 'hi', env,
      fetcher: async () => response({ 'x-audio-duration': duration }),
    })
    assert.equal(result.duration, undefined)
  }
})

for (const bad of [new Response('error', { headers: { 'content-type': 'application/json' } }),
  new Response(bytes), response({}, Buffer.alloc(0))]) {
  test('speech rejects missing MIME, wrong MIME and empty body without overwriting files', async (t) => {
    const dest = destFor(t).replace('/nested/', '/')
    writeFileSync(dest, 'existing')
    await assert.rejects(executeOmnimuxAudio({ dest, prompt: 'hi', env,
      fetcher: async () => bad,
    }), { code: 'omnimux-invalid-response' })
    assert.equal(readFileSync(dest, 'utf8'), 'existing')
  })
}

test('network failures and aborted response bodies become standard errors', async (t) => {
  const controller = new AbortController()
  await assert.rejects(executeOmnimuxAudio({ dest: destFor(t), prompt: 'hi', env,
    fetcher: async () => { throw new TypeError('network down') },
  }), { code: 'omnimux-request-failed' })
  const dest = destFor(t)
  await assert.rejects(executeOmnimuxAudio({ dest, prompt: 'hi', env, signal: controller.signal,
    fetcher: async (_url, options) => {
      controller.abort()
      assert.equal(options.signal.aborted, true)
      return response()
    },
  }), { code: 'omnimux-aborted' })
  assert.equal(existsSync(dest), false)
  await assert.rejects(executeOmnimuxAudio({ dest, prompt: 'hi', env, signal: controller.signal,
    fetcher: () => assert.fail('pre-aborted signal must not fetch'),
  }), { code: 'omnimux-aborted' })
})

test('audio output guard accepts verified bytes but not empty bytes or wrong MIME', () => {
  const plan = assertGuardSubmit({ model, prompt: 'hi', operation: 'text_to_speech' }, { seam: 'audioGenerate' })
  assert.doesNotThrow(() => assertGuardOutput(plan, { mode: 'live', outputs: [{ type: 'audio', bytes, mime: 'audio/mpeg' }] }, { capability: 'audio' }))
  for (const output of [{ type: 'audio', bytes: Buffer.alloc(0), mime: 'audio/mpeg' }, { type: 'audio', bytes, mime: 'image/png' }, { type: 'audio', bytes }]) {
    assert.throws(() => assertGuardOutput(plan, { mode: 'live', outputs: [output] }, { capability: 'audio' }), { code: 'omnimux-invalid-response' })
  }
})

test('existing task IDs retain audio polling and download even with the new default', async (t) => {
  const dest = destFor(t)
  const calls = []
  const result = await executeOmnimuxAudio({ dest, taskId: 'legacy-task', env,
    fetcher: async (url, options) => {
      calls.push({ url, method: options?.method })
      if (url.endsWith('/legacy-task')) return Response.json({ status: 'completed', audio_url: 'https://cdn.example/old.mp3' })
      return response()
    },
  })
  assert.deepEqual(result, { mode: 'live', taskId: 'legacy-task', url: 'https://cdn.example/old.mp3' })
  assert.deepEqual(readFileSync(dest), bytes)
  assert.equal(calls.length, 2)
  assert.match(calls[0].url, /audio\/generations\/legacy-task$/)
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls.some((call) => call.method === 'POST'), false)
  const polled = await pollAudioTask({ baseUrl: 'https://speech.example/v1', taskId: 'legacy-task',
    fetcher: async () => Response.json({ status: 'completed', audio_url: 'https://cdn.example/old.mp3' }),
  })
  assert.equal(polled.audio_url, result.url)
})
