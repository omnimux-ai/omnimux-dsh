/**
 * `POST /omnimux/inspiration/local/fetch-media` — the export endpoint the
 * browser extension calls when the user picks a shortcut under the TikTok
 * avatar.
 *
 * Layer under test: the inspiration route table → `handleFetchMedia` →
 * `exportMediaFile`. The store is a stub because this route never reads a row:
 * it resolves the post, writes a file the user asked for, and answers with where
 * that file is. `media-export.test.js` owns the file-writing behaviour itself.
 *
 * Offline: the cloud resolver is a stub and both the download `fetcher` and the
 * DNS `resolver` are injected, so `deny-network.mjs` has nothing to catch.
 */

import assert from 'node:assert/strict'
import { after, beforeEach, describe, it } from 'node:test'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ReadableStream } from 'node:stream/web'
import { LOCAL_PREFIX } from './http-routes.js'
import { createLocalInspirationDispatcher } from './http-routes.js'

const FETCH_MEDIA_URL = `${LOCAL_PREFIX}/fetch-media`
const TIKTOK_URL = 'https://www.tiktok.com/@cleanlife/video/7412345678901234567'
const WATERMARK_FREE = 'https://v16-webapp.tiktokcdn.com/abc/video.mp4'

const TIKTOK_FIXTURE = {
  text: '三秒钩子：这款拖把真的不用手洗',
  author: { name: '洁净生活家', handle: 'cleanlife' },
  play_addr: { url_list: [WATERMARK_FREE] },
}

function streamResponse(chunks) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'video/mp4' }),
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk))
        controller.close()
      },
    }),
  }
}

/** Offline `dns.lookup` stand-in: no test resolves a real hostname. */
async function offlineResolver(hostname) {
  return [{ address: '93.184.216.34', family: 4, hostname }]
}

/** A store stub: this route resolves its own subject and never reads a row. */
function makeStore(dir) {
  return {
    paths: {
      dir,
      mediaDir: join(dir, 'media'),
      videosDir: join(dir, 'media', 'videos'),
      coversDir: join(dir, 'media', 'covers'),
      imagesDir: join(dir, 'media', 'images'),
    },
  }
}

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'inspiration-fetch-media-'))
})

after(() => {
  rmSync(root, { recursive: true, force: true })
})

/**
 * Build the dispatcher with every outbound seam stubbed.
 * @param {{ socialFetcher?: Function, fetcher?: typeof fetch, runFfmpeg?: Function }} [opts]
 */
function makeWorld(opts = {}) {
  const dir = mkdtempSync(join(root, 'home-'))
  const downloadsDir = join(root, 'Downloads')
  const dispatcher = createLocalInspirationDispatcher({
    localStore: makeStore(dir),
    socialFetcher: opts.socialFetcher ?? (async () => ({ data: TIKTOK_FIXTURE })),
    fetcher: opts.fetcher ?? (async () => streamResponse([[1, 2, 3, 4]])),
    resolver: offlineResolver,
    downloadsDir,
    runFfmpeg: opts.runFfmpeg,
  })
  return { dispatcher, downloadsDir, dir }
}

function post(dispatcher, body) {
  return dispatcher.dispatch({ method: 'POST', url: FETCH_MEDIA_URL, body })
}

describe('fetch-media — routing', () => {
  it('is reachable on its own path instead of falling through to the item route', async () => {
    const { dispatcher } = makeWorld()
    const response = await post(dispatcher, {})
    assert.equal(response.status, 400, `expected a validation answer, got ${JSON.stringify(response.body)}`)
    assert.match(response.body.error, /url/)
  })

  it('rejects a request that carries no url', async () => {
    const { dispatcher } = makeWorld()
    const response = await post(dispatcher, { kind: 'video' })
    assert.equal(response.status, 400)
  })

  it('rejects an export kind it does not implement, before resolving anything', async () => {
    const { dispatcher } = makeWorld({
      socialFetcher: async () => { throw new Error('the cloud must not be called') },
    })
    const response = await post(dispatcher, { url: TIKTOK_URL, kind: 'gif' })
    assert.equal(response.status, 400)
    assert.match(response.body.error, /gif/)
  })

  it('rejects a non-public address as the post to export', async () => {
    const { dispatcher } = makeWorld()
    const response = await post(dispatcher, { url: 'http://169.254.169.254/video/1', kind: 'video' })
    assert.equal(response.status, 400)
  })
})

describe('fetch-media — video export', () => {
  it('writes the watermark-free video into the downloads folder and reports where', async () => {
    const { dispatcher, downloadsDir } = makeWorld()
    const response = await post(dispatcher, { url: TIKTOK_URL, kind: 'video' })

    assert.equal(response.status, 200, JSON.stringify(response.body))
    const data = response.body.data
    assert.equal(data.kind, 'video')
    assert.ok(data.path.startsWith(downloadsDir))
    assert.ok(existsSync(data.path), 'the answer must point at a real file')
    assert.equal(data.bytes, 4)
    assert.match(data.filename, /cleanlife/)
  })

  it('answers 422 when the post has no downloadable direct link', async () => {
    const { dispatcher, downloadsDir } = makeWorld({
      socialFetcher: async () => ({ data: { text: '图文作品，没有视频', author: { handle: 'cleanlife' } } }),
    })
    const response = await post(dispatcher, { url: TIKTOK_URL, kind: 'video' })

    assert.equal(response.status, 422)
    assert.match(response.body.error, /视频直链/)
    assert.equal(existsSync(downloadsDir) ? readdirSync(downloadsDir).length : 0, 0)
  })

  it('answers 502 with the resolver reason when the cloud cannot resolve the post', async () => {
    const { dispatcher } = makeWorld({
      socialFetcher: async () => { throw new Error('region blocked') },
    })
    const response = await post(dispatcher, { url: TIKTOK_URL, kind: 'video' })

    assert.equal(response.status, 502)
    assert.match(response.body.error, /region blocked/)
  })
})

describe('fetch-media — audio export', () => {
  it('exports the soundtrack, not the video, and leaves no intermediate file', async () => {
    const { dispatcher, downloadsDir } = makeWorld({
      runFfmpeg: async (_input, output) => { writeFileSync(output, Buffer.from([7, 7, 7])) },
    })
    const response = await post(dispatcher, { url: TIKTOK_URL, kind: 'audio' })

    assert.equal(response.status, 200, JSON.stringify(response.body))
    assert.equal(response.body.data.kind, 'audio')
    assert.ok(response.body.data.path.endsWith('.m4a'))
    assert.equal(readdirSync(downloadsDir).length, 1, 'only the audio file may land in Downloads')
  })

  it('answers 502 and cleans up when the soundtrack cannot be extracted', async () => {
    const { dispatcher, downloadsDir } = makeWorld({
      runFfmpeg: async () => { throw new Error('ffmpeg: no audio stream') },
    })
    const response = await post(dispatcher, { url: TIKTOK_URL, kind: 'audio' })

    assert.equal(response.status, 502)
    assert.match(response.body.error, /no audio stream/)
    assert.equal(existsSync(downloadsDir) ? readdirSync(downloadsDir).length : 0, 0)
  })
})
