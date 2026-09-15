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
 * This is deliberately not a general web fetcher. The panel is a web page; the
 * host is not, and a request the panel is allowed to *name* must not silently
 * become a request the host makes with authority the panel never had (a browser
 * page cannot read `http://127.0.0.1:…` cross-origin — the host can). So:
 *   - input must parse as `http(s)://` **and** name a public host; loopback,
 *     private, link-local and `.local` targets are refused before dialing
 *   - redirects are followed by hand ({@link MEDIA_FETCH_MAX_REDIRECTS} hops) with
 *     every hop re-validated, so a public URL cannot bounce the host into a
 *     private one — `fetch`'s default redirect chasing would dial it first
 *   - a wall-clock budget ({@link MEDIA_FETCH_TIMEOUT_MS}), one attempt per hop,
 *     no retry
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

/** Redirect hops a lit media may take before the host gives up. */
export const MEDIA_FETCH_MAX_REDIRECTS = 5

/** The one message an address refusal ever carries. */
export const MEDIA_FETCH_BAD_REQUEST_MESSAGE = 'only public http(s) media addresses are fetched'

/**
 * What an unexpected transport failure reports.
 *
 * Deliberately fixed: a thrown cause can name internal hosts (`getaddrinfo
 * ENOTFOUND internal-host.local`) or filesystem paths, and this string is the only
 * part of a failure that crosses the bridge. The cause itself is logged host-side.
 */
export const MEDIA_FETCH_FAILED_MESSAGE = 'the media request failed'

/** Injectable seams; production uses the globals. */
export interface MediaFetchOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxBytes?: number
}

/**
 * Whether a hostname names the machine itself or its local network.
 *
 * Literal-only: a public name that *resolves* to a private address (DNS rebinding)
 * still gets through, because resolving it here would duplicate the resolver and
 * race it. The redirect check below closes the realistic path to that, and the
 * residual gap is recorded in the task report.
 */
export function isLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (host === '') return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local')) return true

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4 !== null) {
    const a = Number(ipv4[1])
    const b = Number(ipv4[2])
    return a === 0 // "this network", includes 0.0.0.0
      || a === 10
      || a === 127
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254) // link-local, includes the cloud metadata address
  }

  if (host.includes(':')) {
    // Anything `::`-prefixed is unspecified, loopback, or IPv4-mapped.
    if (host.startsWith('::')) return true
    const first = Number.parseInt(host.split(':')[0] ?? '', 16)
    if (!Number.isFinite(first)) return false
    if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
    if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
    return false
  }

  return false
}

/** Whether a lit media address is one the host is willing to dial. */
export function isFetchableMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return !isLocalHostname(parsed.hostname)
  } catch {
    return false
  }
}

type CappedBody =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: 'too-large' | 'unbounded' }

/**
 * Read a response body, refusing to exceed `maxBytes`.
 *
 * @returns the bytes, or why they were refused.
 */
async function readCapped(response: Response, maxBytes: number): Promise<CappedBody> {
  // An empty header means "not declared" — `Number('')` is 0, which would
  // otherwise read as a declared zero-length body.
  const raw = response.headers?.get?.('content-length') ?? ''
  const declared = raw.trim() === '' ? Number.NaN : Number(raw)
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: 'too-large' }

  const body = response.body
  if (body === null || body === undefined) {
    // No stream to count against, so the declared length is the only bound
    // available; without one, reading the body whole would be the single
    // unbounded path left in this module.
    if (!Number.isFinite(declared)) return { ok: false, reason: 'unbounded' }
    const whole = new Uint8Array(await response.arrayBuffer())
    return whole.byteLength > maxBytes ? { ok: false, reason: 'too-large' } : { ok: true, bytes: whole }
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
      return { ok: false, reason: 'too-large' }
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  return { ok: true, bytes }
}

/** Whether a status is a redirect whose `location` we have to inspect ourselves. */
function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
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
    return { status: 'bad-request', message: MEDIA_FETCH_BAD_REQUEST_MESSAGE }
  }
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? MEDIA_FETCH_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? MEDIA_FETCH_MAX_BYTES

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let target = url
    for (let hop = 0; hop <= MEDIA_FETCH_MAX_REDIRECTS; hop += 1) {
      const response = await fetchImpl(target, { signal: controller.signal, redirect: 'manual' })

      // A `fetch` that ignored `redirect: 'manual'` would have dialed the final
      // address already; refusing to hand back its bytes is the least we can do.
      const settled = typeof response.url === 'string' ? response.url : ''
      if (settled !== '' && !isFetchableMediaUrl(settled)) {
        return { status: 'bad-request', message: MEDIA_FETCH_BAD_REQUEST_MESSAGE }
      }

      if (isRedirect(response.status)) {
        const location = response.headers?.get?.('location') ?? ''
        if (location === '') {
          return { status: 'bad-request', message: MEDIA_FETCH_BAD_REQUEST_MESSAGE }
        }
        let next: string
        try {
          next = new URL(location, target).href
        } catch {
          return { status: 'bad-request', message: MEDIA_FETCH_BAD_REQUEST_MESSAGE }
        }
        // Validated BEFORE the next dial: a public URL must not be able to bounce
        // the host into a private one.
        if (!isFetchableMediaUrl(next)) {
          return { status: 'bad-request', message: MEDIA_FETCH_BAD_REQUEST_MESSAGE }
        }
        target = next
        continue
      }

      if (!response.ok) return { status: 'http-error', statusCode: response.status }

      const body = await readCapped(response, maxBytes)
      if (!body.ok) {
        return body.reason === 'too-large'
          ? { status: 'too-large', limit: maxBytes }
          : { status: 'failed', message: MEDIA_FETCH_FAILED_MESSAGE }
      }
      return {
        status: 'ok',
        contentType: response.headers?.get?.('content-type') ?? '',
        byteLength: body.bytes.byteLength,
        data: Buffer.from(body.bytes).toString('base64'),
      }
    }
    // Every hop was a redirect: the chain never reached a body.
    return { status: 'bad-request', message: MEDIA_FETCH_BAD_REQUEST_MESSAGE }
  } catch (error: unknown) {
    if (controller.signal.aborted) return { status: 'timeout', timeoutMs }
    // The cause stays host-side: it can name internal hosts, and the panel writes
    // its own localized copy from the outcome status rather than showing this.
    console.warn('[omnimux-browser] media fetch failed', error)
    return { status: 'failed', message: MEDIA_FETCH_FAILED_MESSAGE }
  } finally {
    clearTimeout(timer)
  }
}
