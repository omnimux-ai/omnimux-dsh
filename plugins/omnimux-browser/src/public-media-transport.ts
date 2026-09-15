import { lookup, type LookupAddress } from 'node:dns'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import { Readable, pipeline, type Transform } from 'node:stream'
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib'

export class NonPublicAddressError extends Error {}

/** Reject non-global addresses, including IPv4 transition/embedded IPv6 forms. */
export function isNonPublicAddress(value: string): boolean {
  const host = value.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  const family = isIP(host)
  if (family === 4) {
    const [a = 0, b = 0, c = 0] = host.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113)
  }
  if (family === 6) {
    // Only global unicast; transition ranges can encode non-public IPv4.
    const first = Number.parseInt(host.split(':')[0] ?? '', 16)
    if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff) return true
    return (first === 0x2001 && Number.parseInt(host.split(':')[1] || '0', 16) < 0x200) || /^2001:0?db8:/.test(host) || host.startsWith('2002:')
      || host.startsWith('3fff:')
  }
  return host === '' || host === 'localhost' || host.endsWith('.localhost')
    || host.endsWith('.local') || host.endsWith('.internal')
}

export type ResolveAddresses = (hostname: string) => Promise<LookupAddress[]>
export const resolveAddresses: ResolveAddresses = (hostname) => new Promise((resolve, reject) => {
  lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) reject(error)
    else resolve(addresses)
  })
})

/** The socket uses the validated addresses; there is no second DNS lookup. */
export function publicLookup(resolve: ResolveAddresses = resolveAddresses): LookupFunction {
  return (hostname, options, callback): void => {
    void resolve(hostname).then((addresses) => {
      if (addresses.length === 0 || addresses.some(({ address }) => isIP(address) === 0 || isNonPublicAddress(address))) {
        callback(new NonPublicAddressError('non-public destination'), [])
        return
      }
      if (options.all) callback(null, addresses)
      else callback(null, addresses[0]!.address, addresses[0]!.family)
    }, (error: unknown) => callback(error instanceof Error ? error : new Error('DNS resolution failed'), []))
  }
}

/** One hop only. Request URL retains Host and HTTPS SNI while lookup pins the socket. */
export const fetchPublicMedia: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || isNonPublicAddress(url.hostname)) {
    throw new NonPublicAddressError('non-public destination')
  }
  return await new Promise<Response>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'GET', agent: false, lookup: publicLookup(), headers: { 'accept-encoding': 'gzip, deflate, br' },
      ...(init?.signal ? { signal: init.signal } : {}),
    }, (incoming) => {
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      }
      const status = incoming.statusCode ?? 502
      if (status < 200 || status > 599) {
        incoming.destroy()
        reject(new Error('invalid response status'))
        return
      }
      if (status === 204 || status === 205 || status === 304) {
        resolve(new Response(null, { status, headers }))
        incoming.resume()
        return
      }
      const encodings = (headers.get('content-encoding') ?? '').split(',').map((value) => value.trim().toLowerCase()).filter((value) => value && value !== 'identity')
      const decoders: Transform[] = []
      for (const encoding of encodings.reverse()) {
        if (encoding === 'gzip' || encoding === 'x-gzip') decoders.push(createGunzip())
        else if (encoding === 'deflate') decoders.push(createInflate())
        else if (encoding === 'br') decoders.push(createBrotliDecompress())
        else {
          for (const decoder of decoders) decoder.destroy()
          incoming.destroy()
          reject(new Error('unsupported content encoding'))
          return
        }
      }
      let decoded: Readable = incoming
      if (decoders.length > 0) {
        // The cap counts decoded bytes, not the compressed Content-Length.
        headers.delete('content-length')
        headers.delete('content-encoding')
        decoded = decoders[decoders.length - 1]!
        // Pipeline propagates decoding, upstream and cancellation failures to
        // every stream, including the socket-backed IncomingMessage.
        pipeline([incoming, ...decoders], () => {})
      }
      const body = Readable.toWeb(decoded) as ReadableStream<Uint8Array>
      resolve(new Response(body, { status, headers }))
    })
    request.on('error', reject)
    request.end()
  })
}
