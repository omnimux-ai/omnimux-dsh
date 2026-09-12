import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getLocalInspiration, whenAuthReady } from './api.js'
import { createImportPoller } from './import-poller.js'
import { isImportingRow } from './import-status.js'
import {
  applyCachedPage,
  cacheKeyOf,
  createReplicateStatusHandler,
  executeBatchDelete,
  executeFeedLoad,
  extractLocalItemIds,
  filterOutItemsByIds,
  mergeFetchResult,
  removeIdsFromSet,
  resetReplicateBusy,
  toggleIdInSet,
  updateItemInList,
} from './feed-helpers.js'
import { oneClickReplicate } from './replicate-to-chat.js'

export {
  applyCachedPage,
  cacheKeyOf,
  createReplicateStatusHandler,
  executeBatchDelete,
  executeFeedLoad,
  extractLocalItemIds,
  filterOutItemsByIds,
  mergeFetchResult,
  removeIdsFromSet,
  resetReplicateBusy,
  toggleIdInSet,
  updateItemInList,
}

function useReplicateToChat() {
  const [replicateBusy, setReplicateBusy] = useState(null)
  const [ctaStatus, setCtaStatus] = useState(null)
  const ctaStatusTimer = useRef(null)
  const replicateBusyRef = useRef(null)

  useEffect(() => {
    return () => {
      if (ctaStatusTimer.current) clearTimeout(ctaStatusTimer.current)
    }
  }, [])

  const flashCtaStatus = useCallback((key) => {
    if (ctaStatusTimer.current) clearTimeout(ctaStatusTimer.current)
    setCtaStatus(key)
    if (key) {
      ctaStatusTimer.current = setTimeout(() => setCtaStatus(null), 2000)
    }
  }, [])

  const handleReplicate = useCallback((row) => {
    if (replicateBusyRef.current) return
    const ticket = row.id
    replicateBusyRef.current = ticket
    setReplicateBusy(ticket)

    const onStatus = createReplicateStatusHandler(flashCtaStatus, setCtaStatus)
    const execOpts = { onStatus }
    void oneClickReplicate(row, execOpts).finally(() => {
      resetReplicateBusy(replicateBusyRef, setReplicateBusy, ticket)
    })
  }, [flashCtaStatus])

  return { replicateBusy, ctaStatus, handleReplicate }
}

function useFeedSelection(options) {
  const { items, selectedItem, setSelectedItem, setItems } = options || {}
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [pendingRemove, setPendingRemove] = useState(null)
  const [removing, setRemoving] = useState(false)

  const toggleSelect = useCallback((row) => {
    if (!row.is_local) return
    setSelectedIds((prev) => toggleIdInSet(prev, row.id))
  }, [])

  const selectAllLocal = useCallback(() => {
    setSelectedIds(new Set(extractLocalItemIds(items)))
  }, [items])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleConfirmBatchRemove = useCallback(async () => {
    const ids = pendingRemove?.ids
    if (!ids || ids.length === 0) return
    setRemoving(true)
    try {
      await executeBatchDelete(ids, { selectedItem, setSelectedItem, setItems, setSelectedIds, setPendingRemove })
    } catch (err) {
      console.error('Failed to delete local inspirations:', err)
    } finally {
      setRemoving(false)
    }
  }, [pendingRemove, selectedItem, setItems, setSelectedItem])

  return {
    selectedIds,
    setSelectedIds,
    pendingRemove,
    setPendingRemove,
    removing,
    selectedCount: selectedIds.size,
    selecting: selectedIds.size > 0,
    toggleSelect,
    selectAllLocal,
    clearSelection,
    handleConfirmBatchRemove,
  }
}

function createSentinelObserver(sentinelEl, options) {
  const { hasMore, loading, loadingMore, loadData } = options
  const observer = new IntersectionObserver((entries) => {
    const isVisible = Boolean(entries[0]?.isIntersecting)
    const isIdle = !loading && !loadingMore
    if (isVisible && hasMore && isIdle) {
      loadData(true)
    }
  }, { rootMargin: '200px' })
  observer.observe(sentinelEl)
  return observer
}

function useSentinelObserver(options) {
  const { sentinelRef, hasMore, loading, loadingMore, loadData } = options || {}
  useEffect(() => {
    const sentinelEl = sentinelRef?.current
    const isIdle = !loading && !loadingMore
    if (!sentinelEl || !hasMore || !isIdle) return
    const observer = createSentinelObserver(sentinelEl, { hasMore, loading, loadingMore, loadData })
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, loadData, sentinelRef])
}

export function resolveDurationRange(durationKey) {
  if (durationKey === '0-15') return { duration_min: undefined, duration_max: 15 }
  if (durationKey === '15-30') return { duration_min: 15, duration_max: 30 }
  if (durationKey === '30-60') return { duration_min: 30, duration_max: 60 }
  if (durationKey === '60+') return { duration_min: 60, duration_max: undefined }
  return { duration_min: undefined, duration_max: undefined }
}

export function resolveViewsRange(viewsKey) {
  if (viewsKey === '10k+') return { views_min: 10000, views_max: undefined }
  if (viewsKey === '100k+') return { views_min: 100000, views_max: undefined }
  if (viewsKey === '500k+') return { views_min: 500000, views_max: undefined }
  if (viewsKey === '1m+') return { views_min: 1000000, views_max: undefined }
  if (viewsKey === '5m+') return { views_min: 5000000, views_max: undefined }
  if (viewsKey === '10m+') return { views_min: 10000000, views_max: undefined }
  return { views_min: undefined, views_max: undefined }
}

export function resolveDateRange(dateKey, nowMs = Date.now()) {
  if (dateKey === 'last7') {
    return { posted_after: new Date(nowMs - 7 * 86400000).toISOString().slice(0, 10), posted_before: undefined }
  }
  if (dateKey === 'last30') {
    return { posted_after: new Date(nowMs - 30 * 86400000).toISOString().slice(0, 10), posted_before: undefined }
  }
  if (dateKey === 'last90') {
    return { posted_after: new Date(nowMs - 90 * 86400000).toISOString().slice(0, 10), posted_before: undefined }
  }
  if (typeof dateKey === 'string' && dateKey.includes(':')) {
    const [after, before] = dateKey.split(':')
    return { posted_after: after || undefined, posted_before: before || undefined }
  }
  return { posted_after: undefined, posted_before: undefined }
}

function useInspirationFilters() {
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [platform, setPlatform] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState('hot')
  const [favorite, setFavorite] = useState('0')
  const [country, setCountry] = useState('')
  const [category, setCategory] = useState('')
  const [duration, setDuration] = useState('')
  const [views, setViews] = useState('')
  const [trafficType, setTrafficType] = useState('')
  const [dateRange, setDateRange] = useState('')

  return {
    tab, setTab,
    q, setQ,
    platform, setPlatform,
    type, setType,
    sort, setSort,
    favorite, setFavorite,
    country, setCountry,
    category, setCategory,
    duration, setDuration,
    views, setViews,
    trafficType, setTrafficType,
    dateRange, setDateRange,
  }
}

function useFeedData(options) {
  const { active, filters } = options || {}
  const {
    tab, q, platform, type, sort, favorite,
    country, category, duration, views, trafficType, dateRange,
  } = filters || {}
  const [items, setItems] = useState([])
  const [backendPlatforms, setBackendPlatforms] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [phase, setPhase] = useState('loading')
  const [error, setError] = useState(null)
  const pageRef = useRef(page)
  const itemsRef = useRef(items)

  useEffect(() => {
    pageRef.current = page
  }, [page])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const loadData = useCallback((isNextPage = false) => {
    if (!isNextPage) {
      pageRef.current = 1
      setPage(1)
    }
    const { duration_min, duration_max } = resolveDurationRange(duration)
    const { views_min, views_max } = resolveViewsRange(views)
    const { posted_after, posted_before } = resolveDateRange(dateRange)

    return executeFeedLoad(
      {
        isNextPage,
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
        traffic_type: trafficType,
        posted_after,
        posted_before,
        page: pageRef.current,
        hasExistingItems: itemsRef.current.length > 0,
      },
      { setItems, setPage, setHasMore, setPhase, setError, setLoading, setLoadingMore, setPlatforms: setBackendPlatforms },
    )
  }, [tab, q, platform, type, sort, favorite, country, category, duration, views, trafficType, dateRange])

  useEffect(() => {
    if (!active) return
    loadData(false)
  }, [active, loadData])

  useEffect(() => {
    return whenAuthReady(() => {
      loadData(false)
    })
  }, [loadData])

  return {
    items,
    setItems,
    backendPlatforms,
    setBackendPlatforms,
    page,
    hasMore,
    loading,
    loadingMore,
    phase,
    error,
    loadData,
  }
}

/**
 * Watch background imports until they settle.
 *
 * Two ways a row enters the watch set: the 202 that started the job, and any row
 * a feed load reports as still importing. The second is what makes the feature
 * survive a reload — the page rebuilds its watch set from persisted rows alone,
 * so a job started before the tab was closed is still picked up.
 *
 * When a row settles the list is patched in place by id. A full reload would
 * work too, but it would drop the user's scroll position and page for an event
 * that changes exactly one card. A `404` means the user deleted the row, so it is
 * dropped from the grid instead of being left to poll a gone id forever.
 * @param {{ setItems: Function }} options
 */
function useImportWatch(options) {
  const { setItems } = options
  const pollerRef = useRef(null)
  const setItemsRef = useRef(setItems)
  const [importFailed, setImportFailed] = useState(null)

  useEffect(() => {
    setItemsRef.current = setItems
  }, [setItems])

  if (pollerRef.current === null) {
    pollerRef.current = createImportPoller({
      deps: {
        fetchItem: (id) => getLocalInspiration(id),
        onItem: (item) => {
          setItemsRef.current((prev) => updateItemInList(prev, item))
        },
        onRemove: (id) => {
          setItemsRef.current((prev) => filterOutItemsByIds(prev, [id]))
        },
        onDegraded: () => setImportFailed({ key: 'add.degradedNotice' }),
        onFailed: (item) => {
          if (item) setItemsRef.current((prev) => updateItemInList(prev, item))
          setImportFailed({ key: 'add.status.failed', detail: item?.import_error || '' })
        },
      },
    })
  }

  useEffect(() => {
    const poller = pollerRef.current
    poller.start()
    return () => poller.dispose()
  }, [])

  return { pollerRef, importFailed, setImportFailed }
}

/**
 * Pagination, tab/filter loading, selection and replicate busy state
 * for the inspiration grid. Extracted from InspirationSection.
 */
export function useInspirationFeed({ active }) {
  const filters = useInspirationFilters()
  const data = useFeedData({ active, filters })
  const { items, setItems, backendPlatforms, hasMore, loading, loadingMore, loadData } = data

  const [selectedItem, setSelectedItem] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importedPlatforms, setImportedPlatforms] = useState([])
  const sentinelRef = useRef(null)

  const replicate = useReplicateToChat()
  const selection = useFeedSelection({ items, selectedItem, setSelectedItem, setItems })
  const watch = useImportWatch({ setItems })

  useSentinelObserver({ sentinelRef, hasMore, loading, loadingMore, loadData })

  // Rebuild the watch set from whatever the feed actually holds, so a page that
  // was closed while an import ran resumes watching it on its very first load.
  useEffect(() => {
    watch.pollerRef.current?.sync(items)
  }, [items, watch.pollerRef])

  const handleImportSuccess = useCallback((newItem) => {
    setItems((prev) => [newItem, ...prev])
    setSelectedItem(newItem)
    if (isImportingRow(newItem)) watch.pollerRef.current?.track([newItem.id])
    const plat = (newItem?.source_platform || newItem?.platform || '').trim().toLowerCase()
    if (plat && plat !== 'unknown') {
      const canonical = plat === 'twitter' ? 'x' : plat
      setImportedPlatforms((prev) => (prev.includes(canonical) ? prev : [...prev, canonical]))
    }
  }, [setItems, watch.pollerRef])

  const handleItemUpdated = useCallback((updatedItem) => {
    setItems((prev) => updateItemInList(prev, updatedItem))
    setSelectedItem(updatedItem)
  }, [setItems])

  // Track all unique platforms seen in items across fetches
  const [discoveredPlatforms, setDiscoveredPlatforms] = useState([])
  useEffect(() => {
    if (!items || items.length === 0) return
    setDiscoveredPlatforms((prev) => {
      const set = new Set(prev)
      let changed = false
      for (const item of items) {
        let plat = (item?.source_platform || item?.platform || '').trim().toLowerCase()
        if (plat === 'twitter') plat = 'x'
        if (plat && plat !== 'unknown' && !set.has(plat)) {
          set.add(plat)
          changed = true
        }
      }
      return changed ? Array.from(set) : prev
    })
  }, [items])

  const availablePlatforms = useMemo(() => {
    const set = new Set()
    for (const item of items) {
      let plat = (item?.source_platform || item?.platform || '').trim().toLowerCase()
      if (plat === 'twitter') plat = 'x'
      if (plat && plat !== 'unknown') set.add(plat)
    }
    for (const p of discoveredPlatforms) {
      let plat = String(p || '').trim().toLowerCase()
      if (plat === 'twitter') plat = 'x'
      if (plat && plat !== 'unknown') set.add(plat)
    }
    for (const p of backendPlatforms || []) {
      const name = typeof p === 'object' && p !== null ? p.name : p
      let plat = String(name || '').trim().toLowerCase()
      if (plat === 'twitter') plat = 'x'
      if (plat && plat !== 'unknown') set.add(plat)
    }
    for (const p of importedPlatforms) {
      let plat = String(p || '').trim().toLowerCase()
      if (plat === 'twitter') plat = 'x'
      if (plat && plat !== 'unknown') set.add(plat)
    }
    return Array.from(set)
  }, [items, discoveredPlatforms, backendPlatforms, importedPlatforms])

  return {
    ...filters,
    ...data,
    platform: filters.platform,
    setPlatform: filters.setPlatform,
    availablePlatforms,
    selectedItem,
    setSelectedItem,
    importOpen,
    setImportOpen,
    sentinelRef,
    ...replicate,
    handleImportSuccess,
    handleItemUpdated,
    importFailed: watch.importFailed,
    clearImportFailed: watch.setImportFailed,
    ...selection,
  }
}
