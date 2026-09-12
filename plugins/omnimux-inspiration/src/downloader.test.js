import assert from 'node:assert/strict'
import { after, beforeEach, describe, it } from 'node:test'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ReadableStream } from 'node:stream/web'
import { DOWNLOAD_TIMEOUT_MS, MAX_DOWNLOAD_BYTES, detectExt, downloadMedia } from './downloader.js'

const PUBLIC_MP4 = 'https://video.twimg.com/amplify_video/1/vid/1280x720/high.mp4'

function streamResponse(chunks, headers = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk))
        controller.close()
      },
    }),
  }
}

function bufferResponse(buffer, headers = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    arrayBuffer: async () => buffer,
  }
}

describe('downloadMedia — download target policy', () => {
  let dir

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'omnimux-downloader-'))
  })

  after(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses the cloud metadata endpoint and loopback before any request', async () => {
    const requested = []
    const fetcher = async (url) => {
      requested.push(url)
      return bufferResponse(Buffer.from('nope'))
    }

    for (const target of [
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      'http://127.0.0.1:45120/omnimux/inspiration/local/items',
      'http://10.1.2.3/stream.mp4',
      'http://192.168.0.10/stream.mp4',
      'file:///etc/passwd',
    ]) {
      await assert.rejects(() => downloadMedia(target, dir, { fetcher }), /拒绝下载/)
    }
    assert.deepEqual(requested, [])
    assert.deepEqual(readdirSync(dir), [])
  })

  it('downloads a public direct link and reports its extension', async () => {
    const fetcher = async () => bufferResponse(Buffer.from('fake-media'))
    const saved = await downloadMedia(PUBLIC_MP4, dir, { fetcher, prefix: 'video_' })

    assert.match(saved, /video_[0-9a-f]{8}\.mp4$/)
    assert.deepEqual(readdirSync(dir), [saved.split('/').pop()])
  })

  it('aborts a response that exceeds the byte ceiling and leaves no file behind', async () => {
    const fetcher = async () => streamResponse([new Uint8Array(20), new Uint8Array(20), new Uint8Array(20)])

    await assert.rejects(
      () => downloadMedia(PUBLIC_MP4, dir, { fetcher, maxBytes: 32 }),
      /媒体文件超过大小上限/,
    )
    assert.deepEqual(readdirSync(dir), [])
  })

  it('rejects an oversized declared content-length before streaming', async () => {
    const fetcher = async () => streamResponse([new Uint8Array(4)], { 'content-length': '1048576' })

    await assert.rejects(
      () => downloadMedia(PUBLIC_MP4, dir, { fetcher, maxBytes: 1024 }),
      /媒体文件超过大小上限/,
    )
    assert.deepEqual(readdirSync(dir), [])
  })

  it('rejects an oversized buffered body', async () => {
    const fetcher = async () => bufferResponse(Buffer.alloc(4096))

    await assert.rejects(
      () => downloadMedia(PUBLIC_MP4, dir, { fetcher, maxBytes: 1024 }),
      /媒体文件超过大小上限/,
    )
    assert.deepEqual(readdirSync(dir), [])
  })

  it('times out a hanging transfer and cleans the partial file', async () => {
    const fetcher = (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason))
    })

    await assert.rejects(() => downloadMedia(PUBLIC_MP4, dir, { fetcher, timeoutMs: 20 }), /abort/i)
    assert.deepEqual(readdirSync(dir), [])
  })

  it('validates every redirect hop and stops before contacting a private host', async () => {
    const requested = []
    const fetcher = async (url) => {
      requested.push(url)
      if (url.startsWith('https://cdn.example.com/start')) {
        return {
          ok: false,
          status: 302,
          headers: new Headers({ location: 'http://169.254.169.254/steal.mp4' }),
        }
      }
      return bufferResponse(Buffer.from('should never happen'))
    }

    await assert.rejects(
      () => downloadMedia('https://cdn.example.com/start.mp4', dir, { fetcher }),
      /拒绝下载本机\/内网地址/,
    )
    assert.deepEqual(requested, ['https://cdn.example.com/start.mp4'])
    assert.deepEqual(readdirSync(dir), [])
  })

  it('follows a redirect to another public host', async () => {
    const fetcher = async (url) => (url.startsWith('https://cdn.example.com/start')
      ? { ok: false, status: 301, headers: new Headers({ location: 'https://mirror.example.com/final.mp4' }) }
      : bufferResponse(Buffer.from('media')))

    const saved = await downloadMedia('https://cdn.example.com/start.mp4', dir, { fetcher })

    assert.match(saved, /\.mp4$/)
    assert.deepEqual(readdirSync(dir), [saved.split('/').pop()])
  })

  it('stops after too many redirect hops', async () => {
    let hop = 0
    const fetcher = async () => {
      hop += 1
      return { ok: false, status: 302, headers: new Headers({ location: `https://cdn.example.com/hop-${hop}.mp4` }) }
    }

    await assert.rejects(() => downloadMedia('https://cdn.example.com/start.mp4', dir, { fetcher }), /重定向次数超过/)
    assert.deepEqual(readdirSync(dir), [])
  })

  it('surfaces a non-2xx response without leaving a temp file', async () => {
    const fetcher = async () => ({ ok: false, status: 404, headers: new Headers() })

    await assert.rejects(() => downloadMedia(PUBLIC_MP4, dir, { fetcher }), /HTTP 404/)
    assert.deepEqual(readdirSync(dir), [])
  })

  it('keeps the container detection and the default budgets', () => {
    assert.equal(detectExt('https://cdn.example.com/a.mp4'), '.mp4')
    assert.equal(detectExt('https://cdn.example.com/a.webm'), '.webm')
    assert.equal(detectExt('https://cdn.example.com/a.m3u8'), '.mp4')
    assert.equal(detectExt('not a url'), '.mp4')
    assert.equal(MAX_DOWNLOAD_BYTES, 512 * 1024 * 1024)
    assert.equal(DOWNLOAD_TIMEOUT_MS, 60_000)
  })
})
