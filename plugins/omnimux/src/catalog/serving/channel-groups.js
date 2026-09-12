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
  // ---- 以下 8 个模型的渠道分组来自网关公开定价元数据 ----
  // 来源：GET https://api.omnimux.ai/api/pricing（公开，无需鉴权）
  // 取数：model.enable_groups（去掉 auto）+ group_ratio + usable_group 中文名
  // 说明：pointsEstimate 置空（网关不提供积分口径），价格以 priceRatio 表示；
  //      SLA（24h 稳定率 / 等待时间）该接口不提供，故整体缺省，UI 显示「暂无数据」。
  'gemini-3.8-flash': [
    {
      id: 'standard',
      label: '标准版 · standard',
      pricing: { pointsEstimate: null, priceRatio: 1, billingMode: 'per_token' },
      wireGroup: 'standard',
      enabled: true,
    },
    {
      id: 'cheap',
      label: '特惠版',
      pricing: { pointsEstimate: null, priceRatio: 0.5, billingMode: 'per_token' },
      wireGroup: 'cheap',
      enabled: true,
    },
    {
      id: 'default',
      label: '标准版 · default',
      pricing: { pointsEstimate: null, priceRatio: 1, billingMode: 'per_token' },
      wireGroup: 'default',
      enabled: true,
    },
    {
      id: 'gemini-cheap',
      label: 'Gemini 特惠版',
      pricing: { pointsEstimate: null, priceRatio: 0.3, billingMode: 'per_token' },
      wireGroup: 'gemini-cheap',
      enabled: true,
    },
  ],
  'gpt-5.5': [
    {
      id: 'codex-pro-open',
      label: 'Codex Pro',
      pricing: { pointsEstimate: null, priceRatio: 0.857143, billingMode: 'per_token' },
      wireGroup: 'codex-pro-open',
      enabled: true,
    },
    {
      id: 'default',
      label: '标准版 · default',
      pricing: { pointsEstimate: null, priceRatio: 1, billingMode: 'per_token' },
      wireGroup: 'default',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版 · standard',
      pricing: { pointsEstimate: null, priceRatio: 1, billingMode: 'per_token' },
      wireGroup: 'standard',
      enabled: true,
    },
  ],
  'gpt-image-2.5': [
    {
      id: 'cheap',
      label: '特惠版',
      pricing: { pointsEstimate: null, priceRatio: 0.5, billingMode: 'per_task' },
      wireGroup: 'cheap',
      enabled: true,
    },
    {
      id: 'default',
      label: '标准版',
      pricing: { pointsEstimate: null, priceRatio: 1, billingMode: 'per_task' },
      wireGroup: 'default',
      enabled: true,
    },
  ],
  'seedance-2-0-mini': [
    {
      id: 'minimax-pro',
      label: '海螺 MiniMax 进阶版',
      pricing: { pointsEstimate: null, priceRatio: 1.1, billingMode: 'per_task' },
      wireGroup: 'minimax-pro',
      enabled: true,
    },
    {
      id: 'sd-standard',
      label: 'sd-standard',
      pricing: { pointsEstimate: null, priceRatio: null, billingMode: 'per_task' },
      wireGroup: 'sd-standard',
      enabled: true,
    },
    {
      id: 'sd-pro',
      label: 'sd-pro',
      pricing: { pointsEstimate: null, priceRatio: null, billingMode: 'per_task' },
      wireGroup: 'sd-pro',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版 · standard',
      pricing: { pointsEstimate: null, priceRatio: 1, billingMode: 'per_task' },
      wireGroup: 'standard',
      enabled: true,
    },
    {
      id: 'default',
      label: '标准版 · default',
      pricing: { pointsEstimate: null, priceRatio: 1, billingMode: 'per_task' },
      wireGroup: 'default',
      enabled: true,
    },
    {
      id: 'kling-pro',
      label: '可灵 Kling 进阶版',
      pricing: { pointsEstimate: null, priceRatio: 1.2, billingMode: 'per_task' },
      wireGroup: 'kling-pro',
      enabled: true,
    },
    {
      id: 'kling-standard',
      label: '可灵 Kling 标准版',
      pricing: { pointsEstimate: null, priceRatio: 0.85, billingMode: 'per_task' },
      wireGroup: 'kling-standard',
      enabled: true,
    },
  ],
  'wan-3.0': [
    {
      id: 'cheap',
      label: '特惠版',
      pricing: { pointsEstimate: null, priceRatio: 0.5, billingMode: 'per_task' },
      wireGroup: 'cheap',
      enabled: true,
    },
    {
      id: 'default',
      label: '标准版 · default',
      pricing: { pointsEstimate: null, priceRatio: 1, billingMode: 'per_task' },
      wireGroup: 'default',
      enabled: true,
    },
    {
      id: 'kling-pro',
      label: '可灵 Kling 进阶版',
      pricing: { pointsEstimate: null, priceRatio: 1.2, billingMode: 'per_task' },
      wireGroup: 'kling-pro',
      enabled: true,
    },
    {
      id: 'minimax-pro',
      label: '海螺 MiniMax 进阶版',
      pricing: { pointsEstimate: null, priceRatio: 1.1, billingMode: 'per_task' },
      wireGroup: 'minimax-pro',
      enabled: true,
    },
    {
      id: 'sd-pro',
      label: 'sd-pro',
      pricing: { pointsEstimate: null, priceRatio: null, billingMode: 'per_task' },
      wireGroup: 'sd-pro',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版 · standard',
      pricing: { pointsEstimate: null, priceRatio: 1, billingMode: 'per_task' },
      wireGroup: 'standard',
      enabled: true,
    },
  ],
  'grok-imagine-video-1-5': [
    {
      id: 'minimax-pro',
      label: '海螺 MiniMax 进阶版',
      pricing: { pointsEstimate: null, priceRatio: 1.1, billingMode: 'per_task' },
      wireGroup: 'minimax-pro',
      enabled: true,
    },
    {
      id: 'sd-pro',
      label: 'sd-pro',
      pricing: { pointsEstimate: null, priceRatio: null, billingMode: 'per_task' },
      wireGroup: 'sd-pro',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版 · standard',
      pricing: { pointsEstimate: null, priceRatio: 1, billingMode: 'per_task' },
      wireGroup: 'standard',
      enabled: true,
    },
    {
      id: 'default',
      label: '标准版 · default',
      pricing: { pointsEstimate: null, priceRatio: 1, billingMode: 'per_task' },
      wireGroup: 'default',
      enabled: true,
    },
    {
      id: 'kling-pro',
      label: '可灵 Kling 进阶版',
      pricing: { pointsEstimate: null, priceRatio: 1.2, billingMode: 'per_task' },
      wireGroup: 'kling-pro',
      enabled: true,
    },
  ],
  'seed-audio-1.0': [
    {
      id: 'default',
      label: '标准版',
      pricing: { pointsEstimate: null, priceRatio: 1, billingMode: 'per_token' },
      wireGroup: 'default',
      enabled: true,
    },
    {
      id: 'official',
      label: '官转版',
      pricing: { pointsEstimate: null, priceRatio: 1, billingMode: 'per_token' },
      wireGroup: 'official',
      enabled: true,
    },
  ],
  'suno': [
    {
      id: 'default',
      label: '标准版 · default',
      pricing: { pointsEstimate: null, priceRatio: 1, billingMode: 'per_task' },
      wireGroup: 'default',
      enabled: true,
    },
    {
      id: 'kling-standard',
      label: '可灵 Kling 标准版',
      pricing: { pointsEstimate: null, priceRatio: 0.85, billingMode: 'per_task' },
      wireGroup: 'kling-standard',
      enabled: true,
    },
    {
      id: 'sd-standard',
      label: 'sd-standard',
      pricing: { pointsEstimate: null, priceRatio: null, billingMode: 'per_task' },
      wireGroup: 'sd-standard',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版 · standard',
      pricing: { pointsEstimate: null, priceRatio: 1, billingMode: 'per_task' },
      wireGroup: 'standard',
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

/** Points used for ranking when a group publishes no numeric estimate. */
const UNPRICED_RANKING_POINTS = 1000

/**
 * Numeric point estimate only. Display-only notes (`当前参数不支持报价`) never
 * participate in ranking, so a note can never reorder the failover plan.
 * @param {{ pricing?: { pointsEstimate?: number | string } }} group
 * @returns {number | null}
 */
function pointsOf(group) {
  const points = group.pricing?.pointsEstimate
  if (typeof points === 'number' && Number.isFinite(points)) return points
  // 网关不给积分口径时，用真实分组倍率折算排序权重（仅用于排序，不当作积分展示）。
  const ratio = group.pricing?.priceRatio
  return typeof ratio === 'number' && Number.isFinite(ratio) ? ratio * UNPRICED_RANKING_POINTS : null
}

/**
 * Calculate auto ranking score for a channel group (stability weight 70%, cost weight 30%).
 * Higher score = higher priority.
 */
function calculateAutoScore(group) {
  // 分组未公布 SLA 时用中性默认值参与排序，不对外声称稳定率。
  const stabilityPart = (group.sla?.stability24h ?? 80) * 0.7
  const price = pointsOf(group) ?? UNPRICED_RANKING_POINTS
  // Normalized inverse price score (0..30)
  const pricePart = Math.max(0, 30 - (price / 200))
  return stabilityPart + pricePart
}

/**
 * @param {string} strategy
 * @returns {(a: object, b: object) => number}
 */
function comparatorFor(strategy) {
  if (strategy === 'stability_first') {
    return (a, b) => {
      const stabDiff = (b.sla?.stability24h ?? 0) - (a.sla?.stability24h ?? 0)
      if (stabDiff !== 0) return stabDiff
      return (a.sla?.avgWaitTimeSec ?? 0) - (b.sla?.avgWaitTimeSec ?? 0)
    }
  }
  if (strategy === 'cost_first') {
    // Unpriced groups sort last: an unknown price must not win a cheapest-first race.
    return (a, b) => (pointsOf(a) ?? Number.POSITIVE_INFINITY) - (pointsOf(b) ?? Number.POSITIVE_INFINITY)
  }
  return (a, b) => calculateAutoScore(b) - calculateAutoScore(a)
}

/**
 * @param {unknown} allowedGroups
 * @returns {Set<string> | null}
 */
function normalizeAllowed(allowedGroups) {
  if (!Array.isArray(allowedGroups) || allowedGroups.length === 0) return null
  const allowed = new Set(allowedGroups.map((id) => String(id).trim().toLowerCase()).filter(Boolean))
  return allowed.size > 0 ? allowed : null
}

/**
 * Resolve the ordered channel plan for a model.
 *
 * Routing intent (`group`, `allowedGroups`, or `strategy`) makes the plan
 * fail-closed: only configured groups are tried, the caller's pool is never
 * silently widened, and an exhausted pool surfaces as an error instead of
 * falling back to an unbounded channel. Without intent the plan is exactly
 * `gatewayCandidates`, i.e. the pre-routing behavior.
 *
 * @param {string} modelId
 * @param {{
 *   strategy?: 'auto' | 'stability_first' | 'cost_first' | string,
 *   group?: string,
 *   allowedGroups?: string[],
 * }} [options]
 * @returns {{ candidates: string[], unresolvedGroups: string[] }}
 */
export function resolveChannelPlan(modelId, options = {}) {
  const { modelId: canonicalModel, group: inlineGroup } = parseModelAndGroup(modelId)
  if (!canonicalModel) return { candidates: [], unresolvedGroups: [] }

  const requestedGroup = inlineGroup || (typeof options.group === 'string' ? options.group.trim() : '')
  const strategy = ROUTING_STRATEGIES.includes(options.strategy) ? options.strategy : 'auto'
  const allowed = normalizeAllowed(options.allowedGroups)
  const hasIntent = Boolean(requestedGroup || allowed || ROUTING_STRATEGIES.includes(options.strategy))

  if (!hasIntent) return { candidates: gatewayCandidates(canonicalModel), unresolvedGroups: [] }

  const groups = getModelChannelGroups(canonicalModel)
  if (groups.length === 0) {
    // No pool is configured for this model, so the intent cannot be honored.
    // Report the ids that could not be resolved instead of pretending they applied.
    const unresolvedGroups = allowed ? [...options.allowedGroups].map((id) => String(id).trim()).filter(Boolean) : (requestedGroup ? [requestedGroup] : [])
    return { candidates: gatewayCandidates(canonicalModel), unresolvedGroups }
  }

  const isAllowed = (group) => !allowed
    || allowed.has(String(group.id).toLowerCase())
    || (group.wireGroup ? allowed.has(String(group.wireGroup).toLowerCase()) : false)
  const wireOf = (group) => `${canonicalModel}@${group.wireGroup || group.id}`
  const enabled = groups.filter((group) => group.enabled)

  if (requestedGroup) {
    const matched = groups.find((group) => group.id === requestedGroup || group.wireGroup === requestedGroup)
    const tail = enabled.filter((group) => group.id !== requestedGroup && group.wireGroup !== requestedGroup)
    // The pool restricts the failover tail too: naming one group is not a licence
    // to try the caller's excluded (often pricier) groups.
    const orderedTail = tail.filter(isAllowed).sort(comparatorFor(strategy))
    const unresolvedGroups = matched ? [] : [requestedGroup]
    return {
      candidates: [...new Set([`${canonicalModel}@${matched ? (matched.wireGroup || matched.id) : requestedGroup}`, ...orderedTail.map(wireOf)])],
      unresolvedGroups,
    }
  }

  const pool = enabled.filter(isAllowed)
  if (pool.length === 0) {
    const unresolvedGroups = allowed
      ? [...allowed]
      : []
    // Fail closed: an unmatched pool must not widen into the full channel set.
    return { candidates: [], unresolvedGroups }
  }

  return { candidates: pool.sort(comparatorFor(strategy)).map(wireOf), unresolvedGroups: [] }
}

/**
 * Ordered gateway candidates for a request. Kept as the array-shaped API for
 * callers that do not need the unresolved-pool report.
 * @param {string} modelId
 * @param {{ strategy?: string, group?: string, allowedGroups?: string[] }} [options]
 * @returns {string[]}
 */
export function resolveChannelCandidates(modelId, options = {}) {
  return resolveChannelPlan(modelId, options).candidates
}
