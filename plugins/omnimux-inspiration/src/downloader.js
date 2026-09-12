import { createWriteStream, existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { assertDownloadableUrl, isRedirectStatus, resolveRedirectUrl } from './url-policy.js'

/** Hard ceiling for one media download. */
export const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024

/** Hard wall-clock budget for one media download. */
export const DOWNLOAD_TIMEOUT_MS = 60_000

/** Redirect hops followed before a download is abandoned. */
const MAX_REDIRECTS = 5

/** Bytes read from the head of a response to recognise a non-media payload. */
const MEDIA_SNIFF_BYTES = 512

/**
 * Body prefixes that mean "this is a document, not a media stream": an HTML
 * challenge page or an XML error document served with a 200. CDNs answer a
 * blocked download this way, so a status check alone is not enough.
 */
const NON_MEDIA_BODY_RE = /^\s*(?:<!doctype\s|<html[\s>]|<\?xml[\s?]|<head[\s>]|<body[\s>]|<Error[\s>]|<\?php)/i

/**
 * Detect extension from URL or mime type.
 * @param {string} url
 * @param {string} [defaultExt]
 */
export function detectExt(url, defaultExt = '.mp4') {
  try {
    const pathname = new URL(url).pathname
    const ext = extname(pathname).toLowerCase()
    if (['.mp4', '.mov', '.webm', '.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      return ext
    }
  } catch {
    // fallback
  }
  return defaultExt
}

function formatMegabytes(bytes) {
  return `${Math.round(bytes / (1024 * 1024))}MB`
}

function removeQuietly(filePath) {
  if (!existsSync(filePath)) return
  try {
    unlinkSync(filePath)
  } catch {
    // A leftover temp file must never mask the download error.
  }
}

/**
 * Whether a declared content type can only belong to a document. Only `text/html`
 * is refused: media CDNs publish `application/octet-stream`, `binary/octet-stream`
 * and occasionally a wrong or missing type, so anything that is not unambiguously
 * a web page is left to the byte sniff below.
 * @param {unknown} contentType
 * @returns {boolean}
 */
function isHtmlContentType(contentType) {
  const type = typeof contentType === 'string' ? contentType.trim().toLowerCase() : ''
  return type.startsWith('text/html') || type.startsWith('application/xhtml')
}

/**
 * Whether the URL names an HLS manifest.
 * @param {string} url
 * @returns {boolean}
 */
function isManifestUrl(url) {
  try {
    return /\.m3u8$/i.test(new URL(url).pathname)
  } catch {
    return /\.m3u8(\?|#|$)/i.test(url)
  }
}

/**
 * @param {unknown} contentType
 * @returns {boolean}
 */
function isManifestContentType(contentType) {
  const type = typeof contentType === 'string' ? contentType.trim().toLowerCase() : ''
  return type.includes('mpegurl')
}

/**
 * @param {string} url
 * @returns {Error}
 */
function manifestResponseError(url) {
  return new Error(`下载目标不是可播放的视频文件，而是 HLS/m3u8 播放列表，已中止 (${url})`)
}

/**
 * Sniff the head of a body for a document prefix.
 * @param {Buffer} buffer
 * @returns {boolean} true when the payload is a document rather than media
 */
function looksLikeDocument(buffer) {
  if (buffer.length === 0) return false
  return NON_MEDIA_BODY_RE.test(buffer.toString('latin1', 0, Math.min(buffer.length, MEDIA_SNIFF_BYTES)))
}

/**
 * @param {string} url
 * @returns {Error}
 */
function documentResponseError(url) {
  return new Error(`下载目标返回的不是媒体内容（HTML/XML 挑战页或错误页），已中止 (${url})`)
}

/**
 * Fetch a URL, validating the target and every redirect hop before it is
 * contacted. `redirect: 'manual'` keeps the runtime from following a hop into a
 * private address that the first check would have refused.
 *
 * The host check is repeated per hop rather than once up front: a redirect can
 * point at a name that was never validated, and the resolution of an already
 * checked name is not stable, so a single up-front lookup would not cover the
 * address actually contacted.
 * @param {typeof fetch} fetcher
 * @param {string} url
 * @param {AbortSignal} signal
 * @param {{ resolver?: Function }} deps resolver forwarded to the policy check
 * @returns {Promise<{ response: Response, url: string }>}
 */
async function fetchValidated(fetcher, url, signal, deps = {}) {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertDownloadableUrl(current, deps)
    const response = await fetcher(current, { redirect: 'manual', signal })
    if (!isRedirectStatus(response.status)) return { response, url: current }
    const location = resolveRedirectUrl(response.headers?.get?.('location'), current)
    if (!location) return { response, url: current }
    if (hop === MAX_REDIRECTS) {
      throw new Error(`媒体下载重定向次数超过 ${MAX_REDIRECTS} 次，已中止`)
    }
    current = location
  }
  throw new Error('媒体下载重定向异常，已中止')
}

/** Abort the response body once more than `maxBytes` have streamed through. */
function createByteLimiter(maxBytes, url) {
  let seen = 0
  return new Transform({
    transform(chunk, _encoding, callback) {
      seen += chunk.length
      if (seen > maxBytes) {
        callback(new Error(`媒体文件超过大小上限 ${formatMegabytes(maxBytes)}，已中止下载 (${url})`))
        return
      }
      callback(null, chunk)
    },
  })
}

/**
 * Reject a stream whose *first* chunk is a document prefix, before any of it
 * reaches the temp file. The sniff window is bounded by `MEDIA_SNIFF_BYTES`, so at
 * most one small chunk is held back and the byte ceiling and the timeout keep
 * working exactly as before.
 * @param {string} url
 * @returns {Transform}
 */
function createMediaSniff(url) {
  let sniffed = false
  let head = Buffer.alloc(0)
  return new Transform({
    transform(chunk, _encoding, callback) {
      if (sniffed) {
        callback(null, chunk)
        return
      }
      head = Buffer.concat([head, Buffer.from(chunk)])
      if (head.length < MEDIA_SNIFF_BYTES) {
        callback()
        return
      }
      sniffed = true
      if (looksLikeDocument(head)) {
        callback(documentResponseError(url))
        return
      }
      callback(null, head)
    },
    flush(callback) {
      if (sniffed) {
        callback()
        return
      }
      sniffed = true
      callback(looksLikeDocument(head) ? documentResponseError(url) : null, head)
    },
  })
}

/**
 * Reject an obviously non-media response before anything is written: the header
 * must not declare an HTML document or an HLS manifest, and the body must not
 * open with a document marker. A 200 that carries a challenge page would
 * otherwise be stored as a playable-looking `insp_*.mp4`.
 *
 * A manifest is refused for a different reason: it is a valid media *playlist*,
 * but saving it as a media file produces a player that can never render a frame.
 * Callers turn this into the degraded import instead of persisting it.
 * @param {Response} response
 * @param {string} url
 * @returns {void}
 */
function assertMediaResponse(response, url) {
  if (isManifestUrl(url) || isManifestContentType(response.headers?.get?.('content-type'))) {
    throw manifestResponseError(url)
  }
  if (isHtmlContentType(response.headers?.get?.('content-type'))) {
    throw new Error(`下载目标返回的不是媒体内容 (content-type: text/html)，已中止 (${url})`)
  }
}

async function writeBody(response, tempPath, maxBytes, url) {
  const declared = Number(response.headers?.get?.('content-length') || 0)
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`媒体文件超过大小上限 ${formatMegabytes(maxBytes)}，已中止下载 (${url})`)
  }
  assertMediaResponse(response, url)
  if (response.body && typeof response.body.getReader === 'function') {
    const nodeStream = Readable.fromWeb(/** @type {any} */ (response.body))
    await pipeline(
      nodeStream,
      createMediaSniff(url),
      createByteLimiter(maxBytes, url),
      createWriteStream(tempPath),
    )
    return
  }
  if (typeof response.arrayBuffer === 'function') {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > maxBytes) {
      throw new Error(`媒体文件超过大小上限 ${formatMegabytes(maxBytes)}，已中止下载 (${url})`)
    }
    if (looksLikeDocument(buffer)) throw documentResponseError(url)
    writeFileSync(tempPath, buffer)
    return
  }
  throw new Error('Unsupported response body for media download')
}

/**
 * Download a remote URL into a target local destination safely.
 *
 * The target must be a public http(s) URL whose host resolves only to public
 * addresses, every redirect hop is re-validated, the response must look like
 * media, the transfer is bounded by a wall-clock timeout and a byte ceiling, and
 * no partial file is left behind on any failure.
 * @param {string} url
 * @param {string} destDir
 * @param {{
 *   prefix?: string,
 *   ext?: string,
 *   fetcher?: typeof fetch,
 *   maxBytes?: number,
 *   timeoutMs?: number,
 *   resolver?: Function,
 * }} [opts] `resolver` overrides the DNS lookup used by the target check
 * @returns {Promise<string>} absolute path of saved file
 */
export async function downloadMedia(url, destDir, opts = {}) {
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
  const fetcher = opts.fetcher ?? fetch
  const ext = opts.ext || detectExt(url, '.mp4')
  const prefix = opts.prefix || 'insp_'
  const maxBytes = opts.maxBytes ?? MAX_DOWNLOAD_BYTES
  const timeoutMs = opts.timeoutMs ?? DOWNLOAD_TIMEOUT_MS
  const filename = `${prefix}${randomUUID().slice(0, 8)}${ext}`
  const targetPath = join(destDir, filename)
  const tempPath = `${targetPath}.${randomUUID().slice(0, 4)}.tmp`

  try {
    const deps = opts.resolver ? { resolver: opts.resolver } : {}
    const { response, url: finalUrl } = await fetchValidated(
      fetcher,
      url,
      AbortSignal.timeout(timeoutMs),
      deps,
    )
    if (!response.ok) {
      throw new Error(`Failed to download media: HTTP ${response.status} from ${finalUrl}`)
    }
    await writeBody(response, tempPath, maxBytes, finalUrl)
    renameSync(tempPath, targetPath)
    return targetPath
  } catch (err) {
    removeQuietly(tempPath)
    throw err
  }
}
