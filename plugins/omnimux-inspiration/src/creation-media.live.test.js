import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { apply } from '../../omnimux-video/src/index.js'
import { resolveBin, spawnFfmpeg } from '../../omnimux-video/src/engine/ffmpeg.js'
import { prepareCreationMedia } from './creation-media.js'

const bin = resolveBin({})

test('registered local video service prepares a real accurate clip with audio and a copied image', { skip: bin.missing ? '本机未安装视频处理程序，真实裁片未验收' : false }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'creation-media-live-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const paths = { dir, imagesDir: join(dir, 'media/images'), videosDir: join(dir, 'media/videos') }
  const outputDir = join(paths.videosDir, 'creation-references', randomUUID())
  await Promise.all([paths.imagesDir, paths.videosDir, outputDir].map((path) => mkdir(path, { recursive: true })))
  const video = join(paths.videosDir, 'original.mp4')
  const picture = join(paths.imagesDir, 'original.png')
  await spawnFfmpeg({ bin, timeoutMs: 30_000, args: [
    '-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=25:d=3',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
    '-c:v', 'libx264', '-c:a', 'aac', '-shortest', video,
  ] })
  await spawnFfmpeg({ bin, timeoutMs: 30_000, args: ['-f', 'lavfi', '-i', 'color=c=red:s=320x240:d=1', '-frames:v', '1', picture] })
  let videoProcess
  apply({ tools: { register() {} }, provide(name, value) { if (name === 'videoProcess') videoProcess = value }, effect(factory) { t.after(factory()) } })
  assert.equal(typeof videoProcess?.execute, 'function')
  const item = { media_items: [{ type: 'video', url: '/video' }, { type: 'image', url: '/image' }], local_paths: { video, image_1: picture } }
  const draft = { references: [{ kind: 'media', media_index: 1 }, { kind: 'media', media_index: 0 }], clips: [{ media_index: 0, start_seconds: 0.72, end_seconds: 1.84 }] }
  const originals = await Promise.all([readFile(video), readFile(picture)])
  const result = await prepareCreationMedia({ item, draft, paths, outputDir, videoProcess })
  assert.deepEqual(result.files.map((file) => file.type), ['image', 'video'])
  assert.deepEqual(await readFile(result.files[0].path), originals[1])
  const clip = result.files[1]
  const metadata = await videoProcess.execute({ capability: 'media_metadata', input: { mediaUrl: clip.path, mediaKind: 'video' } })
  const audio = await videoProcess.execute({ capability: 'media_metadata', input: { mediaUrl: clip.path, mediaKind: 'audio' } })
  assert.equal(metadata.mode, 'live')
  assert.equal(metadata.result.codec_type, 'video')
  assert.ok(Math.abs(metadata.result.duration - 1.12) <= 0.15, `实测片段时长 ${metadata.result.duration}`)
  assert.equal(metadata.result.width, 320)
  assert.equal(metadata.result.height, 240)
  assert.equal(audio.result.codec_type, 'audio')
  assert.ok((await stat(clip.path)).size > 0)
  assert.deepEqual(await readFile(video), originals[0])
  assert.deepEqual(await readFile(picture), originals[1])
  t.diagnostic(JSON.stringify({ expected_seconds: 1.12, actual_seconds: metadata.result.duration, width: metadata.result.width, height: metadata.result.height, audio: audio.result.codec_type, video_bytes: (await stat(clip.path)).size, image_copied: true, originals_unchanged: true }))
})
