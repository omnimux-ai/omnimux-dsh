/**
 * Empty states, account labels, and sync stamps for dashboard view models.
 */

import {
  CADENCE_BRACKETS,
  DAY_LABELS_EN,
  DAY_LABELS_ZH,
  DECAY_WINDOWS,
  METRIC_DEFS,
  PLATFORM_LABEL,
  PLATFORMS,
  SCHEMA_VERSION,
  SYNC_INTERVAL_MS,
} from './constants.js'
import { grainFor, normalizeQuery } from './formatters.js'

export function emptyCharts(grain = 'week') {
  return {
    postsPerPlatform: { labels: [], platformIds: [], values: [], total: 0 },
    postsOverTime: { grain, total: 0, buckets: [] },
    likesPerPlatform: { labels: [], platformIds: [], values: [], total: 0 },
    likesOverTime: { grain, total: 0, buckets: [] },
  }
}

export function emptyEngagement(grain = 'week') {
  return {
    grain,
    buckets: [],
    labels: [],
    totals: {
      likes: null,
      comments: null,
      shares: null,
      saves: null,
      views: null,
      impressions: null,
      reach: null,
      clicks: null,
      er: null,
    },
    deltas: {},
    series: METRIC_DEFS.map((def) => ({ ...def, points: [] })),
  }
}

export function emptyHeatmap() {
  const cells = []
  for (let i = 0; i < 168; i++) {
    cells.push({
      dayOfWeek: Math.floor(i / 24),
      hour: i % 24,
      score: 0,
      level: 0,
      postCount: 0,
    })
  }
  return {
    cells,
    maxScore: 0,
    recommended: [],
    dayLabelsZh: DAY_LABELS_ZH.slice(),
    dayLabelsEn: DAY_LABELS_EN.slice(),
  }
}

export function emptyFollowers() {
  return { totalFollowers: null, platforms: [], timeline: [] }
}

export function emptyStrategy() {
  const windows = DECAY_WINDOWS.map((win, order) => ({
    order,
    key: win.key,
    labelZh: win.labelZh,
    labelEn: win.labelEn,
    pct: win.key === 'publish' ? 0 : null,
  }))
  return {
    cadence: { brackets: CADENCE_BRACKETS.slice(), series: [], optimal: [] },
    accumulation: {
      windows,
      milestones: {
        halfEngagementBy: '',
        eightyPercentWithin: '',
        halfLabelZh: '',
        eightyLabelZh: '',
      },
    },
  }
}

const HINT_TITLES = Object.freeze({
  no_accounts: { titleZh: '尚未绑定社媒账号', titleEn: 'No social accounts connected', action: 'open_accounts' },
  no_posts_in_range: { titleZh: '所选周期内暂无发布数据', titleEn: 'No posts in this range' },
  unauthorized: { titleZh: '登录 OmniMux 以查看数据分析', titleEn: 'Sign in to view analytics', action: 'login' },
  auth_expired: { titleZh: '部分账号授权已过期', titleEn: 'Some accounts need reauthorization', action: 'reauth' },
  network_error: { titleZh: '数据同步失败，已保留上次快照', titleEn: 'Sync failed; last snapshot kept', action: 'retry' },
})

export function emptyHint(code, extra = {}) {
  const meta = HINT_TITLES[code] || {}
  return { code, ...meta, ...extra }
}

function resolveHandle(row) {
  const username = typeof row.username === 'string' ? row.username.trim() : ''
  if (username) {
    return username.startsWith('@') ? username : `@${username}`
  }
  const display = typeof row.display_name === 'string' ? row.display_name.trim() : ''
  if (display) return display
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  if (name) return name
  return String(row.id)
}

export function accountLabel(row) {
  const handle = resolveHandle(row)
  const platform = PLATFORM_LABEL[row.platform] || row.platform || ''
  if (platform) {
    return `${handle}（${platform}）`
  }
  return handle
}

export function filterAccounts(accounts) {
  return accounts.map((row) => ({
    id: String(row.id),
    label: accountLabel(row),
    platform: row.platform || '',
    status: row.status || 'active',
    expired: row.status === 'expired' || row.status === 'error',
  }))
}

export function authorizedPlatforms(accounts) {
  const seen = new Set()
  for (const row of accounts) {
    const id = String(row.platform || '').toLowerCase()
    if (PLATFORMS.includes(/** @type {any} */ (id))) seen.add(id)
  }
  return [...seen]
}

function checkExpiredHint(accounts) {
  const expired = accounts.filter((row) => row.status === 'expired' || row.status === 'error')
  if (expired.length === 0) return null
  return emptyHint('auth_expired', { affectedAccountIds: expired.map((row) => String(row.id)) })
}

export function emptyStateFor(accounts, postsCount, upstreamError) {
  if (accounts.length === 0) {
    return emptyHint('no_accounts')
  }
  if (upstreamError) {
    return emptyHint('network_error', { detail: upstreamError })
  }
  if (postsCount === 0) {
    return emptyHint('no_posts_in_range')
  }
  return checkExpiredHint(accounts)
}

export function stampMeta(query, accounts, now) {
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

export function stampSync(now, extra = {}) {
  const base = {
    lastSyncedAt: now,
    nextSyncAt: now + SYNC_INTERVAL_MS,
    syncIntervalMs: SYNC_INTERVAL_MS,
    syncing: false,
    lastError: null,
  }
  return Object.assign(base, extra)
}

/**
 * @param {{ query?: Record<string, unknown>, now?: number, code?: string, accounts?: Array<Record<string, unknown>>, affectedAccountIds?: string[] }} [opts]
 */
export function emptyDashboard(opts = {}) {
  const query = normalizeQuery(opts.query)
  const now = opts.now ?? Date.now()
  const accounts = Array.isArray(opts.accounts) ? opts.accounts : []
  const grain = grainFor(query.timeRange)
  const defaultCode = accounts.length === 0 ? 'no_accounts' : null
  const code = opts.code || defaultCode
  const postsCount = code === 'no_accounts' ? null : 0

  return {
    meta: stampMeta(query, accounts, now),
    syncStatus: stampSync(now),
    filtersEcho: query,
    kpi: {
      engagementRate: { value: null },
      totalReach: { value: null },
      totalFollowers: { value: null },
      followerDiff: { value: null },
      postsCount: { value: postsCount },
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
