/**
 * Cloud API orchestration, degradation handling, and sync pipelines.
 */

import { OmnimuxError } from '../../media/errors.js'
import { listAccounts } from '../accounts.js'
import {
  getBestTimeToPost,
  getContentDecay,
  getDailyMetrics,
  getFollowerStats,
  getPostAnalytics,
  getPostingFrequency,
  syncExternalPosts,
} from '../analytics.js'
import { pickAccountsView } from '../public-account.js'
import { RANGE_DAYS, SYNC_INTERVAL_MS } from './constants.js'
import { grainFor, normalizeQuery, num, unwrap, ymd } from './formatters.js'
import { emptyDashboard, emptyStateFor, stampMeta, stampSync } from './emptyStates.js'
import { mapDailyMetrics } from './dailyMetrics.js'
import { mapPosts } from './postsAggregator.js'
import { deriveKpi } from './kpiCalculator.js'
import { mapHeatmap, mapCadence } from './heatmapGenerator.js'
import { mapDecay, mapFollowers } from './decayFollowers.js'

function calcDateRange(days, now) {
  const end = new Date(now)
  end.setHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  return {
    fromDate: ymd(start),
    toDate: ymd(end),
    days,
  }
}

/**
 * UI query → cloud query. `profileId` on the dashboard is an account id.
 * @param {Record<string, unknown>} [query]
 * @param {number} [now]
 */
export function buildCloudQuery(query = {}, now = Date.now()) {
  const q = normalizeQuery(query)
  const days = RANGE_DAYS[q.timeRange]
  const cloud = calcDateRange(days, now)

  if (q.platform && q.platform !== 'all') {
    cloud.platform = q.platform
  }
  if (q.profileId && q.profileId !== 'all') {
    cloud.accountIds = String(q.profileId)
    cloud.accountId = String(q.profileId)
  }
  return cloud
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
    const value = await promise
    return { ok: true, value, error: null, label }
  } catch (caught) {
    if (caught instanceof OmnimuxError && caught.code === 'needs-omnimux') {
      throw caught
    }
    const error = caught instanceof Error ? caught.message : String(caught)
    try {
      console.warn(`[omnimux-analytics] ${label} failed: ${error}`)
    } catch {}
    return { ok: false, value: null, error, label }
  }
}

function formatUpstreamErrors(results) {
  return results
    .filter((row) => !row.ok)
    .map((row) => `${row.label}: ${row.error}`)
    .join('; ')
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
  if (accounts.length === 0) {
    return emptyDashboard({ query, now, accounts, code: 'no_accounts' })
  }

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
  const upstreamError = formatUpstreamErrors([dailyRes, postsRes])
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
  const topPosts = res.ok ? mapPosts(res.value) : []
  return { topPosts }
}

function resolveSyncTimestamps(unwrapped, now) {
  const last = num(unwrapped.lastSyncedAt)
  const lastSyncedAt = last !== null ? last : now
  const intervalVal = num(unwrapped.syncIntervalMs)
  const syncIntervalMs = intervalVal !== null ? intervalVal : SYNC_INTERVAL_MS
  return {
    lastSyncedAt,
    nextSyncAt: lastSyncedAt + syncIntervalMs,
    syncIntervalMs,
  }
}

/**
 * Incremental pull then stamp syncStatus.
 * @param {{ withPat: Function }} client
 * @param {Record<string, unknown>} [uiQuery]
 * @param {{ now?: number }} [opts]
 */
export async function aggregateSync(client, uiQuery = {}, opts = {}) {
  const now = opts.now ?? Date.now()
  const query = normalizeQuery(uiQuery)
  const body = {}
  if (query.profileId && query.profileId !== 'all') {
    body.accountId = query.profileId
  }
  const raw = await syncExternalPosts(client, body)
  const unwrapped = unwrap(raw) || {}
  const stamps = resolveSyncTimestamps(unwrapped, now)

  return {
    ok: true,
    syncStatus: stampSync(now, stamps),
  }
}
