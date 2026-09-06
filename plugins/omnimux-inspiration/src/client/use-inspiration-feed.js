import { useCallback, useEffect, useRef, useState } from 'react'
import { whenAuthReady } from './api.js'
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

function useInspirationFilters() {
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState('hot')
  const [favorite, setFavorite] = useState('0')
  return {
    tab, setTab,
    q, setQ,
    type, setType,
    sort, setSort,
    favorite, setFavorite,
  }
}

function useFeedData(options) {
  const { active, filters } = options || {}
  const { tab, q, type, sort, favorite } = filters || {}
  const [items, setItems] = useState([])
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
    return executeFeedLoad(
      {
        isNextPage,
        tab,
        q,
        type,
        sort,
        favorite,
        page: pageRef.current,
        hasExistingItems: itemsRef.current.length > 0,
      },
      { setItems, setPage, setHasMore, setPhase, setError, setLoading, setLoadingMore },
    )
  }, [tab, q, type, sort, favorite])

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
 * Pagination, tab/filter loading, selection and replicate busy state
 * for the inspiration grid. Extracted from InspirationSection.
 */
export function useInspirationFeed({ active }) {
  const filters = useInspirationFilters()
  const data = useFeedData({ active, filters })
  const { items, setItems, hasMore, loading, loadingMore, loadData } = data

  const [selectedItem, setSelectedItem] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const sentinelRef = useRef(null)

  const replicate = useReplicateToChat()
  const selection = useFeedSelection({ items, selectedItem, setSelectedItem, setItems })

  useSentinelObserver({ sentinelRef, hasMore, loading, loadingMore, loadData })

  const handleImportSuccess = useCallback((newItem) => {
    setItems((prev) => [newItem, ...prev])
    setSelectedItem(newItem)
  }, [setItems])

  const handleItemUpdated = useCallback((updatedItem) => {
    setItems((prev) => updateItemInList(prev, updatedItem))
    setSelectedItem(updatedItem)
  }, [setItems])

  return {
    ...filters,
    ...data,
    selectedItem,
    setSelectedItem,
    importOpen,
    setImportOpen,
    sentinelRef,
    ...replicate,
    handleImportSuccess,
    handleItemUpdated,
    ...selection,
  }
}
