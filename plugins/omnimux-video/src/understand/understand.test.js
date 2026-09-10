import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { apply } from '../index.js'
import { parseVideoConfig } from '../config.js'
import { VideoError } from '../errors.js'
import { executeVideoAnalyze } from './analyze.js'
import { assertLocalVideo } from './pack-video.js'
import { loadPromptFile, BUNDLED_ANALYZE_PROMPT, BUNDLED_REVERSE_PROMPT } from './prompts.js'
import {
  buildReverseUserText,
  executeVideoReversePrompt,
  resolveIdentityMode,
} from './reverse.js'

const UNDERSTAND = parseVideoConfig(undefined).understand

function tinyMp4(dir) {
  const dest = join(dir, 'clip.mp4')
  // Enough bytes for path checks; hub mock never reads content.
  writeFileSync(dest, Buffer.from('ftypisomfake-mp4-bytes'))
  return dest
}

describe('understand prompts + pack', () => {
  it('loads bundled analyze and reverse prompts', async () => {
    const a = await loadPromptFile('', BUNDLED_ANALYZE_PROMPT)
    const r = await loadPromptFile('', BUNDLED_REVERSE_PROMPT)
    assert.match(a.text, /五维度|5-Dimension|核心目标/)
    assert.match(r.text, /<<<PROMPT>>>/)
    assert.match(r.text, /禁止人物口播/)
  })

  it('rejects relative video paths', async () => {
    await assert.rejects(
      () => assertLocalVideo('rel/clip.mp4'),
      (error) => error instanceof VideoError && error.code === 'video-invalid-input',
    )
  })

  it('accepts absolute mp4 under byte cap', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-video-u-'))
    try {
      const path = tinyMp4(dir)
      const packed = await assertLocalVideo(path, { maxVideoBytes: 1024 })
      assert.equal(packed.kind, 'path')
      assert.equal(packed.video, path)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('video_analyze', () => {
  it('calls textComplete with system+video and writes dest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-video-a-'))
    const video = tinyMp4(dir)
    const dest = join(dir, 'out.md')
    const seen = []
    try {
      const result = await executeVideoAnalyze({
        video,
        dest,
        understand: UNDERSTAND,
        textComplete: {
          async execute(req) {
            seen.push(req)
            return {
              mode: 'live',
              model: 'gemini-3.8-flash',
              text: '## 一句话视频描述\n红底短片。\n## I. 核心目标 (Global Goal)\n测试',
            }
          },
        },
      })
      assert.equal(result.kind, 'analyze')
      assert.equal(result.dest, dest)
      assert.match(result.text, /一句话视频描述/)
      assert.equal(seen.length, 1)
      assert.equal(seen[0].video, video)
      assert.equal(seen[0].model, 'gemini-3.8-flash')
      assert.match(seen[0].system, /五维度|5-Dimension|核心目标/)
      assert.match(readFileSync(dest, 'utf8'), /核心目标/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('maps missing textComplete to needs-provider', async () => {
    await assert.rejects(
      () => executeVideoAnalyze({ video: '/tmp/x.mp4', understand: UNDERSTAND }),
      (error) => error instanceof VideoError && error.code === 'needs-provider',
    )
  })

  it('maps hub video-unsupported to video-understand-unsupported', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-video-a2-'))
    try {
      const video = tinyMp4(dir)
      await assert.rejects(
        () => executeVideoAnalyze({
          video,
          understand: UNDERSTAND,
          textComplete: {
            async execute() {
              const err = new Error("model 'grok-4.6' does not accept video input")
              err.code = 'omnimux-invalid-request'
              throw err
            },
          },
        }),
        (error) => error instanceof VideoError && error.code === 'video-understand-unsupported',
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('video_reverse_prompt', () => {
  it('resolves identity modes A/B/C', () => {
    assert.equal(resolveIdentityMode('A'), 'character_lock_upload_image')
    assert.equal(resolveIdentityMode('B'), 'describe_anonymous')
    assert.equal(resolveIdentityMode('C'), 'structure_only')
  })

  it('builds user text with silent constraints', () => {
    const text = buildReverseUserText({
      videoPath: '/tmp/a.mp4',
      identityMode: 'character_lock_upload_image',
      duration: 5,
      aspect: '9:16',
    })
    assert.match(text, /静默硬约束/)
    assert.match(text, /identity_mode: character_lock_upload_image/)
    assert.match(text, /<<<PROMPT>>>/)
  })

  it('parses tagged output and writes dest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-video-r-'))
    const video = tinyMp4(dir)
    const dest = join(dir, 'prompt.txt')
    const appendixDest = join(dir, 'appendix.txt')
    try {
      const result = await executeVideoReversePrompt({
        video,
        dest,
        appendixDest,
        identityMode: 'A',
        understand: UNDERSTAND,
        textComplete: {
          async execute() {
            return {
              mode: 'live',
              model: 'gemini-3.8-flash',
              text: [
                '<<<PROMPT>>>',
                '以参考图像锁定外观，生成5秒9:16；人物全程不说话、禁止口播对白。',
                '<<<END_PROMPT>>>',
                '<<<APPENDIX>>>',
                '1) 节拍表',
                '<<<END_APPENDIX>>>',
              ].join('\n'),
            }
          },
        },
      })
      assert.equal(result.parsed, true)
      assert.equal(result.identityMode, 'character_lock_upload_image')
      assert.match(result.prompt, /禁止口播对白/)
      assert.match(readFileSync(dest, 'utf8'), /禁止口播对白/)
      assert.match(readFileSync(appendixDest, 'utf8'), /节拍表/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps parsed false when tags missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-video-r2-'))
    try {
      const video = tinyMp4(dir)
      const result = await executeVideoReversePrompt({
        video,
        understand: UNDERSTAND,
        textComplete: {
          async execute() {
            return { text: 'fallback body with 禁止口播对白' }
          },
        },
      })
      assert.equal(result.parsed, false)
      assert.match(result.prompt, /禁止口播对白/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('tool registration', () => {
  it('registers process + understand + depth tools and does not mix understand into slug enum', () => {
    const tools = {}
    apply({
      tools: { register(tool) { tools[tool.name] = tool } },
      provide() {},
      get() { return undefined },
    })
    assert.ok(tools.video_process)
    assert.ok(tools.video_analyze)
    assert.ok(tools.video_reverse_prompt)
    assert.ok(tools.video_depth)
    assert.equal(tools.video_process.parameters.properties.capability.enum.includes('video_analyze'), false)
    assert.ok(tools.video_process.parameters.properties.capability.enum.includes('video_depth'))
    assert.ok(tools.video_reverse_prompt.parameters.properties.identity_mode.enum.includes('A'))
  })
})
