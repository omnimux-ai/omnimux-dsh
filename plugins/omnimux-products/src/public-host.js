/**
 * Canonical form of a url host, so two spellings of the same address cannot
 * pass as two different hosts: surrounding brackets, trailing root dots, a
 * zone id and letter case all drop out.
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeHostname(raw) {
  let host = String(raw ?? '').trim().toLowerCase()
  host = host.replace(/^\[/, '').replace(/\]$/, '')
  host = host.split('%')[0]
  while (host.endsWith('.')) host = host.slice(0, -1)
  return host
}

/**
 * Expand an IPv6 literal into eight 16-bit groups. A trailing dotted quad
 * (`::ffff:127.0.0.1`) folds into the last two groups. Returns null when the
 * literal cannot be understood — an unreadable address is never fetched.
 *
 * @param {string} host
 * @returns {number[] | null}
 */
function expandIpv6(host) {
  let text = normalizeHostname(host)
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text)
  if (dotted) {
    const bytes = dotted[1].split('.').map((part) => Number.parseInt(part, 10))
    if (bytes.some((byte) => !Number.isFinite(byte) || byte > 255)) return null
    const hi = ((bytes[0] << 8) | bytes[1]).toString(16)
    const lo = ((bytes[2] << 8) | bytes[3]).toString(16)
    text = `${text.slice(0, dotted.index)}${hi}:${lo}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = 8 - head.length - tail.length
  if (fill < 0) return null
  const groups = [...head, ...new Array(halves.length === 2 ? fill : 0).fill('0'), ...tail]
  if (groups.length !== 8) return null
  const out = []
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null
    out.push(Number.parseInt(group, 16))
  }
  return out
}

/**
 * The IPv4 an IPv6 literal carries, when it carries one: IPv4-mapped
 * (`::ffff:0:0/96`), IPv4-compatible (`::/96`) and NAT64 (`64:ff9b::/96`).
 *
 * @param {number[]} groups
 * @returns {number[] | null}
 */
function ipv4InsideIpv6(groups) {
  const low = groups.slice(6)
  const quad = [(low[0] >> 8) & 0xff, low[0] & 0xff, (low[1] >> 8) & 0xff, low[1] & 0xff]
  if (groups.slice(0, 5).every((group) => group === 0) && (groups[5] === 0 || groups[5] === 0xffff)) return quad
  const nat64 = [0x64, 0xff9b, 0, 0, 0, 0]
  if (groups.slice(0, 6).every((group, index) => group === nat64[index])) return quad
  return null
}

/**
 * Read a host that is written as a number rather than a dotted quad
 * (`2130706433`, `0x7f000001`, `0177.0.0.1`, `127.1`).
 *
 * @param {string} host
 * @returns {{ bytes: number[], canonical: boolean } | null}
 */
function numericIpv4(host) {
  const parts = host.split('.')
  if (parts.length > 4) return null
  const numbers = []
  for (const part of parts) {
    if (/^0[xX][0-9a-f]+$/.test(part)) {
      numbers.push(Number.parseInt(part.slice(2), 16))
      continue
    }
    if (/^0[0-7]+$/.test(part)) {
      numbers.push(Number.parseInt(part.slice(1), 8))
      continue
    }
    if (/^\d+$/.test(part)) {
      numbers.push(Number.parseInt(part, 10))
      continue
    }
    return null
  }
  if (numbers.some((value) => !Number.isFinite(value) || value < 0)) return null
  const last = Number(numbers.pop())
  const byteCount = 4 - numbers.length
  if (numbers.some((value) => value > 255)) return null
  if (last >= 2 ** (8 * byteCount)) return null
  const bytes = [...numbers]
  for (let shift = byteCount - 1; shift >= 0; shift -= 1) bytes.push((last >> (8 * shift)) & 0xff)
  const canonical = parts.length === 4
    && parts.every((part) => /^\d{1,3}$/.test(part) && !/^0\d/.test(part))
  return { bytes, canonical }
}

/**
 * @param {number[]} bytes
 * @returns {boolean}
 */
function isBlockedIpv4(bytes) {
  const [a, b] = bytes
  if (bytes.every((byte) => byte === 0)) return true
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 192 && b === 88 && bytes[2] === 99) return true
  if (a === 198 && b === 51 && bytes[2] === 100) return true
  if (a === 203 && b === 0 && bytes[2] === 113) return true
  if (a >= 224) return true
  return false
}

/**
 * @param {number[]} groups
 * @returns {boolean}
 */
function isBlockedIpv6(groups) {
  if (groups.every((group) => group === 0)) return true
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true
  const first = groups[0]
  if ((first & 0xfe00) === 0xfc00) return true
  if ((first & 0xffc0) === 0xfe80) return true
  if ((first & 0xff00) === 0xff00) return true
  if (first === 0x2001 && groups[1] === 0x0db8) return true
  return false
}

/**
 * Should this host be refused as a fetch target?
 *
 * Loopback, private, link-local, CGNAT, multicast and reserved ranges are all
 * refused, in every spelling: trailing root dots (`localhost.`), IPv4-mapped
 * IPv6 (`::ffff:7f00:1`), IPv4-compatible and NAT64 literals, and hosts written
 * as a bare decimal / hex / octal number. A non-canonical numeric host is
 * refused outright — no product page is published at `0177.0.0.1`.
 *
 * @param {unknown} hostname
 * @returns {boolean}
 */
export function isPrivateHost(hostname) {
  const host = normalizeHostname(hostname)
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local') || host.endsWith('.localdomain')) return true
  if (host.endsWith('.internal') || host.endsWith('.home.arpa')) return true
  if (host.includes(':')) {
    const groups = expandIpv6(host)
    if (!groups) return true
    const quad = ipv4InsideIpv6(groups)
    if (quad !== null) return isBlockedIpv4(quad)
    if (isBlockedIpv6(groups)) return true
    // Only global unicast is routable; 6to4/Teredo hide an additional IPv4 hop.
    return (groups[0] & 0xe000) !== 0x2000 || groups[0] === 0x2002 || groups[0] === 0x3fff || (groups[0] === 0x2001 && groups[1] < 0x200)
  }
  const numeric = numericIpv4(host)
  if (!numeric) return false
  if (!numeric.canonical) return true
  return isBlockedIpv4(numeric.bytes)
}
