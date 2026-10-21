/**
 * Capture dispatcher: pick a platform extractor from the page address.
 *
 * The background asks for a capture with one message; this module owns the
 * "which extractor, and what if it finds nothing" decision. Every dedicated
 * extractor keeps its own structured source (inline JSON, hydrated state); when
 * it answers `null` the generic reader gets one chance on the same document, so
 * a page-structure change degrades to title/cover/media instead of failing.
 *
 * No extractor fetches anything: a capture is a pure read of the page the user
 * already has open.
 *
 * @module
 */

import { extractDouyin } from './douyin.ts'
import { extractGeneric } from './generic.ts'
import { extractInstagram } from './instagram.ts'
import { extractTiktok } from './tiktok.ts'
import { extractXPost } from './x.ts'
import { extractXiaohongshu } from './xiaohongshu.ts'
import { extractYoutube } from './youtube.ts'
import type { CapturedPost, CapturePlatform } from './types.ts'
import { titleFromText } from './helpers.ts'

export type {
  CapturedAuthor,
  CapturedMedia,
  CapturedPost,
  CapturedStats,
  CapturePlatform,
  ContentShape,
} from './types.ts'
export { MAX_CAPTURE_MEDIA } from './types.ts'
export type {
  AccountCaptureResult,
  CapturedAccount,
  CapturedAccountPost,
} from './account.ts'
export { captureAccount, mergeAccountSnapshots } from './account.ts'
export { extractGeneric } from './generic.ts'
export { extractXPost } from './x.ts'
export { extractYoutube } from './youtube.ts'
export { extractTiktok } from './tiktok.ts'
export { extractInstagram } from './instagram.ts'
export { extractDouyin } from './douyin.ts'
export { extractXiaohongshu } from './xiaohongshu.ts'

/** One platform's host suffixes and its extractor. */
interface HostRule {
  readonly platform: CapturePlatform
  readonly hosts: readonly string[]
  readonly extract: (doc: Document, href: string) => CapturedPost | null
}

/**
 * Host table, matched on a dot boundary (`x.com` matches `www.x.com` but never
 * `notx.com`). A new platform is a new row here plus its module.
 */
const HOST_RULES: readonly HostRule[] = [
  { platform: 'x', hosts: ['x.com', 'twitter.com'], extract: extractXPost },
  { platform: 'tiktok', hosts: ['tiktok.com'], extract: extractTiktok },
  { platform: 'youtube', hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'], extract: extractYoutube },
  { platform: 'instagram', hosts: ['instagram.com'], extract: extractInstagram },
  { platform: 'douyin', hosts: ['douyin.com', 'iesdouyin.com'], extract: extractDouyin },
  { platform: 'xiaohongshu', hosts: ['xiaohongshu.com', 'xhslink.com'], extract: extractXiaohongshu },
]

/** Rule whose host suffix matches `hostname`, if any. */
function ruleFor(hostname: string): HostRule | null {
  for (const rule of HOST_RULES) {
    for (const host of rule.hosts) {
      if (hostname === host || hostname.endsWith(`.${host}`)) return rule
    }
  }
  return null
}

/** Lower-cased host of a page address, `''` when it is not a parseable URL. */
function hostnameOf(href: string): string {
  try {
    const hostname = new URL(href).hostname.toLowerCase()
    return hostname.endsWith('.') ? hostname.slice(0, -1) : hostname
  } catch {
    return ''
  }
}

/** `document.cookie`, or `''` where the document exposes none. */
function cookieOf(doc: Document): string {
  try {
    return typeof doc.cookie === 'string' ? doc.cookie : ''
  } catch {
    return ''
  }
}

/**
 * Captures the work shown by `doc`.
 *
 * @param doc the page document; defaults to the current page
 * @param loc the page address; defaults to the current location
 * @returns the capture, or `null` when the page shows no capturable work
 */
export function capturePost(
  doc: Document = document,
  loc: { href: string } = window.location,
): CapturedPost | null {
  const href = (loc?.href || doc?.location?.href || '').trim()
  if (href === '') return null
  const rule = ruleFor(hostnameOf(href))
  const platform: CapturePlatform = rule?.platform ?? 'web'
  let extracted: CapturedPost | null = null
  if (rule !== null) {
    try {
      extracted = rule.extract(doc, href)
    } catch {
      // 页面结构变化时专用提取器失败，继续走通用兜底。
      extracted = null
    }
  }
  let post = extracted
  if (post === null) {
    try {
      post = extractGeneric(doc, href, platform)
    } catch {
      post = null
    }
  }
  if (post === null) return null
  const title = post.title.trim() !== '' ? post.title.trim() : titleFromText(post.content)
  if (title === '') return null
  return { ...post, title, cookie: cookieOf(doc) }
}
