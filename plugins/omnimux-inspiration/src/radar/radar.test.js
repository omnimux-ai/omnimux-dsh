import test from 'node:test'
import assert from 'node:assert/strict'
import { generateRadarKeywords, RADAR_DIMENSIONS } from './keyword-generator.js'
import { matchInspirationsWithJev, evaluateItemMatch, HOOK_CATEGORIES, generateExternalSocialCandidates } from './radar-matcher.js'
import { createLocalInspirationDispatcher } from '../http-routes.js'

test('keyword-generator: 生成严格 10 组多元化结构化关键词', () => {
  const product = {
    name: '5ml便携迷你香水喷雾瓶 (买二送一)',
    brand: 'Comfort Bay',
    selling_points: '底部充装防漏，纳米级喷头',
  }
  const keywords = generateRadarKeywords(product)
  assert.equal(keywords.length, 10)

  for (const item of keywords) {
    assert.ok(item.id)
    assert.ok(item.dimension)
    assert.ok(item.keyword)
    assert.ok(item.intent)
    assert.ok(item.hook_hint)
  }

  assert.ok(keywords.some((k) => k.keyword.includes('perfume atomizer')))
  assert.ok(keywords.some((k) => k.dimension === '痛点场景类' && k.keyword.includes('TSA airport')))
  assert.ok(keywords.some((k) => k.dimension === '前后对比类' && k.keyword.includes('bottom pump')))
})

test('radar-matcher: Jev 双轨匹配引擎（内库优先+外部社媒补齐保底满足20条）', () => {
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
  
  // 请求 target_min: 20，内库仅2条，必须自动通过外部打捞补齐至 20 条
  const result = matchInspirationsWithJev(testItems, keywords, { target_min: 20, limit: 20 })

  assert.equal(result.items.length, 20, '交付条数必须严格满足 20 条标准')
  assert.equal(result.analytics.total_delivered, 20)
  assert.equal(result.analytics.internal_count, 2)
  assert.equal(result.analytics.external_count, 18)
  assert.ok(result.analytics.dual_track_summary.includes('云端内库 (2条)'))
  assert.ok(result.analytics.dual_track_summary.includes('全网实时打捞 (18条)'))

  // 验证内部与外部标记
  assert.equal(result.items.filter((it) => it.source_track === 'internal').length, 2)
  assert.equal(result.items.filter((it) => it.source_track === 'external').length, 18)

  // 验证每条均有 Jev 分数和钩子分类
  for (const it of result.items) {
    assert.ok(typeof it.jev_score === 'number' && it.jev_score >= 70)
    assert.ok(it.hook_category)
    assert.ok(it.source_platform)
  }
})

test('radar HTTP 路由端点契约测试（支持 target_min）', async () => {
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

  // 测试 Jev 匹配端点（请求 target_min: 20）
  const matchRes = await dispatcher.dispatch({
    method: 'POST',
    url: new URL('http://127.0.0.1/omnimux/inspiration/local/radar/match'),
    body: { keywords: ['perfume atomizer review'], region: 'ALL', target_min: 20 },
  })
  assert.equal(matchRes.status, 200)
  assert.equal(matchRes.body.success, true)
  assert.equal(matchRes.body.items.length, 20)
  assert.equal(matchRes.body.analytics.total_delivered, 20)
})
