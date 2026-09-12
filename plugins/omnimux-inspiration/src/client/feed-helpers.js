import {
  batchDeleteLocalInspirations,
  getInspirationCache,
  loadInspirationsAtomic,
  pickCoverSrc,
  setInspirationCache,
} from './api.js'
import { zh } from './locales.js'

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
  if (p.platform) extraParts.push(`plat=${p.platform}`)
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
  const { setItems, setPage, setHasMore, setPhase, setPlatforms } = setters
  if (setItems) setItems(result.items || [])
  if (setPage) setPage(1)
  if (setHasMore) setHasMore(Boolean(result.hasMore))
  if (setPhase && result.phase) setPhase(result.phase)
  if (setPlatforms && Array.isArray(result.platforms)) setPlatforms(result.platforms)
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

/** Canonical locale key for a platform slug; `twitter` is an alias of `x`. */
const PLATFORM_LOCALE_KEYS = {
  x: 'x',
  twitter: 'x',
}

/**
 * Human-readable platform label.
 *
 * The `platform.<slug>` locale table is the only source of these names (the
 * backend reads the same table), so no second table can drift from it. Anything
 * self-registered keeps the first-letter-capitalized rule.
 * @param {unknown} platform
 * @param {(key: string) => string} [translate]
 * @returns {string}
 */
export function formatPlatformName(platform, translate) {
  const raw = typeof platform === 'string' ? platform.trim() : ''
  if (!raw) return ''
  const localeKey = PLATFORM_LOCALE_KEYS[raw.toLowerCase()] || raw.toLowerCase()
  if (typeof translate === 'function') {
    const messageKey = `platform.${localeKey}`
    const localized = translate(messageKey)
    if (typeof localized === 'string' && localized && localized !== messageKey) return localized
  }
  const fromLocale = zh[`platform.${localeKey}`]
  if (typeof fromLocale === 'string' && fromLocale) return fromLocale
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/**
 * UI gating rule for the platform filter: a dropdown that can only select one
 * value carries no information, so it is rendered from two platforms upwards.
 * @param {unknown} availablePlatforms
 * @returns {boolean}
 */
export function shouldShowPlatformFilter(availablePlatforms) {
  return Array.isArray(availablePlatforms) && availablePlatforms.length > 1
}

/**
 * Options for the platform filter dropdown, or null when the gate hides it.
 * This is the exact list `InspirationSection` renders, so gating can be verified
 * without reading the component source.
 * @param {unknown} availablePlatforms
 * @param {(key: string) => string} translate
 * @returns {Array<{ value: string, label: string }> | null}
 */
export function buildPlatformFilterOptions(availablePlatforms, translate) {
  if (!shouldShowPlatformFilter(availablePlatforms)) return null
  return [
    { value: '', label: translate('platform.all') },
    ...availablePlatforms.map((plat) => ({
      value: plat,
      label: formatPlatformName(plat, translate),
    })),
  ]
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

export function preloadCover(url) {
  if (!url || typeof Image === 'undefined') return Promise.resolve(true)
  return new Promise((resolve) => {
    try {
      const img = new Image()
      let settled = false
      const done = (ok) => {
        if (settled) return
        settled = true
        resolve(ok)
      }
      img.onload = () => {
        if (typeof img.decode === 'function') {
          img.decode().then(() => done(true)).catch(() => done(true))
        } else {
          done(true)
        }
      }
      img.onerror = () => done(false)
      img.src = url
      if (img.complete) {
        if (typeof img.decode === 'function') {
          img.decode().then(() => done(true)).catch(() => done(true))
        } else {
          done(true)
        }
      }
    } catch {
      resolve(false)
    }
  })
}

export async function preloadBatchCovers(items, timeoutMs = 600) {
  if (!items || !items.length || typeof Image === 'undefined') return
  const promises = items.map((item) => {
    const src = pickCoverSrc(item)
    return preloadCover(src)
  })
  let timer
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(resolve, timeoutMs)
  })
  await Promise.race([Promise.allSettled(promises), timeoutPromise])
  if (timer) clearTimeout(timer)
}

export async function fetchAndMergeInspirations(params, options) {
  const {
    tab, q, platform, type, sort, favorite, targetPage,
    country, category, duration_min, duration_max,
    views_min, views_max, traffic_type, posted_after, posted_before,
  } = params
  const { isNextPage, cacheKey, setters } = options
  const result = await loadInspirationsAtomic({
    tab,
    q,
    platform,
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
    pageSize: params.pageSize || 20,
  })
  if (result?.items && result.items.length) {
    await preloadBatchCovers(result.items, 600)
  }
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
    isNextPage, tab, q, platform, type, sort, favorite, page, hasExistingItems,
    country, category, duration_min, duration_max,
    views_min, views_max, traffic_type, posted_after, posted_before,
  } = params
  const { setItems, setPage, setHasMore, setPhase, setError, setLoading, setLoadingMore, setPlatforms } = setters
  const targetPage = isNextPage ? page + 1 : 1
  const cacheKey = cacheKeyOf({
    tab, q, platform, type, sort, favorite,
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
        tab, q, platform, type, sort, favorite, targetPage,
        country, category, duration_min, duration_max,
        views_min, views_max, traffic_type, posted_after, posted_before,
      },
      { isNextPage, cacheKey, setters: { setItems, setPage, setHasMore, setPhase, setError, setPlatforms } },
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
