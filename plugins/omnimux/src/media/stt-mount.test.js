import assert from 'node:assert/strict'
import { test } from 'node:test'
import { executeOmnimuxSpeechToText } from './stt.js'
import { mountSpeechToText, STT_TOOL_NAME } from './stt-mount.js'
import { OmnimuxError } from './errors.js'
import { JSON_TOOL_OUTPUT } from '../tools/schema.js'

function fakeCtx(gate) {
  const tools = {}
  const provided = {}
  return {
    tools, provided,
    ctx: {
      tools: { register(tool) { tools[tool.name] = tool } },
      provide(name, api) { provided[name] = api },
      get(name) { return name === 'gate' ? gate : undefined },
    },
  }
}

test('mount provides speechToText and the tool with optional response format', () => {
  const { ctx, tools, provided } = fakeCtx()
  mountSpeechToText(ctx, { execute: async () => ({}), jsonOut: JSON_TOOL_OUTPUT })
  assert.equal(typeof provided.speechToText.execute, 'function')
  assert.deepEqual(tools[STT_TOOL_NAME].parameters.required, ['audio'])
  assert.deepEqual(tools[STT_TOOL_NAME].parameters.properties.response_format.enum, ['json', 'text', 'verbose_json', 'srt', 'vtt'])
})

test('disabled gate skips both STT surfaces', () => {
  const { ctx, tools, provided } = fakeCtx({ enabled: true, tools: { [STT_TOOL_NAME]: false } })
  mountSpeechToText(ctx, { execute: async () => ({}), jsonOut: JSON_TOOL_OUTPUT })
  assert.equal(provided.speechToText, undefined)
  assert.equal(tools[STT_TOOL_NAME], undefined)
})

test('seam and tool forward response_format, language, media and credentials consistently', async () => {
  const store = { resolve: async () => 'pat' }
  const credentials = { resolve: async () => undefined }
  const { ctx, tools, provided } = fakeCtx()
  ctx.get = (name) => name === 'credentials' ? credentials : undefined
  const seen = []
  mountSpeechToText(ctx, {
    execute: async (req) => { seen.push(req); return { mode: 'live', model: req.model, text: 'subtitle' } },
    media: { defaultProvider: 'omnimux' }, store, jsonOut: JSON_TOOL_OUTPUT,
  })
  const request = { audio: '/tmp/a.mp3', model: 'doubao-asr-bigmodel', language: 'zh', response_format: 'srt' }
  const signal = new AbortController().signal
  assert.equal((await provided.speechToText.execute(request)).text, 'subtitle')
  assert.equal((await tools[STT_TOOL_NAME].execute(request, { signal })).text, 'subtitle')
  for (const req of seen) {
    for (const [field, value] of Object.entries(request)) assert.equal(req[field], value)
    assert.deepEqual(req.media, { defaultProvider: 'omnimux' })
    assert.equal(req.store, store)
    assert.equal(req.credentials, credentials)
  }
  assert.equal(seen[1].signal, signal)
})

test('tool rethrows OmnimuxError unchanged', async () => {
  const { ctx, tools } = fakeCtx()
  const error = new OmnimuxError('omnimux-invalid-request', 'audio is required')
  mountSpeechToText(ctx, { execute: async () => { throw error }, jsonOut: JSON_TOOL_OUTPUT })
  await assert.rejects(() => tools[STT_TOOL_NAME].execute({ audio: '' }, {}), (actual) => actual === error)
})

test('registered tool and seam reject bypassSubmitGuard before transcription HTTP', async () => {
  const { ctx, tools, provided } = fakeCtx()
  let calls = 0
  mountSpeechToText(ctx, { execute: executeOmnimuxSpeechToText, jsonOut: JSON_TOOL_OUTPUT })
  const request = {
    audio: '/tmp/omnimux-guard-never-reads.mp3', model: 'whisper-1', operation: 'speech_to_text', bypassSubmitGuard: true,
    env: {}, fetcher: async () => { calls++ },
  }
  await assert.rejects(() => tools[STT_TOOL_NAME].execute(request, {}), { code: 'omnimux-invalid-request' })
  await assert.rejects(() => provided.speechToText.execute(request), { code: 'omnimux-invalid-request' })
  assert.equal(calls, 0)
})
