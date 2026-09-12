import { readFile } from 'node:fs/promises'
import { basename, isAbsolute } from 'node:path'
import { OmnimuxError } from '../media/errors.js'

const MIME_MEDIA = Object.freeze({
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
  'image/bmp': 'image/bmp',
  'image/tiff': 'image/tiff',
  'image/heic': 'image/heic',
  'image/heif': 'image/heif',
})

const DEFAULT_BYTE_CAP = 10 * 1024 * 1024

/**
 * Probe one image from an absolute path, http(s) URL, or data URI. The
 * returned MIME and byte count come from the loaded bytes and are safe for
 * SubmitGuard admission; this function has no durable-store side effect.
 * @param {string} source
 * @param {{
 *   attachments: { imageLimits?: { maxImageBytes?: number, mediaTypes?: string[] } },
 *   fetcher?: typeof fetch,
 *   signal?: AbortSignal,
 * }} deps
 */
export async function probeTextImage(source, deps) {
  const raw = String(source || '').trim()
  if (!raw) {
    throw new OmnimuxError('omnimux-invalid-request', 'image is empty')
  }
  const loaded = raw.startsWith('data:')
    ? decodeDataUri(raw)
    : /^https?:\/\//i.test(raw)
      ? await fetchRemoteImage(raw, deps)
      : await readLocalImage(raw, deps.signal)
  const probedMediaType = mediaFromMagic(loaded.data)
  if (!probedMediaType) {
    throw new OmnimuxError('omnimux-invalid-request', 'image format is not recognized')
  }
  if (loaded.mediaType && loaded.mediaType !== probedMediaType) {
    throw new OmnimuxError('omnimux-invalid-request', `image MIME ${loaded.mediaType} does not match its bytes`)
  }
  const mediaType = probedMediaType
  const allowed = deps.attachments.imageLimits?.mediaTypes
  if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(mediaType)) {
    throw new OmnimuxError('omnimux-invalid-request', `image type ${mediaType} is not accepted`)
  }
  const cap = deps.attachments.imageLimits?.maxImageBytes ?? DEFAULT_BYTE_CAP
  if (loaded.data.byteLength > cap) {
    throw new OmnimuxError('omnimux-invalid-request', `image exceeds ${cap} bytes`)
  }
  return {
    data: loaded.data,
    mediaType,
    name: loaded.name,
    sizeBytes: loaded.data.byteLength,
  }
}

/**
 * Commit a previously probed image through the durable attachment store.
 * @param {{ data: Uint8Array, mediaType: string, name: string }} image
 * @param {{ saveImage: Function }} attachments
 */
export function saveProbedTextImage(image, attachments) {
  return attachments.saveImage({
    data: image.data,
    mediaType: image.mediaType,
    name: image.name,
  })
}

/**
 * Pack a previously probed image as a chat-completions `image_url` part. Mirrors
 * `toVideoImageUrlPart` so a routed text request can carry its images through
 * the direct path instead of falling back to `llm.stream`.
 * @param {{ data: Uint8Array, mediaType: string }} image
 * @returns {{ type: 'image_url', image_url: { url: string } }}
 */
export function toImageUrlPart(image) {
  const bytes = image?.data
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new OmnimuxError('omnimux-invalid-request', 'image pack requires probed bytes')
  }
  const mediaType = typeof image.mediaType === 'string' ? image.mediaType : ''
  if (!mediaType.startsWith('image/')) {
    throw new OmnimuxError('omnimux-invalid-request', 'image pack requires an image media type')
  }
  return {
    type: 'image_url',
    image_url: { url: `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}` },
  }
}

/**
 * @param {string} uri
 */
export function decodeDataUri(uri) {
  const match = uri.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match) {
    throw new OmnimuxError('omnimux-invalid-request', 'image data URI is malformed')
  }
  const declared = MIME_MEDIA[(match[1] || '').trim().toLowerCase()]
  const isBase64 = Boolean(match[2])
  const payload = match[3] || ''
  let data
  try {
    data = Uint8Array.from(Buffer.from(payload, isBase64 ? 'base64' : 'utf8'))
  } catch {
    throw new OmnimuxError('omnimux-invalid-request', 'image data URI is malformed')
  }
  return { data, mediaType: declared ?? mediaFromMagic(data), name: 'image' }
}

/**
 * @param {string} filePath
 * @param {AbortSignal} [signal]
 */
async function readLocalImage(filePath, signal) {
  if (!isAbsolute(filePath)) {
    throw new OmnimuxError('omnimux-invalid-request', 'image path must be absolute')
  }
  let data
  try {
    data = new Uint8Array(await readFile(filePath, signal ? { signal } : undefined))
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new OmnimuxError('omnimux-invalid-request', `image file not found: ${filePath}`)
    }
    throw error
  }
  return {
    data,
    name: basename(filePath),
  }
}

/**
 * @param {string} url
 * @param {{ fetcher?: typeof fetch, signal?: AbortSignal, attachments: { imageLimits?: { maxImageBytes?: number } } }} deps
 */
async function fetchRemoteImage(url, deps) {
  const fetcher = deps.fetcher ?? fetch
  const cap = deps.attachments.imageLimits?.maxImageBytes ?? DEFAULT_BYTE_CAP
  let response
  try {
    response = await fetcher(url, deps.signal ? { signal: deps.signal } : undefined)
  } catch (error) {
    throw new OmnimuxError('omnimux-invalid-request', `failed to fetch image: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!response.ok) {
    throw new OmnimuxError('omnimux-invalid-request', `image URL returned HTTP ${response.status}`)
  }
  const headerType = MIME_MEDIA[(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase()]
  const buffer = new Uint8Array(await response.arrayBuffer())
  if (buffer.byteLength > cap) {
    throw new OmnimuxError('omnimux-invalid-request', `image exceeds ${cap} bytes`)
  }
  return {
    data: buffer,
    mediaType: headerType,
    name: basename(new URL(url).pathname) || 'image',
  }
}

/**
 * @param {Uint8Array} bytes
 * @returns {'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/bmp' | 'image/tiff' | 'image/heic' | 'image/heif' | undefined}
 */
export function mediaFromMagic(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif'
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp'
  }
  if (
    bytes.length >= 4
    && ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00)
      || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a))
  ) {
    return 'image/tiff'
  }
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brands = []
    for (let offset = 8; offset + 4 <= Math.min(bytes.length, 40); offset += 4) {
      brands.push(String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]).toLowerCase())
    }
    if (brands.some((brand) => ['heic', 'heix', 'hevc', 'hevx'].includes(brand))) return 'image/heic'
    if (brands.some((brand) => ['heif', 'mif1', 'msf1'].includes(brand))) return 'image/heif'
  }
  return undefined
}
