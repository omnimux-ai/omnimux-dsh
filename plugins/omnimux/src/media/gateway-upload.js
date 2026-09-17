import { createReadStream } from 'node:fs'
import { open, readFile, stat } from 'node:fs/promises'
import { isAbsolute, basename, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { Readable } from 'node:stream'
import { OmnimuxError } from './errors.js'
import { mediaFromMagic } from '../text/image.js'

const EXT_TO_MIME = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
})

const MIME_TO_EXT = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
})

/**
 * Cache for hosted media files:
 * key -> { fileUrl: string, expiresAt: number, mtimeMs?: number, sizeBytes?: number }
 */
const uploadCache = new Map()
const inFlightUploads = new Map()

/**
 * Deployment routes that could not hand out a ticket. Remembered so later
 * uploads go straight to the relay route instead of paying for a failed probe
 * on every file.
 */
const directUploadUnavailable = new Set()

export function clearGatewayUploadCache() {
  uploadCache.clear()
  inFlightUploads.clear()
  directUploadUnavailable.clear()
}

/**
 * Check whether a media source refers to a local file/stream that
 * cannot be accessed directly by remote cloud AI providers.
 * @param {unknown} source
 * @returns {boolean}
 */
function parseMediaSource(source) {
  const value = typeof source === 'string' ? source.trim() : ''
  if (!value) return { kind: 'invalid', value }
  if (/^[A-Za-z]:[/\\]/.test(value)) return { kind: 'path', value }
  if (/^(?:https?:|\/\/)/i.test(value)) {
    let url
    try { url = new URL(value, 'http://localhost') } catch { return { kind: 'invalid', value } }
    if (!['http:', 'https:'].includes(url.protocol)) return { kind: 'invalid', value }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return { kind: 'remote', value }
    return { kind: 'local-url', value, url }
  }
  if (/^(?:data:|file:|asset:)/i.test(value)) return { kind: value.slice(0, value.indexOf(':')).toLowerCase(), value }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return { kind: 'invalid', value }
  if (value.startsWith('/api/local-file?') || value.startsWith('/omnimux-workflow/api/local-file?')) {
    return { kind: 'local-url', value, url: new URL(value, 'http://localhost') }
  }
  return { kind: 'path', value }
}

export function isLocalMediaSource(source) {
  const { kind } = parseMediaSource(source)
  return kind !== 'remote' && kind !== 'invalid'
}

/**
 * Check whether a baseUrl targets a remote public gateway.
 * @param {string | undefined} baseUrl
 * @returns {boolean}
 */
export function isRemoteGateway(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) return false
  const trimmed = baseUrl.trim()
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(trimmed)) {
    return false
  }
  return /^https?:\/\//i.test(trimmed)
}

/**
 * Resolve a gateway file route from the route baseUrl the caller already uses.
 * @param {string} baseUrl
 * @param {string} route
 * @returns {string}
 */
function resolveFileRoute(baseUrl, route) {
  const clean = String(baseUrl || '').replace(/\/+$/, '')
  if (clean.endsWith('/v1')) {
    return `${clean}/files/${route}`
  }
  return `${clean}/v1/files/${route}`
}

/**
 * Resolve the gateway file upload URL from route baseUrl.
 * @param {string} baseUrl
 * @returns {string}
 */
export function resolveUploadEndpoint(baseUrl) {
  return resolveFileRoute(baseUrl, 'upload/stream')
}

/**
 * Direct-upload ticket route; the bytes never pass through the gateway.
 * @param {string} baseUrl
 * @returns {string}
 */
export function resolvePresignEndpoint(baseUrl) {
  return resolveFileRoute(baseUrl, 'upload/presign')
}

/**
 * Direct-upload verification route.
 * @param {string} baseUrl
 * @returns {string}
 */
export function resolveConfirmEndpoint(baseUrl) {
  return resolveFileRoute(baseUrl, 'upload/confirm')
}

/**
 * Derive target folder category (photos, videos, audios, files) from MIME.
 * @param {string} mimeType
 * @returns {string}
 */
export function determineUploadCategory(mimeType) {
  if (mimeType.startsWith('image/')) return 'photos'
  if (mimeType.startsWith('video/')) return 'videos'
  if (mimeType.startsWith('audio/')) return 'audios'
  return 'files'
}

/**
 * Detect MIME type from file extension and bytes.
 * @param {string} filename
 * @param {Uint8Array} [bytes]
 * @returns {string}
 */
function detectMimeType(filename, bytes) {
  const ext = extname(filename).toLowerCase()
  if (EXT_TO_MIME[ext]) return EXT_TO_MIME[ext]
  if (bytes && bytes.length > 0) {
    const fromMagic = mediaFromMagic(bytes)
    if (fromMagic) return fromMagic
  }
  return 'application/octet-stream'
}

/**
 * Detect MIME type from file extension without buffering the whole file.
 * Only reads the first 512 bytes for magic inspection when the extension is unrecognized.
 * @param {string} filePath
 * @param {string} filename
 * @returns {Promise<string>}
 */
async function sniffMimeType(filePath, filename) {
  const ext = extname(filename).toLowerCase()
  if (EXT_TO_MIME[ext]) return EXT_TO_MIME[ext]
  try {
    const handle = await open(filePath, 'r')
    try {
      const headerBuf = Buffer.alloc(512)
      const { bytesRead } = await handle.read(headerBuf, 0, 512, 0)
      if (bytesRead > 0) {
        const fromMagic = mediaFromMagic(headerBuf.subarray(0, bytesRead))
        if (fromMagic) return fromMagic
      }
    } finally {
      await handle.close()
    }
  } catch {}
  return 'application/octet-stream'
}

/**
 * Resolve a local source into a lightweight streaming descriptor.
 * Physical files are stat'd and MIME-sniffed without reading the full body into memory.
 * @param {string} source
 * @returns {Promise<{
 *   kind: 'file' | 'data',
 *   filename: string,
 *   mimeType: string,
 *   size: number,
 *   filePath?: string,
 *   stat?: import('node:fs').Stats,
 *   createStream: () => ReadableStream,
 *   readBuffer: () => Promise<Buffer>,
 * }>}
 */
export async function resolveMediaDescriptor(source) {
  const parsedSource = parseMediaSource(source)
  const trimmed = parsedSource.value
  if (parsedSource.kind === 'remote' || parsedSource.kind === 'invalid') {
    throw new OmnimuxError('omnimux-invalid-request', '该地址不是受支持的本地素材')
  }

  // 1. Data URI
  if (parsedSource.kind === 'data') {
    const match = trimmed.match(/^data:([^;,]+)?(;base64)?,(.*)$/is)
    if (!match) {
      throw new OmnimuxError('omnimux-invalid-request', '数据格式错误：无法解析 data URI')
    }
    const declaredMime = (match[1] || 'application/octet-stream').trim().toLowerCase()
    const isBase64 = Boolean(match[2])
    const payload = match[3] || ''
    const buffer = Buffer.from(payload, isBase64 ? 'base64' : 'utf8')
    const ext = MIME_TO_EXT[declaredMime] || 'bin'
    return {
      kind: 'data',
      filename: `upload_${Date.now()}.${ext}`,
      mimeType: declaredMime,
      size: buffer.length,
      createStream: () => Readable.toWeb(Readable.from([buffer])),
      readBuffer: async () => buffer,
    }
  }

  // 2. Resolve to physical file path
  let targetPath = trimmed
  if (parsedSource.kind === 'file') {
    try { targetPath = fileURLToPath(trimmed) } catch {
      throw new OmnimuxError('omnimux-invalid-request', '本地文件地址无效')
    }
  } else if (parsedSource.kind === 'local-url') {
    const parsed = parsedSource.url
    if (!['/api/local-file', '/omnimux-workflow/api/local-file'].includes(parsed.pathname) || !parsed.searchParams.get('path')) {
      throw new OmnimuxError('omnimux-invalid-request', '不支持的本地素材地址')
    }
    targetPath = parsed.searchParams.get('path')
  } else if (trimmed.startsWith('asset://')) {
    const home = process.env.DSH_HOME || (process.env.HOME ? join(process.env.HOME, '.dsh') : '')
    const raw = trimmed.slice('asset://'.length)
    const slashIdx = raw.indexOf('/')
    const scope = slashIdx === -1 ? raw : raw.slice(0, slashIdx)
    const subpath = slashIdx === -1 ? '' : raw.slice(slashIdx + 1)
    if (scope === 'artifact') {
      targetPath = join(home, 'omnimux', 'assets', 'artifacts', subpath)
    } else if (scope === 'workspace') {
      targetPath = resolve(process.cwd(), subpath)
    } else if (scope === 'tmp') {
      targetPath = join(home, 'omnimux', 'assets', 'tmp', subpath)
    } else {
      targetPath = join(home, 'omnimux', 'assets', scope, subpath)
    }
  }

  const normPath = normalize(targetPath)
  let fileStat
  try {
    fileStat = await stat(normPath)
  } catch (err) {
    throw new OmnimuxError('asset-not-found', `本地素材文件不存在或无法访问: ${normPath}`, { cause: err })
  }
  if (!fileStat.isFile()) {
    throw new OmnimuxError('omnimux-invalid-request', `素材路径不是普通文件: ${normPath}`)
  }

  const filename = basename(normPath)
  const mimeType = await sniffMimeType(normPath, filename)

  return {
    kind: 'file',
    filename,
    mimeType,
    size: fileStat.size,
    filePath: normPath,
    stat: fileStat,
    createStream: () => Readable.toWeb(createReadStream(normPath)),
    readBuffer: async () => readFile(normPath),
  }
}

/**
 * Resolve a local source (path, data URI, local-file URL, asset://) into readable bytes.
 * Retained for backwards-compatibility; buffers on demand.
 * @param {string} source
 * @returns {Promise<{ buffer: Buffer, mimeType: string, filename: string, filePath?: string, stat?: import('node:fs').Stats, createStream?: () => ReadableStream }>}
 */
export async function resolveMediaBytes(source) {
  const desc = await resolveMediaDescriptor(source)
  const buffer = await desc.readBuffer()
  return {
    buffer,
    mimeType: desc.mimeType,
    filename: desc.filename,
    filePath: desc.filePath,
    stat: desc.stat,
    createStream: desc.createStream,
  }
}

/**
 * Read the gateway's complaint out of a failed response, without letting a
 * non-JSON body hide it.
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function readUploadErrorMessage(response) {
  try {
    const json = await response.json()
    return json?.msg || json?.error?.message || JSON.stringify(json)
  } catch {
    return await response.text().catch(() => '')
  }
}

/**
 * Upload one descriptor straight to object storage with a gateway ticket and let the
 * gateway verify what actually arrived. Uses streaming body (duplex: 'half') when
 * a readable stream is available, avoiding reading the whole file into memory.
 * @param {{ descriptor: { filename: string, mimeType: string, size: number, createStream?: () => ReadableStream, readBuffer: () => Promise<Buffer> }, baseUrl: string, apiKey: string, fetcher: Function, signal?: AbortSignal }} input
 * @returns {Promise<{ fileUrl: string, expiresAt: number }>}
 */
async function uploadDirectToStorage({ descriptor, baseUrl, apiKey, fetcher, signal }) {
  const { filename, mimeType, size, createStream, readBuffer } = descriptor
  const presignResponse = await fetcher(resolvePresignEndpoint(baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_name: filename,
      mime_type: mimeType,
      file_size: size,
      upload_path: determineUploadCategory(mimeType),
    }),
    signal,
  })
  if (!presignResponse.ok) {
    const detail = await readUploadErrorMessage(presignResponse)
    throw new OmnimuxError('presign-unavailable', `网关未提供直传凭证 (HTTP ${presignResponse.status}): ${detail}`, {
      status: presignResponse.status,
    })
  }

  const ticket = (await presignResponse.json())?.data
  if (!ticket?.upload_url || !ticket?.file_id) {
    throw new OmnimuxError('presign-unavailable', '直传凭证响应缺少上传地址或文件标识')
  }

  const putHeaders = {
    ...(ticket.upload_headers || {}),
    'Content-Type': mimeType,
    'Content-Length': String(size),
  }

  const hasStream = typeof createStream === 'function'
  const putBody = hasStream ? createStream() : new Blob([await readBuffer()], { type: mimeType })
  const putOptions = {
    method: ticket.upload_method || 'PUT',
    headers: putHeaders,
    body: putBody,
    signal,
  }
  if (hasStream) {
    putOptions.duplex = 'half'
  }

  const putResponse = await fetcher(ticket.upload_url, putOptions)
  if (!putResponse.ok) {
    throw new OmnimuxError('direct-upload-failed', `素材直传存储失败 (HTTP ${putResponse.status})`, {
      status: putResponse.status,
    })
  }

  const confirmResponse = await fetcher(resolveConfirmEndpoint(baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file_id: ticket.file_id, file_size: size }),
    signal,
  })
  if (!confirmResponse.ok) {
    const detail = await readUploadErrorMessage(confirmResponse)
    throw new OmnimuxError('direct-upload-failed', `素材直传登记失败 (HTTP ${confirmResponse.status}): ${detail}`, {
      status: confirmResponse.status,
    })
  }

  const confirmed = (await confirmResponse.json())?.data
  const fileUrl = confirmed?.file_url || confirmed?.download_url || ticket.resource_url
  if (!fileUrl) {
    throw new OmnimuxError('direct-upload-failed', '直传登记未返回文件地址')
  }
  const parsedExpiry = Date.parse(confirmed?.expires_at || '')
  return {
    fileUrl,
    expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + 24 * 3600 * 1000,
  }
}

/**
 * Upload the bytes through the gateway, which relays them into object storage.
 * Buffers on demand when falling back from direct upload.
 * @param {{ descriptor: { filename: string, mimeType: string, readBuffer: () => Promise<Buffer> }, baseUrl: string, apiKey: string, fetcher: Function, signal?: AbortSignal }} input
 * @returns {Promise<{ fileUrl: string, expiresAt: number }>}
 */
async function uploadViaGateway({ descriptor, baseUrl, apiKey, fetcher, signal }) {
  const { filename, mimeType, readBuffer } = descriptor
  const buffer = await readBuffer()
  const formData = new FormData()
  formData.append('file', new Blob([buffer], { type: mimeType }), filename)
  formData.append('upload_path', determineUploadCategory(mimeType))

  const response = await fetcher(resolveUploadEndpoint(baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    signal,
  })

  if (!response.ok) {
    const errText = await readUploadErrorMessage(response)
    throw new OmnimuxError('upload-failed', `素材上传至网关失败 (HTTP ${response.status}): ${errText}`, {
      status: response.status,
    })
  }

  const json = await response.json()
  const fileUrl = json?.data?.file_url || json?.data?.download_url || json?.data?.url
  if (!fileUrl) {
    throw new OmnimuxError('upload-failed', `网关未返回有效的文件地址: ${json?.msg || '未知响应'}`)
  }

  // Default expiry: parse from response or 24 hours
  let expiresAt = Date.now() + 24 * 3600 * 1000
  if (json?.data?.expires_at) {
    const parsedExp = Date.parse(json.data.expires_at)
    if (Number.isFinite(parsedExp) && parsedExp > Date.now()) {
      expiresAt = parsedExp
    }
  }

  return { fileUrl, expiresAt }
}

/**
 * Upload a single local media asset to OmniMux Gateway and return its public URL.
 * @param {string} source
 * @param {{
 *   baseUrl: string,
 *   apiKey: string,
 *   fetcher?: typeof fetch,
 *   signal?: AbortSignal,
 * }} options
 * @returns {Promise<string>}
 */
export async function uploadMediaToGateway(source, options) {
  if (!source || typeof source !== 'string') return source
  if (!isLocalMediaSource(source)) return source

  const { baseUrl, apiKey, fetcher = fetch, signal } = options
  if (!baseUrl) {
    throw new OmnimuxError('omnimux-unconfigured', '缺少网关 baseUrl，无法上传素材')
  }
  if (!apiKey) {
    throw new OmnimuxError('needs-omnimux', '缺少网关 API 密钥，无法上传素材')
  }

  // 1. Fast cache check
  const cacheKey = source.trim()
  const cached = uploadCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    if (cached.filePath && cached.mtimeMs && cached.sizeBytes) {
      try {
        const s = await stat(cached.filePath)
        if (s.mtimeMs === cached.mtimeMs && s.size === cached.sizeBytes) {
          return cached.fileUrl
        }
      } catch {}
    } else {
      return cached.fileUrl
    }
  }

  // 2. In-flight promise reuse
  if (inFlightUploads.has(cacheKey)) {
    return inFlightUploads.get(cacheKey)
  }

  const uploadPromise = (async () => {
    const descriptor = await resolveMediaDescriptor(cacheKey)

    // Direct upload first: the bytes go straight to object storage and the
    // gateway only issues a ticket and verifies the result. A deployment that
    // cannot do this falls back to the relay route below, once.
    let uploaded = null
    if (!directUploadUnavailable.has(baseUrl)) {
      try {
        uploaded = await uploadDirectToStorage({ descriptor, baseUrl, apiKey, fetcher, signal })
      } catch (error) {
        if (signal?.aborted) throw error
        // Only mark the gateway deployment permanently unavailable for direct
        // upload if the presign endpoint explicitly reported it is not implemented
        // or not found (e.g. 501 / 404 / 405). Transient failures (R2 put errors, confirm
        // timeouts) fall back for this item but keep direct upload enabled for future files.
        const status = error instanceof OmnimuxError ? error.status : error?.status
        if ([404, 405, 501].includes(status)) {
          directUploadUnavailable.add(baseUrl)
        }
      }
    }
    if (!uploaded) {
      uploaded = await uploadViaGateway({ descriptor, baseUrl, apiKey, fetcher, signal })
    }

    uploadCache.set(cacheKey, {
      fileUrl: uploaded.fileUrl,
      expiresAt: uploaded.expiresAt,
      filePath: descriptor.filePath,
      mtimeMs: descriptor.stat?.mtimeMs,
      sizeBytes: descriptor.size,
    })

    return uploaded.fileUrl
  })()

  inFlightUploads.set(cacheKey, uploadPromise)
  try {
    return await uploadPromise
  } finally {
    inFlightUploads.delete(cacheKey)
  }
}

/**
 * Scan vendor payload and replace any local media paths with public gateway URLs.
 * @param {Record<string, unknown>} payload
 * @param {{
 *   baseUrl: string,
 *   apiKey: string,
 *   fetcher?: typeof fetch,
 *   signal?: AbortSignal,
 * }} options
 * @returns {Promise<Record<string, unknown>>}
 */
export async function hostLocalAssetsIfNeeded(payload, options) {
  if (!payload || typeof payload !== 'object') return payload
  const { baseUrl, apiKey, fetcher = fetch, signal } = options

  const cloned = { ...payload }

  async function hostOne(val) {
    if (typeof val !== 'string') return val
    if (!isLocalMediaSource(val)) return val
    return uploadMediaToGateway(val, { baseUrl, apiKey, fetcher, signal })
  }

  // 1. image_urls: string[]
  if (Array.isArray(cloned.image_urls)) {
    cloned.image_urls = await Promise.all(cloned.image_urls.map(hostOne))
  }

  // 2. video_urls: string[]
  if (Array.isArray(cloned.video_urls)) {
    cloned.video_urls = await Promise.all(cloned.video_urls.map(hostOne))
  }

  // 3. audio_urls: string[]
  if (Array.isArray(cloned.audio_urls)) {
    cloned.audio_urls = await Promise.all(cloned.audio_urls.map(hostOne))
  }

  // 4. images: string[]
  if (Array.isArray(cloned.images)) {
    cloned.images = await Promise.all(cloned.images.map(hostOne))
  }

  // 5. image_with_roles: Array<{ url: string, role: string }>
  if (Array.isArray(cloned.image_with_roles)) {
    cloned.image_with_roles = await Promise.all(
      cloned.image_with_roles.map(async (item) => {
        if (!item || typeof item !== 'object') return item
        const row = /** @type {Record<string, unknown>} */ (item)
        if (typeof row.url === 'string' && isLocalMediaSource(row.url)) {
          const hostedUrl = await hostOne(row.url)
          return { ...row, url: hostedUrl }
        }
        return row
      }),
    )
  }

  // 6. reference_images: Array<{ url: string }>
  if (Array.isArray(cloned.reference_images)) {
    cloned.reference_images = await Promise.all(
      cloned.reference_images.map(async (item) => {
        if (!item || typeof item !== 'object') return item
        const row = /** @type {Record<string, unknown>} */ (item)
        if (typeof row.url === 'string' && isLocalMediaSource(row.url)) {
          const hostedUrl = await hostOne(row.url)
          return { ...row, url: hostedUrl }
        }
        return row
      }),
    )
  }

  // 7. single image fields: image, image_tail, file_url
  if (typeof cloned.image === 'string' && isLocalMediaSource(cloned.image)) {
    cloned.image = await hostOne(cloned.image)
  }
  if (typeof cloned.image_tail === 'string' && isLocalMediaSource(cloned.image_tail)) {
    cloned.image_tail = await hostOne(cloned.image_tail)
  }
  if (typeof cloned.file_url === 'string' && isLocalMediaSource(cloned.file_url)) {
    cloned.file_url = await hostOne(cloned.file_url)
  }

  // 8. audioTrack
  if (cloned.audioTrack) {
    if (typeof cloned.audioTrack === 'string' && isLocalMediaSource(cloned.audioTrack)) {
      cloned.audioTrack = await hostOne(cloned.audioTrack)
    } else if (typeof cloned.audioTrack === 'object') {
      const track = { .../** @type {Record<string, unknown>} */ (cloned.audioTrack) }
      if (typeof track.pathOrUrl === 'string' && isLocalMediaSource(track.pathOrUrl)) {
        track.pathOrUrl = await hostOne(track.pathOrUrl)
      }
      if (typeof track.url === 'string' && isLocalMediaSource(track.url)) {
        track.url = await hostOne(track.url)
      }
      cloned.audioTrack = track
    }
  }

  return cloned
}
