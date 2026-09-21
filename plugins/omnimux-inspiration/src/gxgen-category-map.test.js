import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  OFFICIAL_CATEGORIES,
  inferIndustryFromTags,
  isOfficialCategoryId,
  isProductForm,
  lookupOfficialCategory,
  normalizeCategory,
} from './gxgen-category-map.js'

const EXPECTED_IDS = [
  'baby_parenting',
  'food_beverage',
  'education',
  'fitness_sports',
  'beauty_skincare',
  'fashion',
  'home_living',
  'tech_digital',
  'travel',
  'health_wellness',
  'pets',
  'gaming_entertainment',
  'finance',
  'realestate',
  'emotion_social',
  'legal_consulting',
  'business',
  'other',
]

describe('OFFICIAL_CATEGORIES', () => {
  it('is exactly the 18 gxgen industries in sort_order', () => {
    assert.equal(OFFICIAL_CATEGORIES.length, 18)
    assert.deepEqual(OFFICIAL_CATEGORIES.map((row) => row.id), EXPECTED_IDS)
    assert.equal(OFFICIAL_CATEGORIES[0].zh, '母婴亲子')
    assert.equal(OFFICIAL_CATEGORIES.at(-1).id, 'other')
    assert.equal(OFFICIAL_CATEGORIES.at(-1).zh, '其他')
  })
})

describe('normalizeCategory aliases', () => {
  it('maps official ids, zh names and en names back to the id', () => {
    for (const row of OFFICIAL_CATEGORIES) {
      assert.equal(normalizeCategory(row.id), row.id)
      assert.equal(normalizeCategory(` ${row.id.toUpperCase()} `), row.id)
      assert.equal(normalizeCategory(row.zh), row.id)
      assert.equal(normalizeCategory(row.en), row.id)
      assert.equal(isOfficialCategoryId(row.id), true)
    }
  })

  it('maps genviral English source names', () => {
    assert.equal(normalizeCategory('Fitness'), 'fitness_sports')
    assert.equal(normalizeCategory('  fitness  '), 'fitness_sports')
    assert.equal(normalizeCategory('Health & Wellness'), 'health_wellness')
    assert.equal(normalizeCategory('relationships & lifestyle'), 'emotion_social')
    assert.equal(normalizeCategory('Travel'), 'travel')
    assert.equal(normalizeCategory('Food & Cooking'), 'food_beverage')
    assert.equal(normalizeCategory('Education & Knowledge'), 'education')
    assert.equal(normalizeCategory('Personal Development'), 'education')
    assert.equal(normalizeCategory('Home & Design'), 'home_living')
    assert.equal(normalizeCategory('Arts, Hobbies & Lifestyle'), 'gaming_entertainment')
    assert.equal(normalizeCategory('Uncategorized'), 'other')
  })

  it('maps genshot Chinese source names', () => {
    const home = ['家居用品', '厨房用品', '纺织品和软装', '家用电器', '家具', '家居装修', '工具和五金']
    for (const name of home) assert.equal(normalizeCategory(name), 'home_living', name)
    const fashion = ['女装和内衣', '男装和内衣', '孩子们的时尚', '穆斯林时尚', '鞋类', '箱包', '时尚配饰', '珠宝配饰及衍生品']
    for (const name of fashion) assert.equal(normalizeCategory(name), 'fashion', name)
    assert.equal(normalizeCategory('美容和个人护理'), 'beauty_skincare')
    assert.equal(normalizeCategory('手机和电子产品'), 'tech_digital')
    assert.equal(normalizeCategory('电脑和办公设备'), 'tech_digital')
    assert.equal(normalizeCategory('宠物用品'), 'pets')
    assert.equal(normalizeCategory('婴儿和孕妇用品'), 'baby_parenting')
    assert.equal(normalizeCategory('运动和户外'), 'fitness_sports')
    assert.equal(normalizeCategory('玩具和爱好'), 'gaming_entertainment')
    assert.equal(normalizeCategory('汽车和摩托车'), 'travel')
    assert.equal(normalizeCategory('食品和饮料'), 'food_beverage')
    assert.equal(normalizeCategory('健康'), 'health_wellness')
    assert.equal(normalizeCategory('图书、杂志和音频'), 'education')
    assert.equal(normalizeCategory('二手商品'), 'other')
  })
})

describe('product forms and tag inference', () => {
  it('treats digital / physical / software / service as non-industries', () => {
    for (const form of ['digital', 'physical', 'software', 'service', 'Digital', ' PHYSICAL ']) {
      assert.equal(isProductForm(form), true, form)
      assert.equal(lookupOfficialCategory(form), '')
      assert.equal(normalizeCategory(form), 'other')
    }
  })

  it('infers industry from conservative tags when the raw value is a form', () => {
    assert.equal(normalizeCategory('digital', { tags: ['fitness'] }), 'fitness_sports')
    assert.equal(normalizeCategory('digital', { tags: ['get_fit'] }), 'fitness_sports')
    assert.equal(normalizeCategory('physical', { tags: ['fitness_users'] }), 'fitness_sports')
    assert.equal(normalizeCategory('digital', { tags: ['beauty'] }), 'beauty_skincare')
    assert.equal(normalizeCategory('digital', { tags: ['glow_up'] }), 'beauty_skincare')
    assert.equal(normalizeCategory('software', { tags: ['beauty_users'] }), 'beauty_skincare')
    assert.equal(normalizeCategory('digital', { tags: ['sleep'] }), 'health_wellness')
    assert.equal(normalizeCategory('digital', { tags: ['wellness'] }), 'health_wellness')
    assert.equal(normalizeCategory('digital', { tags: ['anxiety'] }), 'health_wellness')
    assert.equal(normalizeCategory('digital', { tags: ['health'] }), 'health_wellness')
    assert.equal(normalizeCategory('digital', { tags: ['dating'] }), 'emotion_social')
    assert.equal(normalizeCategory('digital', { tags: ['education'] }), 'education')
    assert.equal(normalizeCategory('digital', { tags: ['course'] }), 'education')
    assert.equal(normalizeCategory('digital', { tags: ['study'] }), 'education')
    assert.equal(normalizeCategory('digital', { tags: ['pet'] }), 'pets')
    assert.equal(normalizeCategory('digital', { tags: ['food'] }), 'food_beverage')
    assert.equal(normalizeCategory('digital', { tags: ['recipe'] }), 'food_beverage')
    assert.equal(normalizeCategory('digital', { tags: ['cooking'] }), 'food_beverage')
  })

  it('does not treat bare ai_tool / mobile_app as 数码科技', () => {
    assert.equal(normalizeCategory('digital', { tags: ['ai_tool'] }), 'other')
    assert.equal(normalizeCategory('digital', { tags: ['mobile_app'] }), 'other')
    assert.equal(inferIndustryFromTags(['ai_tool', 'mobile_app']), 'other')
    assert.equal(normalizeCategory('', { tags: ['ai_tool'] }), 'other')
  })

  it('falls back to other when blank or unknown without industry tags', () => {
    assert.equal(normalizeCategory(''), 'other')
    assert.equal(normalizeCategory(null), 'other')
    assert.equal(normalizeCategory('not-a-real-bucket'), 'other')
    assert.equal(normalizeCategory('digital', { tags: [] }), 'other')
  })

  it('prefers an industry alias over tags', () => {
    assert.equal(normalizeCategory('美妆护肤', { tags: ['fitness'] }), 'beauty_skincare')
    assert.equal(normalizeCategory('厨房用品', { tags: ['pet'] }), 'home_living')
  })
})
