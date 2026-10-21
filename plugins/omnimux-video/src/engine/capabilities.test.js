import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VideoError } from '../errors.js'
import * as probe from './capabilities/probe.js'
import * as trim from './capabilities/trim.js'
import * as merge from './capabilities/merge.js'
import * as split from './capabilities/split.js'
import * as audio from './capabilities/audio.js'
import * as thumb from './capabilities/thumb.js'
import * as inline from './capabilities/inline.js'
import * as scene from './capabilities/scene.js'
import * as slideshow from './capabilities/slideshow.js'
import * as videoExport from './capabilities/export.js'
import * as depth from './capabilities/depth.js'
import { normalizeSubtitleSegments, autoSplit } from './capabilities/export-ass.js'
import { buildAss, assTimestamp } from './ass.js'

const invalid = async (promise) => {
  try { await promise; return null } catch (e) { return e }
}

// ---------------------------------------------------------------------------
// media_metadata
// ---------------------------------------------------------------------------

test('probe: validate requires a media url (mediaUrl/videoUrl/audioUrl)', () => {
  assert.throws(() => probe.validate({}), (e) => e instanceof VideoError && e.code === 'video-invalid-input')
  assert.throws(() => probe.validate({ mediaUrl: '' }), VideoError)
  probe.validate({ mediaUrl: '/tmp/a.mp4' })
  probe.validate({ videoUrl: '/tmp/a.mp4' })
  probe.validate({ audioUrl: '/tmp/a.mp3' })
})

test('probe: mediaKind selects the stream', () => {
  assert.deepEqual(probe.buildProbeArgs({ mediaUrl: '/a.mp4' }), [
    '-show_entries', 'stream=width,height,duration,codec_type,codec_name:format=duration,size,bit_rate', '-of', 'json', '/a.mp4',
  ])
  const video = probe.buildProbeArgs({ mediaUrl: '/a.mp4', mediaKind: 'video' })
  assert.deepEqual(video.slice(0, 2), ['-select_streams', 'v:0'])
  const audioArgs = probe.buildProbeArgs({ mediaUrl: '/a.mp4', mediaKind: 'audio' })
  assert.deepEqual(audioArgs.slice(0, 2), ['-select_streams', 'a:0'])
})

test('probe: execute parses numeric duration', async () => {
  const stdout = JSON.stringify({
    streams: [{ width: 320, height: 240, duration: '1.5', codec_type: 'video', codec_name: 'h264' }],
    format: { duration: '1.5', size: '1234', bit_rate: '500000' },
  })
  const out = await probe.execute({ mediaUrl: '/a.mp4' }, { runFprobe: async () => stdout })
  assert.equal(out.files.length, 0)
  assert.equal(out.result.duration, 1.5)
  assert.equal(out.result.width, 320)
  assert.equal(out.result.height, 240)
  assert.equal(out.result.codec_name, 'h264')
})

// ---------------------------------------------------------------------------
// video_trim
// ---------------------------------------------------------------------------

test('trim: validate requires videoUrl and positive duration', () => {
  assert.throws(() => trim.validate({}), (e) => e.code === 'video-invalid-input')
  assert.throws(() => trim.validate({ videoUrl: '/a.mp4', durationSeconds: 0 }), VideoError)
  assert.throws(() => trim.validate({ videoUrl: '/a.mp4', durationSeconds: -1 }), VideoError)
  trim.validate({ videoUrl: '/a.mp4' })
  trim.validate({ videoUrl: '/a.mp4', startSeconds: 2, endSeconds: 7 })
})

test('trim: copy argv vs precise reencode argv differ', () => {
  const input = { videoUrl: '/a.mp4', startSeconds: 2, durationSeconds: 5, keepAudio: true }
  const copy = trim.buildTrimCopyArgs(input, '/out.mp4')
  assert.deepEqual(copy, ['-ss', '2', '-i', '/a.mp4', '-t', '5', '-c', 'copy', '/out.mp4'])
  const re = trim.buildTrimReencodeArgs(input, '/out.mp4')
  assert.ok(re.includes('-c:v') && re.includes('libx264'))
  assert.ok(re.includes('-c:a') && re.includes('aac'))
  assert.ok(re.includes('-movflags') && re.includes('+faststart'))
  assert.ok(!copy.includes('libx264'))
})

test('trim: keepAudio false adds -an', () => {
  const copy = trim.buildTrimCopyArgs({ videoUrl: '/a.mp4', keepAudio: false }, '/o.mp4')
  assert.ok(copy.includes('-an'))
  const re = trim.buildTrimReencodeArgs({ videoUrl: '/a.mp4', keepAudio: false }, '/o.mp4')
  assert.ok(re.includes('-an') && !re.includes('aac'))
})

test('trim: endSeconds derives duration', () => {
  const args = trim.buildTrimCopyArgs({ videoUrl: '/a.mp4', startSeconds: 2, endSeconds: 7 }, '/o.mp4')
  assert.ok(args.includes('-t') && args[args.indexOf('-t') + 1] === '5')
})

test('trim: execute copy-first then reencode fallback', async () => {
  const calls = []
  const ctx = {
    dest: '/out.mp4',
    addFile() {},
    runFfmpeg: async (args) => { calls.push(args); if (calls.length === 1) throw new VideoError('video-ffmpeg-failed', 'copy failed') },
  }
  const out = await trim.execute({ videoUrl: '/a.mp4', durationSeconds: 1 }, ctx)
  assert.equal(calls.length, 2)
  assert.ok(calls[0].includes('-c', 'copy') || calls[0].includes('-c'))
  assert.ok(calls[1].includes('libx264'))
  assert.equal(out.files[0].path, '/out.mp4')
})

test('trim: precise skips copy', async () => {
  const calls = []
  const ctx = { dest: '/out.mp4', addFile() {}, runFfmpeg: async (a) => calls.push(a) }
  await trim.execute({ videoUrl: '/a.mp4', precise: true }, ctx)
  assert.equal(calls.length, 1)
  assert.ok(calls[0].includes('libx264'))
})

// ---------------------------------------------------------------------------
// video_merge
// ---------------------------------------------------------------------------

test('merge: validate requires >= 2 videoUrls', () => {
  assert.throws(() => merge.validate({}), (e) => e.code === 'video-invalid-input')
  assert.throws(() => merge.validate({ videoUrls: ['/a.mp4'] }), VideoError)
  merge.validate({ videoUrls: ['/a.mp4', '/b.mp4'] })
})

test('merge: concat list escaping', () => {
  assert.equal(merge.escapeConcatPath('/a b.mp4'), '/a b.mp4')
  assert.equal(merge.escapeConcatPath("/a'b.mp4"), "/a'\\''b.mp4")
  const list = ['/a.mp4', "/x'y.mp4"].map((p) => `file '${merge.escapeConcatPath(p)}'`).join('\n') + '\n'
  assert.match(list, /file '\/a\.mp4'/)
  assert.match(list, /file '\/x'\\''y\.mp4'/)
})

test('merge: copy argv with keepAudio toggle', () => {
  const a = merge.buildMergeArgs('/list.txt', { keepAudio: true, dest: '/out.mp4' })
  assert.deepEqual(a, ['-f', 'concat', '-safe', '0', '-i', '/list.txt', '-c', 'copy', '-movflags', '+faststart', '/out.mp4'])
  const b = merge.buildMergeArgs('/list.txt', { keepAudio: false, dest: '/out.mp4' })
  assert.ok(b.includes('-an'))
})

test('merge: incompatibilityKey detects mismatches', () => {
  const s = (codec, w, h, pix) => ({ codec_name: codec, width: w, height: h, pix_fmt: pix })
  assert.equal(merge.incompatibilityKey([s('h264', 320, 240, 'yuv420p'), s('h264', 320, 240, 'yuv420p')], [1, 2]), null)
  assert.equal(merge.incompatibilityKey([s('h264', 320, 240, 'yuv420p'), s('hevc', 320, 240, 'yuv420p')], [1, 2]), 'codec_name')
  assert.equal(merge.incompatibilityKey([s('h264', 320, 240, 'yuv420p'), s('h264', 640, 240, 'yuv420p')], [1, 2]), 'width')
  assert.equal(merge.incompatibilityKey([s('h264', 320, 240, 'yuv420p')], [1, 2]), 'count')
})

test('merge: execute fail-fasts on incompatible streams', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'omnimux-video-merge-'))
  // Second input differs on pix_fmt → gate must throw before any concat.
  let probeCalls = 0
  const ctx = {
    dest: join(dir, 'out.mp4'),
    tmpDir: dir,
    materialize: async (u) => u,
    runFprobe: async () => {
      probeCalls += 1
      const pix = probeCalls === 1 ? 'yuv420p' : 'yuvj420p'
      return JSON.stringify({ streams: [{ codec_name: 'h264', width: 320, height: 240, pix_fmt: pix }] })
    },
    runFfmpeg: async () => { throw new Error('should not spawn') },
    addFile() {},
  }
  const err = await invalid(merge.execute({ videoUrls: ['/a.mp4', '/b.mp4'] }, ctx))
  assert.ok(err instanceof VideoError)
  assert.equal(err.code, 'video-incompatible-streams')
  assert.equal(probeCalls, 2)
  await rm(dir, { recursive: true, force: true })
})

test('merge: execute runs concat when compatible', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'omnimux-video-merge-'))
  const calls = []
  const ctx = {
    dest: join(dir, 'out.mp4'),
    tmpDir: dir,
    materialize: async (u) => u,
    runFprobe: async () => JSON.stringify({ streams: [{ codec_name: 'h264', width: 320, height: 240, pix_fmt: 'yuv420p' }] }),
    runFfmpeg: async (a) => calls.push(a),
    addFile() {},
  }
  try {
    const out = await merge.execute({ videoUrls: ['/a.mp4', '/b.mp4'] }, ctx)
    assert.equal(calls.length, 1)
    assert.ok(calls[0].includes('-f') && calls[0].includes('concat'))
    assert.ok(calls[0].includes(join(dir, 'out.mp4')))
    assert.equal(out.files[0].path, join(dir, 'out.mp4'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// video_split
// ---------------------------------------------------------------------------

test('split: validate requires videoUrl and segments', () => {
  assert.throws(() => split.validate({}), (e) => e.code === 'video-invalid-input')
  assert.throws(() => split.validate({ videoUrl: '/a.mp4', segments: [] }), VideoError)
  assert.throws(() => split.validate({ videoUrl: '/a.mp4', segments: [{ startSeconds: 0 }] }), VideoError)
  split.validate({ videoUrl: '/a.mp4', segments: [{ startSeconds: 0, durationSeconds: 1 }] })
})

test('split: segment naming starts at segment-001', () => {
  assert.equal(split.segmentFilename(1), 'segment-001.mp4')
  assert.equal(split.segmentFilename(12), 'segment-012.mp4')
})

test('split: buildSplitArgs encodes one re-encoded segment', () => {
  const args = split.buildSplitArgs({ videoUrl: '/a.mp4' }, { start: 1, duration: 2, keepAudio: true, dest: '/d/segment-001.mp4' })
  assert.deepEqual(args, ['-ss', '1', '-i', '/a.mp4', '-t', '2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', '/d/segment-001.mp4'])
})

test('split: execute writes all segments and returns files', async () => {
  const calls = []
  const ctx = {
    dest: '/out',
    addFile() {},
    runFfmpeg: async (a) => calls.push(a),
  }
  const out = await split.execute({
    videoUrl: '/a.mp4',
    segments: [{ startSeconds: 0, durationSeconds: 1 }, { startSeconds: 1, endSeconds: 3 }],
  }, ctx)
  assert.equal(calls.length, 2)
  assert.deepEqual(out.files.map((f) => f.path), ['/out/segment-001.mp4', '/out/segment-002.mp4'])
  assert.equal(out.result.segmentCount, 2)
})

// ---------------------------------------------------------------------------
// audio_extract / audio_prepare
// ---------------------------------------------------------------------------

test('audio_extract: validate', () => {
  assert.throws(() => audio.validateExtract({}), (e) => e.code === 'video-invalid-input')
  assert.throws(() => audio.validateExtract({ videoUrl: '/a.mp4', outputFormat: 'wav' }), VideoError)
  audio.validateExtract({ videoUrl: '/a.mp4' })
})

test('audio_extract: mp3 vs m4a codec choice', () => {
  const mp3 = audio.buildExtractArgs({ videoUrl: '/a.mp4', outputFormat: 'mp3', audioBitrate: '128k' }, '/o.mp3')
  assert.ok(mp3.includes('libmp3lame'))
  const m4a = audio.buildExtractArgs({ videoUrl: '/a.mp4', outputFormat: 'm4a' }, '/o.m4a')
  assert.ok(m4a.includes('-acodec', 'aac') || m4a.includes('aac'))
  assert.ok(m4a.includes('-vn'))
})

test('audio_extract: no audio stream succeeds with no_audio_stream under result', async () => {
  const ctx = { dest: '/o.mp3', addFile() {}, runFprobe: async () => '', runFfmpeg: async () => { throw new Error('no spawn') } }
  const out = await audio.executeExtract({ videoUrl: '/a.mp4' }, ctx)
  assert.deepEqual(out, { files: [], result: { no_audio_stream: true, duration: 0 } })
  assert.equal(out.result.no_audio_stream, true)
  assert.deepEqual(out.files, [])
})

test('audio_extract: with audio stream spawns', async () => {
  const calls = []
  const ctx = { dest: '/o.mp3', addFile() {}, runFprobe: async () => '0\n', runFfmpeg: async (a) => calls.push(a) }
  const out = await audio.executeExtract({ videoUrl: '/a.mp4' }, ctx)
  assert.equal(calls.length, 1)
  assert.equal(out.files[0].path, '/o.mp3')
})

test('audio_prepare: validate + args (sampleRate/channels)', () => {
  assert.throws(() => audio.validatePrepare({}), (e) => e.code === 'video-invalid-input')
  const args = audio.buildPrepareArgs({ audioUrl: '/a.mp3', outputFormat: 'm4a', sampleRate: 44100, channels: 2, durationSeconds: 5 }, '/o.m4a')
  assert.ok(args.includes('-ar') && args[args.indexOf('-ar') + 1] === '44100')
  assert.ok(args.includes('-ac') && args[args.indexOf('-ac') + 1] === '2')
  assert.ok(args.includes('-t') && args[args.indexOf('-t') + 1] === '5')
})

// ---------------------------------------------------------------------------
// video_thumbnail_extract
// ---------------------------------------------------------------------------

test('thumb: validate requires videoUrl', () => {
  assert.throws(() => thumb.validate({}), (e) => e.code === 'video-invalid-input')
  thumb.validate({ videoUrl: '/a.mp4' })
})

test('thumb: inside vs cover filters', () => {
  const inside = thumb.buildThumbArgs({ videoUrl: '/a.mp4', width: 320, height: 240, fit: 'inside' }, '/t.jpg')
  assert.ok(inside.join(' ').includes('scale=320:240:force_original_aspect_ratio=decrease'))
  const cover = thumb.buildThumbArgs({ videoUrl: '/a.mp4', width: 320, height: 240, fit: 'cover' }, '/t.jpg')
  assert.ok(cover.join(' ').includes('scale=320:240:force_original_aspect_ratio=increase,crop=320:240'))
})

test('thumb: maxEdge default 512 when no width/height', () => {
  const args = thumb.buildThumbArgs({ videoUrl: '/a.mp4' }, '/t.jpg')
  assert.ok(args.join(' ').includes("scale='min(512,iw)':-2"))
})

test('thumb: execute retries candidate times then fails', async () => {
  let calls = 0
  const ctx = {
    dest: '/t.jpg',
    addFile() {},
    runFfmpeg: async () => { calls += 1; throw new VideoError('video-ffmpeg-failed', 'x') },
  }
  const err = await invalid(thumb.execute({ videoUrl: '/a.mp4', timeSeconds: 1 }, ctx))
  assert.ok(err instanceof VideoError)
  assert.equal(err.code, 'video-thumbnail-extract-failed')
  assert.ok(calls > 1)
})

// ---------------------------------------------------------------------------
// video_inline_analysis_prepare
// ---------------------------------------------------------------------------

test('inline: validate requires videoUrl', () => {
  assert.throws(() => inline.validate({}), (e) => e.code === 'video-invalid-input')
  inline.validate({ videoUrl: '/a.mp4' })
})

test('inline: buildInlineArgs scales to the tier', () => {
  const args = inline.buildInlineArgs({ videoUrl: '/a.mp4' }, 540, '/o.mp4')
  assert.ok(args.join(' ').includes("scale='min(540,iw)':-2"))
  assert.ok(args.includes('libx264'))
})

test('inline: execute lowers tiers until within maxRequestBytes', async () => {
  const sizes = [20 * 1024 * 1024, 12 * 1024 * 1024, 8 * 1024 * 1024]
  let i = 0
  const ctx = {
    dest: '/o.mp4',
    addFile() {},
    runFfmpeg: async () => {},
    statBytes: async () => sizes[i++],
  }
  const out = await inline.execute({ videoUrl: '/a.mp4', maxRequestBytes: 9 * 1024 * 1024 }, ctx)
  assert.equal(out.files[0].meta.longEdge, 270)
  assert.equal(i, 3)
})

// ---------------------------------------------------------------------------
// video_scene_detect
// ---------------------------------------------------------------------------

test('scene: validate requires videoUrl', () => {
  assert.throws(() => scene.validate({}), (e) => e.code === 'video-invalid-input')
  scene.validate({ videoUrl: '/a.mp4' })
})

test('scene: buildSceneArgs uses threshold + showinfo', () => {
  const args = scene.buildSceneArgs({ videoUrl: '/a.mp4', threshold: 0.4 })
  assert.ok(args.join(' ').includes("select='gt(scene,0.4)',showinfo"))
  assert.ok(args.includes('-f') && args.includes('null'))
})

test('scene: parseSceneTimestamps extracts pts_time', () => {
  const stderr = 'frame:1 pts:25 pts_time:1.5 ...\nframe:2 pts:50 pts_time:3.25 ...\n'
  assert.deepEqual(scene.parseSceneTimestamps(stderr), [1.5, 3.25])
  assert.deepEqual(scene.parseSceneTimestamps('no matches'), [])
})

test('scene: frameFilename zero-padded', () => {
  assert.equal(scene.frameFilename(1), 'frame-001.jpg')
  assert.equal(scene.frameFilename(12), 'frame-012.jpg')
})

// ---------------------------------------------------------------------------
// slideshow_export
// ---------------------------------------------------------------------------

test('slideshow: validate requires imageUrls', () => {
  assert.throws(() => slideshow.validate({}), (e) => e.code === 'video-invalid-input')
  assert.throws(() => slideshow.validate({ imageUrls: [] }), VideoError)
  slideshow.validate({ imageUrls: ['/a.jpg'] })
})

test('slideshow: xfade filter_complex contains xfade transition', () => {
  const args = slideshow.buildXfadeArgs(['/s0.mp4', '/s1.mp4', '/s2.mp4'], {
    dur: 1, transition: 'fade', dest: '/o.mp4',
  })
  const fc = args[args.indexOf('-filter_complex') + 1]
  assert.match(fc, /xfade=transition=fade:duration=0\.25:offset=0\.75/)
  assert.match(fc, /xfade=transition=fade:duration=0\.25:offset=1\.5/)
  assert.ok(args.includes('-map'))
})

test('slideshow: canvas mapping 720p 9:16 → 720x1280, 16:9 → 1280x720', () => {
  assert.deepEqual(slideshow.resolveCanvas({ resolution: '720p', aspectRatio: '9:16' }), { width: 720, height: 1280 })
  assert.deepEqual(slideshow.resolveCanvas({ resolution: '720p', aspectRatio: '16:9' }), { width: 1280, height: 720 })
  assert.deepEqual(slideshow.resolveCanvas({ resolution: '720p', aspectRatio: '1:1' }), { width: 720, height: 720 })
})

test('slideshow: auto aspect follows first image orientation', () => {
  const portrait = slideshow.resolveCanvas({ resolution: '720p', aspectRatio: 'auto' }, { w: 1080, h: 1920 })
  assert.deepEqual(portrait, { width: 720, height: 1280 })
  const landscape = slideshow.resolveCanvas({ resolution: '720p', aspectRatio: 'auto' }, { w: 1920, h: 1080 })
  assert.deepEqual(landscape, { width: 1280, height: 720 })
})

test('slideshow: buildConcatArgs maps video and optional audio', () => {
  const noAudio = slideshow.buildConcatArgs('/list.txt', '/o.mp4', {})
  assert.ok(noAudio.includes('-map') && noAudio.includes('0:v:0'))
  const withAudio = slideshow.buildConcatArgs('/list.txt', '/o.mp4', { audioUrl: '/bg.mp3', audioVolume: 0.5 })
  assert.ok(withAudio.includes('volume=0.5'))
  assert.ok(withAudio.includes('-shortest'))
})

test('slideshow: execute degrades to concat when xfade missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'omnimux-video-cap-'))
  const calls = []
  const ctx = {
    dest: join(dir, 'o.mp4'),
    tmpDir: dir,
    binVersion: '3.4.2',
    materialize: async (u) => u,
    runFprobe: async () => JSON.stringify({ streams: [{ width: 100, height: 200 }] }),
    runFfmpeg: async (a) => calls.push(a),
    addFile() {},
  }
  try {
    const out = await slideshow.execute({ imageUrls: ['/a.jpg', '/b.jpg'], transitionType: 'fade' }, ctx)
    assert.ok(out.result.degraded.includes('xfade-missing'))
    assert.ok(calls.some((a) => a.includes('-f') && a.includes('concat')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// video_export
// ---------------------------------------------------------------------------

test('export: validate requires clips with url', () => {
  assert.throws(() => videoExport.validate({}), (e) => e.code === 'video-invalid-input')
  assert.throws(() => videoExport.validate({ clips: [{ type: 'video' }] }), VideoError)
  videoExport.validate({ clips: [{ url: '/a.mp4' }] })
})

test('export: ignores chromaKey/textOverlays/dedupe and still builds', async () => {
  const calls = []
  const ctx = {
    dest: '/o.mp4',
    tmpDir: '/tmp/x',
    binVersion: '8.1.2',
    materialize: async (u) => u,
    runFprobe: async () => JSON.stringify({ streams: [{ width: 1920, height: 1080 }] }),
    runFfmpeg: async (a) => calls.push(a),
    addFile() {},
  }
  const out = await videoExport.execute({
    clips: [{ url: '/a.mp4', chromaKey: { color: 'green' }, textOverlays: [{ text: 'x' }], dedupe: true }],
    resolution: '720p', aspectRatio: '9:16',
  }, ctx)
  assert.equal(calls.length, 1)
  assert.equal(out.files[0].path, '/o.mp4')
  assert.equal(out.result.canvas, '720x1280')
})

test('export: buildExportFilters concats and burns ASS when assPath set', () => {
  const plain = videoExport.buildExportFilters(2, { width: 720, height: 1280, fps: 30, assPath: null })
  assert.match(plain.filters.join(';'), /concat=n=2:v=1:a=0\[base\]/)
  assert.equal(plain.map, '[base]')
  const burned = videoExport.buildExportFilters(2, { width: 720, height: 1280, fps: 30, assPath: '/tmp/x.ass' })
  assert.match(burned.filters.join(';'), /\[base\]ass=filename=\/tmp\/x\.ass/)
  assert.equal(burned.map, '[sub]')
})

test('export: buildExportXfadeArgs chains transitions', () => {
  const args = videoExport.buildExportXfadeArgs(3, { width: 720, height: 1280, fps: 30, dur: 2, transition: 'fade', dest: '/o.mp4' })
  const fc = args[args.indexOf('-filter_complex') + 1]
  assert.match(fc, /xfade=transition=fade/)
})

test('export: buildClipInputArgs seeks videos and loops images', () => {
  const v = videoExport.buildClipInputArgs({ url: '/a.mp4', start: 1.5, duration: 3 }, { duration: 3 })
  assert.deepEqual(v, ['-ss', '1.5', '-t', '3', '-i', '/a.mp4'])
  const img = videoExport.buildClipInputArgs({ url: '/a.jpg', type: 'image', duration: 2 }, { duration: 2 })
  assert.deepEqual(img, ['-loop', '1', '-t', '2', '-i', '/a.jpg'])
})

// ---------------------------------------------------------------------------
// subtitles / ASS
// ---------------------------------------------------------------------------

test('subtitles: timeline segments normalized', () => {
  const segs = normalizeSubtitleSegments({ segments: [{ start: 0, duration: 2, text: 'hi' }, { start: 2, duration: 0, text: 'skip' }] })
  assert.equal(segs.length, 1)
  assert.deepEqual(segs[0], { start: 0, duration: 2, text: 'hi' })
})

test('subtitles: auto-split spreads text across duration', () => {
  const segs = autoSplit('第一句。第二句！第三句？', 9)
  assert.ok(segs.length >= 3)
  const total = segs[segs.length - 1].start + segs[segs.length - 1].duration
  assert.ok(Math.abs(total - 9) < 0.01)
})

test('ass: timestamp format H:MM:SS.cc', () => {
  assert.equal(assTimestamp(0), '0:00:00.00')
  assert.equal(assTimestamp(65.5), '0:01:05.50')
  assert.equal(assTimestamp(3661.25), '1:01:01.25')
})

test('ass: buildAss produces a dialogue with escaped text', () => {
  const ass = buildAss({ width: 720, height: 1280, segments: [{ start: 0, duration: 2, text: '你好\n世界' }] })
  assert.match(ass, /PlayResX: 720/)
  assert.match(ass, /PlayResY: 1280/)
  assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:02\.00,Default,,0,0,0,,你好\\N世界/)
  assert.match(ass, /WrapStyle: 2/)
  assert.match(ass, /Alignment: 2|,2,20,20,/)
})

// ---------------------------------------------------------------------------
// video_depth
// ---------------------------------------------------------------------------

test('depth: validate requires videoUrl and checks params', () => {
  assert.throws(() => depth.validate({}), (e) => e instanceof VideoError && e.code === 'video-invalid-input')
  assert.throws(() => depth.validate({ videoUrl: '' }), VideoError)
  assert.throws(() => depth.validate({ videoUrl: '/a.mp4', maxEdge: -1 }), VideoError)
  assert.throws(() => depth.validate({ videoUrl: '/a.mp4', fps: 0 }), VideoError)
  assert.throws(() => depth.validate({ videoUrl: '/a.mp4', startSeconds: -1 }), VideoError)
  assert.throws(() => depth.validate({ videoUrl: '/a.mp4', durationSeconds: 0 }), VideoError)
  assert.throws(() => depth.validate({ videoUrl: '/a.mp4', provider: 'quantum' }), VideoError)
  depth.validate({ videoUrl: '/a.mp4' })
  assert.throws(() => depth.validate({ videoUrl: '/a.mp4', mode: 'turbo' }), (e) => e instanceof VideoError)
  depth.validate({ videoUrl: '/a.mp4', mode: 'quality' })
  depth.validate({
    videoUrl: '/a.mp4',
    maxEdge: 518,
    invert: true,
    sideBySide: true,
    keepAudio: false,
    provider: 'coreml',
    startSeconds: 0,
    durationSeconds: 2,
  })
})

test('depth: buildDepthCliArgs maps flags correctly', () => {
  const args = depth.buildDepthCliArgs(
    {
      maxEdge: 518,
      fps: 24,
      startSeconds: 1,
      durationSeconds: 3,
      provider: 'cpu',
      invert: true,
      sideBySide: true,
    },
    {
      scriptPath: '/opt/depth_engine.py',
      inputPath: '/in.mp4',
      outputPath: '/out.mp4',
      modelsDir: '/models',
    },
  )
  assert.deepEqual(args, [
    '/opt/depth_engine.py',
    '--preset', 'fast',
    '--input', '/in.mp4',
    '--output', '/out.mp4',
    '--max-edge', '518',
    '--fps', '24',
    '--start', '1',
    '--duration', '3',
    '--provider', 'cpu',
    '--invert',
    '--side-by-side',
    '--models-dir', '/models',
  ])
})

test('depth: buildDepthCliArgs 支持 quality 档，默认 fast', () => {
  const base = { scriptPath: '/s.py', inputPath: '/i.mp4', outputPath: '/o.mp4' }
  const fast = depth.buildDepthCliArgs({ videoUrl: '/a.mp4' }, base)
  assert.deepEqual(fast.slice(0, 3), ['/s.py', '--preset', 'fast'])
  const quality = depth.buildDepthCliArgs(
    { videoUrl: '/a.mp4' },
    { scriptPath: '/s.py', inputPath: '/i.mp4', outputPath: '/o.mp4', mode: 'quality' },
  )
  assert.deepEqual(quality.slice(0, 3), ['/s.py', '--preset', 'quality'])
})

test('depth: buildAudioExtractArgs and buildMuxArgs', () => {
  const audioArgs = depth.buildAudioExtractArgs('/in.mp4', '/a.m4a', { startSeconds: 1, durationSeconds: 2 })
  assert.deepEqual(audioArgs, ['-ss', '1', '-i', '/in.mp4', '-t', '2', '-vn', '-c:a', 'aac', '-b:a', '192k', '/a.m4a'])
  const mux = depth.buildMuxArgs({ videoPath: '/v.mp4', audioPath: '/a.m4a', dest: '/o.mp4', keepAudio: true })
  assert.ok(mux.includes('-map'))
  assert.ok(mux.includes('/o.mp4'))
})

test('depth: runtime probe imports the three engine dependencies', () => {
  assert.deepEqual(depth.DEPTH_PYTHON_MODULES, ['numpy', 'cv2', 'onnxruntime'])
  assert.equal(
    depth.buildDepthRuntimeCheckCode(),
    'import numpy; import cv2; import onnxruntime',
  )
  assert.equal(depth.buildDepthRuntimeCheckCode(['onnxruntime']), 'import onnxruntime')
})

test('depth: missingDepthModules reads names from a Python traceback tail', () => {
  assert.deepEqual(
    depth.missingDepthModules(
      "ModuleNotFoundError: No module named 'onnxruntime'\nModuleNotFoundError: No module named 'cv2'",
    ),
    ['onnxruntime', 'cv2'],
  )
  assert.deepEqual(depth.missingDepthModules(''), [])
})

test('depth: ensureDepthPython passes when the probe resolves', async () => {
  const calls = []
  await depth.ensureDepthPython({
    pythonBin: '/opt/py',
    runProbe: async (args) => { calls.push(args) },
  })
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], ['-c', 'import numpy; import cv2; import onnxruntime'])
})

test('depth: ensureDepthPython maps missing deps to video-depth-deps-missing', async () => {
  const err = await invalid(
    depth.ensureDepthPython({
      pythonBin: '/opt/py',
      runProbe: async () => {
        throw Object.assign(new Error('ModuleNotFoundError'), {
          stderrTail: "ModuleNotFoundError: No module named 'onnxruntime'",
        })
      },
    }),
  )
  assert.ok(err instanceof VideoError)
  assert.equal(err.code, 'video-depth-deps-missing')
  assert.match(err.message, /onnxruntime/)
  assert.match(err.hint, /pip install onnxruntime opencv-python/)
  assert.match(err.hint, /OMNIMUX_VIDEO_PYTHON_PATH/)
})

test('depth: ensureDepthPython reports an unusable interpreter', async () => {
  const err = await invalid(
    depth.ensureDepthPython({
      pythonBin: '/no/such/python',
      runProbe: async () => {
        throw Object.assign(new Error("spawn /no/such/python ENOENT"), { stderrTail: 'ENOENT' })
      },
    }),
  )
  assert.equal(err.code, 'video-depth-deps-missing')
  assert.match(err.message, /cannot start Python interpreter/)
})

test('depth: 解释器候选链版本优先，显式配置优先且不参与发现', () => {
  assert.deepEqual(depth.resolveDepthPythonCandidates(''), depth.DEPTH_PYTHON_CANDIDATES)
  assert.deepEqual(depth.resolveDepthPythonCandidates(''), [
    'python3.16',
    'python3.15',
    'python3.14',
    'python3.13',
    'python3.12',
    'python3.11',
    'python3.10',
    'python3',
  ])
  assert.deepEqual(depth.resolveDepthPythonCandidates('/opt/py'), ['/opt/py'])
})

test('depth: selectDepthPython 选用首个可导入依赖的解释器', async () => {
  depth.clearDepthPythonCache()
  const probes = []
  const bin = await depth.selectDepthPython({
    runProbe: async (b) => {
      probes.push(b)
      if (b !== 'python3.14') {
        throw Object.assign(new Error('missing'), { stderrTail: "No module named 'numpy'" })
      }
    },
  })
  assert.deepEqual(probes, ['python3.16', 'python3.15', 'python3.14'])
  assert.equal(bin, 'python3.14')
})

test('depth: selectDepthPython 显式配置失败不回退', async () => {
  depth.clearDepthPythonCache()
  const probes = []
  const err = await invalid(
    depth.selectDepthPython({
      configured: '/no/such/python',
      runProbe: async (b) => {
        probes.push(b)
        throw Object.assign(new Error('missing'), { stderrTail: "No module named 'onnxruntime'" })
      },
    }),
  )
  assert.deepEqual(probes, ['/no/such/python'])
  assert.equal(err.code, 'video-depth-deps-missing')
  assert.match(err.message, /configured python/)
})

test('depth: selectDepthPython 缓存已选解释器，避免重复探测', async () => {
  depth.clearDepthPythonCache()
  let probes = 0
  const runProbe = async () => { probes += 1 }
  const first = await depth.selectDepthPython({ runProbe })
  const second = await depth.selectDepthPython({ runProbe })
  assert.equal(first, 'python3.16')
  assert.equal(second, 'python3.16')
  assert.equal(probes, 1)
})

test('depth: selectDepthPython 全失败时列出尝试过的解释器', async () => {
  depth.clearDepthPythonCache()
  const err = await invalid(
    depth.selectDepthPython({
      runProbe: async () => {
        throw Object.assign(new Error('missing'), { stderrTail: "No module named 'cv2'" })
      },
    }),
  )
  assert.equal(err.code, 'video-depth-deps-missing')
  assert.match(err.message, /tried: python3\.16 \/ python3\.15/)
  assert.match(err.message, /pip install onnxruntime opencv-python/)
  assert.match(err.message, /OMNIMUX_UV_PATH/)
})

test('depth: selectDepthPython 单个候选超时继续下一个，不截断候选链', async () => {
  depth.clearDepthPythonCache()
  const probes = []
  const bin = await depth.selectDepthPython({
    runProbe: async (b) => {
      probes.push(b)
      if (b === 'python3.16') {
        throw Object.assign(new Error('timed out'), { code: 'video-timeout' })
      }
    },
  })
  assert.deepEqual(probes, ['python3.16', 'python3.15'])
  assert.equal(bin, 'python3.15')
})

test('depth: selectDepthPython 调用方取消时立即抛出，不继续探测', async () => {
  depth.clearDepthPythonCache()
  const probes = []
  const err = await invalid(
    depth.selectDepthPython({
      runProbe: async (b) => {
        probes.push(b)
        throw new VideoError('video-canceled', 'canceled')
      },
    }),
  )
  assert.deepEqual(probes, ['python3.16'])
  assert.equal(err.code, 'video-canceled')
})

test('depth: buildUvDepthArgs 组装 uv 托管运行时命令', () => {
  const args = depth.buildUvDepthArgs({
    scriptPath: '/opt/depth_engine.py',
    input: { maxEdge: 256, invert: true },
    inputPath: '/tmp/src.mp4',
    outputPath: '/tmp/depth.mp4',
    modelsDir: '/models',
  })
  assert.deepEqual(args.slice(0, 15), [
    'run',
    '--no-project',
    '--python',
    '3.11',
    '--with', 'numpy',
    '--with', 'opencv-python-headless==4.10.0.84',
    '--with', 'onnxruntime',
    'python',
    '/opt/depth_engine.py',
    '--preset',
    'fast',
    '--input',
  ])
  assert.equal(args[15], '/tmp/src.mp4')
  assert.ok(args.includes('--max-edge'))
  assert.ok(args.includes('--invert'))
  assert.ok(args.includes('--models-dir'))
})

test('depth: resolveDepthRuntime 顺序——显式 > 系统 Python > uv', async () => {
  depth.clearDepthPythonCache()
  depth.clearUvCache()
  const uvProbes = []

  // 1) 显式配置失败：不回退 uv
  const explicitErr = await invalid(depth.resolveDepthRuntime({
    configured: '/no/such/python',
    runProbe: async () => { throw Object.assign(new Error('missing'), { stderrTail: "No module named 'numpy'" }) },
    runUvProbe: async (bin) => { uvProbes.push(bin) },
  }))
  assert.equal(explicitErr.code, 'video-depth-deps-missing')
  assert.deepEqual(uvProbes, [])

  // 2) 系统 Python 可用：优先系统，不探测 uv
  const pythonRuntime = await depth.resolveDepthRuntime({
    runProbe: async (bin) => { if (bin !== 'python3.12') throw Object.assign(new Error('missing'), { stderrTail: "No module named 'numpy'" }) },
    runUvProbe: async (bin) => { uvProbes.push(bin) },
  })
  assert.equal(pythonRuntime.kind, 'python')
  assert.equal(pythonRuntime.bin, 'python3.12')
  assert.deepEqual(uvProbes, [])

  // 3) 系统全部失败：回退 uv
  depth.clearDepthPythonCache()
  const uvRuntime = await depth.resolveDepthRuntime({
    runProbe: async () => { throw Object.assign(new Error('missing'), { stderrTail: "No module named 'numpy'" }) },
    runUvProbe: async (bin) => { uvProbes.push(bin) },
  })
  assert.equal(uvRuntime.kind, 'uv')
  assert.equal(uvRuntime.bin, 'uv')
})

test('depth: resolveDepthRuntime 在 uv 也不可用时保留 Python 错误', async () => {
  depth.clearDepthPythonCache()
  depth.clearUvCache()
  const err = await invalid(depth.resolveDepthRuntime({
    runProbe: async () => { throw Object.assign(new Error('missing'), { stderrTail: "No module named 'numpy'" }) },
    runUvProbe: async () => { throw Object.assign(new Error('uv not found'), { code: 'ENOENT' }) },
  }))
  assert.equal(err.code, 'video-depth-deps-missing')
  assert.match(err.message, /tried: python3\.16/)
})

test('depth: probeUv 缓存探测结果，失败返回 null', async () => {
  depth.clearUvCache()
  let calls = 0
  const runProbe = async () => { calls += 1 }
  assert.equal(await depth.probeUv({ runProbe }), 'uv')
  assert.equal(await depth.probeUv({ runProbe }), 'uv')
  assert.equal(calls, 1)

  depth.clearUvCache()
  assert.equal(await depth.probeUv({ runProbe: async () => { throw new Error('missing') } }), null)
})

test('depth: execute gates on the runtime probe before any ffmpeg work', async () => {
  depth.clearDepthPythonCache()
  let materialized = false
  const err = await invalid(
    depth.execute(
      { videoUrl: '/src.mp4' },
      {
        dest: '/out.mp4',
        tmpDir: '/tmp/x',
        addFile() {},
        materialize: async () => { materialized = true; return '/src.local.mp4' },
        runFprobe: async () => '{}',
        runFfmpeg: async () => {},
        runDepthRuntimeProbe: async () => {
          throw Object.assign(new Error('missing'), {
            stderrTail: "ModuleNotFoundError: No module named 'numpy'",
          })
        },
        videoConfig: { video: { pythonPath: '/opt/py' } },
      },
    ),
  )
  assert.equal(err.code, 'video-depth-deps-missing')
  assert.equal(materialized, false)
})

test('depth: execute runs probe, audio extract, python depth and muxing', async () => {
  depth.clearDepthPythonCache()
  const calls = { ffmpeg: [], python: [], probe: 0 }
  const out = await depth.execute(
    { videoUrl: '/src.mp4', maxEdge: 518, keepAudio: true },
    {
      dest: '/out.mp4',
      tmpDir: '/tmp/x',
      addFile() {},
      materialize: async () => '/src.local.mp4',
      runFprobe: async () => JSON.stringify({ streams: [{ codec_type: 'video' }, { codec_type: 'audio' }] }),
      runFfmpeg: async (a) => { calls.ffmpeg.push(a) },
      runPython: async (a) => { calls.python.push(a) },
      runDepthRuntimeProbe: async () => { calls.probe += 1 },
      videoConfig: { video: { pythonPath: 'python3', modelsDir: '/models' } },
    },
  )
  assert.equal(out.files[0].path, '/out.mp4')
  assert.equal(out.result.model, 'depth-anything-v2-small')
  assert.equal(out.result.python, 'python3')
  assert.equal(calls.probe, 1)
  assert.equal(calls.python.length, 1)
  assert.ok(calls.ffmpeg.length >= 1)
})

test('depth: execute 走 uv 时使用托管运行时并回传运行方式', async () => {
  depth.clearDepthPythonCache()
  depth.clearUvCache()
  const uvCalls = []
  const out = await depth.execute(
    { videoUrl: '/src.mp4', keepAudio: false },
    {
      dest: '/out.mp4',
      tmpDir: '/tmp/x',
      addFile() {},
      materialize: async () => '/src.local.mp4',
      runFprobe: async () => JSON.stringify({ streams: [{ codec_type: 'video' }] }),
      runFfmpeg: async () => {},
      runPython: async () => { throw new Error('system python must not be used') },
      runUv: async (args) => { uvCalls.push(args) },
      runDepthRuntimeProbe: async () => { throw Object.assign(new Error('missing'), { stderrTail: "No module named 'numpy'" }) },
      runUvProbe: async () => {},
      videoConfig: { video: { pythonPath: '', modelsDir: '' } },
    },
  )
  assert.equal(uvCalls.length, 1)
  assert.equal(uvCalls[0][0], 'run')
  assert.equal(uvCalls[0].includes('opencv-python-headless==4.10.0.84'), true)
  assert.equal(out.result.python, 'uv (managed python 3.11)')
})

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

test('registry: exactly 12 slugs', async () => {
  const { SLUGS } = await import('./video.js')
  assert.equal(SLUGS.length, 12)
  for (const s of ['media_metadata', 'video_trim', 'video_merge', 'video_split', 'audio_extract', 'audio_prepare', 'video_thumbnail_extract', 'video_inline_analysis_prepare', 'video_scene_detect', 'slideshow_export', 'video_export', 'video_depth']) {
    assert.ok(SLUGS.includes(s), `missing ${s}`)
  }
})

test('registry: audio_extract and audio_prepare are distinct capabilities', async () => {
  const { CAPABILITIES, SLUGS } = await import('./video.js')
  assert.notEqual(CAPABILITIES.audio_extract, CAPABILITIES.audio_prepare)
  assert.equal(CAPABILITIES.audio_extract.slug, 'audio_extract')
  assert.equal(CAPABILITIES.audio_prepare.slug, 'audio_prepare')
  // prepare.execute must build prepare args, not extract args
  const calls = []
  await CAPABILITIES.audio_prepare.execute(
    { audioUrl: '/a.mp3', outputFormat: 'm4a' },
    { dest: '/o.m4a', addFile() {}, runFfmpeg: async (a) => calls.push(a) },
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], '-i') // prepare starts with -i, extract starts with -ss
  assert.ok(SLUGS.includes('audio_extract') && SLUGS.includes('audio_prepare'))
})