/**
 * 素材流与灵感库通用瀑布流分列计算纯函数 (Masonry Layout)
 *
 * 核心特性：
 * 1. 纯函数：零 DOM 依赖、零 window 依赖，Node 单测与浏览器均可无损运行；
 * 2. 动态比例解析 (cardRatioOf)：智能推导 9:16（竖视频）、16:9（横视频）、3:4（展台）、1:1（方形）及自定义图；
 * 3. 贪心高度分配 (distributeColumns)：最短列优先，保证多列高度平衡，且保证相同输入分列结果确定；
 * 4. 列数动态反解 (columnsForWidth)：支持断点配置与极小视口边界兜底。
 */

export const DEFAULT_ASPECT_RATIO = 9 / 16
export const CARD_CHROME_RATIO = 0.15

/**
 * 依据卡片信息计算封面或整体宽高比 (width / height)
 * @param {any} card
 * @returns {number}
 */
export function cardRatioOf(card) {
  if (!card || typeof card !== 'object') return DEFAULT_ASPECT_RATIO

  const lane = card.lane || card.raw?.lane
  const raw = card.raw || {}
  const trending = card.trending || raw.trending || {}

  // 1. 显式宽高等比
  const w = Number(raw.coverWidth || raw.width || trending.width)
  const h = Number(raw.coverHeight || raw.height || trending.height)
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return w / h
  }

  // 2. 分辨率字符串解析（例如 "1920x1080", "1080x1920"）
  const resStr = String(raw.resolution || raw.dimensions || trending.resolution || '').trim()
  const match = resStr.match(/^(\d{2,5})\s*[xX*×]\s*(\d{2,5})$/)
  if (match) {
    const rw = Number(match[1])
    const rh = Number(match[2])
    if (rw > 0 && rh > 0) {
      return rw / rh
    }
  }

  // 3. 爆款趋势 (trending)：绝大多数为 9:16 短视频
  if (lane === 'trending' || card.trending) {
    return 9 / 16
  }

  // 4. 灵感库 (inspiration)
  if (lane === 'inspiration') {
    // 默认短视频为主
    return 9 / 16
  }

  // 5. 资产库 (assets)：遵循 3:4 统一展台画幅
  if (lane === 'assets') {
    return 3 / 4
  }

  // 6. 商品库 (products)：遵循 3:4 标准展台
  if (lane === 'products') {
    return 3 / 4
  }

  // 7. 创意模板 (featured)：16:10
  if (lane === 'featured') {
    return 16 / 10
  }

  // 8. 技能卡片 (skills)：1:1
  if (lane === 'skills') {
    return 1 / 1
  }

  return DEFAULT_ASPECT_RATIO
}

/**
 * 列宽归一化为 1 时的等效卡片高度计算
 * @param {number} ratio
 * @returns {number}
 */
export function cardHeightOf(ratio) {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : DEFAULT_ASPECT_RATIO
  return (1 / safeRatio) + CARD_CHROME_RATIO
}

/**
 * 贪心最短列优先分列算法
 *
 * `heightOf` 是可选的真实高度函数（与列累加同一度量单位）。传入时放置决策
 * 直接用它，绕过 `ratioOf → cardHeightOf` 的比例换算——这是给卡片几何
 * 不是「列宽 ÷ 比例 + 卡身系数」的调用方留的缝（例如按真实像素估算的
 * 账号监控瀑布流）。不传时行为与旧版完全一致。
 * @param {any[]} items
 * @param {number} columns
 * @param {(item: any) => number} [ratioOf]
 * @param {(item: any) => number} [heightOf]
 * @returns {any[][]}
 */
export function distributeColumns(items, columns, ratioOf = cardRatioOf, heightOf) {
  const colCount = Math.max(1, Math.floor(Number(columns)) || 1)
  const buckets = Array.from({ length: colCount }, () => [])
  const heights = Array.from({ length: colCount }, () => 0)

  const list = Array.isArray(items) ? items : []
  for (const item of list) {
    let target = 0
    for (let i = 1; i < colCount; i += 1) {
      if (heights[i] < heights[target]) {
        target = i
      }
    }
    buckets[target].push(item)
    heights[target] += typeof heightOf === 'function' ? heightOf(item) : cardHeightOf(ratioOf(item))
  }

  return buckets
}

/**
 * 根据容器实际宽度与配置推导合理列数
 * @param {number} containerWidth
 * @param {object} [options]
 * @param {number} [options.minColWidth=180]
 * @param {number} [options.maxCols=6]
 * @param {number} [options.minCols=2]
 * @param {number} [options.gap=16]
 * @returns {number}
 */
export function columnsForWidth(containerWidth, options = {}) {
  const {
    minColWidth = 180,
    maxCols = 6,
    minCols = 2,
    gap = 16,
  } = options

  const width = Number(containerWidth)
  if (!Number.isFinite(width) || width <= 0) {
    return minCols
  }

  const fit = Math.floor((width + gap) / (minColWidth + gap))
  return Math.max(minCols, Math.min(maxCols, fit))
}
