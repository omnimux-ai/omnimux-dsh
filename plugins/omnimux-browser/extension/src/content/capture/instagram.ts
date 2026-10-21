/**
 * Instagram capture: read the media object out of an inline JSON script.
 *
 * Instagram ships no player data script of its own; the detail media appears as
 * `shortcode_media` (or `xdt_shortcode_media`) inside one of the hydration
 * `<script type="application/json">` islands. The reader tries the exact key
 * first, then any JSON object that looks like a media node, then og/meta plus
 * the rendered DOM — the page is a best-effort source, never a hard dependency.
 *
 * @module
 */

import type { CapturedMedia, CapturedPost, CapturedStats } from './types.ts'
import {
  absoluteHttpUrl,
  arrayOf,
  contentShapeOf,
  domImages,
  domVideos,
  findDeepObject,
  firstNonEmpty,
  isoFromDate,
  keyedJsonInScripts,
  linkHref,
  metaContent,
  numberField,
  recordOf,
  scriptTexts,
  parseJson,
  stringField,
  titleFromText,
  uniqueMedia,
} from './helpers.ts'

/** Keys the media object is stored under, in the shapes Instagram ships. */
const MEDIA_KEYS = ['xdt_shortcode_media', 'shortcode_media']

/** Media node predicate for the shape search, when the key moved. */
function isMediaNode(record: Record<string, unknown>): boolean {
  return record['is_video'] !== undefined
    && (record['display_url'] !== undefined || record['video_url'] !== undefined)
}

/**
 * Real detail shape (verified on a live Instagram reel, 2026-10):
 * `require → xdt_api__v1__media__shortcode__web_info → items[]`, each item
 * carrying `video_versions` / `image_versions2` / `carousel_media`, `user`,
 * `caption`, counters and `taken_at`. The legacy `shortcode_media` shape is
 * kept as a second source because embeds still ship it.
 */
function isInfoItem(record: Record<string, unknown>): boolean {
  const hasMedia = Array.isArray(record['video_versions'])
    || recordOf(record['image_versions2']) !== null
    || Array.isArray(record['carousel_media'])
  const hasId = record['pk'] !== undefined || record['code'] !== undefined || record['id'] !== undefined
  return hasMedia && hasId
}

/** Locates the detail media node. */
function mediaNode(doc: Document): Record<string, unknown> | null {
  const keyed = keyedJsonInScripts(doc, MEDIA_KEYS)
  const keyedRecord = recordOf(keyed)
  if (keyedRecord !== null && isMediaNode(keyedRecord)) return keyedRecord
  for (const text of scriptTexts(doc)) {
    const looksReal = text.includes('"video_versions"')
      || text.includes('"image_versions2"')
      || text.includes('xdt_api__v1__media__shortcode__web_info')
    if (!looksReal && !text.includes('"display_url"') && !text.includes('"is_video"')) continue
    const parsed = parseJson(text)
    if (looksReal) {
      // 实测：`{"require":[[...]]}` 中 items[0] 深度为 15，默认 14 层会漏掉。
      const real = findDeepObject(parsed, isInfoItem, 24)
      if (real !== null) return real
    }
    const deep = findDeepObject(parsed, isMediaNode, 24)
    if (deep !== null) return deep
  }
  return null
}

/** First URL of an `image_versions2.candidates[]` list. */
function imageCandidateOf(node: Record<string, unknown>, href: string): string {
  for (const candidate of arrayOf(recordOf(node['image_versions2'])?.['candidates'])) {
    const url = absoluteHttpUrl(stringField(recordOf(candidate), ['url']), href)
    if (url !== null) return url
  }
  return ''
}

/** First direct video URL of a real-shape item. */
function videoCandidateOf(node: Record<string, unknown>, href: string): string {
  for (const version of arrayOf(node['video_versions'])) {
    const url = absoluteHttpUrl(stringField(recordOf(version), ['url']), href)
    if (url !== null) return url
  }
  return absoluteHttpUrl(stringField(node, ['video_url']), href) ?? ''
}

/** Media list of one real-shape item, expanding carousels. */
function realMediaOf(item: Record<string, unknown>, href: string): CapturedMedia[] {
  const entries: CapturedMedia[] = []
  // 实测：Reel 同时带 video_versions 与 image_versions2（封面）；视频才是主体，
  // 不能先展开 carousel/封面图片把视频挤掉。
  const directVideo = videoCandidateOf(item, href)
  if (directVideo !== '') return [{ type: 'video', url: directVideo }]
  const push = (node: Record<string, unknown>): void => {
    const video = videoCandidateOf(node, href)
    if (video !== '') {
      entries.push({ type: 'video', url: video })
      return
    }
    const image = imageCandidateOf(node, href)
    if (image !== '') entries.push({ type: 'image', url: image })
  }
  for (const child of arrayOf(item['carousel_media'])) {
    const record = recordOf(child)
    if (record !== null) push(record)
  }
  if (entries.length === 0) push(item)
  return uniqueMedia(entries)
}

/** Maps a real-shape detail item onto the capture contract. */
function postFromInfoItem(doc: Document, href: string, item: Record<string, unknown>): CapturedPost | null {
  const user = recordOf(item['user'])
  const content = stringField(recordOf(item['caption']), ['text'])
  const title = titleFromText(firstNonEmpty(content, metaContent(doc, ['meta[property="og:title"]']), doc.title))
  const media = realMediaOf(item, href)
  if (title === '' && media.length === 0) return null
  const coverUrl = firstNonEmpty(
    imageCandidateOf(item, href),
    stringField(item, ['display_url', 'thumbnail_url']) === ''
      ? ''
      : absoluteHttpUrl(stringField(item, ['display_url', 'thumbnail_url']), href) ?? '',
    media.find((entry) => entry.type === 'image')?.url ?? '',
  )
  const likes = numberField(item, ['like_count'])
  const comments = numberField(item, ['comment_count'])
  const views = numberField(item, ['play_count', 'view_count'])
  const stats: CapturedStats = {
    ...(likes === undefined ? {} : { likes }),
    ...(comments === undefined ? {} : { comments }),
    ...(views === undefined ? {} : { views }),
  }
  const postedAt = isoFromDate(item['taken_at'])
  return {
    platform: 'instagram',
    source_url: linkHref(doc, ['link[rel="canonical"]'], href) || href,
    title,
    content,
    content_shape: contentShapeOf(media),
    author: {
      name: stringField(user, ['full_name']),
      handle: stringField(user, ['username']),
    },
    media,
    ...(Object.keys(stats).length === 0 ? {} : { stats }),
    ...(postedAt === undefined ? {} : { posted_at: postedAt }),
    ...(coverUrl === '' ? {} : { cover_url: coverUrl }),
  }
}

/** Caption text from the media node's edge list. */
function captionOf(media: Record<string, unknown>): string {
  for (const edge of arrayOf(recordOf(media['edge_media_to_caption'])?.['edges'])) {
    const text = stringField(recordOf(recordOf(edge)?.['node']), ['text'])
    if (text !== '') return text
  }
  return ''
}

/** Child media of a carousel, or the single media itself. */
function mediaOf(media: Record<string, unknown>, href: string): CapturedMedia[] {
  const entries: CapturedMedia[] = []
  const children = arrayOf(recordOf(media['edge_sidecar_to_children'])?.['edges'])
  for (const edge of children) {
    const node = recordOf(recordOf(edge)?.['node'])
    if (node === null) continue
    const url = node['is_video'] === true
      ? absoluteHttpUrl(stringField(node, ['video_url']), href)
      : absoluteHttpUrl(stringField(node, ['display_url']), href)
    if (url !== null) entries.push({ type: node['is_video'] === true ? 'video' : 'image', url })
  }
  if (entries.length > 0) return uniqueMedia(entries)
  const url = media['is_video'] === true
    ? absoluteHttpUrl(stringField(media, ['video_url']), href)
    : absoluteHttpUrl(stringField(media, ['display_url']), href)
  return url === null ? [] : [{ type: media['is_video'] === true ? 'video' : 'image', url }]
}

/** Meta / DOM fallback for a page whose JSON island moved or is absent. */
function fallbackPost(doc: Document, href: string): CapturedPost | null {
  const content = metaContent(doc, [
    'meta[property="og:description"]',
    'meta[name="description"]',
  ])
  const title = titleFromText(firstNonEmpty(
    metaContent(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']),
    doc.title,
  ))
  const root = doc.querySelector('article, main') ?? doc.body ?? doc
  const videoUrl = absoluteHttpUrl(
    metaContent(doc, ['meta[property="og:video:secure_url"]', 'meta[property="og:video"]']),
    href,
  )
  const media = uniqueMedia([
    ...(videoUrl === null ? [] : [{ type: 'video' as const, url: videoUrl }]),
    ...domVideos(root, href),
    ...domImages(root, href),
  ])
  if (title === '' && media.length === 0) return null
  const coverUrl = firstNonEmpty(
    metaContent(doc, ['meta[property="og:image"]']),
    media.find((entry) => entry.type === 'image')?.url ?? '',
  )
  return {
    platform: 'instagram',
    source_url: linkHref(doc, ['link[rel="canonical"]'], href) || href,
    title,
    content,
    content_shape: contentShapeOf(media),
    author: { name: '', handle: '' },
    media,
    ...(coverUrl === '' ? {} : { cover_url: coverUrl }),
  }
}

/**
 * Captures the Instagram detail page.
 *
 * @param doc the page document
 * @param href the page address
 * @returns the capture, or `null` when neither JSON nor meta/DOM describes a work
 */
export function extractInstagram(doc: Document, href: string): CapturedPost | null {
  const media = mediaNode(doc)
  if (media === null) return fallbackPost(doc, href)
  if (isInfoItem(media)) return postFromInfoItem(doc, href, media)
  const owner = recordOf(media['owner'])
  const content = captionOf(media)
  const title = titleFromText(firstNonEmpty(
    content,
    metaContent(doc, ['meta[property="og:title"]']),
    doc.title,
  ))
  const mediaList = mediaOf(media, href)
  const coverUrl = firstNonEmpty(
    absoluteHttpUrl(stringField(media, ['display_url', 'thumbnail_src']), href) ?? '',
    mediaList.find((entry) => entry.type === 'image')?.url ?? '',
  )
  const likes = numberField(recordOf(media['edge_liked_by']), ['count'])
    ?? numberField(recordOf(media['edge_media_preview_like']), ['count'])
  const comments = numberField(recordOf(media['edge_media_to_comment']), ['count'])
    ?? numberField(recordOf(media['edge_media_to_parent_comment']), ['count'])
  const views = numberField(media, ['video_view_count', 'video_play_count'])
  const stats: CapturedStats = {
    ...(likes === undefined ? {} : { likes }),
    ...(comments === undefined ? {} : { comments }),
    ...(views === undefined ? {} : { views }),
  }
  const postedAt = isoFromDate(media['taken_at_timestamp'])
  if (title === '' && mediaList.length === 0) return null
  return {
    platform: 'instagram',
    source_url: linkHref(doc, ['link[rel="canonical"]'], href) || href,
    title,
    content,
    content_shape: contentShapeOf(mediaList),
    author: {
      name: stringField(owner, ['full_name']),
      handle: stringField(owner, ['username']),
    },
    media: mediaList,
    ...(Object.keys(stats).length === 0 ? {} : { stats }),
    ...(postedAt === undefined ? {} : { posted_at: postedAt }),
    ...(coverUrl === '' ? {} : { cover_url: coverUrl }),
  }
}
