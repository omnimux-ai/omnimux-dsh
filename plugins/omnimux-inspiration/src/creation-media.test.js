import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, stat, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { prepareCreationMedia } from './creation-media.js'

async function world(t) {
  const dir = await mkdtemp(join(tmpdir(), 'creation-media-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const paths = { dir, imagesDir: join(dir, 'media/images'), videosDir: join(dir, 'media/videos') }
  const outputDir = join(paths.videosDir, 'creation-references', randomUUID())
  await Promise.all([paths.imagesDir, paths.videosDir, outputDir].map((path) => mkdir(path, { recursive: true })))
  const local_paths = {}
  for (const [key, folder] of [['video', 'videosDir'], ['video_2', 'videosDir'], ['image_1', 'imagesDir'], ['image_2', 'imagesDir']]) {
    local_paths[key] = join(paths[folder], `${key}.${folder === 'videosDir' ? 'mp4' : 'png'}`)
    await writeFile(local_paths[key], `${key}-original`)
  }
  local_paths.cover = join(dir, 'poster.png')
  await writeFile(local_paths.cover, 'poster-only')
  const item = { title: '原帖', local_paths, media_items: [
    { type: 'image', url: '/image-one' }, { type: 'video', url: '/video-one' },
    { type: 'image', url: '/image-two' }, { type: 'video', url: '/video-two' },
  ] }
  return { paths, item, outputDir }
}

const select = (...indexes) => ({ references: indexes.map((media_index) => ({ kind: 'media', media_index })), clips: indexes.map((media_index) => ({ media_index, start_seconds: 1, end_seconds: 3 })) })

function service(options = {}) {
  const calls = []
  const api = { calls, async execute(request) {
    calls.push(request)
    if (request.capability === 'video_trim') {
      await writeFile(request.dest, 'trimmed-output')
      if (options.trimError) throw options.trimError
      if (options.abort) options.abort.abort()
      return { mode: options.trimMode || 'live', files: [{ path: request.dest, kind: 'video' }] }
    }
    const output = request.input.mediaUrl.includes('creation-references')
    if (request.input.mediaKind === 'audio') return { mode: 'live', result: { codec_type: options.silent || (output && options.dropAudio) ? null : 'audio', duration: output ? 2 : 10 } }
    return { mode: options.probeMode || 'live', result: { codec_type: output && options.badVideo ? null : 'video', duration: output ? (options.outputDuration ?? 2) : 10 } }
  } }
  return api
}

test('selected second picture and second video preserve post order and map to their own stored files', async (t) => {
  const input = await world(t)
  const videoProcess = service()
  const result = await prepareCreationMedia({ ...input, draft: select(2, 3), videoProcess })
  assert.deepEqual(result.files.map(({ type, media_index }) => ({ type, media_index })), [{ type: 'image', media_index: 2 }, { type: 'video', media_index: 3 }])
  assert.equal(await readFile(result.files[0].path, 'utf8'), 'image_2-original')
  assert.notEqual(result.files[0].path, input.item.local_paths.image_2)
  assert.equal(result.files[0].title, '图片 2')
  assert.equal(result.files[1].title, '视频 2片段')
  const trim = videoProcess.calls.find((call) => call.capability === 'video_trim')
  assert.equal(trim.input.videoUrl, await realpath(input.item.local_paths.video_2))
  assert.equal(trim.input.precise, true)
  assert.equal(trim.input.keepAudio, true)
  assert.equal(trim.input.startSeconds, 1)
  assert.equal(trim.input.endSeconds, 3)
  assert.equal(trim.dest, result.files[1].path)
  assert.deepEqual(result.files[1].clip, { start_seconds: 1, end_seconds: 3 })
  assert.equal(videoProcess.calls.filter((call) => call.input.mediaKind === 'audio').length, 2)
  assert.equal(await readFile(input.item.local_paths.video_2, 'utf8'), 'video_2-original')
  assert.deepEqual(result.createdPaths, result.files.map((file) => file.path))
})

test('non-media references and a video poster do not become independent images', async (t) => {
  const input = await world(t)
  input.item = { local_paths: input.item.local_paths }
  const result = await prepareCreationMedia({ ...input, draft: { references: [{ kind: 'body' }, { kind: 'analysis', media_index: 0 }] } })
  assert.deepEqual(result, { files: [], createdPaths: [] })
  const legacy = await prepareCreationMedia({ ...input, draft: select(0), videoProcess: service() })
  assert.equal(legacy.files.length, 1)
  assert.equal(legacy.files[0].type, 'video')
})

test('legacy media_urls map the second video without falling back to the first', async (t) => {
  const input = await world(t)
  delete input.item.media_items
  input.item.media_urls = ['/omnimux/inspiration/local/media/videos/one.mp4', '/omnimux/inspiration/local/media/videos/two.mp4']
  const videoProcess = service()
  await prepareCreationMedia({ ...input, draft: select(1), videoProcess })
  assert.equal(videoProcess.calls.find((call) => call.capability === 'video_trim').input.videoUrl, await realpath(input.item.local_paths.video_2))
})

for (const media_index of [-1, 4, 1.5, '1', null]) test(`invalid saved media index ${JSON.stringify(media_index)} is rejected`, async (t) => {
  const input = await world(t)
  await assert.rejects(prepareCreationMedia({ ...input, draft: select(media_index), videoProcess: service() }), /素材序号/)
  assert.deepEqual(await readdir(input.outputDir), [])
})

test('unknown media types and duplicate references are rejected', async (t) => {
  const input = await world(t)
  input.item.media_items[0].type = 'audio'
  await assert.rejects(prepareCreationMedia({ ...input, draft: select(0) }), /素材类型/)
  await assert.rejects(prepareCreationMedia({ ...input, draft: select(2, 2) }), /重复/)
})

for (const range of [undefined, { start_seconds: '', end_seconds: 3 }, { start_seconds: null, end_seconds: 3 }, { start_seconds: -1, end_seconds: 3 }, { start_seconds: 2, end_seconds: 2 }, { start_seconds: 4, end_seconds: 2 }, { start_seconds: 0, end_seconds: Infinity }]) test(`video range must be explicit and finite: ${JSON.stringify(range)}`, async (t) => {
  const input = await world(t)
  const draft = select(1)
  draft.clips = range ? [{ media_index: 1, ...range }] : []
  const videoProcess = service()
  await assert.rejects(prepareCreationMedia({ ...input, draft, videoProcess }), /起止时间/)
  assert.equal(videoProcess.calls.length, 0)
})

test('video range beyond measured duration or duplicate ranges are rejected', async (t) => {
  const input = await world(t)
  const draft = select(1)
  draft.clips[0].end_seconds = 11
  await assert.rejects(prepareCreationMedia({ ...input, draft, videoProcess: service() }), /超过.*时长/)
  draft.clips = [select(1).clips[0], select(1).clips[0]]
  await assert.rejects(prepareCreationMedia({ ...input, draft, videoProcess: service() }), /起止时间/)
})

test('missing video capability and missing local video executable fail in Chinese', async (t) => {
  const input = await world(t)
  await assert.rejects(prepareCreationMedia({ ...input, draft: select(1) }), /本地视频处理能力/)
  await assert.rejects(prepareCreationMedia({ ...input, draft: select(1), videoProcess: { execute() { throw Object.assign(new Error('ffmpeg not found'), { code: 'ffmpeg-missing' }) } } }), /缺少视频处理程序/)
})

test('arbitrary paths, directories, missing files and sibling-root prefixes are rejected', async (t) => {
  const input = await world(t)
  const sibling = `${input.paths.imagesDir}-other`
  await mkdir(sibling)
  const outside = join(sibling, 'outside.png')
  await writeFile(outside, 'private')
  for (const path of [outside, input.paths.imagesDir, join(input.paths.imagesDir, 'missing.png'), 'relative.png']) {
    input.item.local_paths.image_1 = path
    await assert.rejects(prepareCreationMedia({ ...input, draft: select(0) }), /素材文件/)
  }
  assert.deepEqual(await readdir(input.outputDir), [])
})

test('source file symlinks and escaping parent symlinks are rejected', async (t) => {
  const input = await world(t)
  const outside = join(input.paths.dir, 'outside.png')
  await writeFile(outside, 'private')
  const link = join(input.paths.imagesDir, 'link.png')
  await symlink(outside, link)
  input.item.local_paths.image_1 = link
  await assert.rejects(prepareCreationMedia({ ...input, draft: select(0) }), /素材文件/)
  const folder = join(input.paths.imagesDir, 'escape')
  await symlink(input.paths.dir, folder)
  input.item.local_paths.image_1 = join(folder, 'outside.png')
  await assert.rejects(prepareCreationMedia({ ...input, draft: select(0) }), /素材文件/)
})

test('output directory must be a server-owned direct UUID directory without symlinks', async (t) => {
  const input = await world(t)
  const outside = join(input.paths.dir, 'outside')
  await mkdir(outside)
  const link = join(input.paths.videosDir, 'creation-references', randomUUID())
  await symlink(outside, link)
  for (const outputDir of [outside, input.paths.imagesDir, link, join(input.outputDir, '..')]) {
    await assert.rejects(prepareCreationMedia({ ...input, outputDir, draft: select(0) }), /准备目录/)
  }
  assert.deepEqual(await readdir(outside), [])
})

test('a symlinked preparation parent cannot redirect output', async (t) => {
  const input = await world(t)
  await rm(join(input.paths.videosDir, 'creation-references'), { recursive: true })
  const outside = join(input.paths.dir, 'outside')
  const redirected = join(outside, basename(input.outputDir))
  await mkdir(redirected, { recursive: true })
  await symlink(outside, join(input.paths.videosDir, 'creation-references'))
  await assert.rejects(prepareCreationMedia({ ...input, draft: select(0) }), /准备目录/)
  assert.deepEqual(await readdir(redirected), [])
})

for (const options of [{ probeMode: 'stub' }, { trimMode: 'stub' }, { badVideo: true }, { outputDuration: 3 }, { dropAudio: true }]) test(`unverified media processing is rejected and cleans every output: ${JSON.stringify(options)}`, async (t) => {
  const input = await world(t)
  await assert.rejects(prepareCreationMedia({ ...input, draft: select(0, 1), videoProcess: service(options) }), /视频|音轨/)
  assert.deepEqual(await readdir(input.outputDir), [])
  assert.equal(await readFile(input.item.local_paths.image_1, 'utf8'), 'image_1-original')
})

test('a live response without an actual nonempty output is rejected', async (t) => {
  const input = await world(t)
  const videoProcess = service()
  const original = videoProcess.execute
  videoProcess.execute = (request) => request.capability === 'video_trim' ? { mode: 'live', files: [{ path: request.dest }] } : original(request)
  await assert.rejects(prepareCreationMedia({ ...input, draft: select(1), videoProcess }), /视频片段/)
  assert.deepEqual(await readdir(input.outputDir), [])
})

for (const metadata of [{ codec_type: null, duration: 10 }, { codec_type: 'video', duration: 0 }, { codec_type: 'video', duration: NaN }]) test(`source must have a measured positive video track: ${JSON.stringify(metadata)}`, async (t) => {
  const input = await world(t)
  let trims = 0
  const videoProcess = { execute(request) {
    if (request.capability === 'video_trim') trims++
    return { mode: 'live', result: metadata }
  } }
  await assert.rejects(prepareCreationMedia({ ...input, draft: select(1), videoProcess }), /真实时长/)
  assert.equal(trims, 0)
  assert.deepEqual(await readdir(input.outputDir), [])
})

test('silent video remains valid and output names are unique', async (t) => {
  const input = await world(t)
  const first = await prepareCreationMedia({ ...input, draft: select(1), videoProcess: service({ silent: true }) })
  const second = await prepareCreationMedia({ ...input, draft: select(1), videoProcess: service({ silent: true }) })
  assert.notEqual(basename(first.files[0].path), basename(second.files[0].path))
  assert.ok((await stat(first.files[0].path)).size > 0)
})

test('trim errors and cancellation clean copied pictures and partial clips', async (t) => {
  const input = await world(t)
  await assert.rejects(prepareCreationMedia({ ...input, draft: select(0, 1), videoProcess: service({ trimError: new Error('broken trim') }) }), /视频/)
  assert.deepEqual(await readdir(input.outputDir), [])
  const controller = new AbortController()
  await assert.rejects(prepareCreationMedia({ ...input, draft: select(0, 1), signal: controller.signal, videoProcess: service({ abort: controller }) }), { name: 'AbortError' })
  assert.deepEqual(await readdir(input.outputDir), [])
})

test('already cancelled work never starts and a stalled processor is cancellable', async (t) => {
  const input = await world(t)
  const cancelled = new AbortController()
  cancelled.abort()
  const videoProcess = service()
  await assert.rejects(prepareCreationMedia({ ...input, draft: select(1), videoProcess, signal: cancelled.signal }), { name: 'AbortError' })
  assert.equal(videoProcess.calls.length, 0)
  const controller = new AbortController()
  let entered
  const ready = new Promise((resolve) => { entered = resolve })
  const pending = prepareCreationMedia({ ...input, draft: select(0, 1), signal: controller.signal, videoProcess: { execute() { entered(); return new Promise(() => {}) } } })
  await ready
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.deepEqual(await readdir(input.outputDir), [])
})

test('a late video write after cancellation is removed when the processor settles', async (t) => {
  const input = await world(t)
  const controller = new AbortController()
  const videoProcess = service()
  const original = videoProcess.execute
  let trimRequest, finishTrim, started
  const ready = new Promise((resolve) => { started = resolve })
  videoProcess.execute = async (request) => {
    if (request.capability !== 'video_trim') return original(request)
    trimRequest = request
    started()
    return new Promise((resolve) => { finishTrim = resolve })
  }
  const pending = prepareCreationMedia({ ...input, draft: select(0, 1), videoProcess, signal: controller.signal })
  await ready
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  await writeFile(trimRequest.dest, 'late-output')
  finishTrim({ mode: 'live', files: [{ path: trimRequest.dest }] })
  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await readdir(input.outputDir)).length === 0) break
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.deepEqual(await readdir(input.outputDir), [])
})
