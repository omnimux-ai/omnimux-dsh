import { readBoundedBody } from '../media/read-bounded-body.js'
import { readFile } from 'node:fs/promises'
import { basename, isAbsolute } from 'node:path'
import { OmnimuxError } from '../media/errors.js'

const MIME_MEDIA = Object.freeze({
  'video/mp4': 'video/mp4',
  'video/webm': 'video/webm',
  'video/quicktime': 'video/quicktime',
})

/** Soft cap aligned with OPC warning threshold before prepare/split. */
const DEFAULT_BYTE_CAP = 20 * 1024 * 1024

/**
 * Load one short video from an absolute path or data URI and return a
 * `data:video/…;base64,…` URI for the chat-completions `image_url` pack.
 * Does not touch `ctx.attachments` — harness ImageMediaType only allows
 * PNG/JPEG/WebP/GIF, so video must bypass the durable image store.
 * @param {string} source
 * @param {{
 *   maxVideoBytes?: number,
 *   fetcher?: typeof fetch,
 *   signal?: AbortSignal,
 * }} [opts]
 */
export async function loadTextVideo(source, opts = {}) {
  const probed = await probeTextVideo(source, opts)
  return {
    dataUri: `data:${probed.mediaType};base64,${Buffer.from(probed.data).toString('base64')}`,
    mediaType: probed.mediaType,
    bytes: probed.sizeBytes,
    name: probed.name,
  }
}

/**
 * Read and identify a video without repacking it for chat transport.
 * @param {string} source
 * @param {{ maxVideoBytes?: number, fetcher?: typeof fetch, signal?: AbortSignal }} [opts]
 */
export async function probeTextVideo(source, opts = {}) {
  const raw = String(source || '').trim()
  if (!raw) {
    throw new OmnimuxError('omnimux-invalid-request', 'video is empty')
  }
  const loaded = raw.startsWith('data:')
    ? decodeVideoDataUri(raw)
    : /^https?:\/\//i.test(raw)
      ? await fetchRemoteVideo(raw, opts)
      : await readLocalVideo(raw, opts.signal)
  const probedMediaType = mediaFromVideoMagic(loaded.data)
  if (!probedMediaType) {
    throw new OmnimuxError('omnimux-invalid-request', 'video must be MP4, WebM, or QuickTime')
  }
  if (loaded.mediaType && loaded.mediaType !== probedMediaType) {
    throw new OmnimuxError('omnimux-invalid-request', `video MIME ${loaded.mediaType} does not match its bytes`)
  }
  const mediaType = probedMediaType
  const cap = typeof opts.maxVideoBytes === 'number' && opts.maxVideoBytes > 0
    ? opts.maxVideoBytes
    : DEFAULT_BYTE_CAP
  if (loaded.data.byteLength > cap) {
    throw new OmnimuxError('omnimux-invalid-request', `video exceeds ${cap} bytes`)
  }
  const durationSec = durationFromIsoBmff(loaded.data)
  return {
    data: loaded.data,
    mediaType,
    sizeBytes: loaded.data.byteLength,
    name: loaded.name,
    ...(durationSec !== undefined ? { durationSec } : {}),
  }
}

/**
 * Read the movie-header duration from an MP4/QuickTime ISO-BMFF container.
 * Missing or malformed metadata stays unknown so the model contract can fail
 * closed when it declares a duration limit.
 * @param {Uint8Array} bytes
 * @returns {number | undefined}
 */
export function durationFromIsoBmff(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  /** @param {number} start @param {number} end */
  function scan(start, end) {
    let offset = start
    while (offset + 8 <= end) {
      const size32 = view.getUint32(offset)
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
      let headerSize = 8
      let boxSize = size32
      if (size32 === 1) {
        if (offset + 16 > end) return undefined
        const size64 = view.getBigUint64(offset + 8)
        if (size64 > BigInt(Number.MAX_SAFE_INTEGER)) return undefined
        boxSize = Number(size64)
        headerSize = 16
      } else if (size32 === 0) {
        boxSize = end - offset
      }
      if (boxSize < headerSize || offset + boxSize > end) return undefined
      const payloadStart = offset + headerSize
      const boxEnd = offset + boxSize
      if (type === 'mvhd') {
        if (payloadStart + 4 > boxEnd) return undefined
        const version = bytes[payloadStart]
        const timescaleOffset = version === 0 ? payloadStart + 12 : version === 1 ? payloadStart + 20 : -1
        const durationOffset = version === 0 ? payloadStart + 16 : payloadStart + 24
        const durationBytes = version === 0 ? 4 : 8
        if (timescaleOffset < 0 || durationOffset + durationBytes > boxEnd) return undefined
        const timescale = view.getUint32(timescaleOffset)
        const duration = version === 0
          ? view.getUint32(durationOffset)
          : view.getBigUint64(durationOffset)
        if (timescale === 0) return undefined
        const seconds = typeof duration === 'bigint'
          ? Number(duration) / timescale
          : duration / timescale
        return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined
      }
      if (type === 'moov') {
        const nested = scan(payloadStart, boxEnd)
        if (nested !== undefined) return nested
      }
      offset = boxEnd
    }
    return undefined
  }

  return scan(0, bytes.byteLength)
}

/**
 * @param {string} url
 * @param {{ maxVideoBytes?: number, fetcher?: typeof fetch, signal?: AbortSignal }} opts
 */
async function fetchRemoteVideo(url, opts) {
  const fetcher = opts.fetcher ?? fetch
  const cap = typeof opts.maxVideoBytes === 'number' && opts.maxVideoBytes > 0
    ? opts.maxVideoBytes
    : DEFAULT_BYTE_CAP
  let response
  try {
    response = await fetcher(url, opts.signal ? { signal: opts.signal } : undefined)
  } catch (error) {
    throw new OmnimuxError('omnimux-invalid-request', `failed to fetch video: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw new OmnimuxError('omnimux-invalid-request', `video URL returned HTTP ${response.status}`)
  }
  const headerType = MIME_MEDIA[(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase()]
  let data
  try {
    data = await readBoundedBody(response, cap, { signal: opts.signal, message: `video exceeds ${cap} bytes` })
  } catch (error) {
    throw new OmnimuxError('omnimux-invalid-request', error instanceof Error ? error.message : String(error))
  }
  return {
    data,
    mediaType: headerType,
    name: basename(new URL(url).pathname) || 'video',
  }
}

/**
 * Pack for OmniMux chat completions. Spike + OPC lock: put the video data
 * URI inside `image_url`, never OpenAI-style `video_url`.
 * @param {{ dataUri: string }} packed
 */
export function toVideoImageUrlPart(packed) {
  const url = typeof packed?.dataUri === 'string' ? packed.dataUri.trim() : ''
  if (!url.startsWith('data:video/')) {
    throw new OmnimuxError('omnimux-invalid-request', 'video pack must be a data:video URI')
  }
  return {
    type: 'image_url',
    image_url: { url },
  }
}

/**
 * @param {string} uri
 */
export function decodeVideoDataUri(uri) {
  const match = uri.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match) {
    throw new OmnimuxError('omnimux-invalid-request', 'video data URI is malformed')
  }
  const declared = MIME_MEDIA[(match[1] || '').trim().toLowerCase()]
  if (!declared) {
    throw new OmnimuxError('omnimux-invalid-request', 'video data URI must declare video/mp4, video/webm, or video/quicktime')
  }
  const isBase64 = Boolean(match[2])
  const payload = match[3] || ''
  let data
  try {
    data = Uint8Array.from(Buffer.from(payload, isBase64 ? 'base64' : 'utf8'))
  } catch {
    throw new OmnimuxError('omnimux-invalid-request', 'video data URI is malformed')
  }
  return { data, mediaType: declared, name: 'video' }
}

/**
 * @param {string} filePath
 * @param {AbortSignal} [signal]
 */
async function readLocalVideo(filePath, signal) {
  if (!isAbsolute(filePath)) {
    throw new OmnimuxError('omnimux-invalid-request', 'video path must be absolute')
  }
  let data
  try {
    data = new Uint8Array(await readFile(filePath, signal ? { signal } : undefined))
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new OmnimuxError('omnimux-invalid-request', `video file not found: ${filePath}`)
    }
    throw error
  }
  return {
    data,
    name: basename(filePath),
  }
}

/**
 * Return a broad video MIME only after reading the container signature. This
 * intentionally refuses extension or data-URI declarations without matching
 * bytes, so external request metadata cannot choose the guard's asset type.
 * @param {Uint8Array} bytes
 * @returns {'video/mp4' | 'video/webm' | 'video/quicktime' | undefined}
 */
export function mediaFromVideoMagic(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'video/webm'
  }
  const ftyp = bytes.length >= 8
    && ((bytes[0] === 0x66 && bytes[1] === 0x74 && bytes[2] === 0x79 && bytes[3] === 0x70)
      || (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70))
  if (!ftyp) return undefined
  const brandOffset = bytes[0] === 0x66 ? 4 : 8
  if (bytes.length >= brandOffset + 2 && bytes[brandOffset] === 0x71 && bytes[brandOffset + 1] === 0x74) {
    return 'video/quicktime'
  }
  return 'video/mp4'
}
