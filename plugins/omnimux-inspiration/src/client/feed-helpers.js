import {
  batchDeleteLocalInspirations,
  getInspirationCache,
  loadInspirationsAtomic,
  setInspirationCache,
} from './api.js'

/**
 * Construct SWR-style cache key for inspiration query parameters.
 * Shape: `insp:${tab}:${q}:${type}:${sort}:${favorite}(:${extra})*`
 */
export function cacheKeyOf(...args) {
  const p = typeof args[0] === 'object' && args[0] !== null ? args[0] : {}
  const tab = p.tab ?? args[0] ?? 'all'
  const q = p.q ?? args[1] ?? ''
  const type = p.type ?? args[2] ?? ''
  const sort = p.sort ?? args[3] ?? 'hot'
  const favorite = p.favorite ?? args[4] ?? '0'
  const base = `insp:${tab || 'all'}:${q || ''}:${type || ''}:${sort || 'hot'}:${favorite ?? '0'}`

  const extraParts = []
  if (p.country) extraParts.push(`c=${p.country}`)
  if (p.category) extraParts.push(`cat=${p.category}`)
  if (p.duration_min != null && p.duration_min !== '') extraParts.push(`dmin=${p.duration_min}`)
  if (p.duration_max != null && p.duration_max !== '') extraParts.push(`dmax=${p.duration_max}`)
  if (p.views_min != null && p.views_min !== '') extraParts.push(`vmin=${p.views_min}`)
  if (p.views_max != null && p.views_max !== '') extraParts.push(`vmax=${p.views_max}`)
  if (p.traffic_type) extraParts.push(`tt=${p.traffic_type}`)
  if (p.posted_after) extraParts.push(`pafter=${p.posted_after}`)
  if (p.posted_before) extraParts.push(`pbefore=${p.posted_before}`)

  if (extraParts.length > 0) {
    return `${base}:${extraParts.join('&')}`
  }
  return base
}

/**
 * Apply cached page payload to React state setters if available.
 * Returns true if fresh cache was applied (caller can early-return).
 */
export function applyCachedPage(cached, setters) {
  if (!cached || !cached.data) return false
  const { setItems, setHasMore, setPhase, setLoading } = setters || {}
  if (setItems) setItems(cached.data.items || [])
  if (setHasMore) setHasMore(Boolean(cached.data.hasMore))
  if (setPhase && cached.data.phase) setPhase(cached.data.phase)
  if (setLoading) setLoading(false)
  return !cached.isStale
}

function applyNextPageResult(result, targetPage, setters) {
  const { setItems, setPage, setHasMore } = setters
  if (setItems) setItems((prev) => [...prev, ...(result.items || [])])
  if (setPage) setPage(targetPage)
  if (setHasMore) setHasMore(Boolean(result.hasMore))
}

function applyFirstPageResult(result, cacheKey, setters) {
  const { setItems, setPage, setHasMore, setPhase } = setters
  if (setItems) setItems(result.items || [])
  if (setPage) setPage(1)
  if (setHasMore) setHasMore(Boolean(result.hasMore))
  if (setPhase && result.phase) setPhase(result.phase)
  if (cacheKey) setInspirationCache(cacheKey, result)
}

/**
 * Merge newly fetched inspiration items into feed state and cache.
 */
export function mergeFetchResult(options) {
  const { isNextPage, result, targetPage = 1, cacheKey, setters } = options || {}
  if (!result || !setters) return
  if (isNextPage) {
    applyNextPageResult(result, targetPage, setters)
  } else {
    applyFirstPageResult(result, cacheKey, setters)
  }
  if (setters.setError) setters.setError(null)
}

export function toggleIdInSet(prevSet, id) {
  const next = new Set(prevSet)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  return next
}

export function removeIdsFromSet(prevSet, idsToRemove) {
  const next = new Set(prevSet)
  const set = idsToRemove instanceof Set ? idsToRemove : new Set(idsToRemove)
  for (const id of set) {
    next.delete(id)
  }
  return next
}

export function filterOutItemsByIds(items, idsToRemove) {
  const removedSet = idsToRemove instanceof Set ? idsToRemove : new Set(idsToRemove)
  return (items || []).filter((it) => !removedSet.has(it.id))
}

export function extractLocalItemIds(items) {
  return (items || []).filter((it) => it.is_local).map((it) => it.id)
}

export function updateItemInList(items, updatedItem) {
  if (!updatedItem) return items || []
  return (items || []).map((it) => (it.id === updatedItem.id ? updatedItem : it))
}

export function createReplicateStatusHandler(flashCtaStatus, setCtaStatus) {
  return (key) => {
    if (key === 'card.cta.replicating') {
      setCtaStatus(key)
      return
    }
    if (key == null) {
      setCtaStatus(null)
      return
    }
    flashCtaStatus(key)
  }
}

export function resetReplicateBusy(ref, busySetter, ticket) {
  if (ref.current !== ticket) return
  ref.current = null
  busySetter(null)
}

export async function executeBatchDelete(ids, setters) {
  const { selectedItem, setSelectedItem, setItems, setSelectedIds, setPendingRemove } = setters
  await batchDeleteLocalInspirations(ids)
  setItems((prev) => filterOutItemsByIds(prev, ids))
  setSelectedIds((prev) => removeIdsFromSet(prev, ids))
  const isSelectedRemoved = Boolean(selectedItem && ids.includes(selectedItem.id))
  if (isSelectedRemoved) {
    setSelectedItem(null)
  }
  setPendingRemove(null)
}

export async function fetchAndMergeInspirations(params, options) {
  const {
    tab, q, type, sort, favorite, targetPage,
    country, category, duration_min, duration_max,
    views_min, views_max, traffic_type, posted_after, posted_before,
  } = params
  const { isNextPage, cacheKey, setters } = options
  const result = await loadInspirationsAtomic({
    tab,
    q,
    type,
    sort,
    favorite,
    country,
    category,
    duration_min,
    duration_max,
    views_min,
    views_max,
    traffic_type,
    posted_after,
    posted_before,
    page: targetPage,
    pageSize: 20,
  })
  mergeFetchResult({
    isNextPage,
    result,
    targetPage,
    cacheKey,
    setters,
  })
}

export function checkCacheEarlyReturn(cacheKey, setters) {
  const cached = getInspirationCache(cacheKey)
  const hitFresh = applyCachedPage(cached, setters)
  if (hitFresh) return true
  if (!cached && setters.setLoading) setters.setLoading(true)
  return false
}

export async function executeFeedLoad(params, setters) {
  const {
    isNextPage, tab, q, type, sort, favorite, page, hasExistingItems,
    country, category, duration_min, duration_max,
    views_min, views_max, traffic_type, posted_after, posted_before,
  } = params
  const { setItems, setPage, setHasMore, setPhase, setError, setLoading, setLoadingMore } = setters
  const targetPage = isNextPage ? page + 1 : 1
  const cacheKey = cacheKeyOf({
    tab, q, type, sort, favorite,
    country, category, duration_min, duration_max,
    views_min, views_max, traffic_type, posted_after, posted_before,
  })

  if (!isNextPage) {
    const hitFresh = checkCacheEarlyReturn(cacheKey, { setItems, setHasMore, setPhase, setLoading })
    if (hitFresh) return
  } else {
    setLoadingMore(true)
  }

  try {
    await fetchAndMergeInspirations(
      {
        tab, q, type, sort, favorite, targetPage,
        country, category, duration_min, duration_max,
        views_min, views_max, traffic_type, posted_after, posted_before,
      },
      { isNextPage, cacheKey, setters: { setItems, setPage, setHasMore, setPhase, setError } },
    )
  } catch (err) {
    setError(String(err?.message || err))
    const shouldResetPhase = !isNextPage && !hasExistingItems
    if (shouldResetPhase) setPhase('ready')
  } finally {
    setLoading(false)
    setLoadingMore(false)
  }
}
