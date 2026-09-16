/**
 * Publish an inspiration to the OmniMux cloud and hand back the server-owned
 * link. Two sources, one publish route:
 *
 * - `publishLocal` — assets on this machine: upload them, then publish.
 * - `publishRemote` — an entry that already lives in the cloud: probe its own
 *   media addresses and publish them as they are, with no upload at all.
 *
 * This is the hub's `inspirationShare` capability. The domain plugin owns the
 * local library and the HTTP surface the page talks to; it never sees the
 * gateway key, the upload route, the cloud media addresses, or the publish
 * payload shape — it hands over file paths (or the addresses the page read off
 * a cloud row) plus metadata, and receives the published link.
 *
 * Every call here is a site route behind `TokenOrUserAuth`, so each one carries
 * the gateway key (`sk-`); the session token other official calls use answers
 * 401 there. The upload reuses the hub's existing gateway uploader (media inputs
 * already host local files through it).
 *
 * @typedef {{ path: string, fileName?: string, mimeType?: string }} ShareAsset
 * @typedef {{ category?: string, title?: string, description?: string, prompt?: string, model?: string, mediaType?: string }} ShareMeta
 */

import { stat as statFileOnDisk } from 'node:fs/promises'
import { extname } from 'node:path'
import { OmnimuxError } from '../media/errors.js'
import { uploadMediaToGateway } from '../media/gateway-upload.js'
import { postInspirationShare, publishInspirationShare, toShareResult } from './inspiration.js'

/** Upstream refuses a single file above this size; checked here so the answer is a readable reason. */
export const SHARE_UPLOAD_MAX_BYTES = 100 * 1024 * 1024

/**
 * Stages a publish actually walks, in order. They are reported through
 * `onStage` as the work happens, so a caller can render real progress.
 */
export const SHARE_STAGES = Object.freeze({
  PREPARING: 'preparing',
  GENERATING_PROMPT: 'generating_prompt',
  UPLOADING: 'uploading',
  PUBLISHING: 'publishing',
})

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'])

/** Gateway key missing: name the fix instead of the internal variable. */
export const SHARE_NEEDS_KEY_MESSAGE =
  '未配置 OmniMux 网关密钥（sk-）：请在凭据中配置 OMNIMUX_API_KEY 后再分享'

/**
 * `media_type` is a two-value contract upstream (`video` | `image`, default
 * `video`) and never a MIME type, so a hint is honoured only when it is already
 * one of the two; otherwise the media file decides.
 * @param {unknown} hint
 * @param {ShareAsset | null} media
 * @returns {'video' | 'image'}
 */
export function shareMediaType(hint, media) {
  const cleaned = String(hint ?? '').trim().toLowerCase()
  if (cleaned === 'video' || cleaned === 'image') return cleaned
  if (media?.path && VIDEO_EXTENSIONS.has(extname(media.path).toLowerCase())) return 'video'
  return 'image'
}

/**
 * The credential error the gateway uploader raises is a bare Chinese sentence
 * with the wrong cause; every other failure is passed through with its upstream
 * message intact.
 * @param {unknown} error
 */
export function readableShareError(error) {
  if (error instanceof OmnimuxError && (error.code === 'omnimux-unconfigured' || error.code === 'needs-omnimux')) {
    return new OmnimuxError('omnimux-unconfigured', SHARE_NEEDS_KEY_MESSAGE, { status: 401 })
  }
  return error
}

/**
 * @param {() => void} fn
 */
function safeReport(fn) {
  try {
    fn()
  } catch {
    // A progress listener must never break the publish it observes.
  }
}

/**
 * Media address prefix the cloud's public catalogue serves, both for a cover
 * (`…/press/…`) and for the publication itself (`…/r2/publications/…`).
 */
export const CLOUD_MEDIA_PATH_PREFIX = '/api/inspiration/v1/public/media/'

/**
 * Absolute cloud address for a media path a cloud row carries, or `''` when the
 * value is not an OmniMux cloud media address.
 *
 * Cloud rows publish **relative** paths (`/api/inspiration/v1/public/media/…`),
 * and the publish route wants an absolute URL, so the site base is applied here
 * — in the hub, which is the only layer that knows the cloud's address shape.
 *
 * The prefix check is also the guard that keeps a requesting page from handing
 * an arbitrary third-party URL to the publish route: only this one path, on this
 * one site, is accepted. A page that posts `https://attacker.example/x.mp4` gets
 * nothing published under the user's account.
 * @param {unknown} raw
 * @param {string} siteBaseUrl
 * @returns {string}
 */
export function resolveCloudMediaUrl(raw, siteBaseUrl) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return ''
  const base = String(siteBaseUrl || '').replace(/\/+$/, '')
  if (value.startsWith('/')) {
    if (!value.startsWith(CLOUD_MEDIA_PATH_PREFIX)) return ''
    return base ? `${base}${value}` : ''
  }
  /** @type {URL} */
  let parsed
  /** @type {URL | null} */
  let baseUrl = null
  try {
    parsed = new URL(value)
    baseUrl = base ? new URL(base) : null
  } catch {
    return ''
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return ''
  if (!parsed.pathname.startsWith(CLOUD_MEDIA_PATH_PREFIX)) return ''
  if (baseUrl && siteHost(parsed.hostname) !== siteHost(baseUrl.hostname)) return ''
  return parsed.toString()
}

/** `www.` and the bare domain are the same site; anything else is not. */
function siteHost(hostname) {
  return String(hostname || '').toLowerCase().replace(/^www\./, '')
}

/**
 * Whether the cloud serves this media address right now.
 *
 * The public media endpoint answers **404 to HEAD**, so a readability probe must
 * be a GET; it is sent with a one-byte range so the answer is a header, not the
 * file, and the body is cancelled at once so a server that ignores the range
 * still cannot make this read a whole video.
 *
 * Only 200/206 count as readable: a 403/404/410 from the upstream storage is the
 * defect this probe exists to surface, and any thrown error (DNS, TLS, timeout)
 * is the same verdict from the caller's point of view.
 * @param {string} url
 * @param {{ fetcher?: typeof fetch, range?: string }} [options]
 * @returns {Promise<boolean>}
 */
export async function probeMediaReadable(url, options = {}) {
  const fetcher = options.fetcher ?? globalThis.fetch
  if (typeof fetcher !== 'function' || !url) return false
  try {
    const response = await fetcher(url, {
      method: 'GET',
      headers: { Range: options.range ?? 'bytes=0-0' },
    })
    try {
      await response?.body?.cancel?.()
    } catch {
      // A body that cannot be cancelled is not a reason to call the media dead.
    }
    return response?.status === 200 || response?.status === 206
  } catch {
    return false
  }
}

/**
 * The readable reason for cloud media nothing can open.
 * @param {boolean} hasCover
 * @param {boolean} hasMedia
 */
function cloudMediaUnreachableMessage(hasCover, hasMedia) {
  const which = hasCover && hasMedia ? '封面与视频素材' : hasMedia ? '视频素材' : '封面'
  return `该云端灵感的${which}当前都不可访问（上游存储问题），无法生成分享链接`
}

/**
 * @param {{
 *   client: { withSkSite: Function },
 *   siteBaseUrl: string,
 *   resolveApiKey: () => Promise<string | undefined> | string | undefined,
 *   uploadMedia?: (source: string, options: { baseUrl: string, apiKey: string }) => Promise<string>,
 *   statFile?: (path: string) => Promise<{ size: number }>,
 *   probeMedia?: (url: string) => Promise<boolean>,
 *   fetcher?: typeof fetch,
 * }} deps
 */
export function createInspirationShareApi(deps) {
  const uploadMedia = deps.uploadMedia ?? uploadMediaToGateway
  const statFile = deps.statFile ?? ((path) => statFileOnDisk(path))
  const probeMedia = deps.probeMedia ?? ((url) => probeMediaReadable(url, { fetcher: deps.fetcher }))
  // `<site>/api` + the uploader's `/v1/files/upload/stream` suffix is the site
  // upload route; the API-base form of the same route is a different hostname.
  const uploadBaseUrl = `${String(deps.siteBaseUrl || '').replace(/\/+$/, '')}/api`

  /**
   * Upload one asset and return its public URL.
   * @param {ShareAsset} asset
   * @param {string} apiKey
   */
  async function uploadAsset(asset, apiKey) {
    const path = String(asset.path || '')
    const fileName = String(asset.fileName || path.split('/').pop() || path)
    let size = 0
    try {
      size = Number((await statFile(path))?.size) || 0
    } catch {
      throw new OmnimuxError('omnimux-share-asset-missing', `素材文件不存在或不可读：${path}`)
    }
    if (size > SHARE_UPLOAD_MAX_BYTES) {
      const mb = (size / 1024 / 1024).toFixed(1)
      throw new OmnimuxError(
        'omnimux-share-asset-too-large',
        `素材超过 100MB 上限（${fileName}：${mb}MB），请压缩后重试`,
      )
    }
    const fileUrl = await uploadMedia(path, { baseUrl: uploadBaseUrl, apiKey })
    if (!fileUrl || !/^https?:\/\//i.test(String(fileUrl))) {
      throw new OmnimuxError('omnimux-share-upload-failed', `素材上传未返回公网地址：${fileName}`)
    }
    return String(fileUrl)
  }

  return {
    /**
     * Upload the cover, then the media, then publish.
     *
     * An asset the caller did not provide is skipped, so cover-only and
     * media-only items both publish.
     * @param {{
     *   media?: ShareAsset | null,
     *   cover?: ShareAsset | null,
     *   meta?: ShareMeta,
     *   onStage?: (stage: string) => void,
     * }} [args]
     */
    async publishLocal(args = {}) {
      const cover = args.cover && args.cover.path ? args.cover : null
      const media = args.media && args.media.path ? args.media : null
      if (!cover && !media) {
        throw new OmnimuxError('omnimux-share-no-asset', '本地没有任何可上传的素材（视频或封面），无法发布分享')
      }
      const meta = args.meta || {}
      const title = String(meta.title || '').trim()
      if (!title) throw new OmnimuxError('omnimux-share-no-title', '分享标题不能为空，请先补全灵感标题')
      const prompt = String(meta.prompt || '').trim()
      if (!prompt) {
        throw new OmnimuxError('omnimux-share-no-prompt', '分享提示词不能为空，请先补全灵感内容或完成 AI 解构')
      }

      let apiKey = ''
      try {
        apiKey = String((await deps.resolveApiKey()) || '').trim()
      } catch {
        apiKey = ''
      }
      // Resolved once for both calls: a key that appears mid-publish must not
      // leave an uploaded asset with no share attached to it.
      if (!apiKey) throw new OmnimuxError('omnimux-unconfigured', SHARE_NEEDS_KEY_MESSAGE, { status: 401 })

      try {
        safeReport(() => args.onStage?.(SHARE_STAGES.UPLOADING))
        // Cover first: a publish that fails on the video still leaves the cover
        // the page renders from the returned URL.
        const coverUrl = cover ? await uploadAsset(cover, apiKey) : ''
        const mediaUrl = media ? await uploadAsset(media, apiKey) : ''

        safeReport(() => args.onStage?.(SHARE_STAGES.PUBLISHING))
        const published = toShareResult(await publishInspirationShare(deps.client, {
          category: String(meta.category || '').trim() || 'other',
          title,
          description: meta.description || '',
          prompt,
          model: meta.model || '',
          mediaType: shareMediaType(meta.mediaType, media),
          mediaUrl,
          coverUrl,
          expire: args.expire,
        }))
        if (!published.shareId || !published.shareUrl) {
          throw new OmnimuxError('omnimux-share-publish-failed', '云端未返回分享链接，请稍后重试')
        }
        return published
      } catch (error) {
        throw readableShareError(error)
      }
    },

    /**
     * Publish a cloud inspiration by id via the unified entry (`POST /api/inspiration/v1/share`).
     *
     * Zero uploads: the gateway fetches the row from the inspiration library
     * and publishes it directly. Permanent for all authenticated users.
     * @param {{
     *   id: string | number,
     *   expire?: string,
     *   onStage?: (stage: string) => void,
     * }} args
     */
    async publishCloud(args = {}) {
      const id = String(args.id || '').trim()
      if (!id) throw new OmnimuxError('omnimux-share-no-id', '缺少灵感编号，无法生成分享链接')
      let apiKey = ''
      try {
        apiKey = String((await deps.resolveApiKey()) || '').trim()
      } catch {
        apiKey = ''
      }
      if (!apiKey) throw new OmnimuxError('omnimux-unconfigured', SHARE_NEEDS_KEY_MESSAGE, { status: 401 })

      try {
        safeReport(() => args.onStage?.(SHARE_STAGES.PUBLISHING))
        const published = toShareResult(await postInspirationShare(deps.client, {
          source: 'cloud',
          id,
          expire: args.expire,
        }))
        if (!published.shareId || !published.shareUrl) {
          throw new OmnimuxError('omnimux-share-publish-failed', '云端未返回分享链接，请稍后重试')
        }
        return published
      } catch (error) {
        throw readableShareError(error)
      }
    },

    /**
     * Publish an entry that already lives in the cloud, from the addresses the
     * cloud already serves for it.
     *
     * Nothing is uploaded: pulling a cloud entry's media down and pushing the
     * same bytes back up would double the transfer and delay the link for no
     * gain. What the cloud needs is an address, and it already has one.
     *
     * Readability is probed before publishing, and the two assets are not equal:
     * a cover the cloud cannot serve means there is nothing to show, so the
     * publish is refused; a video or image the cloud cannot serve (upstream
     * defect laozhong86/OmniMux#257) must NOT sink a share that can still carry
     * the cover and the copy — instead the unreadable address is left out of the
     * payload entirely and reported on the result, so the caller can say which
     * part is missing rather than hand out a link whose player cannot open.
     * @param {{
     *   id?: string | number,
     *   coverUrl?: string, mediaUrl?: string, meta?: ShareMeta,
     *   onStage?: (stage: string) => void,
     * }} [args]
     */
    async publishRemote(args = {}) {
      const meta = args.meta || {}
      const title = String(meta.title || '').trim()
      if (!title) throw new OmnimuxError('omnimux-share-no-title', '分享标题不能为空，请先补全灵感标题')
      const prompt = String(meta.prompt || '').trim()
      if (!prompt) throw new OmnimuxError('omnimux-share-no-prompt', '分享提示词不能为空，请先补全灵感内容')

      const coverUrl = resolveCloudMediaUrl(args.coverUrl, deps.siteBaseUrl)
      const mediaUrl = resolveCloudMediaUrl(args.mediaUrl, deps.siteBaseUrl)
      if (!coverUrl && !mediaUrl) {
        throw new OmnimuxError(
          'omnimux-share-no-cloud-asset',
          '该云端灵感没有可用的云端素材地址（封面与视频均为空），无法生成分享链接',
        )
      }

      let apiKey = ''
      try {
        apiKey = String((await deps.resolveApiKey()) || '').trim()
      } catch {
        apiKey = ''
      }
      if (!apiKey) throw new OmnimuxError('omnimux-unconfigured', SHARE_NEEDS_KEY_MESSAGE, { status: 401 })

      try {
        const [coverReadable, mediaReadable] = await Promise.all([
          coverUrl ? probeMedia(coverUrl) : Promise.resolve(false),
          mediaUrl ? probeMedia(mediaUrl) : Promise.resolve(false),
        ])
        if (!coverReadable && !mediaReadable) {
          throw new OmnimuxError(
            'omnimux-share-cloud-media-unreachable',
            cloudMediaUnreachableMessage(Boolean(coverUrl), Boolean(mediaUrl)),
          )
        }

        safeReport(() => args.onStage?.(SHARE_STAGES.PUBLISHING))
        const mediaType = shareMediaType(meta.mediaType, { path: mediaUrl })
        const published = toShareResult(await publishInspirationShare(deps.client, {
          category: String(meta.category || '').trim() || 'other',
          title,
          description: meta.description || '',
          prompt,
          model: meta.model || '',
          mediaType,
          mediaUrl: mediaReadable ? mediaUrl : '',
          coverUrl: coverReadable ? coverUrl : '',
        }))
        if (!published.shareId || !published.shareUrl) {
          throw new OmnimuxError('omnimux-share-publish-failed', '云端未返回分享链接，请稍后重试')
        }
        return {
          ...published,
          mediaType,
          coverAttached: coverReadable ? coverUrl : '',
          mediaAttached: mediaReadable ? mediaUrl : '',
          // Which asset the share had to leave out, so the caller can say so.
          mediaSkipped: Boolean(mediaUrl) && !mediaReadable ? mediaType : '',
        }
      } catch (error) {
        throw readableShareError(error)
      }
    },
  }
}
