import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import {
  loadLibraryCards,
  loadTrending,
  loadInspiration,
  mergeLibraryPrompt,
  promptForCard,
  sourcesForTab,
  tabForKind,
} from './library-stage-model.js'
import { resetCreativeTemplates } from '../session-guide/templates/creative-templates-client.js'

const SNAPSHOT_VERSION = 'a'.repeat(64)

beforeEach(() => {
  resetCreativeTemplates()
})

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function mockFetch(routes) {
  const calls = []
  const callsWithOptions = []
  const fetchImpl = async (path, options) => {
    calls.push(String(path))
    callsWithOptions.push({ path: String(path), options })
    const hit = Object.entries(routes).find(([prefix]) => String(path).startsWith(prefix))
    if (!hit) return jsonResponse(404, {})
    return jsonResponse(hit[1].status || 200, hit[1].body)
  }
  return { fetchImpl, calls, callsWithOptions }
}

const routes = {
  '/omnimux/templates/creative': {
    body: {
      schemaVersion: 1,
      dataVersion: SNAPSHOT_VERSION,
      items: [{ id: 'tpl-1', title: '大屏广告', titleZh: '大屏广告' }],
    },
  },
  '/omnimux/assets/library': { body: { assets: [{ id: 'asset-1', name: '咖啡机' }] } },
  '/omnimux/products': { body: { products: [{ id: 'prod-1', name: '香水' }] } },
  '/omnimux/inspiration/local': {
    body: { data: { items: [{ id: 'local-1', title: '本地藤编', is_local: true }] } },
  },
  '/omnimux/inspiration?': {
    body: { data: { items: [{ id: 'cloud-1', title: '云端街拍', views: 12000 }] } },
  },
}

test('三个素材入口分别打开资产库、灵感库、产品库', () => {
  assert.equal(tabForKind('library'), 'assets')
  assert.equal(tabForKind('inspiration'), 'inspiration')
  assert.equal(tabForKind('product'), 'products')
})

test('灵感库只读本地，爆款趋势只读云端，精选读创意模板快照', () => {
  assert.deepEqual(sourcesForTab('inspiration'), ['inspiration'])
  assert.deepEqual(sourcesForTab('trending'), ['trending'])
  assert.deepEqual(sourcesForTab('featured'), ['featured'])
})

test('灵感库请求不打云端，爆款趋势请求不打本地', async () => {
  const local = mockFetch(routes)
  const localResult = await loadLibraryCards('inspiration', { fetchImpl: local.fetchImpl })
  assert.equal(local.calls.length, 1)
  assert.match(local.calls[0], /^\/omnimux\/inspiration\/local/)
  assert.equal(localResult.cards[0].lane, 'inspiration')
  assert.equal(localResult.cards[0].title, '本地藤编')

  const cloud = mockFetch(routes)
  const cloudResult = await loadLibraryCards('trending', { fetchImpl: cloud.fetchImpl })
  assert.equal(cloud.calls.length, 1)
  assert.match(cloud.calls[0], /^\/omnimux\/inspiration\?/)
  assert.equal(cloud.calls.some((path) => path.includes('/local')), false)
  assert.equal(cloudResult.cards[0].lane, 'trending')
  assert.equal(cloudResult.cards[0].raw.is_local, false)
})

test('精选卡片来自创意模板快照，featured 优先', async () => {
  const featured = mockFetch(routes)
  const result = await loadLibraryCards('featured', { fetchImpl: featured.fetchImpl })
  assert.equal(featured.calls.length, 1)
  assert.match(featured.calls[0], /^\/omnimux\/templates\/creative/)
  assert.equal(result.cards.length > 0, true)
  assert.ok(result.cards.every((card) => card.lane === 'featured'))
})

test('创意模板快照失败时不崩溃，错误计入 featured lane', async () => {
  const featured = mockFetch({
    ...routes,
    '/omnimux/templates/creative': {
      status: 503,
      body: { error: 'templates-unavailable' },
    },
  })
  const result = await loadLibraryCards('featured', { fetchImpl: featured.fetchImpl })
  assert.equal(featured.calls.length, 1)
  assert.deepEqual(result.cards, [])
  assert.ok(result.errors.featured, '快照失败必须产生 featured lane 错误')
})

test('提示词：空则写入，已有文字则追加，同一句不重复', () => {
  const prompt = promptForCard({ lane: 'assets', title: '咖啡机' })
  assert.equal(prompt, '请结合资产「咖啡机」继续创作：')
  assert.equal(mergeLibraryPrompt('', prompt), prompt)
  assert.equal(mergeLibraryPrompt('已有想法', prompt), `已有想法\n${prompt}`)
  assert.equal(mergeLibraryPrompt(`已有想法\n${prompt}`, prompt), `已有想法\n${prompt}`)
  assert.equal(promptForCard({ lane: 'trending', title: '' }), '')
})

test('loadLibraryCards 支持解构 page, pageSize, category, search, signal，并返回 { cards, errors, lanes, hasMore, page, total }', async () => {
  const mock = mockFetch({
    '/omnimux/inspiration?': {
      body: {
        data: {
          items: [
            { id: 'item-1', title: '美妆1', views: 100 },
            { id: 'item-2', title: '美妆2', views: 200 },
          ],
          total: 10,
        },
      },
    },
  })
  const controller = new AbortController()
  const result = await loadLibraryCards('trending', {
    page: 2,
    pageSize: 2,
    category: 'beauty-personal',
    search: '唇膏',
    signal: controller.signal,
    fetchImpl: mock.fetchImpl,
  })

  // 验证返回结构包含 cards, errors, lanes, hasMore, page, total
  assert.equal(result.page, 2)
  assert.equal(result.total, 10)
  assert.equal(result.hasMore, true) // page 2, limit 2: accumulatedCount = 2 + 2 = 4 < 10
  assert.deepEqual(result.lanes, ['trending'])
  assert.equal(result.cards.length, 2)
  assert.equal(result.cards[0].lane, 'trending')
  assert.equal(result.cards[0].title, '美妆1')

  // 验证请求 URL 包含了 page, page_size, 与解析后的 category 枚举
  assert.equal(mock.calls.length, 1)
  assert.equal(
    mock.calls[0],
    '/omnimux/inspiration?sort=views&page=2&page_size=2&projection=lean&category=beauty_skincare',
  )
  assert.equal(mock.callsWithOptions[0].options?.signal, controller.signal)
})

test('loadTrending 支持分类映射与 query 拼接（ID、中文名、all、空值）', async () => {
  const mock = mockFetch({
    '/omnimux/inspiration?': {
      body: { data: { items: [{ id: 'trend-1', title: '爆款' }], total: 1 } },
    },
  })

  // 1. 中文分类名映射：'服饰时尚' -> 'fashion'
  await loadTrending(mock.fetchImpl, 10, { page: 1, category: '服饰时尚' })
  assert.match(mock.calls.at(-1), /&category=fashion$/)

  // 2. 二级分类 ID 映射：'food-drinks' -> 'food_beverage'
  await loadTrending(mock.fetchImpl, 10, { page: 3, category: 'food-drinks' })
  assert.match(mock.calls.at(-1), /page=3&page_size=10&projection=lean&category=food_beverage$/)

  // 3. 'all' 分类不应拼接 category query
  await loadTrending(mock.fetchImpl, 10, { page: 1, category: 'all' })
  assert.equal(mock.calls.at(-1).includes('category='), false)

  // 4. 空分类不应拼接 category query
  await loadTrending(mock.fetchImpl, 10, { page: 1, category: '' })
  assert.equal(mock.calls.at(-1).includes('category='), false)
})

test('loadTrending 分页 hasMore 判定规则完备性测试', async () => {
  // 规则 1：items >= limit 且 accumulatedCount < total -> hasMore: true
  const mock1 = mockFetch({
    '/omnimux/inspiration?': {
      body: {
        data: {
          items: [{ id: '1' }, { id: '2' }],
          total: 5,
        },
      },
    },
  })
  const res1 = await loadTrending(mock1.fetchImpl, 2, { page: 1 })
  assert.equal(res1.hasMore, true)
  assert.equal(res1.total, 5)

  // 规则 2：items >= limit 但 accumulatedCount >= total -> hasMore: false
  const mock2 = mockFetch({
    '/omnimux/inspiration?': {
      body: {
        data: {
          items: [{ id: '1' }, { id: '2' }],
          total: 2,
        },
      },
    },
  })
  const res2 = await loadTrending(mock2.fetchImpl, 2, { page: 1 })
  assert.equal(res2.hasMore, false)
  assert.equal(res2.total, 2)

  // 规则 3：items < limit -> hasMore: false
  const mock3 = mockFetch({
    '/omnimux/inspiration?': {
      body: {
        data: {
          items: [{ id: '1' }],
          total: 5,
        },
      },
    },
  })
  const res3 = await loadTrending(mock3.fetchImpl, 2, { page: 2 })
  assert.equal(res3.hasMore, false)

  // 规则 4：items.length === 0 -> hasMore: false
  const mock4 = mockFetch({
    '/omnimux/inspiration?': {
      body: {
        data: {
          items: [],
          total: 0,
        },
      },
    },
  })
  const res4 = await loadTrending(mock4.fetchImpl, 2, { page: 1 })
  assert.equal(res4.hasMore, false)

  // 规则 5：服务端无 total 字段，当 items >= limit 且 > 0 -> hasMore: true
  const mock5 = mockFetch({
    '/omnimux/inspiration?': {
      body: {
        data: {
          items: [{ id: '1' }, { id: '2' }],
        },
      },
    },
  })
  const res5 = await loadTrending(mock5.fetchImpl, 2, { page: 1 })
  assert.equal(res5.hasMore, true)
  assert.equal(res5.total, undefined)
})

test('loadInspiration 支持 page, category, signal 并返回 hasMore 与 total', async () => {
  const mock = mockFetch({
    '/omnimux/inspiration/local': {
      body: {
        data: {
          items: [
            { id: 'insp-1', title: '本地创意1', is_local: true },
            { id: 'insp-2', title: '本地创意2', is_local: true },
          ],
          total: 6,
        },
      },
    },
  })
  const controller = new AbortController()
  const result = await loadInspiration(mock.fetchImpl, 2, {
    page: 1,
    category: 'viral-videos',
    signal: controller.signal,
  })

  assert.equal(result.hasMore, true)
  assert.equal(result.total, 6)
  assert.equal(result.length, 2)
  assert.equal(
    mock.calls[0],
    '/omnimux/inspiration/local?sort=hot&page=1&page_size=2&projection=lean&category=viral-videos',
  )
  assert.equal(mock.callsWithOptions[0].options?.signal, controller.signal)
})
