/** Local raster cache for social-account avatars under $DSH_HOME/omnimux. */

import { createHash } from 'node:crypto'
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_ACCOUNT_AVATARS } from './config.js'
import { localAvatarUrl } from './public-account.js'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const JPEG = Buffer.from([0xff, 0xd8, 0xff])
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38])
const ALLOWED_TYPES = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
})

/**
 * @param {string} home
 */
export function accountsAvatarDir(home) {
  return join(home, 'omnimux', 'accounts', 'avatars')
}

/**
 * @param {unknown} cfg
 */
function resolveConfig(cfg) {
  const source = cfg && typeof cfg === 'object' && !Array.isArray(cfg)
    ? /** @type {Record<string, unknown>} */ (cfg)
    : {}
  const maxBytes = typeof source.maxBytes === 'number' && Number.isInteger(source.maxBytes) && source.maxBytes > 0
    ? source.maxBytes
    : DEFAULT_ACCOUNT_AVATARS.maxBytes
  const fetchTimeoutMs = typeof source.fetchTimeoutMs === 'number' && Number.isInteger(source.fetchTimeoutMs) && source.fetchTimeoutMs > 0
    ? source.fetchTimeoutMs
    : DEFAULT_ACCOUNT_AVATARS.fetchTimeoutMs
  return {
    enabled: source.enabled !== false,
    maxBytes,
    fetchTimeoutMs,
  }
}

/**
 * @param {string} id
 */
function fileStem(id) {
  return createHash('sha256').update(String(id), 'utf8').digest('hex')
}

/**
 * Hostname denylist for Host-side avatar fetches. Literal IPs and well-known
 * local names only — we do not DNS-resolve, matching the SSRF contract.
 * @param {string} hostname
 */
export function isBlockedAvatarHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0' || host === '::') return true
  if (host === '169.254.169.254' || host === 'metadata.google.internal') return true
  if (host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal')) return true
  if (/^127\.\d+\.\d+\.\d+$/.test(host) || /^0\.\d+\.\d+\.\d+$/.test(host)) return true
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true
  if (/^169\.254\.\d+\.\d+$/.test(host)) return true
  const rfc1918_172 = host.match(/^172\.(\d+)\.\d+\.\d+$/)
  if (rfc1918_172 && Number(rfc1918_172[1]) >= 16 && Number(rfc1918_172[1]) <= 31) return true
  if (host.includes(':')) {
    if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true
    if (host.startsWith('::ffff:')) return isBlockedAvatarHost(host.slice('::ffff:'.length))
  }
  return false
}

/**
 * @param {string} url
 * @returns {{ ok: true, href: string } | { ok: false, reason: string }}
 */
export function inspectAvatarUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') return { ok: false, reason: 'empty' }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'not-https' }
  if (isBlockedAvatarHost(parsed.hostname)) return { ok: false, reason: 'ssrf' }
  return { ok: true, href: parsed.href }
}

/**
 * @param {Buffer} buf
 * @returns {{ mimeType: string, ext: string } | null}
 */
export function sniffAvatarBytes(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null
  const head = buf.subarray(0, 64).toString('utf8').trimStart().slice(0, 16).toLowerCase()
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!doctype') || head.startsWith('<html')) {
    return null
  }
  if (buf.subarray(0, 4).equals(PNG)) return { mimeType: 'image/png', ext: 'png' }
  if (buf.subarray(0, 3).equals(JPEG)) return { mimeType: 'image/jpeg', ext: 'jpg' }
  if (buf.subarray(0, 4).equals(GIF)) return { mimeType: 'image/gif', ext: 'gif' }
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return { mimeType: 'image/webp', ext: 'webp' }
  }
  return null
}

/**
 * File-backed raster cache keyed by account id.
 * Same write discipline as the metadata overlay: 0o700 directory, 0o600 files,
 * whole-document index rewrite. Missing or corrupt index is an empty store.
 *
 * @param {{
 *   home: string,
 *   now?: () => string,
 *   fetcher?: typeof fetch,
 *   config?: { enabled?: boolean, maxBytes?: number, fetchTimeoutMs?: number },
 * }} deps
 */
export function createAccountAvatarStore(deps) {
  const dir = accountsAvatarDir(deps.home)
  const indexPath = join(dir, 'index.json')
  const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString()
  const fetcher = typeof deps.fetcher === 'function' ? deps.fetcher : fetch

  /**
   * @returns {Record<string, Record<string, unknown>>}
   */
  function readIndex() {
    try {
      const raw = JSON.parse(readFileSync(indexPath, 'utf8'))
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return /** @type {Record<string, Record<string, unknown>>} */ (raw)
      }
    } catch {
      // absent or corrupt — treat as empty
    }
    return {}
  }

  /**
   * @param {Record<string, Record<string, unknown>>} doc
   */
  function writeIndex(doc) {
    ensureDir()
    writeFileSync(indexPath, `${JSON.stringify(doc, undefined, 2)}\n`, { mode: 0o600 })
    try { chmodSync(indexPath, 0o600) } catch { /* ignore */ }
  }

  function ensureDir() {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    try { chmodSync(dir, 0o700) } catch { /* ignore */ }
    try { chmodSync(join(deps.home, 'omnimux', 'accounts'), 0o700) } catch { /* ignore */ }
  }

  /**
   * @param {string} id
   */
  function rowFor(id) {
    const row = readIndex()[id]
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null
    const file = typeof row.file === 'string' ? row.file : ''
    if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) return null
    const mimeType = typeof row.content_type === 'string' ? row.content_type : ''
    if (!ALLOWED_TYPES[mimeType]) return null
    return { row, file, mimeType, path: join(dir, file) }
  }

  /**
   * @param {string} path
   */
  function fileExists(path) {
    try {
      return statSync(path).isFile()
    } catch {
      return false
    }
  }

  /**
   * @param {string} id
   */
  function has(id) {
    const hit = rowFor(id)
    return Boolean(hit && fileExists(hit.path))
  }

  /**
   * @param {string} id
   * @returns {{ buffer: Buffer, mimeType: string, ext: string } | null}
   */
  function get(id) {
    const hit = rowFor(id)
    if (!hit || !fileExists(hit.path)) return null
    try {
      const buffer = readFileSync(hit.path)
      const sniffed = sniffAvatarBytes(buffer)
      if (!sniffed || sniffed.mimeType !== hit.mimeType) return null
      return { buffer, mimeType: hit.mimeType, ext: sniffed.ext }
    } catch {
      return null
    }
  }

  /**
   * @param {string} id
   */
  function sourceUrl(id) {
    const hit = rowFor(id)
    return hit && typeof hit.row.source_url === 'string' ? hit.row.source_url : ''
  }

  /**
   * @param {string} id
   */
  function localUrlFor(id) {
    return localAvatarUrl(id)
  }

  /**
   * @param {string} id
   */
  function remove(id) {
    const doc = readIndex()
    const current = doc[id]
    if (current && typeof current === 'object' && !Array.isArray(current) && typeof current.file === 'string') {
      try { unlinkSync(join(dir, current.file)) } catch { /* already gone */ }
    }
    if (!(id in doc)) return
    delete doc[id]
    writeIndex(doc)
  }

  /**
   * Fetch a remote raster and persist it. Failures are silent (no throw, no write).
   * @param {string} id
   * @param {string} url
   * @returns {Promise<{ ok: boolean, reason?: string }>}
   */
  async function putFromUrl(id, url) {
    const cfg = resolveConfig(deps.config)
    if (!cfg.enabled) return { ok: false, reason: 'disabled' }
    if (typeof id !== 'string' || id === '') return { ok: false, reason: 'id' }
    const inspected = inspectAvatarUrl(url)
    if (!inspected.ok) return { ok: false, reason: inspected.reason }
    if (has(id) && sourceUrl(id) === inspected.href) return { ok: true, reason: 'unchanged' }

    /** @type {Buffer | null} */
    let body = null
    try {
      const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(cfg.fetchTimeoutMs)
        : undefined
      const response = await fetcher(inspected.href, { method: 'GET', redirect: 'error', signal })
      if (!response || response.status !== 200) return { ok: false, reason: 'status' }
      const headerType = typeof response.headers?.get === 'function'
        ? String(response.headers.get('content-type') || '').toLowerCase()
        : ''
      if (headerType && (headerType.includes('svg') || headerType.includes('xml') || headerType.includes('text/') || headerType.includes('html'))) {
        return { ok: false, reason: 'content-type' }
      }
      const declared = typeof response.headers?.get === 'function' ? Number(response.headers.get('content-length')) : NaN
      if (Number.isFinite(declared) && declared > cfg.maxBytes) return { ok: false, reason: 'too-large' }
      body = await readCapped(response, cfg.maxBytes)
    } catch {
      return { ok: false, reason: 'fetch' }
    }
    if (!body) return { ok: false, reason: 'too-large' }
    if (body.byteLength > cfg.maxBytes) return { ok: false, reason: 'too-large' }
    const sniffed = sniffAvatarBytes(body)
    if (!sniffed) return { ok: false, reason: 'magic' }

    ensureDir()
    const doc = readIndex()
    const previous = doc[id]
    const file = `${fileStem(id)}.${sniffed.ext}`
    const dest = join(dir, file)
    writeFileSync(dest, body, { mode: 0o600 })
    try { chmodSync(dest, 0o600) } catch { /* ignore */ }
    if (previous && typeof previous === 'object' && typeof previous.file === 'string' && previous.file !== file) {
      try { unlinkSync(join(dir, previous.file)) } catch { /* already gone */ }
    }
    doc[id] = {
      file,
      content_type: sniffed.mimeType,
      bytes: body.byteLength,
      source_url: inspected.href,
      fetched_at: now(),
    }
    writeIndex(doc)
    return { ok: true }
  }

  return {
    has,
    get,
    read: get,
    sourceUrl,
    localUrlFor,
    remove,
    putFromUrl,
    dir,
    path: indexPath,
  }
}

/**
 * @param {{ headers?: { get?: Function }, arrayBuffer?: Function, body?: { getReader?: Function } }} response
 * @param {number} maxBytes
 * @returns {Promise<Buffer | null>}
 */
async function readCapped(response, maxBytes) {
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader()
    /** @type {Uint8Array[]} */
    const chunks = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      size += value.byteLength
      if (size > maxBytes) {
        try { await reader.cancel() } catch { /* ignore */ }
        return null
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
  }
  if (typeof response.arrayBuffer !== 'function') return Buffer.alloc(0)
  const raw = Buffer.from(await response.arrayBuffer())
  if (raw.byteLength > maxBytes) return null
  return raw
}
