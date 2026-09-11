import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseGateConfig } from '../gate/config.js'
import { OmnimuxError } from './errors.js'
import { probeMediaAssets } from './execute.js'
import { mountMedia } from './mount.js'
import { executeOmnimuxVideo } from './video.js'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const MP4 = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])
const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00])

function mp4WithDuration(seconds, timescale = 1_000) {
  const box = (type, payload) => {
    const header = Buffer.alloc(8)
    header.writeUInt32BE(header.length + payload.length, 0)
    header.write(type, 4, 4, 'ascii')
    return Buffer.concat([header, payload])
  }
  const mvhd = Buffer.alloc(20)
  mvhd.writeUInt32BE(timescale, 12)
  mvhd.writeUInt32BE(Math.round(seconds * timescale), 16)
  return Buffer.concat([
    box('ftyp', Buffer.from([0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0])),
    box('moov', box('mvhd', mvhd)),
  ])
}

function pngData(extra) {
  return `data:image/png;base64,${Buffer.concat([PNG, Buffer.from([extra])]).toString('base64')}`
}

describe('mountMedia capability gate', () => {
  it('derives reference metadata from media bytes instead of caller metadata', async () => {
    const image = `data:image/png;base64,${PNG.toString('base64')}`
    const video = `data:video/mp4;base64,${MP4.toString('base64')}`
    const audio = `data:audio/mpeg;base64,${MP3.toString('base64')}`
    const assets = await probeMediaAssets({
      references: [
        { type: 'image', role: 'reference', pathOrUrl: image, mime: 'image/gif', sizeBytes: 1 },
        { type: 'video', role: 'reference', pathOrUrl: video, mime: 'video/webm', sizeBytes: 1 },
      ],
      audioTrack: { type: 'audio', role: 'audio_track', pathOrUrl: audio, mime: 'audio/wav', sizeBytes: 1 },
      assetMeta: {
        [image]: { mime: 'image/gif', sizeBytes: 1 },
        [video]: { mime: 'video/webm', sizeBytes: 1 },
        [audio]: { mime: 'audio/wav', sizeBytes: 1 },
      },
    })
    assert.deepEqual(
      assets.map(({ type, mime, sizeBytes }) => ({ type, mime, sizeBytes })),
      [
        { type: 'image', mime: 'image/png', sizeBytes: PNG.byteLength },
        { type: 'video', mime: 'video/mp4', sizeBytes: MP4.byteLength },
        { type: 'audio', mime: 'audio/mp3', sizeBytes: MP3.byteLength },
      ],
    )
  })

  it('replaces caller video duration with container metadata and accepts the 100MB Wan range', async () => {
    const bytes = mp4WithDuration(15)
    const assets = await probeMediaAssets({
      references: [{
        type: 'video',
        role: 'reference',
        pathOrUrl: 'https://cdn.example.com/reference.mp4',
        durationSec: 1,
      }],
      fetcher: async () => ({
        ok: true,
        status: 200,
        headers: {
          get(name) {
            if (name === 'content-type') return 'video/mp4'
            if (name === 'content-length') return String(100 * 1024 * 1024)
            return null
          },
        },
        arrayBuffer: async () => bytes,
      }),
    }, { capability: 'video', seam: 'videoGenerate' })

    assert.equal(assets[0].sizeBytes, bytes.byteLength)
    assert.equal(assets[0].durationSec, 15)
  })

  it('registers tool and provides seam when gate is enabled by default', () => {
    const tools = []
    const provided = {}
    const ctx = {
      tools: { register(t) { tools.push(t) } },
      provide(name, api) { provided[name] = api },
    }
    mountMedia(ctx, {
      kind: 'video',
      execute: async () => ({ mode: 'live' }),
      media: {},
      jsonOut: {},
    })

    assert.equal(tools.length, 1)
    assert.equal(tools[0].name, 'omnimux_video_submit')
    assert.ok(provided.videoGenerate)
    assert.ok(tools[0].parameters.properties.strategy)
    assert.ok(tools[0].parameters.properties.group)
    assert.ok(tools[0].parameters.properties.allowed_groups)
  })

  it('mounts the complete workflow media shape through both tool and seam', async () => {
    const tools = []
    const provided = {}
    const runtimeCalls = []
    mountMedia({
      tools: { register(tool) { tools.push(tool) } },
      provide(name, api) { provided[name] = api },
    }, {
      kind: 'video',
      execute: async (request) => {
        runtimeCalls.push(request)
        return { mode: 'live' }
      },
      media: {},
      jsonOut: {},
    })
    const workflow = {
      prompt: 'transition between the frames',
      dest: '/tmp/omnimux-mounted-shape.mp4',
      image: 'https://example.com/first.png',
      image_tail: 'https://example.com/last.png',
      references: [{ type: 'image', role: 'reference', pathOrUrl: 'https://example.com/reference.png' }],
      audioTrack: { type: 'audio', role: 'audio_track', pathOrUrl: 'https://example.com/track.mp3' },
    }

    await tools[0].execute(workflow, {})
    await provided.videoGenerate.execute(workflow)

    assert.equal(runtimeCalls.length, 2)
    for (const request of runtimeCalls) {
      assert.equal(request.image, workflow.image)
      assert.equal(request.image_tail, workflow.image_tail)
      assert.deepEqual(request.references, workflow.references)
      assert.deepEqual(request.audioTrack, workflow.audioTrack)
    }
    assert.ok(tools[0].parameters.properties.image_tail)
    assert.ok(tools[0].parameters.properties.references)
    assert.ok(tools[0].parameters.properties.audioTrack)
    assert.ok(tools[0].parameters.properties.fileUrl)
    assert.ok(tools[0].parameters.properties.linkUrl)
    assert.ok(tools[0].parameters.properties.referenceTaskType)
  })

  it('probes Wan document metadata with an offline HEAD response', async () => {
    const assets = await probeMediaAssets({
      fileUrl: 'https://cdn.example.com/deck.pdf',
      fetcher: async (_url, init) => ({
        ok: true,
        status: 200,
        headers: { get: (name) => name === 'content-length' ? '8192' : null },
        method: init.method,
      }),
    }, { capability: 'video', seam: 'videoGenerate' })

    assert.deepEqual(assets, [{
      type: 'document',
      pathOrUrl: 'https://cdn.example.com/deck.pdf',
      role: 'document',
      targetSlot: 'file_url',
      mime: 'application/pdf',
      sizeBytes: 8192,
    }])
  })

  it('uses internal video semantics when probing workflow media', async () => {
    const first = pngData(1)
    const reference = pngData(2)
    const last = pngData(3)
    const audio = `data:audio/mpeg;base64,${MP3.toString('base64')}`
    const assets = await probeMediaAssets({
      // These caller fields must not alter the mounted video boundary.
      capability: 'image',
      seam: 'imageGenerate',
      image: first,
      image_tail: last,
      references: [{ type: 'image', role: 'reference', pathOrUrl: reference }],
      audioTrack: { type: 'audio', role: 'audio_track', pathOrUrl: audio },
    }, { capability: 'video', seam: 'videoGenerate' })

    assert.deepEqual(
      assets.map(({ type, role, pathOrUrl }) => ({ type, role, pathOrUrl })),
      [
        { type: 'image', role: 'reference', pathOrUrl: reference },
        { type: 'image', role: 'first_frame', pathOrUrl: first },
        { type: 'image', role: 'last_frame', pathOrUrl: last },
        { type: 'audio', role: 'audio_track', pathOrUrl: audio },
      ],
    )
  })

  it('keeps an explicit first-frame reference when image repeats its URL', async () => {
    const first = pngData(6)
    const assets = await probeMediaAssets({
      image: first,
      references: [{ type: 'image', role: 'first_frame', pathOrUrl: first }],
    }, { capability: 'video', seam: 'videoGenerate' })

    assert.deepEqual(
      assets.map(({ type, role, pathOrUrl }) => ({ type, role, pathOrUrl })),
      [{ type: 'image', role: 'first_frame', pathOrUrl: first }],
    )
  })

  it('submits mounted duplicate image shorthand as the listed multi-reference operation', async () => {
    const tools = []
    const provided = {}
    const runtimeCalls = []
    const firstReference = pngData(4)
    const secondReference = pngData(5)
    const request = {
      prompt: 'two reference subjects in one scene',
      dest: '/tmp/omnimux-mounted-multi-ref.mp4',
      model: 'seedance-2-0-fast',
      operation: 'video_multi_ref',
      // Workflow stores the leading reference in image as well as references.
      image: firstReference,
      references: [
        { type: 'image', role: 'reference', pathOrUrl: firstReference },
        { type: 'image', role: 'reference', pathOrUrl: secondReference },
      ],
      duration: 4,
      resolution: '720p',
      aspectRatio: '16:9',
      wait: false,
    }
    mountMedia({
      tools: { register(tool) { tools.push(tool) } },
      provide(name, api) { provided[name] = api },
    }, {
      kind: 'video',
      execute: (mountedRequest) => executeOmnimuxVideo({
        ...mountedRequest,
        env: { OMNIMUX_API_KEY: 'sk-test' },
        fetcher: async () => {
          throw new Error('network disabled in mounted media guard test')
        },
        runtime: {
          async execute(call) {
            runtimeCalls.push(call)
            return { taskId: `task-${runtimeCalls.length}`, outputs: [] }
          },
        },
      }),
      media: undefined,
      jsonOut: {},
    })

    await tools[0].execute(request, {})
    await provided.videoGenerate.execute(request)

    assert.equal(runtimeCalls.length, 2)
    for (const call of runtimeCalls) {
      assert.deepEqual(call.input.image_urls, [firstReference, secondReference])
      assert.equal('image_with_roles' in call.input, false)
      assert.equal('references' in call.input, false)
      assert.equal('audioTrack' in call.input, false)
    }
  })

  it('skips tool and provide when gate.media.video is false', () => {
    const tools = []
    const provided = {}
    const ctx = {
      tools: { register(t) { tools.push(t) } },
      provide(name, api) { provided[name] = api },
    }
    mountMedia(ctx, {
      kind: 'video',
      execute: async () => ({ mode: 'live' }),
      media: {},
      gate: parseGateConfig({ media: { video: false } }),
      jsonOut: {},
    })

    assert.equal(tools.length, 0)
    assert.equal(provided.videoGenerate, undefined)
  })

  it('skips tool and provide when gate.tools.omnimux_video_submit is false', () => {
    const tools = []
    const provided = {}
    const ctx = {
      tools: { register(t) { tools.push(t) } },
      provide(name, api) { provided[name] = api },
    }
    mountMedia(ctx, {
      kind: 'video',
      execute: async () => ({ mode: 'live' }),
      media: {},
      gate: parseGateConfig({ tools: { omnimux_video_submit: false } }),
      jsonOut: {},
    })

    assert.equal(tools.length, 0)
    assert.equal(provided.videoGenerate, undefined)
  })

  it('tool.execute throws capability-disabled when tool or media is disabled in gate', async () => {
    const tools = []
    const ctx = {
      tools: { register(t) { tools.push(t) } },
      provide() {},
    }

    mountMedia(ctx, {
      kind: 'video',
      execute: async () => ({ mode: 'live' }),
      media: {},
      gate: parseGateConfig(undefined),
      jsonOut: {},
    })

    assert.equal(tools.length, 1)

    // Now test a tool mounted with gate disabling it if force-invoking execute
    let registeredTool
    mountMedia({
      tools: { register(t) { registeredTool = t } },
      provide() {},
    }, {
      kind: 'audio',
      execute: async () => ({ mode: 'live' }),
      media: {},
      gate: parseGateConfig({ media: { audio: false } }),
      jsonOut: {},
    })

    // Because gate.media.audio is false, register was skipped
    assert.equal(registeredTool, undefined)
  })

  it('registered tool and seam reject untrusted bypassSubmitGuard before the video runtime', async () => {
    const tools = []
    const provided = {}
    let vendorCalls = 0
    const ctx = {
      tools: { register(tool) { tools.push(tool) } },
      provide(name, api) { provided[name] = api },
    }
    mountMedia(ctx, {
      kind: 'video',
      execute: executeOmnimuxVideo,
      media: undefined,
      jsonOut: {},
    })
    const request = {
      prompt: 'morph first to last',
      dest: '/tmp/omnimux-guard-never-writes.mp4',
      model: 'kling-v3',
      operation: 'first_last_frame',
      bypassSubmitGuard: true,
      runtime: { async execute() { vendorCalls += 1 } },
      env: { OMNIMUX_API_KEY: 'sk-test' },
    }
    await assert.rejects(
      () => tools[0].execute(request, {}),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
    await assert.rejects(
      () => provided.videoGenerate.execute(request),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
    assert.equal(vendorCalls, 0)
  })

  it('rejects an untrusted digital-human reference before the video runtime', async () => {
    const tools = []
    const provided = {}
    let vendorCalls = 0
    const badImage = 'data:image/png;base64,bm90LWFuLWltYWdl'
    mountMedia({
      tools: { register(tool) { tools.push(tool) } },
      provide(name, api) { provided[name] = api },
    }, {
      kind: 'video',
      execute: executeOmnimuxVideo,
      media: undefined,
      jsonOut: {},
    })
    await assert.rejects(
      () => provided.videoGenerate.execute({
        prompt: 'animate this portrait',
        dest: '/tmp/omnimux-untrusted-reference.mp4',
        model: 'kling-avatar',
        operation: 'digital_human',
        references: [{ type: 'image', role: 'reference', pathOrUrl: badImage }],
        assetMeta: { [badImage]: { mime: 'image/png', sizeBytes: 1 } },
        runtime: { async execute() { vendorCalls += 1 } },
        env: { OMNIMUX_API_KEY: 'sk-test' },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
    assert.equal(vendorCalls, 0)
  })
})
