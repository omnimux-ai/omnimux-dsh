/**
 * Analytics dashboard fetch. Live Host aggregation is the default.
 * Field names match `GET /omnimux/analytics/overview` + insights + followers
 * + posts so the mock fixture stays isomorphic.
 */
import { resolveUseMock } from './defaults.js'
import { applyDashboardQuery, materializeFixture } from './query.js'
import fixture from './mock/dashboard-fixture.json' with { type: 'json' }
import emptyStates from './mock/empty-states.json' with { type: 'json' }

export const HOST_PATHS = Object.freeze({
  overview: '/omnimux/analytics/overview',
  insights: '/omnimux/analytics/insights',
  followers: '/omnimux/analytics/followers',
  posts: '/omnimux/analytics/posts',
  sync: '/omnimux/analytics/sync',
})

const MOCK_LATENCY_MS = 40
const SYNC_LATENCY_MS = 800

export function isQuotaHttpResult(result) {
  if (!result || result.ok) return false
  if (result.status === 402) return true
  const err = result.body && typeof result.body === 'object' ? result.body.error : null
  return err === 'quota-exceeded'
}

export function notifyQuota(result, context) {
  const quota = typeof window !== 'undefined' ? window.__omnimuxQuota : undefined
  if (!quota || typeof quota.notify !== 'function' || !isQuotaHttpResult(result)) return result
  quota.notify({ status: result.status, body: result.body, code: result.body?.error }, context)
  return result
}

export function quotaGuard(fn, context) {
  return (...args) => Promise.resolve(fn(...args)).then((result) => notifyQuota(result, context))
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown, query?: Record<string, string> }} [opts]
 */
export async function analyticsRequest(path, opts = {}) {
  const url = opts.query
    ? `${path}?${new URLSearchParams(opts.query).toString()}`
    : path
  const response = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  let json = {}
  try {
    json = await response.json()
  } catch {
    json = { error: `HTTP ${String(response.status)}` }
  }
  return { ok: response.ok, status: response.status, body: json }
}

/**
 * Wrap a Host write so a 401 pops the hub login gate, then replays once.
 * Mirrors omnimux-accounts `authGuard`.
 * @param {(...args: any[]) => Promise<{ ok: boolean, status: number, body: any }>} fn
 */
export function authGuard(fn) {
  return (...args) => {
    const run = async () => {
      const result = await fn(...args)
      if (result.status !== 401) return result
      const gate = typeof window !== 'undefined' ? /** @type {any} */ (window).__omnimuxAuth : undefined
      if (!gate || typeof gate.ensureLogin !== 'function') return result
      return new Promise((resolve, reject) => {
        gate.ensureLogin({
          kind: 'write',
          onSuccess: () => { fn(...args).then(resolve, reject) },
          onCancel: () => resolve(result),
        })
      })
    }
    return run()
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * @param {Partial<{ tab: string, platform: string, profileId: string, source: string, timeRange: string, searchQuery: string }>} query
 * @param {{ now?: number, variant?: string }} [opts]
 */
export async function fetchDashboardMock(query = {}, opts = {}) {
  await wait(MOCK_LATENCY_MS)
  const variant = opts.variant
  let raw = fixture
  if (variant && emptyStates.variants?.[variant]) {
    const pack = emptyStates.variants[variant]
    raw = pack.meta ? pack : { ...fixture, ...pack, emptyState: pack.emptyState ?? fixture.emptyState }
    if (pack.kpiOverrides) raw = { ...raw, kpi: { ...raw.kpi, ...pack.kpiOverrides } }
    if (pack.syncStatusPatch) raw = { ...raw, syncStatus: { ...raw.syncStatus, ...pack.syncStatusPatch } }
  }
  const materialized = materializeFixture(raw, opts.now ?? Date.now())
  return applyDashboardQuery(materialized, query)
}

function hostQuery(query) {
  const params = {
    platform: query.platform ?? 'all',
    profileId: query.profileId ?? 'all',
    timeRange: query.timeRange ?? '30d',
  }
  if (query.source && query.source !== 'all') params.source = query.source
  return params
}

function throwHttp(result) {
  const error = new Error(String(result.body?.error || `HTTP ${result.status}`))
  error.status = result.status
  throw error
}

function emptyBlock(kind) {
  if (kind === 'heatmap') {
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
      dayLabelsZh: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      dayLabelsEn: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    }
  }
  if (kind === 'strategy') {
    return {
      cadence: { brackets: ['1-5/wk', '6-10/wk', '11+/wk'], series: [], optimal: [] },
      accumulation: { windows: [], milestones: {} },
    }
  }
  return { totalFollowers: null, platforms: [], timeline: [] }
}

/**
 * Live Host fetch. Same field names as the mock fixture.
 * Overview is required; insights / followers / posts degrade to empty blocks.
 * @param {Record<string, string>} query
 */
export async function fetchDashboardLive(query) {
  const quota = typeof window !== 'undefined' ? window.__omnimuxQuota : undefined
  if (quota && typeof quota.ensureQuota === 'function') {
    const gate = await quota.ensureQuota({ capability: 'analytics' })
    if (gate?.ok === false) {
      return applyDashboardQuery({
        meta: { boundAccountCount: 0, authorizedPlatforms: [], filterAccounts: [], reachApprox: false },
        syncStatus: {
          lastSyncedAt: null,
          nextSyncAt: null,
          syncIntervalMs: 3_600_000,
          syncing: false,
          lastError: 'quota-exceeded',
        },
        kpi: {
          engagementRate: { value: null },
          totalReach: { value: null },
          totalFollowers: { value: null },
          followerDiff: { value: null },
          postsCount: { value: null },
          postsHealth: 'none',
          bestPost: null,
        },
        basicCharts: { postsPerPlatform: { labels: [], platformIds: [], values: [], total: 0 }, postsOverTime: { grain: 'week', total: 0, buckets: [] }, likesPerPlatform: { labels: [], platformIds: [], values: [], total: 0 }, likesOverTime: { grain: 'week', total: 0, buckets: [] } },
        engagementOverTime: { grain: 'week', buckets: [], labels: [], totals: {}, deltas: {}, series: [] },
        heatmap: emptyBlock('heatmap'),
        followerEvolution: emptyBlock('followers'),
        platformBreakdown: [],
        topPosts: [],
        strategy: emptyBlock('strategy'),
        emptyState: gate.reason === 'auth'
          ? { code: 'unauthorized', action: 'login' }
          : { code: 'fetch_failed', action: 'retry' },
      }, query)
    }
  }
  const params = hostQuery(query)
  const guarded = quotaGuard(authGuard(analyticsRequest), { capability: 'analytics' })
  const [overview, insights, followers, posts] = await Promise.all([
    guarded(HOST_PATHS.overview, { query: params }),
    guarded(HOST_PATHS.insights, { query: params }),
    guarded(HOST_PATHS.followers, { query: params }),
    guarded(HOST_PATHS.posts, { query: params }),
  ])
  if (!overview.ok) {
    const unauthorized = overview.status === 401
    return applyDashboardQuery({
      meta: { boundAccountCount: 0, authorizedPlatforms: [], filterAccounts: [], reachApprox: false },
      syncStatus: {
        lastSyncedAt: null,
        nextSyncAt: null,
        syncIntervalMs: 3_600_000,
        syncing: false,
        lastError: String(overview.body?.error || `HTTP ${overview.status}`),
      },
      kpi: {
        engagementRate: { value: null },
        totalReach: { value: null },
        totalFollowers: { value: null },
        followerDiff: { value: null },
        postsCount: { value: null },
        postsHealth: 'none',
        bestPost: null,
      },
      basicCharts: { postsPerPlatform: { labels: [], platformIds: [], values: [], total: 0 }, postsOverTime: { grain: 'week', total: 0, buckets: [] }, likesPerPlatform: { labels: [], platformIds: [], values: [], total: 0 }, likesOverTime: { grain: 'week', total: 0, buckets: [] } },
      engagementOverTime: { grain: 'week', buckets: [], labels: [], totals: {}, deltas: {}, series: [] },
      heatmap: emptyBlock('heatmap'),
      followerEvolution: emptyBlock('followers'),
      platformBreakdown: [],
      topPosts: [],
      strategy: emptyBlock('strategy'),
      emptyState: unauthorized
        ? { code: 'unauthorized', action: 'login' }
        : { code: 'fetch_failed', action: 'retry' },
    }, query)
  }
  const kpi = { ...(overview.body?.kpi || {}) }
  if (followers.ok && followers.body?.kpiPatch) Object.assign(kpi, followers.body.kpiPatch)
  const payload = {
    ...overview.body,
    kpi,
    heatmap: insights.ok ? (insights.body?.heatmap ?? overview.body?.heatmap) : emptyBlock('heatmap'),
    strategy: insights.ok ? (insights.body?.strategy ?? overview.body?.strategy) : emptyBlock('strategy'),
    followerEvolution: followers.ok
      ? (followers.body?.followerEvolution ?? overview.body?.followerEvolution)
      : emptyBlock('followers'),
    topPosts: posts.ok
      ? (posts.body?.topPosts ?? overview.body?.topPosts)
      : (overview.body?.topPosts ?? []),
  }
  const BLOCK_LABEL = {
    insights: '热力图 / 策略分析',
    followers: '粉丝演进',
    posts: '爆款排行',
    overview: '核心指标',
  }
  const failed = [
    !insights.ok && { key: 'insights', status: insights.status, error: insights.body?.error },
    !followers.ok && { key: 'followers', status: followers.status, error: followers.body?.error },
    !posts.ok && { key: 'posts', status: posts.status, error: posts.body?.error },
  ].filter(Boolean)
  if (failed.length) {
    const names = failed.map((row) => BLOCK_LABEL[row.key] || row.key).join('、')
    const detail = `未拉到：${names}（${failed.map((row) => `${row.key} ${row.status}${row.error ? ` ${row.error}` : ''}`).join('；')}）`
    const unauthorized = failed.some((row) => row.status === 401)
    if (!payload.emptyState || payload.emptyState.code === 'network_error') {
      payload.emptyState = {
        code: unauthorized ? 'unauthorized' : 'network_error',
        action: unauthorized ? 'login' : 'retry',
        detail: payload.emptyState?.detail ? `${payload.emptyState.detail}；${detail}` : detail,
      }
    }
    payload.syncStatus = {
      ...(payload.syncStatus || {}),
      lastError: detail,
    }
  }
  return applyDashboardQuery(payload, query)
}

/**
 * Bound accounts for the FilterBar. Browser-safe Host list — never the hub client.
 */
export async function fetchAccounts() {
  const result = await quotaGuard(authGuard(analyticsRequest), { capability: 'analytics' })('/omnimux/accounts?provider=zernio')
  if (!result.ok) throwHttp(result)
  const accounts = Array.isArray(result.body?.accounts) ? result.body.accounts : []
  return accounts.map((row) => ({
    id: String(row.id),
    label: row.username
      ? `${String(row.username).startsWith('@') ? row.username : `@${row.username}`}${row.platform ? `（${row.platform}）` : ''}`
      : String(row.display_name || row.name || row.id),
    platform: row.platform || '',
    status: row.status || 'active',
    expired: row.status === 'expired' || row.status === 'error',
  }))
}

/**
 * @param {Partial<{ tab: string, platform: string, profileId: string, source: string, timeRange: string, searchQuery: string }>} query
 * @param {{ now?: number, variant?: string, useMock?: boolean }} [opts]
 */
export async function fetchDashboard(query = {}, opts = {}) {
  const useMock = resolveUseMock(opts.useMock)
  if (useMock) return fetchDashboardMock(query, opts)
  return fetchDashboardLive(query)
}

/**
 * Incremental sync. Mock path waits 800ms then returns a fresh payload
 * (contract: "立即同步成功后 800ms 内刷新大盘").
 * @param {Partial<{ tab: string, platform: string, profileId: string, source: string, timeRange: string, searchQuery: string }>} query
 * @param {{ now?: number, useMock?: boolean }} [opts]
 */
export async function syncNow(query = {}, opts = {}) {
  const useMock = resolveUseMock(opts.useMock)
  if (useMock) {
    await wait(SYNC_LATENCY_MS)
    const payload = await fetchDashboardMock(query, { now: opts.now ?? Date.now() })
    const now = opts.now ?? Date.now()
    payload.syncStatus = {
      ...payload.syncStatus,
      lastSyncedAt: now,
      nextSyncAt: now + (payload.syncStatus?.syncIntervalMs ?? 3_600_000),
      syncing: false,
      lastError: null,
    }
    return payload
  }
  const quota = typeof window !== 'undefined' ? window.__omnimuxQuota : undefined
  if (quota && typeof quota.ensureQuota === 'function') {
    const gate = await quota.ensureQuota({ capability: 'analytics' })
    if (gate?.ok === false) throw new Error('quota-exceeded')
  }
  const result = await quotaGuard(authGuard(analyticsRequest), { capability: 'analytics' })(HOST_PATHS.sync, { method: 'POST', body: query })
  if (!result.ok) {
    const error = new Error(String(result.body?.error || `HTTP ${result.status}`))
    error.status = result.status
    throw error
  }
  return fetchDashboardLive(query)
}

export { fixture as DASHBOARD_FIXTURE, emptyStates as EMPTY_STATE_FIXTURES }
