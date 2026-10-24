/**
 * Compare the gateway's view of the catalog with the hub's current projection.
 *
 * This is the P0 shadow surface: it reports drift and changes nothing. Every
 * category is derived from data on both sides — a model is "unreachable" only
 * when the hub lists it and the gateway has no enabled channel for it, and a
 * price is "changed" only when both sides describe the same billing mode and
 * the gateway's own numbers reproduce the hub's estimate.
 */

import { USD_TO_POINTS_RATE } from '../pricing-calculator.js'

/**
 * The hub's `pointsEstimate` for per-second billing is quoted on a 5-second
 * reference package (see `docs/evidence/2026-10-21-hub-gateway-drift-audit.md`
 * §3). It is a comparison baseline, not a product rule.
 */
export const PRICE_REFERENCE_SECONDS = 5

/** Points are displayed rounded to two decimals, so compare at that precision. */
const PRICE_TOLERANCE = 0.005

/** @param {unknown} value @returns {string} */
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

/** @param {unknown} value @returns {string[]} */
function stringList(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {}
}

/**
 * Hub models that the catalog currently offers, with their channel groups.
 *
 * @param {object} hub output of `buildModelCatalog()`
 */
export function hubCatalogView(hub) {
  const models = Array.isArray(hub?.models) ? hub.models : []
  const buckets = ['text', 'image', 'video', 'audio']
  const bucketIds = new Set()
  for (const kind of buckets) {
    for (const row of Array.isArray(hub?.[kind]) ? hub[kind] : []) {
      const id = text(objectOrEmpty(row).id)
      if (id) bucketIds.add(id)
    }
  }

  /** @type {Map<string, object>} */
  const byId = new Map()
  for (const raw of models) {
    const model = objectOrEmpty(raw)
    const id = text(model.id)
    if (!id) continue
    const listedOperations = stringList(model.listedOperations)
    const groups = (Array.isArray(model.channelGroups) ? model.channelGroups : []).map((rawGroup) => {
      const group = objectOrEmpty(rawGroup)
      const pricing = objectOrEmpty(group.pricing)
      return {
        id: text(group.id),
        wireGroup: text(group.wireGroup),
        enabled: group.enabled !== false,
        billingMode: text(pricing.billingMode) || null,
        pointsEstimate: finiteNumber(pricing.pointsEstimate),
      }
    })
    byId.set(id, {
      id,
      listed: model.listed === true || listedOperations.length > 0 || bucketIds.has(id),
      listedOperations,
      groups,
    })
  }

  // Bucket rows can exist without a `models[]` entry in a partial projection.
  for (const id of bucketIds) {
    if (!byId.has(id)) byId.set(id, { id, listed: true, listedOperations: [], groups: [] })
  }
  return byId
}

/**
 * @param {{ gateway: object, hub: object, baselineSeconds?: number }} input
 */
export function diffGatewayAgainstHub(input) {
  const gateway = objectOrEmpty(input.gateway)
  const hub = objectOrEmpty(input.hub)
  const baselineSeconds = finiteNumber(input.baselineSeconds) ?? PRICE_REFERENCE_SECONDS
  const groupRatio = objectOrEmpty(objectOrEmpty(gateway.groups).ratio)

  const gatewayModels = new Map()
  for (const raw of Array.isArray(gateway.models) ? gateway.models : []) {
    const model = objectOrEmpty(raw)
    const id = text(model.id)
    if (id) gatewayModels.set(id, model)
  }
  const hubModels = hubCatalogView(hub)

  /** @type {object[]} */
  const unreachable = []
  /** @type {object[]} */
  const gatewayOnly = []
  /** @type {object[]} */
  const groupMissing = []
  /** @type {object[]} */
  const groupExtra = []
  /** @type {object[]} */
  const priceChanged = []
  let comparablePrices = 0

  for (const [id, hubModel] of hubModels) {
    if (!hubModel.listed) continue
    const gatewayModel = gatewayModels.get(id)
    const enableGroups = stringList(gatewayModel?.enableGroups)
    if (!gatewayModel || enableGroups.length === 0) {
      unreachable.push({ id, listedOperations: hubModel.listedOperations })
      continue
    }
    const hubWireGroups = hubModel.groups.filter((group) => group.enabled).map((group) => group.wireGroup).filter(Boolean)
    for (const wireGroup of hubWireGroups) {
      if (!enableGroups.includes(wireGroup)) groupMissing.push({ id, wireGroup, enableGroups })
    }
    for (const wireGroup of enableGroups) {
      if (!hubWireGroups.includes(wireGroup)) groupExtra.push({ id, wireGroup })
    }
    for (const group of hubModel.groups) {
      if (!group.enabled || !group.wireGroup) continue
      const expected = expectedPoints({
        billing: objectOrEmpty(gatewayModel.billing),
        billingMode: group.billingMode,
        groupRatio: finiteNumber(groupRatio[group.wireGroup]),
        baselineSeconds,
      })
      if (expected === null || group.pointsEstimate === null) continue
      comparablePrices += 1
      if (Math.abs(expected - group.pointsEstimate) > PRICE_TOLERANCE) {
        priceChanged.push({ id, wireGroup: group.wireGroup, hub: group.pointsEstimate, expected })
      }
    }
  }

  for (const [id, gatewayModel] of gatewayModels) {
    const enableGroups = stringList(gatewayModel.enableGroups)
    if (enableGroups.length === 0) continue
    const hubModel = hubModels.get(id)
    if (!hubModel || !hubModel.listed) gatewayOnly.push({ id, enableGroups })
  }

  return {
    summary: {
      gatewayModels: gatewayModels.size,
      hubModels: hubModels.size,
      hubListed: [...hubModels.values()].filter((model) => model.listed).length,
      unreachable: unreachable.length,
      gatewayOnly: gatewayOnly.length,
      groupMissing: groupMissing.length,
      groupExtra: groupExtra.length,
      priceChanged: priceChanged.length,
      comparablePrices,
    },
    unreachable,
    gatewayOnly,
    groupMissing,
    groupExtra,
    priceChanged,
    limitations: stringList(objectOrEmpty(gateway.coverage).limitations),
  }
}

/**
 * Reproduce the hub's points estimate from the gateway's own numbers.
 *
 * Returns null when the two sides are not comparable (unknown unit price, no
 * group ratio, or a billing mode this comparison does not model, such as
 * per-token text billing).
 *
 * @param {{ billing: object, billingMode: string|null, groupRatio: number|null, baselineSeconds: number }} input
 */
export function expectedPoints(input) {
  const modelPrice = finiteNumber(input.billing?.modelPrice)
  const groupRatio = finiteNumber(input.groupRatio)
  if (modelPrice === null || groupRatio === null) return null
  const mode = text(input.billingMode)
  if (mode === 'per_second') return round2(modelPrice * groupRatio * input.baselineSeconds * USD_TO_POINTS_RATE)
  if (mode === 'per_task') return round2(modelPrice * groupRatio * USD_TO_POINTS_RATE)
  return null
}

/** @param {number} value */
function round2(value) {
  return Math.round(value * 100) / 100
}
