import { readBoundedBody } from '../media/read-bounded-body.js'
import { readFile } from 'node:fs/promises'
import { basename, isAbsolute } from 'node:path'
import { OmnimuxError } from '../media/errors.js'

const MIME_MEDIA = Object.freeze({
  'audio/mp3': 'audio/mp3',
  'audio/mpeg': 'audio/mpeg',
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/m4a': 'audio/m4a',
  'audio/x-m4a': 'audio/m4a',
  'audio/webm': 'audio/webm',
})

const DEFAULT_BYTE_CAP = 25 * 1024 * 1024

/**
 * Load one short audio from an absolute path or data URI and return a
 * `data:audio/…;base64,…` URI for the chat-completions transport.
 * @param {string} source
 * @param {{
 *   maxAudioBytes?: number,
 *   fetcher?: typeof fetch,
 *   signal?: AbortSignal,
 * }} [opts]
 */
export async function loadTextAudio(source, opts = {}) {
  const probed = await probeTextAudio(source, opts)
  return {
    dataUri: `data:${probed.mediaType};base64,${Buffer.from(probed.data).toString('base64')}`,
    mediaType: probed.mediaType,
    bytes: probed.sizeBytes,
    name: probed.name,
  }
}

/**
 * Read and identify an audio without repacking it for chat transport.
 * @param {string} source
 * @param {{ maxAudioBytes?: number, fetcher?: typeof fetch, signal?: AbortSignal }} [opts]
 */
export async function probeTextAudio(source, opts = {}) {
  const raw = String(source || '').trim()
  if (!raw) {
    throw new OmnimuxError('omnimux-invalid-request', 'audio is empty')
  }
  const loaded = raw.startsWith('data:')
    ? decodeAudioDataUri(raw)
    : /^https?:\/\//i.test(raw)
      ? await fetchRemoteAudio(raw, opts)
      : await readLocalAudio(raw, opts.signal)
  const probedMediaType = mediaFromAudioMagic(loaded.data, loaded.mediaType)
  if (!probedMediaType) {
    throw new OmnimuxError('omnimux-invalid-request', 'audio must be MP3, WAV, or MPEG')
  }
  const mediaType = probedMediaType
  const cap = typeof opts.maxAudioBytes === 'number' && opts.maxAudioBytes > 0
    ? opts.maxAudioBytes
    : DEFAULT_BYTE_CAP
  if (loaded.data.byteLength > cap) {
    throw new OmnimuxError('omnimux-invalid-request', `audio exceeds ${cap} bytes`)
  }
  return {
    data: loaded.data,
    mediaType,
    sizeBytes: loaded.data.byteLength,
    name: loaded.name,
  }
}

export function toAudioImageUrlPart(media) {
  if (!media || typeof media !== 'object') {
    throw new OmnimuxError('omnimux-invalid-request', 'media object is required')
  }
  const url = typeof media.dataUri === 'string' && media.dataUri.trim()
  if (!url || !url.startsWith('data:audio/')) {
    throw new OmnimuxError('omnimux-invalid-request', 'audio must have a data:audio URI')
  }
  return {
    type: 'image_url',
    image_url: { url },
  }
}

function decodeAudioDataUri(dataUri) {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.*)$/is.exec(dataUri.trim())
  if (!match) {
    throw new OmnimuxError('omnimux-invalid-request', 'audio data URI must be base64')
  }
  const declaredMime = match[1]?.toLowerCase()
  const data = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
  if (data.byteLength === 0) {
    throw new OmnimuxError('omnimux-invalid-request', 'audio data URI has no content')
  }
  return {
    data,
    mediaType: declaredMime && MIME_MEDIA[declaredMime] ? MIME_MEDIA[declaredMime] : undefined,
    name: 'data-audio',
  }
}

async function fetchRemoteAudio(url, opts = {}) {
  const fetcher = opts.fetcher ?? fetch
  let response
  try {
    response = await fetcher(url, { signal: opts.signal })
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
      throw new OmnimuxError('omnimux-aborted', 'audio fetch aborted')
    }
    throw new OmnimuxError('omnimux-invalid-request', `failed to fetch audio: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!response.ok) {
    throw new OmnimuxError('omnimux-invalid-request', `audio URL returned HTTP ${response.status}`)
  }
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  const data = await readBoundedBody(response, opts.maxAudioBytes ?? DEFAULT_BYTE_CAP)
  return {
    data,
    mediaType: contentType && MIME_MEDIA[contentType] ? MIME_MEDIA[contentType] : undefined,
    name: basename(new URL(url).pathname) || 'audio',
  }
}

async function readLocalAudio(filePath, signal) {
  if (signal?.aborted) {
    throw new OmnimuxError('omnimux-aborted', 'audio read aborted')
  }
  if (!isAbsolute(filePath)) {
    throw new OmnimuxError('omnimux-invalid-request', `audio path must be absolute: ${filePath}`)
  }
  let data
  try {
    data = await readFile(filePath, { signal })
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
      throw new OmnimuxError('omnimux-aborted', 'audio read aborted')
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new OmnimuxError('omnimux-invalid-request', `audio file not found: ${filePath}`)
    }
    throw error
  }
  return {
    data,
    name: basename(filePath),
  }
}

export function mediaFromAudioMagic(bytes, declaredMime) {
  if (declaredMime && MIME_MEDIA[declaredMime]) return MIME_MEDIA[declaredMime]
  // RIFF .... WAVE
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
    return 'audio/wav'
  }
  // ID3v2
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return 'audio/mp3'
  }
  // MP3 frame sync: 0xFF followed by 0xFB, 0xF3, 0xF2
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return 'audio/mp3'
  }
  return undefined
}
