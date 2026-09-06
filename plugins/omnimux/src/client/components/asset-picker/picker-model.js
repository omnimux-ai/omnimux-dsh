/**
 * 资产选择逻辑模型（共享层，composer-add 迁出并泛化）。
 * 上限不再硬编码：max 由调用方注入（composer 域注入 8，画布等场景可注入 1）。
 */

export const ASSET_CATEGORIES = Object.freeze([
  'character',
  'scene',
  'style',
  'prop',
  'knowledge',
  'custom',
])

/**
 * @param {{ occupied: number, selectedCount: number, max?: number }} state
 * @returns {{ remaining: number, canSelectMore: boolean, overLimit: boolean }}
 */
export function remainingQuota(state) {
  const occupied = Number(state.occupied) || 0
  const selected = Number(state.selectedCount) || 0
  const cap = state.max === undefined || state.max === null ? Infinity : Number(state.max)
  const remaining = Math.max(0, cap - occupied - selected)
  return {
    remaining,
    canSelectMore: remaining > 0,
    overLimit: occupied + selected > cap,
  }
}

/**
 * @param {Set<string> | string[]} alreadyIds
 * @param {string} assetId
 */
export function isAlreadyAdded(alreadyIds, assetId) {
  if (!assetId) return false
  if (alreadyIds instanceof Set) return alreadyIds.has(assetId)
  return Array.isArray(alreadyIds) && alreadyIds.includes(assetId)
}

/**
 * Toggle one id against remaining quota. Already-added ids cannot be newly selected.
 * @param {{
 *   selected: Set<string>,
 *   id: string,
 *   occupied: number,
 *   alreadyIds?: Set<string> | string[],
 *   max?: number,
 * }} opts
 * @returns {{ selected: Set<string>, blocked: null | 'already-added' | 'quota-exceeded' }}
 */
export function toggleSelect(opts) {
  const next = new Set(opts.selected)
  const already = isAlreadyAdded(opts.alreadyIds || [], opts.id)
  if (already) return { selected: next, blocked: 'already-added' }
  if (next.has(opts.id)) {
    next.delete(opts.id)
    return { selected: next, blocked: null }
  }
  const quota = remainingQuota({ occupied: opts.occupied, selectedCount: next.size, max: opts.max })
  if (quota.remaining <= 0) {
    return { selected: next, blocked: 'quota-exceeded' }
  }
  next.add(opts.id)
  return { selected: next, blocked: null }
}
