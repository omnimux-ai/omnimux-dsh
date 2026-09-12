/**
 * Local aggregation and monitoring for the rival-accounts module.
 *
 * Every function here is pure and takes the rows it needs: computing an
 * account's first-screen profile costs **zero** cloud calls, which is the whole
 * point — the module's budget is spent on refresh only.
 *
 * The monitor is latest-vs-previous, not a time series: `metrics` has no sequence
 * field, so a trend chart is unrepresentable rather than merely unimplemented.
 */

/** @param {unknown} value */
function asArray(value) {
  return Array.isArray(value) ? value : []
}

/** @param {unknown} value */
function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** @param {Record<string, any>[]} rows */
function viewsOf(rows) {
  return asArray(rows).map((row) => num(row?.stats?.views)).filter((value) => value !== null)
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function mean(values) {
  const list = asArray(values)
  if (list.length === 0) return 0
  return Math.round(list.reduce((total, value) => total + value, 0) / list.length)
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function medianOf(values) {
  const list = asArray(values).slice().sort((a, b) => a - b)
  if (list.length === 0) return 0
  const middle = Math.floor(list.length / 2)
  return list.length % 2 === 0 ? Math.round((list[middle - 1] + list[middle]) / 2) : list[middle]
}

/** Days a posting-frequency window looks back over. */
const FREQUENCY_WINDOW_DAYS = 28

/** Activity-level thresholds, in posts per week. */
const ACTIVITY_MEDIUM_PER_WEEK = 1.5
const ACTIVITY_HIGH_PER_WEEK = 4

/** Words too common to describe a niche. */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'this', 'that', 'you', 'your', 'how', 'what',
  'why', 'how', 'new', 'best', 'top', 'vs', 'in', 'on', 'of', 'to', 'is', 'are', 'be', 'my',
  'we', 'it', 'at', 'from', 'by', 'as', 'video', 'shorts', 'short', 'shorts',
])

/**
 * First-screen profile: averages, posting cadence and a keyword-based niche.
 *
 * The niche is a *local* keyword count, labelled as such by its confidence
 * score — it is not an AI classification, and pretending otherwise would make
 * the number unauditable.
 * @param {Record<string, any>[]} rows
 * @param {{ now?: string }} [opts]
 * @returns {{
 *   avg_views: number, median_views: number, avg_likes: number, avg_comments: number,
 *   posting_frequency_per_week: number, activity_level: string,
 *   niche: { primary: string, confidence: number }, computed_at: string,
 * }}
 */
export function computeAnalysis(rows, opts = {}) {
  const list = asArray(rows)
  const views = viewsOf(list)
  const likes = list.map((row) => num(row?.stats?.likes)).filter((value) => value !== null)
  const comments = list.map((row) => num(row?.stats?.comments)).filter((value) => value !== null)
  const now = typeof opts.now === 'string' ? opts.now : new Date().toISOString()
  const frequency = postingFrequencyPerWeek(list, now)
  return {
    avg_views: mean(views),
    median_views: medianOf(views),
    avg_likes: mean(likes),
    avg_comments: mean(comments),
    posting_frequency_per_week: frequency,
    activity_level: activityLevel(frequency, list.length),
    niche: keywordNiche(list),
    computed_at: now,
  }
}

/**
 * Posts per week over the trailing window, measured against the newest post in
 * the list rather than the wall clock: an account that stopped posting a year
 * ago must not read as "0 per week, low activity" purely because the sample is
 * old.
 * @param {Record<string, any>[]} rows
 * @param {string} now
 * @returns {number}
 */
export function postingFrequencyPerWeek(rows, now) {
  const times = asArray(rows)
    .map((row) => Date.parse(String(row?.posted_at || '')))
    .filter((value) => !Number.isNaN(value))
  if (times.length === 0) return 0
  const newest = Math.max(...times)
  const oldest = Math.min(...times)
  const spanDays = Math.max(1, Math.min(FREQUENCY_WINDOW_DAYS, (newest - oldest) / 86_400_000 || 1))
  const perWeek = (times.length / spanDays) * 7
  void now
  return Math.round(perWeek * 10) / 10
}

/**
 * @param {number} perWeek
 * @param {number} sampleSize
 * @returns {'--' | 'low' | 'medium' | 'high'}
 */
export function activityLevel(perWeek, sampleSize) {
  if (sampleSize === 0) return '--'
  if (perWeek >= ACTIVITY_HIGH_PER_WEEK) return 'high'
  if (perWeek >= ACTIVITY_MEDIUM_PER_WEEK) return 'medium'
  return 'low'
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}#]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
}

/**
 * Most frequent keyword across the account's titles and texts.
 * @param {Record<string, any>[]} rows
 * @returns {{ primary: string, confidence: number }}
 */
export function keywordNiche(rows) {
  const counts = new Map()
  let total = 0
  for (const row of asArray(rows)) {
    const tokens = [...tokenize(row?.title), ...tokenize(row?.text)]
    const seen = new Set()
    for (const token of tokens) {
      if (seen.has(token)) continue
      seen.add(token)
      counts.set(token, (counts.get(token) || 0) + 1)
      total += 1
    }
  }
  if (counts.size === 0) return { primary: '--', confidence: 0 }
  let best = ''
  let bestCount = 0
  for (const [token, count] of counts.entries()) {
    if (count > bestCount || (count === bestCount && token < best)) {
      best = token
      bestCount = count
    }
  }
  return { primary: best, confidence: Math.round((bestCount / Math.max(1, total)) * 100) / 100 }
}

/**
 * Percentage change, or `null` when there is nothing to compare against.
 *
 * The first refresh of an account has no `previous`, and reporting `+0%` there
 * would read as "no change" instead of "this is your baseline".
 * @param {number | null} latest
 * @param {number | null} previous
 * @returns {number | null}
 */
export function deltaPct(latest, previous) {
  const current = num(latest)
  const base = num(previous)
  if (current === null || base === null) return null
  if (base === 0) return current === 0 ? 0 : null
  return Math.round(((current - base) / base) * 1000) / 10
}

/**
 * Advance the account's monitor to the newest values.
 *
 * `previous` always becomes what `latest` was, so `delta_pct` describes the step
 * just taken. A value the cloud did not return keeps the previous reading rather
 * than resetting to 0 — an unknown follower count must not read as "lost all
 * followers".
 * @param {{ metrics?: Record<string, any> } | null | undefined} account
 * @param {{ followers?: number | null, posts_count?: number | null, avg_views_recent?: number | null }} latest
 * @returns {{ latest: Record<string, any>, previous: Record<string, any>, delta_pct: Record<string, any> }}
 */
export function advanceMetrics(account, latest) {
  const metrics = account && typeof account === 'object' && account.metrics && typeof account.metrics === 'object'
    ? account.metrics
    : {}
  const previousLatest = metrics.latest && typeof metrics.latest === 'object' ? metrics.latest : {}
  const nextLatest = {
    followers: num(latest?.followers) ?? num(previousLatest.followers),
    posts_count: num(latest?.posts_count) ?? num(previousLatest.posts_count),
    avg_views_recent: num(latest?.avg_views_recent) ?? num(previousLatest.avg_views_recent) ?? 0,
  }
  const previous = {
    followers: num(previousLatest.followers),
    posts_count: num(previousLatest.posts_count),
    avg_views_recent: num(previousLatest.avg_views_recent) ?? 0,
  }
  return {
    latest: nextLatest,
    previous,
    delta_pct: {
      followers: deltaPct(nextLatest.followers, previous.followers),
      posts_count: deltaPct(nextLatest.posts_count, previous.posts_count),
      avg_views_recent: deltaPct(nextLatest.avg_views_recent, previous.avg_views_recent),
    },
  }
}

/**
 * Monitor view of one account.
 * @param {{ metrics?: Record<string, any> } | null | undefined} account
 * @returns {{ latest: Record<string, any>, previous: Record<string, any>, delta_pct: Record<string, any>, first_baseline: boolean }}
 */
export function computeMonitor(account) {
  const metrics = account && typeof account === 'object' && account.metrics && typeof account.metrics === 'object'
    ? account.metrics
    : {}
  const latest = metrics.latest && typeof metrics.latest === 'object' ? metrics.latest : { followers: null, posts_count: null, avg_views_recent: 0 }
  const previous = metrics.previous && typeof metrics.previous === 'object' ? metrics.previous : { followers: null, posts_count: null, avg_views_recent: 0 }
  const delta = metrics.delta_pct && typeof metrics.delta_pct === 'object' ? metrics.delta_pct : { followers: null, posts_count: null, avg_views_recent: null }
  const firstBaseline = num(latest.followers) === null
    && num(latest.posts_count) === null
    && num(latest.avg_views_recent) === 0
  return {
    latest: {
      followers: num(latest.followers),
      posts_count: num(latest.posts_count),
      avg_views_recent: num(latest.avg_views_recent) ?? 0,
    },
    previous: {
      followers: num(previous.followers),
      posts_count: num(previous.posts_count),
      avg_views_recent: num(previous.avg_views_recent) ?? 0,
    },
    delta_pct: {
      followers: num(delta.followers),
      posts_count: num(delta.posts_count),
      avg_views_recent: num(delta.avg_views_recent),
    },
    first_baseline: firstBaseline,
  }
}

/**
 * Average view count over the newest `limit` rows that carry a view count.
 *
 * This is the monitor's "recent performance" number: it is deliberately not the
 * account average, which a single old viral post would dominate.
 * @param {Record<string, any>[]} rows
 * @param {number} [limit]
 * @returns {number}
 */
export function averageRecentViews(rows, limit = 10) {
  const ordered = asArray(rows).slice().sort((a, b) => {
    const left = Date.parse(String(a?.posted_at || ''))
    const right = Date.parse(String(b?.posted_at || ''))
    if (Number.isNaN(left) && Number.isNaN(right)) return 0
    if (Number.isNaN(left)) return 1
    if (Number.isNaN(right)) return -1
    return right - left
  })
  const views = []
  for (const row of ordered) {
    const value = num(row?.stats?.views)
    if (value === null) continue
    views.push(value)
    if (views.length >= limit) break
  }
  return mean(views)
}

/**
 * First-screen account profile, built from what is already on disk.
 * @param {Record<string, any>} account
 * @param {Record<string, any>[]} rows
 * @returns {{ account_id: string, platform: string, handle: string, nickname: string, analysis: Record<string, any>, potential_count: number, post_count: number }}
 */
export function buildAccountProfile(account, rows) {
  const list = asArray(rows)
  return {
    account_id: String(account?.id || ''),
    platform: String(account?.platform || ''),
    handle: String(account?.handle || ''),
    nickname: String(account?.nickname || ''),
    analysis: account?.analysis && typeof account.analysis === 'object'
      ? account.analysis
      : computeAnalysis(list),
    potential_count: list.filter((row) => row?.potential?.flagged).length,
    post_count: list.length,
  }
}
