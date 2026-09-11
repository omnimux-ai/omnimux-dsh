/**
 * OmniMux Model Channel Groups and Routing Strategies.
 * Supports Brand -> Model ID -> Channel Group hierarchical routing,
 * with 'auto', 'stability_first', and 'cost_first' dispatching policies.
 */

import { gatewayCandidates, toProductId } from './id-universe.js'

export const ROUTING_STRATEGIES = Object.freeze(['auto', 'stability_first', 'cost_first'])

/**
 * Standard group catalog definitions per model family / model ID.
 * Metadata aligns with production gateway GroupRatio, pricing, and SLA metrics.
 */
export const MODEL_CHANNEL_GROUPS = Object.freeze({
  // Seedance 2.0 / 2.5 Family
  'seedance-2-0': [
    {
      id: 'pro',
      label: '进阶版',
      badge: '9.7折 · 满血真人 · 专属素材库',
      pricing: { pointsEstimate: 3476, discountRate: 0.97, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 60 },
      wireGroup: 'seedance-pro',
      enabled: true,
    },
    {
      id: 'official',
      label: '官方版',
      badge: '原生态不加价',
      pricing: { pointsEstimate: 3568, discountRate: 1.0, billingMode: 'per_second' },
      sla: { stability24h: 67, avgWaitTimeSec: 90 },
      wireGroup: 'official',
      enabled: true,
    },
    {
      id: 'preferred',
      label: '优选版',
      badge: '5.8折 · 限时特惠',
      pricing: { pointsEstimate: 1560, discountRate: 0.58, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 180 },
      wireGroup: 'seedance-standard',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '5.2折 · 限时特惠',
      pricing: { pointsEstimate: 1040, discountRate: 0.52, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 180 },
      wireGroup: 'standard',
      enabled: true,
    },
    {
      id: 'cheap',
      label: '特惠版',
      badge: '按条计费 · 时长同价',
      pricing: { pointsEstimate: 800, discountRate: 0.25, billingMode: 'per_task' },
      sla: { stability24h: 100, avgWaitTimeSec: 120 },
      wireGroup: 'seedance-cheap',
      enabled: true,
    },
  ],
  'seedance-2-0-fast': [
    {
      id: 'pro',
      label: '进阶版',
      badge: '极速出片 · 满血真人',
      pricing: { pointsEstimate: 2900, discountRate: 0.95, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 30 },
      wireGroup: 'seedance-pro',
      enabled: true,
    },
    {
      id: 'official',
      label: '官方版',
      badge: '官方原生通道',
      pricing: { pointsEstimate: 3000, discountRate: 1.0, billingMode: 'per_second' },
      sla: { stability24h: 85, avgWaitTimeSec: 45 },
      wireGroup: 'official',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '5.2折 · 高性价比',
      pricing: { pointsEstimate: 950, discountRate: 0.52, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 60 },
      wireGroup: 'standard',
      enabled: true,
    },
    {
      id: 'cheap',
      label: '特惠版',
      badge: '排队约2min',
      pricing: { pointsEstimate: 750, discountRate: 0.25, billingMode: 'per_task' },
      sla: { stability24h: 98, avgWaitTimeSec: 120 },
      wireGroup: 'seedance-cheap',
      enabled: true,
    },
  ],
  'seedance-2-5': [
    {
      id: 'pro',
      label: '进阶版',
      badge: '全新2.5旗舰 · 满血画质',
      pricing: { pointsEstimate: 4200, discountRate: 0.95, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 60 },
      wireGroup: 'seedance-pro',
      enabled: true,
    },
    {
      id: 'official',
      label: '官方版',
      badge: '官方原生通道',
      pricing: { pointsEstimate: 4400, discountRate: 1.0, billingMode: 'per_second' },
      sla: { stability24h: 80, avgWaitTimeSec: 90 },
      wireGroup: 'official',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '限时特惠',
      pricing: { pointsEstimate: 1800, discountRate: 0.55, billingMode: 'per_second' },
      sla: { stability24h: 99, avgWaitTimeSec: 150 },
      wireGroup: 'seedance-standard',
      enabled: true,
    },
  ],
  // Claude Family
  'claude-opus-4-6': [
    {
      id: 'claude-max-open',
      label: '顶配满血版',
      badge: '高优先级专线 · 无限速',
      pricing: { pointsEstimate: 3140, discountRate: 3.14, billingMode: 'per_token' },
      sla: { stability24h: 100, avgWaitTimeSec: 3 },
      wireGroup: 'claude-max-open',
      enabled: true,
    },
    {
      id: 'claude-plus',
      label: '进阶增强版',
      badge: '快速响应 · 专属企业池',
      pricing: { pointsEstimate: 1430, discountRate: 1.43, billingMode: 'per_token' },
      sla: { stability24h: 100, avgWaitTimeSec: 5 },
      wireGroup: 'claude-plus',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '标准公网池 · 高性价比',
      pricing: { pointsEstimate: 1000, discountRate: 1.0, billingMode: 'per_token' },
      sla: { stability24h: 98, avgWaitTimeSec: 10 },
      wireGroup: 'standard',
      enabled: true,
    },
  ],
  // DeepSeek Family
  'deepseek-v4-flash-vision-exp': [
    {
      id: 'deepseek-official',
      label: '官方直连版',
      badge: '满血低延时 · 官方通道',
      pricing: { pointsEstimate: 1430, discountRate: 1.43, billingMode: 'per_token' },
      sla: { stability24h: 100, avgWaitTimeSec: 2 },
      wireGroup: 'deepseek-official',
      enabled: true,
    },
    {
      id: 'default',
      label: '标准版',
      badge: '基础费率 · 极速分流',
      pricing: { pointsEstimate: 1000, discountRate: 1.0, billingMode: 'per_token' },
      sla: { stability24h: 99, avgWaitTimeSec: 4 },
      wireGroup: 'default',
      enabled: true,
    },
  ],
  // Kling Family
  'kling': [
    {
      id: 'pro',
      label: '专业版',
      badge: '极速生成 · 高清专线',
      pricing: { pointsEstimate: 2400, discountRate: 1.2, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 40 },
      wireGroup: 'kling-pro',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '8.5折 · 稳定经济',
      pricing: { pointsEstimate: 1700, discountRate: 0.85, billingMode: 'per_second' },
      sla: { stability24h: 98, avgWaitTimeSec: 80 },
      wireGroup: 'kling-standard',
      enabled: true,
    },
  ],
  // MiniMax Family
  'minimax-h3': [
    {
      id: 'pro',
      label: '专业版',
      badge: '专属通道 · 优先排队',
      pricing: { pointsEstimate: 2200, discountRate: 1.1, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 50 },
      wireGroup: 'minimax-pro',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '8.0折 · 经济普惠',
      pricing: { pointsEstimate: 1600, discountRate: 0.8, billingMode: 'per_second' },
      sla: { stability24h: 99, avgWaitTimeSec: 90 },
      wireGroup: 'minimax-standard',
      enabled: true,
    },
  ],
})

/**
 * Split a model reference like "seedance-2-0@standard" into model and group.
 * @param {unknown} input
 * @returns {{ modelId: string, group: string | null }}
 */
export function parseModelAndGroup(input) {
  if (typeof input !== 'string') return { modelId: '', group: null }
  const trimmed = input.trim()
  const atIndex = trimmed.indexOf('@')
  if (atIndex < 0) {
    return { modelId: toProductId(trimmed), group: null }
  }
  const rawModel = trimmed.slice(0, atIndex).trim()
  const rawGroup = trimmed.slice(atIndex + 1).trim()
  const modelId = toProductId(rawModel)
  if (!modelId) return { modelId: '', group: null }
  return {
    modelId,
    group: rawGroup || null,
  }
}

/**
 * Get channel groups available for a model.
 * @param {string} modelId
 * @returns {Array<typeof MODEL_CHANNEL_GROUPS[string][number]>}
 */
export function getModelChannelGroups(modelId) {
  const canonical = toProductId(modelId)
  return structuredClone(MODEL_CHANNEL_GROUPS[canonical] ?? [])
}

/**
 * Calculate auto ranking score for a channel group (stability weight 70%, cost weight 30%).
 * Higher score = higher priority.
 */
function calculateAutoScore(group) {
  const stabilityPart = (group.sla?.stability24h ?? 80) * 0.7
  const price = group.pricing?.pointsEstimate ?? 1000
  // Normalized inverse price score (0..30)
  const pricePart = Math.max(0, 30 - (price / 200))
  return stabilityPart + pricePart
}

/**
 * Resolve ordered gateway model candidates considering strategy and channel groups.
 * @param {string} modelId
 * @param {{
 *   strategy?: 'auto' | 'stability_first' | 'cost_first' | string,
 *   group?: string,
 *   allowedGroups?: string[],
 * }} [options]
 * @returns {string[]}
 */
export function resolveChannelCandidates(modelId, options = {}) {
  const { modelId: canonicalModel, group: inlineGroup } = parseModelAndGroup(modelId)
  if (!canonicalModel) return []

  const requestedGroup = inlineGroup || (typeof options.group === 'string' ? options.group.trim() : '')
  const strategy = ROUTING_STRATEGIES.includes(options.strategy) ? options.strategy : 'auto'
  const groups = getModelChannelGroups(canonicalModel)

  // 1. If an explicit group is requested, put target group first
  if (requestedGroup) {
    const matched = groups.find((g) => g.id === requestedGroup || g.wireGroup === requestedGroup)
    const targetWire = matched ? (matched.wireGroup || matched.id) : requestedGroup
    const primary = `${canonicalModel}@${targetWire}`

    // Failover fallbacks from remaining groups
    const remaining = groups
      .filter((g) => g.id !== requestedGroup && g.wireGroup !== requestedGroup && g.enabled)
      .map((g) => `${canonicalModel}@${g.wireGroup || g.id}`)

    return [...new Set([primary, ...remaining, canonicalModel])]
  }

  // 2. If no configured groups exist for this model, fall back to base gateway candidates
  if (groups.length === 0) {
    return gatewayCandidates(canonicalModel)
  }

  // 3. Filter allowed groups if specified
  let candidatePool = groups.filter((g) => g.enabled)
  if (Array.isArray(options.allowedGroups) && options.allowedGroups.length > 0) {
    const allowed = new Set(options.allowedGroups.map((g) => String(g).trim().toLowerCase()))
    const filtered = candidatePool.filter((g) => allowed.has(g.id.toLowerCase()) || (g.wireGroup && allowed.has(g.wireGroup.toLowerCase())))
    if (filtered.length > 0) {
      candidatePool = filtered
    }
  }

  // 4. Sort according to strategy
  const pool = [...candidatePool]
  if (strategy === 'stability_first') {
    pool.sort((a, b) => {
      const stabDiff = (b.sla?.stability24h ?? 0) - (a.sla?.stability24h ?? 0)
      if (stabDiff !== 0) return stabDiff
      return (a.sla?.avgWaitTimeSec ?? 0) - (b.sla?.avgWaitTimeSec ?? 0)
    })
  } else if (strategy === 'cost_first') {
    pool.sort((a, b) => (a.pricing?.pointsEstimate ?? 0) - (b.pricing?.pointsEstimate ?? 0))
  } else {
    // 'auto': composite score
    pool.sort((a, b) => calculateAutoScore(b) - calculateAutoScore(a))
  }

  const result = pool.map((g) => `${canonicalModel}@${g.wireGroup || g.id}`)
  // Add base canonical model as final fallback
  return [...new Set([...result, canonicalModel])]
}
