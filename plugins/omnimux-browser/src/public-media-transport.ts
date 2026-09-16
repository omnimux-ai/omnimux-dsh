import { lookup, type LookupAddress } from 'node:dns'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import { Readable, pipeline, type Transform } from 'node:stream'
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib'

export class NonPublicAddressError extends Error {}

/**
 * Where one literal address — or one hostname — can lead.
 *
 * `local` is the class this guard exists for: the machine running the host, or
 * another device on its own network. `reserved` covers names and numbers that
 * are no public destination either, yet cannot lead onto that network — which
 * is what lets a resolver answer in such a range be judged differently from a
 * URL that names one.
 */
type AddressScope = 'public' | 'local' | 'reserved'

/** The scope of one address or hostname, as this module has to tell them apart. */
function addressScope(value: string): AddressScope {
  const host = value.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  const family = isIP(host)
  if (family === 4) return ipv4Scope(host)
  if (family === 6) return ipv6Scope(host)
  return host === '' || host === 'localhost' || host.endsWith('.localhost')
    || host.endsWith('.local') || host.endsWith('.internal') ? 'local' : 'public'
}

function ipv4Scope(host: string): AddressScope {
  const [a = 0, b = 0, c = 0] = host.split('.').map(Number)
  if (a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))) return 'local'
  // Benchmark and documentation ranges: no destination, and nothing local.
  if ((a === 192 && b === 88 && c === 99)
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113)) return 'reserved'
  return 'public'
}

function ipv6Scope(host: string): AddressScope {
  // Only global unicast is a public destination; transition and embedded forms
  // (and ULA, link-local, loopback, multicast) can encode a local address.
  const first = Number.parseInt(host.split(':')[0] ?? '', 16)
  if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff) return 'local'
  return (first === 0x2001 && Number.parseInt(host.split(':')[1] || '0', 16) < 0x200)
    || /^2001:0?db8:/.test(host) || host.startsWith('2002:') || host.startsWith('3fff:')
    ? 'reserved'
    : 'public'
}

/**
 * Whether a literal address names the machine itself or a host on its own
 * network.
 *
 * This is the boundary the transport actually protects: a request the panel was
 * allowed to *name* must not reach a service the panel itself could never reach
 * (`http://127.0.0.1:…` is cross-origin to a web page, the host is not).
 */
export function isLocalAddress(value: string): boolean {
  return addressScope(value) === 'local'
}

/**
 * Whether a hostname or literal address is anything but a public unicast
 * destination, including IPv4 transition and embedded IPv6 forms.
 *
 * This is the check on what the host is *asked to dial* — a URL's host, or a
 * literal address the panel named. A reserved range is refused here even though
 * {@link publicLookup} admits a resolver answer in one, because a page naming
 * such a number is naming something that is not a destination at all.
 */
export function isNonPublicAddress(value: string): boolean {
  return addressScope(value) !== 'public'
}

export type ResolveAddresses = (hostname: string) => Promise<LookupAddress[]>
export const resolveAddresses: ResolveAddresses = (hostname) => new Promise((resolve, reject) => {
  lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) reject(error)
    else resolve(addresses)
  })
})

/**
 * The socket uses the validated addresses; there is no second DNS lookup.
 *
 * A resolver answer is judged by where it can lead, not by whether it reads as a
 * public number: a transparent proxy in front of the machine (Surge or Clash in
 * enhanced mode, sing-box `fake-ip`) answers *every* public name with an address
 * out of a reserved range and dials the real one itself. Measured on such a
 * machine: `pbs.twimg.com` resolves to `198.18.35.226`, the reserved range this
 * module refuses for a named URL. Judging the answer the same way refused every
 * public hostname there, so a lit page image could never be downloaded.
 */
export function publicLookup(resolve: ResolveAddresses = resolveAddresses): LookupFunction {
  return (hostname, options, callback): void => {
    void resolve(hostname).then((addresses) => {
      if (addresses.length === 0 || addresses.some(({ address }) => isIP(address) === 0 || isLocalAddress(address))) {
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
