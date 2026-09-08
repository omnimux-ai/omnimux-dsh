import assert from 'node:assert/strict'
import { test } from 'node:test'
import { executeOmnimuxSpeechToText, transcribeSpeechToTextRequest } from './stt.js'

const bytes = Buffer.from([0x49, 0x44, 0x33, 0x04, 0, 0])
const dataAudio = `data:audio/mpeg;base64,${bytes.toString('base64')}`
const audioUrl = 'https://cdn.example.com/audio.mp3'
const model = 'doubao-asr-bigmodel'
const endpoint = 'https://api.omnimux.ai/v1/audio/transcriptions'
const srt = '1\r\n00:00:00,000 --> 00:00:01,500\r\n你好世界\r\n\r\n'
const urlError = "audio url is required for Auc BigModel ASR: please provide 'url' or 'audio_url' (URL-first mode)"
const request = { model, audio: audioUrl, response_format: 'srt', language: ' zh ', env: { OMNIMUX_API_KEY: 'sk-fixture-stt' } }

function failure(body, status = 500, contentType) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status, headers: { 'content-type': contentType ?? (typeof body === 'string' ? 'text/plain' : 'application/json') },
  })
}

async function assertUpload(form) {
  assert.equal(form.get('model'), 'whisper-1')
  assert.equal(form.get('response_format'), 'srt')
  assert.equal(form.get('language'), 'zh')
  assert.equal(form.has('url'), false)
  assert.equal(form.has('audio_url'), false)
  assert.equal(form.get('file').type, 'audio/mpeg')
  assert.deepEqual(Buffer.from(await form.get('file').arrayBuffer()), bytes)
}

for (const audio of [
  'http://127.0.0.1:43120/audio.mp3', 'http://localhost:43120/audio.mp3',
  'http://[::1]:43120/audio.mp3', 'http://192.168.1.10/audio.mp3',
]) {
  test(`STT adapts local HTTP audio to Whisper before submission: ${audio}`, async () => {
    const calls = []
    const signal = new AbortController().signal
    const result = await executeOmnimuxSpeechToText({
      ...request, audio, signal,
      fetcher: async (url, init) => {
        calls.push(String(url))
        assert.equal(init.signal, signal)
        if (init.method !== 'POST') {
          assert.equal(init.headers.authorization, undefined)
          return new Response(bytes)
        }
        await assertUpload(init.body)
        return new Response(srt)
      },
    })
    assert.deepEqual(calls, [audio, endpoint])
    assert.deepEqual(result, { mode: 'live', model: 'whisper-1', text: srt })
  })
}

for (const modelId of [model, 'seedasr-auc']) {
  test(`wire primitive adapts ${modelId} with data audio`, async () => {
    const route = { modelId, baseUrl: 'https://api.omnimux.ai/v1' }
    let calls = 0
    const result = await transcribeSpeechToTextRequest({
      ...request, audio: dataAudio, route,
      fetcher: async (_url, init) => {
        calls++
        await assertUpload(init.body)
        return new Response(srt)
      },
    })
    assert.equal(calls, 1)
    assert.equal(route.modelId, modelId)
    assert.equal(result.model, 'whisper-1')
  })
}

for (const [body, contentType] of [
  [{ error: { message: urlError } }, 'application/json'],
  [{ message: 'AUDIO URL IS REQUIRED' }, 'application/json'],
  [{ data: { error: { message: 'URL-first mode' } } }, 'application/json'],
  [{ error: urlError }, 'application/json'],
  [{ error: { message: `${'context '.repeat(160)}${urlError}` } }, 'application/json'],
  [urlError, 'text/plain'],
  [JSON.stringify({ error: { message: urlError } }), 'text/plain'],
]) {
  test(`STT retries URL-required errors once as a binary Whisper request: ${JSON.stringify(body)}`, async () => {
    const calls = []
    const models = []
    const signal = new AbortController().signal
    const result = await executeOmnimuxSpeechToText({
      ...request, signal,
      fetcher: async (url, init) => {
        calls.push(String(url))
        assert.equal(init.signal, signal)
        if (init.method !== 'POST') {
          assert.equal(init.headers.authorization, undefined)
          return new Response(bytes)
        }
        models.push(init.body.get('model'))
        assert.equal(init.headers.authorization, 'Bearer sk-fixture-stt')
        assert.equal(init.headers.accept, 'text/plain, application/json')
        if (models.length === 1) {
          assert.equal(init.body.get('url'), audioUrl)
          assert.equal(init.body.get('audio_url'), audioUrl)
          return failure(body, 500, contentType)
        }
        await assertUpload(init.body)
        return new Response(srt, { headers: { 'content-type': 'application/x-subrip' } })
      },
    })
    assert.deepEqual(models, [model, 'whisper-1'])
    assert.deepEqual(calls, [endpoint, audioUrl, endpoint])
    assert.deepEqual(result, { mode: 'live', model: 'whisper-1', text: srt })
  })
}

test('wire primitive retries an unrecognized URL-first model and reuses loaded bytes', async () => {
  const forms = []
  let downloads = 0
  const result = await transcribeSpeechToTextRequest({
    ...request, audio: 'http://localhost/audio.mp3',
    route: { modelId: 'fixture-url-first-asr', baseUrl: 'https://api.omnimux.ai/v1' },
    fetcher: async (_url, init) => {
      if (init.method !== 'POST') { downloads++; return new Response(bytes) }
      forms.push(init.body)
      return forms.length === 1 ? failure({ error: { message: urlError } }) : new Response(srt)
    },
  })
  assert.equal(downloads, 1)
  assert.equal(forms.length, 2)
  assert.notEqual(forms[0], forms[1])
  assert.equal(forms[0].get('model'), 'fixture-url-first-asr')
  await assertUpload(forms[1])
  assert.equal(result.model, 'whisper-1')
})

for (const [status, body, code, message] of [
  [401, { error: { message: urlError } }, 'needs-omnimux', '请先登录 OmniMux。'],
  [402, { error: { message: urlError } }, 'quota-exceeded', '当前操作需要更多额度，充值后即可继续使用 OmniMux。'],
  [429, { error: { message: 'insufficient quota' } }, 'quota-exceeded', '当前操作需要更多额度，充值后即可继续使用 OmniMux。'],
  [503, { error: { code: 'get_channel_failed', message: '分组 secret 下模型 unavailable' } }, 'CHANNEL_UNAVAILABLE', '该模型当前不可用，请换一个试试'],
  [403, { error: { message: 'Permission denied' } }, 'omnimux-request-failed', 'Permission denied'],
  [500, { error: { message: 'Decoder failed' } }, 'omnimux-request-failed', 'Decoder failed'],
  [502, 'gateway unavailable', 'omnimux-request-failed', 'gateway unavailable'],
  [400, { detail: 'Unsupported audio encoding' }, 'omnimux-request-failed', 'Unsupported audio encoding'],
]) {
  test(`STT preserves classified or detailed failures without unrelated retries: ${status} ${code}`, async () => {
    let calls = 0
    await assert.rejects(() => executeOmnimuxSpeechToText({
      ...request,
      fetcher: async (_url, init) => {
        calls++
        assert.equal(init.method, 'POST')
        return failure(body, status)
      },
    }), (error) => {
      assert.equal(error.code, code)
      assert.equal(error.status, status)
      assert.ok(error.message.includes(message), error.message)
      return true
    })
    assert.equal(calls, 1)
  })
}

test('STT transport errors do not trigger URL-first fallback without an HTTP response', async () => {
  const error = Object.assign(new Error(urlError), { code: 'omnimux-request-failed' })
  let calls = 0
  await assert.rejects(() => executeOmnimuxSpeechToText({
    ...request, fetcher: async () => { calls++; throw error },
  }), (actual) => actual === error)
  assert.equal(calls, 1)
})

test('STT fallback failure is bounded and reports the final upstream error', async () => {
  let posts = 0
  await assert.rejects(() => executeOmnimuxSpeechToText({
    ...request,
    fetcher: async (_url, init) => {
      if (init.method !== 'POST') return new Response(bytes)
      posts++
      return failure({ error: { message: posts === 1 ? urlError : 'Whisper decoder failed (URL-first mode)' } })
    },
  }), (error) => error.code === 'omnimux-request-failed' && /Whisper decoder failed/.test(error.message))
  assert.equal(posts, 2)
})

test('STT does not retry Whisper when local adaptation still fails', async () => {
  let calls = 0
  await assert.rejects(() => executeOmnimuxSpeechToText({
    ...request, audio: dataAudio,
    fetcher: async () => { calls++; return failure({ error: { message: urlError } }) },
  }), (error) => error.code === 'omnimux-request-failed' && error.message.includes(urlError))
  assert.equal(calls, 1)
})

test('STT errors redact credentials, omit raw envelopes and cap diagnostics', async () => {
  await assert.rejects(() => executeOmnimuxSpeechToText({
    ...request,
    fetcher: async () => failure({ error: { message: `Decoder failed with Bearer sk-fixture-stt ${'x'.repeat(3000)}`, stack: 'private-stack' } }),
  }), (error) => {
    assert.match(error.message, /Decoder failed/)
    assert.doesNotMatch(error.message, /sk-fixture-stt|private-stack/)
    assert.ok(error.message.length < 1200)
    assert.equal(error.details, undefined)
    return true
  })
})

test('STT canceled URL-first request never starts a fallback download', async () => {
  const controller = new AbortController()
  let calls = 0
  await assert.rejects(() => executeOmnimuxSpeechToText({
    ...request, signal: controller.signal,
    fetcher: async () => { calls++; controller.abort(); return failure({ error: { message: urlError } }) },
  }), { code: 'omnimux-aborted' })
  assert.equal(calls, 1)
})

test('STT cancellation during the Whisper retry preserves the aborted error', async () => {
  const controller = new AbortController()
  let posts = 0
  await assert.rejects(() => executeOmnimuxSpeechToText({
    ...request, signal: controller.signal,
    fetcher: async (_url, init) => {
      if (init.method !== 'POST') return new Response(bytes)
      if (++posts === 1) return failure({ error: { message: urlError } })
      controller.abort()
      throw new Error('canceled')
    },
  }), { code: 'omnimux-aborted' })
  assert.equal(posts, 2)
})
