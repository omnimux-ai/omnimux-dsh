import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OmnimuxError } from '../media/errors.js'
import {
  aggregateOverview,
  bestPostScore,
  buildCloudQuery,
  cloudSundayToMonday,
  deriveKpi,
  heatmapLevel,
  mapCadence,
  mapDailyMetrics,
  mapDecay,
  mapFollowers,
  mapHeatmap,
  mapPosts,
  normalizeErPercentPoints,
  normalizeErRatio,
  settleCloud,
} from './analytics-aggregate.js'

const DAILY = {
  dailyData: [
    {
      date: '2026-08-01',
      postCount: 6,
      platforms: { tiktok: 4, twitter: 2 },
      metrics: {
        impressions: 12500,
        reach: 8900,
        likes: 340,
        comments: 28,
        shares: 15,
        saves: 12,
        clicks: 45,
        views: 9800,
      },
    },
    {
      date: '2026-08-08',
      postCount: 6,
      platforms: { tiktok: 6 },
      metrics: {
        impressions: null,
        reach: null,
        likes: 34,
        comments: 8,
        shares: 2,
        views: 1900,
      },
    },
  ],
  platformBreakdown: [
    {
      platform: 'tiktok',
      postCount: 12,
      metrics: { likes: 34, comments: 8, shares: 2, views: 1900, er: 2.28 },
    },
  ],
}

const POSTS = {
  posts: [
    {
      postId: 'post_789abc',
      platform: 'tiktok',
      content: 'Ep.1 Drama release...',
      publishedAt: '2026-08-02T10:00:00Z',
      permalink: 'https://www.tiktok.com/@dsh/video/1',
      analytics: {
        impressions: 1200,
        reach: 930,
        likes: 17,
        comments: 0,
        shares: 0,
        saves: 0,
        clicks: 0,
        views: 930,
        follows: 0,
        engagementRate: 1.83,
      },
    },
    {
      postId: 'post_clip',
      platform: 'tiktok',
      content: 'Episode 2 Clip',
      publishedAt: '2026-08-02T18:30:00Z',
      analytics: {
        likes: 10,
        comments: 8,
        shares: 2,
        views: 630,
        engagementRate: 3.17,
      },
    },
  ],
}

describe('normalizeErRatio', () => {
  it('treats 1.83 as percent and stores a ratio', () => {
    assert.equal(normalizeErRatio(1.83), 0.0183)
    assert.equal(normalizeErRatio(0.0226), 0.0226)
    assert.equal(normalizeErRatio(null), null)
  })
})

describe('normalizeErPercentPoints', () => {
  it('keeps cadence 2.2 as percent-points and scales tiny ratios once', () => {
    assert.equal(normalizeErPercentPoints(2.2), 2.2)
    assert.equal(normalizeErPercentPoints(0.6), 0.6)
    assert.equal(normalizeErPercentPoints(0.022), 2.2)
  })
})

describe('cloudSundayToMonday', () => {
  it('maps cloud Sunday 0 / hour 10 onto dashboard Sunday (6)', () => {
    assert.equal(cloudSundayToMonday(0), 6)
    assert.equal(cloudSundayToMonday(1), 0)
    assert.equal(cloudSundayToMonday(3), 2)
  })
})

describe('buildCloudQuery', () => {
  it('expands 30d into fromDate/toDate and forwards a concrete account id', () => {
    const now = new Date(2026, 7, 25, 12, 0, 0).getTime()
    const cloud = buildCloudQuery({ timeRange: '30d', profileId: 'acc_tt_01', platform: 'tiktok' }, now)
    assert.equal(cloud.days, 30)
    assert.equal(cloud.platform, 'tiktok')
    assert.equal(cloud.accountIds, 'acc_tt_01')
    assert.equal(cloud.toDate, '2026-08-25')
    assert.equal(cloud.fromDate, '2026-07-27')
  })
})

describe('mapDailyMetrics', () => {
  it('rolls daily rows into week buckets and keeps missing metrics as null', () => {
    const mapped = mapDailyMetrics(DAILY, {
      fromDate: '2026-07-27',
      toDate: '2026-08-24',
      grain: 'week',
    })
    assert.equal(mapped.postsCount, 12)
    assert.equal(mapped.basicCharts.postsPerPlatform.platformIds[0], 'tiktok')
    assert.equal(mapped.basicCharts.postsPerPlatform.values[0], 12)
    assert.ok(mapped.basicCharts.postsOverTime.buckets.length >= 4)
    const first = mapped.basicCharts.postsOverTime.buckets.find((b) => b.key === '2026-07-27')
    assert.equal(first.value, 6)
    assert.equal(mapped.platformBreakdown[0].er, 0.0228)
    assert.equal(mapped.platformBreakdown[0].saves, null)
    const erSeries = mapped.engagementOverTime.series.find((s) => s.key === 'er')
    assert.ok(erSeries.points[0] > 0 && erSeries.points[0] < 1)
    assert.equal(mapped.totals.reach, 8900)
  })
})

describe('mapPosts + deriveKpi', () => {
  it('normalizes post ER and ranks Best Post by the contract weight', () => {
    const posts = mapPosts(POSTS)
    const ep1 = posts.find((row) => row.postId === 'post_789abc')
    assert.equal(ep1.er, 0.0183)
    assert.equal(ep1.detailHref, 'https://www.tiktok.com/@dsh/video/1')
    assert.equal(posts.length, 2)
    assert.equal(posts[0].postId, 'post_clip')
    assert.ok(bestPostScore(posts[0]) > bestPostScore(ep1))
    const daily = mapDailyMetrics(DAILY, {
      fromDate: '2026-07-27',
      toDate: '2026-08-24',
      grain: 'week',
    })
    const kpi = deriveKpi(posts, daily, { totalFollowers: 635, followerDiff: 17 })
    assert.equal(kpi.totalReach.value, 8900)
    assert.equal(kpi.totalFollowers.value, 635)
    assert.equal(kpi.postsCount.value, 12)
    assert.equal(kpi.bestPost.postId, 'post_clip')
    assert.ok(kpi.engagementRate.value > 0)
    assert.ok(kpi.engagementRate.value < 1)
  })
})

describe('mapHeatmap', () => {
  it('pads 168 cells and converts Sunday 10am onto dashboard Sunday', () => {
    const mapped = mapHeatmap({
      slots: [
        { day_of_week: 0, hour: 10, avg_engagement: 510.3, post_count: 15 },
        { day_of_week: 3, hour: 20, avg_engagement: 289.1, post_count: 8 },
      ],
      recommended: [
        { label: 'Sun 10am', day_of_week: 0, hour: 10, score: 24 },
      ],
    })
    assert.equal(mapped.cells.length, 168)
    assert.equal(mapped.cells[6 * 24 + 10].score, 510.3)
    assert.equal(mapped.cells[6 * 24 + 10].level, heatmapLevel(510.3, 510.3))
    assert.equal(mapped.recommended[0].dayOfWeek, 6)
    assert.match(mapped.recommended[0].labelZh, /周日/)
  })
})

describe('mapCadence', () => {
  it('does not multiply 2.2 by 100', () => {
    const mapped = mapCadence({
      frequency: [
        { platform: 'tiktok', posts_per_week: '6-10/wk', avg_engagement_rate: 0.6 },
        { platform: 'tiktok', posts_per_week: '11+/wk', avg_engagement_rate: 2.2 },
      ],
      optimalCadence: { tiktok: { recommendation: '11+/wk', er: 2.2 } },
    })
    assert.deepEqual(mapped.series[0].erPercentPoints, [null, 0.6, 2.2])
    assert.equal(mapped.optimal[0].erPercent, 2.2)
  })
})

describe('mapDecay', () => {
  it('inserts a publish=0 window and keeps 2-7d at 100', () => {
    const mapped = mapDecay({
      buckets: [
        { bucket_order: 0, bucket_label: '0-6h', avg_pct_of_final: 42.5 },
        { bucket_order: 4, bucket_label: '2-7d', avg_pct_of_final: 100 },
      ],
      milestones: { half_engagement_by: '2-7d', eighty_percent_within: '2-7d' },
    })
    assert.equal(mapped.windows[0].key, 'publish')
    assert.equal(mapped.windows[0].pct, 0)
    assert.equal(mapped.windows.find((w) => w.key === '2-7d').pct, 100)
    assert.equal(mapped.milestones.halfEngagementBy, '2-7d')
  })
})

describe('settleCloud', () => {
  it('swallows a 502 and rethrows needs-omnimux', async () => {
    const ok = await settleCloud(Promise.resolve({ dailyData: [] }))
    assert.equal(ok.ok, true)
    const fail = await settleCloud(Promise.reject(new Error('official request failed (HTTP 502)')))
    assert.equal(fail.ok, false)
    await assert.rejects(
      () => settleCloud(Promise.reject(new OmnimuxError('needs-omnimux', 'sign in'))),
      (err) => err instanceof OmnimuxError && err.code === 'needs-omnimux',
    )
  })
})

describe('aggregateOverview degradation', () => {
  it('still returns a dashboard shell when daily-metrics 502s', async () => {
    const client = {
      async withPat(path) {
        if (path === '/api/social/v1/accounts?provider=zernio') {
          return { accounts: [{ id: 'acc_tt_01', provider: 'zernio', platform: 'tiktok', username: 'dsh' }] }
        }
        throw new Error('official request failed (HTTP 502)')
      },
    }
    const payload = await aggregateOverview(client, { timeRange: '30d' })
    assert.equal(payload.meta.boundAccountCount, 1)
    assert.equal(payload.kpi.postsCount.value, 0)
    assert.equal(payload.emptyState.code, 'network_error')
    assert.match(payload.syncStatus.lastError, /daily-metrics/)
    assert.match(payload.syncStatus.lastError, /502/)
  })
})

describe('mapFollowers', () => {
  it('rolls account-id breakdown onto platforms', () => {
    const mapped = mapFollowers({
      accounts: [
        { accountId: 'acc_tt_01', platform: 'tiktok', currentFollowers: 253, growth: 17 },
        { accountId: 'acc_x_01', platform: 'twitter', currentFollowers: 148, growth: 0 },
      ],
      timeline: [
        { date: '2026-08-02', total: 401, breakdown: { acc_tt_01: 253, acc_x_01: 148 } },
      ],
    })
    assert.equal(mapped.totalFollowers, 401)
    assert.equal(mapped.followerDiff, 17)
    assert.equal(mapped.timeline[0].breakdown.tiktok, 253)
    assert.equal(mapped.timeline[0].breakdown.twitter, 148)
  })
})

describe('analytics modular index exports & submodules', () => {
  it('verifies all expected modules are exported via index.js', async () => {
    const analytics = await import('./analytics/index.js')
    assert.equal(analytics.SCHEMA_VERSION, '1.0.0')
    assert.equal(typeof analytics.unwrap, 'function')
    assert.equal(typeof analytics.emptyDashboard, 'function')
    assert.equal(typeof analytics.mapDailyMetrics, 'function')
    assert.equal(typeof analytics.mapPosts, 'function')
    assert.equal(typeof analytics.mapHeatmap, 'function')
    assert.equal(typeof analytics.mapCadence, 'function')
    assert.equal(typeof analytics.mapDecay, 'function')
    assert.equal(typeof analytics.mapFollowers, 'function')
    assert.equal(typeof analytics.aggregateOverview, 'function')
    assert.equal(typeof analytics.aggregateSync, 'function')
  })

  it('unwraps nested cloud payload envelopes cleanly without deep boolean complexity', async () => {
    const { unwrap } = await import('./analytics/formatters.js')
    const rawWithData = {
      data: {
        posts: [{ id: 'p1' }],
      },
    }
    const unwrapped = unwrap(rawWithData)
    assert.deepEqual(unwrapped, { posts: [{ id: 'p1' }] })
    assert.equal(unwrap(null), null)
    assert.deepEqual(unwrap({ normal: true }), { normal: true })
  })

  it('correctly formats account handles without nested ternary issues', async () => {
    const { accountLabel } = await import('./analytics/emptyStates.js')
    assert.equal(accountLabel({ username: 'alice', platform: 'tiktok' }), '@alice（TikTok）')
    assert.equal(accountLabel({ username: '@bob', platform: 'twitter' }), '@bob（X）')
    assert.equal(accountLabel({ display_name: 'Charlie', platform: 'youtube' }), 'Charlie（YouTube）')
    assert.equal(accountLabel({ id: 'acc_123' }), 'acc_123')
  })

  it('stamps incremental sync timestamps in aggregateSync', async () => {
    const { aggregateSync } = await import('./analytics/cloudPipeline.js')
    const client = {
      async withPat() {
        return { lastSyncedAt: 1700000000000, syncIntervalMs: 1800000 }
      },
    }
    const res = await aggregateSync(client, { profileId: 'acc_01' }, { now: 1700000000000 })
    assert.equal(res.ok, true)
    assert.equal(res.syncStatus.lastSyncedAt, 1700000000000)
    assert.equal(res.syncStatus.nextSyncAt, 1700000000000 + 1800000)
    assert.equal(res.syncStatus.syncIntervalMs, 1800000)
  })
})
