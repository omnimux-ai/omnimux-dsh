/**
 * 商品短视频内容雷达与 Jev 爆款匹配 HTTP 处理函数
 */

import { generateRadarKeywords } from './keyword-generator.js'
import { matchInspirationsWithJev } from './radar-matcher.js'

/**
 * 生成 10 维结构化关键词雷达
 * @param {object} args
 */
export async function handleRadarKeywords(args) {
  const req = args.req || args
  const body = req.body || args.body || {}
  const product = body.product || {}
  const keywords = generateRadarKeywords(product)
  return {
    status: 200,
    body: {
      success: true,
      keywords,
    },
  }
}

/**
 * 执行 Jev 多维特征匹配并聚合深度数据分析
 * @param {object} args
 */
export async function handleRadarMatch(args) {
  const req = args.req || args
  const body = req.body || args.body || {}
  const { keywords = [], product = {}, region, limit = 50 } = body
  const store = args.store || args.localStore
  const items = store && typeof store.readAll === 'function' ? store.readAll() : []
  const result = matchInspirationsWithJev(items, keywords, { region, limit })
  return {
    status: 200,
    body: {
      success: true,
      items: result.items,
      analytics: result.analytics,
    },
  }
}
