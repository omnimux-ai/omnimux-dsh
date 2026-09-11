/**
 * Engagement and KPI calculations for social media metrics.
 */

import { num, roundTo } from './formatters.js'

function metricValue(val) {
  const n = num(val)
  if (n === null) return 0
  return n
}

export function engagementOf(metrics = {}) {
  const likes = metricValue(metrics.likes)
  const comments = metricValue(metrics.comments)
  const shares = metricValue(metrics.shares)
  const saves = metricValue(metrics.saves)
  return likes + comments + shares + saves
}

export function erFromMetrics(metrics = {}) {
  const numer = engagementOf(metrics)
  const views = num(metrics.views)
  const impressions = num(metrics.impressions)
  const reach = num(metrics.reach)
  const denom = views || impressions || reach
  if (!denom) return null
  return roundTo(numer / denom, 6)
}

export function metricPresent(rows, key) {
  return rows.some((row) => num(row?.[key]) !== null)
}

export function sumMetric(rows, key) {
  if (!metricPresent(rows, key)) return null
  return rows.reduce((acc, row) => acc + metricValue(row?.[key]), 0)
}

const STALE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000

function findLatestPublishTimestamp(posts) {
  let latest = 0
  for (const row of posts) {
    const t = Date.parse(row.publishedAt)
    if (Number.isFinite(t) && t > latest) {
      latest = t
    }
  }
  return latest
}

function calcPostsHealth(postsCount, posts) {
  if (postsCount <= 0) return 'none'
  const latest = findLatestPublishTimestamp(posts)
  if (latest > 0 && (Date.now() - latest) > STALE_THRESHOLD_MS) {
    return 'stale'
  }
  return 'normal'
}

function buildBestPostSummary(best) {
  if (!best) return null
  const coverLabel = best.title ? String(best.title).slice(0, 8) : null
  const detailHref = best.detailHref || '#omnimux-analytics-top-posts'
  return {
    postId: best.postId,
    platform: best.platform,
    title: best.title,
    coverLabel,
    coverUrl: best.coverUrl,
    views: best.views,
    er: best.er,
    publishedAt: best.publishedAt,
    detailHref,
  }
}

/**
 * @param {Array<Record<string, any>>} posts
 * @param {{ postsCount: number, totals?: Record<string, number | null> }} daily
 * @param {{ totalFollowers?: number | null, followerDiff?: number | null }} [followers]
 */
export function deriveKpi(posts, daily, followers = {}) {
  const postsCount = daily.postsCount
  const totals = daily.totals || {}
  const best = posts[0] || null
  const postsHealth = calcPostsHealth(postsCount, posts)
  const bestPost = buildBestPostSummary(best)

  const erVal = totals.er !== undefined ? totals.er : null
  const reachVal = totals.reach !== undefined ? totals.reach : null
  const followersVal = followers.totalFollowers !== undefined ? followers.totalFollowers : null
  const diffVal = followers.followerDiff !== undefined ? followers.followerDiff : null

  return {
    engagementRate: { value: erVal },
    totalReach: { value: reachVal },
    totalFollowers: { value: followersVal },
    followerDiff: { value: diffVal },
    postsCount: { value: postsCount },
    postsHealth,
    bestPost,
  }
}
