import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { OmnimuxError } from './errors.js'
import { classifyQuotaFailure } from '../errors/quota-classifier.js'
import { DEFAULT_REQUEST_TIMEOUT_MS, RETRYABLE_STATUS } from './task-deadline.js'
import { appendMediaTaskLog } from './task-log.js'

/**
 * Upstream 401s on media /v1 endpoints do NOT mean "not signed in": the console
 * login token (access_token) is accepted by /api/* account endpoints but rejected
 * by the media gateway, which requires an `sk-` API key. Keep the established
 * `needs-omnimux` code (callers key off it) but report the real cause so a
 * signed-in user is no longer told "请先登录" (Issue #2975).
 *
 * @param {string | undefined} apiKey The credential actually placed on the request.
 * @param {number} status
 * @returns {OmnimuxError}
 */
export function credentialRejectedError(apiKey, status) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : ''
  const message = key.startsWith('sk-')
    ? '生成服务拒绝了当前 API 密钥（401），请检查密钥是否有效或已过期'
    : '生成服务不接受登录凭证（需要 sk- 开头的 API 密钥），请在凭证中配置 OMNIMUX_API_KEY 后重试'
  return new OmnimuxError('needs-omnimux', message, { status })
}

/**
 * One poll request, bounded.
 *
 * Issue #1382: the composed signal **must** reach `fetcher`. A post-hoc
 * `throwIfAborted()` cannot constrain a request that never settles — that check
 * only runs once `fetch` returns, which is exactly what does not happen when a
 * provider hangs. Measured before the fix: a request against a server that
 * never answered hung indefinitely; with the signal passed in, the same request
 * rejected with `TimeoutError` after ~302ms for a 300ms timeout.
 *
 * Cancellation attribution reads the two signals' own `aborted` flags instead
 * of the composed `reason`, so a caller that happens to abort with a
 * `TimeoutError` of its own is still reported as a caller cancellation.
 *
 * This function never retries: retrying here *and* in the poll loop would
 * multiply the two layers' backoff and hide the real wall clock. It only marks
 * whether repeating could help.
 *
 * @param {typeof fetch} fetcher
 * @param {string} url
 * @param {string} apiKey
 * @param {AbortSignal | undefined} callerSignal
 * @param {{ requestTimeoutMs?: number }} [options]
 */
export async function getJson(fetcher, url, apiKey, callerSignal, options = {}) {
  /** @type {Record<string, string>} */
  const headers = {
    accept: 'application/json',
    ...(apiKey && apiKey.trim() ? { authorization: `Bearer ${apiKey.trim()}` } : {}),
  }
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) && /** @type {number} */ (options.requestTimeoutMs) > 0
    ? /** @type {number} */ (options.requestTimeoutMs)
    : DEFAULT_REQUEST_TIMEOUT_MS
  const timer = AbortSignal.timeout(requestTimeoutMs)
  const signal = callerSignal ? AbortSignal.any([callerSignal, timer]) : timer
  let response
  try {
    response = await fetcher(url, { method: 'GET', headers, signal })
  } catch (cause) {
    // A caller cancellation is not a timeout, whichever signal fired first.
    if (callerSignal?.aborted) {
      throw new OmnimuxError('omnimux-aborted', 'poll request aborted', { cause })
    }
    if (timer.aborted) throw timer.reason ?? new Error('poll request timed out')
    throw new OmnimuxError('omnimux-request-failed', 'GET request failed', { retryable: true, cause })
  }
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
      // A credential was sent and the gateway rejected it — report the type
      // mismatch truthfully instead of telling a signed-in user to log in.
      if (apiKey && apiKey.trim()) throw credentialRejectedError(apiKey, response.status)
      throw new OmnimuxError('needs-omnimux', classified.message, { status: response.status })
    }
    throw new OmnimuxError('omnimux-request-failed', `GET request failed (HTTP ${response.status})`, {
      status: response.status,
      // Data only: whether a repeat is worth attempting is the poll loop's call.
      retryable: RETRYABLE_STATUS.has(response.status),
    })
  }
  return body
}

/**
 * Detect transient / propagation delay errors during media artifact download.
 *
 * Upstream video/media content endpoints (e.g. omnimux.ai/v1/videos/:id/content)
 * may take several seconds after coordinator status 'succeeded' before the file
 * is fully transcoded/propagated on the CDN or storage, returning 400
 * {"error":{"message":"Task is not completed yet, current status: NOT_START","type":"invalid_request_error"}}
 * or 404. Transient network issues and 408/429/5xx status codes are also retryable.
 *
 * @param {{ status?: number, body?: unknown, error?: unknown }} failure
 * @returns {boolean}
 */
export function isDownloadRetryable({ status, body, error } = {}) {
  if (error) {
    if (error && typeof error === 'object' && (error.name === 'AbortError' || error.code === 'omnimux-aborted')) {
      return false
    }
    return true
  }
  if (status === 404) return true
  if (status === 400) {
    const msg = String(
      (typeof body === 'object' && body !== null && (body?.error?.message ?? body?.message))
      || (typeof body === 'string' ? body : '')
    ).toLowerCase()
    return (
      msg.includes('not completed')
      || msg.includes('not_start')
      || msg.includes('processing')
      || msg.includes('queued')
      || msg.includes('pending')
      || msg.includes('task is not')
    )
  }
  if (typeof status === 'number' && RETRYABLE_STATUS.has(status)) return true
  return false
}

/**
 * @param {number} ms
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<void>}
 */
function sleepWithSignal(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new OmnimuxError('omnimux-aborted', 'download aborted', { cause: signal.reason }))
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new OmnimuxError('omnimux-aborted', 'download aborted', { cause: signal.reason }))
    }
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

/**
 * @param {{
 *   dest: string,
 *   url: string,
 *   capability?: 'video' | 'image' | 'audio',
 *   apiKey?: string,
 *   providerId?: string,
 *   fetcher?: typeof fetch,
 *   signal?: AbortSignal,
 *   maxRetries?: number,
 *   retryDelayMs?: number,
 *   requestTimeoutMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   credentialOrigin?: string,
 * }} options
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
    let isOfficialDownload = false
    // A local provider authenticates its own artifact download (Issue #3167).
    // The key is attached only when the caller names the exact origin it is
    // willing to send it to, so a bare loopback URL never inherits a credential
    // merely by being configured as a download source.
    let matchesCredentialOrigin = false
    try {
      const target = new URL(url)
      isOfficialDownload = target.protocol === 'https:' && !target.port && !target.username && !target.password
        && (target.hostname === 'api.omnimux.ai' || target.hostname === 'omnimux.ai')
      matchesCredentialOrigin = Boolean(options.credentialOrigin)
        && target.origin === String(options.credentialOrigin).replace(/\/+$/, '')
    } catch {
      // Relative or malformed URLs have no verified official credential recipient.
    }
    if (options.apiKey?.trim() && (!options.providerId || options.providerId === 'omnimux') && isOfficialDownload) {
      headers.authorization = `Bearer ${options.apiKey.trim()}`
    } else if (options.apiKey?.trim() && matchesCredentialOrigin) {
      headers.authorization = `Bearer ${options.apiKey.trim()}`
    }

    const maxRetries = Number.isFinite(options.maxRetries) && options.maxRetries >= 0 ? options.maxRetries : 30
    const retryDelayMs = Number.isFinite(options.retryDelayMs) && options.retryDelayMs >= 0 ? options.retryDelayMs : 1500
    const sleep = options.sleep ?? ((ms) => sleepWithSignal(ms, options.signal))

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (options.signal?.aborted) {
        throw new OmnimuxError('omnimux-aborted', 'download aborted', { cause: options.signal.reason })
      }
      const timeoutMs = Number.isFinite(options.requestTimeoutMs) && options.requestTimeoutMs > 0 ? options.requestTimeoutMs : 60_000
      const timer = AbortSignal.timeout(timeoutMs)
      const signal = options.signal ? AbortSignal.any([options.signal, timer]) : timer
      try {
        const response = await fetcher(url, { headers, signal })
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
            if (headers.authorization) throw credentialRejectedError(options.apiKey, response.status)
            throw new OmnimuxError('needs-omnimux', classified.message, { status: response.status })
          }
          if (attempt < maxRetries && isDownloadRetryable({ status: response.status, body })) {
            await sleep(retryDelayMs)
            continue
          }
          const failureDetail = typeof body === 'object' && body !== null && body?.error?.message ? ` (${body.error.message})` : ''
          throw new OmnimuxError('omnimux-download-failed', `download failed: ${response.status}${failureDetail}`, {
            status: response.status,
            details: body,
          })
        }
        contentType = typeof response.headers?.get === 'function'
          ? String(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
          : ''
        buffer = Buffer.from(await response.arrayBuffer())
        break
      } catch (err) {
        if (err?.code === 'omnimux-aborted' || options.signal?.aborted) {
          throw err
        }
        if (err?.code === 'quota-exceeded' || err?.code === 'needs-omnimux' || err?.code === 'CHANNEL_UNAVAILABLE') {
          throw err
        }
        if (err instanceof OmnimuxError && err.code === 'omnimux-download-failed') {
          throw err
        }
        if (attempt < maxRetries && isDownloadRetryable({ error: err })) {
          await sleep(retryDelayMs)
          continue
        }
        void appendMediaTaskLog({
          event: 'download.failed',
          taskRef: options.taskRef,
          capability: options.capability,
          attempt,
          upstreamCode: typeof err?.code === 'string' ? err.code : undefined,
          httpStatus: typeof err?.status === 'number' ? err.status : undefined,
          message: err instanceof Error ? err.message : String(err),
        })
        throw new OmnimuxError('omnimux-download-failed', `download failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err })
      }
    }
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
