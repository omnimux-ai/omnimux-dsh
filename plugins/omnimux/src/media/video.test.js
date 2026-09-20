import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  executeOmnimuxVideo,
  OmnimuxError,
  pickTaskId,
  pickVideoUrl,
  pollVideoTask,
  readOmnimuxConfig,
} from './video.js'
import { mapOmnimuxInput } from './vendors/omnimux.js'

describe('omnimux video helpers', () => {
  it('reads env defaults', () => {
    const config = readOmnimuxConfig({})
    assert.equal(config.baseUrl, 'https://api.omnimux.ai/v1')
    assert.equal(config.modelId, 'seedance-2-5')
    assert.equal(config.apiKey, '')
  })

  it('picks task id and video url from nested payloads', () => {
    assert.equal(pickTaskId({ data: { task_id: 't-1' } }), 't-1')
    assert.equal(pickVideoUrl({ videoUrls: ['https://cdn.example/a.mp4'] }), 'https://cdn.example/a.mp4')
  })

  it('polls until completed', async () => {
    let calls = 0
    const json = await pollVideoTask({
      fetcher: async () => {
        calls += 1
        const body = calls === 1
          ? { status: 'in_progress' }
          : { status: 'completed', url: 'https://cdn.example/done.mp4' }
        return { ok: true, json: async () => body }
      },
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKey: 'sk-test',
      taskId: 't-1',
      sleep: async () => {},
    })
    assert.equal(pickVideoUrl(json), 'https://cdn.example/done.mp4')
    assert.equal(calls, 2)
  })

  it('refuses to execute without a key', async () => {
    await assert.rejects(
      () => executeOmnimuxVideo({
        prompt: 'x',
        dest: '/tmp/no.mp4',
        model: 'seedance-2-5',
        operation: 'text_to_video',
        env: {},
      }),
      (error) => error instanceof OmnimuxError && error.code === 'needs-omnimux',
    )
  })

  it('executes through mock store token without OMNIMUX_API_KEY', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-vid-pat-'))
    const dest = join(dir, 'out.mp4')
    const result = await executeOmnimuxVideo({
      prompt: 'a wall with pat',
      dest,
      model: 'seedance-2-5',
      operation: 'text_to_video',
      duration: 5,
      env: {},
      store: {
        resolve: async () => 'pat-video-token',
      },
      runtime: {
        async execute() {
          return {
            taskId: 'task-vid-pat',
            outputs: [{ type: 'video', url: 'https://cdn.example/out-pat.mp4' }],
          }
        },
      },
      fetcher: async (url) => {
        assert.equal(String(url), 'https://cdn.example/out-pat.mp4')
        return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => Buffer.from('mp4-pat-bytes') }
      },
    })
    assert.equal(result.mode, 'live')
    assert.equal(result.taskId, 'task-vid-pat')
    assert.equal(readFileSync(dest, 'utf8'), 'mp4-pat-bytes')
    rmSync(dir, { recursive: true, force: true })
  })

  it('sends authorization when downloading an omnimux.ai video url', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-vid-auth-'))
    const dest = join(dir, 'out.mp4')
    let downloadHeaders
    const result = await executeOmnimuxVideo({
      prompt: 'a wall at night',
      dest,
      model: 'seedance-2-5',
      operation: 'text_to_video',
      duration: 5,
      env: { OMNIMUX_API_KEY: 'sk-video-auth' },
      runtime: {
        async execute() {
          return {
            taskId: 'task-auth',
            outputs: [{ type: 'video', url: 'https://omnimux.ai/v1/videos/task-auth/content' }],
          }
        },
      },
      fetcher: async (url, init) => {
        assert.equal(String(url), 'https://omnimux.ai/v1/videos/task-auth/content')
        downloadHeaders = init?.headers
        return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => Buffer.from('mp4-auth-bytes') }
      },
    })
    assert.equal(result.mode, 'live')
    assert.equal(downloadHeaders?.authorization, 'Bearer sk-video-auth')
    assert.equal(readFileSync(dest, 'utf8'), 'mp4-auth-bytes')
    rmSync(dir, { recursive: true, force: true })
  })

  it('executes through a fake runtime and writes dest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-'))
    const dest = join(dir, 'out.mp4')
    const result = await executeOmnimuxVideo({
      prompt: 'a wall at night',
      dest,
      model: 'seedance-2-5',
      operation: 'text_to_video',
      duration: 5,
      env: { OMNIMUX_API_KEY: 'sk-test' },
      runtime: {
        async execute() {
          return {
            taskId: 'task-9',
            outputs: [{ type: 'video', url: 'https://cdn.example/out.mp4' }],
          }
        },
      },
      fetcher: async (url) => {
        assert.equal(String(url), 'https://cdn.example/out.mp4')
        return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => Buffer.from('mp4-bytes') }
      },
    })
    assert.equal(result.mode, 'live')
    assert.equal(result.taskId, 'task-9')
    assert.equal(readFileSync(dest, 'utf8'), 'mp4-bytes')
    rmSync(dir, { recursive: true, force: true })
  })

  it('wait false returns submitted without writing dest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-'))
    const dest = join(dir, 'out.mp4')
    const result = await executeOmnimuxVideo({
      prompt: 'a wall at night',
      dest,
      model: 'seedance-2-5',
      operation: 'text_to_video',
      wait: false,
      env: { OMNIMUX_API_KEY: 'sk-test' },
      duration: 5,
      runtime: {
        async execute() {
          return { taskId: 'task-wait', outputs: [] }
        },
      },
    })
    assert.equal(result.mode, 'submitted')
    assert.equal(result.taskId, 'task-wait')
    assert.equal(result.url, null)
    assert.equal(existsSync(dest), false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('resumes from taskId without submitting', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-'))
    const dest = join(dir, 'out.mp4')
    let posts = 0
    const result = await executeOmnimuxVideo({
      dest,
      taskId: 'task-7',
      env: { OMNIMUX_API_KEY: 'sk-test' },
      fetcher: async (url, init) => {
        if (init?.method === 'POST') {
          posts += 1
          return { ok: true, json: async () => ({}) }
        }
        if (String(url).includes('/video/generations/task-7')) {
          return {
            ok: true,
            json: async () => ({ status: 'completed', url: 'https://cdn.example/done.mp4' }),
          }
        }
        assert.equal(String(url), 'https://cdn.example/done.mp4')
        return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => Buffer.from('resumed') }
      },
    })
    assert.equal(posts, 0)
    assert.equal(result.mode, 'live')
    assert.equal(result.taskId, 'task-7')
    assert.equal(readFileSync(dest, 'utf8'), 'resumed')
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('mapOmnimuxInput video branch (#429)', () => {
  it('maps image references to reference_images and never emits images/references/audioTrack', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'make them dance',
      references: [
        { role: 'reference', type: 'image', pathOrUrl: 'https://example.com/ref1.png' },
        { role: 'reference', type: 'image', pathOrUrl: 'https://example.com/ref2.png' },
        { role: 'bgm', type: 'audio', pathOrUrl: 'https://example.com/bgm.mp3' },
      ],
      audioTrack: { role: 'audio_track', type: 'audio', pathOrUrl: '/local/track.mp3' },
    })
    assert.deepEqual(input.reference_images, [
      { url: 'https://example.com/ref1.png' },
      { url: 'https://example.com/ref2.png' },
    ])
    assert.equal('images' in input, false, 'video 请求绝不能携带 images 字段')
    assert.equal('references' in input, false, 'video 请求绝不能携带 references 字段')
    assert.equal('audioTrack' in input, false, 'video 请求绝不能携带 audioTrack 字段')
    assert.equal('image' in input, false, 'reference_images 与 image 不能同时出现')
    assert.equal('metadata' in input, false, 'video 请求绝不能携带 metadata 字段')
  })

  it('passes aspectRatio and resolution through as aspect_ratio/resolution', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'wide shot',
      aspectRatio: '16:9',
      resolution: '720p',
    })
    assert.equal(input.aspect_ratio, '16:9')
    assert.equal(input.resolution, '720p')
    assert.equal('metadata' in input, false)
  })

  it('uses the image field for a first_frame reference (first-frame mode)', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'animate from this frame',
      references: [
        { role: 'first_frame', type: 'image', pathOrUrl: 'https://example.com/first.png' },
        { role: 'reference', type: 'image', pathOrUrl: 'https://example.com/extra.png' },
      ],
    })
    assert.equal(input.image, 'https://example.com/first.png')
    assert.equal('image_tail' in input, false)
    assert.equal('reference_images' in input, false, 'image 与 reference_images 不能同时使用')
    assert.equal('images' in input, false)
    assert.equal('references' in input, false)
    assert.equal('metadata' in input, false)
  })

  it('maps last_frame to image_tail without entering reference_images (#566)', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'end on this frame',
      references: [
        { role: 'last_frame', type: 'image', pathOrUrl: 'https://example.com/last.png' },
      ],
    })
    assert.equal(input.image_tail, 'https://example.com/last.png')
    assert.equal('image' in input, false)
    assert.equal('reference_images' in input, false, 'last_frame 不得落入 reference_images')
    assert.equal('images' in input, false)
    assert.equal('last_frame' in input, false)
  })

  it('maps first_frame + last_frame to image + image_tail independently (#566)', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'morph first to last',
      references: [
        { role: 'first_frame', type: 'image', pathOrUrl: 'https://example.com/first.png' },
        { role: 'last_frame', type: 'image', pathOrUrl: 'https://example.com/last.png' },
        { role: 'reference', type: 'image', pathOrUrl: 'https://example.com/extra.png' },
      ],
    })
    assert.equal(input.image, 'https://example.com/first.png')
    assert.equal(input.image_tail, 'https://example.com/last.png')
    assert.equal('reference_images' in input, false, 'frame 模式不混用 reference_images')
    assert.notEqual(input.image, input.image_tail)
    assert.equal('images' in input, false)
    assert.equal('references' in input, false)
  })

  it('keeps last_frame from overwriting first_frame when both are present (#566)', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'order safety',
      references: [
        { role: 'last_frame', type: 'image', pathOrUrl: 'https://example.com/last.png' },
        { role: 'first_frame', type: 'image', pathOrUrl: 'https://example.com/first.png' },
      ],
    })
    assert.equal(input.image, 'https://example.com/first.png')
    assert.equal(input.image_tail, 'https://example.com/last.png')
  })

  it('uses request.image with only last_frame without inventing a first_frame role (#566)', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'legacy image + last',
      image: 'https://example.com/legacy-first.png',
      references: [
        { role: 'last_frame', type: 'image', pathOrUrl: 'https://example.com/last.png' },
      ],
    })
    assert.equal(input.image, 'https://example.com/legacy-first.png')
    assert.equal(input.image_tail, 'https://example.com/last.png')
    assert.equal('reference_images' in input, false)
  })

  it('ignores non-image last_frame and duplicate frame roles take first wins (#566)', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'dedupe frames',
      references: [
        { role: 'first_frame', type: 'image', pathOrUrl: 'https://example.com/first-a.png' },
        { role: 'first_frame', type: 'image', pathOrUrl: 'https://example.com/first-b.png' },
        { role: 'last_frame', type: 'audio', pathOrUrl: 'https://example.com/not-an-image.mp3' },
        { role: 'last_frame', type: 'image', pathOrUrl: 'https://example.com/last-a.png' },
        { role: 'last_frame', type: 'image', pathOrUrl: 'https://example.com/last-b.png' },
        { role: 'last_frame', type: 'image' },
      ],
    })
    assert.equal(input.image, 'https://example.com/first-a.png')
    assert.equal(input.image_tail, 'https://example.com/last-a.png')
    assert.equal('reference_images' in input, false)
  })

  it('dedupes generic reference_images by url and still excludes last_frame (#566)', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'multi ref',
      references: [
        { role: 'reference', type: 'image', pathOrUrl: 'https://example.com/a.png' },
        { role: 'reference', type: 'image', pathOrUrl: 'https://example.com/a.png' },
        { role: 'reference', type: 'image', pathOrUrl: 'https://example.com/b.png' },
        { role: 'style', type: 'image', pathOrUrl: 'https://example.com/c.png' },
        // non-image last_frame must not force frame mode or pollute multi-ref
        { role: 'last_frame', type: 'audio', pathOrUrl: 'https://example.com/tail.mp3' },
      ],
    })
    assert.deepEqual(input.reference_images, [
      { url: 'https://example.com/a.png' },
      { url: 'https://example.com/b.png' },
      { url: 'https://example.com/c.png' },
    ])
    assert.equal('image' in input, false)
    assert.equal('image_tail' in input, false)
  })

  it('executeOmnimuxVideo rejects unlisted FLF when an external caller sends bypassSubmitGuard', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-flf-'))
    const dest = join(dir, 'out.mp4')
    let vendorCalls = 0
    await assert.rejects(
      () => executeOmnimuxVideo({
        prompt: 'morph first to last',
        dest,
        model: 'kling-v3',
        operation: 'first_last_frame',
        bypassSubmitGuard: true,
        references: [
          { role: 'first_frame', type: 'image', pathOrUrl: 'https://example.com/first.png' },
          { role: 'last_frame', type: 'image', pathOrUrl: 'https://example.com/last.png' },
        ],
        env: { OMNIMUX_API_KEY: 'sk-test' },
        runtime: {
          async execute() {
            vendorCalls += 1
            return {
              taskId: 'task-flf',
              outputs: [{ type: 'video', url: 'https://cdn.example/flf.mp4' }],
            }
          },
        },
        fetcher: async (url) => {
          assert.match(String(url), /^https:\/\/example\.com\/(?:first|last)\.png$/)
          return {
            ok: true,
            headers: { get: () => 'image/png' },
            body: new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).body,
          }
        },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
    assert.equal(vendorCalls, 0, 'unlisted FLF must not reach vendor')
    rmSync(dir, { recursive: true, force: true })
  })

  it('maps image + image_tail without submitting an unchecked FLF request (#566)', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'morph first to last',
      model: 'kling-v3',
      references: [
        { role: 'first_frame', type: 'image', pathOrUrl: 'https://example.com/first.png' },
        { role: 'last_frame', type: 'image', pathOrUrl: 'https://example.com/last.png' },
        { role: 'reference', type: 'image', pathOrUrl: 'https://example.com/extra.png' },
      ],
    })
    assert.equal(input.image, 'https://example.com/first.png')
    assert.equal(input.image_tail, 'https://example.com/last.png')
    assert.equal('reference_images' in input, false)
    assert.equal('images' in input, false)
    assert.equal('references' in input, false)
  })

  it('end_frame only-last maps image_tail without inventing image (#567 M1/M2/M3)', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'end-frame only',
      model: 'minimax-h3',
      references: [
        { role: 'last_frame', type: 'image', pathOrUrl: 'https://example.com/end-only.png' },
      ],
    })
    assert.equal(input.image_tail, 'https://example.com/end-only.png')
    assert.equal('image' in input, false, 'must not invent first/image for end-only')
    assert.equal('reference_images' in input, false)
    assert.equal('images' in input, false)
    assert.equal('references' in input, false)
    assert.notEqual(input.image_tail, input.image)
  })

  it('executeOmnimuxVideo submits canonical H3 end-frame through the offline runtime', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-endframe-'))
    const dest = join(dir, 'out.mp4')
    let runtimeCalls = 0
    const result = await executeOmnimuxVideo({
      prompt: 'end frame only',
      dest,
      model: 'minimax-h3',
      operation: 'end_frame',
      references: [
        { role: 'last_frame', type: 'image', pathOrUrl: 'https://example.com/end-only.png' },
      ],
      wait: false,
      env: { OMNIMUX_API_KEY: 'sk-test' },
      runtime: {
        async execute(request) {
          runtimeCalls += 1
          assert.deepEqual(request.input.image_with_roles, [
            { url: 'https://example.com/end-only.png', role: 'last_frame' },
          ])
          return { taskId: 'task-h3-end-frame', outputs: [] }
        },
      },
      fetcher: async (url) => {
        assert.equal(String(url), 'https://example.com/end-only.png')
        return {
          ok: true,
          status: 200,
          headers: { get() { return 'image/png' } },
          body: new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).body,
        }
      },
    })
    assert.equal(result.mode, 'submitted')
    assert.equal(runtimeCalls, 1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('falls back to request.image when there are no usable references', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'talk',
      image: 'https://example.com/face.png',
      audioTrack: { role: 'audio_track', type: 'audio', pathOrUrl: '/local/track.mp3' },
    })
    assert.equal(input.image, 'https://example.com/face.png')
    assert.equal('images' in input, false)
    assert.equal('references' in input, false)
    assert.equal('audioTrack' in input, false)
    assert.equal('reference_images' in input, false)
    assert.equal('metadata' in input, false)
  })

  it('does not attach metadata even when voice/style/speech are present (#432)', () => {
    const input = mapOmnimuxInput('video', {
      prompt: '1 dog',
      duration: 5,
      aspectRatio: '16:9',
      voice: 'alloy',
      style: 'cinematic',
      speech: 'hello',
      audio: '/tmp/a.mp3',
      speed: 1,
      instrumental: false,
    })
    assert.equal(input.prompt, '1 dog')
    assert.equal(input.duration, 5)
    assert.equal(input.aspect_ratio, '16:9')
    assert.equal('metadata' in input, false)
    assert.equal('voice' in input, false)
    assert.equal('style' in input, false)
    assert.equal('speech' in input, false)
    assert.equal('audio' in input, false)
  })
})

describe('mapOmnimuxInput digital_human audioTrack passthrough (#538)', () => {
  it('keeps audioTrack for digital-human models (kling-avatar)', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'talk',
      model: 'kling-avatar',
      image: 'https://example.com/face.png',
      audioTrack: { role: 'audio_track', type: 'audio', pathOrUrl: '/local/track.mp3' },
    })
    assert.equal(input.image, 'https://example.com/face.png')
    assert.deepEqual(input.audioTrack, { role: 'audio_track', type: 'audio', pathOrUrl: '/local/track.mp3' })
    assert.equal('metadata' in input, false, 'digital_human 同样严禁 metadata（#432）')
    assert.equal('images' in input, false)
    assert.equal('references' in input, false)
  })

  it('matches the digital-human model id case-insensitively', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'talk',
      model: 'Kling-Avatar',
      audioTrack: { role: 'audio_track', type: 'audio', pathOrUrl: '/local/track.mp3' },
    })
    assert.equal(input.audioTrack.pathOrUrl, '/local/track.mp3')
  })

  it('still drops audioTrack for non-digital-human video models', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'talk',
      model: 'seedance-2-5',
      audioTrack: { role: 'audio_track', type: 'audio', pathOrUrl: '/local/track.mp3' },
    })
    assert.equal('audioTrack' in input, false)
  })

  it('keeps audioTrack for minimax-h3 only on the digital_human operation (口型版分组)', () => {
    // H3 家族以产品 id minimax-h3 进入映射（线路候选 minimax-h3-lip-sync 在更下游替换），
    // 透传由操作 id 判定：对口型放行驱动音频，普通 H3 视频操作仍严禁携带（#429）。
    const kept = mapOmnimuxInput('video', {
      model: 'minimax-h3',
      operation: 'digital_human',
      image: 'https://example.com/face.png',
      audioTrack: { role: 'audio_track', type: 'audio', pathOrUrl: '/local/track.mp3' },
    })
    assert.deepEqual(kept.audioTrack, { role: 'audio_track', type: 'audio', pathOrUrl: '/local/track.mp3' })
    const dropped = mapOmnimuxInput('video', {
      prompt: 'talk',
      model: 'minimax-h3',
      operation: 'first_frame',
      audioTrack: { role: 'audio_track', type: 'audio', pathOrUrl: '/local/track.mp3' },
    })
    assert.equal('audioTrack' in dropped, false)
  })

  it('drops an audioTrack without pathOrUrl even for digital-human models', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'talk',
      model: 'kling-avatar',
      audioTrack: { role: 'audio_track', type: 'audio' },
    })
    assert.equal('audioTrack' in input, false)
  })

  it('executeOmnimuxVideo rejects draft kling-avatar even when seam can carry audioTrack (#468)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-avatar-'))
    const dest = join(dir, 'out.mp4')
    let vendorCalls = 0
    await assert.rejects(
      () => executeOmnimuxVideo({
        prompt: 'speak',
        dest,
        model: 'kling-avatar',
        operation: 'digital_human',
        image: 'https://example.com/face.png',
        audioTrack: { role: 'audio_track', type: 'audio', pathOrUrl: '/local/voice.mp3' },
        env: { OMNIMUX_API_KEY: 'sk-test' },
        runtime: {
          async execute() {
            vendorCalls += 1
            return {
              taskId: 'task-avatar',
              outputs: [{ type: 'video', url: 'https://cdn.example/avatar.mp4' }],
            }
          },
        },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
    assert.equal(vendorCalls, 0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('maps kling-avatar audioTrack without submitting an unchecked draft request (#538)', () => {
    const input = mapOmnimuxInput('video', {
      prompt: 'speak',
      model: 'kling-avatar',
      image: 'https://example.com/face.png',
      audioTrack: { role: 'audio_track', type: 'audio', pathOrUrl: '/local/voice.mp3' },
    })
    assert.equal(input.image, 'https://example.com/face.png')
    assert.deepEqual(input.audioTrack, {
      role: 'audio_track',
      type: 'audio',
      pathOrUrl: '/local/voice.mp3',
    })
  })

  it('executeOmnimuxVideo keeps dropping audioTrack for a generic video model', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-avatar-guard-'))
    const dest = join(dir, 'out.mp4')
    let capturedReq
    await executeOmnimuxVideo({
      prompt: 'speak',
      dest,
      model: 'seedance-2-5',
      operation: 'text_to_video',
      duration: 5,
      env: { OMNIMUX_API_KEY: 'sk-test' },
      runtime: {
        async execute(req) {
          capturedReq = req
          return {
            taskId: 'task-generic',
            outputs: [{ type: 'video', url: 'https://cdn.example/generic.mp4' }],
          }
        },
      },
      fetcher: async () => ({ ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => Buffer.from('mp4-generic') }),
    })
    assert.equal('audioTrack' in capturedReq.input, false)
    rmSync(dir, { recursive: true, force: true })
  })
})
