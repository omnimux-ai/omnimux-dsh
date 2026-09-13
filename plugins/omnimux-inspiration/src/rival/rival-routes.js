/**
 * HTTP endpoints of the rival-accounts module (E1–E15).
 *
 * Protocol adaptation only: the dispatcher reads a `{ method, url, body }`
 * request, calls the service, and answers `{ status, body }`. Keeping it this
 * thin is what lets `rival-routes.test.js` drive the whole contract without a
 * socket — the same dispatcher serves the real server and the tests.
 *
 * E15 (`GET /rival-accounts/posts`) is the one cross-account endpoint: the
 * 账号监控 tab lists works, and it asks this instead of fanning out one request
 * per monitored account.
 *
 * Prefix: `/omnimux/inspiration/local/rival-accounts`. Media files live under
 * the *existing* `/omnimux/inspiration/local/media/` route (E14), so no new
 * stream endpoint is introduced.
 */

import { existsSync, statSync } from 'node:fs'
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { RivalServiceError } from './rival-accounts-service.js'
import { RivalStoreError } from './rival-accounts-store.js'
import { RIVAL_ERROR_CODES, DEFAULT_COVER_EXT } from './constants.js'
import { downloadMedia } from '../downloader.js'

/**
 * Last path segment of this module's prefix, and the only place it is written.
 *
 * The boundary is single-sourced because the inspiration router *also* matches
 * everything under `/omnimux/inspiration/local`: `/rival-accounts/...` and
 * `/rival-accounts` are otherwise claimable by that router, which reads the
 * first segment as an item id (`parseItemId`). A deployment that assigns the
 * two prefixes from two different literals is what silently swallows the whole
 * module into the inspiration router's `not found` branch.
 */
export const RIVAL_BOUNDARY = 'rival-accounts'

export const RIVAL_PREFIX = `/omnimux/inspiration/local/${RIVAL_BOUNDARY}`

/**
 * Whether a pathname belongs to this module's prefix.
 *
 * The check is segment-exact: `/rival-accounts` and every path below it match,
 * while a look-alike such as `/rival-accounts-extra` does not. Both routers
 * need this same answer, so it lives beside the prefix rather than being
 * re-derived per call site.
 * @param {unknown} pathname
 * @returns {boolean}
 */
export function isRivalPath(pathname) {
  if (typeof pathname !== 'string') return false
  if (!pathname.startsWith(RIVAL_PREFIX)) return false
  const rest = pathname.slice(RIVAL_PREFIX.length)
  return rest === '' || rest.startsWith('/')
}

/** Codes the client maps to an actionable message. */
const CODE_MESSAGES = {
  [RIVAL_ERROR_CODES.NEEDS_OMNIMUX]: '需要登录 OmniMux 账号，请在 设置 → 个人资料 中登录',
  [RIVAL_ERROR_CODES.QUOTA_EXCEEDED]: '云端额度不足，请稍后重试或在设置中查看额度',
}

/** @param {unknown} value */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {Record<string, any>} body
 * @param {number} status
 */
function ok(body, status = 200) {
  return { status, body: { data: body } }
}

/**
 * @param {number} status
 * @param {string} code
 * @param {string} message
 * @param {{ reason?: string, detail?: unknown }} [extra]
 */
function fail(status, code, message, extra = {}) {
  return {
    status,
    body: {
      error: CODE_MESSAGES[code] || message,
      code,
      ...(extra.reason ? { reason: extra.reason } : {}),
      ...(extra.detail !== undefined ? { detail: extra.detail } : {}),
    },
  }
}

/**
 * Turn a thrown value into a failed response, preserving a known code.
 * @param {unknown} err
 */
export function toRivalFailure(err) {
  if (err instanceof RivalServiceError) return fail(err.status, err.code, err.message, { reason: err.reason, detail: err.detail })
  if (err instanceof RivalStoreError) return fail(err.status, err.code, err.message)
  const code = isPlainObject(err) && typeof err.code === 'string' ? err.code : ''
  const message = err instanceof Error ? err.message : String(err)
  const status = isPlainObject(err) && typeof err.status === 'number' ? err.status : 0
  if (code === RIVAL_ERROR_CODES.NEEDS_OMNIMUX || status === 401) {
    return fail(401, RIVAL_ERROR_CODES.NEEDS_OMNIMUX, message)
  }
  if (code === RIVAL_ERROR_CODES.QUOTA_EXCEEDED || status === 402) {
    return fail(402, RIVAL_ERROR_CODES.QUOTA_EXCEEDED, message)
  }
  if (code === RIVAL_ERROR_CODES.CLOUD_ERROR) return fail(502, code, message)
  if (code === RIVAL_ERROR_CODES.NO_CONTENT) return fail(422, code, message)
  return fail(500, code || 'internal-error', message)
}

/**
 * @param {string} pathname
 * @returns {{ kind: string, id?: string, postId?: string, action?: string } | null}
 */
export function matchRivalRoute(pathname) {
  if (!pathname.startsWith(RIVAL_PREFIX)) return null
  const rest = pathname.slice(RIVAL_PREFIX.length)
  if (rest === '' || rest === '/') return { kind: 'collection' }
  const parts = rest.replace(/^\//, '').split('/').filter(Boolean).map((part) => decodeURIComponent(part))
  if (parts.length === 1) {
    if (parts[0] === 'classify') return { kind: 'classify' }
    if (parts[0] === 'refresh-all') return { kind: 'refresh-all' }
    if (parts[0] === 'status') return { kind: 'status' }
    // The aggregate feed. This branch must stay ahead of the account fallback
    // below, or `/rival-accounts/posts` reads as「the account whose id is posts」
    // and answers 404 instead of the merged feed.
    if (parts[0] === 'posts') return { kind: 'feed' }
    return { kind: 'account', id: parts[0] }
  }
  if (parts.length === 2) {
    if (parts[1] === 'refresh') return { kind: 'account-refresh', id: parts[0] }
    if (parts[1] === 'monitor') return { kind: 'monitor', id: parts[0] }
    if (parts[1] === 'analyze') return { kind: 'analyze', id: parts[0] }
    if (parts[1] === 'posts') return { kind: 'posts', id: parts[0] }
    return null
  }
  if (parts.length === 4 && parts[1] === 'posts') {
    if (parts[3] === 'to-inspiration') return { kind: 'post-to-inspiration', id: parts[0], postId: parts[2] }
    if (parts[3] === 'media') return { kind: 'post-media', id: parts[0], postId: parts[2] }
  }
  return null
}

/**
 * @param {{
 *   service: any,
 *   paths?: any,
 *   fetcher?: typeof fetch,
 *   resolver?: Function,
 *   formatErrorMessage?: (err: unknown) => string,
 *   downloadMediaImpl?: typeof downloadMedia,
 * }} deps
 */
export function createRivalDispatcher(deps) {
  const service = deps.service
  const downloadImpl = deps.downloadMediaImpl ?? downloadMedia
  const fetcher = deps.fetcher
  const resolver = deps.resolver
  const formatErrorMessage = typeof deps.formatErrorMessage === 'function'
    ? deps.formatErrorMessage
    : (err) => (err instanceof Error ? err.message : String(err))

  /**
   * @param {{ method: string, url: string, body?: Record<string, any> }} req
   */
  async function dispatch(req) {
    const method = String(req.method || 'GET').toUpperCase()
    const url = new URL(req.url || RIVAL_PREFIX, 'http://127.0.0.1')
    const route = matchRivalRoute(url.pathname)
    const body = isPlainObject(req.body) ? req.body : {}
    if (!route) return fail(404, 'not-found', 'not found')
    try {
      return await run(route, method, url, body)
    } catch (err) {
      return toRivalFailure(err)
    }
  }

  /**
   * @param {{ kind: string, id?: string, postId?: string }} route
   * @param {string} method
   * @param {URL} url
   * @param {Record<string, any>} body
   */
  async function run(route, method, url, body) {
    switch (route.kind) {
      case 'collection':
        if (method === 'GET') {
          return ok(service.listAccounts({
            q: url.searchParams.get('q') || undefined,
            platform: url.searchParams.get('platform') || undefined,
            refresh_state: url.searchParams.get('refresh_state') || undefined,
          }))
        }
        if (method === 'POST') {
          const result = await service.importAccount({
            url: body.url,
            tags: body.tags,
            background: body.background !== false,
            force: body.force === true,
          })
          return {
            status: result.existing ? 200 : 201,
            body: {
              data: result.account,
              ...(result.existing ? { existing: true, is_duplicate: true } : {}),
              ...(result.job ? { job: result.job } : {}),
            },
          }
        }
        return fail(405, 'method-not-allowed', 'method not allowed')

      case 'classify':
        if (method !== 'POST') return fail(405, 'method-not-allowed', 'method not allowed')
        return ok(service.classifyInput(body.url))

      case 'refresh-all':
        if (method !== 'POST') return fail(405, 'method-not-allowed', 'method not allowed')
        return ok(service.refreshAll({ manual: body.manual !== false }), 202)

      case 'status':
        if (method !== 'GET') return fail(405, 'method-not-allowed', 'method not allowed')
        return ok(service.scheduler.snapshot())

      case 'account':
        if (method === 'GET') return ok(service.detail(String(route.id)))
        if (method === 'PATCH') return ok(service.patchAccount(String(route.id), body))
        if (method === 'DELETE') return ok(service.removeAccount(String(route.id)))
        return fail(405, 'method-not-allowed', 'method not allowed')

      case 'account-refresh':
        if (method !== 'POST') return fail(405, 'method-not-allowed', 'method not allowed')
        return ok(service.refreshAccount(String(route.id), { manual: body.manual !== false }), 202)

      case 'monitor':
        if (method !== 'GET') return fail(405, 'method-not-allowed', 'method not allowed')
        return ok(service.monitor(String(route.id)))

      case 'analyze':
        if (method !== 'POST') return fail(405, 'method-not-allowed', 'method not allowed')
        return ok(service.analyze(String(route.id)))

      case 'posts':
        if (method !== 'GET') return fail(405, 'method-not-allowed', 'method not allowed')
        return ok(service.listPosts(String(route.id), {
          only_potential: url.searchParams.get('only_potential'),
          limit: url.searchParams.get('limit'),
          sort: url.searchParams.get('sort'),
        }))

      case 'feed':
        if (method !== 'GET') return fail(405, 'method-not-allowed', 'method not allowed')
        return ok(service.listFeed({
          accounts: url.searchParams.get('accounts') || undefined,
          q: url.searchParams.get('q') || undefined,
          platform: url.searchParams.get('platform') || undefined,
          sort: url.searchParams.get('sort') || undefined,
          page: url.searchParams.get('page') || undefined,
          page_size: url.searchParams.get('page_size') || undefined,
        }))

      case 'post-to-inspiration':
        if (method !== 'POST') return fail(405, 'method-not-allowed', 'method not allowed')
        return ok(await service.toInspiration(String(route.id), String(route.postId), {
          tags: body.tags,
          auto_analyze: body.auto_analyze !== false,
        }), 202)

      case 'post-media':
        return downloadPostMedia(route, body)

      default:
        return fail(404, 'not-found', 'not found')
    }
  }

  /**
   * Resolve the local file of a post, downloading it when it is not on disk yet.
   *
   * Default is the cover (posters are small and every post has one); the video is
   * downloaded only when the caller asks, because a cloud video runs to tens of
   * megabytes. A post with neither a cover nor a video URL answers `no-media`
   * instead of producing an `@` reference to a file that does not exist.
   * @param {{ id?: string, postId?: string }} route
   * @param {Record<string, any>} body
   */
  async function downloadPostMedia(route, body) {
    const accountId = String(route.id)
    const postId = String(route.postId)
    const post = service.requirePost(accountId, postId)
    const wantVideo = body.kind === 'video'
    const targets = {
      cover: {
        url: typeof post.cover_url === 'string' ? post.cover_url : '',
        local: typeof post.cover_local_path === 'string' ? post.cover_local_path : '',
        http: typeof post.cover_http_url === 'string' ? post.cover_http_url : '',
      },
      video: {
        url: typeof post.video_url === 'string' ? post.video_url : '',
        local: typeof post.video_local_path === 'string' ? post.video_local_path : '',
        http: '',
      },
    }
    const chosen = wantVideo ? targets.video : targets.cover
    if (!chosen.url && !chosen.local) {
      return fail(409, RIVAL_ERROR_CODES.NO_MEDIA, '该帖无可用媒体，请改用「转成灵感」', { reason: 'no-media' })
    }
    if (chosen.local && existsSync(chosen.local)) {
      return ok(mediaResult(post, wantVideo, chosen, true))
    }
    const media = service.mediaTarget(postId, wantVideo ? 'video' : 'cover')
    const dir = wantVideo ? deps.paths.videosDir : deps.paths.coversDir
    // Same post → same file name: a second click reuses the download instead of
    // fetching it again, and the write is a temp+rename so a crash cannot leave
    // a half-written media file behind.
    const temp = await downloadImpl(chosen.url, dir, {
      prefix: `rival-${postId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12)}-`,
      ext: wantVideo ? '.mp4' : DEFAULT_COVER_EXT,
      ...(fetcher ? { fetcher } : {}),
      ...(resolver ? { resolver } : {}),
    })
    // Rename onto the post's stable file name so a retry overwrites the same
    // file instead of leaving the previous download orphaned.
    const target = adoptDownloadedFile(temp, join(dir, media.filename))
    const httpUrl = media.url
    const patch = wantVideo
      ? { video_local_path: target }
      : { cover_local_path: target, cover_http_url: httpUrl }
    const updated = service.store.updatePost(accountId, postId, patch)
    return ok(mediaResult(updated, wantVideo, { ...chosen, local: target, http: httpUrl }, false))
  }

  /**
   * @param {Record<string, any>} post
   * @param {boolean} wantVideo
   * @param {{ local: string, http: string }} media
   * @param {boolean} reused
   */
  function mediaResult(post, wantVideo, media, reused) {
    return {
      post_id: post.id,
      kind: wantVideo ? 'video' : 'cover',
      absolute_path: media.local,
      http_url: media.http,
      extension: wantVideo ? 'MP4' : 'JPG',
      ...(typeof post.duration === 'number' ? { duration: post.duration } : {}),
      reused,
    }
  }

  /**
   * Keep a deterministic file name for a post's media.
   *
   * `downloadMedia` names its output after a random id, which would leak a new
   * file onto disk on every retry. The download lands in a temp name and is
   * renamed to the post's stable name, so a repeated click has one file.
   * @param {string} tempPath
   * @param {string} finalPath
   */
  function adoptDownloadedFile(tempPath, finalPath) {
    if (tempPath === finalPath) return finalPath
    try {
      renameSync(tempPath, finalPath)
      return finalPath
    } catch {
      return tempPath
    }
  }

  return {
    dispatch,
    /**
     * Whether a pathname belongs to this dispatcher.
     *
     * Exposed so the inspiration dispatcher — which owns the parent prefix —
     * can hand the rival segment over *before* its own route table sees it,
     * without importing this module or re-deriving the boundary.
     * @param {unknown} pathname
     * @returns {boolean}
     */
    owns: isRivalPath,
    adoptDownloadedFile,
    /** @param {string} file @returns {string} */
    readMediaFile(file) {
      return readFileSync(file)
    },
    /** @param {string} file */
    mediaSize(file) {
      return existsSync(file) ? statSync(file).size : 0
    },
    /** @param {string} file */
    removeFile(file) {
      try {
        if (existsSync(file)) unlinkSync(file)
      } catch { /* best effort */ }
    },
    formatErrorMessage,
    temporaryName(file) {
      return `${file}.${randomUUID()}.tmp`
    },
    writeFile(file, data) {
      writeFileSync(file, data)
    },
  }
}
