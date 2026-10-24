/**
 * OmniMux points derivation from the gateway snapshot (P1b).
 *
 * Single source of truth for turning the gateway's own numbers — per-model
 * billing and the per-line group ratio — into platform credits/points:
 *
 *   1 USD = 10 Points (1 Point = $0.10 USD).
 *
 * There is deliberately NO local price table here. The hand-copied baselines
 * that used to live in this file drifted from the gateway and made the hub
 * quote prices nobody charged; every number now comes from the snapshot the
 * runtime already fetches (P1a). When the gateway bills by an expression, or by
 * reported tokens, no comparable number exists — the caller marks the line as
 * "无法比对" instead of inventing one.
 */

import { resolveCurrentSnapshot } from './cloud/current.js'
import { findSnapshotModel, snapshotGroupRatio } from './cloud/view.js'

export const USD_TO_POINTS_RATE = 10

/**
 * Points are quoted on a 5-second reference package for per-second billing.
 * It is a comparison baseline, not a product rule (the diff uses the same one).
 */
export const POINTS_REFERENCE_SECONDS = 5

/** Why a line has no comparable points estimate. */
export const PRICE_COMPARISON_UNAVAILABLE = Object.freeze({
  EXPR: '网关按计费表达式计价，无法逐项比对',
  PER_TOKEN: '网关按词元用量计价，无法给出固定积分预估',
  MISSING: '网关未公布可推导的单价或分组倍率',
})

/** @param {unknown} value */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** @param {unknown} value @returns {number|null} */
function finiteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {}
}

/** @param {number} value */
function round2(value) {
  return Math.round(value * 100) / 100
}

/**
 * How the gateway charges for one model, expressed in the hub's billing-mode
 * vocabulary. Read from the gateway's own fields only:
 *
 *   - the gateway contract's `billing.unit` when it publishes one
 *     (`per_image` is the gateway's name for a per-call fixed price);
 *   - otherwise `quota_type`, where 1 means a fixed per-call price and 0 means
 *     a ratio applied to reported token usage.
 *
 * Returns `null` when the gateway says nothing usable, so the caller can mark
 * the line as uncomparable instead of guessing.
 *
 * @param {unknown} snapshotModel
 * @returns {'per_second'|'per_task'|'per_token'|null}
 */
export function gatewayBillingMode(snapshotModel) {
  const contract = objectOrEmpty(objectOrEmpty(snapshotModel).contract)
  const unit = text(objectOrEmpty(contract.billing).unit)
  if (unit === 'per_second') return 'per_second'
  if (unit === 'per_task' || unit === 'per_image') return 'per_task'
  if (unit === 'per_token') return 'per_token'
  const quotaType = finiteNumber(objectOrEmpty(snapshotModel).billing?.quotaType)
  if (quotaType === 1) return 'per_task'
  if (quotaType === 0) return 'per_token'
  return null
}

/** The gateway's per-model base price in USD, or `null` when it publishes none. */
export function gatewayUnitPriceUsd(snapshotModel) {
  return finiteNumber(objectOrEmpty(objectOrEmpty(snapshotModel).billing).modelPrice)
}

/** The gateway's billing expression for a model, or `''`. */
export function gatewayBillingExpr(snapshotModel) {
  return text(objectOrEmpty(objectOrEmpty(snapshotModel).billing).expr)
}

/**
 * Reproduce the hub's points estimate from the gateway's own numbers.
 *
 * Returns `null` whenever the two sides are not comparable: an expression
 * overrides `model_price` upstream, token billing has no fixed package, and a
 * missing unit price or group ratio cannot be derived.
 *
 * @param {{
 *   billing?: object,
 *   billingMode?: string|null,
 *   groupRatio?: number|null,
 *   baselineSeconds?: number,
 * }} input
 * @returns {number|null}
 */
export function estimatePointsFromGateway(input = {}) {
  const billing = objectOrEmpty(input.billing)
  if (text(billing.expr)) return null
  const modelPrice = finiteNumber(billing.modelPrice)
  const ratio = finiteNumber(input.groupRatio)
  if (modelPrice === null || ratio === null) return null
  const baselineSeconds = finiteNumber(input.baselineSeconds) ?? POINTS_REFERENCE_SECONDS
  if (input.billingMode === 'per_second') {
    return round2(modelPrice * ratio * baselineSeconds * USD_TO_POINTS_RATE)
  }
  if (input.billingMode === 'per_task') return round2(modelPrice * ratio * USD_TO_POINTS_RATE)
  return null
}

/**
 * The pricing block one channel group carries, derived entirely from the
 * snapshot. `pointsEstimate` stays `null` (with a `pointsNote` explaining why)
 * whenever the gateway's own billing cannot be turned into a comparable number.
 *
 * @param {unknown} snapshotModel
 * @param {number|null} groupRatio the gateway's `group_ratio` for this line
 * @param {number} [baselineSeconds]
 * @returns {{
 *   billingMode: string|null,
 *   unitPriceUsd: number|null,
 *   groupRatio: number|null,
 *   pointsEstimate: number|null,
 *   pointsNote?: string,
 * }}
 */
export function gatewayPricingBlock(snapshotModel, groupRatio, baselineSeconds = POINTS_REFERENCE_SECONDS) {
  const billing = objectOrEmpty(objectOrEmpty(snapshotModel).billing)
  const billingMode = gatewayBillingMode(snapshotModel)
  const unitPriceUsd = gatewayUnitPriceUsd(snapshotModel)
  const ratio = finiteNumber(groupRatio)
  const pointsEstimate = estimatePointsFromGateway({ billing, billingMode, groupRatio: ratio, baselineSeconds })
  /** @type {Record<string, unknown>} */
  const block = {
    billingMode,
    unitPriceUsd,
    groupRatio: ratio,
    pointsEstimate,
  }
  if (pointsEstimate === null) {
    block.pointsNote = text(billing.expr)
      ? PRICE_COMPARISON_UNAVAILABLE.EXPR
      : billingMode === 'per_token'
        ? PRICE_COMPARISON_UNAVAILABLE.PER_TOKEN
        : PRICE_COMPARISON_UNAVAILABLE.MISSING
  }
  return /** @type {any} */ (block)
}

/** @param {unknown} value */
function usd(value) {
  const parsed = finiteNumber(value)
  return parsed === null ? '?' : parsed.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

/** @param {unknown} value */
function points(value) {
  const parsed = finiteNumber(value)
  return parsed === null ? '?' : String(parsed)
}

/**
 * One-line billing description for the agent context block.
 *
 * P1b: derived from the gateway snapshot instead of the deleted local price
 * tables. When the gateway bills by an expression or by reported tokens the
 * description says so and gives no number, so the model can never quote a price
 * the platform does not charge.
 *
 * @param {string} modelId runtime id, optionally `model@group`
 * @param {number} [groupRatio] explicit group multiplier
 * @returns {string|null} null when the gateway does not sell the model at all
 */
export function describeModelBilling(modelId, groupRatio) {
  const raw = text(modelId)
  if (!raw) return null
  const at = raw.indexOf('@')
  const baseId = at > 0 ? raw.slice(0, at).trim() : raw
  const inlineGroup = at > 0 ? raw.slice(at + 1).trim() : ''
  const snapshot = resolveCurrentSnapshot().snapshot
  const model = findSnapshotModel(snapshot, baseId)
  if (!model) return null

  const billingMode = gatewayBillingMode(model)
  const unitPriceUsd = gatewayUnitPriceUsd(model)
  const ratio = finiteNumber(groupRatio)
    ?? (inlineGroup ? snapshotGroupRatio(snapshot, inlineGroup) : null)
    ?? snapshotGroupRatio(snapshot, 'default')
    ?? 1
  const estimate = estimatePointsFromGateway({
    billing: model.billing,
    billingMode,
    groupRatio: ratio,
  })
  const scope = inlineGroup ? `线路「${inlineGroup}」分组倍率 ×${ratio}` : `分组倍率 ×${ratio}`
  if (estimate === null) {
    const reason = text(objectOrEmpty(model.billing).expr)
      ? PRICE_COMPARISON_UNAVAILABLE.EXPR
      : billingMode === 'per_token'
        ? PRICE_COMPARISON_UNAVAILABLE.PER_TOKEN
        : PRICE_COMPARISON_UNAVAILABLE.MISSING
    return `${scope}；${reason}`
  }
  if (billingMode === 'per_second') {
    return `按秒计费，网关单价 ${usd(unitPriceUsd)} USD/秒，${scope} ≈ ${points(estimate)} 积分/${POINTS_REFERENCE_SECONDS}秒`
  }
  if (billingMode === 'per_task') {
    return `按次计费，网关单价 ${usd(unitPriceUsd)} USD/次，${scope} ≈ ${points(estimate)} 积分/次`
  }
  return null
}
