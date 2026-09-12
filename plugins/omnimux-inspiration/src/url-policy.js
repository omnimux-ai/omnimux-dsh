/**
 * Download-target policy shared by the metadata extractor and the media
 * downloader.
 *
 * An imported social post is attacker-influenced input: the resolved `video_url`
 * comes from a third-party envelope, so a naive `fetch(url)` would let a crafted
 * payload point the downloader at the cloud metadata service, a loopback port, or
 * a local-network host. Every download target is therefore validated here before
 * a socket is opened, and again on every redirect hop.
 */

/** Only these protocols may be downloaded from. `file:`, `data:` and `ftp:` never are. */
const DOWNLOADABLE_PROTOCOLS = new Set(['http:', 'https:'])

/** Hostnames that only ever resolve inside the machine or a private network. */
const PRIVATE_HOSTNAMES = new Set(['localhost', 'localhost.localdomain'])

/** Suffixes reserved for local / private-network resolution (RFC 6761, RFC 8375, mDNS). */
const PRIVATE_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.home.arpa']

/** HTTP statuses that carry a `Location` and must be validated before following. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

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
 * Whether a hostname can only be reached from the local machine or a private
 * network. IPv6 literals are refused wholesale: the URL parser keeps them
 * bracketed, and the download paths in this plugin are IPv4/CDN only.
 * @param {unknown} hostname
 * @returns {boolean}
 */
export function isPrivateHostname(hostname) {
  const host = typeof hostname === 'string' ? hostname.trim().toLowerCase().replace(/\.$/, '') : ''
  if (!host) return true
  if (host.startsWith('[') || host.includes(':')) return true
  if (PRIVATE_HOSTNAMES.has(host)) return true
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
 * Whether a URL may be downloaded from: `http`/`https` on a public host.
 * @param {unknown} url
 * @returns {boolean}
 */
export function isDownloadableHttpUrl(url) {
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
 * Guard used right before a download is started.
 * @param {unknown} url
 * @throws {Error} when the target is not a public http(s) URL
 * @returns {void}
 */
export function assertDownloadableUrl(url) {
  const raw = typeof url === 'string' ? url.trim() : ''
  if (!raw) throw new Error('媒体下载地址为空')
  if (isDownloadableHttpUrl(raw)) return
  const host = urlHostname(raw)
  throw new Error(
    host
      ? `拒绝下载本机/内网地址 (${host})，仅允许公网 http(s) 直链`
      : `拒绝下载非 http(s) 的媒体地址: ${raw}`,
  )
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
