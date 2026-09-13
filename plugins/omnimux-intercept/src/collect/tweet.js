/**
 * @file 领域实体与原始记录归一 —— 把外部世界的脏 JSON 变成干净 `TweetRecord`。
 *
 * 本文件属 `src/collect/**`，但**是纯函数**：不做任何 I/O，时钟必须由调用方注入 `nowMs`。
 * 采集阶段发现的数据缺陷**不可丢弃**，必须透传到输出层（`anomalies`）。
 */

import { parseMetric, parseMetricWithAnomaly } from './parse-metrics.js'

/**
 * 数据缺陷标记。采集层发现，输出层必须可见（`degraded` 行带 `!` 警示）。
 * @typedef {'VIEWS_MISSING' | 'VIEWS_UNPARSEABLE' | 'CLOCK_SKEW_FUTURE' | 'CREATED_AT_INVALID' | 'AUTHOR_MISSING'} DataAnomaly
 */

/**
 * 推文互动指标。`null` 表示「源未提供」，与 `0` 语义严格区分。
 * @typedef {object} TweetMetrics
 * @property {number | null} views
 * @property {number | null} likes
 * @property {number | null} retweets
 * @property {number | null} replies
 * @property {number | null} bookmarks
 */

/**
 * 采集层的规范实体：所有字段都已是干净类型，下游不再做解析。
 * @typedef {object} TweetRecord
 * @property {string} id
 * @property {string} author
 * @property {string} authorHandle
 * @property {string} text
 * @property {number} createdAtMs epoch ms（UTC），已解析
 * @property {string} url
 * @property {TweetMetrics} metrics
 * @property {boolean} hasMedia
 * @property {string[]} mediaUrls
 * @property {string | null} quotedTweetId
 * @property {'opencli' | 'hub' | 'fixture'} source
 * @property {DataAnomaly[]} anomalies 采集阶段发现的数据缺陷
 */

/** 数据源标识。 @type {ReadonlyArray<'opencli' | 'hub' | 'fixture'>} */
export const SOURCES = Object.freeze(['opencli', 'hub', 'fixture'])

/** 各字段的候选键名（外部载荷字段名不稳定，按优先级取第一个存在者）。 */
const FIELD_ALIASES = Object.freeze({
  id: ['id', 'tweet_id', 'tweetId', 'rest_id', 'restId'],
  author: ['author', 'name', 'author_name', 'authorName', 'display_name', 'displayName'],
  authorHandle: ['authorHandle', 'handle', 'screen_name', 'screenName', 'username', 'user_name', 'author_handle'],
  text: ['text', 'content', 'full_text', 'fullText', 'body'],
  createdAt: ['created_at', 'createdAt', 'created', 'time', 'timestamp', 'date'],
  url: ['url', 'link', 'permalink', 'tweet_url'],
  likes: ['likes', 'like_count', 'likeCount', 'favorites', 'favorite_count', 'favourites'],
  retweets: ['retweets', 'retweet_count', 'retweetCount', 'reposts', 'repost_count', 'shares'],
  replies: ['replies', 'reply_count', 'replyCount', 'comments', 'comment_count'],
  bookmarks: ['bookmarks', 'bookmark_count', 'bookmarkCount'],
  views: ['views', 'view_count', 'viewCount', 'views_count', 'impressions', 'impression_count'],
  hasMedia: ['has_media', 'hasMedia', 'media_present'],
  mediaUrls: ['media_urls', 'mediaUrls', 'media', 'photos'],
  quotedTweet: ['quoted_tweet', 'quotedTweet', 'quoted_tweet_id', 'quotedTweetId', 'quoted_status_id'],
})

/** 相对时间中「秒」的换算。 */
const RELATIVE_UNITS = Object.freeze({
  秒: 1_000,
  分钟: 60_000,
  分: 60_000,
  小时: 3_600_000,
  时: 3_600_000,
  天: 86_400_000,
  日: 86_400_000,
  周: 604_800_000,
  个月: 2_592_000_000,
  月: 2_592_000_000,
})

/** 英文相对时间单位 → 毫秒。 */
const RELATIVE_UNITS_EN = Object.freeze({
  s: 1_000,
  sec: 1_000,
  secs: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
})

/** 月份缩写 → `0..11`。 */
const MONTHS = Object.freeze({
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
})

const RELATIVE_ZH = /^(\d+(?:\.\d+)?)\s*(个月|分钟|小时|秒|分|时|天|日|周|月)\s*前$/
const RELATIVE_EN = /^(\d+(?:\.\d+)?)\s*(seconds|second|secs|sec|minutes|minute|mins|min|hours|hour|hrs|hr|days|day|weeks|week|s|m|h|d|w)$/i
const INSTANT = /^(刚刚|刚刚发布|now|just now|right now)$/i
const MONTH_DAY = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,\s*(\d{4}))?$/

/**
 * 从原始记录中按候选键名取第一个「存在且非空」的字段值。
 * @param {unknown} raw 原始记录
 * @param {string[]} keys 候选键名（按优先级）
 * @returns {unknown} 字段值，未命中返回 `undefined`
 */
export function pickField(raw, keys) {
  if (raw === null || typeof raw !== 'object') return undefined
  const source = /** @type {Record<string, unknown>} */ (raw)
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue
    const value = source[key]
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && value.trim() === '') continue
    return value
  }
  return undefined
}

/**
 * 解析创建时间。支持 epoch（秒/毫秒）、ISO 8601、中文相对时间（`N 分钟前`）、
 * 英文相对时间（`5m` / `2 hours ago` 的数字部分）与 `Sep 13[, 2026]`。
 *
 * 相对时间的基准必须是**注入的 `nowMs`**，禁止使用真实时钟。
 * @param {unknown} raw 原始时间字段
 * @param {number} nowMs 当前时刻（epoch ms，显式注入）
 * @returns {{ createdAtMs: number, anomaly: DataAnomaly | null, clockSkew: boolean }}
 */
export function parseCreatedAt(raw, nowMs) {
  const now = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : 0

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // 10 位数字按秒处理（epoch 秒），13 位按毫秒。
    const ms = raw < 1e12 ? raw * 1_000 : raw
    return finish(ms, now)
  }

  if (typeof raw !== 'string') {
    return { createdAtMs: now, anomaly: 'CREATED_AT_INVALID', clockSkew: false }
  }

  const text = raw.trim()
  if (text === '') {
    return { createdAtMs: now, anomaly: 'CREATED_AT_INVALID', clockSkew: false }
  }

  if (/^\d+$/.test(text)) {
    const numeric = Number(text)
    if (Number.isFinite(numeric)) {
      const ms = numeric < 1e12 ? numeric * 1_000 : numeric
      return finish(ms, now)
    }
  }

  if (INSTANT.test(text)) return finish(now, now)

  const relative = RELATIVE_ZH.exec(text)
  if (relative) {
    const amount = Number(relative[1])
    const unit = RELATIVE_UNITS[/** @type {keyof typeof RELATIVE_UNITS} */ (relative[2])]
    if (Number.isFinite(amount) && typeof unit === 'number') {
      return finish(now - amount * unit, now)
    }
  }

  const relativeEn = RELATIVE_EN.exec(text.replace(/\s+ago$/i, ''))
  if (relativeEn) {
    const amount = Number(relativeEn[1])
    const unit = RELATIVE_UNITS_EN[
      /** @type {keyof typeof RELATIVE_UNITS_EN} */ (relativeEn[2]?.toLowerCase())
    ]
    if (Number.isFinite(amount) && typeof unit === 'number') {
      return finish(now - amount * unit, now)
    }
  }

  const monthDay = MONTH_DAY.exec(text)
  if (monthDay) {
    const month = MONTHS[/** @type {keyof typeof MONTHS} */ (monthDay[1]?.toLowerCase())]
    const day = Number(monthDay[2])
    const year = monthDay[3] ? Number(monthDay[3]) : new Date(now).getUTCFullYear()
    if (typeof month === 'number' && Number.isInteger(day)) {
      return finish(Date.UTC(year, month, day), now)
    }
  }

  const parsedIso = Date.parse(text)
  if (Number.isFinite(parsedIso)) return finish(parsedIso, now)

  return { createdAtMs: now, anomaly: 'CREATED_AT_INVALID', clockSkew: false }
}

/**
 * 收口：把候选时间戳归一并判定时钟偏移。
 * @param {number} candidateMs 候选时间戳
 * @param {number} nowMs 当前时刻
 * @returns {{ createdAtMs: number, anomaly: DataAnomaly | null, clockSkew: boolean }}
 */
function finish(candidateMs, nowMs) {
  if (!Number.isFinite(candidateMs)) {
    return { createdAtMs: nowMs, anomaly: 'CREATED_AT_INVALID', clockSkew: false }
  }
  if (candidateMs > nowMs) {
    return { createdAtMs: candidateMs, anomaly: 'CLOCK_SKEW_FUTURE', clockSkew: true }
  }
  return { createdAtMs: candidateMs, anomaly: null, clockSkew: false }
}

/**
 * 布尔字段归一（容忍 `true` / `'true'` / `1` / `'yes'`）。
 * @param {unknown} value
 * @returns {boolean}
 */
export function toBooleanish(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase()
    return text === 'true' || text === '1' || text === 'yes' || text === 'y'
  }
  return false
}

/**
 * 字符串数组归一（容忍数组、逗号分隔串、单一对象）。
 * @param {unknown} value
 * @returns {string[]}
 */
export function toStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item !== '')
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '')
  }
  return []
}

/**
 * 非空字符串归一。
 * @param {unknown} value
 * @returns {string}
 */
function toStringValue(value) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/**
 * 从推文 URL 中抽出作者 handle（`https://x.com/<handle>/status/<id>`）。
 * @param {string} url 推文链接
 * @returns {string}
 */
export function handleFromUrl(url) {
  const match = /(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,50})\//.exec(url)
  return match ? (match[1] ?? '') : ''
}

/**
 * 抽取被引用推文的 id（容忍对象 / 字符串 / 数字三种形态）。
 * @param {unknown} value
 * @returns {string | null}
 */
export function extractQuotedId(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') {
    const nested = pickField(value, FIELD_ALIASES.id)
    const text = toStringValue(nested)
    return text === '' ? null : text
  }
  const text = toStringValue(value)
  return text === '' ? null : text
}

/**
 * 原始记录 → 规范实体（纯函数）。
 *
 * `anomalies` 按码点升序排列，保证同一输入产出**完全一致**的数组（可做快照断言）。
 * @param {unknown} raw 原始记录
 * @param {number} nowMs 当前时刻（epoch ms，显式注入）
 * @param {'opencli' | 'hub' | 'fixture'} source 数据源标识
 * @returns {TweetRecord}
 */
export function buildRecord(raw, nowMs, source) {
  /** @type {DataAnomaly[]} */
  const anomalies = []

  const id = toStringValue(pickField(raw, FIELD_ALIASES.id))
  const url = toStringValue(pickField(raw, FIELD_ALIASES.url))

  const authorRaw = toStringValue(pickField(raw, FIELD_ALIASES.author))
  let authorHandle = toStringValue(pickField(raw, FIELD_ALIASES.authorHandle))
  let author = authorRaw

  if (authorHandle === '' && authorRaw.startsWith('@')) {
    authorHandle = authorRaw.slice(1)
    author = authorRaw
  }
  if (authorHandle === '' && url !== '') authorHandle = handleFromUrl(url)
  if (authorHandle === '' && author !== '') authorHandle = author.replace(/^@/, '')
  if (author === '' && authorHandle !== '') author = `@${authorHandle}`
  if (author === '' && authorHandle === '') anomalies.push('AUTHOR_MISSING')

  const createdAt = parseCreatedAt(pickField(raw, FIELD_ALIASES.createdAt), nowMs)
  if (createdAt.anomaly) anomalies.push(createdAt.anomaly)

  const viewsParsed = parseMetricWithAnomaly(pickField(raw, FIELD_ALIASES.views))
  if (viewsParsed.anomaly) anomalies.push(viewsParsed.anomaly)

  const mediaUrls = toStringArray(pickField(raw, FIELD_ALIASES.mediaUrls))

  return {
    id,
    author,
    authorHandle,
    text: toStringValue(pickField(raw, FIELD_ALIASES.text)),
    createdAtMs: createdAt.createdAtMs,
    url,
    metrics: {
      views: viewsParsed.value,
      likes: parseMetric(pickField(raw, FIELD_ALIASES.likes)),
      retweets: parseMetric(pickField(raw, FIELD_ALIASES.retweets)),
      replies: parseMetric(pickField(raw, FIELD_ALIASES.replies)),
      bookmarks: parseMetric(pickField(raw, FIELD_ALIASES.bookmarks)),
    },
    hasMedia:
      toBooleanish(pickField(raw, FIELD_ALIASES.hasMedia)) || mediaUrls.length > 0,
    mediaUrls,
    quotedTweetId: extractQuotedId(pickField(raw, FIELD_ALIASES.quotedTweet)),
    source,
    anomalies: anomalies.slice().sort(),
  }
}

/**
 * 批量归一。非数组输入返回空数组（空数组只表示「源确实返回了 0 条」）。
 * @param {unknown} rawList 原始记录列表
 * @param {number} nowMs 当前时刻（epoch ms，显式注入）
 * @param {'opencli' | 'hub' | 'fixture'} source 数据源标识
 * @returns {TweetRecord[]}
 */
export function normalizeRecords(rawList, nowMs, source) {
  if (!Array.isArray(rawList)) return []
  return rawList.map((raw) => buildRecord(raw, nowMs, source))
}

/**
 * 判断实体是否存在数据缺陷。
 * @param {TweetRecord} record 规范实体
 * @returns {boolean}
 */
export function isDegraded(record) {
  return Array.isArray(record?.anomalies) && record.anomalies.length > 0
}
