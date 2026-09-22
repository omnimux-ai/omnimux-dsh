import assert from 'node:assert/strict'
import test from 'node:test'
import {
  loadLibraryCards,
  mergeLibraryPrompt,
  promptForCard,
  sourcesForTab,
  tabForKind,
} from './library-stage-model.js'

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function mockFetch(routes) {
  const calls = []
  const fetchImpl = async (path) => {
    calls.push(String(path))
    const hit = Object.entries(routes).find(([prefix]) => String(path).startsWith(prefix))
    if (!hit) return jsonResponse(404, {})
    return jsonResponse(hit[1].status || 200, hit[1].body)
  }
  return { fetchImpl, calls }
}

const routes = {
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

test('灵感库只读本地，爆款趋势只读云端，精选四路都读', () => {
  assert.deepEqual(sourcesForTab('inspiration'), ['inspiration'])
  assert.deepEqual(sourcesForTab('trending'), ['trending'])
  assert.deepEqual(sourcesForTab('featured'), ['assets', 'inspiration', 'products', 'trending'])
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

test('精选一路失败时，其余卡片仍然留下', async () => {
  const featured = mockFetch({
    ...routes,
    '/omnimux/inspiration?': { status: 401, body: { error: 'unauthorized' } },
  })
  const result = await loadLibraryCards('featured', { fetchImpl: featured.fetchImpl })
  assert.equal(featured.calls.length, 4)
  assert.deepEqual(result.cards.map((card) => card.lane), ['assets', 'inspiration', 'products'])
  assert.equal(result.errors.trending.code, 'need-login')
})

test('提示词：空则写入，已有文字则追加，同一句不重复', () => {
  const prompt = promptForCard({ lane: 'assets', title: '咖啡机' })
  assert.equal(prompt, '请结合资产「咖啡机」继续创作：')
  assert.equal(mergeLibraryPrompt('', prompt), prompt)
  assert.equal(mergeLibraryPrompt('已有想法', prompt), `已有想法\n${prompt}`)
  assert.equal(mergeLibraryPrompt(`已有想法\n${prompt}`, prompt), `已有想法\n${prompt}`)
  assert.equal(promptForCard({ lane: 'trending', title: '' }), '')
})
