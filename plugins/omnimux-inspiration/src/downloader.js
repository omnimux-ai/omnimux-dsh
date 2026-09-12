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
 * Fetch a URL, validating the target and every redirect hop before it is
 * contacted. `redirect: 'manual'` keeps the runtime from following a hop into a
 * private address that the first check would have refused.
 * @param {typeof fetch} fetcher
 * @param {string} url
 * @param {AbortSignal} signal
 * @returns {Promise<{ response: Response, url: string }>}
 */
async function fetchValidated(fetcher, url, signal) {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertDownloadableUrl(current)
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

async function writeBody(response, tempPath, maxBytes, url) {
  const declared = Number(response.headers?.get?.('content-length') || 0)
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`媒体文件超过大小上限 ${formatMegabytes(maxBytes)}，已中止下载 (${url})`)
  }
  if (response.body && typeof response.body.getReader === 'function') {
    const nodeStream = Readable.fromWeb(/** @type {any} */ (response.body))
    await pipeline(nodeStream, createByteLimiter(maxBytes, url), createWriteStream(tempPath))
    return
  }
  if (typeof response.arrayBuffer === 'function') {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > maxBytes) {
      throw new Error(`媒体文件超过大小上限 ${formatMegabytes(maxBytes)}，已中止下载 (${url})`)
    }
    writeFileSync(tempPath, buffer)
    return
  }
  throw new Error('Unsupported response body for media download')
}

/**
 * Download a remote URL into a target local destination safely.
 *
 * The target must be a public http(s) URL, every redirect hop is re-validated,
 * the transfer is bounded by a wall-clock timeout and a byte ceiling, and no
 * partial file is left behind on any failure.
 * @param {string} url
 * @param {string} destDir
 * @param {{ prefix?: string, ext?: string, fetcher?: typeof fetch, maxBytes?: number, timeoutMs?: number }} [opts]
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
    const { response, url: finalUrl } = await fetchValidated(fetcher, url, AbortSignal.timeout(timeoutMs))
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
