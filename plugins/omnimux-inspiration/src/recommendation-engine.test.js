import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateRecommendationScore,
  extractRecommendationFeatures,
  sortTrendingByRecommendation,
} from './recommendation-engine.js'

const NOW = Date.parse('2026-09-13T12:00:00.000Z')

test('inspiration recommendation: 兼容灵感社区原始 row 结构（包含 published_at, stats 对象等）', () => {
  const row = {
    id: 'insp_101',
    title: 'High potential ad',
    published_at: '2026-09-11T00:00:00.000Z',
    stats: {
      views: 300000,
      likes: 15000,
      comments: 1200,
      shares: 800,
      saves: 2500,
    },
  }

  const feat = extractRecommendationFeatures(row, NOW)
  assert.equal(feat.id, 'insp_101')
  assert.equal(feat.views, 300000)
  assert.equal(feat.likes, 15000)
  assert.equal(feat.saves, 2500)
  assert.equal(feat.ageDays, 2)

  const score = calculateRecommendationScore(row, NOW)
  assert.ok(score > 50, `高质量且发布2天的内容得分 (${score}) 应高于 50 分`)
})

test('inspiration recommendation: 排序将高质量近期爆款置顶', () => {
  const rows = [
    { id: 'old_flat', views: 500000, published_at: '2026-06-01T00:00:00.000Z', stats: { views: 500000, likes: 200 } },
    { id: 'new_viral', views: 100000, published_at: '2026-09-12T00:00:00.000Z', stats: { views: 100000, likes: 8000, comments: 800, saves: 1500, shares: 600 } },
  ]

  const sorted = sortTrendingByRecommendation(rows, NOW)
  assert.equal(sorted[0].id, 'new_viral')
  assert.equal(sorted[1].id, 'old_flat')
})
