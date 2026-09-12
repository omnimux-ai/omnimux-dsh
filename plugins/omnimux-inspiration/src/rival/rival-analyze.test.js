/**
 * T03 gates for the local aggregation layer.
 *
 * `computeAnalysis` must stay a pure function of the rows it is handed: the
 * first-screen profile is the module's promise that seeing an account's numbers
 * costs no cloud quota.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  advanceMetrics,
  averageRecentViews,
  activityLevel,
  buildAccountProfile,
  computeAnalysis,
  computeMonitor,
  deltaPct,
  keywordNiche,
  postingFrequencyPerWeek,
} from './rival-analyze.js'
import { RIVAL_LOCALE_KEYS } from './constants.js'

const NOW = '2026-09-12T00:00:00.000Z'

/** @param {string} day @param {Record<string, any>} stats */
function row(day, stats, extra = {}) {
  return { id: `p_${day}`, posted_at: `${day}T00:00:00.000Z`, stats, ...extra }
}

describe('rival-analyze: aggregation', () => {
  const rows = [
    row('2026-09-10', { views: 100, likes: 10, comments: 1 }, { title: 'kitchen hack' }),
    row('2026-09-09', { views: 200, likes: 20, comments: 2 }, { title: 'kitchen tips' }),
    row('2026-09-08', { views: 300, likes: 30, comments: 3 }, { title: 'kitchen tools' }),
    row('2026-09-07', { views: 400, likes: 40, comments: 4 }, { title: 'garden tools' }),
  ]

  it('averages and takes the median of what is present', () => {
    const analysis = computeAnalysis(rows, { now: NOW })
    assert.equal(analysis.avg_views, 250)
    assert.equal(analysis.median_views, 250)
    assert.equal(analysis.avg_likes, 25)
    assert.equal(analysis.avg_comments, 3)
    assert.equal(analysis.computed_at, NOW)
  })

  it('ignores posts whose counts are unknown instead of counting them as zero', () => {
    const analysis = computeAnalysis([...rows, { id: 'unknown', posted_at: NOW, stats: {} }], { now: NOW })
    assert.equal(analysis.avg_views, 250)
  })

  it('answers zeroes and -- for an empty account', () => {
    const analysis = computeAnalysis([], { now: NOW })
    assert.equal(analysis.avg_views, 0)
    assert.equal(analysis.median_views, 0)
    assert.equal(analysis.posting_frequency_per_week, 0)
    assert.equal(analysis.activity_level, '--')
    assert.deepEqual(analysis.niche, { primary: '--', confidence: 0 })
  })

  it('derives a posting cadence and an activity level', () => {
    // Four posts across three days ≈ 9.3 per week.
    assert.ok(postingFrequencyPerWeek(rows, NOW) > 4)
    assert.equal(activityLevel(5, 4), 'high')
    assert.equal(activityLevel(2, 4), 'medium')
    assert.equal(activityLevel(1, 4), 'low')
    assert.equal(activityLevel(9, 0), '--')
  })

  it('reads the niche from the most frequent keyword', () => {
    const niche = keywordNiche(rows)
    assert.equal(niche.primary, 'kitchen')
    assert.ok(niche.confidence > 0 && niche.confidence <= 1)
  })

  it('tolerates rows with no text at all', () => {
    assert.deepEqual(keywordNiche([{ id: 'a' }]), { primary: '--', confidence: 0 })
    assert.deepEqual(keywordNiche([]), { primary: '--', confidence: 0 })
  })
})

describe('rival-analyze: monitor (latest vs previous)', () => {
  it('reports a baseline account without inventing a delta', () => {
    const monitor = computeMonitor({ metrics: {} })
    assert.equal(monitor.delta_pct.followers, null)
    assert.equal(monitor.first_baseline, true)
  })

  it('advances latest into previous and computes the step', () => {
    const first = advanceMetrics({ metrics: {} }, { followers: 100, posts_count: 10, avg_views_recent: 1000 })
    assert.equal(first.previous.followers, null)
    assert.equal(first.delta_pct.followers, null)
    const second = advanceMetrics({ metrics: first }, { followers: 150, posts_count: 12, avg_views_recent: 800 })
    assert.equal(second.latest.followers, 150)
    assert.equal(second.previous.followers, 100)
    assert.equal(second.delta_pct.followers, 50)
    assert.equal(second.delta_pct.avg_views_recent, -20)
  })

  it('keeps the previous reading when the cloud omits a value', () => {
    const metrics = advanceMetrics({ metrics: {} }, { followers: 100, posts_count: 10, avg_views_recent: 5 })
    const kept = advanceMetrics({ metrics }, { followers: null, posts_count: null, avg_views_recent: null })
    assert.equal(kept.latest.followers, 100)
    assert.equal(kept.latest.posts_count, 10)
    assert.equal(kept.delta_pct.followers, 0)
  })

  it('never divides by a zero baseline', () => {
    assert.equal(deltaPct(10, 0), null)
    assert.equal(deltaPct(0, 0), 0)
  })
})

describe('rival-analyze: account profile', () => {
  it('summarizes an account from what is on disk', () => {
    const profile = buildAccountProfile(
      { id: 'riv_a', platform: 'tiktok', handle: '@foo', nickname: 'Foo' },
      [
        { id: 'p1', potential: { flagged: true } },
        { id: 'p2', potential: { flagged: false } },
      ],
    )
    assert.equal(profile.account_id, 'riv_a')
    assert.equal(profile.handle, '@foo')
    assert.equal(profile.potential_count, 1)
    assert.equal(profile.post_count, 2)
    assert.equal(profile.analysis.avg_views, 0)
  })

  it('exposes the skip/failure locale keys the UI maps', () => {
    assert.equal(RIVAL_LOCALE_KEYS.SKIP_BUDGET, 'rivalAccounts.skip.budget')
    assert.equal(RIVAL_LOCALE_KEYS.SKIP_COOLDOWN, 'rivalAccounts.skip.cooldown')
    assert.equal(RIVAL_LOCALE_KEYS.SKIP_ACCOUNT_ERROR, 'rivalAccounts.skip.accountError')
  })
})
