import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import * as inline from './capabilities/inline.js'
import { executeVideoProcess } from './job.js'

const probe = (duration, audio = true) => JSON.stringify({ format: { duration }, streams: [{ codec_type: 'video' }, ...(audio ? [{ codec_type: 'audio', codec_name: 'aac' }] : [])] })
test('explicit complete mode removes time truncation and retains optional AAC audio, legacy default stays', () => {
  const legacy = inline.buildInlineArgs({ videoUrl: '/saved' }, 540, '/dest')
  assert.ok(legacy.includes('-t')); assert.ok(legacy.includes('-an'))
  const full = inline.buildInlineArgs({ videoUrl: '/saved', preserveTimeline: true, keepAudio: true }, 540, '/dest')
  assert.equal(full.includes('-t'), false); assert.equal(full.includes('-an'), false)
  assert.ok(full.includes('0:a:0?')); assert.ok(full.includes('aac'))
})

test('complete mode rejects changed duration, lost audio and budget overshoot rather than returning a partial success', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inline-complete-'))
  try {
    const source = join(dir, 'source.mp4'); await writeFile(source, 'source')
    for (const scenario of ['duration', 'audio', 'budget']) {
      let calls = 0
      await assert.rejects(inline.execute({ videoUrl: source, preserveTimeline: true, keepAudio: true, maxRequestBytes: 100 }, { dest: join(dir, 'out.mp4'), addFile() {}, runFfmpeg: async () => {}, statBytes: async () => scenario === 'budget' ? 101 : 50, runFprobe: async () => ++calls === 1 ? probe(354) : probe(scenario === 'duration' ? 100 : 354, scenario !== 'audio') }))
    }
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('formal local engine preserves over-100s synthetic full timeline and audio', async (t) => {
  const bin = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', version: '8', missing: false }
  if (spawnSync(bin.ffmpeg, ['-version']).status !== 0 || spawnSync(bin.ffprobe, ['-version']).status !== 0) return t.skip('local ffmpeg/ffprobe unavailable; full timeline requires runtime acceptance')
  const dir = await mkdtemp(join(tmpdir(), 'inline-complete-real-'))
  try {
    const source = join(dir, 'source.mp4'); const dest = join(dir, 'prepared.mp4')
    const generated = spawnSync(bin.ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=16x16:r=1:d=102', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=102', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', source])
    assert.equal(generated.status, 0)
    const out = await executeVideoProcess({ capability: inline.slug, input: { videoUrl: source, preserveTimeline: true, keepAudio: true, maxRequestBytes: 2 * 1024 * 1024 }, dest, bin, acquire: (fn) => fn(), procs: new Set(), videoConfig: { video: {} } })
    assert.equal(out.mode, 'live'); assert.equal(out.files[0].meta.preserveTimeline, true); assert.equal(out.files[0].meta.hasAudio, true)
    assert.ok(out.files[0].meta.duration > 101); assert.ok(Math.abs(out.files[0].meta.sourceDuration - out.files[0].meta.duration) <= 0.5)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
