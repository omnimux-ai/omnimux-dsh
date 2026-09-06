/**
 * Hub facade: map OmniMux cloud analytics payloads onto the dashboard
 * view model frozen in omnimux-analytics
 * `docs/2026-08-25-frontend-data-contract.md`.
 *
 * Verticals must not import this file. The browser hits Host
 * `/omnimux/analytics/{overview,insights,followers,sync}`.
 */

import { OmnimuxError } from '../media/errors.js'
import { listAccounts } from './accounts.js'
import {
  getBestTimeToPost,
  getContentDecay,
  getDailyMetrics,
  getFollowerStats,
  getPostAnalytics,
  getPostingFrequency,
  syncExternalPosts,
} from './analytics.js'
import { pickAccountsView } from './public-account.js'

export const SCHEMA_VERSION = '1.0.0'
export const SYNC_INTERVAL_MS = 3_600_000

const PLATFORMS = /** @type {const} */ (['tiktok', 'twitter', 'youtube', 'instagram'])

const PLATFORM_LABEL = {
  tiktok: 'TikTok',
  twitter: 'X',
  youtube: 'YouTube',
  instagram: 'Instagram',
}

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 }

const METRIC_DEFS = [
  { key: 'likes', labelZh: '点赞数', labelEn: 'Likes', color: '#ef4444', yAxis: 0, defaultVisible: true },
  { key: 'comments', labelZh: '评论数', labelEn: 'Comments', color: '#3b82f6', yAxis: 0, defaultVisible: true },
  { key: 'shares', labelZh: '分享数', labelEn: 'Shares', color: '#10b981', yAxis: 0, defaultVisible: true },
  { key: 'saves', labelZh: '收藏数', labelEn: 'Saves', color: '#f59e0b', yAxis: 0, defaultVisible: false },
  { key: 'views', labelZh: '播放/浏览', labelEn: 'Views', color: '#8b5cf6', yAxis: 1, defaultVisible: true },
  { key: 'impressions', labelZh: '曝光量', labelEn: 'Impressions', color: '#06b6d4', yAxis: 0, defaultVisible: false },
  { key: 'reach', labelZh: '触达人数', labelEn: 'Reach', color: '#64748b', yAxis: 0, defaultVisible: false },
  { key: 'clicks', labelZh: '链接点击', labelEn: 'Clicks', color: '#ec4899', yAxis: 0, defaultVisible: false },
  { key: 'er', labelZh: '互动率', labelEn: 'ER', color: '#22c55e', yAxis: 0, dashed: true, defaultVisible: true },
]

const CADENCE_BRACKETS = /** @type {const} */ (['1-5/wk', '6-10/wk', '11+/wk'])

const DECAY_WINDOWS = [
  { key: 'publish', labelZh: '发布时', labelEn: 'At publish' },
  { key: '0-6h', labelZh: '0-6小时', labelEn: '0-6h' },
  { key: '6-12h', labelZh: '6-12小时', labelEn: '6-12h' },
  { key: '12-24h', labelZh: '12-24小时', labelEn: '12-24h' },
  { key: '1-2d', labelZh: '1-2天', labelEn: '1-2d' },
  { key: '2-7d', labelZh: '2-7天', labelEn: '2-7d' },
  { key: '7-30d', labelZh: '7-30天', labelEn: '7-30d' },
]

const DAY_LABELS_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const DAY_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const DEFAULT_QUERY = Object.freeze({
  tab: 'posting',
  platform: 'all',
  profileId: 'all',
  source: 'all',
  timeRange: '30d',
  searchQuery: '',
})

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function num(value) {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function roundTo(value, digits) {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

/**
 * Post-list ER: cloud `1.83` means 1.83% → store `0.0183`.
 * Values in (0, 1] are already ratios.
 * @param {unknown} value
 */
export function normalizeErRatio(value) {
  const n = num(value)
  if (n == null) return null
  const ratio = n > 1 ? n / 100 : n
  return roundTo(ratio, 6)
}

/**
 * Cadence chart exception: store percent-points (`2.2` → `2.2%`).
 * Tiny fractions (`0.022`) are treated as ratios and scaled once.
 * @param {unknown} value
 */
export function normalizeErPercentPoints(value) {
  const n = num(value)
  if (n == null) return null
  const points = n > 0 && n <= 0.05 ? n * 100 : n
  return roundTo(points, 4)
}

/**
 * Cloud `day_of_week` 0 = Sunday → dashboard 0 = Monday.
 * @param {number} sundayIndex
 */
export function cloudSundayToMonday(sundayIndex) {
  const d = Number(sundayIndex)
  if (!Number.isInteger(d) || d < 0 || d > 6) return null
  return (d + 6) % 7
}

/**
 * @param {number} score
 * @param {number} maxScore
 */
export function heatmapLevel(score, maxScore) {
  if (!score || score <= 0) return 0
  const ratio = score / (maxScore || 1)
  if (ratio < 0.25) return 1
  if (ratio < 0.50) return 2
  if (ratio < 0.75) return 3
  return 4
}

/**
 * Best-post weight from the frontend contract §0.
 * @param {{ er?: number | null, views?: number | null, shares?: number | null }} row
 */
export function bestPostScore(row) {
  const er = typeof row.er === 'number' ? row.er : 0
  const views = typeof row.views === 'number' ? row.views : 0
  const shares = typeof row.shares === 'number' ? row.shares : 0
  return 0.5 * er + 0.3 * Math.log10(views + 1) + 0.2 * shares
}

/**
 * @param {Date} date
 */
export function ymd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * @param {string} iso
 */
export function parseLocalDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Monday of the week containing `iso` (local calendar).
 * @param {string} iso
 */
export function startOfWeekMonday(iso) {
  const date = parseLocalDate(iso)
  if (!date) return iso
  const day = date.getDay()
  const offset = day === 0 ? 6 : day - 1
  date.setDate(date.getDate() - offset)
  return ymd(date)
}

/**
 * @param {string} iso
 * @param {string} [locale]
 */
export function dateLabel(iso, locale = 'zh-CN') {
  const date = parseLocalDate(iso)
  if (!date) return iso
  const m = date.getMonth() + 1
  const d = date.getDate()
  if (String(locale).toLowerCase().startsWith('en')) return `${m}/${d}`
  return `${m}月${d}日`
}

/**
 * @param {string} iso
 */
export function publishedLabel(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Peel `{ data: { … } }` envelopes the cloud sometimes wraps around.
 * @param {unknown} raw
 */
export function unwrap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const row = /** @type {Record<string, unknown>} */ (raw)
  const data = row.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const inner = /** @type {Record<string, unknown>} */ (data)
    if (
      inner.dailyData || inner.platformBreakdown || inner.slots || inner.frequency
      || inner.buckets || inner.posts || inner.accounts || inner.timeline
      || inner.recommended || inner.optimalCadence || inner.milestones
    ) {
      return inner
    }
  }
  return row
}

function normalizeQuery(query = {}) {
  return {
    ...DEFAULT_QUERY,
    ...query,
    platform: query.platform || 'all',
    profileId: query.profileId || 'all',
    source: query.source || 'all',
    timeRange: RANGE_DAYS[query.timeRange] ? query.timeRange : '30d',
    searchQuery: typeof query.searchQuery === 'string' ? query.searchQuery : '',
    tab: query.tab === 'inbox' ? 'inbox' : 'posting',
  }
}

/**
 * UI query → cloud query. `profileId` on the dashboard is an account id.
 * @param {Record<string, unknown>} query
 * @param {number} [now]
 */
export function buildCloudQuery(query = {}, now = Date.now()) {
  const q = normalizeQuery(query)
  const days = RANGE_DAYS[q.timeRange]
  const end = new Date(now)
  end.setHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  /** @type {Record<string, string | number>} */
  const cloud = {
    fromDate: ymd(start),
    toDate: ymd(end),
    days,
  }
  if (q.platform && q.platform !== 'all') cloud.platform = q.platform
  if (q.profileId && q.profileId !== 'all') {
    cloud.accountIds = String(q.profileId)
    cloud.accountId = String(q.profileId)
  }
  return cloud
}

function grainFor(timeRange) {
  return timeRange === '7d' ? 'day' : 'week'
}

function bucketKey(iso, grain) {
  return grain === 'week' ? startOfWeekMonday(iso) : iso
}

function enumerateBuckets(fromDate, toDate, grain) {
  const start = parseLocalDate(fromDate)
  const end = parseLocalDate(toDate)
  if (!start || !end) return []
  /** @type {string[]} */
  const keys = []
  const seen = new Set()
  const cursor = new Date(start)
  while (cursor <= end) {
    const iso = ymd(cursor)
    const key = bucketKey(iso, grain)
    if (!seen.has(key)) {
      seen.add(key)
      keys.push(key)
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

function engagementOf(metrics = {}) {
  const likes = num(metrics.likes) ?? 0
  const comments = num(metrics.comments) ?? 0
  const shares = num(metrics.shares) ?? 0
  const saves = num(metrics.saves) ?? 0
  return likes + comments + shares + saves
}

function erFromMetrics(metrics = {}) {
  const numer = engagementOf(metrics)
  const views = num(metrics.views)
  const impressions = num(metrics.impressions)
  const reach = num(metrics.reach)
  const denom = views || impressions || reach
  if (!denom) return null
  return roundTo(numer / denom, 6)
}

function metricPresent(rows, key) {
  return rows.some((row) => num(row?.[key]) != null)
}

function sumMetric(rows, key) {
  if (!metricPresent(rows, key)) return null
  return rows.reduce((acc, row) => acc + (num(row?.[key]) ?? 0), 0)
}

function emptyCharts(grain = 'week') {
  return {
    postsPerPlatform: { labels: [], platformIds: [], values: [], total: 0 },
    postsOverTime: { grain, total: 0, buckets: [] },
    likesPerPlatform: { labels: [], platformIds: [], values: [], total: 0 },
    likesOverTime: { grain, total: 0, buckets: [] },
  }
}

function emptyEngagement(grain = 'week') {
  return {
    grain,
    buckets: [],
    labels: [],
    totals: {
      likes: null, comments: null, shares: null, saves: null,
      views: null, impressions: null, reach: null, clicks: null, er: null,
    },
    deltas: {},
    series: METRIC_DEFS.map((def) => ({ ...def, points: [] })),
  }
}

function emptyHeatmap() {
  return {
    cells: Array.from({ length: 168 }, (_, i) => ({
      dayOfWeek: Math.floor(i / 24),
      hour: i % 24,
      score: 0,
      level: 0,
      postCount: 0,
    })),
    maxScore: 0,
    recommended: [],
    dayLabelsZh: DAY_LABELS_ZH.slice(),
    dayLabelsEn: DAY_LABELS_EN.slice(),
  }
}

function emptyFollowers() {
  return { totalFollowers: null, platforms: [], timeline: [] }
}

function emptyStrategy() {
  return {
    cadence: { brackets: CADENCE_BRACKETS.slice(), series: [], optimal: [] },
    accumulation: {
      windows: DECAY_WINDOWS.map((win, order) => ({
        order,
        key: win.key,
        labelZh: win.labelZh,
        labelEn: win.labelEn,
        pct: win.key === 'publish' ? 0 : null,
      })),
      milestones: {
        halfEngagementBy: '',
        eightyPercentWithin: '',
        halfLabelZh: '',
        eightyLabelZh: '',
      },
    },
  }
}

function emptyHint(code, extra = {}) {
  const titles = {
    no_accounts: { titleZh: '尚未绑定社媒账号', titleEn: 'No social accounts connected', action: 'open_accounts' },
    no_posts_in_range: { titleZh: '所选周期内暂无发布数据', titleEn: 'No posts in this range' },
    unauthorized: { titleZh: '登录 OmniMux 以查看数据分析', titleEn: 'Sign in to view analytics', action: 'login' },
    auth_expired: { titleZh: '部分账号授权已过期', titleEn: 'Some accounts need reauthorization', action: 'reauth' },
    network_error: { titleZh: '数据同步失败，已保留上次快照', titleEn: 'Sync failed; last snapshot kept', action: 'retry' },
  }
  return { code, ...(titles[code] || {}), ...extra }
}

function accountLabel(row) {
  const username = typeof row.username === 'string' ? row.username.trim() : ''
  const display = typeof row.display_name === 'string' ? row.display_name.trim() : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const handle = username
    ? (username.startsWith('@') ? username : `@${username}`)
    : (display || name || String(row.id))
  const platform = PLATFORM_LABEL[row.platform] || row.platform || ''
  return platform ? `${handle}（${platform}）` : handle
}

function filterAccounts(accounts) {
  return accounts.map((row) => ({
    id: String(row.id),
    label: accountLabel(row),
    platform: row.platform || '',
    status: row.status || 'active',
    expired: row.status === 'expired' || row.status === 'error',
  }))
}

function authorizedPlatforms(accounts) {
  const seen = new Set()
  for (const row of accounts) {
    const id = String(row.platform || '').toLowerCase()
    if (PLATFORMS.includes(/** @type {any} */ (id))) seen.add(id)
  }
  return [...seen]
}

/**
 * @param {{ query?: Record<string, unknown>, now?: number, code?: string, accounts?: Array<Record<string, unknown>> }} opts
 */
export function emptyDashboard(opts = {}) {
  const query = normalizeQuery(opts.query)
  const now = opts.now ?? Date.now()
  const accounts = Array.isArray(opts.accounts) ? opts.accounts : []
  const grain = grainFor(query.timeRange)
  const code = opts.code || (accounts.length === 0 ? 'no_accounts' : null)
  return {
    meta: {
      generatedAt: new Date(now).toISOString(),
      schemaVersion: SCHEMA_VERSION,
      locale: 'zh-CN',
      boundAccountCount: accounts.length,
      authorizedPlatforms: authorizedPlatforms(accounts),
      reachApprox: false,
      filterAccounts: filterAccounts(accounts),
    },
    syncStatus: {
      lastSyncedAt: now,
      nextSyncAt: now + SYNC_INTERVAL_MS,
      syncIntervalMs: SYNC_INTERVAL_MS,
      syncing: false,
      lastError: null,
    },
    filtersEcho: query,
    kpi: {
      engagementRate: { value: null },
      totalReach: { value: null },
      totalFollowers: { value: null },
      followerDiff: { value: null },
      postsCount: { value: code === 'no_accounts' ? null : 0 },
      postsHealth: 'none',
      bestPost: null,
    },
    basicCharts: emptyCharts(grain),
    engagementOverTime: emptyEngagement(grain),
    heatmap: emptyHeatmap(),
    followerEvolution: emptyFollowers(),
    platformBreakdown: [],
    topPosts: [],
    strategy: emptyStrategy(),
    emptyState: code ? emptyHint(code, { affectedAccountIds: opts.affectedAccountIds }) : null,
  }
}

/**
 * @param {unknown} raw
 * @param {{ fromDate: string, toDate: string, grain: 'day' | 'week', locale?: string }} opts
 */
export function mapDailyMetrics(raw, opts) {
  const body = unwrap(raw) || {}
  const daily = Array.isArray(body.dailyData) ? body.dailyData : []
  const grain = opts.grain
  const buckets = enumerateBuckets(opts.fromDate, opts.toDate, grain)
  const locale = opts.locale || 'zh-CN'

  /** @type {Map<string, { postCount: number, metrics: Record<string, number>, platforms: Record<string, number> }>} */
  const byBucket = new Map()
  for (const key of buckets) {
    byBucket.set(key, { postCount: 0, metrics: {}, platforms: {} })
  }
  for (const row of daily) {
    const iso = String(row.date || '').slice(0, 10)
    const key = bucketKey(iso, grain)
    if (!byBucket.has(key)) continue
    const acc = byBucket.get(key)
    acc.postCount += num(row.postCount) ?? 0
    const metrics = row.metrics && typeof row.metrics === 'object' ? row.metrics : {}
    for (const [metric, value] of Object.entries(metrics)) {
      const n = num(value)
      if (n == null) continue
      acc.metrics[metric] = (acc.metrics[metric] ?? 0) + n
    }
    const platforms = row.platforms && typeof row.platforms === 'object' ? row.platforms : {}
    for (const [platform, value] of Object.entries(platforms)) {
      const n = num(value)
      if (n == null) continue
      acc.platforms[platform] = (acc.platforms[platform] ?? 0) + n
    }
  }

  const metricRows = daily.map((row) => row.metrics || {})
  const totals = {
    likes: sumMetric(metricRows, 'likes'),
    comments: sumMetric(metricRows, 'comments'),
    shares: sumMetric(metricRows, 'shares'),
    saves: sumMetric(metricRows, 'saves'),
    views: sumMetric(metricRows, 'views'),
    impressions: sumMetric(metricRows, 'impressions'),
    reach: sumMetric(metricRows, 'reach'),
    clicks: sumMetric(metricRows, 'clicks'),
  }
  const postsCount = daily.reduce((acc, row) => acc + (num(row.postCount) ?? 0), 0)
  totals.er = erFromMetrics(totals)

  /** @type {Map<string, { posts: number, metrics: Record<string, number | null> }>} */
  const perPlatform = new Map()
  const breakdownSrc = Array.isArray(body.platformBreakdown) ? body.platformBreakdown : []
  if (breakdownSrc.length > 0) {
    for (const row of breakdownSrc) {
      const platform = String(row.platform || '').toLowerCase()
      if (!platform) continue
      const metrics = row.metrics && typeof row.metrics === 'object' ? row.metrics : {}
      perPlatform.set(platform, {
        posts: num(row.postCount) ?? 0,
        metrics: {
          likes: num(metrics.likes),
          comments: num(metrics.comments),
          shares: num(metrics.shares),
          saves: num(metrics.saves),
          clicks: num(metrics.clicks),
          views: num(metrics.views),
          impressions: num(metrics.impressions),
          reach: num(metrics.reach),
          er: normalizeErRatio(metrics.er) ?? erFromMetrics(metrics),
        },
      })
    }
  } else {
    for (const row of daily) {
      const platforms = row.platforms && typeof row.platforms === 'object' ? row.platforms : {}
      for (const [platform, value] of Object.entries(platforms)) {
        const cur = perPlatform.get(platform) || { posts: 0, metrics: {} }
        cur.posts += num(value) ?? 0
        perPlatform.set(platform, cur)
      }
    }
  }

  const platformIds = [...perPlatform.keys()].filter((id) => PLATFORMS.includes(/** @type {any} */ (id)))
  const postsValues = platformIds.map((id) => perPlatform.get(id)?.posts ?? 0)
  const likesValues = platformIds.map((id) => {
    const likes = perPlatform.get(id)?.metrics?.likes
    return likes == null ? null : likes
  })

  const timeBuckets = buckets.map((key) => ({
    key,
    label: dateLabel(key, locale),
    value: byBucket.get(key)?.postCount ?? 0,
  }))
  const likesTime = buckets.map((key) => ({
    key,
    label: dateLabel(key, locale),
    value: metricPresent(metricRows, 'likes') ? (byBucket.get(key)?.metrics.likes ?? 0) : null,
  }))

  const series = METRIC_DEFS.map((def) => {
    const points = buckets.map((key) => {
      const acc = byBucket.get(key)
      if (def.key === 'er') {
        return acc ? erFromMetrics({ ...acc.metrics }) : null
      }
      if (!metricPresent(metricRows, def.key)) return null
      return acc?.metrics[def.key] ?? 0
    })
    return { ...def, points }
  })

  const platformBreakdown = platformIds.map((platform) => {
    const row = perPlatform.get(platform)
    const metrics = row?.metrics || {}
    return {
      platform,
      platformLabel: PLATFORM_LABEL[platform] || platform,
      posts: row?.posts ?? 0,
      likes: metrics.likes ?? null,
      comments: metrics.comments ?? null,
      shares: metrics.shares ?? null,
      saves: metrics.saves ?? null,
      clicks: metrics.clicks ?? null,
      views: metrics.views ?? null,
      impressions: metrics.impressions ?? null,
      reach: metrics.reach ?? null,
      er: metrics.er ?? null,
    }
  })

  return {
    postsCount,
    totals,
    basicCharts: {
      postsPerPlatform: {
        labels: platformIds.map((id) => PLATFORM_LABEL[id] || id),
        platformIds,
        values: postsValues,
        total: postsCount,
      },
      postsOverTime: { grain, total: postsCount, buckets: timeBuckets },
      likesPerPlatform: {
        labels: platformIds.map((id) => PLATFORM_LABEL[id] || id),
        platformIds,
        values: likesValues,
        total: totals.likes,
      },
      likesOverTime: { grain, total: totals.likes, buckets: likesTime },
    },
    engagementOverTime: {
      grain,
      buckets,
      labels: buckets.map((key) => dateLabel(key, locale)),
      totals,
      deltas: {},
      series,
    },
    platformBreakdown,
  }
}

/**
 * @param {unknown} raw
 */
export function mapPosts(raw) {
  const body = unwrap(raw) || {}
  const list = Array.isArray(body.posts)
    ? body.posts
    : Array.isArray(body)
      ? body
      : []
  const rows = list.map((item) => {
    const analytics = item.analytics && typeof item.analytics === 'object' ? item.analytics : {}
    const platform = String(item.platform || '').toLowerCase()
    const publishedAt = typeof item.publishedAt === 'string'
      ? item.publishedAt
      : (typeof item.published_at === 'string' ? item.published_at : '')
    const title = String(item.content || item.title || item.caption || item.postId || item.id || '')
    const permalink = [item.permalink, item.url, item.postUrl, item.detailHref, analytics.url]
      .find((value) => typeof value === 'string' && /^https:\/\//i.test(value))
    const cover = [item.coverUrl, item.cover_url, item.thumbnail, item.image, analytics.coverUrl]
      .find((value) => typeof value === 'string' && value !== '')
    const er = normalizeErRatio(analytics.engagementRate ?? analytics.er ?? item.er)
    const views = num(analytics.views ?? item.views)
    const shares = num(analytics.shares ?? item.shares)
    const row = {
      postId: String(item.postId || item.id || ''),
      platform,
      title,
      publishedAt,
      publishedLabel: publishedAt ? publishedLabel(publishedAt) : '',
      coverUrl: typeof cover === 'string' ? cover : null,
      likes: num(analytics.likes ?? item.likes),
      comments: num(analytics.comments ?? item.comments),
      shares,
      saves: num(analytics.saves ?? item.saves),
      clicks: num(analytics.clicks ?? item.clicks),
      views,
      follows: num(analytics.follows ?? item.follows),
      impressions: num(analytics.impressions ?? item.impressions),
      reach: num(analytics.reach ?? item.reach),
      er,
      detailHref: typeof permalink === 'string' ? permalink : null,
    }
    row.score = bestPostScore(row)
    return row
  }).filter((row) => row.postId)

  rows.sort((a, b) => {
    const score = (b.score ?? 0) - (a.score ?? 0)
    if (score !== 0) return score
    return (b.views ?? 0) - (a.views ?? 0)
  })
  return rows
}

/**
 * @param {ReturnType<typeof mapPosts>} posts
 * @param {ReturnType<typeof mapDailyMetrics>} daily
 * @param {{ totalFollowers?: number | null, followerDiff?: number | null }} followers
 */
export function deriveKpi(posts, daily, followers = {}) {
  const postsCount = daily.postsCount
  const totals = daily.totals || {}
  const best = posts[0] || null
  let health = 'none'
  if (postsCount > 0) {
    const latest = posts.reduce((acc, row) => {
      const t = Date.parse(row.publishedAt)
      return Number.isFinite(t) && t > acc ? t : acc
    }, 0)
    const staleMs = 14 * 24 * 60 * 60 * 1000
    health = latest && (Date.now() - latest) > staleMs ? 'stale' : 'normal'
  }
  return {
    engagementRate: { value: totals.er ?? null },
    totalReach: { value: totals.reach ?? null },
    totalFollowers: { value: followers.totalFollowers ?? null },
    followerDiff: { value: followers.followerDiff ?? null },
    postsCount: { value: postsCount },
    postsHealth: health,
    bestPost: best
      ? {
          postId: best.postId,
          platform: best.platform,
          title: best.title,
          coverLabel: best.title ? String(best.title).slice(0, 8) : null,
          coverUrl: best.coverUrl,
          views: best.views,
          er: best.er,
          publishedAt: best.publishedAt,
          detailHref: best.detailHref || '#omnimux-analytics-top-posts',
        }
      : null,
  }
}

/**
 * @param {unknown} raw
 */
export function mapHeatmap(raw) {
  const body = unwrap(raw) || {}
  const slots = Array.isArray(body.slots) ? body.slots : []
  const cells = emptyHeatmap().cells
  let maxScore = 0
  for (const slot of slots) {
    const day = cloudSundayToMonday(slot.day_of_week ?? slot.dayOfWeek)
    const hour = Number(slot.hour)
    if (day == null || !Number.isInteger(hour) || hour < 0 || hour > 23) continue
    const score = num(slot.avg_engagement ?? slot.score) ?? 0
    const postCount = num(slot.post_count ?? slot.postCount) ?? 0
    if (score > maxScore) maxScore = score
    cells[day * 24 + hour] = { dayOfWeek: day, hour, score, level: 0, postCount }
  }
  for (const cell of cells) cell.level = heatmapLevel(cell.score, maxScore)

  const recommendedSrc = Array.isArray(body.recommended) ? body.recommended : []
  const recommended = recommendedSrc.map((item) => {
    const day = cloudSundayToMonday(item.day_of_week ?? item.dayOfWeek)
    const hour = Number(item.hour)
    const score = num(item.score) ?? 0
    if (day == null || !Number.isInteger(hour)) return null
    const hh = String(hour).padStart(2, '0')
    return {
      dayOfWeek: day,
      hour,
      score,
      labelZh: `${DAY_LABELS_ZH[day]} ${hh}:00 · 互动指数 ${score}`,
      labelEn: `${DAY_LABELS_EN[day]} ${hh}:00 · score ${score}`,
    }
  }).filter(Boolean)

  if (recommended.length === 0) {
    const ranked = cells.filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 3)
    for (const cell of ranked) {
      const hh = String(cell.hour).padStart(2, '0')
      recommended.push({
        dayOfWeek: cell.dayOfWeek,
        hour: cell.hour,
        score: cell.score,
        labelZh: `${DAY_LABELS_ZH[cell.dayOfWeek]} ${hh}:00 · 互动指数 ${cell.score}`,
        labelEn: `${DAY_LABELS_EN[cell.dayOfWeek]} ${hh}:00 · score ${cell.score}`,
      })
    }
  }

  return {
    cells,
    maxScore,
    recommended,
    dayLabelsZh: DAY_LABELS_ZH.slice(),
    dayLabelsEn: DAY_LABELS_EN.slice(),
  }
}

/**
 * @param {unknown} raw
 */
export function mapCadence(raw) {
  const body = unwrap(raw) || {}
  const frequency = Array.isArray(body.frequency) ? body.frequency : []
  /** @type {Map<string, Array<number | null>>} */
  const byPlatform = new Map()
  for (const row of frequency) {
    const platform = String(row.platform || '').toLowerCase()
    if (!platform) continue
    const bracket = String(row.posts_per_week || row.bracket || '')
    const idx = CADENCE_BRACKETS.indexOf(/** @type {any} */ (bracket))
    if (idx < 0) continue
    const series = byPlatform.get(platform) || CADENCE_BRACKETS.map(() => null)
    series[idx] = normalizeErPercentPoints(row.avg_engagement_rate ?? row.er)
    byPlatform.set(platform, series)
  }
  const series = [...byPlatform.entries()].map(([platform, erPercentPoints]) => ({
    platform,
    erPercentPoints,
  }))

  const optimalSrc = body.optimalCadence && typeof body.optimalCadence === 'object'
    ? body.optimalCadence
    : {}
  /** @type {Array<Record<string, unknown>>} */
  const optimal = []
  for (const [platform, info] of Object.entries(optimalSrc)) {
    const row = info && typeof info === 'object' ? /** @type {Record<string, unknown>} */ (info) : {}
    const bracket = String(row.recommendation || row.bracket || '')
    const erPercent = normalizeErPercentPoints(row.er)
    const label = PLATFORM_LABEL[platform] || platform
    optimal.push({
      platform,
      bracket,
      erPercent,
      labelZh: `${label} ${bracket.replace('/wk', '篇/周')} · 互动率 ${erPercent ?? '-'}%`,
      labelEn: `${label} ${bracket} · ER ${erPercent ?? '-'}%`,
    })
  }
  if (optimal.length === 0) {
    for (const item of series) {
      let bestIdx = -1
      let best = -1
      item.erPercentPoints.forEach((value, idx) => {
        if (typeof value === 'number' && value > best) {
          best = value
          bestIdx = idx
        }
      })
      if (bestIdx >= 0) {
        const bracket = CADENCE_BRACKETS[bestIdx]
        const label = PLATFORM_LABEL[item.platform] || item.platform
        optimal.push({
          platform: item.platform,
          bracket,
          erPercent: best,
          labelZh: `${label} ${bracket.replace('/wk', '篇/周')} · 互动率 ${best}%`,
          labelEn: `${label} ${bracket} · ER ${best}%`,
        })
      }
    }
  }
  return {
    brackets: CADENCE_BRACKETS.slice(),
    series,
    optimal,
  }
}

/**
 * @param {unknown} raw
 */
export function mapDecay(raw) {
  const body = unwrap(raw) || {}
  const incoming = Array.isArray(body.buckets) ? body.buckets : []
  const byKey = new Map()
  for (const row of incoming) {
    const key = String(row.bucket_label || row.key || '')
    byKey.set(key, num(row.avg_pct_of_final ?? row.pct))
  }
  const windows = DECAY_WINDOWS.map((win, order) => ({
    order,
    key: win.key,
    labelZh: win.labelZh,
    labelEn: win.labelEn,
    pct: win.key === 'publish' ? (byKey.has('publish') ? byKey.get('publish') : 0) : (byKey.has(win.key) ? byKey.get(win.key) : null),
  }))
  const milestonesSrc = body.milestones && typeof body.milestones === 'object' ? body.milestones : {}
  const half = String(milestonesSrc.half_engagement_by || milestonesSrc.halfEngagementBy || '')
  const eighty = String(milestonesSrc.eighty_percent_within || milestonesSrc.eightyPercentWithin || '')
  const pick = (threshold) => {
    const hit = windows.find((w) => typeof w.pct === 'number' && w.pct >= threshold)
    return hit ? hit.key : ''
  }
  const halfKey = half || pick(50)
  const eightyKey = eighty || pick(80)
  const labelOf = (key) => DECAY_WINDOWS.find((w) => w.key === key)?.labelZh || key
  return {
    windows,
    milestones: {
      halfEngagementBy: halfKey,
      eightyPercentWithin: eightyKey,
      halfLabelZh: halfKey ? `半数互动在发布后 ${labelOf(halfKey)}内产生` : '',
      eightyLabelZh: eightyKey ? `80% 互动集中在 ${labelOf(eightyKey)}长尾期` : '',
    },
  }
}

/**
 * @param {unknown} raw
 */
export function mapFollowers(raw) {
  const body = unwrap(raw) || {}
  const accounts = Array.isArray(body.accounts) ? body.accounts : []
  const idToPlatform = new Map()
  for (const row of accounts) {
    if (row.accountId && row.platform) idToPlatform.set(String(row.accountId), String(row.platform).toLowerCase())
  }
  const current = accounts.reduce((acc, row) => acc + (num(row.currentFollowers) ?? 0), 0)
  const growth = accounts.reduce((acc, row) => acc + (num(row.growth) ?? 0), 0)
  const platforms = [...new Set(accounts.map((row) => String(row.platform || '').toLowerCase()).filter(Boolean))]
  const timelineSrc = Array.isArray(body.timeline) ? body.timeline : []
  const timeline = timelineSrc.map((point) => {
    const date = String(point.date || '').slice(0, 10)
    const src = point.breakdown && typeof point.breakdown === 'object' ? point.breakdown : {}
    /** @type {Record<string, number | null>} */
    const breakdown = {}
    for (const [key, value] of Object.entries(src)) {
      const platform = idToPlatform.get(key) || (PLATFORMS.includes(/** @type {any} */ (key)) ? key : null)
      if (!platform) continue
      const n = num(value)
      breakdown[platform] = (breakdown[platform] ?? 0) + (n ?? 0)
    }
    return {
      date,
      label: dateLabel(date),
      total: num(point.total),
      breakdown,
    }
  })
  return {
    totalFollowers: accounts.length ? current : (timeline.at(-1)?.total ?? null),
    followerDiff: accounts.length ? growth : null,
    platforms,
    timeline,
  }
}

function resolveAccounts(raw) {
  return pickAccountsView(raw).accounts
}

async function loadAccounts(client) {
  const raw = await listAccounts(client, { provider: 'zernio' })
  return resolveAccounts(raw)
}

/**
 * Cloud 502/404 must not blank the dashboard. Auth errors still bubble to 401.
 * @param {Promise<unknown>} promise
 * @param {string} [label]
 */
export async function settleCloud(promise, label = 'cloud') {
  try {
    return { ok: true, value: await promise, error: null, label }
  } catch (caught) {
    if (caught instanceof OmnimuxError && caught.code === 'needs-omnimux') throw caught
    const error = caught instanceof Error ? caught.message : String(caught)
    try { console.warn(`[omnimux-analytics] ${label} failed: ${error}`) } catch {}
    return { ok: false, value: null, error, label }
  }
}

function emptyStateFor(accounts, postsCount, upstreamError) {
  const expired = accounts.filter((row) => row.status === 'expired' || row.status === 'error')
  if (accounts.length === 0) return emptyHint('no_accounts')
  if (upstreamError) return emptyHint('network_error', { detail: upstreamError })
  if (postsCount === 0) return emptyHint('no_posts_in_range')
  if (expired.length > 0) {
    return emptyHint('auth_expired', { affectedAccountIds: expired.map((row) => String(row.id)) })
  }
  return null
}

function stampMeta(query, accounts, now) {
  return {
    generatedAt: new Date(now).toISOString(),
    schemaVersion: SCHEMA_VERSION,
    locale: 'zh-CN',
    boundAccountCount: accounts.length,
    authorizedPlatforms: authorizedPlatforms(accounts),
    reachApprox: false,
    filterAccounts: filterAccounts(accounts),
  }
}

function stampSync(now, extra = {}) {
  return {
    lastSyncedAt: extra.lastSyncedAt ?? now,
    nextSyncAt: extra.nextSyncAt ?? now + SYNC_INTERVAL_MS,
    syncIntervalMs: extra.syncIntervalMs ?? SYNC_INTERVAL_MS,
    syncing: false,
    lastError: extra.lastError ?? null,
  }
}

/**
 * @param {{ withPat: Function }} client
 * @param {Record<string, unknown>} [uiQuery]
 * @param {{ now?: number }} [opts]
 */
export async function aggregateOverview(client, uiQuery = {}, opts = {}) {
  const now = opts.now ?? Date.now()
  const query = normalizeQuery(uiQuery)
  const cloud = buildCloudQuery(query, now)
  const accounts = await loadAccounts(client)
  if (accounts.length === 0) return emptyDashboard({ query, now, accounts, code: 'no_accounts' })

  const [dailyRes, postsRes] = await Promise.all([
    settleCloud(getDailyMetrics(client, cloud), 'daily-metrics'),
    settleCloud(getPostAnalytics(client, {
      ...cloud,
      sortBy: 'engagement',
      sortOrder: 'desc',
      limit: 50,
    }), 'posts'),
  ])
  const daily = mapDailyMetrics(dailyRes.value, {
    fromDate: String(cloud.fromDate),
    toDate: String(cloud.toDate),
    grain: grainFor(query.timeRange),
  })
  const topPosts = postsRes.ok ? mapPosts(postsRes.value) : []
  const kpi = deriveKpi(topPosts, daily, {})
  const upstreamError = [dailyRes, postsRes]
    .filter((row) => !row.ok)
    .map((row) => `${row.label}: ${row.error}`)
    .join('; ')
  const emptyState = emptyStateFor(accounts, daily.postsCount, upstreamError)
  return {
    meta: stampMeta(query, accounts, now),
    syncStatus: stampSync(now, { lastError: upstreamError || null }),
    filtersEcho: query,
    kpi,
    basicCharts: daily.basicCharts,
    engagementOverTime: daily.engagementOverTime,
    platformBreakdown: daily.platformBreakdown,
    topPosts,
    emptyState,
  }
}

/**
 * @param {{ withPat: Function }} client
 * @param {Record<string, unknown>} [uiQuery]
 * @param {{ now?: number }} [opts]
 */
export async function aggregateInsights(client, uiQuery = {}, opts = {}) {
  const now = opts.now ?? Date.now()
  const query = normalizeQuery(uiQuery)
  const cloud = buildCloudQuery(query, now)
  const [heatRes, freqRes, decayRes] = await Promise.all([
    settleCloud(getBestTimeToPost(client, cloud), 'best-time-to-post'),
    settleCloud(getPostingFrequency(client, cloud), 'posting-frequency'),
    settleCloud(getContentDecay(client, cloud), 'content-decay'),
  ])
  return {
    heatmap: mapHeatmap(heatRes.value),
    strategy: {
      cadence: mapCadence(freqRes.value),
      accumulation: mapDecay(decayRes.value),
    },
  }
}

/**
 * @param {{ withPat: Function }} client
 * @param {Record<string, unknown>} [uiQuery]
 * @param {{ now?: number }} [opts]
 */
export async function aggregateFollowers(client, uiQuery = {}, opts = {}) {
  const now = opts.now ?? Date.now()
  const query = normalizeQuery(uiQuery)
  const cloud = buildCloudQuery(query, now)
  const res = await settleCloud(getFollowerStats(client, cloud), 'follower-stats')
  const mapped = mapFollowers(res.value)
  return {
    followerEvolution: {
      totalFollowers: mapped.totalFollowers,
      platforms: mapped.platforms,
      timeline: mapped.timeline,
    },
    kpiPatch: {
      totalFollowers: { value: mapped.totalFollowers },
      followerDiff: { value: mapped.followerDiff },
    },
  }
}

/**
 * @param {{ withPat: Function }} client
 * @param {Record<string, unknown>} [uiQuery]
 * @param {{ now?: number }} [opts]
 */
export async function aggregatePosts(client, uiQuery = {}, opts = {}) {
  const now = opts.now ?? Date.now()
  const query = normalizeQuery(uiQuery)
  const cloud = buildCloudQuery(query, now)
  const res = await settleCloud(getPostAnalytics(client, {
    ...cloud,
    sortBy: 'engagement',
    sortOrder: 'desc',
    limit: 50,
  }), 'posts')
  return { topPosts: res.ok ? mapPosts(res.value) : [] }
}

/**
 * Incremental pull then stamp syncStatus. Does not re-aggregate the dashboard;
 * the client re-fetches overview after a 2xx.
 * @param {{ withPat: Function }} client
 * @param {Record<string, unknown>} [uiQuery]
 * @param {{ now?: number }} [opts]
 */
export async function aggregateSync(client, uiQuery = {}, opts = {}) {
  const now = opts.now ?? Date.now()
  const query = normalizeQuery(uiQuery)
  const body = {}
  if (query.profileId && query.profileId !== 'all') body.accountId = query.profileId
  const raw = await syncExternalPosts(client, body)
  const unwrapped = unwrap(raw) || {}
  const last = num(unwrapped.lastSyncedAt) ?? now
  const interval = num(unwrapped.syncIntervalMs) ?? SYNC_INTERVAL_MS
  return {
    ok: true,
    syncStatus: stampSync(now, {
      lastSyncedAt: last,
      nextSyncAt: last + interval,
      syncIntervalMs: interval,
    }),
  }
}
