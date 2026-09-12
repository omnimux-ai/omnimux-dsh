/**
 * Download-target policy shared by the metadata extractor and the media
 * downloader.
 *
 * An imported social post is attacker-influenced input: the resolved `video_url`
 * comes from a third-party envelope, so a naive `fetch(url)` would let a crafted
 * payload point the downloader at the cloud metadata service, a loopback port, or
 * a local-network host.
 *
 * Two layers are exported, because the two call sites need different strength:
 *
 * - `isPublicHttpUrl` — protocol plus non-private *literal* host. Used by the
 *   structural extractor, which walks envelope fields that legitimately point at
 *   extension-less CDN streams (`play_addr.url_list`, `video_versions[]`,
 *   `variants[]`, `formats[]`). Applying a downloadability rule there would drop
 *   real TikTok/Instagram streams, so only the private-target refusal applies.
 * - `isDownloadableHttpUrl` / `assertDownloadableUrl` — the stricter gate for the
 *   flat direct-link fields and, above all, for the download entry point, where a
 *   hostname is also resolved and every answer is classified before a socket is
 *   opened.
 *
 * A literal hostname check alone is not enough: `localtest.me`, `127.0.0.1.nip.io`
 * and `instance-data` are ordinary public DNS names that resolve into loopback or
 * the metadata service (wildcard-DNS / rebinding bypass). `assertDownloadableUrl`
 * therefore also resolves the host and refuses a non-public answer.
 */

import { lookup as dnsLookup } from 'node:dns/promises'

/** Only these protocols may be downloaded from. `file:`, `data:` and `ftp:` never are. */
const DOWNLOADABLE_PROTOCOLS = new Set(['http:', 'https:'])

/** Hostnames that only ever resolve inside the machine or a private network. */
const PRIVATE_HOSTNAMES = new Set(['localhost', 'localhost.localdomain'])

/** Suffixes reserved for local / private-network resolution (RFC 6761, RFC 8375, mDNS). */
const PRIVATE_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.home.arpa']

/** HTTP statuses that carry a `Location` and must be validated before following. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/** Hostnames that name the instance metadata service without any DNS indirection. */
const METADATA_HOSTNAMES = new Set(['instance-data', 'metadata', 'metadata.google.internal', 'metadata.goog'])

/** Resolver shape `assertPublicResolvedHost` needs (a `dns.lookup` subset). */
const defaultResolver = dnsLookup

/**
 * Private and special-use IPv4 ranges that must never be fetched.
 * @param {string} host dotted-quad hostname
 * @returns {boolean}
 */
function isPrivateIpv4(host) {
  const parts = host.split('.')
  if (parts.length !== 4) return false
  if (!parts.every((part) => /^\d{1,3}$/.test(part))) return false
  const octets = parts.map(Number)
  if (octets.some((value) => value > 255)) return false
  const [a, b] = octets
  if (a === 0 || a === 127) return true // "this network" + loopback
  if (a === 10) return true // private
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 169 && b === 254) return true // link-local (cloud metadata)
  if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
  return a >= 224 // multicast, reserved and broadcast
}

/**
 * First hextet of an IPv6 address, expanded to a number, or null when the text is
 * not an IPv6 literal. The `::` run is handled explicitly so `::1`, `fc00::1` and
 * `fd00::abcd` classify without a full address parser.
 * @param {string} value
 * @returns {number | null}
 */
function firstIpv6Hextet(value) {
  const text = value.includes('%') ? value.slice(0, value.indexOf('%')) : value
  if (!text.includes(':')) return null
  const [head] = text.split('::')
  const first = head.split(':').filter(Boolean)[0]
  if (first === undefined) return 0 // address starts with `::`
  if (!/^[0-9a-f]{1,4}$/.test(first)) return null
  return Number.parseInt(first, 16)
}

/**
 * Whether an IPv6 literal can only be reached from the local machine or a
 * private network. `isPrivateHostname` refuses IPv6 literals wholesale, but a
 * *resolved* answer still has to be classified.
 * @param {string} value
 * @returns {boolean}
 */
function isPrivateIpv6(value) {
  const text = value.includes('%') ? value.slice(0, value.indexOf('%')) : value
  if (!text.includes(':')) return false
  if (text === '::' || text === '::1') return true // unspecified, loopback
  const hextet = firstIpv6Hextet(text)
  if (hextet === null) return false
  if ((hextet & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
  if ((hextet & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if (hextet === 0) return true // unspecified / IPv4-mapped loopback forms
  return false
}

/**
 * Classify one address as non-public: loopback, private, link-local, unspecified,
 * CGNAT, IPv6 unique-local and IPv6 link-local are all refused.
 * @param {unknown} address
 * @returns {boolean} true when the address must not be connected to
 */
export function isPrivateAddress(address) {
  const text = typeof address === 'string' ? address.trim().toLowerCase().replace(/^\[|\]$/g, '') : ''
  if (!text) return true
  return text.includes(':') ? isPrivateIpv6(text) : isPrivateIpv4(text)
}

/**
 * Whether a hostname can only be reached from the local machine or a private
 * network, judged from the literal text alone. IPv6 literals are refused
 * wholesale: the URL parser keeps them bracketed, and the download paths in this
 * plugin are IPv4/CDN only.
 * @param {unknown} hostname
 * @returns {boolean}
 */
export function isPrivateHostname(hostname) {
  const host = typeof hostname === 'string' ? hostname.trim().toLowerCase().replace(/\.$/, '') : ''
  if (!host) return true
  if (host.startsWith('[') || host.includes(':')) return true
  if (PRIVATE_HOSTNAMES.has(host)) return true
  if (METADATA_HOSTNAMES.has(host)) return true
  if (PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true
  return isPrivateIpv4(host)
}

/**
 * Lowercased hostname of a URL, or '' when it cannot be parsed.
 * @param {unknown} url
 * @returns {string}
 */
export function urlHostname(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Hostname without the IPv6 brackets, so it can be handed to a resolver.
 * @param {unknown} url
 * @returns {string}
 */
function resolverHostname(url) {
  return urlHostname(url).replace(/^\[|\]$/g, '')
}

/**
 * Whether a URL may be fetched at all: `http`/`https` on a host that is not a
 * private *literal*. This is the layer the structural extractor applies, so it
 * deliberately says nothing about the path or its extension.
 * @param {unknown} url
 * @returns {boolean}
 */
export function isPublicHttpUrl(url) {
  let parsed
  try {
    parsed = new URL(String(url))
  } catch {
    return false
  }
  if (!DOWNLOADABLE_PROTOCOLS.has(parsed.protocol)) return false
  return !isPrivateHostname(parsed.hostname)
}

/**
 * Whether a URL may be downloaded from: `http`/`https` on a public host.
 * The literal-host layer of the policy; the resolved-address layer lives in
 * `assertDownloadableUrl`, which is the async download entry point.
 * @param {unknown} url
 * @returns {boolean}
 */
export function isDownloadableHttpUrl(url) {
  return isPublicHttpUrl(url)
}

/**
 * Resolve a hostname and reject it when any answer is a non-public address.
 *
 * Every answer is inspected rather than just the first: a name that resolves to
 * one public and one loopback address must still be refused, because which answer
 * a connection uses is not under this code's control.
 *
 * A resolution failure (`ENOTFOUND`, `EAI_AGAIN`, a malformed name) is refused as
 * well. Fail-closed is the only safe reading here: this guard protects the cloud
 * metadata service and the loopback interface, and a name that will not resolve
 * is indistinguishable from one the resolver is deliberately refusing to answer
 * for. The download could not succeed either way, so nothing usable is lost —
 * only the error message changes, and it names the host that was refused.
 * @param {string} hostname
 * @param {{ resolver?: Function }} [deps] injectable resolver; defaults to `dns.lookup`
 * @throws {Error} when the host does not resolve, or resolves to a non-public address
 * @returns {Promise<void>}
 */
export async function assertPublicResolvedHost(hostname, deps = {}) {
  const host = typeof hostname === 'string' ? hostname.trim().toLowerCase() : ''
  if (!host) throw new Error('媒体下载地址为空')
  const resolver = deps.resolver ?? defaultResolver
  let answers
  try {
    answers = await resolver(host, { all: true })
  } catch (err) {
    const reason = err && err.code ? err.code : (err && err.message) || 'unknown error'
    throw new Error(`拒绝下载无法解析的主机 (${host}): ${reason}`)
  }
  const addresses = Array.isArray(answers) ? answers : []
  if (addresses.length === 0) {
    throw new Error(`拒绝下载无法解析的主机 (${host}): 解析结果为空`)
  }
  for (const answer of addresses) {
    const address = typeof answer === 'string' ? answer : answer && answer.address
    if (isPrivateAddress(address)) {
      throw new Error(`拒绝下载本机/内网地址 (${host} → ${String(address)})，仅允许公网 http(s) 直链`)
    }
  }
}

/**
 * Guard used right before a download is started, and again for every redirect
 * hop. Applies both layers: the literal host must be public http(s), and the host
 * must resolve only to public addresses.
 * @param {unknown} url
 * @param {{ resolver?: Function }} [deps] injectable resolver; defaults to `dns.lookup`
 * @throws {Error} when the target is not a public http(s) URL
 * @returns {Promise<void>}
 */
export async function assertDownloadableUrl(url, deps = {}) {
  const raw = typeof url === 'string' ? url.trim() : ''
  if (!raw) throw new Error('媒体下载地址为空')
  if (!isDownloadableHttpUrl(raw)) {
    const host = urlHostname(raw)
    throw new Error(
      host
        ? `拒绝下载本机/内网地址 (${host})，仅允许公网 http(s) 直链`
        : `拒绝下载非 http(s) 的媒体地址: ${raw}`,
    )
  }
  await assertPublicResolvedHost(resolverHostname(raw), deps)
}

/**
 * @param {unknown} status
 * @returns {boolean}
 */
export function isRedirectStatus(status) {
  return REDIRECT_STATUSES.has(Number(status))
}

/**
 * Resolve a redirect `Location` against the URL it came from.
 * @param {unknown} location
 * @param {string} baseUrl
 * @returns {string} absolute target, or '' when the header is unusable
 */
export function resolveRedirectUrl(location, baseUrl) {
  const raw = typeof location === 'string' ? location.trim() : ''
  if (!raw) return ''
  try {
    return new URL(raw, baseUrl).toString()
  } catch {
    return ''
  }
}
