import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { executeOmnimuxAudio } from './audio.js'
import { TASK_PATH, taskPathFor } from './vendors/omnimux.js'

const SAMPLE = 'https://cdn.example.test/voice-sample.wav'
const TEXT = '你好，这是一段声音克隆测试。'
const AUDIO_BYTES = Buffer.from('ID3 voice clone fixture bytes')

/**
 * Stub gateway: records every request and answers submit, poll and download.
 * @param {{ failPoll?: boolean }} [options]
 */
function gateway(options = {}) {
  const calls = []
  const fetcher = async (url, request) => {
    const target = String(url)
    const method = request?.method ?? 'GET'
    calls.push({ method, url: target, body: request?.body ? JSON.parse(request.body) : null })
    if (method === 'POST') {
      return new Response(JSON.stringify({ id: 'task_clone_1', status: 'in_progress' }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    if (target.includes('task_clone_1')) {
      if (options.failPoll) {
        return new Response(JSON.stringify({ id: 'task_clone_1', status: 'failed' }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        id: 'task_clone_1',
        status: 'completed',
        outputs: [{ type: 'audio', url: 'https://cdn.example.test/cloned.mp3' }],
      }), { headers: { 'content-type': 'application/json' } })
    }
    return new Response(AUDIO_BYTES, { headers: { 'content-type': 'audio/mpeg' } })
  }
  return { calls, fetcher }
}

function run(args, options = {}) {
  const { calls, fetcher } = gateway(options)
  return {
    calls,
    promise: executeOmnimuxAudio({
      ...args,
      env: { OMNIMUX_API_KEY: 'fixture-key' },
      store: { async resolve() { return 'fixture-token' } },
      fetcher,
      media: {},
      pollIntervalMs: 1,
      deadlineMs: 2000,
    }),
  }
}

test('audio models served on the shared video task route resolve to that endpoint', () => {
  assert.equal(taskPathFor('audio', 'index-tts'), TASK_PATH.video)
  // Every other capability/model keeps the capability default.
  assert.equal(taskPathFor('audio', 'seed-audio-1.0'), TASK_PATH.audio)
  assert.equal(taskPathFor('audio', 'suno'), TASK_PATH.audio)
  assert.equal(taskPathFor('video', 'seedance-2-5'), TASK_PATH.video)
  assert.equal(taskPathFor('image', 'gpt-image-2.5'), TASK_PATH.image)
  assert.equal(taskPathFor('audio', undefined), TASK_PATH.audio)
})

test('voice_clone submits nodeInfoList to the video task endpoint and writes the artifact', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'voice-clone-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const dest = join(dir, 'cloned.mp3')
  const { calls, promise } = run({
    dest,
    model: 'index-tts',
    operation: 'voice_clone',
    prompt: TEXT,
    audioTrack: { type: 'audio', role: 'audio_track', pathOrUrl: SAMPLE },
  })

  const result = await promise
  assert.equal(result.mode, 'live')
  assert.equal(result.taskId, 'task_clone_1')
  assert.deepEqual(readFileSync(dest), AUDIO_BYTES)

  const submit = calls.find((call) => call.method === 'POST')
  assert.ok(submit, 'submit request was issued')
  assert.ok(submit.url.endsWith('/v1/video/generations'), submit.url)
  assert.equal(submit.body.model, 'index-tts')
  assert.deepEqual(submit.body.metadata.nodeInfoList, [
    { nodeId: '4', fieldName: 'audio', fieldValue: SAMPLE },
    { nodeId: '7', fieldName: 'text', fieldValue: TEXT },
  ])
  // The channel documents no output-format parameter for this model.
  assert.equal('format' in submit.body, false)
  assert.equal('response_format' in submit.body, false)

  const poll = calls.find((call) => call.method === 'GET' && call.url.includes('task_clone_1'))
  assert.ok(poll, 'task was polled')
  assert.ok(poll.url.endsWith('/v1/video/generations/task_clone_1'), poll.url)
})

test('voice_clone is inferred from the reference audio and text without an explicit operation', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'voice-clone-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const { calls, promise } = run({
    dest: join(dir, 'inferred.mp3'),
    model: 'index-tts',
    prompt: TEXT,
    audioTrack: { type: 'audio', role: 'audio_track', pathOrUrl: SAMPLE },
  })

  await promise
  const submit = calls.find((call) => call.method === 'POST')
  assert.ok(submit.url.endsWith('/v1/video/generations'))
  assert.equal(submit.body.metadata.nodeInfoList.length, 2)
})

test('a resumed voice_clone task polls the same video task route', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'voice-clone-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const dest = join(dir, 'resumed.mp3')
  const { calls, promise } = run({ dest, model: 'index-tts', taskId: 'task_clone_1' })

  const result = await promise
  assert.equal(result.mode, 'live')
  assert.equal(calls.some((call) => call.method === 'POST'), false, 'resume must not resubmit')
  const poll = calls.find((call) => call.method === 'GET' && call.url.includes('task_clone_1'))
  assert.ok(poll.url.endsWith('/v1/video/generations/task_clone_1'), poll.url)
})

test('voice_clone refuses a missing reference sample, a missing script and a data: URI sample', async () => {
  const missingSample = run({ dest: '/tmp/should-not-exist-a.mp3', model: 'index-tts', operation: 'voice_clone', prompt: TEXT })
  await assert.rejects(missingSample.promise, /voice_sample/)
  assert.equal(missingSample.calls.some((call) => call.method === 'POST'), false)

  const missingText = run({
    dest: '/tmp/should-not-exist-b.mp3', model: 'index-tts', operation: 'voice_clone',
    audioTrack: { type: 'audio', role: 'audio_track', pathOrUrl: SAMPLE },
  })
  await assert.rejects(missingText.promise, /prompt is required/)
  assert.equal(missingText.calls.some((call) => call.method === 'POST'), false)

  const dataUri = run({
    dest: '/tmp/should-not-exist-c.mp3', model: 'index-tts', operation: 'voice_clone', prompt: TEXT,
    audioTrack: { type: 'audio', role: 'audio_track', pathOrUrl: 'data:audio/wav;base64,UklGRg==' },
  })
  await assert.rejects(dataUri.promise)
  assert.equal(dataUri.calls.some((call) => call.method === 'POST'), false)
})

test('a failed voice_clone task reports failure instead of writing an artifact', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'voice-clone-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const { promise } = run({
    dest: join(dir, 'failed.mp3'), model: 'index-tts', operation: 'voice_clone', prompt: TEXT,
    audioTrack: { type: 'audio', role: 'audio_track', pathOrUrl: SAMPLE },
  }, { failPoll: true })

  await assert.rejects(promise)
})
