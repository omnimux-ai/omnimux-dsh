import { existsSync } from 'node:fs'
import { downloadMedia } from './downloader.js'
import { analyzeInspirationVideo } from './analyzer.js'
import { getCanonicalItemKey, normalizeUrl } from './url-normalizer.js'
import { isDownloadableHttpUrl } from './url-policy.js'
import {
  buildTranslatePrompt,
  extractScriptStructure,
  parseDurationSeconds,
  parsePublishedAt,
  parseTranslateJson,
} from './structure-script.js'

/** Module-level singleton — never construct per request. */
export const importLocks = new Set()

const DUPLICATE_ERROR = '该灵感素材已在库中，请勿重复导入'
const HTTP_URL_RE = /^https?:\/\//i
const DEGRADE_REASON = '该平台/该内容未提供可下载的视频直链，已按链接类型入库'
/** Directly playable containers a bare `video_url`-style field may point at. */
const MEDIA_CONTAINER_RE = /\.(mp4|m4v|webm|mov)$/i
/** Manifest and page containers that are never a downloadable video file. */
const NON_MEDIA_CONTAINER_RE = /\.(m3u8|mpd|html?)$/i
/** Video CDNs whose stream URL carries no media file extension. */
const VIDEO_CDN_HOST_RE = /(^|\.)googlevideo\.com$/i

/** Cloud `capability` pair per platform (`omnimux_social_data` contract). */
export const CAPABILITY = { x: 'tweet', instagram: 'post', youtube: 'video', tiktok: 'video' }

/**
 * Resolve the cloud capability pair for a platform (defaults to `video`).
 * @param {string} platform
 * @returns {string}
 */
export function capabilityOf(platform) {
  return CAPABILITY[platform] || 'video'
}

function fail(status, error) {
  return { status, body: { error } }
}

function okExisting(existing) {
  const body = { data: existing, existing: true, is_duplicate: true }
  return { status: 200, body }
}

function conflictExisting(existing) {
  const body = {
    error: DUPLICATE_ERROR,
    data: existing,
    is_duplicate: true,
    upgradable: needsVideoUpgrade(existing),
  }
  return { status: 409, body }
}

function duplicateBody(existing, returnExisting) {
  if (returnExisting) return okExisting(existing)
  return conflictExisting(existing)
}

/**
 * A record that holds no video is a degraded import: `resolveImportType` only
 * returns `video` when a local video file was written, so `link`/`image` is the
 * persisted marker of "no direct video link was available". Re-importing the
 * same URL must be allowed to upgrade such a record — otherwise the 409 lock
 * makes a degraded item impossible to ever turn into a video.
 * @param {Record<string, any> | null | undefined} item
 * @returns {boolean}
 */
function needsVideoUpgrade(item) {
  if (!item || typeof item !== 'object') return false
  return item.type !== 'video'
}

function firstHttpUrl(values) {
  for (const value of values) {
    if (typeof value === 'string' && HTTP_URL_RE.test(value)) return value
  }
  return ''
}

/* -------------------------------------------------------------------------- *
 * Structural social envelope extraction
 *
 * Every platform returns a different envelope: X nests the stream in
 * `media.video[].variants[]`, YouTube in `formats[]`/`adaptive_formats[]`,
 * Instagram in `video_versions[]`. Each field is therefore resolved through an
 * ordered candidate list over a bounded set of wrapper layers. A field that
 * cannot be resolved stays empty; a direct url is never guessed from an
 * unrelated `*.url` (avatars, covers, tracking pixels).
 * -------------------------------------------------------------------------- */

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asObject(value) {
  return isPlainObject(value) ? value : {}
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function httpText(value) {
  const text = asText(value)
  return HTTP_URL_RE.test(text) ? text : ''
}

function firstText(values) {
  for (const value of values) {
    const text = asText(value)
    if (text) return text
  }
  return ''
}

function firstNumber(values) {
  for (const value of values) {
    const num = typeof value === 'string' ? Number(value) : value
    if (typeof num === 'number' && Number.isFinite(num)) return num
  }
  return null
}

function urlPathname(url) {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

function assignMissing(target, key, value) {
  const current = target[key]
  const hasCurrent = current !== undefined && current !== null && current !== ''
  if (!hasCurrent && value !== undefined && value !== null && value !== '') target[key] = value
}

/**
 * A variant is usable when it is a directly playable mp4. A declared content
 * type wins; otherwise the url suffix decides.
 */
function isMp4Variant(url, contentType) {
  const type = contentType.toLowerCase()
  if (type) return type.includes('mp4')
  return /\.mp4$/i.test(urlPathname(url))
}

/**
 * Best mp4 among `variants[]` (X tweet video variants, Instagram versions).
 *
 * Ranking is by a single scalar read per variant in the order
 * `bitrate` → `bit_rate` → `height`, first present wins. The ladder therefore
 * compares bitrates for envelopes that publish bitrates (X) and pixel heights
 * for envelopes that publish only sizes (Instagram). Variants from the two
 * families are never compared with each other, because no envelope mixes them.
 */
function bestVariantUrl(variants) {
  let bestUrl = ''
  let bestBitrate = -1
  for (const raw of asArray(variants)) {
    const variant = isPlainObject(raw) ? raw : {}
    const url = httpText(variant.url) || httpText(raw)
    if (!url) continue
    if (!isMp4Variant(url, firstText([variant.content_type, variant.contentType]))) continue
    const bitrate = firstNumber([variant.bitrate, variant.bit_rate, variant.height]) ?? 0
    if (bitrate > bestBitrate) {
      bestUrl = url
      bestBitrate = bitrate
    }
  }
  return bestUrl
}

/** mp4 stream inside `media.video[]`, `entities.media[].video_info` or Instagram `video_versions[]`. */
function videoFromMediaList(list) {
  for (const item of asArray(list)) {
    const media = asObject(item)
    const url = bestVariantUrl(media.variants)
      || bestVariantUrl(asObject(media.video_info).variants)
      || bestVariantUrl([item])
    if (url) return url
  }
  return ''
}

/** Poster image inside `media[].media_url_https` / `display_url`. */
function coverFromMediaList(list) {
  for (const item of asArray(list)) {
    const media = asObject(item)
    const url = httpText(media.media_url_https)
      || httpText(media.media_url)
      || httpText(media.display_url)
      || httpText(media.url)
    if (url) return url
  }
  return ''
}

/**
 * YouTube `formats[]` / `adaptive_formats[]`: highest quality mp4 that carries a
 * usable `url`. Entries with `signatureCipher`/`cipher` need a signature this
 * plugin cannot compute, so they are skipped instead of guessed.
 */
function videoFromFormatList(layer) {
  let bestUrl = ''
  let bestQuality = -1
  for (const raw of [...asArray(layer.formats), ...asArray(layer.adaptive_formats)]) {
    if (!isPlainObject(raw)) continue
    if (asText(raw.signatureCipher) || asText(raw.cipher)) continue
    const url = httpText(raw.url)
    if (!url) continue
    const mime = firstText([raw.mimeType, raw.mime_type]).toLowerCase()
    if (mime ? !mime.includes('video/mp4') : !/\.mp4$/i.test(urlPathname(url))) continue
    const quality = firstNumber([raw.height, raw.bitrate]) ?? 0
    if (quality > bestQuality) {
      bestUrl = url
      bestQuality = quality
    }
  }
  return bestUrl
}

/** Instagram `image_versions2.candidates[].url`. */
function instagramCandidateUrl(versions) {
  return firstHttpUrl(asArray(asObject(versions).candidates).map((item) => asObject(item).url))
}

/** YouTube `thumbnails[]` — the last entry is the largest. */
function lastThumbnailUrl(thumbnails) {
  const items = asArray(thumbnails)
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const url = httpText(asObject(items[index]).url)
    if (url) return url
  }
  return ''
}

/**
 * A bare `url`-style field only counts as the video stream when it points at a
 * downloadable public media file or a known video CDN — never at a page, an HLS
 * manifest, a local-network host or the cloud metadata service.
 * @param {unknown} value
 * @returns {string} the url when it may be downloaded, otherwise ''
 */
function mediaLikeUrl(value) {
  const url = httpText(value)
  if (!url) return ''
  if (!isDownloadableHttpUrl(url)) return ''
  const pathname = urlPathname(url)
  if (NON_MEDIA_CONTAINER_RE.test(pathname)) return ''
  if (MEDIA_CONTAINER_RE.test(pathname)) return url
  try {
    return VIDEO_CDN_HOST_RE.test(new URL(url).hostname) ? url : ''
  } catch {
    return ''
  }
}

function edgeCaptionText(layer) {
  const edges = asArray(asObject(layer.edge_media_to_caption).edges)
  return firstText([asObject(asObject(edges[0]).node).text])
}

function videoUrlFromLayer(layer) {
  return firstHttpUrl([
    videoFromMediaList(asObject(layer.media).video),
    videoFromMediaList(asObject(layer.entities).media),
    videoFromMediaList(asObject(layer.extended_entities).media),
    // `video_versions[]` is one clip's quality ladder (ascending), not a list of
    // clips: rank it so the highest quality wins instead of the first entry.
    bestVariantUrl(layer.video_versions) || videoFromMediaList(layer.video_versions),
    videoFromFormatList(layer),
    // Bare direct-link fields are attacker-influenced envelope data, so each one
    // must pass the media-url policy before it can become the download target.
    mediaLikeUrl(layer.video_url),
    mediaLikeUrl(layer.video),
    mediaLikeUrl(layer.play_url),
    mediaLikeUrl(layer.play),
    mediaLikeUrl(layer.download_url),
    firstHttpUrl(asArray(asObject(layer.play_addr).url_list)),
    firstHttpUrl(asArray(asObject(asObject(layer.video).play_addr).url_list)),
    mediaLikeUrl(layer.url),
  ])
}

function coverUrlFromLayer(layer) {
  return firstHttpUrl([
    layer.cover_url,
    layer.cover,
    layer.thumbnail_url,
    layer.thumbnail,
    layer.origin_cover,
    layer.dynamic_cover,
    coverFromMediaList(asObject(layer.media).video),
    coverFromMediaList(asObject(layer.entities).media),
    coverFromMediaList(asObject(layer.extended_entities).media),
    layer.display_url,
    layer.thumbnail_src,
    layer.display_src,
    layer.image_url,
    instagramCandidateUrl(layer.image_versions2),
    lastThumbnailUrl(layer.thumbnails),
    firstHttpUrl(asArray(asObject(layer.cover).url_list)),
    firstHttpUrl(asArray(asObject(asObject(layer.video).cover).url_list)),
    firstHttpUrl(asArray(asObject(asObject(layer.video).origin_cover).url_list)),
  ])
}

function textFromLayer(layer) {
  return firstText([
    layer.text,
    layer.display_text,
    layer.full_text,
    asObject(layer.legacy).full_text,
    asObject(asObject(asObject(layer.note_tweet).note_tweet_results).result).text,
    asObject(layer.caption).text,
    typeof layer.caption === 'string' ? layer.caption : '',
    edgeCaptionText(layer),
    layer.desc,
    layer.description,
    layer.content,
  ])
}

function titleFromLayer(layer) {
  return firstText([layer.title, layer.desc, layer.description, layer.name]) || textFromLayer(layer)
}

function authorFromLayer(layer) {
  const author = isPlainObject(layer.author) ? { ...layer.author } : {}
  for (const candidate of [layer.author, layer.user, layer.owner, layer.channel, layer.uploader]) {
    if (typeof candidate === 'string') {
      assignMissing(author, 'name', asText(candidate))
      continue
    }
    if (!isPlainObject(candidate)) continue
    assignMissing(author, 'name', firstText([
      candidate.name,
      candidate.nickname,
      candidate.full_name,
      candidate.screen_name,
      candidate.username,
    ]))
    assignMissing(author, 'handle', firstText([
      candidate.handle,
      candidate.screen_name,
      candidate.unique_id,
      candidate.username,
    ]))
    assignMissing(author, 'avatar', firstHttpUrl([
      candidate.avatar,
      candidate.image,
      candidate.profile_image_url,
      candidate.profile_pic_url,
      candidate.avatar_url,
    ]))
  }
  assignMissing(author, 'name', firstText([layer.author_name]))
  assignMissing(author, 'handle', firstText([layer.author_handle]))
  return author
}

function statsFromLayer(layer) {
  const stats = isPlainObject(layer.stats) ? { ...layer.stats } : {}
  const engagement = asObject(layer.engagement)
  assignMissing(stats, 'likes', firstNumber([engagement.likes, layer.favorite_count, layer.like_count, layer.digg_count, layer.likes]))
  assignMissing(stats, 'comments', firstNumber([engagement.replies, layer.reply_count, layer.comment_count, layer.comments]))
  assignMissing(stats, 'shares', firstNumber([engagement.retweets, layer.retweet_count, layer.share_count, layer.shares]))
  assignMissing(stats, 'views', firstNumber([engagement.views, layer.view_count, layer.play_count, layer.views]))
  assignMissing(stats, 'bookmarks', firstNumber([engagement.bookmarks, layer.bookmark_count]))
  return stats
}

function durationFromLayer(layer) {
  return parseDurationSeconds(layer.duration)
    ?? parseDurationSeconds(layer.video_duration)
    ?? parseDurationSeconds(layer.lengthSeconds)
    ?? parseDurationSeconds(asObject(layer.stats).duration)
    ?? parseDurationSeconds(asObject(layer.stats).video_duration)
}

/** `upload_date` style `YYYYMMDD` needs normalizing before Date parsing. */
function normalizeDateValue(value) {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00.000Z`
  }
  return text
}

function publishedAtFromLayer(layer) {
  return parsePublishedAt(normalizeDateValue(layer.create_time))
    || parsePublishedAt(normalizeDateValue(layer.createTime))
    || parsePublishedAt(normalizeDateValue(layer.published_at))
    || parsePublishedAt(normalizeDateValue(layer.upload_date))
    || parsePublishedAt(normalizeDateValue(layer.publishDate))
    || parsePublishedAt(normalizeDateValue(layer.timestamp))
    || parsePublishedAt(normalizeDateValue(layer.created_at))
    || parsePublishedAt(normalizeDateValue(layer.taken_at))
}

/**
 * Image urls may arrive as plain strings or as `{ url }` / `{ src }` objects
 * (`images: [{ url: '…jpg' }]` is the common gateway shape), so both are read
 * instead of silently dropping the entry and degrading the post to `link`.
 * @param {Record<string, any>} layer
 * @returns {string[]}
 */
function imagesFromLayer(layer) {
  return [...asArray(layer.images), ...asArray(layer.image_urls), layer.image_url]
    .map((value) => httpText(value) || httpText(value?.url) || httpText(value?.src))
    .filter(Boolean)
}

function resolvedUrlFromLayer(layer) {
  return firstHttpUrl([layer.url, layer.canonical_url, layer.permalink])
}

/** The object held by `container[key]` when that field is a list of layers. */
function firstLayerItem(container, key) {
  const first = asArray(asObject(container)[key])[0]
  return isPlainObject(first) ? first : null
}

/** `wrapper.data` when the field is itself a wrapper layer. */
function wrappedData(wrapper) {
  return isPlainObject(wrapper) && isPlainObject(wrapper.data) ? wrapper.data : null
}

/**
 * Bounded one-level unwrap of the common gateway envelopes. Only these known
 * containers are inspected — never a recursive search — so unrelated urls can
 * never be mistaken for the video stream.
 * @param {unknown} data
 * @returns {Array<Record<string, any>>}
 */
export function socialPayloadLayers(data) {
  const root = asObject(data)
  const nested = isPlainObject(root.data) ? root.data : null
  const rootFirstItem = firstLayerItem(root, 'items')
  const nestedFirstItem = firstLayerItem(nested, 'items')
  const candidates = [
    rootFirstItem,
    wrappedData(rootFirstItem),
    nested,
    nestedFirstItem,
    wrappedData(nestedFirstItem),
    isPlainObject(root.result) ? root.result : null,
    wrappedData(root.result),
    nested ? nested.result : null,
    firstLayerItem(nested, 'aweme_list'),
    firstLayerItem(nested, 'contents'),
    root.aweme_detail,
    firstLayerItem(root, 'item_list'),
  ]
  const layers = [root]
  for (const candidate of candidates) {
    if (isPlainObject(candidate) && !layers.includes(candidate)) layers.push(candidate)
  }
  return layers
}

function pickLayerValue(layers, read, isBlank) {
  for (const layer of layers) {
    const value = read(layer)
    if (!isBlank(value)) return value
  }
  return read({})
}

const isBlankText = (value) => !value
const isBlankArray = (value) => value.length === 0
const isBlankNumber = (value) => value === null || value === undefined
const isBlankObject = (value) => Object.keys(value).length === 0

/**
 * Map any supported platform envelope onto the flat metadata contract used by
 * the import pipeline.
 *
 * Supported shapes: X/Twitter `media.video[].variants[]` + `entities.media[]`,
 * Instagram `video_versions[]` / `image_versions2` / `caption`,
 * YouTube `formats[]` / `adaptive_formats[]` / `thumbnails[]`, plus the flat
 * TikTok shape and a bounded one-level unwrap of `items[0]` / `data.items[0]` /
 * `data.result` / `result.data` / `data.aweme_list[0]` / `data.contents[0]` /
 * `aweme_detail` / `item_list[0]`.
 *
 * @param {unknown} data raw `data` envelope from the cloud tool or the fallback resolver
 * @returns {{
 *   title: string, text: string, cover_url: string, video_url: string,
 *   images: string[], author: Record<string, any>, stats: Record<string, any>,
 *   duration: number | null, published_at: string, resolvedUrl: string,
 *   has_metadata: boolean,
 * }}
 */
export function parseSocialMeta(data) {
  const layers = socialPayloadLayers(data)
  const text = pickLayerValue(layers, textFromLayer, isBlankText)
  const title = pickLayerValue(layers, titleFromLayer, isBlankText)
  const cover_url = pickLayerValue(layers, coverUrlFromLayer, isBlankText)
  const video_url = pickLayerValue(layers, videoUrlFromLayer, isBlankText)
  const images = pickLayerValue(layers, imagesFromLayer, isBlankArray)
  const author = pickLayerValue(layers, authorFromLayer, isBlankObject)
  const stats = pickLayerValue(layers, statsFromLayer, isBlankObject)
  const duration = pickLayerValue(layers, durationFromLayer, isBlankNumber)
  const published_at = pickLayerValue(layers, publishedAtFromLayer, isBlankText)
  const resolvedUrl = pickLayerValue(layers, resolvedUrlFromLayer, isBlankText)
  const has_metadata = Boolean(
    video_url
    || cover_url
    || text
    || title
    || images.length > 0
    || Object.keys(author).length > 0
    || Object.keys(stats).length > 0
    || duration != null
    || published_at,
  )
  return {
    title,
    text,
    cover_url,
    video_url,
    images,
    author,
    stats,
    duration,
    published_at,
    resolvedUrl,
    has_metadata,
  }
}

export function handleList({ url, store }) {
  const q = url.searchParams.get('q') || undefined
  const platform = url.searchParams.get('platform') || undefined
  const type = url.searchParams.get('type') || undefined
  const tag = url.searchParams.get('tag') || undefined
  const isFavorite = url.searchParams.get('is_favorite') || undefined
  const sort = url.searchParams.get('sort') || undefined
  const page = parseInt(url.searchParams.get('page') || '1', 10)
  const pageSize = parseInt(url.searchParams.get('page_size') || '20', 10)
  const country = url.searchParams.get('country') || undefined
  const category = url.searchParams.get('category') || undefined
  const duration_min = url.searchParams.get('duration_min') || undefined
  const duration_max = url.searchParams.get('duration_max') || undefined
  const views_min = url.searchParams.get('views_min') || undefined
  const views_max = url.searchParams.get('views_max') || undefined
  const traffic_type = url.searchParams.get('traffic_type') || undefined
  const posted_after = url.searchParams.get('posted_after') || undefined
  const posted_before = url.searchParams.get('posted_before') || undefined
  const result = store.list({
    q,
    platform,
    type,
    tag,
    is_favorite: isFavorite,
    sort,
    page,
    pageSize,
    country,
    category,
    duration_min,
    duration_max,
    views_min,
    views_max,
    traffic_type,
    posted_after,
    posted_before,
  })
  const platforms = typeof store.platforms === 'function' ? store.platforms() : []
  return { status: 200, body: { data: { ...result, platforms } } }
}

export function handleCreate({ req, store }) {
  const body = req.body || {}
  if (!body.title) return fail(400, 'title is required')
  const created = store.add(body)
  return { status: 201, body: { data: created } }
}

function parseImportBody(ctx) {
  const body = ctx.req.body || {}
  const rawUrl = String(body.url || '').trim()
  return {
    rawUrl,
    platform: body.platform || ctx.detectPlatformFromUrl(rawUrl),
    autoAnalyze: body.auto_analyze !== false,
    customTags: Array.isArray(body.tags) ? body.tags : [],
    force: Boolean(body.force),
    returnExisting: Boolean(body.return_existing),
  }
}

export async function handleImportUrl(ctx) {
  const parsed = parseImportBody(ctx)
  if (!parsed.rawUrl) return fail(400, 'url is required')
  const existing = ctx.store.findByUrl(parsed.rawUrl)
  // Only a record that already holds a video is a true duplicate. A degraded
  // record is re-resolved so a later-available direct link can upgrade it.
  if (existing && !parsed.force && !needsVideoUpgrade(existing)) {
    return duplicateBody(existing, parsed.returnExisting)
  }
  const upgradeId = existing ? existing.id : ''
  return withImportLock(parsed.rawUrl, () => runImport({ ...ctx, ...parsed, upgradeId }))
}

async function withImportLock(rawUrl, work) {
  const canonicalKey = getCanonicalItemKey(rawUrl).key || normalizeUrl(rawUrl) || rawUrl
  if (importLocks.has(canonicalKey)) {
    return fail(429, '该灵感正在解析导入中，请勿重复提交')
  }
  importLocks.add(canonicalKey)
  try {
    return await work()
  } finally {
    importLocks.delete(canonicalKey)
  }
}

async function runImport(args) {
  if (!args.socialFetcher) {
    return fail(500, '未注入 OmniMux 社媒解析能力 (socialFetcher 未就绪)')
  }
  const social = await fetchSocialMeta(args)
  if (social.error) return social.error
  const dup = checkResolvedDuplicate(args, social.meta)
  if (dup) return dup
  return persistImportedItem(args, social.meta)
}

/**
 * Persist a resolved social item.
 *
 * A downloadable direct video link keeps the full pipeline (download video +
 * cover, `type: 'video'`, AI deconstruction). Without one — a photo post, a
 * YouTube page, a platform without a public stream — the item is still imported
 * as `link`/`image` with the metadata that was resolved, flagged as degraded so
 * callers can tell the difference. Only a completely empty envelope fails.
 */
async function persistImportedItem(args, meta) {
  const videoUrl = HTTP_URL_RE.test(meta.video_url || '') ? meta.video_url : ''
  if (!videoUrl && !meta.has_metadata) {
    return fail(422, '未从该链接解析到可入库的内容（标题、文案、封面与视频直链均为空）')
  }
  const media = videoUrl
    ? await downloadImportMedia(args, meta, videoUrl)
    : await downloadImportCover(args, meta)
  if (media.error) return media.error
  const deconstruction = await maybeAnalyze(args, media, meta)
  const record = await persistImportedRecord(args, buildImportRecord(args, meta, media, deconstruction))
  if (videoUrl) return { status: 200, body: { data: record } }
  return {
    status: 200,
    body: {
      data: record,
      media_degraded: true,
      degrade_reason: DEGRADE_REASON,
    },
  }
}

/**
 * Write the imported record.
 *
 * A re-import that resolves an existing degraded row replaces it in place, so
 * the upgraded row keeps its id while the media it no longer references is
 * recycled instead of being orphaned on disk.
 * @param {{ store: any, upgradeId?: string }} args
 * @param {Record<string, any>} record
 * @returns {Promise<Record<string, any>>}
 */
async function persistImportedRecord(args, record) {
  if (!args.upgradeId) return args.store.add(record)
  const replaced = await args.store.replace(args.upgradeId, record)
  return replaced || args.store.add(record)
}

async function maybeAnalyze(args, media, meta) {
  if (!args.autoAnalyze || !media.localVideoPath) return null
  const analysisResult = await analyzeInspirationVideo({
    videoPath: media.localVideoPath,
    title: meta.title || args.rawUrl,
    content: meta.text,
    tags: args.customTags,
    platform: args.platform,
    videoAnalyzeTool: args.videoAnalyzeTool,
  })
  return analysisResult.deconstruction
}

/**
 * Item type for a degraded import: image-only content becomes `image`,
 * anything else keeps its metadata as a `link`.
 * @param {Record<string, any>} meta
 * @param {{ localVideoPath: string }} media
 * @returns {'video' | 'image' | 'link'}
 */
function resolveImportType(meta, media) {
  if (media.localVideoPath) return 'video'
  if (meta.images.length > 0) return 'image'
  if (!meta.title && !meta.text && meta.cover_url) return 'image'
  return 'link'
}

function buildImportRecord(args, meta, media, deconstruction) {
  const coverName = media.localCoverPath ? media.localCoverPath.split('/').pop() : ''
  const videoName = media.localVideoPath ? media.localVideoPath.split('/').pop() : ''
  const cover_url = coverName
    ? `/omnimux/inspiration/local/media/covers/${coverName}`
    : meta.cover_url
  return {
    title: meta.title || args.rawUrl,
    content: meta.text,
    type: resolveImportType(meta, media),
    source_platform: args.platform,
    source_url: args.rawUrl,
    cover_url,
    media_urls: videoName ? [`/omnimux/inspiration/local/media/videos/${videoName}`] : [],
    local_paths: media.localPaths,
    tags: args.customTags,
    author: meta.author,
    stats: meta.stats,
    duration: meta.duration,
    published_at: meta.published_at,
    deconstruction,
  }
}

/** Keep the fetcher's own actionable reason instead of prefixing it twice. */
function describeFetchFailure(args, fetchErr) {
  const detail = args.formatErrorMessage(fetchErr)
  return /^OmniMux/.test(detail) ? detail : `OmniMux 社媒解析调用失败: ${detail}`
}

async function fetchSocialMeta(args) {
  try {
    const fetched = await args.socialFetcher({
      platform: args.platform,
      capability: capabilityOf(args.platform),
      url: args.rawUrl,
    })
    if (!fetched || !fetched.data) {
      return { error: fail(502, 'OmniMux 社媒解析接口未返回有效数据，请稍后重试') }
    }
    return { meta: parseSocialMeta(fetched.data) }
  } catch (fetchErr) {
    return { error: fail(502, describeFetchFailure(args, fetchErr)) }
  }
}

function checkResolvedDuplicate(args, meta) {
  const resolvedUrl = meta.resolvedUrl
  if (!resolvedUrl || resolvedUrl === args.rawUrl || args.force) return null
  const secondExisting = args.store.findByUrl(resolvedUrl)
  if (!secondExisting) return null
  // The degraded row being upgraded is not a duplicate of itself.
  if (args.upgradeId && secondExisting.id === args.upgradeId) return null
  return duplicateBody(secondExisting, args.returnExisting)
}

async function downloadImportMedia(args, meta, rawVideoUrl) {
  const localPaths = {}
  let localVideoPath = ''
  let localCoverPath = ''
  try {
    localVideoPath = await downloadMedia(rawVideoUrl, args.paths.videosDir, {
      prefix: 'video_',
      fetcher: args.fetcher,
    })
    localPaths.video = localVideoPath
  } catch (downErr) {
    const message = `视频素材下载落盘失败: ${args.formatErrorMessage(downErr)}`
    return { error: fail(502, message) }
  }
  localCoverPath = await downloadCoverBestEffort(args, meta, localPaths)
  return { localPaths, localVideoPath, localCoverPath }
}

async function downloadCoverBestEffort(args, meta, localPaths) {
  if (!meta.cover_url || !HTTP_URL_RE.test(meta.cover_url)) return ''
  try {
    const saved = await downloadMedia(meta.cover_url, args.paths.coversDir, {
      prefix: 'cover_',
      fetcher: args.fetcher,
    })
    localPaths.cover = saved
    return saved
  } catch {
    return ''
  }
}

/** Degraded import: no video stream, so only the poster image is cached. */
async function downloadImportCover(args, meta) {
  const localPaths = {}
  const localCoverPath = await downloadCoverBestEffort(args, meta, localPaths)
  return { localPaths, localVideoPath: '', localCoverPath }
}

export async function handleAnalyze(ctx) {
  const item = ctx.store.get(ctx.id)
  if (!item) return fail(404, 'not found')
  const videoPath = await resolveAnalyzeVideo({ ...ctx, item })
  if (videoPath.error) return videoPath.error
  if (!videoPath.path || !existsSync(videoPath.path)) {
    return fail(422, '该链接未取得可下载的视频文件，暂不支持拆解')
  }
  return persistAnalysis(ctx, item, videoPath.path)
}

async function persistAnalysis(ctx, item, videoPath) {
  const analysisResult = await analyzeInspirationVideo({
    videoPath,
    title: item.title,
    content: item.content,
    tags: item.tags,
    platform: item.source_platform,
    videoAnalyzeTool: ctx.videoAnalyzeTool,
  })
  if (!analysisResult.deconstruction) {
    return fail(500, analysisResult.error || 'AI 视频拆解失败，请确保大模型视觉分析服务可用')
  }
  const markdown = analysisResult.deconstruction.markdown || analysisResult.deconstruction.raw_markdown || ''
  let structure = { segments: [], sections: [] }
  try {
    structure = await extractScriptStructure(ctx.textComplete, {
      content: item.content || '',
      markdown,
    })
  } catch {
    structure = { segments: [], sections: [] }
  }
  const deconstruction = {
    ...analysisResult.deconstruction,
    analyzed_at: new Date().toISOString(),
    segments: structure.segments,
    sections: structure.sections,
  }
  const updated = ctx.store.update(ctx.id, {
    deconstruction,
    local_paths: item.local_paths,
  })
  return { status: 200, body: { data: updated } }
}

export async function handleTranslate(ctx) {
  const item = ctx.store.get(ctx.id)
  if (!item) return fail(404, 'not found')
  const lang = String(ctx.req.body?.lang || ctx.req.body?.target || 'zh').trim() || 'zh'
  const analysis = item.deconstruction && typeof item.deconstruction === 'object' ? item.deconstruction : {}
  const segments = Array.isArray(analysis.segments) ? analysis.segments : []
  const source = segments.length
    ? segments.map((row) => row.text).filter(Boolean).join('\n')
    : (item.content || '')
  if (!source.trim()) return fail(422, '暂无脚本文案可翻译')
  if (!ctx.textComplete || typeof ctx.textComplete.execute !== 'function') {
    return fail(503, '文本翻译能力未就绪')
  }
  try {
    const result = await ctx.textComplete.execute({
      reason: 'inspiration-script-translate',
      prompt: buildTranslatePrompt({
        lang,
        source,
        segmentIds: segments.map((row) => row.id),
      }),
      maxTokens: 1800,
    })
    const parsed = parseTranslateJson(result?.text || result, source)
    const updated = ctx.store.update(ctx.id, {
      script_translation: {
        lang,
        text: parsed.text,
        segments: parsed.segments,
      },
    })
    return { status: 200, body: { data: updated } }
  } catch (error) {
    return fail(502, error instanceof Error ? error.message : String(error))
  }
}

async function resolveAnalyzeVideo(args) {
  const existing = args.item.local_paths?.video
  if (existing) return { path: existing }
  if (!args.item.source_url || !args.socialFetcher) return { path: existing }
  return downloadAnalyzeVideo(args)
}

/** Re-resolve the direct video link with the same structural mapper as the import path. */
function videoUrlFromFetched(fetched) {
  return parseSocialMeta(fetched && fetched.data ? fetched.data : {}).video_url
}

async function downloadAnalyzeVideo(args) {
  try {
    const platform = args.item.source_platform || args.detectPlatformFromUrl(args.item.source_url)
    const fetched = await args.socialFetcher({
      platform,
      capability: capabilityOf(platform),
      url: args.item.source_url,
    })
    const vUrl = videoUrlFromFetched(fetched)
    if (!vUrl) return { path: args.item.local_paths?.video }
    const videoPath = await downloadMedia(vUrl, args.paths.videosDir, {
      prefix: 'video_',
      fetcher: args.fetcher,
    })
    args.item.local_paths = { ...(args.item.local_paths || {}), video: videoPath }
    return { path: videoPath }
  } catch (downErr) {
    const message = downErr instanceof Error ? downErr.message : String(downErr)
    return { error: fail(502, `重新下载视频失败: ${message}`) }
  }
}

export async function handleBatchDelete({ req, store }) {
  const body = req.body || {}
  const ids = Array.isArray(body.ids) ? body.ids : []
  if (ids.length === 0) return fail(400, 'ids array is required')
  const result = await store.deleteBatch(ids)
  return { status: 200, body: { data: result } }
}

export function handleGetItem({ id, store }) {
  const item = store.get(id)
  if (!item) return fail(404, 'not found')
  return { status: 200, body: { data: item } }
}

export function handlePatchItem({ id, req, store }) {
  const body = req.body || {}
  const updated = store.update(id, body)
  return { status: 200, body: { data: updated } }
}

export async function handleDeleteItem({ id, store }) {
  const removed = await store.delete(id)
  return { status: 200, body: { data: removed } }
}
