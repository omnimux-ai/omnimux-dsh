/**
 * `POST /omnimux/inspiration/local/capture` — the host half of the extension's
 * in-page capture.
 *
 * Layer under test: route table → `handleCapture` → header sanitization, public
 * URL validation, dedupe, sequential downloads, cover resolution, and the
 * ready/degraded/422 outcome. The store is the real library store on a temp dir;
 * the fetcher and DNS resolver are injected, so `deny-network.mjs` sees zero
 * egress.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStore } from './local-store.js'
import { createLocalInspirationDispatcher, LOCAL_PREFIX } from './http-routes.js'
import { CAPTURE_HEADER_MAX_LENGTH, sanitizeCaptureHeaders } from './capture-handler.js'

const CAPTURE_URL = `${LOCAL_PREFIX}/capture`
const SOURCE_URL = 'https://www.douyin.com/video/7126745726494825736'
const VIDEO_URL = 'https://v16.douyin.example/play.mp4'
const COVER_URL = 'https://p3.douyinpic.example/cover.jpg'

/** Leading bytes that the downloader's sniffer accepts as real media. */
const MP4_BYTES = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
])
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)])

/** Offline `dns.lookup` stand-in: no test resolves a real hostname. */
async function offlineResolver(hostname) {
  return [{ address: '93.184.216.34', family: 4, hostname }]
}

function isImageUrl(url) {
  return /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)
}

function mediaResponse(url) {
  const image = isImageUrl(url)
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': image ? 'image/jpeg' : 'video/mp4' }),
    arrayBuffer: async () => (image ? JPEG_BYTES : MP4_BYTES),
  }
}

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'inspiration-capture-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/**
 * Build a dispatcher over a real temp-dir store and a recording fetcher.
 * @param {{ failUrl?: string, failStatus?: number }} [opts]
 */
function makeWorld(opts = {}) {
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
  const calls = []
  const failUrl = opts.failUrl || ''
  const failStatus = opts.failStatus || 0
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init })
    if (failUrl && url === failUrl) return { ok: false, status: failStatus, headers: new Headers() }
    return mediaResponse(url)
  }
  const dispatcher = createLocalInspirationDispatcher({ localStore: store, fetcher, resolver: offlineResolver })
  return { dispatcher, store, paths, calls }
}

function captureBody(overrides = {}) {
  return Object.assign({
    platform: 'douyin',
    source_url: SOURCE_URL,
    title: '三秒钩子：这个拖把真的不用手洗',
    content: '正文文案',
    content_shape: 'video',
    author: { name: '洁净生活家', handle: 'cleanlife' },
    stats: { likes: 1200, comments: 34, bogus: 'ignored' },
    posted_at: '2026-10-20T00:00:00.000Z',
    cover_url: COVER_URL,
    media: [{
      type: 'video',
      url: VIDEO_URL,
      headers: {
        Referer: 'https://www.douyin.com/',
        'User-Agent': 'Mozilla/5.0 fixture',
        Cookie: 'sid=secret-cookie',
        'X-Trace': 'drop-me',
      },
    }],
    tags: ['抖音', '灵感采集'],
  }, overrides)
}

function post(dispatcher, body) {
  return dispatcher.dispatch({ method: 'POST', url: CAPTURE_URL, body })
}

describe('capture route — happy path', () => {
  it('downloads media and cover, then writes a ready library row', async () => {
    const world = makeWorld()

    const response = await post(world.dispatcher, captureBody())

    assert.equal(response.status, 201)
    const data = response.body.data
    assert.equal(data.source_platform, 'douyin')
    assert.equal(data.source_url, SOURCE_URL)
    assert.equal(data.type, 'video')
    assert.equal(data.content_shape, 'video')
    assert.equal(data.auto_analyze, false)
    assert.equal(data.import_status, 'ready')
    assert.equal(data.import_stage, null)
    assert.equal(data.import_error, null)
    assert.equal(data.posted_at, '2026-10-20T00:00:00.000Z')
    assert.deepEqual(data.tags, ['抖音', '灵感采集'])
    assert.deepEqual(data.stats, { likes: 1200, comments: 34 })
    assert.deepEqual(data.author, { name: '洁净生活家', handle: 'cleanlife' })

    assert.equal(data.media_items.length, 1)
    assert.match(data.media_items[0].url, /^\/omnimux\/inspiration\/local\/media\/videos\/video_[a-z0-9]+\.mp4$/)
    assert.deepEqual(data.media_urls, [data.media_items[0].url])
    assert.match(data.cover_url, /^\/omnimux\/inspiration\/local\/media\/covers\/cover_[a-z0-9]+\.jpg$/)
    assert.ok(existsSync(data.local_paths.video), 'video must be on disk')
    assert.ok(existsSync(data.local_paths.cover), 'cover must be on disk')
    assert.ok(existsSync(join(world.paths.videosDir, data.local_paths.video.split('/').pop())))
    assert.equal(world.store.list().total, 1)
    assert.equal(world.store.get(data.id).id, data.id)

    // 下载请求确实带上了白名单 header；cover 下载不带。
    const mediaCall = world.calls.find((call) => call.url === VIDEO_URL)
    assert.ok(mediaCall)
    assert.equal(mediaCall.init.headers.referer, 'https://www.douyin.com/')
    assert.equal(mediaCall.init.headers['user-agent'], 'Mozilla/5.0 fixture')
    assert.equal(mediaCall.init.headers.cookie, 'sid=secret-cookie')
    assert.equal(Object.hasOwn(mediaCall.init.headers, 'x-trace'), false, 'unknown header must be dropped')
    const coverCall = world.calls.find((call) => call.url === COVER_URL)
    assert.ok(coverCall)
    assert.equal(coverCall.init.headers, undefined, 'cover download must not carry media headers')

    // header 值不落库：库文件里只有 URL/元数据。
    const library = readFileSync(world.paths.libraryFile, 'utf8')
    assert.equal(library.includes('secret-cookie'), false)
    assert.equal(library.includes('drop-me'), false)
  })

  it('reuses an image media item as the cover without a second download', async () => {
    const world = makeWorld()
    const imageUrl = 'https://p3.douyinpic.example/first.jpg'

    const response = await post(world.dispatcher, captureBody({
      content_shape: undefined,
      cover_url: imageUrl,
      media: [
        { type: 'video', url: VIDEO_URL, headers: { referer: 'https://www.douyin.com/' } },
        { type: 'image', url: imageUrl },
        { type: 'image', url: 'https://p3.douyinpic.example/second.jpg' },
      ],
    }))

    assert.equal(response.status, 201)
    const data = response.body.data
    assert.equal(data.type, 'video')
    assert.equal(data.content_shape, 'video')
    assert.equal(data.media_items.length, 3)
    const imageItem = data.media_items.find((item) => item.url.endsWith('.jpg'))
    assert.equal(data.cover_url, imageItem.url)
    assert.equal(data.local_paths.cover, data.local_paths.image_1)
    assert.equal(world.calls.filter((call) => call.url === imageUrl).length, 1, 'cover image must be downloaded once')
  })

  it('derives a gallery and uses the first image as cover when no cover_url is given', async () => {
    const world = makeWorld()
    const first = 'https://p3.douyinpic.example/a.jpg'
    const second = 'https://p3.douyinpic.example/b.jpg'

    const response = await post(world.dispatcher, captureBody({
      content_shape: undefined,
      cover_url: undefined,
      media: [
        { type: 'image', url: first },
        { type: 'image', url: second },
      ],
    }))

    assert.equal(response.status, 201)
    const data = response.body.data
    assert.equal(data.type, 'image')
    assert.equal(data.content_shape, 'gallery')
    assert.equal(data.media_items.length, 2)
    assert.equal(data.cover_url, data.media_items[0].url)
    assert.equal(data.local_paths.cover, data.local_paths.image_1)
  })
})

describe('capture route — header sanitization', () => {
  it('keeps only the allowlisted headers, lowercases keys, strips CRLF and truncates', () => {
    const sanitized = sanitizeCaptureHeaders({
      Referer: 'https://www.douyin.com/',
      'User-Agent': 'UA',
      Cookie: 'a=1\r\nX-Evil: injected',
      'X-Forwarded-For': '1.2.3.4',
      authorization: 'Bearer secret',
      Empty: '   ',
      Numeric: 42,
    })

    assert.deepEqual(Object.keys(sanitized).sort(), ['cookie', 'referer', 'user-agent'])
    assert.equal(sanitized.referer, 'https://www.douyin.com/')
    assert.equal(sanitized['user-agent'], 'UA')
    assert.equal(sanitized.cookie, 'a=1 X-Evil: injected', 'CRLF becomes a space, so no header can be injected')
    assert.equal(/[\r\n]/.test(sanitized.cookie), false)

    const long = sanitizeCaptureHeaders({ cookie: 'x'.repeat(CAPTURE_HEADER_MAX_LENGTH + 500) })
    assert.equal(long.cookie.length, CAPTURE_HEADER_MAX_LENGTH)

    assert.deepEqual(sanitizeCaptureHeaders(null), {})
    assert.deepEqual(sanitizeCaptureHeaders(['cookie']), {})
  })

  it('never lets a CRLF payload reach the download request', async () => {
    const world = makeWorld()

    const response = await post(world.dispatcher, captureBody({
      media: [{
        type: 'video',
        url: VIDEO_URL,
        headers: { cookie: 'sid=secret-cookie\r\nX-Injected: yes' },
      }],
    }))

    assert.equal(response.status, 201)
    const headers = world.calls.find((call) => call.url === VIDEO_URL).init.headers
    assert.equal(headers.cookie, 'sid=secret-cookie X-Injected: yes')
    assert.equal(/[\r\n]/.test(headers.cookie), false)
    assert.equal(Object.hasOwn(headers, 'x-injected'), false)
  })
})

describe('capture route — validation', () => {
  it('rejects non-public URLs, oversized media lists and malformed items', async () => {
    const world = makeWorld()
    const tooMany = Array.from({ length: 21 }, (_, index) => ({
      type: 'video',
      url: `https://cdn.douyin.example/clip-${index}.mp4`,
    }))

    const cases = [
      [captureBody({ source_url: 'http://127.0.0.1/video/7126745726494825736' }), /public http\(s\)/],
      [captureBody({ source_url: 'file:///etc/passwd' }), /public http\(s\)/],
      [captureBody({ media: tooMany }), /at most 20/],
      [captureBody({ media: [{ type: 'video', url: 'http://169.254.169.254/latest' }] }), /public http\(s\)/],
      [captureBody({ media: [{ type: 'audio', url: VIDEO_URL }] }), /must be "video" or "image"/],
      [captureBody({ cover_url: 'http://localhost/cover.jpg' }), /cover_url/],
      [captureBody({ media: [], cover_url: undefined }), /media or cover_url/],
    ]

    for (const entry of cases) {
      const response = await post(world.dispatcher, entry[0])
      assert.equal(response.status, 400, JSON.stringify(entry[0]))
      assert.match(String(response.body.error), entry[1])
    }
  })

  it('derives the platform from source_url instead of trusting the body', async () => {
    const world = makeWorld()

    const response = await post(world.dispatcher, captureBody({
      platform: 'tiktok',
      source_url: 'https://www.xiaohongshu.com/explore/66abcdef0123456789abcdef',
      cover_url: 'https://p3.douyinpic.example/cover.jpg',
    }))

    assert.equal(response.status, 201)
    assert.equal(response.body.data.source_platform, 'xiaohongshu')
  })
})

describe('capture route — dedupe and upgrade', () => {
  it('returns the existing row for the same canonical post', async () => {
    const world = makeWorld()

    const first = await post(world.dispatcher, captureBody())
    assert.equal(first.status, 201)

    const second = await post(world.dispatcher, captureBody({
      source_url: `${SOURCE_URL}?previous_page=web_code_link`,
      media: [{ type: 'video', url: 'https://v16.douyin.example/other.mp4' }],
    }))

    assert.equal(second.status, 200)
    assert.equal(second.body.existing, true)
    assert.equal(second.body.data.id, first.body.data.id)
    assert.equal(world.store.list().total, 1)
  })

  it('upgrades a degraded video row in place', async () => {
    const world = makeWorld()
    const seeded = world.store.add({
      title: '旧记录',
      type: 'video',
      source_url: SOURCE_URL,
      media_items: [],
      local_paths: {},
      import_status: 'degraded',
      import_error: '之前失败',
    })

    const response = await post(world.dispatcher, captureBody())

    assert.equal(response.status, 201)
    assert.equal(response.body.data.id, seeded.id, 'the upgraded row keeps its id')
    assert.equal(response.body.data.media_items.length, 1)
    assert.equal(response.body.data.import_status, 'ready')
    assert.equal(response.body.data.import_error, null)
    assert.equal(world.store.list().total, 1)
  })
})

describe('capture route — partial and total failure', () => {
  it('keeps the saved media and records the first failure as degraded', async () => {
    const blockedUrl = 'https://v16.douyin.example/blocked.mp4'
    const world = makeWorld({ failUrl: blockedUrl, failStatus: 403 })

    const response = await post(world.dispatcher, captureBody({
      media: [
        { type: 'video', url: VIDEO_URL },
        { type: 'video', url: blockedUrl },
      ],
    }))

    assert.equal(response.status, 201)
    assert.equal(response.body.media_degraded, true)
    assert.match(String(response.body.degrade_reason), /HTTP 403/)
    const data = response.body.data
    assert.equal(data.import_status, 'degraded')
    assert.match(String(data.import_error), /HTTP 403/)
    assert.equal(data.media_items.length, 1)
    assert.ok(existsSync(data.local_paths.video))
    assert.equal(world.store.list().total, 1)
  })

  it('answers 422 and writes no row when every media download failed and no cover was saved', async () => {
    const blockedUrl = 'https://v16.douyin.example/blocked.mp4'
    const world = makeWorld({ failUrl: blockedUrl, failStatus: 404 })

    const response = await post(world.dispatcher, captureBody({
      cover_url: undefined,
      media: [{ type: 'video', url: blockedUrl }],
    }))

    assert.equal(response.status, 422)
    assert.match(String(response.body.error), /HTTP 404/)
    assert.equal(world.store.list().total, 0)
  })

  it('still stores the row when only the cover survived', async () => {
    const blockedUrl = 'https://v16.douyin.example/blocked.mp4'
    const world = makeWorld({ failUrl: blockedUrl, failStatus: 500 })

    const response = await post(world.dispatcher, captureBody({
      media: [{ type: 'video', url: blockedUrl }],
    }))

    assert.equal(response.status, 201)
    assert.equal(response.body.media_degraded, true)
    const data = response.body.data
    assert.equal(data.type, 'image')
    assert.equal(data.import_status, 'degraded')
    assert.equal(data.media_items.length, 0)
    assert.ok(existsSync(data.local_paths.cover))
    assert.match(data.cover_url, /^\/omnimux\/inspiration\/local\/media\/covers\//)
  })
})
