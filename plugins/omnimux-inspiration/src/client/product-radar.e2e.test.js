import assert from 'node:assert/strict'
import test from 'node:test'
import { generateRadarKeywordsApi, matchRadarInspirationsApi } from './api.js'

test('product-radar.e2e: 验证客户端与后端雷达接口端到端调用契约', async () => {
  const fakeProduct = {
    name: '5ml便携迷你香水喷雾瓶 (买二送一)',
    brand: 'Comfort Bay',
    selling_points: '底部充装防漏，纳米级喷头',
  }

  assert.equal(typeof generateRadarKeywordsApi, 'function')
  assert.equal(typeof matchRadarInspirationsApi, 'function')

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).includes('/radar/keywords')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          keywords: [
            { id: 'kw_1', keyword: 'Comfort Bay perfume atomizer review', dimension: '真实测评类' },
            { id: 'kw_4', keyword: 'perfume atomizer bottom pump refill hack', dimension: '前后对比类' },
          ],
        }),
      }
    }
    if (String(url).includes('/radar/match')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          items: [
            { id: 'v1', title: 'Bottom pump perfume hack', jev_score: 98, is_outlier: true },
          ],
          analytics: { total_matched: 1, outlier_count: 1 },
        }),
      }
    }
    return originalFetch ? originalFetch(url) : { ok: false, status: 404 }
  }

  try {
    const kwRes = await generateRadarKeywordsApi(fakeProduct)
    assert.equal(kwRes.ok, true)
    assert.equal(kwRes.status, 200)
    assert.equal(kwRes.body.keywords.length, 2)

    const matchRes = await matchRadarInspirationsApi({ keywords: ['perfume atomizer review'] })
    assert.equal(matchRes.ok, true)
    assert.equal(matchRes.status, 200)
    assert.equal(matchRes.body.items.length, 1)
    assert.equal(matchRes.body.items[0].jev_score, 98)
  } finally {
    globalThis.fetch = originalFetch
  }
})
