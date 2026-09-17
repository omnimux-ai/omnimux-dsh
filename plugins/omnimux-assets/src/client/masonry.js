/**
 * 资产中心瀑布流分列。
 *
 * 封面不再塞进固定高度的框：卡片高度随原始比例走，网格因此变成列。每次把当前
 * 累计高度最小的那一列作为目标（相等时取最左），同一批输入的分列结果确定；
 * 追加只影响尾部——先前元素的列索引不会变化。
 *
 * 纯函数：不读 DOM、不读 window，列数与比例由调用方传入。
 */

import { coverRatioCache } from './ratio-cache.js'

/** 目录没有宽高字段、图片也还没到达时的兜底：角色立绘主流是 9:16。 */
export const MASONRY_DEFAULT_RATIO = 9 / 16

/**
 * 纯语音色块的等效比例。色块高度固定 112px，按最小列宽 260px 反解，
 * 分列时才不会把语音卡当成一张超高立绘。
 */
export const MASONRY_AUDIO_RATIO = 260 / 112

/**
 * 卡身（标题行）相对列宽的附加高度。最小列宽 260、标题区约 48，
 * 分列时把这块算进去，列高才接近真实排版。
 */
export const MASONRY_CHROME = 48 / 260

/**
 * 封面宽高比（宽 / 高）。
 *
 * 已知实测/缓存值优先；其次读目录上的宽高字段；纯语音色块走固定等效比例；
 * 都没有时回落默认立绘比例。非法数字一律回落，不抛错。
 * @param {any} asset
 * @param {Record<string, number>} [known]
 * @returns {number}
 */
export function coverRatioOf(asset, known) {
  const id = asset?.id
  if (id != null) {
    if (known) {
      const cached = Number(known[id])
      if (Number.isFinite(cached) && cached > 0) return cached
    }
    const persisted = coverRatioCache.get(id)
    if (Number.isFinite(persisted) && persisted > 0) return persisted
  }
  const width = Number(asset?.coverWidth ?? asset?.width)
  const height = Number(asset?.coverHeight ?? asset?.height)
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return width / height
  }
  if (asset?.hasCover !== true && asset?.mediaType === 'audio') return MASONRY_AUDIO_RATIO
  return MASONRY_DEFAULT_RATIO
}

/**
 * 一张卡在列宽归一为 1 时的估算高度（封面 1/比例 + 卡身）。
 * @param {number} ratio
 */
export function cardHeightOf(ratio) {
  const value = Number(ratio)
  const safe = Number.isFinite(value) && value > 0 ? value : MASONRY_DEFAULT_RATIO
  return 1 / safe + MASONRY_CHROME
}

/**
 * 最短列优先分列。
 * @param {any[]} items
 * @param {number} columns
 * @param {(item: any) => number} [ratioOf]
 * @returns {any[][]}
 */
export function distributeColumns(items, columns, ratioOf = coverRatioOf) {
  const count = Math.max(1, Math.floor(Number(columns)) || 1)
  const buckets = Array.from({ length: count }, () => [])
  const heights = Array.from({ length: count }, () => 0)
  const list = Array.isArray(items) ? items : []
  for (const item of list) {
    let target = 0
    for (let index = 1; index < count; index += 1) {
      if (heights[index] < heights[target]) target = index
    }
    buckets[target].push(item)
    heights[target] += cardHeightOf(ratioOf(item))
  }
  return buckets
}

/**
 * 各列估算高度，列宽归一为 1。用于均衡性断言。
 * @param {any[][]} buckets
 * @param {(item: any) => number} [ratioOf]
 * @returns {number[]}
 */
export function columnHeights(buckets, ratioOf = coverRatioOf) {
  return (Array.isArray(buckets) ? buckets : []).map((column) => (
    (Array.isArray(column) ? column : []).reduce((sum, item) => sum + cardHeightOf(ratioOf(item)), 0)
  ))
}

/**
 * 每个元素落到第几列。追加稳定性测试用：先前 id 的列索引不得变化。
 * @param {any[]} items
 * @param {number} columns
 * @param {(item: any) => number} [ratioOf]
 * @returns {Map<any, number>}
 */
export function columnIndexById(items, columns, ratioOf = coverRatioOf) {
  const map = new Map()
  const buckets = distributeColumns(items, columns, ratioOf)
  buckets.forEach((column, index) => {
    for (const item of column) map.set(item?.id, index)
  })
  return map
}
