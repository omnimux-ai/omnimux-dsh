/**
 * 页面内作品直传：把 content script 提取到的作品装配成 host `/local/capture` 的请求体。
 *
 * 采集不再依赖云端 social-data：扩展在页面里拿到元数据与媒体直链，host 只负责
 * 下载落盘。这里保持纯函数（无 chrome、无 DOM），后台路由与单测共用同一份装配规则。
 *
 * 安全边界：请求头只允许 `referer` / `user-agent` / `cookie`（防盗链所需），值去除
 * CRLF 并截断；媒体地址只接受 http(s)。host 会再次做同样的白名单校验，这里只是
 * 不把明显越界的数据送出去。
 *
 * @module
 */

import type { CapturedPost } from '../content/capture/types.ts'

/** host 的作品直传路由。 */
export const INSPIRATION_CAPTURE_PATH = '/omnimux/inspiration/local/capture'

/** 单次直传的媒体上限，与 host 的校验保持一致。 */
export const CAPTURE_MEDIA_LIMIT = 20

/** 防盗链只需要的三个请求头。 */
const CAPTURE_HEADER_KEYS = ['referer', 'user-agent', 'cookie'] as const

/** host 已存在该作品时返回的标记。 */
export interface CaptureSaveOutcome {
  existing: boolean
}

/** 一条直传媒体。 */
export interface CaptureMediaBody {
  type: 'video' | 'image'
  url: string
  headers?: Record<string, string>
}

/** `/local/capture` 的请求体。 */
export interface CaptureRequestBody {
  platform: string
  source_url: string
  title: string
  content: string
  content_shape: string
  author: Record<string, unknown>
  media: CaptureMediaBody[]
  cover_url?: string
  stats?: Record<string, unknown>
  posted_at?: string
  tags: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function httpUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : ''
}

/**
 * 读取 content script 的 `CAPTURE_POST` 响应。
 *
 * 结构不合法（缺 source_url、media 不是数组）时返回 `null`，保存流程回退旧的
 * 导入链路——提取失败不是保存失败。
 */
export function readCapturedPost(value: unknown): CapturedPost | null {
  if (!isRecord(value)) return null
  const sourceUrl = httpUrl(value.source_url)
  if (sourceUrl === '') return null
  if (!Array.isArray(value.media)) return null
  return value as unknown as CapturedPost
}

/**
 * 清洗一个请求头的值：去掉 CRLF（header 注入）并截断到 4096。
 * 空值返回空串，调用方据此不携带该 header。
 */
export function sanitizeCaptureHeaderValue(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 4096)
}

/**
 * 组装一次下载的请求头。
 *
 * `post.cookie` 是 content script 里的 `document.cookie`（HttpOnly 不可见），
 * 没有就不带；referer / UA 用于防盗链校验。
 */
export function buildCaptureHeaders(
  pageUrl: string,
  userAgent: string,
  cookie?: string,
): Record<string, string> {
  const headers: Record<string, string> = {}
  const referer = sanitizeCaptureHeaderValue(pageUrl)
  const agent = sanitizeCaptureHeaderValue(userAgent)
  const jar = sanitizeCaptureHeaderValue(cookie)
  if (referer !== '') headers.referer = referer
  if (agent !== '') headers['user-agent'] = agent
  if (jar !== '') headers.cookie = jar
  return headers
}

/**
 * 把 `CapturedPost` 装配成 host 请求体。
 *
 * 没有可用媒体时返回 `null`：只有标题和直链的作品交给旧的导入链路，避免在库里
 * 制造一条没有素材的记录。媒体按上限截断（多余的不丢弃错误，只是不入库）。
 */
export function buildCaptureRequestBody(
  post: CapturedPost | null | undefined,
  pageUrl: string,
  userAgent: string,
): CaptureRequestBody | null {
  if (post === null || post === undefined) return null
  const sourceUrl = httpUrl(post.source_url) || httpUrl(pageUrl)
  if (sourceUrl === '') return null
  const headers = buildCaptureHeaders(post.source_url || pageUrl, userAgent, post.cookie)
  const media: CaptureMediaBody[] = []
  for (const entry of Array.isArray(post.media) ? post.media : []) {
    if (entry === null || typeof entry !== 'object') continue
    const url = httpUrl((entry as { url?: unknown }).url)
    if (url === '') continue
    const type = (entry as { type?: unknown }).type === 'video' ? 'video' : 'image'
    media.push({ type, url, headers: { ...headers } })
    if (media.length >= CAPTURE_MEDIA_LIMIT) break
  }
  if (media.length === 0) return null
  const title = (typeof post.title === 'string' && post.title.trim() !== '')
    ? post.title.trim().slice(0, 120)
    : sourceUrl.slice(0, 120)
  const content = typeof post.content === 'string' ? post.content.slice(0, 2000) : ''
  const coverUrl = httpUrl(post.cover_url)
  const platform = String(post.platform ?? '').trim() || 'web'
  const tags = ['灵感采集', platform]
  return {
    platform,
    source_url: sourceUrl,
    title,
    content,
    content_shape: typeof post.content_shape === 'string' ? post.content_shape : 'video',
    author: isRecord(post.author) ? post.author : {},
    media,
    ...(coverUrl !== '' ? { cover_url: coverUrl } : {}),
    ...(isRecord(post.stats) ? { stats: post.stats } : {}),
    ...(typeof post.posted_at === 'string' && post.posted_at !== '' ? { posted_at: post.posted_at } : {}),
    tags,
  }
}

/**
 * 读取 host 的直传响应。
 *
 * 2xx 即成功；`existing` 来自顶层去重标记，用于 toast 说明「已存在」。
 */
export function readCaptureSaveOutcome(body: unknown): CaptureSaveOutcome {
  if (!isRecord(body)) return { existing: false }
  return { existing: body.existing === true || body.is_duplicate === true }
}

/** 允许的请求头键，导出给测试断言白名单没有漂移。 */
export const CAPTURE_ALLOWED_HEADERS = CAPTURE_HEADER_KEYS
