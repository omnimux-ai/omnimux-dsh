/**
 * Analytics view model constants and configuration frozen in
 * `docs/2026-08-25-frontend-data-contract.md`.
 */

export const SCHEMA_VERSION = '1.0.0'
export const SYNC_INTERVAL_MS = 3_600_000

export const PLATFORMS = /** @type {const} */ (['tiktok', 'twitter', 'youtube', 'instagram'])

export const PLATFORM_LABEL = Object.freeze({
  tiktok: 'TikTok',
  twitter: 'X',
  youtube: 'YouTube',
  instagram: 'Instagram',
})

export const RANGE_DAYS = Object.freeze({
  '7d': 7,
  '30d': 30,
  '90d': 90,
})

export const METRIC_DEFS = Object.freeze([
  { key: 'likes', labelZh: '点赞数', labelEn: 'Likes', color: '#ef4444', yAxis: 0, defaultVisible: true },
  { key: 'comments', labelZh: '评论数', labelEn: 'Comments', color: '#3b82f6', yAxis: 0, defaultVisible: true },
  { key: 'shares', labelZh: '分享数', labelEn: 'Shares', color: '#10b981', yAxis: 0, defaultVisible: true },
  { key: 'saves', labelZh: '收藏数', labelEn: 'Saves', color: '#f59e0b', yAxis: 0, defaultVisible: false },
  { key: 'views', labelZh: '播放/浏览', labelEn: 'Views', color: '#8b5cf6', yAxis: 1, defaultVisible: true },
  { key: 'impressions', labelZh: '曝光量', labelEn: 'Impressions', color: '#06b6d4', yAxis: 0, defaultVisible: false },
  { key: 'reach', labelZh: '触达人数', labelEn: 'Reach', color: '#64748b', yAxis: 0, defaultVisible: false },
  { key: 'clicks', labelZh: '链接点击', labelEn: 'Clicks', color: '#ec4899', yAxis: 0, defaultVisible: false },
  { key: 'er', labelZh: '互动率', labelEn: 'ER', color: '#22c55e', yAxis: 0, dashed: true, defaultVisible: true },
])

export const CADENCE_BRACKETS = /** @type {const} */ (['1-5/wk', '6-10/wk', '11+/wk'])

export const DECAY_WINDOWS = Object.freeze([
  { key: 'publish', labelZh: '发布时', labelEn: 'At publish' },
  { key: '0-6h', labelZh: '0-6小时', labelEn: '0-6h' },
  { key: '6-12h', labelZh: '6-12小时', labelEn: '6-12h' },
  { key: '12-24h', labelZh: '12-24小时', labelEn: '12-24h' },
  { key: '1-2d', labelZh: '1-2天', labelEn: '1-2d' },
  { key: '2-7d', labelZh: '2-7天', labelEn: '2-7d' },
  { key: '7-30d', labelZh: '7-30天', labelEn: '7-30d' },
])

export const DAY_LABELS_ZH = Object.freeze(['周一', '周二', '周三', '周四', '周五', '周六', '周日'])
export const DAY_LABELS_EN = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])

export const DEFAULT_QUERY = Object.freeze({
  tab: 'posting',
  platform: 'all',
  profileId: 'all',
  source: 'all',
  timeRange: '30d',
  searchQuery: '',
})
