/**
 * Host-side download of one lit page media.
 *
 * Contract: `specs/browser-attach-media.spec.md` §3.1 — the host fetches on the
 * panel's behalf (the extension page may not reach the open internet), and the
 * capability must stay narrow. Narrow has two halves, and most of this file is
 * about the second one: the host must not be talked into becoming a general web
 * client *for the panel*, so loopback and private-network targets are refused and
 * every redirect hop is re-validated before it is dialed.
 *
 * The no-dial guarantee itself is proved against a live socket by
 * `tmp/browser-attach-media/host-fetch-security-probe.mjs` (13/13), which is the
 * only way to tell "refused before dialing" from "refused after a response".
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import type { BridgeFrame } from '../src/protocol.ts'
import { BRIDGE_FETCH_MEDIA_METHOD } from '../src/protocol.ts'
import { BridgeServer } from '../src/server.ts'
import type { BrowserHostApi } from '../src/host-api.ts'
import {
  fetchMediaBytes,
  isFetchableMediaUrl,
  isLocalHostname,
  MEDIA_FETCH_BAD_REQUEST_MESSAGE,
  MEDIA_FETCH_FAILED_MESSAGE,
  MEDIA_FETCH_MAX_BYTES,
  MEDIA_FETCH_MAX_REDIRECTS,
  MEDIA_FETCH_TIMEOUT_MS,
} from '../src/media-fetch.ts'
import { parseMediaFetchOutcome } from '../src/protocol.ts'

/**
 * A response the host can read without a network.
 *
 * `content-length` is derived from the body unless the case overrides it, which is
 * what a real server does — the module treats a body-less response with no
 * declared length as unmeasurable and refuses it.
 */
function response(body: Uint8Array | null, options: {
  status?: number
  contentType?: string
  contentLength?: string
  location?: string
  url?: string
  streaming?: boolean
} = {}): Response {
  const status = options.status ?? 200
  const headers = new Headers()
  if (options.contentType !== undefined) headers.set('content-type', options.contentType)
  if (options.location !== undefined) headers.set('location', options.location)
  const declared = options.contentLength ?? (body !== null && options.streaming !== true ? String(body.byteLength) : undefined)
  if (declared !== undefined) headers.set('content-length', declared)
  if (options.streaming === true && body !== null) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers,
      url: options.url ?? '',
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(body)
          controller.close()
        },
      }),
    } as unknown as Response
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    url: options.url ?? '',
    body: null,
    arrayBuffer: async () => body === null ? new ArrayBuffer(0) : body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  } as unknown as Response
}

function fetchReturning(value: Response | (() => Promise<Response>)): typeof fetch {
  return (async () => (typeof value === 'function' ? await value() : value)) as unknown as typeof fetch
}

/** A fetch that records every address it was asked to dial. */
function recordingFetch(...responses: Response[]): { impl: typeof fetch; dialed: string[] } {
  const dialed: string[] = []
  const impl = (async (url: string) => {
    dialed.push(url)
    const next = responses.shift()
    if (next === undefined) throw new Error(`unexpected dial: ${url}`)
    return next
  }) as unknown as typeof fetch
  return { impl, dialed }
}

describe('isLocalHostname', () => {
  it('flags every loopback, private, link-local and mDNS spelling', () => {
    for (const host of [
      'localhost', 'LOCALHOST', 'app.localhost', 'printer.local',
      '127.0.0.1', '127.1.2.3', '0.0.0.0',
      '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1',
      '169.254.169.254', // the cloud metadata address
      '::1', '::', '::ffff:127.0.0.1', 'fc00::1', 'fd12:3456::1', 'fe80::1',
    ]) {
      expect(isLocalHostname(host), host).toBe(true)
    }
  })

  it('leaves public hosts alone, including the neighbours of a private range', () => {
    for (const host of [
      'cdn.example.com', 'example.com', '8.8.8.8', '1.1.1.1',
      '172.15.0.1', '172.32.0.1', // just outside 172.16/12
      '11.0.0.1', '192.169.0.1', '169.253.0.1',
      '2606:4700::1111',
    ]) {
      expect(isLocalHostname(host), host).toBe(false)
    }
  })
})

describe('isFetchableMediaUrl', () => {
  it('admits http and https only', () => {
    expect(isFetchableMediaUrl('http://cdn.example.com/a.png')).toBe(true)
    expect(isFetchableMediaUrl('https://cdn.example.com/a.png')).toBe(true)
    expect(isFetchableMediaUrl('ftp://cdn.example.com/a.png')).toBe(false)
    expect(isFetchableMediaUrl('file:///etc/passwd')).toBe(false)
    expect(isFetchableMediaUrl('data:image/png;base64,AAAA')).toBe(false)
    expect(isFetchableMediaUrl('blob:https://x/1')).toBe(false)
    expect(isFetchableMediaUrl('javascript:alert(1)')).toBe(false)
    expect(isFetchableMediaUrl('not a url')).toBe(false)
    expect(isFetchableMediaUrl('')).toBe(false)
    expect(isFetchableMediaUrl(undefined)).toBe(false)
    expect(isFetchableMediaUrl(42)).toBe(false)
  })

  it('refuses a public-looking scheme pointed at the machine or the local network', () => {
    // The panel is a web page: it could never read these cross-origin. The host
    // can, so naming one must not be enough to make it dial.
    for (const url of [
      'http://127.0.0.1:45120/ext/bridge-config',
      'http://localhost/admin',
      'http://0.0.0.0:8080/',
      'http://192.168.1.1/router',
      'http://10.0.0.5/internal',
      'http://172.20.0.9/internal',
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      'http://[::1]:43120/ext/bridge',
      'http://[fc00::1]/internal',
      'http://nas.local/secret.jpg',
    ]) {
      expect(isFetchableMediaUrl(url), url).toBe(false)
    }
  })
})

describe('fetchMediaBytes', () => {
  it('returns the bytes and the declared type for a 200', async () => {
    const fetchImpl = vi.fn(fetchReturning(response(new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' })))

    const outcome = await fetchMediaBytes('https://cdn.example.com/a.jpg', { fetchImpl })

    expect(outcome).toEqual({
      status: 'ok',
      contentType: 'image/jpeg',
      byteLength: 3,
      data: Buffer.from([1, 2, 3]).toString('base64'),
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    // Redirects are ours to follow, so the default chasing must be off.
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' })
  })

  it('reports a missing content type as an empty string rather than inventing one', async () => {
    const outcome = await fetchMediaBytes('https://cdn.example.com/a', {
      fetchImpl: fetchReturning(response(new Uint8Array([1]))),
    })
    expect(outcome).toMatchObject({ status: 'ok', contentType: '' })
  })

  it('refuses a non-http(s) address without dialing at all', async () => {
    const fetchImpl = vi.fn(fetchReturning(response(new Uint8Array([1]))))

    await expect(fetchMediaBytes('file:///etc/passwd', { fetchImpl })).resolves.toMatchObject({ status: 'bad-request' })
    await expect(fetchMediaBytes(undefined, { fetchImpl })).resolves.toMatchObject({ status: 'bad-request' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses a loopback or private address without dialing at all', async () => {
    const fetchImpl = vi.fn(fetchReturning(response(new Uint8Array([1]))))

    for (const url of ['http://127.0.0.1:45120/ext/bridge', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/x']) {
      await expect(fetchMediaBytes(url, { fetchImpl })).resolves.toEqual({
        status: 'bad-request',
        message: MEDIA_FETCH_BAD_REQUEST_MESSAGE,
      })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('follows a redirect to another public host and returns the final bytes', async () => {
    const { impl, dialed } = recordingFetch(
      response(null, { status: 302, location: 'https://cdn2.example.com/real.jpg' }),
      response(new Uint8Array([9, 9]), { contentType: 'image/jpeg' }),
    )

    const outcome = await fetchMediaBytes('https://cdn.example.com/a.jpg', { fetchImpl: impl })

    expect(outcome).toMatchObject({ status: 'ok', contentType: 'image/jpeg', byteLength: 2 })
    expect(dialed).toEqual(['https://cdn.example.com/a.jpg', 'https://cdn2.example.com/real.jpg'])
  })

  it('resolves a relative redirect against the address it came from', async () => {
    const { impl, dialed } = recordingFetch(
      response(null, { status: 301, location: '/moved/real.jpg' }),
      response(new Uint8Array([7]), { contentType: 'image/jpeg' }),
    )

    await expect(fetchMediaBytes('https://cdn.example.com/a/b.jpg', { fetchImpl: impl }))
      .resolves.toMatchObject({ status: 'ok' })
    expect(dialed).toEqual(['https://cdn.example.com/a/b.jpg', 'https://cdn.example.com/moved/real.jpg'])
  })

  it('refuses a redirect into the local network WITHOUT dialing the private target', async () => {
    const { impl, dialed } = recordingFetch(
      response(null, { status: 302, location: 'http://169.254.169.254/latest/meta-data/' }),
    )

    const outcome = await fetchMediaBytes('https://cdn.example.com/a.jpg', { fetchImpl: impl })

    expect(outcome).toEqual({ status: 'bad-request', message: MEDIA_FETCH_BAD_REQUEST_MESSAGE })
    // The load-bearing half: the metadata address was never contacted.
    expect(dialed).toEqual(['https://cdn.example.com/a.jpg'])
  })

  it('refuses a redirect with no usable location, and one that never stops', async () => {
    const missing = await fetchMediaBytes('https://cdn.example.com/a.jpg', {
      fetchImpl: fetchReturning(response(null, { status: 302 })),
    })
    expect(missing).toEqual({ status: 'bad-request', message: MEDIA_FETCH_BAD_REQUEST_MESSAGE })

    const unparsable = await fetchMediaBytes('https://cdn.example.com/a.jpg', {
      fetchImpl: fetchReturning(response(null, { status: 302, location: 'http://[' })),
    })
    expect(unparsable).toEqual({ status: 'bad-request', message: MEDIA_FETCH_BAD_REQUEST_MESSAGE })

    const endless = await fetchMediaBytes('https://cdn.example.com/a.jpg', {
      fetchImpl: fetchReturning(response(null, { status: 302, location: 'https://cdn.example.com/loop' })),
    })
    expect(endless).toEqual({ status: 'bad-request', message: MEDIA_FETCH_BAD_REQUEST_MESSAGE })
  })

  it('follows at most MEDIA_FETCH_MAX_REDIRECTS hops', async () => {
    const { impl, dialed } = recordingFetch(
      ...Array.from({ length: MEDIA_FETCH_MAX_REDIRECTS }, (_unused, index) =>
        response(null, { status: 302, location: `https://cdn.example.com/hop-${index + 1}` })),
      response(new Uint8Array([1]), { contentType: 'image/png' }),
    )

    await expect(fetchMediaBytes('https://cdn.example.com/start', { fetchImpl: impl })).resolves.toMatchObject({ status: 'ok' })
    expect(dialed).toHaveLength(MEDIA_FETCH_MAX_REDIRECTS + 1)
  })

  it('refuses the bytes when a fetch ignored the manual-redirect request and settled privately', async () => {
    // Defence in depth: if an implementation followed the redirect anyway, the
    // settled address is the last chance to notice.
    const outcome = await fetchMediaBytes('https://cdn.example.com/a.jpg', {
      fetchImpl: fetchReturning(response(new Uint8Array([1, 2, 3]), { url: 'http://10.0.0.5/internal.png' })),
    })

    expect(outcome).toEqual({ status: 'bad-request', message: MEDIA_FETCH_BAD_REQUEST_MESSAGE })
  })

  it('reports a non-2xx answer with its status code', async () => {
    await expect(fetchMediaBytes('https://cdn.example.com/gone.png', {
      fetchImpl: fetchReturning(response(null, { status: 404 })),
    })).resolves.toEqual({ status: 'http-error', statusCode: 404 })
  })

  it('reports a timeout with the budget it spent', async () => {
    const hanging = (async (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })) as unknown as typeof fetch

    const outcome = await fetchMediaBytes('https://cdn.example.com/slow.png', { fetchImpl: hanging, timeoutMs: 5 })

    expect(outcome).toEqual({ status: 'timeout', timeoutMs: 5 })
  })

  it('refuses a streamed body over the ceiling, and stops reading once it is crossed', async () => {
    const outcome = await fetchMediaBytes('https://cdn.example.com/big.png', {
      fetchImpl: fetchReturning(response(new Uint8Array(64), { streaming: true })),
      maxBytes: 16,
    })

    expect(outcome).toEqual({ status: 'too-large', limit: 16 })
  })

  it('refuses an oversized body from content-length alone, without downloading it', async () => {
    const outcome = await fetchMediaBytes('https://cdn.example.com/huge.png', {
      fetchImpl: fetchReturning(response(new Uint8Array(4), { contentLength: '99999999' })),
      maxBytes: 16,
    })

    expect(outcome).toEqual({ status: 'too-large', limit: 16 })
  })

  it('reads a body-less response only when its declared length bounds it', async () => {
    const bounded = await fetchMediaBytes('https://cdn.example.com/plain.png', {
      fetchImpl: fetchReturning(response(new Uint8Array([1, 2]), { contentLength: '2' })),
    })
    expect(bounded).toMatchObject({ status: 'ok', byteLength: 2 })

    // No stream and no declared length: reading it whole would be the one
    // unbounded path in the module, so it is refused instead.
    const unbounded = await fetchMediaBytes('https://cdn.example.com/unknown.png', {
      fetchImpl: fetchReturning(response(new Uint8Array([1, 2]), { contentLength: '' })),
    })
    expect(unbounded).toEqual({ status: 'failed', message: MEDIA_FETCH_FAILED_MESSAGE })

    const oversized = await fetchMediaBytes('https://cdn.example.com/unknown-big.png', {
      fetchImpl: fetchReturning(response(new Uint8Array([1, 2]), { contentLength: '3' })),
      maxBytes: 2,
    })
    expect(oversized).toEqual({ status: 'too-large', limit: 2 })
  })

  it('reports a transport failure as a fixed line, keeping the cause host-side', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const outcome = await fetchMediaBytes('https://cdn.example.com/boom.png', {
      fetchImpl: (async () => { throw new TypeError('getaddrinfo ENOTFOUND internal-host.local') }) as unknown as typeof fetch,
    })

    expect(outcome).toEqual({ status: 'failed', message: MEDIA_FETCH_FAILED_MESSAGE })
    // Whatever crosses the bridge must not name an internal host or a path.
    expect(JSON.stringify(outcome)).not.toContain('internal-host.local')
    expect(JSON.stringify(outcome)).not.toContain('getaddrinfo')
    // The detail is not lost, it just stays on the host side.
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[1])).toContain('internal-host.local')
    warn.mockRestore()
  })

  it('defaults to a bounded budget and ceiling', () => {
    expect(MEDIA_FETCH_TIMEOUT_MS).toBe(9_000)
    expect(MEDIA_FETCH_MAX_BYTES).toBe(8 * 1024 * 1024)
    expect(MEDIA_FETCH_MAX_REDIRECTS).toBe(5)
  })
})

describe('parseMediaFetchOutcome', () => {
  it('accepts every shape the host produces', () => {
    expect(parseMediaFetchOutcome({ status: 'ok', contentType: '', byteLength: 1, data: 'AQ==' }))
      .toEqual({ status: 'ok', contentType: '', byteLength: 1, data: 'AQ==' })
    expect(parseMediaFetchOutcome({ status: 'bad-request', message: 'no' })).toEqual({ status: 'bad-request', message: 'no' })
    expect(parseMediaFetchOutcome({ status: 'timeout', timeoutMs: 9_000 })).toEqual({ status: 'timeout', timeoutMs: 9_000 })
    expect(parseMediaFetchOutcome({ status: 'too-large', limit: 8 })).toEqual({ status: 'too-large', limit: 8 })
    expect(parseMediaFetchOutcome({ status: 'http-error', statusCode: 500 })).toEqual({ status: 'http-error', statusCode: 500 })
    expect(parseMediaFetchOutcome({ status: 'failed', message: 'x' })).toEqual({ status: 'failed', message: 'x' })
  })

  it('rejects anything else that could arrive over the socket', () => {
    // An unreadable body must never reach the image intake.
    expect(parseMediaFetchOutcome({ status: 'ok', contentType: 'image/png', byteLength: 1, data: '<script>' })).toBeNull()
    expect(parseMediaFetchOutcome({ status: 'ok', contentType: 'image/png', byteLength: 0, data: '' })).toBeNull()
    expect(parseMediaFetchOutcome({ status: 'ok', contentType: 7, byteLength: 1, data: 'AQ==' })).toBeNull()
    expect(parseMediaFetchOutcome({ status: 'timeout' })).toBeNull()
    expect(parseMediaFetchOutcome({ status: 'http-error', statusCode: -1 })).toBeNull()
    expect(parseMediaFetchOutcome({ status: 'unknown' })).toBeNull()
    expect(parseMediaFetchOutcome(null)).toBeNull()
    expect(parseMediaFetchOutcome('ok')).toBeNull()
    expect(parseMediaFetchOutcome([{ status: 'ok' }])).toBeNull()
  })
})

const TOKEN = 'deadbeefdeadbeefdeadbeefdeadbeef'
const CAPS = { textOnly: true as const, snapshotMaxChars: 12_000, maxInteractiveItems: 60 }

interface Harness {
  bridge: BridgeServer
  server: Server
  url: string
  callMock: ReturnType<typeof vi.fn>
}

async function startBridge(overrides: Partial<ConstructorParameters<typeof BridgeServer>[0]> = {}): Promise<Harness> {
  const callMock = vi.fn(async () => ({ ok: true as const, value: 'ok' }))
  const api: BrowserHostApi = {
    call: callMock,
    async *events() {},
    respond: async () => ({ accepted: true }),
  }
  const bridge = new BridgeServer({
    token: TOKEN,
    api,
    toolTimeoutMs: 1_000,
    caps: CAPS,
    injectBrowserSnapshot: vi.fn(),
    purgeSession: vi.fn(async () => {}),
    ...overrides,
  })
  const server = createServer()
  server.on('upgrade', (req, socket, head) => { bridge.handleUpgrade(req, socket, head) })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const port = (server.address() as AddressInfo).port
  return { bridge, server, url: `ws://127.0.0.1:${port}/ext/bridge`, callMock }
}

async function connect(url: string): Promise<{ ws: WebSocket; frames: BridgeFrame[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const frames: BridgeFrame[] = []
    ws.on('message', (data) => { frames.push(JSON.parse(data.toString()) as BridgeFrame) })
    ws.on('error', reject)
    ws.on('open', () => resolve({ ws, frames }))
  })
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((resolve) => { setTimeout(resolve, 10) })
  }
}

const harnesses: Harness[] = []
afterEach(async () => {
  for (const h of harnesses.splice(0)) {
    await h.bridge.close()
    await new Promise<void>((resolve) => { h.server.close(() => resolve()) })
  }
})

describe('BridgeServer · bridge.fetchMedia', () => {
  it('relays to the host fetcher and returns the outcome without touching the gateway', async () => {
    const outcome = { status: 'ok' as const, contentType: 'image/jpeg', byteLength: 3, data: 'AQID' }
    const fetchMedia = vi.fn(async () => outcome)
    const h = await startBridge({ fetchMedia })
    harnesses.push(h)
    const { ws, frames } = await connect(h.url)
    ws.send(JSON.stringify({ t: 'hello', token: TOKEN, caps: CAPS }))
    await waitFor(() => frames.some((frame) => frame.t === 'hello.ok'))

    ws.send(JSON.stringify({
      t: 'rpc',
      id: 'media-1',
      method: BRIDGE_FETCH_MEDIA_METHOD,
      payload: { url: 'https://cdn.example.com/a.jpg' },
    }))
    await waitFor(() => frames.some((frame) => frame.t === 'rpc.result' && frame.id === 'media-1'))

    expect(fetchMedia).toHaveBeenCalledWith('https://cdn.example.com/a.jpg')
    // The bridge owns this method: it must never be forwarded as a gateway call.
    expect(h.callMock).not.toHaveBeenCalled()
    expect(frames).toContainEqual({ t: 'rpc.result', id: 'media-1', ok: true, result: outcome })
    ws.close()
  })

  it('answers a malformed payload through the same path so the panel can report it', async () => {
    const fetchMedia = vi.fn(async (url: unknown) => (typeof url === 'string'
      ? { status: 'ok' as const, contentType: '', byteLength: 1, data: 'AQ==' }
      : { status: 'bad-request' as const, message: MEDIA_FETCH_BAD_REQUEST_MESSAGE }))
    const h = await startBridge({ fetchMedia })
    harnesses.push(h)
    const { ws, frames } = await connect(h.url)
    ws.send(JSON.stringify({ t: 'hello', token: TOKEN, caps: CAPS }))
    await waitFor(() => frames.some((frame) => frame.t === 'hello.ok'))

    ws.send(JSON.stringify({ t: 'rpc', id: 'media-bad', method: BRIDGE_FETCH_MEDIA_METHOD, payload: { url: 42 } }))
    await waitFor(() => frames.some((frame) => frame.t === 'rpc.result' && frame.id === 'media-bad'))

    // The raw field reaches the fetcher, which is the one place that decides what
    // is fetchable — so "did we read a URL" and "may we dial it" cannot disagree.
    expect(fetchMedia).toHaveBeenCalledWith(42)
    expect(frames).toContainEqual({
      t: 'rpc.result',
      id: 'media-bad',
      ok: true,
      result: { status: 'bad-request', message: MEDIA_FETCH_BAD_REQUEST_MESSAGE },
    })
    ws.close()
  })

  it('defaults to the real fetcher so a plain bridge still answers the method', async () => {
    // No `fetchMedia` override: the production wiring must be the default, not a
    // required dependency that only tests supply.
    const h = await startBridge()
    harnesses.push(h)
    const { ws, frames } = await connect(h.url)
    ws.send(JSON.stringify({ t: 'hello', token: TOKEN, caps: CAPS }))
    await waitFor(() => frames.some((frame) => frame.t === 'hello.ok'))

    ws.send(JSON.stringify({ t: 'rpc', id: 'media-default', method: BRIDGE_FETCH_MEDIA_METHOD, payload: { url: 'file:///etc/passwd' } }))
    await waitFor(() => frames.some((frame) => frame.t === 'rpc.result' && frame.id === 'media-default'))

    expect(frames).toContainEqual(expect.objectContaining({
      t: 'rpc.result',
      id: 'media-default',
      ok: true,
      result: expect.objectContaining({ status: 'bad-request' }),
    }))
    ws.close()
  })
})
