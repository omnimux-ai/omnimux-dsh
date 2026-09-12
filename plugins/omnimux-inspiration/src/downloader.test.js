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

/**
 * Offline `dns.lookup` stand-in for every download in this file.
 *
 * `assertDownloadableUrl` resolves the target host, so without an injected
 * resolver these tests would issue real DNS queries. Names that model a rebinding
 * host resolve to loopback/metadata here; everything else answers with a public
 * address. `asked` proves the resolver was consulted.
 * @type {string[]}
 */
const resolvedHosts = []

/** @type {Record<string, string>} */
const REBINDING_HOSTS = {
  'localtest.me': '127.0.0.1',
  '127.0.0.1.nip.io': '127.0.0.1',
  'instance-data': '169.254.169.254',
  'spoofed.attacker.example': '169.254.169.254',
  'rebind.example': '10.1.2.3',
}

/**
 * @param {string} hostname
 * @param {{ all?: boolean }} [_options]
 * @returns {Promise<Array<{ address: string, family: number }>>}
 */
async function offlineResolver(hostname, _options) {
  resolvedHosts.push(hostname)
  const address = REBINDING_HOSTS[hostname] || '93.184.216.34'
  return [{ address, family: address.includes(':') ? 6 : 4 }]
}

/**
 * Download with the offline resolver forced in, so no test resolves a real name.
 * @param {string} url
 * @param {string} destDir
 * @param {Record<string, any>} [opts]
 * @returns {Promise<string>}
 */
function downloadForTest(url, destDir, opts = {}) {
  return downloadMedia(url, destDir, { resolver: offlineResolver, ...opts })
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
    resolvedHosts.length = 0
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
      await assert.rejects(() => downloadForTest(target, dir, { fetcher }), /拒绝下载/)
    }
    assert.deepEqual(requested, [])
    assert.deepEqual(readdirSync(dir), [])
    assert.deepEqual(resolvedHosts, [], 'a literal private target must be refused before any DNS lookup')
  })

  it('downloads a public direct link and reports its extension', async () => {
    const fetcher = async () => bufferResponse(Buffer.from('fake-media'))
    const saved = await downloadForTest(PUBLIC_MP4, dir, { fetcher, prefix: 'video_' })

    assert.match(saved, /video_[0-9a-f]{8}\.mp4$/)
    assert.deepEqual(readdirSync(dir), [saved.split('/').pop()])
  })

  it('aborts a response that exceeds the byte ceiling and leaves no file behind', async () => {
    const fetcher = async () => streamResponse([new Uint8Array(20), new Uint8Array(20), new Uint8Array(20)])

    await assert.rejects(
      () => downloadForTest(PUBLIC_MP4, dir, { fetcher, maxBytes: 32 }),
      /媒体文件超过大小上限/,
    )
    assert.deepEqual(readdirSync(dir), [])
  })

  it('rejects an oversized declared content-length before streaming', async () => {
    const fetcher = async () => streamResponse([new Uint8Array(4)], { 'content-length': '1048576' })

    await assert.rejects(
      () => downloadForTest(PUBLIC_MP4, dir, { fetcher, maxBytes: 1024 }),
      /媒体文件超过大小上限/,
    )
    assert.deepEqual(readdirSync(dir), [])
  })

  it('rejects an oversized buffered body', async () => {
    const fetcher = async () => bufferResponse(Buffer.alloc(4096))

    await assert.rejects(
      () => downloadForTest(PUBLIC_MP4, dir, { fetcher, maxBytes: 1024 }),
      /媒体文件超过大小上限/,
    )
    assert.deepEqual(readdirSync(dir), [])
  })

  it('times out a hanging transfer and cleans the partial file', async () => {
    const fetcher = (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason))
    })

    await assert.rejects(() => downloadForTest(PUBLIC_MP4, dir, { fetcher, timeoutMs: 20 }), /abort/i)
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
      () => downloadForTest('https://cdn.example.com/start.mp4', dir, { fetcher }),
      /拒绝下载本机\/内网地址/,
    )
    assert.deepEqual(requested, ['https://cdn.example.com/start.mp4'])
    assert.deepEqual(readdirSync(dir), [])
  })

  it('follows a redirect to another public host', async () => {
    const fetcher = async (url) => (url.startsWith('https://cdn.example.com/start')
      ? { ok: false, status: 301, headers: new Headers({ location: 'https://mirror.example.com/final.mp4' }) }
      : bufferResponse(Buffer.from('media')))

    const saved = await downloadForTest('https://cdn.example.com/start.mp4', dir, { fetcher })

    assert.match(saved, /\.mp4$/)
    assert.deepEqual(readdirSync(dir), [saved.split('/').pop()])
  })

  it('stops after too many redirect hops', async () => {
    let hop = 0
    const fetcher = async () => {
      hop += 1
      return { ok: false, status: 302, headers: new Headers({ location: `https://cdn.example.com/hop-${hop}.mp4` }) }
    }

    await assert.rejects(() => downloadForTest('https://cdn.example.com/start.mp4', dir, { fetcher }), /重定向次数超过/)
    assert.deepEqual(readdirSync(dir), [])
  })

  it('surfaces a non-2xx response without leaving a temp file', async () => {
    const fetcher = async () => ({ ok: false, status: 404, headers: new Headers() })

    await assert.rejects(() => downloadForTest(PUBLIC_MP4, dir, { fetcher }), /HTTP 404/)
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

describe('downloadMedia — resolved host must be public (P2-B regression)', () => {
  let dir

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'omnimux-downloader-rebind-'))
  })

  after(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses a name that only resolves into loopback or the metadata service', async () => {
    const requested = []

    for (const host of Object.keys(REBINDING_HOSTS)) {
      const fetcher = async (url) => {
        requested.push(url)
        return bufferResponse(Buffer.from('should never happen'))
      }

      await assert.rejects(
        () => downloadForTest(`http://${host}/x.mp4`, dir, { fetcher }),
        /拒绝下载本机\/内网地址/,
        `${host} must be refused before it is contacted`,
      )
    }
    assert.deepEqual(requested, [], 'no request may be made to a rebinding host')
    assert.deepEqual(readdirSync(dir), [])
  })

  it('re-checks the resolved host of every redirect hop', async () => {
    const requested = []
    const fetcher = async (url) => {
      requested.push(url)
      if (url.startsWith('https://cdn.example.com/start')) {
        return { ok: false, status: 302, headers: new Headers({ location: 'http://instance-data/steal.mp4' }) }
      }
      return bufferResponse(Buffer.from('should never happen'))
    }

    await assert.rejects(
      () => downloadForTest('https://cdn.example.com/start.mp4', dir, { fetcher }),
      /拒绝下载本机\/内网地址/,
    )
    assert.deepEqual(requested, ['https://cdn.example.com/start.mp4'])
    assert.deepEqual(readdirSync(dir), [])
  })

  it('still downloads from a host that resolves to a public address', async () => {
    const fetcher = async () => bufferResponse(Buffer.from('fake-media'))

    resolvedHosts.length = 0
    const saved = await downloadForTest('https://v16-webapp.tiktokcdn.com/video.mp4', dir, { fetcher })

    assert.match(saved, /\.mp4$/)
    assert.deepEqual(resolvedHosts, ['v16-webapp.tiktokcdn.com'])
    assert.deepEqual(readdirSync(dir), [saved.split('/').pop()])
  })
})

describe('downloadMedia — non-media responses are rejected (P2-D regression)', () => {
  let dir

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'omnimux-downloader-sniff-'))
  })

  after(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects a 200 that declares text/html and leaves no file behind', async () => {
    const fetcher = async () => streamResponse(
      [new TextEncoder().encode('<!DOCTYPE html><html><body>challenge</body></html>')],
      { 'content-type': 'text/html; charset=utf-8' },
    )

    await assert.rejects(
      () => downloadForTest(PUBLIC_MP4, dir, { fetcher }),
      /content-type: text\/html/,
    )
    assert.deepEqual(readdirSync(dir), [])
  })

  it('rejects a 200 whose body opens with a document marker and leaves no file behind', async () => {
    const documents = [
      '<!DOCTYPE html>\n<html><body>captcha</body></html>',
      '<html><head><title>Access denied</title></head></html>',
      '<?xml version="1.0"?><Error><Code>AccessDenied</Code></Error>',
    ]

    for (const body of documents) {
      const fetcher = async () => streamResponse([new TextEncoder().encode(body)])

      await assert.rejects(
        () => downloadForTest(PUBLIC_MP4, dir, { fetcher }),
        /返回的不是媒体内容/,
        `${body.slice(0, 20)}… must be rejected`,
      )
      assert.deepEqual(readdirSync(dir), [], 'a rejected response must not leave a file behind')
    }
  })

  it('rejects a document body that is only distinguishable past the header check', async () => {
    // No content-type at all — the byte sniff is the only thing standing between
    // this challenge page and an `insp_*.mp4` on disk.
    const fetcher = async () => streamResponse([
      new TextEncoder().encode('  \n  <!DOCTYPE html><html><body>challenge</body></html>'),
    ])

    await assert.rejects(() => downloadForTest(PUBLIC_MP4, dir, { fetcher }), /返回的不是媒体内容/)
    assert.deepEqual(readdirSync(dir), [])
  })

  it('rejects a document body delivered through the buffered path', async () => {
    const fetcher = async () => bufferResponse(
      Buffer.from('<!DOCTYPE html><html><body>challenge</body></html>'),
    )

    await assert.rejects(() => downloadForTest(PUBLIC_MP4, dir, { fetcher }), /返回的不是媒体内容/)
    assert.deepEqual(readdirSync(dir), [])
  })

  it('keeps a genuine video/mp4 response working, including its first bytes', async () => {
    const media = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32])
    const fetcher = async () => streamResponse([media], { 'content-type': 'video/mp4' })

    const saved = await downloadForTest(PUBLIC_MP4, dir, { fetcher })

    assert.match(saved, /\.mp4$/)
    assert.deepEqual(readdirSync(dir), [saved.split('/').pop()])
  })

  it('keeps an octet-stream response working when the bytes are media', async () => {
    const media = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])
    const fetcher = async () => streamResponse([media], { 'content-type': 'application/octet-stream' })

    const saved = await downloadForTest(PUBLIC_MP4, dir, { fetcher })

    assert.match(saved, /\.mp4$/)
  })
})
