import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { OmnimuxError } from './errors.js'
import { executeOmnimuxImage, readOmnimuxImageConfig } from './image.js'
import { mapOmnimuxInput, pickMediaUrl } from './vendors/omnimux.js'
import { resolveMediaRoute, parseMediaConfig } from './route.js'

describe('omnimux image helpers', () => {
  it('defaults to gpt-image-2.5 on the openai-media row', () => {
    const config = readOmnimuxImageConfig({})
    assert.equal(config.baseUrl, 'https://api.omnimux.ai/v1')
    assert.equal(config.modelId, 'gpt-image-2.5')
    assert.equal(config.apiKey, '')
  })

  it('overlays OMNIMUX_IMAGE_MODEL', () => {
    const route = resolveMediaRoute('image', {}, parseMediaConfig(undefined), {
      OMNIMUX_IMAGE_MODEL: 'gpt-image2-hd',
      OMNIMUX_API_KEY: 'sk-a',
    })
    assert.equal(route.modelId, 'gpt-image2-hd')
    assert.equal(route.capability, 'image')
  })

  it('picks OpenAI data[0].url envelopes', () => {
    assert.equal(pickMediaUrl({ data: [{ url: 'https://cdn.example/a.png' }] }), 'https://cdn.example/a.png')
  })

  it('picks OpenAI data[0].b64_json envelopes as a data URL', () => {
    assert.equal(
      pickMediaUrl({ data: [{ b64_json: 'cG5n' }] }),
      'data:image/png;base64,cG5n',
    )
  })

  it('refuses to execute without a key', async () => {
    await assert.rejects(
      () => executeOmnimuxImage({ prompt: 'a lamp', dest: '/tmp/no.png', env: {} }),
      (error) => error instanceof OmnimuxError && error.code === 'needs-omnimux',
    )
  })

  it('测试用例 6：executeOmnimuxImage 在传入 Mock store 的情况下，无需 OMNIMUX_API_KEY 也能顺利调用 mock runtime 执行成功', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-img-pat-'))
    const dest = join(dir, 'out.png')
    const result = await executeOmnimuxImage({
      prompt: 'a lamp at night with pat',
      dest,
      env: {},
      store: {
        resolve: async () => 'pat-login-token',
      },
      runtime: {
        async execute(req) {
          assert.equal(req.modelId, 'omnimux-image')
          return {
            taskId: 'img-pat-1',
            outputs: [{ type: 'image', url: 'https://cdn.example/out-pat.png' }],
          }
        },
      },
      fetcher: async (url) => {
        assert.equal(String(url), 'https://cdn.example/out-pat.png')
        return { ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => Buffer.from('pat-png-bytes') }
      },
    })
    assert.equal(result.mode, 'live')
    assert.equal(result.taskId, 'img-pat-1')
    assert.equal(readFileSync(dest, 'utf8'), 'pat-png-bytes')
    rmSync(dir, { recursive: true, force: true })
  })

  it('sends authorization when downloading an omnimux.ai image url', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-img-auth-'))
    const dest = join(dir, 'out.png')
    let downloadHeaders
    const result = await executeOmnimuxImage({
      prompt: 'a lamp at night',
      dest,
      env: { OMNIMUX_API_KEY: 'sk-image-auth' },
      runtime: {
        async execute() {
          return {
            taskId: 'img-auth',
            outputs: [{ type: 'image', url: 'https://omnimux.ai/v1/videos/img-auth/content' }],
          }
        },
      },
      fetcher: async (url, init) => {
        assert.equal(String(url), 'https://omnimux.ai/v1/videos/img-auth/content')
        downloadHeaders = init?.headers
        return { ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => Buffer.from('png-auth-bytes') }
      },
    })
    assert.equal(result.mode, 'live')
    assert.equal(downloadHeaders?.authorization, 'Bearer sk-image-auth')
    assert.equal(readFileSync(dest, 'utf8'), 'png-auth-bytes')
    rmSync(dir, { recursive: true, force: true })
  })

  it('executes through a fake runtime and writes dest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-img-'))
    const dest = join(dir, 'out.png')
    const result = await executeOmnimuxImage({
      prompt: 'a lamp at night',
      dest,
      env: { OMNIMUX_API_KEY: 'sk-test' },
      runtime: {
        async execute(req) {
          assert.equal(req.modelId, 'omnimux-image')
          return {
            taskId: 'img-1',
            outputs: [{ type: 'image', url: 'https://cdn.example/out.png' }],
          }
        },
      },
      fetcher: async (url) => {
        assert.equal(String(url), 'https://cdn.example/out.png')
        return { ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => Buffer.from('png-bytes') }
      },
    })
    assert.equal(result.mode, 'live')
    assert.equal(result.taskId, 'img-1')
    assert.equal(readFileSync(dest, 'utf8'), 'png-bytes')
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes dest from a synchronous b64_json envelope', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-img-'))
    const dest = join(dir, 'out.png')
    const result = await executeOmnimuxImage({
      prompt: 'a lamp',
      dest,
      env: { OMNIMUX_API_KEY: 'sk-test' },
      fetcher: async (url, init) => {
        assert.equal(String(init?.method ?? 'GET').toUpperCase(), 'POST')
        assert.match(String(url), /images\/generations$/)
        return {
          ok: true,
          status: 200,
          headers: { get() { return undefined } },
          text: async () => JSON.stringify({ data: [{ b64_json: Buffer.from('png-bytes').toString('base64') }] }),
          json: async () => ({ data: [{ b64_json: Buffer.from('png-bytes').toString('base64') }] }),
        }
      },
    })
    assert.equal(result.mode, 'live')
    assert.equal(readFileSync(dest, 'utf8'), 'png-bytes')
    rmSync(dir, { recursive: true, force: true })
  })

  it('unwraps ADAPTER_FAILED cause so canvas shows the provider message', async () => {
    const inner = Object.assign(new Error('Invalid token (request id: abc)'), { code: 'REQUEST_FAILED', status: 401 })
    const wrapped = Object.assign(new Error('Adapter openai-compatible failed'), {
      name: 'ProviderRuntimeError',
      code: 'ADAPTER_FAILED',
      cause: inner,
    })
    await assert.rejects(
      () => executeOmnimuxImage({
        prompt: '1 dog',
        dest: '/tmp/no.png',
        env: { OMNIMUX_API_KEY: 'sk-test' },
        runtime: {
          async execute() {
            throw wrapped
          },
        },
      }),
      (error) => {
        assert(error instanceof OmnimuxError)
        assert.equal(error.code, 'ADAPTER_FAILED')
        assert.match(error.message, /Invalid token/)
        return true
      },
    )
  })

  it('wait false still writes dest when the provider returns a url (sync gpt-image-2)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-img-sync-'))
    const dest = join(dir, 'out.png')
    const result = await executeOmnimuxImage({
      prompt: '1 dog',
      dest,
      wait: false,
      env: { OMNIMUX_API_KEY: 'sk-test' },
      runtime: {
        async execute() {
          return {
            taskId: null,
            outputs: [{ type: 'image', url: 'https://cdn.example/sync.png' }],
          }
        },
      },
      fetcher: async (url) => {
        assert.equal(String(url), 'https://cdn.example/sync.png')
        return { ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => Buffer.from('sync-png') }
      },
    })
    assert.equal(result.mode, 'live')
    assert.equal(result.taskId, null)
    assert.equal(readFileSync(dest, 'utf8'), 'sync-png')
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects a wrong synchronous download MIME before writing dest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-img-mime-'))
    const dest = join(dir, 'out.png')
    await assert.rejects(
      () => executeOmnimuxImage({
        prompt: '1 dog',
        dest,
        env: { OMNIMUX_API_KEY: 'sk-test' },
        // Exercise the OpenAI protocol normalizer, which labels raw URLs as
        // image outputs before the download response reveals its real MIME.
        fetcher: async (url, init) => {
          if (init?.method === 'POST') {
            return {
              ok: true,
              status: 200,
              headers: { get: () => 'application/json' },
              json: async () => ({ data: [{ url: 'https://cdn.example/wrong.png' }] }),
              text: async () => JSON.stringify({ data: [{ url: 'https://cdn.example/wrong.png' }] }),
            }
          }
          assert.equal(String(url), 'https://cdn.example/wrong.png')
          return {
            ok: true,
            headers: { get: () => 'video/mp4' },
            arrayBuffer: async () => Buffer.from('not-an-image'),
          }
        },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-response',
    )
    assert.equal(existsSync(dest), false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects an empty synchronous download before writing dest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-img-empty-'))
    const dest = join(dir, 'out.png')
    await assert.rejects(
      () => executeOmnimuxImage({
        prompt: '1 dog',
        dest,
        env: { OMNIMUX_API_KEY: 'sk-test' },
        runtime: { async execute() { return { taskId: 'img-empty', outputs: [{ type: 'image', url: 'https://cdn.example/empty.png' }] } } },
        fetcher: async () => ({
          ok: true,
          headers: { get: () => 'image/png' },
          arrayBuffer: async () => Buffer.alloc(0),
        }),
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-response',
    )
    assert.equal(existsSync(dest), false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('wait false returns submitted without writing dest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-img-'))
    const dest = join(dir, 'out.png')
    const result = await executeOmnimuxImage({
      prompt: 'a lamp',
      dest,
      wait: false,
      env: { OMNIMUX_API_KEY: 'sk-test' },
      runtime: {
        async execute() {
          return { taskId: 'img-wait', outputs: [] }
        },
      },
    })
    assert.equal(result.mode, 'submitted')
    assert.equal(result.taskId, 'img-wait')
    assert.equal(existsSync(dest), false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('resumes from taskId without submitting', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-img-'))
    const dest = join(dir, 'out.png')
    let posts = 0
    const result = await executeOmnimuxImage({
      dest,
      taskId: 'img-7',
      env: { OMNIMUX_API_KEY: 'sk-test' },
      fetcher: async (url, init) => {
        if (init?.method === 'POST') {
          posts += 1
          return { ok: true, json: async () => ({}) }
        }
        if (String(url).includes('/images/generations/img-7')) {
          return {
            ok: true,
            json: async () => ({ status: 'completed', url: 'https://cdn.example/done.png' }),
          }
        }
        assert.equal(String(url), 'https://cdn.example/done.png')
        return { ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => Buffer.from('resumed-png') }
      },
    })
    assert.equal(posts, 0)
    assert.equal(result.mode, 'live')
    assert.equal(result.taskId, 'img-7')
    assert.equal(readFileSync(dest, 'utf8'), 'resumed-png')
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects a wrong poll/finish download MIME before writing dest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-img-poll-mime-'))
    const dest = join(dir, 'out.png')
    let posts = 0
    await assert.rejects(
      () => executeOmnimuxImage({
        dest,
        taskId: 'img-mime-poll',
        env: { OMNIMUX_API_KEY: 'sk-test' },
        fetcher: async (url, init) => {
          if (init?.method === 'POST') posts += 1
          if (String(url).includes('/images/generations/img-mime-poll')) {
            return { ok: true, json: async () => ({ status: 'completed', url: 'https://cdn.example/wrong-polled.png' }) }
          }
          return {
            ok: true,
            headers: { get: () => 'video/mp4' },
            arrayBuffer: async () => Buffer.from('not-an-image'),
          }
        },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-response',
    )
    assert.equal(posts, 0)
    assert.equal(existsSync(dest), false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects an empty poll/finish download before writing dest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-img-empty-poll-'))
    const dest = join(dir, 'out.png')
    await assert.rejects(
      () => executeOmnimuxImage({
        dest,
        taskId: 'img-empty-poll',
        env: { OMNIMUX_API_KEY: 'sk-test' },
        fetcher: async (url) => {
          if (String(url).includes('/images/generations/img-empty-poll')) {
            return { ok: true, json: async () => ({ status: 'completed', url: 'https://cdn.example/empty-polled.png' }) }
          }
          return {
            ok: true,
            headers: { get: () => 'image/png' },
            arrayBuffer: async () => Buffer.alloc(0),
          }
        },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-response',
    )
    assert.equal(existsSync(dest), false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('mapOmnimuxInput: maps references and audioTrack with backward compatibility', () => {
    const input = mapOmnimuxInput('image', {
      prompt: 'test prompt',
      references: [
        { role: 'reference', type: 'image', pathOrUrl: 'https://example.com/ref1.png' },
        { role: 'reference', type: 'image', pathOrUrl: 'https://example.com/ref2.png' },
      ],
      audioTrack: {
        role: 'audio_track',
        type: 'audio',
        pathOrUrl: '/local/audio.mp3',
      },
    })
    assert.equal(input.prompt, 'test prompt')
    assert.equal(input.image, 'https://example.com/ref1.png', 'fallback image to first image reference')
    assert.deepEqual(input.images, ['https://example.com/ref1.png', 'https://example.com/ref2.png'])
    assert.equal(input.references.length, 2)
    assert.equal(input.audioTrack.pathOrUrl, '/local/audio.mp3')
  })

  it('keeps reference/audioTrack mapping out of unchecked submit execution', () => {
    const input = mapOmnimuxInput('image', {
      prompt: 'a city with references',
      references: [
        { role: 'reference', type: 'image', pathOrUrl: '/tmp/ref1.png' },
      ],
      audioTrack: {
        role: 'audio_track',
        type: 'audio',
        pathOrUrl: '/tmp/track.mp3',
      },
    })
    assert.equal(input.prompt, 'a city with references')
    assert.equal(input.image, '/tmp/ref1.png')
    assert.deepEqual(input.images, ['/tmp/ref1.png'])
    assert.equal(input.references.length, 1)
    assert.equal(input.audioTrack.pathOrUrl, '/tmp/track.mp3')
  })
})
