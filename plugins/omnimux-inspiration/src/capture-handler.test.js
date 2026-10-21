/**
 * `POST /omnimux/inspiration/local/capture` — the host half of the extension's
 * in-page capture, on the 202 accepted / background download contract.
 *
 * Layer under test: route table → `handleCapture` → header sanitization, public
 * URL validation, dedupe/idempotency, then the background job (sequential
 * downloads, cover resolution) settling the row ready / degraded / failed. The
 * store is the real library store on a temp dir; the fetcher and DNS resolver
 * are injected, so `deny-network.mjs` sees zero egress.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStore } from './local-store.js'
import { createLocalInspirationDispatcher, LOCAL_PREFIX } from './http-routes.js'
import {
  CAPTURE_DOWNLOAD_TIMEOUT_MS,
  CAPTURE_HEADER_MAX_LENGTH,
  captureJobs,
  captureJobsSettled,
  sanitizeCaptureHeaders,
} from './capture-handler.js'
import { activeJobs, sweepStaleImports } from './http-handlers.js'
import { IMPORT_STALE_AFTER_MS, IMPORT_STALE_ERROR, findStaleImports } from './import-status.js'

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
/** Per-test sequence so one test may build several isolated dispatchers. */
let worldSeq = 0
/** Gate resolvers for worlds whose fetcher waits before answering. */
const pendingReleases = new Set()

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'inspiration-capture-'))
  worldSeq = 0
})

afterEach(async () => {
  // 失败的用例也不能把后台下载挂在 300s 的超时上：先放行所有门控，再等任务收敛。
  for (const release of pendingReleases) release()
  pendingReleases.clear()
  await captureJobsSettled()
  rmSync(root, { recursive: true, force: true })
})

/**
 * Build a dispatcher over a real temp-dir store and a recording fetcher.
 *
 * `holdDownloads` makes every request wait on a gate so a test can observe the
 * row while its background job is genuinely in flight; `failingUrls` /
 * `failStatus` make the matching downloads answer a non-ok response.
 * @param {{ failUrl?: string, failStatus?: number, failingUrls?: string[], holdDownloads?: boolean }} [opts]
 */
function makeWorld(opts = {}) {
  const dir = join(root, `home-${++worldSeq}`)
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
  const failStatus = opts.failStatus ?? 500
  const failingUrls = new Set(opts.failingUrls || (opts.failUrl ? [opts.failUrl] : []))
  let releaseGate = null
  const gate = opts.holdDownloads
    ? new Promise((resolve) => {
      releaseGate = () => resolve()
      pendingReleases.add(releaseGate)
    })
    : null
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init })
    if (gate) await gate
    if (failingUrls.has(url)) return { ok: false, status: failStatus, headers: new Headers() }
    return mediaResponse(url)
  }
  const dispatcher = createLocalInspirationDispatcher({ localStore: store, fetcher, resolver: offlineResolver })
  return {
    dispatcher,
    store,
    paths,
    calls,
    releaseDownloads() {
      releaseGate?.()
      pendingReleases.delete(releaseGate)
    },
  }
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

function poll(dispatcher, id) {
  return dispatcher.dispatch({ method: 'GET', url: `${LOCAL_PREFIX}/${id}` })
}

/** Wait for a precondition that a background job reaches asynchronously. */
async function waitUntil(predicate, label, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

describe('capture route — 202 acceptance and background completion', () => {
  it('accepts with 202 and import placeholder, then settles the row ready', async () => {
    // 后台单条下载预算比同步导入大得多：这是本契约存在的理由。
    assert.equal(CAPTURE_DOWNLOAD_TIMEOUT_MS, 300_000)
    const world = makeWorld()

    const response = await post(world.dispatcher, captureBody())

    // 受理是同步的：请求不等下载，直接拿 importing 占位行。
    assert.equal(response.status, 202)
    assert.equal(response.body.accepted, true)
    assert.deepEqual(Object.keys(response.body).sort(), ['accepted', 'data'])
    const placeholder = response.body.data
    const id = placeholder.id
    assert.equal(placeholder.import_status, 'importing')
    assert.equal(placeholder.import_stage, 'downloading')
    assert.equal(placeholder.type, 'video')
    assert.equal(placeholder.import_error, null)
    assert.ok(Number.isFinite(Date.parse(placeholder.import_started_at)), 'import_started_at must be ISO')
    assert.deepEqual(placeholder.media_items, [])
    assert.deepEqual(placeholder.media_urls, [])
    assert.deepEqual(placeholder.local_paths, {})
    assert.equal(captureJobs.size, 1, 'the accepted row owns exactly one background job')
    assert.equal(activeJobs.has(id), true, 'the live job id blocks the stale sweep')

    // 轮询端点复用 GET /local/:id：受理后立刻能读到 importing 行。
    const acceptedPoll = await poll(world.dispatcher, id)
    assert.equal(acceptedPoll.status, 200)
    assert.equal(acceptedPoll.body.data.import_status, 'importing')

    await captureJobsSettled()

    assert.equal(captureJobs.size, 0, 'a settled job leaves the registry')
    assert.equal(activeJobs.has(id), false)

    const data = world.store.get(id)
    assert.equal(data.id, id)
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

    // 完成后再轮询读到的是 ready 行。
    const settledPoll = await poll(world.dispatcher, id)
    assert.equal(settledPoll.status, 200)
    assert.equal(settledPoll.body.data.import_status, 'ready')
    assert.equal(settledPoll.body.data.local_paths.video, data.local_paths.video)

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

    assert.equal(response.status, 202)
    await captureJobsSettled()

    const data = world.store.get(response.body.data.id)
    assert.equal(data.import_status, 'ready')
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

    assert.equal(response.status, 202)
    await captureJobsSettled()

    const data = world.store.get(response.body.data.id)
    assert.equal(data.import_status, 'ready')
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

    assert.equal(response.status, 202)
    await captureJobsSettled()
    const headers = world.calls.find((call) => call.url === VIDEO_URL).init.headers
    assert.equal(headers.cookie, 'sid=secret-cookie X-Injected: yes')
    assert.equal(/[\r\n]/.test(headers.cookie), false)
    assert.equal(Object.hasOwn(headers, 'x-injected'), false)
  })
})

describe('capture route — validation', () => {
  it('rejects non-public URLs, oversized media lists and malformed items before accepting', async () => {
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
    assert.equal(world.store.list().total, 0, 'a rejected capture writes no row')
    assert.equal(captureJobs.size, 0, 'a rejected capture starts no job')
  })

  it('derives the platform from source_url instead of trusting the body', async () => {
    const world = makeWorld()

    const response = await post(world.dispatcher, captureBody({
      platform: 'tiktok',
      source_url: 'https://www.xiaohongshu.com/explore/66abcdef0123456789abcdef',
      cover_url: 'https://p3.douyinpic.example/cover.jpg',
    }))

    assert.equal(response.status, 202)
    assert.equal(response.body.data.source_platform, 'xiaohongshu')
    await captureJobsSettled()
    assert.equal(world.store.get(response.body.data.id).source_platform, 'xiaohongshu')
  })
})

describe('capture route — idempotency and in-place upgrade', () => {
  it('answers 202 existing while downloading, then 200 existing once ready', async () => {
    const world = makeWorld({ holdDownloads: true })

    const first = await post(world.dispatcher, captureBody())
    assert.equal(first.status, 202)
    const id = first.body.data.id
    await waitUntil(() => world.calls.length > 0, 'the background download to start')

    // 下载还没结束：同一个作品（canonical 相同，带追踪参数）只返回既有行。
    const whileDownloading = await post(world.dispatcher, captureBody({
      source_url: `${SOURCE_URL}?previous_page=web_code_link`,
      media: [{ type: 'video', url: 'https://v16.douyin.example/other.mp4' }],
    }))
    assert.equal(whileDownloading.status, 202)
    assert.equal(whileDownloading.body.existing, true)
    assert.equal(whileDownloading.body.accepted, true)
    assert.deepEqual(Object.keys(whileDownloading.body).sort(), ['accepted', 'data', 'existing'])
    assert.equal(whileDownloading.body.data.id, id)
    assert.equal(whileDownloading.body.data.import_status, 'importing')
    assert.equal(captureJobs.size, 1, 'the repeat POST must not start a second job')
    assert.equal(world.calls.filter((call) => call.url === VIDEO_URL).length, 1)
    assert.equal(world.store.list().total, 1)

    world.releaseDownloads()
    await captureJobsSettled()
    assert.equal(world.store.get(id).import_status, 'ready')

    // 已 ready：直接 200 existing，不再受理新任务。
    const afterReady = await post(world.dispatcher, captureBody({
      source_url: `${SOURCE_URL}?previous_page=web_code_link`,
    }))
    assert.equal(afterReady.status, 200)
    assert.equal(afterReady.body.existing, true)
    assert.deepEqual(Object.keys(afterReady.body).sort(), ['data', 'existing'])
    assert.equal(afterReady.body.data.id, id)
    assert.equal(afterReady.body.data.import_status, 'ready')
    assert.equal(captureJobs.size, 0)
    assert.equal(world.store.list().total, 1)
  })

  it('upgrades a degraded or legacy row in place and keeps its id', async () => {
    const seeds = [
      { label: 'degraded', fields: { import_status: 'degraded', import_error: '之前失败' } },
      { label: 'legacy', fields: {} },
    ]

    for (const seed of seeds) {
      const world = makeWorld()
      const seeded = world.store.add(Object.assign({
        title: '旧记录',
        type: 'video',
        source_url: SOURCE_URL,
        media_items: [],
        local_paths: {},
      }, seed.fields))

      const response = await post(world.dispatcher, captureBody())

      assert.equal(response.status, 202, seed.label)
      assert.equal(response.body.accepted, true, seed.label)
      assert.equal(response.body.data.id, seeded.id, `${seed.label}: the upgraded row keeps its id`)
      assert.equal(response.body.data.import_status, 'importing', seed.label)
      assert.equal(response.body.data.import_error, null, `${seed.label}: the stale error is cleared`)

      await captureJobsSettled()

      const row = world.store.get(seeded.id)
      assert.equal(row.id, seeded.id, seed.label)
      assert.equal(row.import_status, 'ready', seed.label)
      assert.equal(row.import_error, null, seed.label)
      assert.equal(row.media_items.length, 1, seed.label)
      assert.ok(existsSync(row.local_paths.video), seed.label)
      assert.equal(world.store.list().total, 1, `${seed.label}: no duplicate row`)
    }
  })
})

describe('capture route — failure convergence', () => {
  it('settles the row failed instead of answering 422 when every media and the cover fail', async () => {
    const world = makeWorld({ failStatus: 404, failingUrls: [VIDEO_URL, COVER_URL] })

    const response = await post(world.dispatcher, captureBody())

    // 受理已经完成：失败属于后台任务，不再用 HTTP 422 表达。
    assert.equal(response.status, 202)
    assert.equal(response.body.data.import_status, 'importing')
    const id = response.body.data.id

    await captureJobsSettled()

    const row = world.store.get(id)
    assert.equal(row.import_status, 'failed')
    assert.equal(row.import_stage, null)
    assert.match(String(row.import_error), /HTTP 404/)
    assert.equal(row.media_items.length, 0, 'no fake success media')
    assert.deepEqual(row.media_urls, [])
    assert.deepEqual(row.local_paths, {}, 'partial files are cleaned up')
    assert.equal(existsSync(world.paths.videosDir) ? readdirSync(world.paths.videosDir).length : 0, 0)
    assert.equal(existsSync(world.paths.coversDir) ? readdirSync(world.paths.coversDir).length : 0, 0)
    assert.equal(world.store.list().total, 1, 'the failed row stays listed and retryable')
    assert.equal(activeJobs.has(id), false)
  })

  it('keeps the saved media and settles degraded with the first failure as import_error', async () => {
    const blockedUrl = 'https://v16.douyin.example/blocked.mp4'
    const world = makeWorld({ failStatus: 403, failingUrls: [blockedUrl] })

    const response = await post(world.dispatcher, captureBody({
      media: [
        { type: 'video', url: VIDEO_URL },
        { type: 'video', url: blockedUrl },
      ],
    }))

    assert.equal(response.status, 202)
    await captureJobsSettled()

    const data = world.store.get(response.body.data.id)
    assert.equal(data.import_status, 'degraded')
    assert.match(String(data.import_error), /HTTP 403/)
    assert.equal(data.media_items.length, 1)
    assert.ok(existsSync(data.local_paths.video), 'the successful file is kept')
    assert.equal(world.store.list().total, 1)
  })

  it('still stores the row when only the cover survived', async () => {
    const blockedUrl = 'https://v16.douyin.example/blocked.mp4'
    const world = makeWorld({ failStatus: 500, failingUrls: [blockedUrl] })

    const response = await post(world.dispatcher, captureBody({
      media: [{ type: 'video', url: blockedUrl }],
    }))

    assert.equal(response.status, 202)
    await captureJobsSettled()

    const data = world.store.get(response.body.data.id)
    assert.equal(data.type, 'image')
    assert.equal(data.import_status, 'degraded')
    assert.match(String(data.import_error), /HTTP 500/)
    assert.equal(data.media_items.length, 0)
    assert.ok(existsSync(data.local_paths.cover))
    assert.match(data.cover_url, /^\/omnimux\/inspiration\/local\/media\/covers\//)
  })
})

describe('capture route — stale sweep', () => {
  it('does not fail a live capture job whose deadline has passed', async () => {
    const world = makeWorld({ holdDownloads: true })
    const response = await post(world.dispatcher, captureBody())
    const id = response.body.data.id
    await waitUntil(() => world.calls.length > 0, 'the background download to start')
    assert.equal(activeJobs.has(id), true)

    // 把占位行伪装成超期残留：没有活跃 job 时这就是一条该被 sweep 掉的行。
    const expiredStart = new Date(Date.now() - IMPORT_STALE_AFTER_MS - 60_000).toISOString()
    world.store.update(id, { import_started_at: expiredStart })
    assert.equal(
      findStaleImports([world.store.get(id)], { activeIds: new Set() }).length,
      1,
      'without a live job this row would be stale',
    )

    // 默认 liveIds 就是 activeJobs：运行中的任务不被误杀。
    assert.equal(sweepStaleImports(world.store), null)
    const protectedRow = world.store.get(id)
    assert.equal(protectedRow.import_status, 'importing')
    assert.equal(protectedRow.import_error, null)

    world.releaseDownloads()
    await captureJobsSettled()
    assert.equal(world.store.get(id).import_status, 'ready')
    assert.equal(activeJobs.has(id), false)
    assert.equal(sweepStaleImports(world.store), null, 'a ready row is never stale')
    assert.equal(world.store.get(id).import_status, 'ready')
  })

  it('fails an expired leftover importing row that no live job owns', async () => {
    const world = makeWorld()
    const leftover = world.store.add({
      title: '宿主重启前的导入',
      type: 'video',
      source_url: 'https://www.douyin.com/video/7000000000000000001',
      import_status: 'importing',
      import_stage: 'downloading',
      import_started_at: new Date(Date.now() - IMPORT_STALE_AFTER_MS - 60_000).toISOString(),
    })
    const fresh = world.store.add({
      title: '仍在下载',
      type: 'video',
      source_url: 'https://www.douyin.com/video/7000000000000000002',
      import_status: 'importing',
      import_stage: 'downloading',
      import_started_at: new Date().toISOString(),
    })

    assert.deepEqual(
      findStaleImports(world.store.readAll()).map((row) => row.id),
      [leftover.id],
      'only the expired row is stale',
    )

    const failed = sweepStaleImports(world.store, new Set())
    assert.equal(failed?.has(leftover.id), true)

    const failedRow = world.store.get(leftover.id)
    assert.equal(failedRow.import_status, 'failed')
    assert.equal(failedRow.import_stage, null)
    assert.equal(failedRow.import_error, IMPORT_STALE_ERROR)
    assert.equal(world.store.get(fresh.id).import_status, 'importing', 'a row inside its budget is untouched')
  })
})
