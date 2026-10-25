/**
 * Read-only joins between the normalized gateway snapshot (P1a) and the hub's
 * catalog (P1b).
 *
 * Membership, lines and group ratios come from here and nowhere else: the
 * snapshot's `enable_groups` decides which lines a model may use, and its
 * `groups.auto` decides the automatic line order. Everything is a pure function
 * of the snapshot — no filesystem, no clock, no network.
 *
 * Model identity follows the task spec: the gateway's `model_name` is the
 * identifier. P1a's normalizer stores it in `id` (falling back from a numeric
 * database id), so `id` is what matching uses; `displayName` is accepted as a
 * secondary spelling because the normalizer keeps the upstream `model_name`
 * there whenever `id` came from a different field.
 */

/** @param {unknown} value */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** @param {unknown} value @returns {string[]} */
function stringList(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    const id = text(item)
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {}
}

/** @param {unknown} snapshot @returns {object[]} */
export function snapshotModels(snapshot) {
  return Array.isArray(snapshot?.models) ? snapshot.models : []
}

/**
 * One model of the gateway view, matched on the canonical identifier first and
 * on the upstream display name second.
 *
 * @param {unknown} snapshot
 * @param {unknown} modelId
 * @returns {object|undefined}
 */
export function findSnapshotModel(snapshot, modelId) {
  const id = text(modelId)
  if (!id) return undefined
  const models = snapshotModels(snapshot)
  const byId = models.find((model) => text(objectOrEmpty(model).id) === id)
  if (byId) return byId
  return models.find((model) => text(objectOrEmpty(model).displayName) === id)
}

/**
 * The lines the gateway serves a model on. An empty list means the model is not
 * sellable right now — callers must treat that as "not in the catalog", never
 * as "fall back to a local table".
 *
 * @param {unknown} snapshotModel
 * @returns {string[]}
 */
export function gatewayEnableGroups(snapshotModel) {
  return stringList(objectOrEmpty(snapshotModel).enableGroups)
}

/** @param {unknown} snapshotModel */
export function hasUsableGatewayGroups(snapshotModel) {
  return gatewayEnableGroups(snapshotModel).length > 0
}

/**
 * Every model the gateway currently sells, keyed by identifier. Models without
 * any enabled line are excluded: membership requires a usable line.
 *
 * @param {unknown} snapshot
 * @returns {Map<string, object>}
 */
export function usableSnapshotModels(snapshot) {
  /** @type {Map<string, object>} */
  const out = new Map()
  for (const raw of snapshotModels(snapshot)) {
    const model = objectOrEmpty(raw)
    const id = text(model.id) || text(model.displayName)
    if (!id || !hasUsableGatewayGroups(model)) continue
    out.set(id, model)
  }
  return out
}

/** @param {unknown} snapshot @returns {Record<string, unknown>} */
export function snapshotGroupRatios(snapshot) {
  return objectOrEmpty(objectOrEmpty(snapshot?.groups).ratio)
}

/** @param {unknown} snapshot @returns {Record<string, unknown>} */
export function snapshotGroupLabels(snapshot) {
  return objectOrEmpty(objectOrEmpty(snapshot?.groups).usable)
}

/** @param {unknown} snapshot @returns {string[]} */
export function snapshotAutoGroups(snapshot) {
  return stringList(objectOrEmpty(snapshot?.groups).auto)
}

/**
 * The gateway's own group ratio for one line, or `null` when the snapshot does
 * not publish one.
 *
 * @param {unknown} snapshot
 * @param {unknown} wireGroup
 * @returns {number|null}
 */
export function snapshotGroupRatio(snapshot, wireGroup) {
  const raw = snapshotGroupRatios(snapshot)[text(wireGroup)]
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/** Position of a line in the gateway's automatic order; `-1` when absent. */
export function autoGroupIndex(snapshot, wireGroup) {
  const order = snapshotAutoGroups(snapshot)
  const index = order.indexOf(text(wireGroup))
  return index >= 0 ? index : -1
}

/**
 * Diagnostics payload for the catalog: which gateway models are sellable and
 * which of them have no callable local contract.
 *
 * @param {unknown} snapshot
 * @param {Set<string>|Iterable<string>} contractedIds ids with at least one listed catalog operation
 */
export function gatewayCatalogSummary(snapshot, contractedIds) {
  const contracted = contractedIds instanceof Set ? contractedIds : new Set(contractedIds ?? [])
  const usable = usableSnapshotModels(snapshot)
  /** @type {string[]} */
  const missingContract = []
  for (const id of usable.keys()) {
    if (!contracted.has(id)) missingContract.push(id)
  }
  missingContract.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
  return {
    models: usable.size,
    missingContract,
  }
}
