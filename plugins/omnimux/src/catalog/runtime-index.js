/**
 * Runtime contract index: local ContractIndex + Gateway Contract v2 overlay.
 *
 * The local YAML index remains the adapter/fallback authority. For models the
 * gateway sells with a v2 contract, the gateway's operations/inputs/parameters
 * replace the local capability surface while local labels, aliases and adapter
 * profiles stay as product/execution metadata.
 */

import { contentFingerprint } from './contract/load.js'
import { getHealthyContractIndex } from './project.js'
import { resolveCurrentSnapshot } from './cloud/current.js'
import { readBundledSnapshot } from './cloud/bundled.js'
import { snapshotContentDigest } from './cloud/snapshot.js'
import { gatewayContractModels } from './gateway-contract.js'

/** @type {Map<string, RuntimeIndexResult>} */
const runtimeCache = new Map()

/**
 * @typedef {{
 *   index: object,
 *   adapterUnsupported: string[],
 *   missingContract: string[],
 *   gatewayDigest: string | null,
 * }} RuntimeIndexResult
 */

/**
 * Cached snapshots can be newer than the bundled floor but still carry v1
 * contracts. Membership/price remain the cached snapshot's truth; a missing v2
 * capability contract is supplemented from the bundled package, never fetched.
 *
 * @param {object | undefined} snapshot
 * @returns {object | undefined}
 */
export function withBundledGatewayContracts(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.models) || snapshot.models.length === 0) return snapshot
  const bundled = readBundledSnapshot().snapshot
  if (!bundled || !Array.isArray(bundled.models) || bundled.models.length === 0) return snapshot
  const bundledContracts = new Map()
  for (const model of bundled.models) {
    if (model?.id && model.contract?.schemaVersion === '2.0') bundledContracts.set(model.id, model.contract)
  }
  if (bundledContracts.size === 0) return snapshot
  let changed = false
  const models = snapshot.models.map((model) => {
    if (!model || typeof model !== 'object') return model
    if (model.contract?.schemaVersion === '2.0') return model
    const contract = bundledContracts.get(model.id)
    if (!contract) return model
    changed = true
    return { ...model, contract }
  })
  return changed ? { ...snapshot, models } : snapshot
}

/**
 * @param {object} localIndex
 * @param {object | undefined} snapshot
 * @returns {RuntimeIndexResult}
 */
export function mergeRuntimeContractIndex(localIndex, snapshot) {
  const effectiveSnapshot = withBundledGatewayContracts(snapshot)
  const overlay = gatewayContractModels(effectiveSnapshot, localIndex, localIndex?.profiles)
  const byId = new Map(localIndex?.byId instanceof Map ? localIndex.byId : [])
  for (const [id, model] of overlay.models) byId.set(id, model)

  const models = [...byId.values()].sort((left, right) => String(left.id).localeCompare(String(right.id)))
  const listedOperations = []
  for (const model of models) {
    for (const id of model.listedOperations ?? []) listedOperations.push(id)
  }
  listedOperations.sort((left, right) => left.localeCompare(right))
  const fingerprint = contentFingerprint({
    local: localIndex?.contentFingerprint ?? '',
    gateway: snapshot?.generatedAt ?? '',
    models: models.map((model) => ({
      id: model.id,
      gatewayContractVersion: model.gatewayContractVersion ?? null,
      operations: (model.operations ?? []).map((operation) => ({
        id: operation.id,
        listed: operation.listed === true,
        inputs: operation.inputs ?? [],
        parameters: operation.parameters ?? {},
        output: operation.output ?? {},
      })),
    })),
  })

  const index = {
    ...localIndex,
    byId,
    contentFingerprint: fingerprint,
    listedOperations,
    all() {
      return [...byId.values()].sort((left, right) => String(left.id).localeCompare(String(right.id)))
    },
    get(id) {
      return byId.get(id)
    },
    byOutputType(outType) {
      return this.all().filter((model) =>
        (model.operations ?? []).some((operation) => operation.output?.type === outType))
    },
    listedOperationsFor() {
      return [...listedOperations]
    },
  }

  return {
    index,
    snapshot,
    adapterUnsupported: [...overlay.adapterUnsupported],
    missingContract: [...overlay.missingContract],
    gatewayDigest: typeof snapshot?.digest === 'string' ? snapshot.digest : null,
  }
}

/**
 * Cached runtime index for the current or injected snapshot.
 *
 * @param {{ localIndex?: object, snapshot?: object }} [opts]
 * @returns {RuntimeIndexResult}
 */
export function getRuntimeContractIndex(opts = {}) {
  const localIndex = opts.localIndex ?? getHealthyContractIndex()
  const snapshot = opts.snapshot ?? resolveCurrentSnapshot().snapshot
  if (opts.gatewayContracts === false) {
    return {
      index: localIndex,
      snapshot,
      adapterUnsupported: [],
      missingContract: [],
      gatewayDigest: null,
    }
  }
  const key = `${localIndex?.contentFingerprint ?? ''}|${snapshot?.generatedAt ?? ''}|${snapshotContentDigest(withBundledGatewayContracts(snapshot))}`
  const cached = runtimeCache.get(key)
  if (cached) return cached
  const result = mergeRuntimeContractIndex(localIndex, snapshot)
  runtimeCache.set(key, result)
  if (runtimeCache.size > 8) {
    const first = runtimeCache.keys().next().value
    if (first) runtimeCache.delete(first)
  }
  return result
}


/** Exposed for tests. */
export function resetRuntimeContractIndexCache() {
  runtimeCache.clear()
}

/**
 * Text-directory rows, including gateway-only text models.
 *
 * @param {{ localIndex?: object, snapshot?: object }} [opts]
 */
export function getGatewayTextRows(opts = {}) {
  if (opts.gatewayContracts === false) return []
  const runtime = getRuntimeContractIndex(opts)
  return runtime.index.all()
    .filter((model) => model.gatewaySource === true && model.managementGroup === 'text')
    .filter((model) => (model.operations ?? []).some((operation) =>
      operation.listed === true && operation.output?.type === 'text'))
    .map((model) => ({
      id: model.id,
      brand: model.family || 'unknown',
      role: model.role === 'classic' ? 'classic' : 'flagship',
      input: Array.isArray(model.inputCapability?.modalities)
        ? [...model.inputCapability.modalities]
        : ['text'],
      inputCapability: model.inputCapability ?? { modalities: ['text'] },
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}
