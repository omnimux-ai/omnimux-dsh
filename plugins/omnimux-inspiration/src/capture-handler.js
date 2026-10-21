/**
 * `POST /omnimux/inspiration/local/capture` — the browser extension's in-page
 * capture result, downloaded by the host itself.
 *
 * The extension reads a post on an already logged-in page and hands the host the
 * structured post plus media direct links. Some CDNs (notably douyin and
 * xiaohongshu) refuse a bare request, so the capture may carry a controlled set
 * of request headers (`referer` / `user-agent` / `cookie`) for those downloads
 * only. The headers are sanitized here, used once, and never persisted or
 * logged.
 *
 * Layer rules:
 * - the public URL rule is checked again for every URL in the body; the
 *   downloader re-checks the literal host and the resolved address per hop.
 * - acceptance and download are separated: the request answers 202 with an
 *   `importing` placeholder, and the media downloads in-process afterwards. That
 *   keeps a slow CDN (Instagram ≈119KB/s) or a large file (抖音 236MB) from
 *   hitting the extension's request timeout and falling back to the cloud path.
 * - a media item that cannot be downloaded does not fail the capture: the rest
 *   is stored and the row records the first reason with `import_status:
 *   degraded`. A capture that saved nothing settles as `failed` so the library
 *   card shows the reason and can be retried.
 * - `auto_analyze` is always false: a direct capture is not an analysis request.
 */

import { existsSync, unlinkSync } from 'node:fs'
import { alignMediaExtension, downloadMedia, isKnownUnrenderableCover } from './downloader.js'
import {
  IMPORT_STAGES,
  IMPORT_STATUS_DEGRADED,
  IMPORT_STATUS_FAILED,
  IMPORT_STATUS_IMPORTING,
  IMPORT_STATUS_READY,
  importStatusOf,
} from './import-status.js'
import { activeJobs } from './http-handlers.js'
import { detectPlatformFromUrl } from './url-normalizer.js'
import { isPublicHttpUrl } from './url-policy.js'

/** Media entries one capture may carry; matches the extension contract. */
export const CAPTURE_MEDIA_LIMIT = 20
/** Longest accepted header value; anything longer is truncated. */
export const CAPTURE_HEADER_MAX_LENGTH = 4096
/**
 * Per-file download budget for a background capture.
 *
 * Larger than the import path's 60s on purpose: the captures here are videos
 * pulled from a CDN that may throttle, and the request no longer waits on them.
 */
export const CAPTURE_DOWNLOAD_TIMEOUT_MS = 300_000

/**
 * Live background capture jobs, keyed by row id.
 *
 * The dispatcher owns them for the life of the process; the id is also added to
 * `activeJobs` so the stale sweep does not fail a row that is still downloading.
 * Exported so tests can await the real work instead of polling.
 * @type {Map<string, Promise<void>>}
 */
export const captureJobs = new Map()

/** Resolve once every capture job currently known to this process has settled. */
export function captureJobsSettled() {
  return Promise.all([...captureJobs.values()])
}

/** Request headers a capture may forward, lowercased. */
const ALLOWED_CAPTURE_HEADERS = new Set(['referer', 'user-agent', 'cookie'])
/** Shapes a captured post may declare; anything else is derived. */
const CONTENT_SHAPES = new Set(['text', 'photo', 'gallery', 'video'])
/** Number fields a captured post's `stats` may carry. */
const STAT_KEYS = ['likes', 'comments', 'views', 'shares', 'collects']
/** Host media URL prefix the library serves local files from. */
const MEDIA_URL_PREFIX = '/omnimux/inspiration/local/media'

function fail(status, error) {
  return { status, body: { error } }
}

function createAbortError(message = 'This operation was aborted', cause) {
  const err = new Error(message)
  err.name = 'AbortError'
  err.code = 'ABORT_ERR'
  if (cause) err.cause = cause
  return err
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function removeQuietly(filePath) {
  if (!filePath || !existsSync(filePath)) return
  try {
    unlinkSync(filePath)
  } catch {
    // 残留文件不能掩盖真正的下载/写库错误。
  }
}

function describeFailure(ctx, error) {
  if (typeof ctx.formatErrorMessage === 'function') return ctx.formatErrorMessage(error)
  return error?.message || String(error)
}

/**
 * Keep only the three headers a capture may forward, lowercased, with control
 * characters removed and values truncated. Anything else is dropped silently:
 * the header set is a download aid, never a way to reach an arbitrary request.
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function sanitizeCaptureHeaders(raw) {
  const headers = {}
  if (!isPlainObject(raw)) return headers
  for (const [rawName, rawValue] of Object.entries(raw)) {
    const name = String(rawName).trim().toLowerCase()
    if (!ALLOWED_CAPTURE_HEADERS.has(name)) continue
    if (typeof rawValue !== 'string') continue
    // CR/LF 会拆分 header，NUL 等控制字符一并清洗；值过长则截断。
    const value = rawValue.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, CAPTURE_HEADER_MAX_LENGTH)
    if (value) headers[name] = value
  }
  return headers
}

/**
 * @param {unknown} value
 * @returns {string} the trimmed URL when it is public http(s), otherwise ''
 */
function publicHttpUrl(value) {
  const url = typeof value === 'string' ? value.trim() : ''
  return url && isPublicHttpUrl(url) ? url : ''
}

function captureAuthor(value) {
  if (!isPlainObject(value)) return {}
  const author = {}
  if (typeof value.name === 'string') author.name = value.name.trim()
  if (typeof value.handle === 'string') author.handle = value.handle.trim()
  return author
}

function captureStats(value) {
  if (!isPlainObject(value)) return {}
  const stats = {}
  for (const key of STAT_KEYS) {
    const raw = value[key]
    if (raw === null || raw === undefined || raw === '') continue
    const numeric = Number(raw)
    if (Number.isFinite(numeric)) stats[key] = numeric
  }
  return stats
}

/**
 * Validate the request body and turn it into the internal argument shape.
 * A body error is returned, never thrown.
 * @param {Record<string, any>} body
 */
function parseCaptureBody(body) {
  if (!isPlainObject(body)) return { error: fail(400, 'capture body must be a JSON object') }

  const sourceUrl = publicHttpUrl(body.source_url)
  if (!sourceUrl) return { error: fail(400, 'source_url must be a public http(s) address') }

  if (!Array.isArray(body.media)) return { error: fail(400, 'media must be an array') }
  if (body.media.length > CAPTURE_MEDIA_LIMIT) {
    return { error: fail(400, `media must contain at most ${CAPTURE_MEDIA_LIMIT} items`) }
  }

  const media = []
  const seenUrls = new Set()
  for (const [index, rawItem] of body.media.entries()) {
    if (!isPlainObject(rawItem)) return { error: fail(400, `media[${index}] must be an object`) }
    const type = rawItem.type === 'video' || rawItem.type === 'image' ? rawItem.type : ''
    if (!type) return { error: fail(400, `media[${index}].type must be "video" or "image"`) }
    const url = publicHttpUrl(rawItem.url)
    if (!url) return { error: fail(400, `media[${index}].url must be a public http(s) address`) }
    // 同一 URL 只下载一次；保留第一次出现的类型。
    if (seenUrls.has(url)) continue
    seenUrls.add(url)
    media.push({ type, url, headers: sanitizeCaptureHeaders(rawItem.headers) })
  }

  const coverUrl = body.cover_url ? publicHttpUrl(body.cover_url) : ''
  if (body.cover_url && !coverUrl) return { error: fail(400, 'cover_url must be a public http(s) address') }
  if (media.length === 0 && !coverUrl) return { error: fail(400, 'media or cover_url is required') }

  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag) => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean)
    : []

  return {
    args: {
      sourceUrl,
      requestedPlatform: typeof body.platform === 'string' ? body.platform.trim() : '',
      title: typeof body.title === 'string' ? body.title.trim() : '',
      content: typeof body.content === 'string' ? body.content : '',
      contentShape: CONTENT_SHAPES.has(body.content_shape) ? body.content_shape : '',
      author: captureAuthor(body.author),
      stats: captureStats(body.stats),
      postedAt: typeof body.posted_at === 'string' ? body.posted_at.trim() : '',
      coverUrl,
      media,
      tags,
    },
  }
}

/**
 * A row that already holds this post in full. Mirrors the import duplicate rule:
 * stored attachments win, and a legacy image/link row is a duplicate as well.
 * @param {Record<string, any> | null | undefined} item
 * @returns {boolean}
 */
function isCaptureDuplicate(item) {
  if (!item || typeof item !== 'object') return false
  if ((item.media_items?.length || 0) > 0) return true
  return item.type !== 'video' && importStatusOf(item) === IMPORT_STATUS_READY
}

/**
 * Download every capture attachment sequentially.
 *
 * A per-item failure is collected instead of thrown: one blocked CDN must not
 * discard the rest of a multi-image post. Files already written stay tracked in
 * `localPaths` so an abort can remove them.
 * @param {{ ctx: Record<string, any>, media: Array<Record<string, any>> }} args
 * @returns {Promise<{ localPaths: Record<string, string>, mediaItems: Array<{ type: string, url: string }>, savedByUrl: Map<string, { path: string, localUrl: string }>, errors: string[] }>}
 */
async function downloadCaptureMedia(args) {
  const { ctx, media } = args
  const signal = ctx.signal
  const localPaths = {}
  const mediaItems = []
  const savedByUrl = new Map()
  const errors = []
  let videoCount = 0
  let imageCount = 0

  const cleanup = () => {
    for (const filePath of Object.values(localPaths)) removeQuietly(filePath)
  }

  for (const item of media) {
    if (signal?.aborted) {
      cleanup()
      throw createAbortError()
    }
    const isVideo = item.type === 'video'
    const number = isVideo ? ++videoCount : ++imageCount
    const key = isVideo ? (number === 1 ? 'video' : `video_${number}`) : `image_${number}`
    const folder = isVideo ? 'videos' : 'images'
    try {
      let saved = await downloadMedia(item.url, isVideo ? ctx.paths.videosDir : ctx.paths.imagesDir, {
        prefix: isVideo ? 'video_' : 'image_',
        fetcher: ctx.fetcher,
        resolver: ctx.resolver,
        signal,
        timeoutMs: CAPTURE_DOWNLOAD_TIMEOUT_MS,
        headers: Object.keys(item.headers).length > 0 ? item.headers : undefined,
      })
      if (!isVideo) {
        saved = alignMediaExtension(saved)
        if (isKnownUnrenderableCover(saved)) {
          removeQuietly(saved)
          throw new Error('该图片格式暂不支持预览')
        }
      }
      localPaths[key] = saved
      const localUrl = `${MEDIA_URL_PREFIX}/${folder}/${saved.split('/').pop()}`
      mediaItems.push({ type: item.type, url: localUrl })
      savedByUrl.set(item.url, { path: saved, localUrl })
    } catch (error) {
      if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR' || signal?.aborted) {
        cleanup()
        throw (error?.name === 'AbortError' || error?.code === 'ABORT_ERR')
          ? error
          : createAbortError('This operation was aborted', error)
      }
      errors.push(describeFailure(ctx, error))
    }
  }

  return { localPaths, mediaItems, savedByUrl, errors }
}

/**
 * Poster for a capture. An image already saved as a media item is reused; a
 * separate cover download is best-effort and never degrades the capture itself.
 * @param {{ ctx: Record<string, any>, coverUrl: string, savedByUrl: Map<string, { path: string, localUrl: string }> }} args
 * @returns {Promise<{ path: string, renderable: boolean | null }>}
 */
async function resolveCaptureCover(args) {
  const { ctx, coverUrl, savedByUrl } = args
  if (!coverUrl) return { path: '', renderable: null }
  const reused = savedByUrl.get(coverUrl)
  if (reused) return { path: reused.path, renderable: true }

  try {
    const saved = await downloadMedia(coverUrl, ctx.paths.coversDir, {
      prefix: 'cover_',
      fetcher: ctx.fetcher,
      resolver: ctx.resolver,
      signal: ctx.signal,
      timeoutMs: CAPTURE_DOWNLOAD_TIMEOUT_MS,
    })
    const aligned = alignMediaExtension(saved)
    if (isKnownUnrenderableCover(aligned)) {
      removeQuietly(aligned)
      return { path: '', renderable: false }
    }
    return { path: aligned, renderable: true }
  } catch (error) {
    if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR' || ctx.signal?.aborted) {
      throw (error?.name === 'AbortError' || error?.code === 'ABORT_ERR')
        ? error
        : createAbortError('This operation was aborted', error)
    }
    return { path: '', renderable: null }
  }
}

/**
 * Build the library row from the captured post and the files actually saved.
 * Field names follow the existing import path so every consumer (card, modal,
 * creation reference) reads a capture exactly like an import.
 * @param {{ parsed: Record<string, any>, platform: string, download: Record<string, any>, cover: { path: string, renderable: boolean | null } }} args
 */
export function buildCaptureRecord(args) {
  const { parsed, platform, download, cover } = args
  const savedVideos = download.mediaItems.filter((item) => item.type === 'video')
  const savedImages = download.mediaItems.filter((item) => item.type === 'image')
  const type = savedVideos.length > 0 ? 'video' : (savedImages.length > 0 || cover.path ? 'image' : 'link')
  const content_shape = parsed.contentShape
    || (type === 'video' ? 'video'
      : savedImages.length > 1 ? 'gallery'
        : type === 'image' ? 'photo'
          : parsed.content ? 'text' : 'link')

  const coverName = cover.path ? cover.path.split('/').pop() : ''
  const imageCover = savedImages.find((item) => coverName && item.url.endsWith(`/${coverName}`))
  // 与导入路径一致：已知不可渲染的封面不保留远端兜底，其余情况回退远端 URL。
  const cover_url = cover.renderable === false
    ? ''
    : coverName
      ? (imageCover ? imageCover.url : `${MEDIA_URL_PREFIX}/covers/${coverName}`)
      : (parsed.coverUrl || '')

  const local_paths = { ...download.localPaths }
  if (cover.path) local_paths.cover = cover.path

  return {
    title: parsed.title || parsed.sourceUrl,
    content: parsed.content,
    type,
    source_platform: platform,
    source_url: parsed.sourceUrl,
    cover_url,
    media_items: download.mediaItems,
    media_urls: savedVideos.map((item) => item.url),
    content_shape,
    local_paths,
    tags: parsed.tags,
    auto_analyze: false,
    author: parsed.author,
    stats: parsed.stats,
    posted_at: parsed.postedAt || null,
    import_status: download.errors.length > 0 ? IMPORT_STATUS_DEGRADED : IMPORT_STATUS_READY,
    import_stage: null,
    import_error: download.errors[0] || null,
  }
}

/**
 * Row written before the background download starts.
 *
 * Same fields as the import placeholder, so the library card, the stale sweep
 * and the poll endpoint treat it identically. Attachments are cleared explicitly:
 * an in-place upgrade of an old row must not keep attachments that the new
 * capture no longer references.
 * @param {Record<string, any>} args parsed capture body
 * @param {string} platform
 */
function buildCapturePlaceholder(args, platform) {
  return {
    title: args.title || args.sourceUrl,
    content: args.content,
    type: 'video',
    source_platform: platform,
    source_url: args.sourceUrl,
    cover_url: args.coverUrl || '',
    media_items: [],
    media_urls: [],
    local_paths: {},
    content_shape: args.contentShape || 'video',
    tags: args.tags,
    auto_analyze: false,
    author: args.author,
    stats: args.stats,
    posted_at: args.postedAt || null,
    analysis_results: {},
    deconstruction: null,
    import_status: IMPORT_STATUS_IMPORTING,
    import_stage: IMPORT_STAGES.DOWNLOADING,
    import_started_at: new Date().toISOString(),
    import_error: null,
  }
}

/** Fail a row without letting a vanished row mask the real download failure. */
function markCaptureFailed(store, id, reason) {
  try {
    store.update(id, {
      import_status: IMPORT_STATUS_FAILED,
      import_stage: null,
      import_error: String(reason || '媒体素材下载失败'),
    })
  } catch {
    // 行已在下载期间被删除：没有可写的目标，下载结果自然作废。
  }
}

/**
 * Background job: download the attachments, then replace the placeholder.
 *
 * Runs after the HTTP response, so it must never throw into the request. Every
 * outcome lands on the row: ready, degraded (some files) or failed (none).
 * @param {{ ctx: Record<string, any>, parsed: Record<string, any>, platform: string, id: string }} args
 */
async function runCaptureJob(args) {
  const { ctx, parsed, platform, id } = args
  let download = null
  let cover = null
  try {
    download = await downloadCaptureMedia({ ctx, media: parsed.media })
    cover = await resolveCaptureCover({ ctx, coverUrl: parsed.coverUrl, savedByUrl: download.savedByUrl })
    // 没有独立封面时，图集的第一张图就是封面（与导入路径一致）。
    if (!cover.path) {
      const firstImage = parsed.media.find((item) => item.type === 'image' && download.savedByUrl.has(item.url))
      if (firstImage) cover = { path: download.savedByUrl.get(firstImage.url).path, renderable: true }
    }
    if (download.mediaItems.length === 0 && !cover.path) {
      for (const filePath of Object.values(download.localPaths)) removeQuietly(filePath)
      markCaptureFailed(ctx.store, id, download.errors[0] || '媒体素材下载全部失败，无法入库')
      return
    }
    const record = buildCaptureRecord({ parsed, platform, download, cover })
    const saved = await ctx.store.replace(id, record)
    if (!saved) ctx.store.add(record, { allowDuplicate: true })
  } catch (error) {
    for (const filePath of Object.values(download?.localPaths || {})) removeQuietly(filePath)
    if (cover?.path) removeQuietly(cover.path)
    markCaptureFailed(ctx.store, id, describeFailure(ctx, error))
  }
}

/**
 * POST /local/capture handler.
 *
 * Acceptance is synchronous (validate → dedupe → placeholder), the download is
 * not: the caller gets the importing row immediately and polls `GET /local/:id`.
 * @param {Record<string, any>} ctx dispatcher context plus the request
 * @returns {Promise<{ status: number, body: Record<string, any> }>}
 */
export async function handleCapture(ctx) {
  const parsed = parseCaptureBody(ctx.req?.body || {})
  if (parsed.error) return parsed.error
  const args = parsed.args
  if (ctx.signal?.aborted) throw createAbortError()

  const detect = typeof ctx.detectPlatformFromUrl === 'function' ? ctx.detectPlatformFromUrl : detectPlatformFromUrl
  const detected = detect(args.sourceUrl)
  // 请求里的 platform 仅兜底展示：真正决定归类的是 source_url 的域名。
  const platform = detected && detected !== 'unknown' ? detected : (args.requestedPlatform || 'unknown')

  const existing = ctx.store.findByUrl(args.sourceUrl)
  if (existing) {
    if (isCaptureDuplicate(existing)) {
      return { status: 200, body: { data: existing, existing: true } }
    }
    // 同一作品正在下载：幂等返回同一行，不再启动第二个任务。
    if (importStatusOf(existing) === IMPORT_STATUS_IMPORTING) {
      return { status: 202, body: { data: existing, existing: true, accepted: true } }
    }
  }

  const placeholder = buildCapturePlaceholder(args, platform)
  const row = existing
    ? ctx.store.update(existing.id, placeholder)
    : ctx.store.add(placeholder, { allowDuplicate: true })
  const id = String(row.id)

  // 请求已经结束：后台任务不继承它的 abort 信号，否则响应一返回下载就被取消。
  const jobCtx = { ...ctx, signal: undefined, req: undefined }
  activeJobs.add(id)
  const job = Promise.resolve()
    .then(() => runCaptureJob({ ctx: jobCtx, parsed: args, platform, id }))
    .catch(() => {
      // runCaptureJob 自己把失败写到行上；这里只兜住意外拒绝，避免进程级未处理拒绝。
    })
    .finally(() => {
      activeJobs.delete(id)
      captureJobs.delete(id)
    })
  captureJobs.set(id, job)

  return { status: 202, body: { data: ctx.store.get(id) ?? row, accepted: true } }
}
