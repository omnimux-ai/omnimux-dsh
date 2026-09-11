/**
 * Post metrics aggregation, scoring, and ranking.
 */

import {
  bestPostScore,
  normalizeErRatio,
  num,
  publishedLabel,
  unwrap,
} from './formatters.js'

function findFirstHttpsUrl(candidates) {
  for (const value of candidates) {
    if (typeof value === 'string' && /^https:\/\//i.test(value)) {
      return value
    }
  }
  return null
}

function findFirstCoverUrl(candidates) {
  for (const value of candidates) {
    if (typeof value === 'string' && value !== '') {
      return value
    }
  }
  return null
}

function resolvePublishedAt(item) {
  if (typeof item.publishedAt === 'string') {
    return item.publishedAt
  }
  if (typeof item.published_at === 'string') {
    return item.published_at
  }
  return ''
}

function pickMetricValue(analytics, item, key) {
  const v = analytics[key] !== undefined ? analytics[key] : item[key]
  return num(v)
}

function resolvePostTitle(item) {
  const candidates = [item.content, item.title, item.caption, item.postId, item.id]
  for (const c of candidates) {
    if (c) return String(c)
  }
  return ''
}

function resolvePostEr(analytics, item) {
  const candidates = [analytics.engagementRate, analytics.er, item.er]
  for (const val of candidates) {
    if (val !== undefined && val !== null) {
      return normalizeErRatio(val)
    }
  }
  return null
}

const POST_METRIC_KEYS = Object.freeze(['likes', 'comments', 'saves', 'clicks', 'follows', 'impressions', 'reach'])

function extractPostMetrics(analytics, item) {
  const metrics = {}
  for (const key of POST_METRIC_KEYS) {
    metrics[key] = pickMetricValue(analytics, item, key)
  }
  return metrics
}

function normalizePostItem(item) {
  const analytics = item.analytics && typeof item.analytics === 'object' ? item.analytics : {}
  const platform = String(item.platform || '').toLowerCase()
  const publishedAt = resolvePublishedAt(item)
  const publishedLabelText = publishedAt ? publishedLabel(publishedAt) : ''
  const title = resolvePostTitle(item)

  const permalink = findFirstHttpsUrl([item.permalink, item.url, item.postUrl, item.detailHref, analytics.url])
  const cover = findFirstCoverUrl([item.coverUrl, item.cover_url, item.thumbnail, item.image, analytics.coverUrl])
  const er = resolvePostEr(analytics, item)
  const views = pickMetricValue(analytics, item, 'views')
  const shares = pickMetricValue(analytics, item, 'shares')
  const metrics = extractPostMetrics(analytics, item)

  const row = {
    postId: String(item.postId || item.id || ''),
    platform,
    title,
    publishedAt,
    publishedLabel: publishedLabelText,
    coverUrl: cover,
    shares,
    views,
    er,
    detailHref: permalink,
    ...metrics,
    score: 0,
  }
  row.score = bestPostScore(row)
  return row
}

function extractPostsList(raw) {
  const body = unwrap(raw) || {}
  if (Array.isArray(body.posts)) {
    return body.posts
  }
  if (Array.isArray(body)) {
    return body
  }
  return []
}

function sortPostsByScore(rows) {
  rows.sort((a, b) => {
    const scoreDiff = (b.score || 0) - (a.score || 0)
    if (scoreDiff !== 0) return scoreDiff
    return (b.views || 0) - (a.views || 0)
  })
}

/**
 * @param {unknown} raw
 */
export function mapPosts(raw) {
  const list = extractPostsList(raw)
  const rows = []
  for (const item of list) {
    const row = normalizePostItem(item)
    if (row.postId) {
      rows.push(row)
    }
  }
  sortPostsByScore(rows)
  return rows
}
