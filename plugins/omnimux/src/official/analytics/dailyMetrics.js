/**
 * Daily metrics mapping and periodic aggregation for dashboard charts.
 */

import { METRIC_DEFS, PLATFORM_LABEL, PLATFORMS } from './constants.js'
import {
  dateLabel,
  enumerateBuckets,
  num,
  unwrap,
  normalizeErRatio,
  bucketKey,
} from './formatters.js'
import { erFromMetrics, metricPresent, sumMetric } from './kpiCalculator.js'

function initBucketsMap(buckets) {
  /** @type {Map<string, { postCount: number, metrics: Record<string, number>, platforms: Record<string, number> }>} */
  const byBucket = new Map()
  for (const key of buckets) {
    byBucket.set(key, { postCount: 0, metrics: {}, platforms: {} })
  }
  return byBucket
}

function accumulateObjectValues(source, target) {
  for (const [key, value] of Object.entries(source)) {
    const n = num(value)
    if (n !== null) {
      target[key] = (target[key] || 0) + n
    }
  }
}

function processDailyRow(row, byBucket, grain) {
  const iso = String(row.date || '').slice(0, 10)
  const key = bucketKey(iso, grain)
  const acc = byBucket.get(key)
  if (!acc) return

  const pCount = num(row.postCount)
  if (pCount !== null) {
    acc.postCount += pCount
  }
  if (row.metrics && typeof row.metrics === 'object') {
    accumulateObjectValues(row.metrics, acc.metrics)
  }
  if (row.platforms && typeof row.platforms === 'object') {
    accumulateObjectValues(row.platforms, acc.platforms)
  }
}

function calcTotals(daily) {
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
    er: null,
  }
  totals.er = erFromMetrics(totals)
  return { totals, metricRows }
}

function extractSinglePlatformMetrics(metrics) {
  const ratio = normalizeErRatio(metrics.er)
  const er = ratio !== null ? ratio : erFromMetrics(metrics)
  return {
    likes: num(metrics.likes),
    comments: num(metrics.comments),
    shares: num(metrics.shares),
    saves: num(metrics.saves),
    clicks: num(metrics.clicks),
    views: num(metrics.views),
    impressions: num(metrics.impressions),
    reach: num(metrics.reach),
    er,
  }
}

function extractPerPlatformFromBreakdown(breakdownSrc) {
  const perPlatform = new Map()
  for (const row of breakdownSrc) {
    const platform = String(row.platform || '').toLowerCase()
    if (!platform) continue
    const metrics = row.metrics && typeof row.metrics === 'object' ? row.metrics : {}
    const posts = num(row.postCount)
    perPlatform.set(platform, {
      posts: posts !== null ? posts : 0,
      metrics: extractSinglePlatformMetrics(metrics),
    })
  }
  return perPlatform
}

function addPlatformPosts(perPlatform, platform, value) {
  const n = num(value)
  if (n === null) return
  const cur = perPlatform.get(platform) || { posts: 0, metrics: {} }
  cur.posts += n
  perPlatform.set(platform, cur)
}

function extractPerPlatformFromDaily(daily) {
  const perPlatform = new Map()
  for (const row of daily) {
    const platforms = row.platforms && typeof row.platforms === 'object' ? row.platforms : {}
    for (const [platform, value] of Object.entries(platforms)) {
      addPlatformPosts(perPlatform, platform, value)
    }
  }
  return perPlatform
}

function resolvePlatformIds(perPlatform) {
  return [...perPlatform.keys()].filter((id) => PLATFORMS.includes(/** @type {any} */ (id)))
}

function buildTimeBuckets(buckets, byBucket, metricRows, locale) {
  const timeBuckets = []
  const likesTime = []
  const hasLikes = metricPresent(metricRows, 'likes')

  for (const key of buckets) {
    const label = dateLabel(key, locale)
    const acc = byBucket.get(key)
    const postCount = acc ? acc.postCount : 0
    timeBuckets.push({ key, label, value: postCount })

    let likeVal = null
    if (hasLikes) {
      likeVal = acc && acc.metrics.likes !== undefined ? acc.metrics.likes : 0
    }
    likesTime.push({ key, label, value: likeVal })
  }
  return { timeBuckets, likesTime }
}

function buildBasicCharts(params) {
  const { platformIds, perPlatform, postsCount, totalLikes, timeBuckets, likesTime, grain } = params
  const labels = platformIds.map((id) => PLATFORM_LABEL[id] || id)
  const postsValues = platformIds.map((id) => {
    const item = perPlatform.get(id)
    return item ? item.posts : 0
  })
  const likesValues = platformIds.map((id) => {
    const item = perPlatform.get(id)
    const val = item && item.metrics ? item.metrics.likes : null
    return val !== undefined ? val : null
  })

  return {
    postsPerPlatform: { labels, platformIds, values: postsValues, total: postsCount },
    postsOverTime: { grain, total: postsCount, buckets: timeBuckets },
    likesPerPlatform: { labels, platformIds, values: likesValues, total: totalLikes },
    likesOverTime: { grain, total: totalLikes, buckets: likesTime },
  }
}

function calcPointValue(acc, key, isEr, isPresent) {
  let result = 0
  if (isEr) {
    result = acc ? erFromMetrics({ ...acc.metrics }) : null
  } else if (!isPresent) {
    result = null
  } else if (acc && acc.metrics[key] !== undefined) {
    result = acc.metrics[key]
  }
  return result
}

function buildSingleSeries(def, buckets, byBucket, metricRows) {
  const isEr = def.key === 'er'
  const isPresent = metricPresent(metricRows, def.key)
  const points = buckets.map((key) => {
    const acc = byBucket.get(key)
    return calcPointValue(acc, def.key, isEr, isPresent)
  })
  return { ...def, points }
}

function buildSeries(buckets, byBucket, metricRows) {
  return METRIC_DEFS.map((def) => buildSingleSeries(def, buckets, byBucket, metricRows))
}

const BREAKDOWN_METRICS = Object.freeze([
  'likes', 'comments', 'shares', 'saves', 'clicks',
  'views', 'impressions', 'reach', 'er',
])

function extractBreakdownRow(platform, perPlatform) {
  const row = perPlatform.get(platform)
  const metrics = row && row.metrics ? row.metrics : {}
  const result = {
    platform,
    platformLabel: PLATFORM_LABEL[platform] || platform,
    posts: row ? row.posts : 0,
  }
  for (const key of BREAKDOWN_METRICS) {
    const val = metrics[key]
    result[key] = val !== undefined ? val : null
  }
  return result
}

function buildPlatformBreakdown(platformIds, perPlatform) {
  return platformIds.map((platform) => extractBreakdownRow(platform, perPlatform))
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

  const byBucket = initBucketsMap(buckets)
  for (const row of daily) {
    processDailyRow(row, byBucket, grain)
  }

  const { totals, metricRows } = calcTotals(daily)
  const postsCount = daily.reduce((acc, row) => acc + (num(row.postCount) || 0), 0)

  const breakdownSrc = Array.isArray(body.platformBreakdown) ? body.platformBreakdown : []
  const perPlatform = breakdownSrc.length > 0
    ? extractPerPlatformFromBreakdown(breakdownSrc)
    : extractPerPlatformFromDaily(daily)

  const platformIds = resolvePlatformIds(perPlatform)
  const { timeBuckets, likesTime } = buildTimeBuckets(buckets, byBucket, metricRows, locale)
  const basicCharts = buildBasicCharts({
    platformIds,
    perPlatform,
    postsCount,
    totalLikes: totals.likes,
    timeBuckets,
    likesTime,
    grain,
  })

  const series = buildSeries(buckets, byBucket, metricRows)
  const platformBreakdown = buildPlatformBreakdown(platformIds, perPlatform)

  return {
    postsCount,
    totals,
    basicCharts,
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
