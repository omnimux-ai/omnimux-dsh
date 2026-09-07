import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { OmnimuxError } from './errors.js'

const AUDIO_EXT_BY_MIME = Object.freeze({
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/m4a': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/flac': '.flac',
  'audio/mp4': '.mp4',
})

/**
 * Resolve an absolute path, http(s) URL or data URI into uploadable audio.
 * @param {string} audio
 * @param {{ fetcher?: typeof fetch, apiKey?: string, signal?: AbortSignal }} [deps]
 * @returns {Promise<{ bytes: Buffer, filename: string, contentType: string }>}
 */
export async function loadAudioBytes(audio, deps = {}) {
  const value = typeof audio === 'string' ? audio.trim() : ''
  if (!value) {
    throw new OmnimuxError('omnimux-invalid-request', 'audio is required (absolute path, http(s) URL, or data URI)')
  }

  if (value.startsWith('data:')) {
    const comma = value.indexOf(',')
    const header = comma >= 0 ? value.slice(5, comma) : ''
    const payload = comma >= 0 ? value.slice(comma + 1) : ''
    if (!payload) {
      throw new OmnimuxError('omnimux-invalid-request', 'audio data URI has no payload')
    }
    const bytes = Buffer.from(payload, 'base64')
    return audioFromBytes(bytes, header.split(';')[0], 'audio')
  }

  if (/^https?:\/\//i.test(value)) {
    const fetcher = deps.fetcher ?? fetch
    /** @type {Record<string, string>} */
    const headers = {}
    const host = new URL(value).hostname.toLowerCase()
    if (deps.apiKey?.trim() && (host === 'omnimux.ai' || host.endsWith('.omnimux.ai'))) {
      headers.authorization = `Bearer ${deps.apiKey.trim()}`
    }
    const response = await fetcher(value, {
      headers,
      ...(deps.signal ? { signal: deps.signal } : {}),
    })
    if (!response.ok) {
      throw new OmnimuxError('omnimux-download-failed', `audio download failed: ${response.status}`, { status: response.status })
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    const filename = basename(new URL(value).pathname) || 'audio'
    const headerType = typeof response.headers?.get === 'function'
      ? String(response.headers.get('content-type') ?? '').split(';')[0].trim()
      : ''
    return audioFromBytes(bytes, headerType, filename)
  }

  let bytes
  try {
    bytes = readFileSync(value)
  } catch (error) {
    throw new OmnimuxError('omnimux-invalid-request', `audio file is not readable: ${value}`, {
      cause: error instanceof Error ? error : undefined,
    })
  }
  return audioFromBytes(bytes, '', basename(value) || 'audio')
}

/** @param {Buffer} bytes @param {string} declaredType @param {string} filename */
function audioFromBytes(bytes, declaredType, filename) {
  const contentType = mediaFromAudioMagic(bytes)
  if (!contentType) {
    throw new OmnimuxError('omnimux-invalid-request', 'audio type cannot be identified from bytes')
  }
  const declared = normalizeAudioMime(declaredType)
  if (declared && declared !== contentType) {
    throw new OmnimuxError('omnimux-invalid-request', `audio MIME ${declaredType} does not match its bytes`)
  }
  const ext = AUDIO_EXT_BY_MIME[contentType] ?? '.mp3'
  const name = filename.includes('.') ? filename : `${filename}${ext}`
  return { bytes, filename: name, contentType }
}

/** @param {string} mime */
function normalizeAudioMime(mime) {
  const value = String(mime || '').trim().toLowerCase()
  if (value === 'audio/mp3') return 'audio/mpeg'
  if (value === 'audio/x-wav') return 'audio/wav'
  if (value === 'audio/x-m4a') return 'audio/m4a'
  return value
}

/**
 * @param {Uint8Array} bytes
 * @returns {'audio/mpeg' | 'audio/wav' | 'audio/m4a' | 'audio/webm' | 'audio/ogg' | 'audio/flac' | 'audio/mp4' | undefined}
 */
export function mediaFromAudioMagic(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'audio/mpeg'
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg'
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) return 'audio/wav'
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'audio/ogg'
  if (bytes.length >= 4 && bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) return 'audio/flac'
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'audio/webm'
  const ftyp = bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
  if (!ftyp) return undefined
  if (bytes[8] === 0x4d && bytes[9] === 0x34 && bytes[10] === 0x41) return 'audio/m4a'
  return 'audio/mp4'
}

/**
 * Duration for formats with available byte metadata; unknown remains unknown.
 * @param {Uint8Array} bytes
 * @param {string} contentType
 * @returns {number | undefined}
 */
export function durationFromAudioBytes(bytes, contentType) {
  if (contentType === 'audio/wav') return durationFromWave(bytes)
  if (contentType === 'audio/mpeg') return durationFromMp3(bytes)
  return undefined
}

/** @param {Uint8Array} bytes */
function durationFromWave(bytes) {
  if (bytes.byteLength < 12) return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let byteRate
  let dataSize
  let offset = 12
  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
    const declaredSize = view.getUint32(offset + 4, true)
    const dataStart = offset + 8
    const availableSize = Math.min(declaredSize, Math.max(0, bytes.byteLength - dataStart))
    if (id === 'fmt ' && availableSize >= 12) byteRate = view.getUint32(dataStart + 8, true)
    if (id === 'data') dataSize = availableSize
    const next = dataStart + declaredSize + (declaredSize % 2)
    if (next <= offset) break
    offset = next
  }
  if (!byteRate || dataSize === undefined) return undefined
  const seconds = dataSize / byteRate
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined
}

const MPEG_BITRATES = Object.freeze({
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
})

/** @param {Uint8Array} bytes */
function durationFromMp3(bytes) {
  let offset = id3PayloadEnd(bytes)
  let seconds = 0
  let frames = 0
  while (offset + 4 <= bytes.byteLength) {
    const header = readMp3Frame(bytes, offset)
    if (!header) {
      if (frames > 0) break
      offset++
      continue
    }
    if (offset + header.frameBytes > bytes.byteLength) break
    seconds += header.samplesPerFrame / header.sampleRate
    frames++
    offset += header.frameBytes
  }
  return frames > 0 && Number.isFinite(seconds) ? seconds : undefined
}

/** @param {Uint8Array} bytes */
function id3PayloadEnd(bytes) {
  if (bytes.byteLength < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)
  return Math.min(bytes.byteLength, 10 + size + ((bytes[5] & 0x10) ? 10 : 0))
}

/** @param {Uint8Array} bytes @param {number} offset */
function readMp3Frame(bytes, offset) {
  const value = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  if (((value & 0xffe00000) >>> 0) !== 0xffe00000) return undefined
  const versionBits = (value >>> 19) & 0x3
  const layerBits = (value >>> 17) & 0x3
  const bitrateIndex = (value >>> 12) & 0xf
  const sampleRateIndex = (value >>> 10) & 0x3
  if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return undefined
  const version = versionBits === 3 ? 1 : 2
  const layer = 4 - layerBits
  const baseSampleRates = versionBits === 0 ? [11025, 12000, 8000] : versionBits === 2 ? [22050, 24000, 16000] : [44100, 48000, 32000]
  const sampleRate = baseSampleRates[sampleRateIndex]
  const bitrate = MPEG_BITRATES[`${version}-${layer}`]?.[bitrateIndex] * 1000
  if (!bitrate || !sampleRate) return undefined
  const padding = (value >>> 9) & 1
  const samplesPerFrame = layer === 1 ? 384 : layer === 3 && version !== 1 ? 576 : 1152
  const frameBytes = layer === 1
    ? Math.floor(12 * bitrate / sampleRate + padding) * 4
    : Math.floor((layer === 3 && version !== 1 ? 72 : 144) * bitrate / sampleRate) + padding
  if (frameBytes < 4) return undefined
  return { frameBytes, sampleRate, samplesPerFrame }
}
