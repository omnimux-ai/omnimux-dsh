import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const transport = vi.hoisted(() => ({ requests: [] as Array<{ url: URL; options: any }>, addresses: [{ address: '8.8.8.8', family: 4 }], lookups: 0, redirect: false, encoding: '', body: null as Buffer | null, incoming: null as any, stall: false }))
vi.mock('node:dns', () => ({ lookup: (_host: string, _options: unknown, callback: Function) => {
  transport.lookups += 1
  callback(null, transport.addresses)
} }))
async function mockRequest() {
  const { EventEmitter } = await import('node:events')
  const { Readable } = await import('node:stream')
  return { request: (url: URL, options: any, onResponse: Function) => {
    transport.requests.push({ url, options })
    const req = new EventEmitter() as any
    req.end = () => options.lookup(url.hostname, { all: true }, (error: Error | null) => {
      if (error) { req.emit('error', error); return }
      const incoming = (transport.stall ? new Readable({ read() {} }) : Readable.from([transport.body ?? Buffer.from('png')])) as any
      transport.incoming = incoming
      options.signal?.addEventListener('abort', () => incoming.destroy(new Error('aborted')), { once: true })
      incoming.statusCode = transport.redirect && transport.requests.length === 1 ? 302 : 200
      incoming.headers = incoming.statusCode === 302 ? { location: 'https://next.example/image' } : { 'content-type': 'image/png', ...(transport.encoding ? { 'content-encoding': transport.encoding, 'content-length': String(transport.body?.length ?? 0) } : {}) }
      onResponse(incoming)
    })
    return req
  } }
}
vi.mock('node:http', mockRequest)
vi.mock('node:https', mockRequest)
import { fetchPublicMedia } from '../src/public-media-transport.ts'
import { fetchMediaBytes } from '../src/media-fetch.ts'
beforeEach(() => {
  transport.requests = []; transport.lookups = 0; transport.redirect = false
  transport.encoding = ''; transport.body = null; transport.incoming = null; transport.stall = false
  transport.addresses = [{ address: '8.8.8.8', family: 4 }]
})
describe('production media transport wiring', () => {
  it.each([['gzip', gzipSync], ['deflate', deflateSync], ['br', brotliCompressSync]] as const)('decodes ordinary %s media before returning bytes', async (encoding, compress) => {
    const bytes = Buffer.from('synthetic image bytes')
    transport.encoding = encoding
    transport.body = compress(bytes)
    const outcome = await fetchMediaBytes('https://cdn.example/image')
    expect(outcome).toMatchObject({ status: 'ok', data: bytes.toString('base64'), byteLength: bytes.length, contentType: 'image/png' })
  })
  it('limits decompressed bytes and destroys the upstream when the cap is exceeded', async () => {
    transport.encoding = 'gzip'
    transport.body = gzipSync(Buffer.alloc(100_000, 65))
    expect((await fetchMediaBytes('https://cdn.example/image', { maxBytes: 1000 })).status).toBe('too-large')
    await vi.waitFor(() => expect(transport.incoming.destroyed).toBe(true))
  })
  it('reports corrupt compressed streams without unhandled stream errors', async () => {
    transport.encoding = 'gzip'; transport.body = Buffer.from('invalid gzip')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await fetchMediaBytes('https://cdn.example/image')).status).toBe('failed')
    await vi.waitFor(() => expect(transport.incoming.destroyed).toBe(true))
    warning.mockRestore()
  })
  it('cancels decoding and the upstream when a caller cancels the response body', async () => {
    transport.encoding = 'gzip'; transport.stall = true
    const response = await fetchPublicMedia('https://cdn.example/image')
    await response.body!.cancel()
    await vi.waitFor(() => expect(transport.incoming.destroyed).toBe(true))
  })
  it('aborts a stalled compressed response within the existing time budget', async () => {
    transport.encoding = 'br'; transport.stall = true
    expect((await fetchMediaBytes('https://cdn.example/image', { timeoutMs: 20 })).status).toBe('timeout')
    expect(transport.incoming.destroyed).toBe(true)
  })

  it('keeps HTTPS hostname and passes checked lookup to every fresh socket', async () => {
    transport.redirect = true
    expect((await fetchMediaBytes('https://cdn.example/image?signature=kept')).status).toBe('ok')
    expect(transport.lookups).toBe(2)
    expect(transport.requests.map(({ url }) => url.hostname)).toEqual(['cdn.example', 'next.example'])
    expect(transport.requests[0]?.url.search).toBe('?signature=kept')
    expect(transport.requests.every(({ options }) => options.agent === false && typeof options.lookup === 'function')).toBe(true)
  })
  it('turns a DNS refusal into bad-request before a response can be consumed', async () => {
    transport.addresses = [{ address: '127.0.0.1', family: 4 }]
    expect((await fetchMediaBytes('https://cdn.example/image')).status).toBe('bad-request')
    expect(transport.lookups).toBe(1)
  })
})
