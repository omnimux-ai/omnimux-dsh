import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getLocalInspiration, whenAuthReady } from './api.js'
import { CONTENT_LANDING_TABS, LANDED_PIN_MS, tabAfterContentImport } from './import-landing.js'
import { createImportPoller } from './import-poller.js'
import { importErrorDetail, isImportingRow } from './import-status.js'
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
  const { items, selectedItem, setSelectedItem, setItems, onRemoved } = options || {}
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
      // A deleted row must not survive on screen through the landing pin: the
      // pin holds a row the feed no longer lists, which is exactly the state a
      // removal leaves behind.
      onRemoved?.(ids)
    } catch (err) {
      console.error('Failed to delete local inspirations:', err)
    } finally {
      setRemoving(false)
    }
  }, [pendingRemove, selectedItem, setItems, setSelectedItem, onRemoved])

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

/**
 * Tab identifiers the feed knows about. `rivals` is the 对标账号 workbench: it
 * renders its own panel instead of the inspiration grid, so the feed simply
 * stops issuing requests for it and leaves every other branch untouched.
 */
export const INSPIRATION_TABS = ['all', 'local', 'public', 'rivals']

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
  // The rival workbench owns its own data path; the inspiration feed stays idle
  // while it is on screen, so switching back does not re-query twice.
  const rivalTab = tab === 'rivals'
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
 *
 * The notice is stored as a locale key plus its parameters, never as formatted
 * text: the wording — and the language — is decided at render time by the page.
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
        // The item itself was stored and only the AI breakdown failed, so this is
        // not an import failure: it says what is missing and that re-running the
        // breakdown is enough.
        onSettled: (item) => {
          const detail = importErrorDetail(item)
          if (detail) setImportFailed({ key: 'add.analysisFailed', detail })
        },
        onFailed: (item) => {
          if (item) setItemsRef.current((prev) => updateItemInList(prev, item))
          // Retryable by design: importing the same URL again reuses this row's id
          // and restarts the job in place, so the notice may say so.
          setImportFailed({ key: 'add.status.failed', detail: importErrorDetail(item), retryable: true })
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
  const { tab, setTab } = filters
  const data = useFeedData({ active, filters })
  const { items, setItems, backendPlatforms, hasMore, loading, loadingMore, loadData } = data

  const [selectedItem, setSelectedItem] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importedPlatforms, setImportedPlatforms] = useState([])
  // Row the last content import produced. It stays pinned above the list for
  // `LANDED_PIN_MS` so neither the post-import reload nor an active filter can
  // hide the card the user is looking for; the section renders it.
  const [landedItem, setLandedItem] = useState(null)
  const sentinelRef = useRef(null)

  const dropLanded = useCallback((ids) => {
    const removed = new Set((ids || []).map((id) => String(id)))
    setLandedItem((prev) => (prev && removed.has(String(prev.id)) ? null : prev))
  }, [])

  const replicate = useReplicateToChat()
  const selection = useFeedSelection({ items, selectedItem, setSelectedItem, setItems, onRemoved: dropLanded })
  const watch = useImportWatch({ setItems })

  useSentinelObserver({ sentinelRef, hasMore, loading, loadingMore, loadData })

  // Rebuild the watch set from whatever the feed actually holds, so a page that
  // was closed while an import ran resumes watching it on its very first load.
  useEffect(() => {
    watch.pollerRef.current?.sync(items)
  }, [items, watch.pollerRef])

  // The pin is a reveal window, not a second list: it expires on its own, and it
  // is dropped as soon as the grid moves to a tab that cannot hold a local row.
  useEffect(() => {
    if (!landedItem) return undefined
    if (!CONTENT_LANDING_TABS.includes(tab)) {
      setLandedItem(null)
      return undefined
    }
    const timer = setTimeout(() => setLandedItem(null), LANDED_PIN_MS)
    return () => clearTimeout(timer)
  }, [landedItem, tab])

  /**
   * A content import landed in the local library: prepend the row, keep the grid
   * on a tab that can show it, and pin it so the user sees what they imported.
   *
   * The preview modal used to be opened here, which answered an import with a
   * modal for a row the user had not asked to look at — the row's own card is
   * the thing the import produced, and clicking it still opens that preview.
   * @param {object} newItem the stored row, or the 202 placeholder of a
   *   background job the grid will keep polling
   */
  const handleImportSuccess = useCallback((newItem) => {
    if (!newItem) return
    setItems((prev) => [newItem, ...prev])
    setLandedItem(newItem)
    // `all` already lists local rows and is kept; `public` cannot show a local
    // row at all, so the grid follows the import to `local`.
    setTab((prev) => tabAfterContentImport(prev))
    if (isImportingRow(newItem)) watch.pollerRef.current?.track([newItem.id])
    const plat = (newItem?.source_platform || newItem?.platform || '').trim().toLowerCase()
    if (plat && plat !== 'unknown') {
      const canonical = plat === 'twitter' ? 'x' : plat
      setImportedPlatforms((prev) => (prev.includes(canonical) ? prev : [...prev, canonical]))
    }
  }, [setItems, setTab, watch.pollerRef])

  /**
   * An account import landed in the 对标账号 workbench. The panel mounts fresh on
   * that tab and loads the account list itself, so the new account card is what
   * the user sees; an account is not a library row, so nothing enters the grid.
   */
  const handleAccountImported = useCallback(() => {
    setTab('rivals')
  }, [setTab])

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
    landedItem,
    handleImportSuccess,
    handleAccountImported,
    handleItemUpdated,
    importFailed: watch.importFailed,
    clearImportFailed: watch.setImportFailed,
    ...selection,
  }
}
