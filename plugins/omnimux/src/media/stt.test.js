import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { executeOmnimuxSpeechToText, transcribeSpeechToTextRequest } from './stt.js'

const AUDIO_BYTES = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00])
const M4A_BYTES = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20])
const SRT = '1\r\n00:00:00,000 --> 00:00:01,500\r\n你好世界\r\n\r\n'
const model = 'doubao-asr-bigmodel'
const dataAudio = `data:audio/mpeg;base64,${AUDIO_BYTES.toString('base64')}`
const request = { audio: dataAudio, model, env: { OMNIMUX_API_KEY: 'sk-stt-fixture' } }

function tempAudio(t) {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-stt-'))
  const file = join(dir, 'TK 口播女.mp3')
  writeFileSync(file, AUDIO_BYTES)
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return file
}

function sttFetcher(captured, body = { text: '你好世界' }, status = 200, contentType) {
  return async (url, init) => {
    captured.url = String(url)
    captured.init = init
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status, headers: { 'content-type': contentType ?? (typeof body === 'string' ? 'text/plain' : 'application/json') },
    })
  }
}

function transcribeFixture(input) {
  const env = input.env ?? {}
  return transcribeSpeechToTextRequest({
    ...input,
    route: {
      baseUrl: env.OMNIMUX_BASE_URL ?? 'https://api.omnimux.ai/v1',
      modelId: input.model ?? env.OMNIMUX_STT_MODEL ?? 'whisper-1',
    },
    apiKey: input.apiKey ?? env.OMNIMUX_API_KEY,
  })
}

test('STT requires audio and rejects draft whisper before HTTP despite bypassSubmitGuard', async (t) => {
  await assert.rejects(() => executeOmnimuxSpeechToText({}), { code: 'omnimux-invalid-request' })
  let calls = 0
  await assert.rejects(() => executeOmnimuxSpeechToText({
    audio: tempAudio(t), model: 'whisper-1', operation: 'speech_to_text', bypassSubmitGuard: true,
    env: {}, fetcher: async () => { calls++ },
  }), { code: 'omnimux-invalid-request' })
  assert.equal(calls, 0)
})

test('STT posts exact audio bytes and defaults to JSON after real model admission', async (t) => {
  const captured = {}
  const result = await executeOmnimuxSpeechToText({ ...request, audio: tempAudio(t), fetcher: sttFetcher(captured) })
  assert.equal(captured.url, 'https://api.omnimux.ai/v1/audio/transcriptions')
  assert.equal(captured.init.method, 'POST')
  assert.equal(captured.init.headers.authorization, 'Bearer sk-stt-fixture')
  assert.ok(captured.init.body instanceof FormData)
  const form = captured.init.body
  assert.equal(form.get('model'), 'whisper-1')
  assert.equal(form.get('response_format'), 'json')
  assert.deepEqual([...form.keys()].sort(), ['file', 'model', 'response_format'])
  const upload = form.get('file')
  assert.equal(upload.name, 'TK 口播女.mp3')
  assert.equal(upload.type, 'audio/mpeg')
  assert.deepEqual(Buffer.from(await upload.arrayBuffer()), AUDIO_BYTES)
  assert.deepEqual(result, { mode: 'live', model: 'whisper-1', text: '你好世界' })
})

for (const id of [model, 'seedasr-auc']) {
  test(`STT ${id} passes SRT through the guard and preserves raw subtitle bytes`, async () => {
    const captured = {}
    const result = await executeOmnimuxSpeechToText({
      ...request, model: id, response_format: 'srt', language: 'zh', fetcher: sttFetcher(captured, SRT),
    })
    assert.equal(captured.init.body.get('model'), 'whisper-1')
    assert.equal(captured.init.body.get('language'), 'zh')
    assert.equal(captured.init.body.get('response_format'), 'srt')
    assert.equal(captured.init.body.has('url'), false)
    assert.equal(captured.init.body.has('audio_url'), false)
    assert.deepEqual(result, { mode: 'live', model: 'whisper-1', text: SRT })
  })
}

for (const [response_format, body, text] of [
  ['json', { text: 'JSON text' }, 'JSON text'],
  ['verbose_json', { text: 'verbose', segments: [] }, 'verbose'],
  ['text', 'raw transcript\n', 'raw transcript\n'],
  ['text', '42', '42'],
  ['text', 'null', 'null'],
  ['srt', { data: { text: SRT.trim() } }, SRT.trim()],
  ['vtt', 'WEBVTT\n\n00:00.000 --> 00:01.500\n你好\n', 'WEBVTT\n\n00:00.000 --> 00:01.500\n你好\n'],
]) {
  test(`STT extracts ${response_format} using a single-use native Response`, async () => {
    const captured = {}
    const result = await executeOmnimuxSpeechToText({ ...request, response_format, fetcher: sttFetcher(captured, body) })
    assert.equal(captured.init.body.get('response_format'), response_format)
    assert.equal(result.text, text)
  })
}

test('STT accepts plain text even when JSON was requested', async () => {
  const result = await executeOmnimuxSpeechToText({ ...request, fetcher: sttFetcher({}, 'raw transcript') })
  assert.equal(result.text, 'raw transcript')
})

test('STT respects explicit model and environment routing without changing the default', async () => {
  const captured = {}
  await executeOmnimuxSpeechToText({
    audio: dataAudio, env: { OMNIMUX_STT_MODEL: 'seedasr-auc', OMNIMUX_API_KEY: 'sk-fixture', OMNIMUX_BASE_URL: 'https://fixture.example/v1' },
    fetcher: sttFetcher(captured),
  })
  assert.equal(captured.url, 'https://fixture.example/v1/audio/transcriptions')
  assert.equal(captured.init.body.get('model'), 'whisper-1')
})

test('STT rejects invalid formats before credentials, audio loading or HTTP', async () => {
  let calls = 0
  for (const response_format of ['xml', ' SRT ', {}, 42]) {
    await assert.rejects(() => executeOmnimuxSpeechToText({
      model, audio: '/nonexistent/not-read.mp3', response_format, env: {},
      store: { resolve: async () => { calls++ } }, fetcher: async () => { calls++ },
    }), { code: 'omnimux-invalid-request' })
  }
  assert.equal(calls, 0)
})

for (const id of [model, 'seedasr-auc']) {
  test(`STT ${id} forwards public URL fields without downloading audio`, async () => {
    const captured = {}
    const signal = new AbortController().signal
    const audio = 'https://cdn.example.com/voice/note.m4a?signature=abc'
    let calls = 0
    const result = await executeOmnimuxSpeechToText({
      ...request, model: id, audio: ` ${audio} `, signal, response_format: 'srt',
      fetcher: async (url, init) => {
        calls++
        assert.equal(init.method, 'POST')
        assert.equal(init.signal, signal)
        return sttFetcher(captured, SRT)(url, init)
      },
    })
    assert.equal(calls, 1)
    assert.equal(captured.init.body.get('url'), audio)
    assert.equal(captured.init.body.get('audio_url'), audio)
    assert.equal(captured.init.body.get('model'), model)
    assert.equal(captured.init.body.has('file'), false)
    assert.deepEqual(result, { mode: 'live', model, text: SRT })
  })
}

test('Whisper wire requests retain multipart bytes and forward public URL fields', async () => {
  const captured = {}
  const audio = 'https://cdn.example.com/voice/note.m4a'
  const urls = []
  const result = await transcribeFixture({
    ...request, model: 'whisper-1', audio,
    fetcher: async (url, init) => {
      urls.push(String(url))
      if (init.method === 'POST') return sttFetcher(captured)(url, init)
      assert.equal(init.headers.authorization, undefined)
      return new Response(M4A_BYTES, { headers: { 'content-type': 'audio/m4a' } })
    },
  })
  assert.deepEqual(urls, [audio, 'https://api.omnimux.ai/v1/audio/transcriptions'])
  assert.equal(captured.init.body.get('file').name, 'note.m4a')
  assert.equal(captured.init.body.get('file').type, 'audio/m4a')
  assert.equal(captured.init.body.get('url'), audio)
  assert.equal(captured.init.body.get('audio_url'), audio)
  assert.equal(result.model, 'whisper-1')
})

test('admitted wire primitive keeps explicit token and legacy Whisper compatibility', async () => {
  const captured = {}
  const result = await transcribeFixture({ audio: dataAudio, apiKey: 'pat-stt-token', fetcher: sttFetcher(captured) })
  assert.equal(captured.init.headers.authorization, 'Bearer pat-stt-token')
  assert.equal(captured.init.body.get('response_format'), 'json')
  assert.equal(result.model, 'whisper-1')
})

for (const [status, body, code] of [
  [429, { error: { message: 'insufficient quota' } }, 'quota-exceeded'],
  [500, { error: { message: 'boom' } }, 'omnimux-request-failed'],
  [500, 'server unavailable', 'omnimux-request-failed'],
  [200, { data: {} }, 'omnimux-invalid-response'],
  [200, '', 'omnimux-invalid-response'],
  [200, ' \r\n ', 'omnimux-invalid-response'],
]) {
  test(`STT rejects ${status} ${JSON.stringify(body)} without fabricated text`, async () => {
    await assert.rejects(() => executeOmnimuxSpeechToText({
      ...request, response_format: 'srt', fetcher: sttFetcher({}, body, status),
    }), { code })
  })
}
