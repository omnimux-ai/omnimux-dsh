/**
 * E2E：Shopee 系列技能从精选下架端到端验证（Issue 2334）
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import catalog from '../../catalog/index.json' with { type: 'json' }
import recommendations from '../../catalog/skill-recommendations.json' with { type: 'json' }
import snapshot from '../../../omnimux/src/client/session-guide/skills/featured-skills.json' with { type: 'json' }
import * as SkillShelf from '../../src/client/skill-picker-logic.js'

const SHOPEE_IDS = [
  'sk-shopee-market-analysis',
  'sk-shopee-product-analysis',
  'sk-shopee-shop-analysis',
  'sk-shopee-brand-analysis',
  'sk-shopee-keyword-analysis',
]

test('E2E: 推荐配置列表中已彻底移除所有 Shopee 系列技能', () => {
  for (const id of SHOPEE_IDS) {
    assert.equal(recommendations.featuredSkills.includes(id), false, `featuredSkills 不得包含 ${id}`)
    assert.equal(recommendations.homeRecommendations.includes(id), false, `homeRecommendations 不得包含 ${id}`)
  }
  assert.equal(recommendations.featuredSkills.length, 65)
  assert.equal(recommendations.homeRecommendations.length, 15)
})

test('E2E: 市场基础目录中 Shopee 系列技能不再标记为 recommended，且移除精选标签', () => {
  for (const id of SHOPEE_IDS) {
    const item = catalog.items.find((row) => row.id === id)
    assert.ok(item, `目录中必须保留普通技能项 ${id}`)
    assert.equal(item.recommended, false, `${id} 的 recommended 属性必须为 false`)
    const tags = Array.isArray(item.tags) ? item.tags : []
    assert.equal(tags.includes('精选'), false, `${id} 的 tags 中不得包含精选`)
  }
})

test('E2E: 会话精选技能快照中不再包含 Shopee 系列卡片', () => {
  const snapshotIds = snapshot.skills.map((s) => s.id)
  for (const id of SHOPEE_IDS) {
    assert.equal(snapshotIds.includes(id), false, `精选快照中不得包含 ${id}`)
  }
  assert.equal(snapshot.skills.length, 65)
})

test('E2E: 货架与发现页精选分节结果中彻底排除 Shopee 系列技能', () => {
  const home = SkillShelf.plazaDiscoverySections()
  const homeFeaturedIds = home.featured.map((s) => s.id)
  for (const id of SHOPEE_IDS) {
    assert.equal(homeFeaturedIds.includes(id), false, `首页精选中不得出现 ${id}`)
  }
  assert.equal(home.featured.length, 15)

  const featuredTab = SkillShelf.plazaDiscoverySections([], { category: 'featured' })
  const featuredTabIds = featuredTab.featured.map((s) => s.id)
  for (const id of SHOPEE_IDS) {
    assert.equal(featuredTabIds.includes(id), false, `精选分类下不得出现 ${id}`)
  }
  assert.equal(featuredTab.featured.length, 65)
})
