/**
 * 媒体字节回传三端点（`src/capture-relay.js`）的单测。
 *
 * 层：路由表 → `handleCaptureMediaSession` / `handleCaptureMediaChunk` /
 * `handleCaptureCommit`。store 是真实 tmp 目录上的 local store，媒体字节由测试
 * 直接给出；回传链路不下载任何远端内容，所以 `deny-network.mjs` 看到 0 出站。
 *
 * 覆盖：会话创建/公开 URL 校验/media 上限与 index 校验；分块顺序、重复/乱序
 * 409、非法 base64 与超大块 400、单文件/会话超限 413 且清理；commit 完成性
 * 409、空文件 409、magic 不匹配 400 且清理；commit 成功 ready + 落盘路径 +
 * local_paths/media_items；已 ready 去重 200；TTL 清理与过期会话。
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStore } from './local-store.js'
import { createLocalInspirationDispatcher, LOCAL_PREFIX } from './http-routes.js'
import {
  RELAY_CHUNK_DECODED_MAX_BYTES,
  RELAY_MAX_FILE_BYTES,
  RELAY_MAX_TOTAL_BYTES,
  RELAY_MEDIA_LIMIT,
  RELAY_SESSION_TTL_MS,
  cleanupStaleRelaySessions,
} from './capture-relay.js'

const SOURCE_URL = 'https://www.tiktok.com/@cleanlife/video/7412345678901234567'
const VIDEO_URL = 'https://v16-webapp.tiktokcdn.example/abc/video.mp4'
const IMAGE_URL = 'https://p16-sign.tiktokcdn.example/cover.jpg'

/** 文件头校验接受的四种媒体起始字节。 */
const MP4_BYTES = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
])
const WEBM_BYTES = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42, 0x82, 0x88, 0x6d, 0x61, 0x74, 0x72, 0x6f, 0x73, 0x6b, 0x61,
])
const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
])
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
])

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'inspiration-relay-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** 真实 tmp 目录 store + 真实路由 dispatcher；fetcher 不会被回传链路调用。 */
function makeWorld() {
  const dir = join(root, 'home')
  const paths = {
    dir,
    libraryFile: join(dir, 'library.json'),
    mediaDir: join(dir, 'media'),
    coversDir: join(dir, 'media', 'covers'),
    videosDir: join(dir, 'media', 'videos'),
    imagesDir: join(dir, 'media', 'images'),
  }
  const store = createLocalStore({ paths })
  const dispatcher = createLocalInspirationDispatcher({ localStore: store })
  return { store, paths, dispatcher }
}

function post(world, action, body) {
  return world.dispatcher.dispatch({ method: 'POST', url: `${LOCAL_PREFIX}/${action}`, body })
}

function sessionBody(overrides) {
  return Object.assign({
    source_url: SOURCE_URL,
    platform: 'tiktok',
    title: '三秒钩子：这个拖把真的不用手洗',
    content: '正文文案',
    content_shape: 'video',
    author: { name: '洁净生活家', handle: 'cleanlife' },
    stats: { likes: 1200, comments: 34 },
    posted_at: '2026-10-20T00:00:00.000Z',
    cover_url: IMAGE_URL,
    media: [{ index: 0, type: 'video', url: VIDEO_URL }],
  }, overrides)
}

function relayDir(paths, sessionId) {
  return join(paths.mediaDir, 'relay', sessionId)
}

function sessionFile(paths, sessionId) {
  return join(relayDir(paths, sessionId), 'session.json')
}

function partFile(paths, sessionId, index) {
  return join(relayDir(paths, sessionId), `media-${index}.part`)
}

function readSessionFile(paths, sessionId) {
  return JSON.parse(readFileSync(sessionFile(paths, sessionId), 'utf8'))
}

function writeSessionFile(paths, sessionId, session) {
  writeFileSync(sessionFile(paths, sessionId), JSON.stringify(session, null, 2), 'utf8')
}

async function createSession(world, body) {
  const result = await post(world, 'capture-media-session', body)
  assert.equal(result.status, 201)
  return result.body.data
}

function sendChunk(world, sessionId, index, seq, buffer, final) {
  return post(world, 'capture-media-chunk', {
    session_id: sessionId,
    index,
    seq,
    data: buffer.toString('base64'),
    final,
  })
}

function commit(world, sessionId) {
  return post(world, 'capture-commit', { session_id: sessionId })
}

/** 把一个视频媒体按「首块 + 尾块」传完。 */
async function uploadVideo(world, sessionId, bytes, index) {
  const first = await sendChunk(world, sessionId, index, 0, bytes.subarray(0, 8), false)
  assert.equal(first.status, 200)
  const last = await sendChunk(world, sessionId, index, 1, bytes.subarray(8), true)
  assert.equal(last.status, 200)
  return last
}

describe('POST /local/capture-media-session', () => {
  it('creates a relay session with ordered media entries and a session record', async () => {
    const world = makeWorld()
    const result = await post(world, 'capture-media-session', sessionBody({
      media: [
        { index: 1, type: 'image', url: IMAGE_URL },
        { index: 0, type: 'video', url: VIDEO_URL, size_hint: 1048576 },
      ],
    }))
    assert.equal(result.status, 201)
    const data = result.body.data
    assert.match(data.session_id, /^[0-9a-f]{24}$/)
    assert.deepEqual(data.media, [{ index: 0 }, { index: 1 }])

    const session = readSessionFile(world.paths, data.session_id)
    assert.equal(session.session_id, data.session_id)
    assert.ok(Number.isFinite(Date.parse(session.created_at)))
    assert.equal(session.source.source_url, SOURCE_URL)
    assert.equal(session.source.platform, 'tiktok')
    assert.equal(session.source.title, '三秒钩子：这个拖把真的不用手洗')
    assert.equal(session.source.cover_url, IMAGE_URL)
    assert.deepEqual(session.media.map((item) => item.index), [0, 1])
    assert.deepEqual(session.media.map((item) => item.type), ['video', 'image'])
    assert.deepEqual(session.media.map((item) => item.url), [VIDEO_URL, IMAGE_URL])
    assert.deepEqual(session.media.map((item) => item.seq), [0, 0])
    assert.deepEqual(session.media.map((item) => item.bytes), [0, 0])
    assert.deepEqual(session.media.map((item) => item.complete), [false, false])
  })

  it('rejects a non-public source_url or cover_url', async () => {
    const world = makeWorld()
    for (const sourceUrl of ['http://127.0.0.1:8080/video/1', 'file:///tmp/a.mp4', 'https://localhost/video/1']) {
      const result = await post(world, 'capture-media-session', sessionBody({ source_url: sourceUrl }))
      assert.equal(result.status, 400)
      assert.ok(result.body.error)
    }
    const badCover = await post(world, 'capture-media-session', sessionBody({ cover_url: 'http://192.168.1.4/cover.jpg' }))
    assert.equal(badCover.status, 400)
  })

  it('rejects non-public media URLs, unknown media types and a missing media list', async () => {
    const world = makeWorld()
    const badUrl = await post(world, 'capture-media-session', sessionBody({
      media: [{ index: 0, type: 'video', url: 'http://127.0.0.1/x.mp4' }],
    }))
    assert.equal(badUrl.status, 400)

    const badType = await post(world, 'capture-media-session', sessionBody({
      media: [{ index: 0, type: 'audio', url: VIDEO_URL }],
    }))
    assert.equal(badType.status, 400)

    const noMedia = await post(world, 'capture-media-session', Object.assign(sessionBody(), { media: undefined }))
    assert.equal(noMedia.status, 400)

    const emptyMedia = await post(world, 'capture-media-session', sessionBody({ media: [] }))
    assert.equal(emptyMedia.status, 400)
  })

  it('rejects more than the media limit', async () => {
    const world = makeWorld()
    const media = []
    for (let index = 0; index <= RELAY_MEDIA_LIMIT; index += 1) {
      media.push({ index, type: 'video', url: VIDEO_URL })
    }
    const result = await post(world, 'capture-media-session', sessionBody({ media }))
    assert.equal(result.status, 400)
    assert.equal(existsSync(join(world.paths.mediaDir, 'relay')), false)
  })

  it('rejects duplicated or out-of-range media indexes', async () => {
    const world = makeWorld()
    const duplicated = await post(world, 'capture-media-session', sessionBody({
      media: [{ index: 0, type: 'video', url: VIDEO_URL }, { index: 0, type: 'image', url: IMAGE_URL }],
    }))
    assert.equal(duplicated.status, 400)

    const outOfRange = await post(world, 'capture-media-session', sessionBody({
      media: [{ index: 1, type: 'video', url: VIDEO_URL }],
    }))
    assert.equal(outOfRange.status, 400)
  })
})

describe('POST /local/capture-media-chunk', () => {
  it('appends chunks in order and marks the media complete on final', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())

    const first = await sendChunk(world, data.session_id, 0, 0, MP4_BYTES.subarray(0, 8), false)
    assert.equal(first.status, 200)
    assert.deepEqual(first.body.data, { index: 0, bytes: 8, complete: false })

    const second = await sendChunk(world, data.session_id, 0, 1, MP4_BYTES.subarray(8), true)
    assert.equal(second.status, 200)
    assert.deepEqual(second.body.data, { index: 0, bytes: MP4_BYTES.length, complete: true })

    assert.deepEqual(readFileSync(partFile(world.paths, data.session_id, 0)), MP4_BYTES)
    const session = readSessionFile(world.paths, data.session_id)
    assert.equal(session.media[0].seq, 2)
    assert.equal(session.media[0].bytes, MP4_BYTES.length)
    assert.equal(session.media[0].complete, true)
  })

  it('rejects a duplicated seq with 409', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())
    const first = await sendChunk(world, data.session_id, 0, 0, MP4_BYTES.subarray(0, 8), false)
    assert.equal(first.status, 200)
    const duplicate = await sendChunk(world, data.session_id, 0, 0, MP4_BYTES.subarray(0, 8), false)
    assert.equal(duplicate.status, 409)
  })

  it('rejects an out-of-order seq with 409', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())
    const outOfOrder = await sendChunk(world, data.session_id, 0, 1, MP4_BYTES.subarray(8), true)
    assert.equal(outOfOrder.status, 409)
  })

  it('rejects chunks for an unknown media index or an unknown session', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())
    const badIndex = await sendChunk(world, data.session_id, 3, 0, MP4_BYTES, true)
    assert.equal(badIndex.status, 400)

    const unknown = await sendChunk(world, 'a'.repeat(24), 0, 0, MP4_BYTES, true)
    assert.equal(unknown.status, 404)

    const malformed = await sendChunk(world, '../../etc', 0, 0, MP4_BYTES, true)
    assert.equal(malformed.status, 404)
  })

  it('rejects invalid base64 and chunks larger than the decoded limit', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())

    const badBase64 = await post(world, 'capture-media-chunk', {
      session_id: data.session_id, index: 0, seq: 0, data: 'not base64!!', final: false,
    })
    assert.equal(badBase64.status, 400)

    const huge = await sendChunk(
      world,
      data.session_id,
      0,
      0,
      Buffer.alloc(RELAY_CHUNK_DECODED_MAX_BYTES + 1, 0x61),
      false,
    )
    assert.equal(huge.status, 400)
  })

  it('records a zero-byte final chunk and rejects the empty file at commit', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())
    const final = await sendChunk(world, data.session_id, 0, 0, Buffer.alloc(0), true)
    assert.equal(final.status, 200)
    assert.deepEqual(final.body.data, { index: 0, bytes: 0, complete: true })

    const result = await commit(world, data.session_id)
    assert.equal(result.status, 409)
    assert.equal(existsSync(relayDir(world.paths, data.session_id)), false)
  })

  it('answers 413 and removes the session when the file limit is exceeded', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())
    const session = readSessionFile(world.paths, data.session_id)
    session.media[0].bytes = RELAY_MAX_FILE_BYTES - 8
    writeSessionFile(world.paths, data.session_id, session)

    const result = await sendChunk(world, data.session_id, 0, 0, MP4_BYTES, true)
    assert.equal(result.status, 413)
    assert.equal(existsSync(relayDir(world.paths, data.session_id)), false)
  })

  it('answers 413 and removes the session when the session limit is exceeded', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody({
      media: [
        { index: 0, type: 'video', url: VIDEO_URL },
        { index: 1, type: 'image', url: IMAGE_URL },
      ],
    }))
    const session = readSessionFile(world.paths, data.session_id)
    session.media[0].bytes = RELAY_MAX_TOTAL_BYTES - 8
    writeSessionFile(world.paths, data.session_id, session)

    const result = await sendChunk(world, data.session_id, 1, 0, PNG_BYTES, true)
    assert.equal(result.status, 413)
    assert.equal(existsSync(relayDir(world.paths, data.session_id)), false)
  })

  it('rejects any further chunk once a media is complete', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())
    await uploadVideo(world, data.session_id, MP4_BYTES, 0)
    const extra = await sendChunk(world, data.session_id, 0, 2, MP4_BYTES, true)
    assert.equal(extra.status, 409)
  })
})

describe('POST /local/capture-commit', () => {
  it('rejects a session whose media has not finished uploading and removes it', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())
    await sendChunk(world, data.session_id, 0, 0, MP4_BYTES.subarray(0, 8), false)

    const result = await commit(world, data.session_id)
    assert.equal(result.status, 409)
    assert.equal(existsSync(relayDir(world.paths, data.session_id)), false)
  })

  it('rejects a completed but empty media file and removes the session', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())
    const session = readSessionFile(world.paths, data.session_id)
    session.media[0].complete = true
    writeSessionFile(world.paths, data.session_id, session)

    const result = await commit(world, data.session_id)
    assert.equal(result.status, 409)
    assert.equal(existsSync(relayDir(world.paths, data.session_id)), false)
  })

  it('rejects bytes that do not match the declared media type and removes the session', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())
    const last = await sendChunk(world, data.session_id, 0, 0, JPEG_BYTES, true)
    assert.equal(last.status, 200)

    const result = await commit(world, data.session_id)
    assert.equal(result.status, 400)
    assert.equal(existsSync(relayDir(world.paths, data.session_id)), false)
    assert.equal(existsSync(join(world.paths.videosDir, `video_${data.session_id}_0.mp4`)), false)
    assert.equal(world.store.readAll().length, 0)
  })

  it('commits a video as a ready record with the file in videosDir', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())
    await uploadVideo(world, data.session_id, MP4_BYTES, 0)

    const result = await commit(world, data.session_id)
    assert.equal(result.status, 201)
    const record = result.body.data
    const fileName = `video_${data.session_id}_0.mp4`
    const filePath = join(world.paths.videosDir, fileName)

    assert.equal(record.import_status, 'ready')
    assert.equal(record.type, 'video')
    assert.equal(record.source_url, SOURCE_URL)
    assert.equal(record.source_platform, 'tiktok')
    assert.equal(record.title, '三秒钩子：这个拖把真的不用手洗')
    assert.equal(record.content, '正文文案')
    assert.equal(record.posted_at, '2026-10-20T00:00:00.000Z')
    assert.deepEqual(record.author, { name: '洁净生活家', handle: 'cleanlife' })
    assert.deepEqual(record.media_urls, [`${LOCAL_PREFIX}/media/videos/${fileName}`])
    assert.deepEqual(record.media_items, [{ type: 'video', url: `${LOCAL_PREFIX}/media/videos/${fileName}` }])
    assert.deepEqual(record.local_paths, { video: filePath })
    assert.equal(record.cover_url, IMAGE_URL)
    assert.ok(existsSync(filePath))
    assert.deepEqual(readFileSync(filePath), MP4_BYTES)
    assert.equal(existsSync(relayDir(world.paths, data.session_id)), false)
    assert.equal(world.store.get(record.id).import_status, 'ready')
  })

  it('accepts a webm payload as video bytes', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())
    const last = await sendChunk(world, data.session_id, 0, 0, WEBM_BYTES, true)
    assert.equal(last.status, 200)

    const result = await commit(world, data.session_id)
    assert.equal(result.status, 201)
    assert.equal(result.body.data.import_status, 'ready')
    assert.ok(existsSync(join(world.paths.videosDir, `video_${data.session_id}_0.mp4`)))
  })

  it('commits a mixed video + image post with ordered local_paths and media_items', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody({
      media: [
        { index: 0, type: 'video', url: VIDEO_URL },
        { index: 1, type: 'image', url: IMAGE_URL },
      ],
    }))
    await uploadVideo(world, data.session_id, MP4_BYTES, 0)
    const imageChunk = await sendChunk(world, data.session_id, 1, 0, PNG_BYTES, true)
    assert.equal(imageChunk.status, 200)

    const result = await commit(world, data.session_id)
    assert.equal(result.status, 201)
    const record = result.body.data
    const videoName = `video_${data.session_id}_0.mp4`
    const imageName = `image_${data.session_id}_1.jpg`
    assert.deepEqual(record.media_items, [
      { type: 'video', url: `${LOCAL_PREFIX}/media/videos/${videoName}` },
      { type: 'image', url: `${LOCAL_PREFIX}/media/images/${imageName}` },
    ])
    assert.deepEqual(record.local_paths, {
      video: join(world.paths.videosDir, videoName),
      image_1: join(world.paths.imagesDir, imageName),
    })
    assert.ok(existsSync(join(world.paths.videosDir, videoName)))
    assert.ok(existsSync(join(world.paths.imagesDir, imageName)))
  })

  it('answers 200 existing when an already-ready row holds the same source_url', async () => {
    const world = makeWorld()
    const first = await createSession(world, sessionBody())
    await uploadVideo(world, first.session_id, MP4_BYTES, 0)
    const committed = await commit(world, first.session_id)
    assert.equal(committed.status, 201)

    const second = await createSession(world, sessionBody())
    await uploadVideo(world, second.session_id, MP4_BYTES, 0)
    const duplicate = await commit(world, second.session_id)
    assert.equal(duplicate.status, 200)
    assert.equal(duplicate.body.existing, true)
    assert.equal(duplicate.body.data.id, committed.body.data.id)
    assert.equal(existsSync(relayDir(world.paths, second.session_id)), false)
    assert.equal(world.store.readAll().length, 1)
    assert.equal(existsSync(join(world.paths.videosDir, `video_${second.session_id}_0.mp4`)), false)
  })

  it('adds a new row when an existing row does not hold the media', async () => {
    const world = makeWorld()
    world.store.add({
      title: '旧记录',
      type: 'video',
      source_url: SOURCE_URL,
      import_status: 'failed',
      import_error: 'CDN 403',
    }, { allowDuplicate: true })

    const data = await createSession(world, sessionBody())
    await uploadVideo(world, data.session_id, MP4_BYTES, 0)
    const result = await commit(world, data.session_id)
    assert.equal(result.status, 201)
    assert.equal(result.body.data.import_status, 'ready')
    assert.equal(world.store.readAll().length, 2)
  })

  it('cleans the session and moved files when saving the record fails', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())
    await uploadVideo(world, data.session_id, MP4_BYTES, 0)
    world.store.add = () => {
      throw new Error('library write failed')
    }

    const result = await commit(world, data.session_id)
    assert.equal(result.status, 500)
    assert.equal(existsSync(relayDir(world.paths, data.session_id)), false)
    assert.equal(existsSync(join(world.paths.videosDir, `video_${data.session_id}_0.mp4`)), false)
    assert.equal(world.store.readAll().length, 0)
  })

  it('answers 404 for an unknown or malformed session id', async () => {
    const world = makeWorld()
    const unknown = await commit(world, 'b'.repeat(24))
    assert.equal(unknown.status, 404)
    const malformed = await commit(world, '../library')
    assert.equal(malformed.status, 404)
  })
})

describe('relay session TTL', () => {
  it('cleanupStaleRelaySessions removes expired session dirs and keeps fresh ones', async () => {
    const world = makeWorld()
    const stale = await createSession(world, sessionBody({ source_url: `${SOURCE_URL}?stale=1` }))
    const fresh = await createSession(world, sessionBody({ source_url: `${SOURCE_URL}?fresh=1` }))
    const old = new Date(Date.now() - RELAY_SESSION_TTL_MS - 60_000)
    utimesSync(relayDir(world.paths, stale.session_id), old, old)

    const removed = cleanupStaleRelaySessions(world.paths)
    assert.deepEqual(removed, [stale.session_id])
    assert.equal(existsSync(relayDir(world.paths, stale.session_id)), false)
    assert.equal(existsSync(relayDir(world.paths, fresh.session_id)), true)
  })

  it('cleans stale session dirs when a new session is created', async () => {
    const world = makeWorld()
    const stale = await createSession(world, sessionBody())
    const old = new Date(Date.now() - RELAY_SESSION_TTL_MS - 60_000)
    utimesSync(relayDir(world.paths, stale.session_id), old, old)

    const created = await createSession(world, sessionBody({ source_url: `${SOURCE_URL}?second=1` }))
    assert.equal(existsSync(relayDir(world.paths, stale.session_id)), false)
    assert.equal(existsSync(relayDir(world.paths, created.session_id)), true)
  })

  it('treats an expired session as missing for chunk and commit and removes it', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())
    const session = readSessionFile(world.paths, data.session_id)
    session.created_at = new Date(Date.now() - RELAY_SESSION_TTL_MS - 60_000).toISOString()
    writeSessionFile(world.paths, data.session_id, session)

    const chunk = await sendChunk(world, data.session_id, 0, 0, MP4_BYTES, true)
    assert.equal(chunk.status, 404)
    assert.equal(existsSync(relayDir(world.paths, data.session_id)), false)

    const second = await createSession(world, sessionBody({ source_url: `${SOURCE_URL}?expired=1` }))
    const secondSession = readSessionFile(world.paths, second.session_id)
    secondSession.created_at = new Date(Date.now() - RELAY_SESSION_TTL_MS - 60_000).toISOString()
    writeSessionFile(world.paths, second.session_id, secondSession)
    const expiredCommit = await commit(world, second.session_id)
    assert.equal(expiredCommit.status, 404)
    assert.equal(existsSync(relayDir(world.paths, second.session_id)), false)
  })

  it('treats a session whose directory mtime is past the TTL as expired', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())
    const old = new Date(Date.now() - RELAY_SESSION_TTL_MS - 60_000)
    utimesSync(relayDir(world.paths, data.session_id), old, old)

    const chunk = await sendChunk(world, data.session_id, 0, 0, MP4_BYTES, true)
    assert.equal(chunk.status, 404)
    assert.equal(existsSync(relayDir(world.paths, data.session_id)), false)
  })

  it('removes a session dir whose session.json is unreadable', async () => {
    const world = makeWorld()
    const data = await createSession(world, sessionBody())
    const dir = relayDir(world.paths, data.session_id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(sessionFile(world.paths, data.session_id), '{not json', 'utf8')

    const result = await sendChunk(world, data.session_id, 0, 0, MP4_BYTES, true)
    assert.equal(result.status, 404)
    assert.equal(existsSync(dir), false)
  })
})
