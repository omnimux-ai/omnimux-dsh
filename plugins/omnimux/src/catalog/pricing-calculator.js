/**
 * OmniMux Dynamic Pricing & Billing Calculator Engine.
 * 
 * Single source of truth for converting upstream model prices (USD)
 * to platform credits/points based on the standard conversion rate:
 * 1 USD = 10 Points (i.e. 1 Point = $0.10 USD).
 */

export const USD_TO_POINTS_RATE = 10

/**
 * Known baseline model unit prices from gateway catalog.
 * Updated to reflect gateway truth (GET /api/pricing).
 */
export const MODEL_BASE_PRICING = Object.freeze({
  // Video - Per Second
  'seedance-2-5': { unitPrice: 0.3143, billingMode: 'per_second', defaultDuration: 5 },
  'seedance-2-0': { unitPrice: 0.0971, billingMode: 'per_second', defaultDuration: 5 },
  'minimax-h3': { unitPrice: 0.0714, billingMode: 'per_second', defaultDuration: 5 },
  'minimax-h3-turbo': { unitPrice: 0.035, billingMode: 'per_second', defaultDuration: 5 },
  'minimax-h3-video': { unitPrice: 0.025, billingMode: 'per_second', defaultDuration: 5 },
  
  // Video - Per Task (Fixed duration packages)
  'seedance-2-5-task': { unitPrice: 0.558824, billingMode: 'per_task', defaultDuration: 30 },
  'seedance-2-0-task': { unitPrice: 0.294118, billingMode: 'per_task', defaultDuration: 30 },
  'minimax-h3-task': { unitPrice: 0.3781, billingMode: 'per_task', defaultDuration: 15 },

  // Image - Per Task (Per Image)
  'gpt-image-2.5': { unitPrice: 0.013072, billingMode: 'per_task' },
  'gpt-image-2.5-flare': { unitPrice: 0.014706, billingMode: 'per_task' },
  'gpt-image-2.5-sunburst': { unitPrice: 0.014706, billingMode: 'per_task' },

  // Audio / Speech - Per Second or Token
  'seed-audio-1.0': { unitPrice: 0.001, billingMode: 'per_second', defaultDuration: 10 },
  'doubao-asr-bigmodel': { unitPrice: 0.0005, billingMode: 'per_second', defaultDuration: 60 },
  'seedasr-auc': { unitPrice: 0.0005, billingMode: 'per_second', defaultDuration: 60 },
  'bigasr-auc': { unitPrice: 0.0005, billingMode: 'per_second', defaultDuration: 60 },
})

/**
 * Calculate estimated points for a given model and parameters.
 *
 * @param {object} params
 * @param {string} params.modelId
 * @param {string} [params.billingMode] 'per_second' | 'per_task' | 'per_token'
 * @param {number} [params.unitPrice] in USD
 * @param {number} [params.groupRatio=1]
 * @param {number} [params.duration] in seconds (for per_second)
 * @param {number} [params.tokens] token count (for per_token)
 * @returns {{ usdCost: number, points: number, formattedPoints: string }}
 */
export function calculatePoints(params = {}) {
  const modelId = typeof params.modelId === 'string' ? params.modelId.trim() : ''
  const base = MODEL_BASE_PRICING[modelId] || {}
  
  const unitPrice = typeof params.unitPrice === 'number' && Number.isFinite(params.unitPrice)
    ? params.unitPrice
    : (base.unitPrice ?? 0)

  const billingMode = params.billingMode || base.billingMode || 'per_task'
  const groupRatio = typeof params.groupRatio === 'number' && Number.isFinite(params.groupRatio)
    ? params.groupRatio
    : 1

  let usdCost = 0

  if (billingMode === 'per_second') {
    const duration = typeof params.duration === 'number' && params.duration > 0
      ? params.duration
      : (base.defaultDuration || 5)
    usdCost = unitPrice * duration * groupRatio
  } else if (billingMode === 'per_task') {
    usdCost = unitPrice * groupRatio
  } else if (billingMode === 'per_token') {
    const tokens = typeof params.tokens === 'number' && params.tokens > 0 ? params.tokens : 1000
    usdCost = (unitPrice / 1000) * tokens * groupRatio
  }

  const points = Math.round(usdCost * USD_TO_POINTS_RATE * 100) / 100
  const formattedPoints = points >= 10 ? `≈${Math.round(points)} 积分` : `≈${points.toFixed(1)} 积分`

  return {
    usdCost,
    points,
    formattedPoints,
  }
}

/**
 * Produce a human-readable billing description for Agent context injection.
 * Enables the Agent to directly understand unit price, billing mode, and typical costs.
 *
 * @param {string} modelId
 * @param {object} [channelGroup]
 * @returns {string}
 */
export function describeModelBilling(modelId, channelGroup) {
  if (!modelId) return ''
  const base = MODEL_BASE_PRICING[modelId]
  if (!base) return ''

  const ratio = channelGroup?.pricing?.discountRate ?? channelGroup?.pricing?.priceRatio ?? 1

  if (base.billingMode === 'per_second') {
    const cost5s = calculatePoints({ modelId, duration: 5, groupRatio: ratio })
    const cost30s = calculatePoints({ modelId, duration: 30, groupRatio: ratio })
    const perSec = (base.unitPrice * ratio * USD_TO_POINTS_RATE).toFixed(1)
    
    return `按秒计费（基准每秒约 ${perSec} 积分；生成 5 秒约 ${Math.round(cost5s.points)} 积分，30 秒约 ${Math.round(cost30s.points)} 积分）`
  }

  if (base.billingMode === 'per_task') {
    const cost = calculatePoints({ modelId, groupRatio: ratio })
    return `按条/按次计费（固定每次 ${cost.formattedPoints}）`
  }

  return '按量计费'
}

/**
 * 依据网关真实单价与分组声明，推导该分组的权威真实预估积分。
 * 单轨真源核心推导器：杜绝任何手工填写失真数字。
 *
 * @param {string} modelId 产品模型 ID
 * @param {object} group 分组配置对象
 * @returns {number|null} 预估积分（遵循统一四舍五入：>=10 取整，<10 保留 1 位小数；无法推导返回 null）
 */
export function resolveGroupEstimatedPoints(modelId, group) {
  if (!modelId || !group) return null
  let wireModel = group.wireModel || modelId
  const base0 = MODEL_BASE_PRICING[wireModel] || MODEL_BASE_PRICING[modelId]
  if (!base0) return null

  const mode = group.pricing?.billingMode || base0.billingMode || 'per_task'
  // 若按次计费但未显式声明 task 后缀，自动关联 task 路线独立定价
  if (mode === 'per_task' && !wireModel.endsWith('-task') && MODEL_BASE_PRICING[`${wireModel}-task`]) {
    wireModel = `${wireModel}-task`
  }

  const base = MODEL_BASE_PRICING[wireModel] || base0
  const ratio = typeof group.pricing?.discountRate === 'number'
    ? group.pricing.discountRate
    : (typeof group.pricing?.priceRatio === 'number' ? group.pricing.priceRatio : 1)
  
  const duration = group.constraints?.parameters?.duration?.fixed ?? base.defaultDuration ?? 5

  const res = calculatePoints({
    modelId: wireModel,
    billingMode: mode,
    groupRatio: ratio,
    duration,
  })

  if (typeof res.points !== 'number' || !Number.isFinite(res.points)) return null

  if (res.points >= 10) {
    return Math.round(res.points)
  }
  return Math.round(res.points * 10) / 10
}
