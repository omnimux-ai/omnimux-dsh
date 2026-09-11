/**
 * @file plugins/omnimux-video-preview/src/breakdown/socialMetadata.js
 * Social media video metadata fetching and normalization engine.
 */

import { fallbackResolveSocial } from '../download-helper.js'

const SOCIAL_PLATFORM_RULES = Object.freeze([
  { keyword: 'douyin.com', platform: 'douyin' },
  { keyword: 'instagram.com', platform: 'instagram' },
  { keyword: 'youtube.com', platform: 'youtube' },
  { keyword: 'youtu.be', platform: 'youtube' },
  { keyword: 'x.com', platform: 'x' },
  { keyword: 'twitter.com', platform: 'x' },
  { keyword: 'bilibili.com', platform: 'bilibili' },
  { keyword: 'xiaohongshu.com', platform: 'xiaohongshu' },
  { keyword: 'xhslink.com', platform: 'xiaohongshu' },
])

const SOCIAL_WEB_URL_REGEX = new RegExp('^(https?:\\/\\/)?(www\\.)?(tiktok\\.com\\/@|instagram\\.com\\/p\\/|youtube\\.com\\/watch|youtu\\.be\\/|twitter\\.com\\/|x\\.com\\/)', 'i')

/**
 * Detect social platform from video URL using table lookup.
 * @param {string} url
 * @returns {string}
 */
export function detectSocialPlatform(url) {
  const s = String(url || '').toLowerCase()
  for (const rule of SOCIAL_PLATFORM_RULES) {
    if (s.includes(rule.keyword)) {
      return rule.platform
    }
  }
  return 'tiktok'
}

/**
 * Pick the first non-empty string among candidates.
 * @param {...string} values
 * @returns {string}
 */
function pickFirstNonEmptyString(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) {
      return v.trim()
    }
  }
  return ''
}

/**
 * Safely pick first url from candidate objects with url_list array.
 * @param {Array<object>} candidates
 * @returns {string}
 */
function pickFirstUrlList(candidates) {
  for (const item of candidates) {
    const list = item ? item.url_list : null
    if (Array.isArray(list) && list.length > 0 && typeof list[0] === 'string') {
      return list[0]
    }
  }
  return ''
}

/**
 * Extract bit rate video URLs from aweme list.
 * @param {Array<object>} bitRateList
 * @returns {Array<string>}
 */
function collectBitRateUrls(bitRateList) {
  if (!Array.isArray(bitRateList)) return []
  const urls = []
  for (const b of bitRateList) {
    const playAddr = b ? b.play_addr : null
    const list = playAddr ? playAddr.url_list : null
    if (Array.isArray(list) && typeof list[0] === 'string') {
      urls.push(list[0])
    }
  }
  return urls
}

/**
 * Collect candidate video URLs from aweme video object.
 * @param {object} videoObj
 * @returns {Array<string>}
 */
function collectAwemeVideoCandidates(videoObj) {
  const playAddr = videoObj ? videoObj.play_addr : null
  const playList = playAddr && Array.isArray(playAddr.url_list) ? playAddr.url_list : []

  const downloadAddr = videoObj ? videoObj.download_addr : null
  const downloadList = downloadAddr && Array.isArray(downloadAddr.url_list) ? downloadAddr.url_list : []

  const bitRateUrls = collectBitRateUrls(videoObj ? videoObj.bit_rate : null)
  return [...playList, ...downloadList, ...bitRateUrls]
}

/**
 * Resolve video direct stream URL from aweme video object.
 * @param {object} videoObj
 * @returns {string}
 */
function resolveAwemeVideoUrl(videoObj) {
  const candidates = collectAwemeVideoCandidates(videoObj)
  for (const u of candidates) {
    const isFastCdn = typeof u === 'string' && u.startsWith('http') && !u.includes('tiktok.com/aweme/v1/play/')
    if (isFastCdn) return u
  }
  for (const u of candidates) {
    if (typeof u === 'string' && u.startsWith('http')) {
      return u
    }
  }
  return ''
}

/**
 * Resolve author handle from unique_id or short_id.
 * @param {object} author
 * @returns {string}
 */
function resolveAuthorHandle(author) {
  if (author.unique_id) {
    const raw = String(author.unique_id).replace(/^@/, '')
    return `@${raw}`
  }
  if (author.short_id) {
    return `@${author.short_id}`
  }
  return '@creator'
}

/**
 * Resolve author profile fields from aweme structure.
 * @param {object} author
 * @returns {{ name: string, handle: string, avatar: string }}
 */
function resolveAwemeAuthor(author) {
  const name = author.nickname || author.unique_id || 'Creator'
  const handle = resolveAuthorHandle(author)
  const avatar = pickFirstUrlList([
    author.avatar_thumb,
    author.avatar_medium,
    author.avatar_larger,
  ])
  return { name, handle, avatar }
}

/**
 * Pick numeric metric with fallback priority.
 * @param {number|undefined} primary
 * @param {number|undefined} secondary
 * @returns {number}
 */
function pickNumberMetric(primary, secondary) {
  if (typeof primary === 'number') return primary
  if (typeof secondary === 'number') return secondary
  return 0
}

/**
 * Extract statistics object from aweme.
 * @param {object} stats
 * @returns {{ likes: number, comments: number, shares: number, views: number }}
 */
function extractAwemeStats(stats) {
  const s = stats || {}
  return {
    likes: pickNumberMetric(s.digg_count, s.likes),
    comments: pickNumberMetric(s.comment_count, s.comments),
    shares: pickNumberMetric(s.share_count, s.shares),
    views: pickNumberMetric(s.play_count, s.views),
  }
}

/**
 * Extract unified aweme payload from raw social responses.
 * @param {object} aweme
 * @returns {object}
 */
function normalizeAwemePayload(aweme) {
  const desc = aweme.desc || aweme.title || ''
  const author = resolveAwemeAuthor(aweme.author || {})
  const videoObj = aweme.video || {}
  const coverUrl = pickFirstUrlList([
    videoObj.cover,
    videoObj.origin_cover,
    videoObj.dynamic_cover,
  ])

  const videoUrl = resolveAwemeVideoUrl(videoObj)
  const durationMs = typeof videoObj.duration === 'number' ? videoObj.duration : 0
  const duration = durationMs > 1000 ? Math.round(durationMs / 1000) : durationMs

  return {
    title: desc || '短视频分析',
    text: desc || '',
    caption: desc || '',
    author,
    cover_url: coverUrl,
    video_url: videoUrl,
    duration,
    stats: extractAwemeStats(aweme.statistics),
  }
}

/**
 * Extract author container from flat data.
 * @param {object} data
 * @returns {object|string}
 */
function extractAuthorSource(data) {
  if (data.author) return data.author
  if (data.user) return data.user
  if (data.owner) return data.owner
  return {}
}

/**
 * Resolve author handle from flat author object or string.
 * @param {object|string} author
 * @returns {string}
 */
function resolveFlatHandle(author) {
  if (typeof author === 'string') {
    return author.startsWith('@') ? author : `@${author}`
  }
  const rawHandle = pickFirstNonEmptyString(author.handle, author.screen_name, author.unique_id) || 'creator'
  return rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`
}

/**
 * Extract author fields from generic social data.
 * @param {object} data
 * @returns {{ name: string, handle: string, avatar: string }}
 */
function resolveFlatAuthor(data) {
  const author = extractAuthorSource(data)
  if (typeof author === 'string') {
    return {
      name: author,
      handle: resolveFlatHandle(author),
      avatar: '',
    }
  }

  const name = pickFirstNonEmptyString(author.name, author.nickname, author.username) || 'Creator'
  const handle = resolveFlatHandle(author)
  const avatar = pickFirstNonEmptyString(author.avatar, author.image, author.profile_image_url)
  return { name, handle, avatar }
}

/**
 * Find MP4 url in variant list.
 * @param {Array<object>} variants
 * @returns {string}
 */
function findMp4InVariants(variants) {
  if (!Array.isArray(variants)) return ''
  for (const v of variants) {
    if (v && typeof v.url === 'string' && v.url.includes('.mp4')) {
      return v.url
    }
  }
  return ''
}

/**
 * Extract mp4 variant URL from twitter media entities.
 * @param {object} data
 * @returns {string}
 */
function findTwitterMp4Variant(data) {
  const mediaVideo = data.media && Array.isArray(data.media.video) ? data.media.video[0] : null
  const directMp4 = findMp4InVariants(mediaVideo ? mediaVideo.variants : null)
  if (directMp4) return directMp4

  const entitiesMedia = data.entities && Array.isArray(data.entities.media) ? data.entities.media[0] : null
  const videoInfo = entitiesMedia ? entitiesMedia.video_info : null
  return findMp4InVariants(videoInfo ? videoInfo.variants : null)
}

/**
 * Extract video url from generic social variants.
 * @param {object} data
 * @returns {string}
 */
function resolveFlatVideoUrl(data) {
  let videoUrl = pickFirstNonEmptyString(data.video_url, data.videoUrl)
  if (!videoUrl || !videoUrl.includes('.mp4')) {
    const xVideo = findTwitterMp4Variant(data)
    if (xVideo) {
      videoUrl = xVideo
    }
  }

  if (videoUrl && SOCIAL_WEB_URL_REGEX.test(videoUrl)) {
    return ''
  }
  return videoUrl
}

/**
 * Normalize duration in seconds.
 * @param {object} data
 * @returns {number}
 */
function resolveFlatDuration(data) {
  let raw = 0
  if (typeof data.duration === 'number') {
    raw = data.duration
  } else if (typeof data.duration_seconds === 'number') {
    raw = data.duration_seconds
  }
  if (raw > 60000) {
    return Math.round(raw / 1000)
  }
  return raw
}

/**
 * Extract stats container from flat data.
 * @param {object} data
 * @returns {object}
 */
function extractFlatStats(data) {
  if (data.stats) return data.stats
  if (data.statistics) return data.statistics
  if (data.engagement) return data.engagement
  return {}
}

/**
 * Extract unified payload from standard fallback data.
 * @param {object} data
 * @returns {object}
 */
function normalizeFlatPayload(data) {
  const title = pickFirstNonEmptyString(data.title, data.text, data.caption, data.desc) || '短视频分析'
  const author = resolveFlatAuthor(data)
  const videoUrl = resolveFlatVideoUrl(data)
  const coverUrl = pickFirstNonEmptyString(data.cover_url, data.coverUrl, data.cover, data.display_url)
  const stats = extractFlatStats(data)
  const duration = resolveFlatDuration(data)

  return {
    title,
    text: title,
    caption: title,
    author,
    cover_url: coverUrl,
    video_url: videoUrl,
    duration,
    stats: {
      likes: pickNumberMetric(stats.likes, stats.digg_count),
      comments: pickNumberMetric(stats.comments, stats.comment_count),
      shares: pickNumberMetric(stats.shares, stats.share_count),
      views: pickNumberMetric(stats.views, stats.play_count),
    },
  }
}

/**
 * Find aweme_detail item from envelope variations.
 * @param {object} raw
 * @returns {object|null}
 */
function extractAwemeObject(raw) {
  if (raw.aweme_detail) return raw.aweme_detail
  if (raw.data && raw.data.aweme_detail) return raw.data.aweme_detail
  if (Array.isArray(raw.item_list) && raw.item_list.length > 0) return raw.item_list[0]
  if (Array.isArray(raw.aweme_list) && raw.aweme_list.length > 0) return raw.aweme_list[0]
  return null
}

/**
 * Normalize raw social data from various upstream structures into unified metadata.
 * Supports TikTok/Douyin aweme_detail, X/Twitter, YouTube, Instagram, and fallback objects.
 * @param {object} raw
 * @param {string} [_fallbackUrl='']
 * @returns {object|null}
 */
export function normalizeSocialMetadata(raw, _fallbackUrl = '') {
  if (!raw || typeof raw !== 'object') return null

  const aweme = extractAwemeObject(raw)
  if (aweme && typeof aweme === 'object') {
    return normalizeAwemePayload(aweme)
  }

  const data = raw.data && typeof raw.data === 'object' ? raw.data : raw
  return normalizeFlatPayload(data)
}

/**
 * Execute query with official social data tool.
 * @param {object} socialTool
 * @param {string} platform
 * @param {string} url
 * @returns {Promise<object|null>}
 */
async function querySocialTool(socialTool, platform, url) {
  try {
    const res = await socialTool.execute({ platform, capability: 'video', url })
    if (!res || !res.data) return null
    const normalized = normalizeSocialMetadata(res.data, url)
    if (!normalized) return null
    const isMeaningful = normalized.video_url || normalized.title !== '短视频分析'
    return isMeaningful ? normalized : null
  } catch {
    return null
  }
}

/**
 * Resolve social data tool from execution context.
 * @param {object} ctx
 * @returns {object|null}
 */
function resolveSocialToolFromContext(ctx) {
  if (!ctx) return null
  const toolMap = ctx.tools || (typeof ctx.get === 'function' ? ctx.get('tools') : null)
  if (toolMap && typeof toolMap.get === 'function') {
    return toolMap.get('omnimux_social_data')
  }
  return null
}

/**
 * Fetch social metadata with real API or resilient fallback.
 * @param {string} url
 * @param {object} [ctx={}]
 * @returns {Promise<object|null>}
 */
export async function fetchRealSocialMetadata(url, ctx = {}) {
  const platform = detectSocialPlatform(url)
  const socialTool = resolveSocialToolFromContext(ctx)

  if (socialTool && typeof socialTool.execute === 'function') {
    const toolResult = await querySocialTool(socialTool, platform, url)
    if (toolResult) return toolResult
  }

  const fallback = await fallbackResolveSocial({ platform, capability: 'video', url })
  if (fallback && fallback.data) {
    return normalizeSocialMetadata(fallback.data, url)
  }

  return null
}
