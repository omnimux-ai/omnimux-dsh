/**
 * 抖音 capture (best-effort): inline `_ROUTER_DATA` / `RENDER_DATA` / SSR state.
 *
 * 抖音 公网直取被风控，提取器只读登录态页面已有的内联 JSON 与 DOM；解析失败时
 * 返回 `null` 交给通用兜底，绝不构造假数据。真实页面选择器与真实字段需要登录态
 * 人工回归。
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

/** Inline assignment markers the page has shipped. */
const STATE_MARKERS = ['_ROUTER_DATA', '_SSR_HYDRATED_DATA']

/**
 * `<script type="application/json">` the MAIN-world bridge fills with the page's
 * aweme detail response / SSR state. 抖音 loads the detail via XHR, so this DOM
 * node is the only channel from the main world into this isolated extractor.
 */
const MAIN_WORLD_TAG = 'omnimux-douyin-capture'

/** Whether a JSON object looks like one 抖音 work. */
function isAweme(record: Record<string, unknown>): boolean {
  const hasId = record['aweme_id'] !== undefined || record['awemeId'] !== undefined
  return hasId && (record['desc'] !== undefined || record['video'] !== undefined || record['images'] !== undefined)
}

/** Parsed payload published by the MAIN-world bridge, when it captured one. */
function bridgedAwemes(doc: Document): unknown[] {
  const raw = doc.querySelector<HTMLScriptElement>(`script#${MAIN_WORLD_TAG}`)?.textContent ?? ''
  if (raw.trim() === '') return []
  const parsed = parseJson(raw)
  if (parsed === null) return []
  const candidates: unknown[] = [parsed]
  const record = recordOf(parsed)
  if (record !== null) {
    for (const key of ['aweme_detail', 'aweme_details']) {
      const value = record[key]
      if (value !== undefined) candidates.push(value)
    }
  }
  return candidates
}

/** Every parsed inline state candidate, best-first. */
function stateCandidates(doc: Document): unknown[] {
  const candidates: unknown[] = []
  const renderData = doc.querySelector<HTMLScriptElement>('script#RENDER_DATA')?.textContent ?? ''
  if (renderData.trim() !== '') {
    try {
      candidates.push(parseJson(decodeURIComponent(renderData)))
    } catch {
      // 编码格式变化时继续尝试其它内联 JSON。
    }
  }
  for (const text of scriptTexts(doc)) {
    for (const marker of STATE_MARKERS) {
      if (!text.includes(marker)) continue
      const parsed = parseJson(valueAfterMarker(text, marker))
      if (parsed !== null) candidates.push(parsed)
    }
  }
  return candidates
}

/** Media list of a video or image post. */
function mediaOf(item: Record<string, unknown>, href: string): CapturedMedia[] {
  const video = recordOf(item['video'])
  const media: CapturedMedia[] = []
  const videoUrl = firstHttpUrl(
    video?.['play_addr'] ?? video?.['playAddr'] ?? video?.['download_addr'] ?? video?.['downloadAddr'],
    href,
  )
  if (videoUrl !== null) media.push({ type: 'video', url: videoUrl })
  for (const image of arrayOf(item['images'])) {
    const url = firstHttpUrl(recordOf(image)?.['url_list'] ?? image, href, true)
    if (url !== null) media.push({ type: 'image', url })
  }
  return uniqueMedia(media)
}

/** Source URL: canonical link, else the id-derived detail address. */
function sourceUrlOf(doc: Document, href: string, awemeId: string): string {
  const canonical = linkHref(doc, ['link[rel="canonical"]'], href)
  if (canonical !== '') return canonical
  if (awemeId === '') return href
  try {
    return `${new URL(href).origin}/video/${awemeId}`
  } catch {
    return href
  }
}

/** Maps one 抖音 work object onto the capture contract. */
function postFromAweme(doc: Document, href: string, item: Record<string, unknown>): CapturedPost | null {
  const author = recordOf(item['author'])
  const statistics = recordOf(item['statistics']) ?? recordOf(item['stats'])
  const video = recordOf(item['video'])
  const awemeId = stringField(item, ['aweme_id', 'awemeId'])
  const content = stringField(item, ['desc'])
  const media = mediaOf(item, href)
  const title = firstNonEmpty(titleFromText(content), awemeId === '' ? '' : `抖音 ${awemeId}`)
  if (title === '' && media.length === 0) return null
  const coverUrl = firstNonEmpty(
    firstHttpUrl(video?.['cover'] ?? video?.['origin_cover'] ?? video?.['originCover'], href) ?? '',
    media.find((entry) => entry.type === 'image')?.url ?? '',
    metaContent(doc, ['meta[property="og:image"]']),
  )
  const likes = numberField(statistics, ['digg_count', 'diggCount'])
  const comments = numberField(statistics, ['comment_count', 'commentCount'])
  const shares = numberField(statistics, ['share_count', 'shareCount'])
  const collects = numberField(statistics, ['collect_count', 'collectCount'])
  const stats: CapturedStats = {
    ...(likes === undefined ? {} : { likes }),
    ...(comments === undefined ? {} : { comments }),
    ...(shares === undefined ? {} : { shares }),
    ...(collects === undefined ? {} : { collects }),
  }
  const postedAt = isoFromDate(item['create_time'] ?? item['createTime'])
  return {
    platform: 'douyin',
    source_url: sourceUrlOf(doc, href, awemeId),
    title,
    content,
    content_shape: contentShapeOf(media),
    author: {
      name: stringField(author, ['nickname', 'nickName']),
      handle: stringField(author, ['unique_id', 'uniqueId', 'short_id']),
    },
    media,
    ...(Object.keys(stats).length === 0 ? {} : { stats }),
    ...(postedAt === undefined ? {} : { posted_at: postedAt }),
    ...(coverUrl === '' ? {} : { cover_url: coverUrl }),
  }
}

/**
 * Captures the 抖音 detail page.
 *
 * @param doc the page document
 * @param href the page address
 * @returns the capture, or `null` when neither inline state nor the DOM yields a work
 */
export function extractDouyin(doc: Document, href: string): CapturedPost | null {
  // 先读主世界桥接的结果：真实页面详情走 XHR，DOM 里没有 aweme 数据。
  for (const candidate of bridgedAwemes(doc)) {
    const item = findDeepObject(candidate, isAweme)
    if (item === null) continue
    const post = postFromAweme(doc, href, item)
    if (post !== null) return post
  }
  for (const candidate of stateCandidates(doc)) {
    const item = findDeepObject(candidate, isAweme)
    if (item === null) continue
    const post = postFromAweme(doc, href, item)
    if (post !== null) return post
  }
  return domFallback(doc, href)
}

/** DOM fallback: `[data-e2e]` title/author plus the rendered player and gallery. */
function domFallback(doc: Document, href: string): CapturedPost | null {
  const content = firstNonEmpty(
    textOf(doc.querySelector('[data-e2e="video-desc"], [data-e2e="detail-video-desc"], h1')),
    metaContent(doc, ['meta[property="og:description"]', 'meta[name="description"]']),
  )
  const authorName = textOf(doc.querySelector(
    '[data-e2e="user-name"], [data-e2e="video-author"], [data-e2e="detail-user-name"]',
  ))
  const galleryRoot = doc.querySelector('[data-e2e="video-detail"], [data-e2e="image-detail"], main, article')
    ?? doc.body
    ?? doc
  const media = uniqueMedia([
    ...domVideos(doc, href),
    ...domImages(galleryRoot, href, '[data-e2e="image-item"] img, .swiper-slide img, [data-e2e="gallery"] img'),
  ])
  const title = firstNonEmpty(
    titleFromText(content),
    metaContent(doc, ['meta[property="og:title"]']),
    doc.title,
  )
  if (title === '' && media.length === 0) return null
  const coverUrl = firstNonEmpty(
    videoPoster(doc, href),
    metaContent(doc, ['meta[property="og:image"]']),
    media.find((entry) => entry.type === 'image')?.url ?? '',
  )
  return {
    platform: 'douyin',
    source_url: linkHref(doc, ['link[rel="canonical"]'], href) || href,
    title,
    content,
    content_shape: contentShapeOf(media),
    author: { name: authorName, handle: '' },
    media,
    ...(coverUrl === '' ? {} : { cover_url: coverUrl }),
  }
}
