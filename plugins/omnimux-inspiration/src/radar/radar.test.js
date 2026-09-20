import test from 'node:test'
import assert from 'node:assert/strict'
import { generateRadarKeywords, RADAR_DIMENSIONS } from './keyword-generator.js'
import { matchInspirationsWithJev, evaluateItemMatch, HOOK_CATEGORIES } from './radar-matcher.js'
import { createLocalInspirationDispatcher } from '../http-routes.js'

test('keyword-generator: 生成严格 10 组多元化结构化关键词', () => {
  const product = {
    name: '5ml便携迷你香水喷雾瓶 (买二送一)',
    brand: 'Comfort Bay',
    selling_points: '底部充装防漏，纳米级喷头',
  }
  const keywords = generateRadarKeywords(product)
  assert.equal(keywords.length, 10)

  // 验证每个对象都包含 id, dimension, keyword, intent, hook_hint
  for (const item of keywords) {
    assert.ok(item.id)
    assert.ok(item.dimension)
    assert.ok(item.keyword)
    assert.ok(item.intent)
    assert.ok(item.hook_hint)
  }

  // 验证包含香水瓶核心词
  assert.ok(keywords.some((k) => k.keyword.includes('perfume atomizer')))
  assert.ok(keywords.some((k) => k.dimension === '痛点场景类' && k.keyword.includes('TSA airport')))
  assert.ok(keywords.some((k) => k.dimension === '前后对比类' && k.keyword.includes('bottom pump')))
})

test('radar-matcher: Jev 匹配算法与 6 大数据分析维度聚合', () => {
  const testItems = [
    {
      id: 'insp_1',
      title: 'Stop carrying heavy bottles! Refill bottom pump in 3 seconds',
      content: 'Never leak perfume bottom pump decant hack',
      views: 10000000,
      country_code: 'US',
    },
    {
      id: 'insp_2',
      title: 'TSA airport confiscated my perfume hack',
      content: 'travel perfume atomizer mini 5ml',
      views: 500000,
      country_code: 'GB',
    },
  ]

  const keywords = ['perfume atomizer bottom pump refill hack', 'travel perfume bottle TSA airport hack']
  const result = matchInspirationsWithJev(testItems, keywords, { limit: 10 })

  assert.ok(result.items.length >= 2)
  assert.ok(result.items[0].jev_score >= 70)
  assert.ok(result.items[0].hook_category)
  assert.ok(typeof result.items[0].is_outlier === 'boolean')

  // 验证 6 大分析看板结构
  assert.ok(result.analytics.total_matched > 0)
  assert.ok(Array.isArray(result.analytics.hooks_summary))
  assert.ok(result.analytics.shop_insights.best_price_range)
  assert.ok(result.analytics.posting_heatmap.peak_window)
  assert.ok(Array.isArray(result.analytics.top_creators))
})

test('radar HTTP 路由端点契约测试', async () => {
  const fakeStore = {
    paths: { libraryFile: '/tmp/test.json', mediaDir: '/tmp' },
    readAll: () => [
      { id: 'item_1', title: 'Test perfume spray bottle refill', views: 2000000 },
    ],
  }

  const dispatcher = createLocalInspirationDispatcher({
    localStore: fakeStore,
  })

  // 测试关键词生成端点
  const kwRes = await dispatcher.dispatch({
    method: 'POST',
    url: new URL('http://127.0.0.1/omnimux/inspiration/local/radar/keywords'),
    body: { product: { name: '5ml 香水瓶', brand: 'Comfort Bay' } },
  })
  assert.equal(kwRes.status, 200)
  assert.equal(kwRes.body.success, true)
  assert.equal(kwRes.body.keywords.length, 10)

  // 测试 Jev 匹配端点
  const matchRes = await dispatcher.dispatch({
    method: 'POST',
    url: new URL('http://127.0.0.1/omnimux/inspiration/local/radar/match'),
    body: { keywords: ['perfume atomizer review'], region: 'ALL' },
  })
  assert.equal(matchRes.status, 200)
  assert.equal(matchRes.body.success, true)
  assert.ok(matchRes.body.items.length > 0)
  assert.ok(matchRes.body.analytics.total_matched > 0)
})
