/**
 * 小红书 capture (best-effort): `window.__INITIAL_STATE__` plus DOM fallback.
 *
 * 小红书 公网直取被风控，提取器只读登录态页面已有的内联 state 与 DOM；state 里
 * 会出现 `undefined` 字面量（不是合法 JSON），逐段解析失败即返回 `null` 交给通用
 * 兜底。真实页面字段与选择器需要登录态人工回归。
 *
 * @module
 */

import type { CapturedMedia, CapturedPost, CapturedStats } from './types.ts'
import {
  arrayOf,
  contentShapeOf,
  domImages,
  domVideos,
  findDeepObject,
  firstHttpUrl,
  firstNonEmpty,
  isoFromDate,
  linkHref,
  metaContent,
  numberField,
  parseJson,
  recordOf,
  scriptTexts,
  stringField,
  textOf,
  titleFromText,
  uniqueMedia,
  valueAfterMarker,
  videoPoster,
} from './helpers.ts'

/** Reads `window.__INITIAL_STATE__ = {...}` from the inline scripts. */
function initialState(doc: Document): unknown {
  for (const text of scriptTexts(doc)) {
    if (!text.includes('__INITIAL_STATE__')) continue
    const raw = valueAfterMarker(text, '__INITIAL_STATE__')
    if (raw === null) continue
    // state 里带着 `undefined` 字面量；替换成 null 只影响这个兜底分支。
    const parsed = parseJson(raw.replace(/\bundefined\b/g, 'null'))
    if (parsed !== null) return parsed
  }
  return null
}

/** Whether a JSON object looks like the note. */
function isNote(record: Record<string, unknown>): boolean {
  const hasText = record['title'] !== undefined || record['desc'] !== undefined
  return recordOf(record['user']) !== null
    && hasText
    && (record['imageList'] !== undefined || record['video'] !== undefined)
}

/** Image addresses from the note's `imageList` entries. */
function imageMediaOf(note: Record<string, unknown>, href: string): CapturedMedia[] {
  const media: CapturedMedia[] = []
  for (const image of arrayOf(note['imageList'])) {
    const url = firstHttpUrl(image, href)
    if (url !== null) media.push({ type: 'image', url })
  }
  return media
}

/** Video address from the note's nested stream object. */
function videoMediaOf(note: Record<string, unknown>, href: string): CapturedMedia[] {
  const video = recordOf(note['video'])
  if (video === null) return []
  const stream = findDeepObject(video, (record) => record['masterUrl'] !== undefined
    || record['master_url'] !== undefined
    || record['backupUrls'] !== undefined)
  const url = firstHttpUrl(stream?.['masterUrl'] ?? stream?.['master_url'] ?? stream?.['backupUrls'], href)
    ?? firstHttpUrl(recordOf(video['consumer'])?.['originVideoKey'], href)
  return url === null ? [] : [{ type: 'video', url }]
}

/**
 * Detail address that still opens the note.
 *
 * 小红书只在带 `xsec_token` 的地址上允许回放；host 的 canonical key 会忽略该
 * token 做去重，所以这里必须保留用户手上这一次访问的 token。
 */
function noteSourceUrl(doc: Document, href: string): string {
  if (/[?&]xsec_token=/i.test(href)) return href
  return linkHref(doc, ['link[rel="canonical"]'], href) || href
}

/** Maps the note object onto the capture contract. */
function postFromNote(doc: Document, href: string, note: Record<string, unknown>): CapturedPost | null {
  const user = recordOf(note['user'])
  const interact = recordOf(note['interactInfo']) ?? recordOf(note['interact_info'])
  const content = stringField(note, ['desc', 'description'])
  const title = firstNonEmpty(
    titleFromText(stringField(note, ['title'])),
    titleFromText(content),
    metaContent(doc, ['meta[property="og:title"]']),
    doc.title,
  )
  const media = uniqueMedia([...imageMediaOf(note, href), ...videoMediaOf(note, href)])
  if (title === '' && media.length === 0) return null
  const coverUrl = firstNonEmpty(
    media.find((entry) => entry.type === 'image')?.url ?? '',
    firstHttpUrl(recordOf(note['video'])?.['image'], href) ?? '',
    metaContent(doc, ['meta[property="og:image"]']),
  )
  const likes = numberField(interact, ['likedCount', 'liked_count'])
  const comments = numberField(interact, ['commentCount', 'comment_count'])
  const shares = numberField(interact, ['shareCount', 'share_count'])
  const collects = numberField(interact, ['collectedCount', 'collected_count'])
  const stats: CapturedStats = {
    ...(likes === undefined ? {} : { likes }),
    ...(comments === undefined ? {} : { comments }),
    ...(shares === undefined ? {} : { shares }),
    ...(collects === undefined ? {} : { collects }),
  }
  const postedAt = isoFromDate(note['time'] ?? note['createTime'] ?? note['create_time'])
  return {
    platform: 'xiaohongshu',
    source_url: noteSourceUrl(doc, href),
    title,
    content,
    content_shape: contentShapeOf(media),
    author: {
      name: stringField(user, ['nickname', 'nickName', 'name']),
      handle: stringField(user, ['userId', 'user_id', 'redId']),
    },
    media,
    ...(Object.keys(stats).length === 0 ? {} : { stats }),
    ...(postedAt === undefined ? {} : { posted_at: postedAt }),
    ...(coverUrl === '' ? {} : { cover_url: coverUrl }),
  }
}

/**
 * Captures the 小红书 note detail page.
 *
 * @param doc the page document
 * @param href the page address
 * @returns the capture, or `null` when neither state nor the DOM yields a note
 */
export function extractXiaohongshu(doc: Document, href: string): CapturedPost | null {
  const state = initialState(doc)
  if (state !== null) {
    const note = findDeepObject(state, isNote)
    if (note !== null) {
      const post = postFromNote(doc, href, note)
      if (post !== null) return post
    }
  }
  return domFallback(doc, href)
}

/** DOM fallback: detail title / body / author plus the rendered gallery and player. */
function domFallback(doc: Document, href: string): CapturedPost | null {
  const content = firstNonEmpty(
    textOf(doc.querySelector('#detail-desc, .note-desc, [class*="note-desc"], .desc')),
    metaContent(doc, ['meta[property="og:description"]', 'meta[name="description"]']),
  )
  const title = firstNonEmpty(
    titleFromText(textOf(doc.querySelector('#detail-title, .note-title, [class*="note-title"], .title'))),
    titleFromText(content),
    metaContent(doc, ['meta[property="og:title"]']),
    doc.title,
  )
  const authorName = textOf(doc.querySelector(
    '.author-wrapper .username, .author-wrapper .name, .username, [class*="author"] .name',
  ))
  const root = doc.querySelector('#noteContainer, .note-container, main, article') ?? doc.body ?? doc
  const media = uniqueMedia([
    ...domVideos(root, href),
    ...domImages(root, href, '.swiper-slide img, .img-container img, [data-xhs-img], .media-container img'),
  ])
  if (title === '' && media.length === 0) return null
  const coverUrl = firstNonEmpty(
    videoPoster(root, href),
    media.find((entry) => entry.type === 'image')?.url ?? '',
    metaContent(doc, ['meta[property="og:image"]']),
  )
  return {
    platform: 'xiaohongshu',
    source_url: noteSourceUrl(doc, href),
    title,
    content,
    content_shape: contentShapeOf(media),
    author: { name: authorName, handle: '' },
    media,
    ...(coverUrl === '' ? {} : { cover_url: coverUrl }),
  }
}
