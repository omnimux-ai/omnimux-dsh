import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, basename, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
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

export function clearGatewayUploadCache() {
  uploadCache.clear()
  inFlightUploads.clear()
}

/**
 * Check whether a media source refers to a local file/stream that
 * cannot be accessed directly by remote cloud AI providers.
 * @param {unknown} source
 * @returns {boolean}
 */
export function isLocalMediaSource(source) {
  if (typeof source !== 'string') return false
  const trimmed = source.trim()
  if (!trimmed) return false

  if (trimmed.startsWith('data:')) return true
  if (trimmed.startsWith('file:')) return true
  if (trimmed.startsWith('asset://')) return true
  if (trimmed.includes('api/local-file') || trimmed.includes('omnimux-workflow/media')) return true

  // Windows absolute paths like C:\... or C:/...
  if (/^[A-Za-z]:[/\\]/.test(trimmed)) return true

  // POSIX absolute paths like /Users/...
  if (trimmed.startsWith('/')) return true

  // Local loopback URLs cannot be fetched by cloud model clusters
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(trimmed)) {
    return true
  }

  // Any other http(s) URL is remote public
  if (/^https?:\/\//i.test(trimmed)) return false

  return true
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
 * Resolve the gateway file upload URL from route baseUrl.
 * @param {string} baseUrl
 * @returns {string}
 */
export function resolveUploadEndpoint(baseUrl) {
  const clean = String(baseUrl || '').replace(/\/+$/, '')
  if (clean.endsWith('/v1')) {
    return `${clean}/files/upload/stream`
  }
  return `${clean}/v1/files/upload/stream`
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
 * Resolve a local source (path, data URI, local-file URL, asset://) into readable bytes.
 * @param {string} source
 * @returns {Promise<{ buffer: Buffer, mimeType: string, filename: string, filePath?: string, stat?: import('node:fs').Stats }>}
 */
export async function resolveMediaBytes(source) {
  const trimmed = source.trim()

  // 1. Data URI
  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
    if (!match) {
      throw new OmnimuxError('omnimux-invalid-request', '数据格式错误：无法解析 data URI')
    }
    const declaredMime = (match[1] || 'application/octet-stream').trim().toLowerCase()
    const isBase64 = Boolean(match[2])
    const payload = match[3] || ''
    const buffer = Buffer.from(payload, isBase64 ? 'base64' : 'utf8')
    const ext = MIME_TO_EXT[declaredMime] || 'bin'
    return {
      buffer,
      mimeType: declaredMime,
      filename: `upload_${Date.now()}.${ext}`,
    }
  }

  // 2. Resolve to physical file path
  let targetPath = trimmed
  if (trimmed.startsWith('file:')) {
    try {
      targetPath = fileURLToPath(trimmed)
    } catch {
      targetPath = trimmed.replace(/^file:\/\/+/, '/')
    }
  } else if (trimmed.includes('api/local-file')) {
    try {
      const parsed = new URL(trimmed, 'http://localhost')
      const queryPath = parsed.searchParams.get('path')
      if (queryPath) targetPath = queryPath
    } catch {
      const match = trimmed.match(/[?&]path=([^&]+)/)
      if (match) targetPath = decodeURIComponent(match[1])
    }
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

  const buffer = await readFile(normPath)
  const filename = basename(normPath)
  const mimeType = detectMimeType(filename, buffer)

  return {
    buffer,
    mimeType,
    filename,
    filePath: normPath,
    stat: fileStat,
  }
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
    const { buffer, mimeType, filename, filePath, stat: fileStat } = await resolveMediaBytes(cacheKey)
    const category = determineUploadCategory(mimeType)
    const uploadUrl = resolveUploadEndpoint(baseUrl)

    const formData = new FormData()
    const blob = new Blob([buffer], { type: mimeType })
    formData.append('file', blob, filename)
    formData.append('upload_path', category)

    const response = await fetcher(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal,
    })

    if (!response.ok) {
      let errText = ''
      try {
        const errJson = await response.json()
        errText = errJson?.msg || errJson?.error?.message || JSON.stringify(errJson)
      } catch {
        errText = await response.text().catch(() => '')
      }
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

    uploadCache.set(cacheKey, {
      fileUrl,
      expiresAt,
      filePath,
      mtimeMs: fileStat?.mtimeMs,
      sizeBytes: fileStat?.size,
    })

    return fileUrl
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
