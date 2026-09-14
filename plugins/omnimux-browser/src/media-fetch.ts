/**
 * Host-side download of ONE page media the user explicitly lit in the panel.
 *
 * Why the host does it: the extension page may not reach the open internet (its
 * `connect-src` is loopback plus a fixed host allowlist, enforced by the L0
 * static gate), yet the model needs the image's real bytes rather than a URL it
 * may never be able to fetch. The panel therefore asks the host over the existing
 * bridge, and the host — whose outbound traffic is not under the extension's CSP
 * — performs the request.
 *
 * This is deliberately not a general web fetcher:
 *   - input must parse as `http(s)://`; anything else is refused before dialing
 *   - one attempt, no redirect chasing beyond what `fetch` does by default, no retry
 *   - a wall-clock budget ({@link MEDIA_FETCH_TIMEOUT_MS})
 *   - a hard response-body ceiling ({@link MEDIA_FETCH_MAX_BYTES}), enforced while
 *     streaming so a lying or endless body cannot fill memory first
 *   - `content-length` is consulted up front, so an oversized body is refused
 *     without being downloaded at all
 *
 * Every outcome is reported as a discriminated {@link MediaFetchOutcome} instead
 * of a thrown error: a 404 or a timeout on someone else's server is an expected
 * answer, and the panel has to tell the cases apart to write the right message
 * (the extension port collapses carrier-level errors into a single code).
 *
 * @module
 */

import type { MediaFetchOutcome } from './protocol.ts'

/** Wall-clock budget for one lit page media. */
export const MEDIA_FETCH_TIMEOUT_MS = 9_000

/** Largest response body the host will hand back, in bytes. */
export const MEDIA_FETCH_MAX_BYTES = 8 * 1024 * 1024

/** Injectable seams; production uses the globals. */
export interface MediaFetchOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxBytes?: number
}

/** Whether a lit media address is one the host is willing to dial. */
export function isFetchableMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Read a response body, refusing to exceed `maxBytes`.
 *
 * @returns the bytes, or `null` when the body crossed the ceiling.
 */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers?.get?.('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > maxBytes) return null

  const body = response.body
  if (body === null || body === undefined) {
    const whole = new Uint8Array(await response.arrayBuffer())
    return whole.byteLength > maxBytes ? null : whole
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    /* v8 ignore next -- a stream never yields an empty chunk in practice; skipping
    one keeps the byte count honest if it ever does */
    if (value === undefined) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  return bytes
}

/**
 * Download one lit page media.
 *
 * @param url - the media address, as the page reported it.
 * @param options - injectable fetch, budget, and ceiling (tests only).
 * @returns a tagged outcome; never throws for a remote failure.
 */
export async function fetchMediaBytes(
  url: unknown,
  options: MediaFetchOptions = {},
): Promise<MediaFetchOutcome> {
  if (!isFetchableMediaUrl(url)) {
    return { status: 'bad-request', message: 'only http(s) media addresses are fetched' }
  }
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? MEDIA_FETCH_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? MEDIA_FETCH_MAX_BYTES

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { signal: controller.signal })
    if (!response.ok) return { status: 'http-error', statusCode: response.status }
    const bytes = await readCapped(response, maxBytes)
    if (bytes === null) return { status: 'too-large', limit: maxBytes }
    return {
      status: 'ok',
      contentType: response.headers?.get?.('content-type') ?? '',
      byteLength: bytes.byteLength,
      data: Buffer.from(bytes).toString('base64'),
    }
  } catch (error: unknown) {
    if (controller.signal.aborted) return { status: 'timeout', timeoutMs }
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}
