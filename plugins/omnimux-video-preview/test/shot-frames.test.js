import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  representativeShotTimeSeconds,
  shotFrameFilename,
  attachShotFrames,
  saveVideoBreakdownArtifacts,
  formatShotsCopyText,
} from '../src/breakdown.js'
import { apply } from '../src/index.js'
import { createTestToolContext } from '../../omnimux/src/test-support/tool-harness.js'
import { refreshBreakdownMedia } from '../src/refresh-breakdown-media.js'

const JPEG_STUB = Buffer.alloc(600, 0xff)

let signingHome
let previousHome
before(() => {
  previousHome = process.env.DSH_HOME
  signingHome = mkdtempSync(join(tmpdir(), 'shot-frames-signing-'))
  process.env.DSH_HOME = signingHome
})
after(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  if (signingHome) rmSync(signingHome, { recursive: true, force: true })
})

describe('video breakdown shot frames', () => {
  it('picks the midpoint of a shot interval', () => {
    assert.equal(representativeShotTimeSeconds({ start_seconds: 0, end_seconds: 3 }), 1.5)
    assert.equal(representativeShotTimeSeconds({ start_seconds: 3, end_seconds: 7 }), 5)
    assert.equal(representativeShotTimeSeconds({ start_seconds: 0 }), 0)
  })

  it('sanitizes shot frame filenames', () => {
    assert.equal(shotFrameFilename('shot_1', 0), 'shot_1.jpg')
    assert.equal(shotFrameFilename('shot 2/../x', 1), 'shot_2_x.jpg')
    assert.equal(shotFrameFilename('', 3), 'shot_4.jpg')
  })

  it('attaches one still per shot and strips local_video_path on save', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shot-frames-attach-'))
    const videoPath = join(dir, 'clip.mp4')
    writeFileSync(videoPath, 'fake-video')
    const destPrefix = join(dir, 'analysis')
    const data = {
      is_video_breakdown: true,
      local_video_path: videoPath,
      video: { title: 't' },
      shots: [
        { id: 'shot_1', start_seconds: 0, end_seconds: 3, title: '钩子' },
        { id: 'shot_2', start_seconds: 3, end_seconds: 7, title: '展示' },
      ],
    }
    const times = []
    const attached = await attachShotFrames(data, {
      basePath: destPrefix,
      extractFrame: async (_video, timeSeconds, destPath) => {
        times.push(timeSeconds)
        mkdirSync(join(destPath, '..'), { recursive: true })
        writeFileSync(destPath, JPEG_STUB)
        return true
      },
    })
    assert.equal(attached, 2)
    assert.deepEqual(times, [1.5, 5])
    assert.ok(existsSync(data.shots[0].frame_path))
    assert.match(data.shots[0].frame_url, /^\/omnimux\/video-preview\/stream\?grant=/)
    assert.equal(data.shots[0].frame_file, 'shot_1.jpg')

    const { dataPath } = saveVideoBreakdownArtifacts(data, destPrefix)
    const saved = JSON.parse(readFileSync(dataPath, 'utf8'))
    assert.equal(saved.local_video_path, undefined)
    assert.equal(saved.shots[0].frame_path, data.shots[0].frame_path)
    assert.match(formatShotsCopyText(data.shots), /画面：/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('skips frames when there is no local video and does not fail a shot extract error', async () => {
    const none = await attachShotFrames({ shots: [{ id: 'shot_1', start_seconds: 0, end_seconds: 1 }] })
    assert.equal(none, 0)

    const dir = mkdtempSync(join(tmpdir(), 'shot-frames-skip-'))
    const videoPath = join(dir, 'clip.mp4')
    writeFileSync(videoPath, 'fake-video')
    const data = {
      local_video_path: videoPath,
      shots: [
        { id: 'shot_1', start_seconds: 0, end_seconds: 2 },
        { id: 'shot_2', start_seconds: 2, end_seconds: 4 },
      ],
    }
    const attached = await attachShotFrames(data, {
      basePath: join(dir, 'analysis'),
      extractFrame: async (_video, timeSeconds, destPath) => {
        if (timeSeconds < 2) return false
        writeFileSync(destPath, JPEG_STUB)
        return true
      },
    })
    assert.equal(attached, 1)
    assert.equal(data.shots[0].frame_path, undefined)
    assert.ok(data.shots[1].frame_path)
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns shot_frames from video_breakdown_analyze when frames attach', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shot-frames-tool-'))
    const videoPath = join(dir, 'clip.mp4')
    writeFileSync(videoPath, 'fake-video')
    const destPrefix = join(dir, 'out')
    const toolHarness = createTestToolContext()

    const mockReport = `## 1. 叙事结构链路 (Narrative Pipeline)
Hook → Product Intro

## 2. 结构阶段解构 (Stage Breakdown)
### Hook
开场展示

### Product Intro
核心展示

## 3. 逐镜头分镜脚本表 (Shot Breakdown Table)
| 时间跨度 | 分镜标题 | 所属阶段 | 镜头属性标签 | 画面与动作描述 |
| :--- | :--- | :--- | :--- | :--- |
| 0:00 - 0:02 | 开场 | Hook | 特写, 平视 | 动作展示 |
| 0:02 - 0:04 | 展示 | Product Intro | 特写, 平视 | 细节展示 |`

    const mockCtx = {
      tools: {
        register: (tool) => toolHarness.ctx.tools.register(tool),
        get: () => null,
      },
      textComplete: {
        execute: async () => ({ mode: 'live', text: mockReport }),
      },
      get: (name) => {
        if (name === 'textComplete') return mockCtx.textComplete
        return null
      },
      inject: (deps, callback) => {
        callback({
          betterSidebar: null,
          textComplete: mockCtx.textComplete,
        })
      },
    }
    apply(mockCtx)
    const tool = toolHarness.tools.get('video_breakdown_analyze')

    const result = await tool.execute({
      url: videoPath,
      dest: destPrefix,
      auto_open: false,
    })
    assert.equal(result.success, true)
    assert.ok(Array.isArray(result.shot_frames))
    assert.equal(result.frames_attached, 0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('refreshes shot frame stream grants from explicit frame_path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shot-frames-refresh-'))
    const frame = join(dir, 'shot_1.jpg')
    writeFileSync(frame, Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...JPEG_STUB]))
    const doc = join(dir, 'saved.vbreakdown')
    writeFileSync(doc, JSON.stringify({
      is_video_breakdown: true,
      shots: [{ id: 'shot_1', speech: 'hi', frame_path: frame, frame_url: '' }],
      structure: [],
      video: { stream_url: '' },
    }))
    const out = refreshBreakdownMedia(doc, [frame])
    assert.equal(out.refreshed, 1)
    const updated = JSON.parse(readFileSync(doc, 'utf8'))
    assert.match(updated.shots[0].frame_url, /\?grant=/)
    rmSync(dir, { recursive: true, force: true })
  })
})
