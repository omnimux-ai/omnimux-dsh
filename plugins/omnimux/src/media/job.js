import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { OmnimuxError } from './errors.js'
import { classifyQuotaFailure } from '../errors/quota-classifier.js'

/**
 * @param {typeof fetch} fetcher
 * @param {string} url
 * @param {string} apiKey
 * @param {AbortSignal | undefined} signal
 */
export async function getJson(fetcher, url, apiKey, signal) {
  /** @type {Record<string, string>} */
  const headers = {
    accept: 'application/json',
    ...(apiKey && apiKey.trim() ? { authorization: `Bearer ${apiKey.trim()}` } : {}),
  }
  const response = await fetcher(url, {
    method: 'GET',
    headers,
    ...(signal ? { signal } : {}),
  })
  let body = null
  try {
    body = await response.json()
  } catch {
    try { body = await response.text() } catch { body = null }
  }
  if (!response.ok) {
    const classified = classifyQuotaFailure({ status: response.status, body })
    if (classified.kind === 'channel-unavailable') {
      throw new OmnimuxError(classified.code, classified.message, { status: response.status })
    }
    if (classified.kind === 'quota-exceeded') {
      throw new OmnimuxError('quota-exceeded', classified.message, { status: response.status, details: classified })
    }
    if (classified.kind === 'needs-omnimux') {
      throw new OmnimuxError('needs-omnimux', classified.message, { status: response.status })
    }
    throw new OmnimuxError('omnimux-request-failed', `GET request failed (HTTP ${response.status})`, { status: response.status })
  }
  return body
}

/**
 * @param {{ dest: string, url: string, capability?: 'video' | 'image' | 'audio', apiKey?: string, fetcher?: typeof fetch, signal?: AbortSignal }} options
 */
export async function downloadMediaFile(options) {
  const url = options.url
  let buffer
  let contentType = ''
  if (url.startsWith('data:')) {
    const headerEnd = url.indexOf(',')
    contentType = (headerEnd >= 0 ? url.slice(5, headerEnd) : '').split(';')[0].trim().toLowerCase()
    const comma = url.indexOf(',')
    const payload = comma >= 0 ? url.slice(comma + 1) : ''
    if (!payload) {
      throw new OmnimuxError('omnimux-download-failed', 'data URL has no payload')
    }
    buffer = Buffer.from(payload, 'base64')
  } else {
    const fetcher = options.fetcher ?? fetch
    /** @type {Record<string, string>} */
    const headers = {}
    if (options.apiKey?.trim() && (url.includes('omnimux.ai') || url.startsWith('/'))) {
      headers.authorization = `Bearer ${options.apiKey.trim()}`
    }
    const response = await fetcher(url, {
      headers,
      ...(options.signal ? { signal: options.signal } : {}),
    })
    if (!response.ok) {
      let body = null
      try { body = await response.clone().json() } catch {
        try { body = await response.clone().text() } catch { body = null }
      }
      const classified = classifyQuotaFailure({ status: response.status, body })
      if (classified.kind === 'channel-unavailable') {
        throw new OmnimuxError(classified.code, classified.message, { status: response.status })
      }
      if (classified.kind === 'quota-exceeded') {
        throw new OmnimuxError('quota-exceeded', classified.message, { status: response.status, details: classified })
      }
      if (classified.kind === 'needs-omnimux') {
        throw new OmnimuxError('needs-omnimux', classified.message, { status: response.status })
      }
      throw new OmnimuxError('omnimux-download-failed', `download failed: ${response.status}`, { status: response.status })
    }
    contentType = typeof response.headers?.get === 'function'
      ? String(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      : ''
    buffer = Buffer.from(await response.arrayBuffer())
  }
  if (buffer.byteLength === 0) {
    throw new OmnimuxError('omnimux-invalid-response', `${options.capability ?? 'media'} download contained no bytes`)
  }
  assertDownloadedMediaType(contentType, options.capability)
  mkdirSync(dirname(options.dest), { recursive: true })
  writeFileSync(options.dest, buffer)
}

/**
 * A URL-only provider result has no trustworthy MIME until the bytes are
 * downloaded. Require the response to identify the broad media type before
 * writing it to the requested destination.
 * @param {string} contentType
 * @param {'video' | 'image' | 'audio' | undefined} capability
 */
export function assertDownloadedMediaType(contentType, capability) {
  if (!capability) return
  if (!contentType) {
    throw new OmnimuxError('omnimux-invalid-response', `${capability} download omitted Content-Type`)
  }
  if (!contentType.startsWith(`${capability}/`)) {
    throw new OmnimuxError('omnimux-invalid-response', `expected ${capability} output, got ${contentType}`)
  }
}
