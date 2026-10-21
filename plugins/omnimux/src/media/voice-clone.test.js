import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { executeOmnimuxAudio } from './audio.js'
import { assertGuardSubmit } from '../catalog/contract/submit-guard/index.js'
import { TASK_PATH, taskPathFor } from './vendors/omnimux.js'

const SAMPLE = 'https://cdn.example.test/voice-sample.wav'
const TEXT = '你好，这是一段声音克隆测试。'
const AUDIO_BYTES = Buffer.from('ID3 voice clone fixture bytes')

/**
 * Stub gateway: records every request and answers submit, poll, artifacts and download.
 * @param {{ failPoll?: boolean, artifacts?: Array<object> }} [options]
 */
function gateway(options = {}) {
  const calls = []
  const fetcher = async (url, request) => {
    const target = String(url)
    const method = request?.method ?? 'GET'
    calls.push({ method, url: target, body: request?.body ? JSON.parse(request.body) : null })
    if (method === 'POST') {
      return new Response(JSON.stringify({ id: 'task_suno_1', task_id: 'task_suno_1', status: 'queued' }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    if (target.includes('/artifacts')) {
      return new Response(JSON.stringify({ artifacts: options.artifacts ?? [{ url: 'https://cdn.example.test/cloned.mp3' }] }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    if (target.includes('task_suno_1')) {
      if (options.failPoll) {
        return new Response(JSON.stringify({ id: 'task_suno_1', status: 'failed' }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        id: 'task_suno_1',
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
      env: { OMNIMUX_API_KEY: 'sk-fixture' },
      store: { async resolve() { return 'fixture-token' } },
      fetcher,
      media: {},
      pollIntervalMs: 1,
      deadlineMs: 2000,
    }),
  }
}

const voiceCloneRequest = {
  model: 'indextts-2',
  operation: 'voice_clone',
  prompt: TEXT,
  audioTrack: { type: 'audio', role: 'audio_track', pathOrUrl: SAMPLE },
}

test('audio models resolve their task endpoints by lane', () => {
  // Issue #3063: indextts-2 submits to the AutoDL lane and polls the task route.
  assert.equal(taskPathFor('audio', 'indextts-2'), 'tasks/autodl')
  assert.equal(taskPathFor('audio', 'index-tts'), TASK_PATH.video)
  // Every other capability/model keeps the capability default.
  assert.equal(taskPathFor('audio', 'seed-audio-1.0'), TASK_PATH.audio)
  assert.equal(taskPathFor('audio', 'suno'), TASK_PATH.video)
  assert.equal(taskPathFor('video', 'seedance-2-5'), TASK_PATH.video)
  assert.equal(taskPathFor('image', 'gpt-image-2.5'), TASK_PATH.image)
  assert.equal(taskPathFor('audio', undefined), TASK_PATH.audio)
})

// 2026-10-21 网关对账 #3516：indextts-2 上游渠道停用 → voice_clone 仅登记不上架。
// AutoDL 的提交载荷与 lane 契约仍然保留（unlisted 放行断言），listing 依赖的提交必须 fail-closed。
test('indextts-2 voice_clone keeps the AutoDL payload contract; the delisted lane fails closed on submit', async (t) => {
  const plan = assertGuardSubmit(voiceCloneRequest, {
    seam: 'audioGenerate', capability: 'audio', outputType: 'audio', requireListed: false,
  })
  assert.equal(plan.modelId, 'indextts-2')
  assert.equal(plan.operationId, 'voice_clone')
  assert.equal(plan.vendorPayload.model, 'indextts-2')
  assert.equal(plan.vendorPayload.prompt_text, TEXT)
  assert.equal(plan.vendorPayload.prompt_simple, SAMPLE)
  assert.equal(plan.vendorPayload.emo_control_method, '与音色参考音频相同')
  // The channel documents no output-format parameter for this model.
  assert.equal('format' in plan.vendorPayload, false)
  assert.equal('response_format' in plan.vendorPayload, false)
  assert.equal(taskPathFor('audio', 'indextts-2'), 'tasks/autodl')

  const dir = mkdtempSync(join(tmpdir(), 'voice-clone-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const dest = join(dir, 'cloned.mp3')
  const { calls, promise } = run({ dest, ...voiceCloneRequest })
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, 'omnimux-invalid-request')
    assert.equal(error.details?.guardCode, 'implementation_unavailable')
    return true
  })
  // 素材探测（GET）发生在 SubmitGuard 之前；但绝不能有 submit POST 落到网关。
  assert.equal(calls.some((call) => call.method === 'POST'), false, 'a delisted lane must not submit')
  assert.equal(existsSync(dest), false)
})

test('voice_clone operation inference is listing-dependent and now fails closed', async () => {
  // Operation 推断只考虑 listed 契约：indextts-2 的 voice_clone 已不上架，
  // 即使以 unlisted 放行也必须要求调用方显式声明 operation。
  assert.throws(
    () => assertGuardSubmit({ ...voiceCloneRequest, operation: undefined }, {
      seam: 'audioGenerate', capability: 'audio', outputType: 'audio', requireListed: false,
    }),
    (error) => {
      assert.equal(error.code, 'omnimux-invalid-request')
      assert.equal(error.details?.guardCode, 'operation_required')
      return true
    },
  )
  const { calls, promise } = run({
    dest: '/tmp/should-not-exist-inferred.mp3',
    model: 'indextts-2',
    prompt: TEXT,
    audioTrack: { type: 'audio', role: 'audio_track', pathOrUrl: SAMPLE },
  })
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, 'omnimux-invalid-request')
    assert.equal(error.details?.guardCode, 'operation_required')
    return true
  })
  assert.equal(calls.some((call) => call.method === 'POST'), false)
})

test('a listed audio task submits, polls and downloads the artifact', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'audio-task-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const dest = join(dir, 'track.mp3')
  // #3516：音频任务通道现由在架的 suno（text_to_music）承载。
  const { calls, promise } = run({ dest, model: 'suno', operation: 'text_to_music', prompt: 'a calm piano melody' })
  const result = await promise
  assert.equal(result.mode, 'live')
  assert.equal(result.taskId, 'task_suno_1')
  assert.deepEqual(readFileSync(dest), AUDIO_BYTES)
  const submit = calls.find((call) => call.method === 'POST')
  assert.ok(submit, 'submit request was issued')
  assert.ok(submit.url.endsWith('/v1/video/generations'), submit.url)
  assert.equal(submit.body.model, 'suno')
  assert.equal(submit.body.prompt, 'a calm piano melody')
  const poll = calls.find((call) => call.method === 'GET' && call.url.includes('task_suno_1'))
  assert.ok(poll, 'task was polled')
  assert.ok(poll.url.endsWith('/v1/video/generations/task_suno_1'), poll.url)
})

test('a resumed audio task polls the same task route without resubmitting', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'audio-task-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const first = run({ dest: join(dir, 'first.mp3'), model: 'suno', operation: 'text_to_music', prompt: 'resume me' })
  const submitted = await first.promise
  assert.equal(submitted.taskId, 'task_suno_1')

  const { calls, promise } = run({ dest: join(dir, 'resumed.mp3'), model: 'suno', taskId: 'task_suno_1' })
  const result = await promise
  assert.equal(result.mode, 'live')
  assert.equal(calls.some((call) => call.method === 'POST'), false, 'resume must not resubmit')
  assert.ok(result.taskRef, 'resume reuses the persisted task record')
})

test('voice_clone refuses a missing reference sample and a missing script before the gateway', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'voice-clone-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const missingSample = run({ dest: join(dir, 'a.mp3'), model: 'indextts-2', operation: 'voice_clone', prompt: TEXT })
  await assert.rejects(missingSample.promise, (error) => {
    assert.equal(error.code, 'omnimux-invalid-request')
    assert.equal(error.details?.guardCode, 'implementation_unavailable')
    return true
  })
  assert.equal(missingSample.calls.some((call) => call.method === 'POST'), false)

  // 契约级校验（unlisted 放行路径）保留 voice_sample / prompt 的具体拒绝原因。
  assert.throws(
    () => assertGuardSubmit({ ...voiceCloneRequest, audioTrack: undefined }, {
      seam: 'audioGenerate', capability: 'audio', outputType: 'audio', requireListed: false,
    }),
    /voice_sample/,
  )
  assert.throws(
    () => assertGuardSubmit({ model: 'indextts-2', operation: 'voice_clone', audioTrack: { type: 'audio', role: 'audio_track', pathOrUrl: SAMPLE } }, {
      seam: 'audioGenerate', capability: 'audio', outputType: 'audio', requireListed: false,
    }),
    /prompt is required/,
  )
})

test('a failed audio task reports failure instead of writing an artifact', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'audio-task-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const dest = join(dir, 'failed.mp3')
  const { promise } = run({ dest, model: 'suno', operation: 'text_to_music', prompt: 'fails' }, { failPoll: true })
  await assert.rejects(promise)
  assert.equal(existsSync(dest), false)
})
