import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  prepareAnalysisSampleVideo,
  buildBreakdownFailureGuidance,
  extractVideoBreakdown,
} from '../src/breakdown/analyzerPipeline.js'

const MIB = 1024 * 1024
const SAMPLE_LIMIT_BYTES = 20 * MIB

/**
 * Build a minimal MP4 (ftyp + moov/mvhd + mdat) carrying a known mvhd duration.
 * @param {number} seconds
 * @param {number} [timescale]
 * @returns {Buffer}
 */
function buildMp4WithDuration(seconds, timescale = 1000) {
  const ftyp = Buffer.alloc(24)
  ftyp.writeUInt32BE(24, 0)
  ftyp.write('ftyp', 4, 'ascii')
  ftyp.write('isom', 8, 'ascii')
  ftyp.writeUInt32BE(0x200, 12)
  ftyp.write('isom', 16, 'ascii')
  ftyp.write('iso2', 20, 'ascii')

  const mvhdPayloadSize = 108
  const mvhd = Buffer.alloc(8 + mvhdPayloadSize)
  mvhd.writeUInt32BE(8 + mvhdPayloadSize, 0)
  mvhd.write('mvhd', 4, 'ascii')
  // version 0 layout: timescale @ payload+12, duration @ payload+16
  mvhd.writeUInt32BE(timescale, 8 + 12)
  mvhd.writeUInt32BE(Math.round(seconds * timescale), 8 + 16)

  const moov = Buffer.alloc(8)
  moov.writeUInt32BE(8 + mvhd.length, 0)
  moov.write('moov', 4, 'ascii')

  const mdat = Buffer.alloc(8)
  mdat.writeUInt32BE(8, 0)
  mdat.write('mdat', 4, 'ascii')

  return Buffer.concat([ftyp, moov, mvhd, mdat])
}

function makeMockCtx(text) {
  const ctx = {
    textComplete: { execute: async () => ({ mode: 'live', text }) },
    get: (n) => (n === 'textComplete' ? ctx.textComplete : null),
  }
  return ctx
}

describe('AC-1 prepareAnalysisSampleVideo 阶梯提质保音', () => {
  it('returns original path for <= 20MiB input without invoking ffmpeg', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sample-small-'))
    const video = join(dir, 'small.mp4')
    writeFileSync(video, Buffer.alloc(1024))

    const calls = []
    const out = prepareAnalysisSampleVideo(video, {
      execFileSync: (...args) => calls.push(args),
    })
    assert.equal(out, video)
    assert.equal(calls.length, 0)

    rmSync(dir, { recursive: true, force: true })
  })

  it('reuses an existing <= 20MiB sample without invoking ffmpeg', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sample-reuse-'))
    const video = join(dir, 'clip.mp4')
    const sample = join(dir, 'clip_sample.mp4')
    writeFileSync(video, Buffer.alloc(SAMPLE_LIMIT_BYTES + 8))
    writeFileSync(sample, Buffer.alloc(1024))

    const calls = []
    const out = prepareAnalysisSampleVideo(video, {
      execFileSync: (...args) => calls.push(args),
    })
    assert.equal(out, sample)
    assert.equal(calls.length, 0)

    rmSync(dir, { recursive: true, force: true })
  })

  it('uses tier-1 args with audio track (no -an, aac audio) for > 20MiB input', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sample-tier1-'))
    const video = join(dir, 'big.mp4')
    writeFileSync(video, Buffer.alloc(SAMPLE_LIMIT_BYTES + 8))

    const calls = []
    const execFileSync = (cmd, args) => {
      calls.push(args)
      writeFileSync(args[args.length - 1], Buffer.alloc(4 * MIB))
    }
    const out = prepareAnalysisSampleVideo(video, { execFileSync })

    assert.equal(calls.length, 1)
    const args = calls[0]
    assert.ok(args.includes('fps=1,scale=720:-2'))
    assert.ok(args.includes('-crf'))
    assert.equal(args[args.indexOf('-crf') + 1], '28')
    assert.ok(args.includes('-c:a'))
    assert.equal(args[args.indexOf('-c:a') + 1], 'aac')
    assert.ok(!args.includes('-an'), 'must not strip audio track')
    assert.equal(out, join(dir, 'big_sample.mp4'))

    rmSync(dir, { recursive: true, force: true })
  })

  it('deletes oversized tier-1 sample and retries with tier-2 args', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sample-tier2-'))
    const video = join(dir, 'big.mp4')
    writeFileSync(video, Buffer.alloc(SAMPLE_LIMIT_BYTES + 8))

    const calls = []
    const execFileSync = (cmd, args) => {
      calls.push(args)
      const size = calls.length === 1 ? SAMPLE_LIMIT_BYTES + 4 : 3 * MIB
      writeFileSync(args[args.length - 1], Buffer.alloc(size))
    }
    const out = prepareAnalysisSampleVideo(video, { execFileSync })

    assert.equal(calls.length, 2)
    const tier2 = calls[1]
    assert.ok(tier2.includes('fps=1/2,scale=480:-2'))
    assert.equal(tier2[tier2.indexOf('-crf') + 1], '32')
    assert.ok(tier2.includes('-c:a'))
    assert.ok(!tier2.includes('-an'))
    assert.equal(out, join(dir, 'big_sample.mp4'))
    assert.ok(statSync(out).size <= SAMPLE_LIMIT_BYTES)

    rmSync(dir, { recursive: true, force: true })
  })

  it('throws Chinese guidance (no silent original-path fallback) when every tier stays oversized', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sample-still-big-'))
    const video = join(dir, 'huge.mp4')
    writeFileSync(video, Buffer.alloc(SAMPLE_LIMIT_BYTES + 8))

    const execFileSync = (cmd, args) => {
      writeFileSync(args[args.length - 1], Buffer.alloc(SAMPLE_LIMIT_BYTES + 4))
    }
    assert.throws(
      () => prepareAnalysisSampleVideo(video, { execFileSync }),
      /请截取视频片段/,
    )
    assert.equal(existsSync(join(dir, 'huge_sample.mp4')), false, 'oversized sample must be deleted')

    rmSync(dir, { recursive: true, force: true })
  })

  it('throws Chinese guidance when ffmpeg is unavailable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sample-noffmpeg-'))
    const video = join(dir, 'big.mp4')
    writeFileSync(video, Buffer.alloc(SAMPLE_LIMIT_BYTES + 8))

    const execFileSync = () => {
      throw new Error('spawn ffmpeg ENOENT')
    }
    assert.throws(
      () => prepareAnalysisSampleVideo(video, { execFileSync }),
      /样片生成失败|请截取视频片段/,
    )

    rmSync(dir, { recursive: true, force: true })
  })
})

describe('AC-2 零分镜失败诊断落盘', () => {
  it('persists raw model response to <name>.breakdown-failed.md and appends the saved path to guidance', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'diag-dump-'))
    const video = join(dir, 'interview.mp4')
    writeFileSync(video, Buffer.alloc(4096))
    const rawReport = '这是一段没有任何表格的模型原始输出，本应被落盘诊断。'

    let message = ''
    try {
      await extractVideoBreakdown(video, { ctx: makeMockCtx(rawReport) })
      assert.fail('should throw')
    } catch (err) {
      message = err.message
    }

    const diagPath = join(dir, 'interview.breakdown-failed.md')
    assert.ok(existsSync(diagPath), 'diagnostic dump file must exist')
    assert.equal(readFileSync(diagPath, 'utf8'), rawReport)
    assert.match(message, /诊断原始响应已保存至:/)
    assert.ok(message.includes('interview.breakdown-failed.md'))
    assert.match(message, /多模态模型未解析出有效分镜/)
    assert.match(message, /模型返回了非结构化文本/)

    rmSync(dir, { recursive: true, force: true })
  })

  it('classifies failureReason: empty response / table without valid shots / unstructured text', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'diag-reason-'))
    const video = join(dir, 'reason.mp4')
    writeFileSync(video, Buffer.alloc(4096))

    const cases = [
      { text: '', reason: /模型未返回任何内容/ },
      { text: '| a | b |\n| --- | --- |\n| x | y |', reason: /模型返回了表格但无合法分镜行/ },
      { text: 'plain unstructured prose', reason: /模型返回了非结构化文本/ },
    ]
    for (const c of cases) {
      await assert.rejects(
        () => extractVideoBreakdown(video, { ctx: makeMockCtx(c.text) }),
        c.reason,
      )
    }

    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps the existing three-option ask_user_question guidance structure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'diag-guidance-'))
    const video = join(dir, 'g.mp4')
    writeFileSync(video, Buffer.alloc(64))

    const guidance = buildBreakdownFailureGuidance(video, 30, { reportText: 'no table' })
    assert.match(guidance, /模型返回了非结构化文本/)
    assert.match(guidance, /使用字幕快速提炼/)
    assert.match(guidance, /截取前 2 分钟切片拆解/)
    assert.match(guidance, /检查模型服务后重试/)
    assert.match(guidance, /ask_user_question/)

    rmSync(dir, { recursive: true, force: true })
  })
})

describe('AC-3 本地视频真实时长探测', () => {
  it('probes mvhd duration (494s) and routes to long-video guidance branch', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dur-long-'))
    const video = join(dir, 'podcast.mp4')
    writeFileSync(video, buildMp4WithDuration(494))

    let message = ''
    try {
      await extractVideoBreakdown(video, { ctx: makeMockCtx('no table at all') })
      assert.fail('should throw')
    } catch (err) {
      message = err.message
    }
    // 494s > 120s => isShort=false => long-video branch
    assert.match(message, /当前视频时长或内容结构超出短视频逐镜头拉片规格/)
    assert.match(message, /多模态模型未解析出有效分镜/)

    rmSync(dir, { recursive: true, force: true })
  })

  it('prefers meta.duration over mvhd probing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dur-meta-'))
    const video = join(dir, 'clip.mp4')
    writeFileSync(video, buildMp4WithDuration(494))

    await assert.rejects(
      () => extractVideoBreakdown(video, { ctx: makeMockCtx('no table'), meta: { duration: 30 } }),
      /请确认视觉大模型服务连通性后重试/,
    )

    rmSync(dir, { recursive: true, force: true })
  })

  it('silently falls back to default duration for malformed files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dur-bad-'))
    const video = join(dir, 'broken.mp4')
    writeFileSync(video, Buffer.from('not an mp4 at all'))

    // 16s default => isShort=true => short-video guidance branch, no throw from probing
    await assert.rejects(
      () => extractVideoBreakdown(video, { ctx: makeMockCtx('no table') }),
      /请确认视觉大模型服务连通性后重试/,
    )

    rmSync(dir, { recursive: true, force: true })
  })
})
