/**
 * Hub-owned media generation catalog (image / video / audio) — H2 facade.
 *
 * The hardcoded SPECS row data was physically deleted (strangler fig). These
 * tables are pure projections of the YAML capability contracts
 * (src/catalog/specs/*.yaml) via src/catalog/project.js: every contracted
 * model of the management group, listed or not (directory semantics).
 *
 * Fail-closed: contract parse / admission failure throws at module load.
 * There is no legacy table to fall back to.
 */

import { getHealthyContractIndex, projectDirectoryRows, projectRow, resolveModelId } from '../catalog/project.js'
import { getRuntimeContractIndex } from '../catalog/runtime-index.js'

// Top-level contract load; throws (fail-closed) when specs are broken.
const __contractIndex = getHealthyContractIndex()

export const IMAGE_MODEL_SPECS = projectDirectoryRows(__contractIndex, 'image')
export const VIDEO_MODEL_SPECS = projectDirectoryRows(__contractIndex, 'video')
export const AUDIO_MODEL_SPECS = projectDirectoryRows(__contractIndex, 'audio')

const TABLES = Object.freeze({
  image: IMAGE_MODEL_SPECS,
  video: VIDEO_MODEL_SPECS,
  audio: AUDIO_MODEL_SPECS,
})

/**
 * @param {'image' | 'video' | 'audio'} kind
 * @returns {ReadonlyArray<{ id: string, label: string, badge?: string, subtitle?: string, family?: string, inputCapability?: object, parameters?: object }>}
 */
/**
 * Gateway-only models that have a local adapter profile and at least one
 * executable operation for this media kind. They are projected through the
 * same row shape as local directory rows.
 *
 * @param {'image' | 'video' | 'audio'} kind
 */
export function gatewayMediaModels(kind) {
  const runtime = getRuntimeContractIndex()
  return runtime.index.all()
    .filter((model) => model.gatewaySource === true && model.managementGroup === kind)
    .filter((model) => (model.operations ?? []).some((operation) =>
      operation.listed === true && operation.output?.type === kind))
    .map((model) => projectRow(model, model.operations ?? [], runtime.snapshot))
}

export function mediaModels(kind) {
  const rows = [...(TABLES[kind] ?? []), ...gatewayMediaModels(kind)]
  const seen = new Set()
  return rows.filter((row) => {
    if (!row?.id || seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

/** @param {'image' | 'video' | 'audio'} kind */
export function mediaModelIds(kind) {
  return mediaModels(kind).map((row) => row.id)
}

/**
 * Exact id → documented contract alias normalization (resolveModelId).
 * @param {'image' | 'video' | 'audio'} kind
 * @param {string} id
 */
export function findMediaModel(kind, id) {
  if (!id || typeof id !== 'string') return null
  const models = mediaModels(kind)
  const match = models.find((row) => row.id === id)
  if (match) return match
  const canonical = resolveModelId(getRuntimeContractIndex().index, id)
  if (canonical) {
    const aliased = models.find((row) => row.id === canonical)
    if (aliased) return aliased
  }
  return null
}
