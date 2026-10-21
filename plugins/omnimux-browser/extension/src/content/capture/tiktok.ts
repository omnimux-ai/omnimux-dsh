/**
 * TikTok capture: read the `#__UNIVERSAL_DATA_FOR_REHYDRATION__` scope JSON.
 *
 * The page ships one JSON island; `webapp.video-detail` holds a video post and
 * `webapp.post-detail` a photo post, while some layouts only carry the item
 * deeper inside the payload. The reader accepts both scope keys and then
 * searches by shape, so a renamed wrapper still yields the work.
 *
 * @module
 */

import type { CapturedMedia, CapturedPost } from './types.ts'
import {
  absoluteHttpUrl,
  arrayOf,
  contentShapeOf,
  findDeepObject,
  firstHttpUrl,
  firstNonEmpty,
  isoFromDate,
  linkHref,
  metaContent,
  numberField,
  parseJson,
  recordOf,
  stringField,
  titleFromText,
  uniqueMedia,
} from './helpers.ts'

/** The JSON island, in both id spellings TikTok has shipped. */
const DATA_SELECTOR = 'script#__UNIVERSAL_DATA_FOR_REHYDRATION__, script#SIGI_STATE'

/** Scope keys that hold a work detail. */
const DETAIL_SCOPES = ['webapp.video-detail', 'webapp.post-detail', 'webapp.photo-detail']

/** Whether a JSON object looks like a TikTok work item. */
function isItemStruct(record: Record<string, unknown>): boolean {
  if (typeof record['desc'] !== 'string' && record['desc'] !== undefined) return false
  return (record['video'] !== undefined || record['imagePost'] !== undefined || record['stats'] !== undefined)
    && (record['author'] !== undefined || record['id'] !== undefined)
}

/** Locates the item struct in the page's JSON island. */
function itemStructOf(parsed: unknown): Record<string, unknown> | null {
  const scope = recordOf(recordOf(parsed)?.['__DEFAULT_SCOPE__'])
  for (const key of DETAIL_SCOPES) {
    const detail = recordOf(scope?.[key])
    const item = recordOf(recordOf(detail?.['itemInfo'])?.['itemStruct'])
    if (item !== null) return item
  }
  const deepDetail = findDeepObject(parsed, (record) => record['itemStruct'] !== undefined)
  const nested = recordOf(deepDetail?.['itemStruct'])
  if (nested !== null) return nested
  return findDeepObject(parsed, isItemStruct)
}

/** Media list of a video or photo post. */
function mediaOf(item: Record<string, unknown>, href: string): CapturedMedia[] {
  const video = recordOf(item['video'])
  const imagePost = recordOf(item['imagePost'])
  const media: CapturedMedia[] = []
  const videoUrl = firstHttpUrl(video?.['playAddr'] ?? video?.['play_addr'] ?? video?.['downloadAddr'], href)
  if (videoUrl !== null) media.push({ type: 'video', url: videoUrl })
  for (const image of arrayOf(imagePost?.['images'])) {
    const url = firstHttpUrl(recordOf(image)?.['imageURL'] ?? image, href, true)
    if (url !== null) media.push({ type: 'image', url })
  }
  return uniqueMedia(media)
}

/** First content line or a stable fallback title. */
function titleOf(item: Record<string, unknown>, content: string): string {
  return firstNonEmpty(titleFromText(content), stringField(item, ['id']) === '' ? '' : 'TikTok post')
}

/**
 * Captures the TikTok detail page.
 *
 * @param doc the page document
 * @param href the page address
 * @returns the capture, or `null` when the JSON island is absent or unreadable
 */
export function extractTiktok(doc: Document, href: string): CapturedPost | null {
  const parsed = parseJson(doc.querySelector<HTMLScriptElement>(DATA_SELECTOR)?.textContent ?? '')
  if (parsed === null) return null
  const item = itemStructOf(parsed)
  if (item === null) return null

  const author = recordOf(item['author'])
  const stats = recordOf(item['stats'])
  const video = recordOf(item['video'])
  const content = stringField(item, ['desc'])
  const media = mediaOf(item, href)
  const id = stringField(item, ['id'])
  const uniqueId = stringField(author, ['uniqueId', 'unique_id'])
  const builtUrl = id !== '' && uniqueId !== ''
    ? absoluteHttpUrl(`/@${uniqueId}/video/${id}`, 'https://www.tiktok.com')
    : null
  const sourceUrl = linkHref(doc, ['link[rel="canonical"]'], href) || builtUrl || href
  const coverUrl = firstNonEmpty(
    firstHttpUrl(video?.['cover'] ?? video?.['originCover'], href) ?? '',
    media.find((entry) => entry.type === 'image')?.url ?? '',
    metaContent(doc, ['meta[property="og:image"]']),
  )
  const likes = numberField(stats, ['diggCount', 'digg_count'])
  const comments = numberField(stats, ['commentCount', 'comment_count'])
  const shares = numberField(stats, ['shareCount', 'share_count'])
  const views = numberField(stats, ['playCount', 'play_count'])
  const collects = numberField(stats, ['collectCount', 'collect_count'])
  const capturedStats = {
    ...(likes === undefined ? {} : { likes }),
    ...(comments === undefined ? {} : { comments }),
    ...(shares === undefined ? {} : { shares }),
    ...(views === undefined ? {} : { views }),
    ...(collects === undefined ? {} : { collects }),
  }
  const postedAt = isoFromDate(item['createTime'] ?? item['create_time'])
  const title = titleOf(item, content)
  if (title === '' && media.length === 0) return null
  return {
    platform: 'tiktok',
    source_url: sourceUrl,
    title,
    content,
    content_shape: contentShapeOf(media),
    author: {
      name: stringField(author, ['nickname', 'nickName']),
      handle: uniqueId,
    },
    media,
    ...(Object.keys(capturedStats).length === 0 ? {} : { stats: capturedStats }),
    ...(postedAt === undefined ? {} : { posted_at: postedAt }),
    ...(coverUrl === '' ? {} : { cover_url: coverUrl }),
  }
}
