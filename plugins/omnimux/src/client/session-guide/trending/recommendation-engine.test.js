import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RECOMMENDATION_CONFIG,
  RECOMMENDATION_WEIGHTS,
  calculateRecommendationScore,
  extractRecommendationFeatures,
  sortTrendingByRecommendation,
} from './recommendation-engine.js'

const NOW = Date.parse('2026-09-13T12:00:00.000Z')

test('recommendation: 特征提取防御性兜底与异常值稳健解析', () => {
  assert.equal(calculateRecommendationScore(null), 0)
  assert.equal(calculateRecommendationScore({}), 0)
  assert.equal(calculateRecommendationScore({ id: '' }), 0)

  // 缺字段降级为默认基准
  const feat = extractRecommendationFeatures({ id: 'item_1' }, NOW)
  assert.equal(feat.id, 'item_1')
  assert.equal(feat.views, 0)
  assert.equal(feat.likes, 0)
  assert.equal(feat.shares, 0)
  assert.equal(feat.ageDays, RECOMMENDATION_CONFIG.defaultNeutralAgeDays)
})

test('recommendation: 互动加权（CES）——高收藏与高分享显著优于单薄点赞', () => {
  // 两个视频播放量与时间完全一致（10万播放，3天前发布）
  const baseData = {
    views: 100000,
    days: 3,
  }

  // 视频A：纯点赞 2000，无评论分享收藏
  const videoLikesOnly = {
    id: 'vid_likes',
    ...baseData,
    stats: { likes: 2000, comments: 0, saves: 0, shares: 0 },
  }

  // 视频B：点赞 1000，但有 300 评论 + 400 收藏 + 300 分享
  // 加权互动数：1000*1 + 300*2 + 400*3.5 + 300*4 = 1000 + 600 + 1400 + 1200 = 4200
  const videoHighValueShares = {
    id: 'vid_shares',
    ...baseData,
    stats: { likes: 1000, comments: 300, saves: 400, shares: 300 },
  }

  const scoreA = calculateRecommendationScore(videoLikesOnly, NOW)
  const scoreB = calculateRecommendationScore(videoHighValueShares, NOW)

  assert.ok(scoreB > scoreA, `高传播与收藏视频 (${scoreB}) 应大幅高于纯轻度点赞视频 (${scoreA})`)
})

test('recommendation: 时间衰减——打破远古爆款垄断，近期新爆款优先', () => {
  // 远古大爆款：千万播放，但发布于 180 天前（半年前）
  const ancientMegaViral = {
    id: 'ancient_mega',
    views: 10000000,
    days: 180,
    stats: { likes: 300000, comments: 10000, saves: 30000, shares: 10000 },
  }

  // 近期黑马爆款：50万播放，发布于 2 天前，高互动率（12%）
  const freshRisingStar = {
    id: 'fresh_rising',
    views: 500000,
    days: 2,
    stats: { likes: 30000, comments: 4000, saves: 8000, shares: 3000 },
  }

  const scoreAncient = calculateRecommendationScore(ancientMegaViral, NOW)
  const scoreFresh = calculateRecommendationScore(freshRisingStar, NOW)

  assert.ok(scoreFresh > scoreAncient, `近期高互动爆款 (${scoreFresh}) 经时间衰减调节后应优于远古老片 (${scoreAncient})`)
})

test('recommendation: 冷启动黑马扶持机制——7天内高互动新视频获提权', () => {
  // 刚刚发布 1 天的新视频，虽然只有 2 万播放，但互动率高达 5%
  const newViralSeed = {
    id: 'new_seed',
    views: 20000,
    days: 1,
    stats: { likes: 800, comments: 100, saves: 200, shares: 100 },
  }

  // 相同数据若发布在 20 天前（无冷启动提权）
  const agedSameData = {
    id: 'aged_same',
    views: 20000,
    days: 20,
    stats: { likes: 800, comments: 100, saves: 200, shares: 100 },
  }

  const scoreNew = calculateRecommendationScore(newViralSeed, NOW)
  const scoreAged = calculateRecommendationScore(agedSameData, NOW)

  assert.ok(scoreNew > scoreAged * 2, '冷启动新苗结合时间因数得分应显著高出已过保质期的同质内容')
})

test('recommendation: 排序函数稳健、降序排列、相同分数由播放量和 id 稳定兜底', () => {
  const items = [
    { id: 'low_score', views: 500, days: 60, stats: { likes: 1 } },
    { id: 'high_score', views: 200000, days: 2, stats: { likes: 10000, comments: 1000, saves: 2000, shares: 1000 } },
    { id: 'mid_score', views: 50000, days: 5, stats: { likes: 1000, comments: 100, saves: 200, shares: 100 } },
  ]

  const sorted = sortTrendingByRecommendation(items, NOW)

  assert.equal(sorted[0].id, 'high_score')
  assert.equal(sorted[1].id, 'mid_score')
  assert.equal(sorted[2].id, 'low_score')

  // 验证不改动原数组
  assert.notEqual(sorted, items)
})
