import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { GUARD_CODES, assertGuardOutput, assertGuardSubmit, validateVendorResult } from './index.js'
import { getContractIndex, loadAdapterProfiles } from '../index.js'
import { executeOmnimuxVideo } from '../../../media/video.js'
import { executeOmnimuxImage } from '../../../media/image.js'
import { executeOmnimuxText } from '../../../text/execute.js'
import { OmnimuxError } from '../../../media/errors.js'

const index = getContractIndex()
const profiles = loadAdapterProfiles()

describe('SubmitGuard output validation', () => {
  const t2v = index.get('seedance-2-0-fast').operations.find((o) => o.id === 'text_to_video')
  const chat = index.get('claude-opus-5').operations.find((o) => o.id === 'chat')

  it('accepts matching video outputs', () => {
    const r = validateVendorResult(
      { taskId: 't', outputs: [{ type: 'video', url: 'https://x/a.mp4' }] }, t2v, { capability: 'video' },
    )
    assert.equal(r.ok, true)
  })

  it('rejects type mismatch', () => {
    const r = validateVendorResult(
      { taskId: 't', outputs: [{ type: 'image', url: 'https://x/a.png' }], mode: 'live' }, t2v, { capability: 'video' },
    )
    assert.equal(r.ok, false)
    assert.equal(r.code, GUARD_CODES.OUTPUT_TYPE_MISMATCH)
  })

  it('rejects missing text', () => {
    const r = validateVendorResult({ mode: 'live', text: '  ' }, chat)
    assert.equal(r.ok, false)
    assert.equal(r.code, GUARD_CODES.INVALID_RESPONSE)
  })

  it('accepts submitted mode without outputs', () => {
    const r = validateVendorResult({ mode: 'submitted', taskId: 't1' }, t2v)
    assert.equal(r.ok, true)
  })
})

describe('SubmitGuard execute integration', () => {
  it('seedance text_to_video live path reaches vendor once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sg-vid-'))
    const dest = join(dir, 'o.mp4')
    let calls = 0
    const result = await executeOmnimuxVideo({
      prompt: 'a wall at night', dest, model: 'seedance-2-0-fast', operation: 'text_to_video',
      duration: 4, resolution: '720p', env: { OMNIMUX_API_KEY: 'sk-test' },
      runtime: {
        async execute(req) {
          calls += 1
          assert.equal(req.input.prompt, 'a wall at night')
          assert.equal(req.input.duration, 4)
          assert.equal(req.input.resolution, '720p')
          assert.equal('audioTrack' in req.input, false)
          assert.equal('metadata' in req.input, false)
          return { taskId: 't1', outputs: [{ type: 'video', url: 'https://cdn.example/a.mp4' }] }
        },
      },
      fetcher: async () => ({ ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => Buffer.from('mp4') }),
    })
    assert.equal(result.mode, 'live')
    assert.equal(calls, 1)
    assert.equal(readFileSync(dest, 'utf8'), 'mp4')
    rmSync(dir, { recursive: true, force: true })
  })

  it('invalid request yields vendor call count 0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sg-rej-'))
    const dest = join(dir, 'o.mp4')
    let calls = 0
    await assert.rejects(
      () => executeOmnimuxVideo({
        prompt: '', dest, model: 'seedance-2-0-fast', operation: 'text_to_video',
        env: { OMNIMUX_API_KEY: 'sk-test' }, runtime: { async execute() { calls += 1; return { outputs: [] } } },
      }),
      (e) => e instanceof OmnimuxError,
    )
    assert.equal(calls, 0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects unsupported declared parameters before vendor execution', async () => {
    let calls = 0
    await assert.rejects(
      () => executeOmnimuxVideo({
        prompt: 'a wall at night', dest: '/tmp/sg-unsupported-parameter.mp4',
        model: 'seedance-2-0-fast', operation: 'text_to_video', duration: 3, resolution: 'bogus',
        env: { OMNIMUX_API_KEY: 'sk-test' }, runtime: { async execute() { calls += 1; return { outputs: [] } } },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
    assert.equal(calls, 0)
  })

  it('taskId poll path does not require prompt or assets', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sg-poll-'))
    const dest = join(dir, 'o.mp4')
    let submitCalls = 0
    const result = await executeOmnimuxVideo({
      dest, taskId: 'existing-task', env: { OMNIMUX_API_KEY: 'sk-test' },
      runtime: { async execute() { submitCalls += 1; return { outputs: [] } } },
      fetcher: async (url) => {
        if (String(url).includes('existing-task')) {
          return { ok: true, json: async () => ({ status: 'completed', url: 'https://cdn.example/done.mp4' }) }
        }
        return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => Buffer.from('done') }
      },
    })
    assert.equal(result.mode, 'live')
    assert.equal(submitCalls, 0)
    assert.equal(readFileSync(dest, 'utf8'), 'done')
    rmSync(dir, { recursive: true, force: true })
  })

  it('gpt-image-2 text_to_image passes guard', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sg-img-'))
    const dest = join(dir, 'o.png')
    const result = await executeOmnimuxImage({
      prompt: 'a lamp', dest, model: 'gpt-image-2', operation: 'text_to_image', env: { OMNIMUX_API_KEY: 'sk-test' },
      runtime: { async execute() { return { taskId: 'i1', outputs: [{ type: 'image', url: 'https://cdn.example/i.png' }] } } },
      fetcher: async () => ({ ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => Buffer.from('png') }),
    })
    assert.equal(result.mode, 'live')
    rmSync(dir, { recursive: true, force: true })
  })

  it('text chat listed path passes through guard', async () => {
    async function* stream() {
      yield { type: 'text-delta', text: 'hello' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    const result = await executeOmnimuxText({
      prompt: 'hi', model: 'claude-opus-5', operation: 'chat', llm: { stream: () => stream() },
    })
    assert.equal(result.text, 'hello')
  })

  it('text vision path with image meta passes', async () => {
    async function* stream() {
      yield { type: 'text-delta', text: 'cat' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    const dataUri = 'data:image/png;base64,iVBORw0KGgo='
    const result = await executeOmnimuxText({
      prompt: 'what', model: 'gemini-3.7-flash', operation: 'vision_chat', image: dataUri,
      assetMeta: { [dataUri]: { mime: 'image/png', sizeBytes: 12 } },
      llm: { stream: () => stream() }, attachments: { saveImage: async () => ({ id: 'att-1' }) },
    })
    assert.equal(result.text, 'cat')
  })

  it('assertGuardOutput throws typed invalid_response on mismatch', () => {
    const plan = assertGuardSubmit(
      { model: 'seedance-2-0-fast', operation: 'text_to_video', prompt: 'x' },
      { index, profiles, seam: 'videoGenerate', outputType: 'video' },
    )
    assert.throws(
      () => assertGuardOutput(plan, { mode: 'live', outputs: [{ type: 'image', url: 'https://x' }] }, { capability: 'video' }),
      (e) => e instanceof OmnimuxError && e.code === 'omnimux-invalid-response',
    )
  })
})
