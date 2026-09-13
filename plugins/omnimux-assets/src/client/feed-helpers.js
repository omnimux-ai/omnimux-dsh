/**
 * Pure helper utilities for assets stage feed, selection, sorting, and errors.
 */

/**
 * Extract error message from API result or locale fallback.
 * @param {{ ok: boolean, status?: number, body?: { error?: string, message?: string } }} result
 * @param {(key: string) => string} t
 */
export function messageOf(result, t) {
  const body = result?.body
  if (body?.error === 'name-conflict') return t('error.nameConflict')
  const msg = body?.message || body?.error
  if (msg) return String(msg)
  if (result?.status) return `HTTP ${String(result.status)}`
  return t('error.generic')
}

/**
 * Format caught rejection / error.
 * @param {unknown} caught
 */
export function errText(caught) {
  if (caught instanceof Error) return caught.message
  return String(caught)
}

/**
 * Surface picker-specific errors or fall back to messageOf.
 * @param {{ ok: boolean, status?: number, body?: { error?: string, message?: string } }} result
 * @param {(key: string) => string} t
 */
export function pickErrorText(result, t) {
  const code = String(result?.body?.error ?? '')
  if (code === 'picker-unsupported') return t('error.pickerUnsupported')
  if (code === 'picker-failed') return t('error.pickerFailed')
  return messageOf(result, t)
}

/**
 * Citation handle for an asset.
 * @param {{ cite?: string, type?: string, name?: string }} asset
 */
export function citeOf(asset) {
  if (!asset) return ''
  return asset.cite || `@${asset.type}/${asset.name}`
}

function matchAssetQuery(asset, query) {
  if (!query) return true
  const tags = Array.isArray(asset.tags) ? asset.tags.join('\n') : ''
  const hay = `${asset.name || ''}\n${asset.description || ''}\n${tags}`.toLowerCase()
  return hay.includes(query)
}

function sortAssetsBy(assets, sortKey) {
  if (sortKey === 'name') {
    return [...assets].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  }
  return [...assets].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
}

/**
 * Filter and sort assets array.
 * @param {Array<{ name: string, type: string, description?: string, tags?: string[], updated_at?: string }>} assets
 * @param {string} filterType
 * @param {string} query
 * @param {string} sortKey
 */
export function filterAndSortAssets(assets, filterType, query, sortKey) {
  const list = Array.isArray(assets) ? assets : []
  const q = String(query || '').trim().toLowerCase()
  const filtered = list.filter((asset) => {
    if (filterType && asset.type !== filterType) return false
    return matchAssetQuery(asset, q)
  })
  return sortAssetsBy(filtered, sortKey)
}

/**
 * Parse response from native pickPath API.
 * @param {{ ok: boolean, status?: number, body?: { error?: string, path?: string, paths?: string[] } }} result
 * @param {(key: string) => string} t
 */
export function parsePickedPathsResult(result, t) {
  if (!result || !result.ok) {
    return { ok: false, error: pickErrorText(result, t), paths: [] }
  }
  const bodyPaths = result.body?.paths
  if (Array.isArray(bodyPaths)) {
    const valid = bodyPaths.filter((p) => typeof p === 'string' && p !== '')
    if (valid.length > 0) return { ok: true, error: '', paths: valid }
  }
  const single = result.body?.path
  if (typeof single === 'string' && single !== '') {
    return { ok: true, error: '', paths: [single] }
  }
  return { ok: true, error: '', paths: [] }
}

/**
 * Toggle an asset ID in a Set.
 * @param {Set<string>} prevSet
 * @param {string} assetId
 * @returns {Set<string>}
 */
export function toggleAssetIdInSet(prevSet, assetId) {
  const next = new Set(prevSet)
  if (next.has(assetId)) next.delete(assetId)
  else next.add(assetId)
  return next
}

/**
 * Prune deleted IDs from a selection Set against live assets.
 * @param {Set<string>} selectedIds
 * @param {Array<{ id: string }>} liveAssets
 * @returns {Set<string>}
 */
export function cleanRemovedSelection(selectedIds, liveAssets) {
  const live = new Set((liveAssets || []).map((row) => row.id))
  const kept = [...selectedIds].filter((id) => live.has(id))
  if (kept.length === selectedIds.size) return selectedIds
  return new Set(kept)
}

/**
 * How many assets each type holds.
 *
 * The count describes the whole library, never the rows a query leaves on
 * screen: a category chip's number has to hold still while the search box
 * narrows the grid. Rows without a readable type are skipped rather than
 * pooled into a bucket nothing can select — the Host normalizes every stored
 * row onto the known type set, so a typeless row is not reachable by a chip.
 * @param {Array<{ type?: string }>} assets
 * @returns {Record<string, number>}
 */
export function countAssetsByType(assets) {
  const counts = {}
  for (const asset of Array.isArray(assets) ? assets : []) {
    const type = typeof asset?.type === 'string' ? asset.type.trim() : ''
    if (type === '') continue
    counts[type] = (counts[type] ?? 0) + 1
  }
  return counts
}

/**
 * Compute empty state labels for AssetGrid.
 * @param {string} filterType
 * @param {string} query
 * @param {(key: string) => string} t
 */
export function computeEmptyState(filterType, query, t) {
  const searching = Boolean(String(query || '').trim())
  const emptyTypeLabel = filterType ? t(`type.${filterType}`) : ''
  let emptyLabel = t('empty.all')
  if (searching) {
    emptyLabel = t('empty.noMatch')
  } else if (filterType) {
    emptyLabel = t('empty.type').replace('{type}', emptyTypeLabel)
  }
  let emptyActionLabel = undefined
  if (!searching) {
    emptyActionLabel = filterType
      ? t('empty.addType').replace('{type}', emptyTypeLabel)
      : t('add.button')
  }
  return { searching, emptyLabel, emptyActionLabel }
}
