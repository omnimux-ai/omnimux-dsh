import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getState, listRecords } from './api.js'
import {
  TAB_FILTER,
  SUBMIT_POLL_MS,
  SUBMIT_POLL_MAX_MS,
  matchesTab,
  matchesSearchQuery,
  filterRecord,
  compareRecords,
  buildCsvContent,
  exportCsv,
  executeSingleRetry,
  executeBatchRetry,
  executeBatchDeleteDrafts,
  executeDeleteDraft,
} from './feed-helpers.js'

export {
  TAB_FILTER,
  SUBMIT_POLL_MS,
  SUBMIT_POLL_MAX_MS,
  matchesTab,
  matchesSearchQuery,
  filterRecord,
  compareRecords,
  buildCsvContent,
  exportCsv,
  executeSingleRetry,
  executeBatchRetry,
  executeBatchDeleteDrafts,
  executeDeleteDraft,
}

export function useFeedFilters() {
  const [tab, setTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState('recent')
  const [typeFilter, setTypeFilter] = useState('')
  const [modeFilter, setModeFilter] = useState('')

  return {
    tab,
    setTab,
    searchQuery,
    setSearchQuery,
    sortOption,
    setSortOption,
    typeFilter,
    setTypeFilter,
    modeFilter,
    setModeFilter,
  }
}

function extractRecordsFromResponse(recRes) {
  if (!recRes?.ok) return []
  if (!Array.isArray(recRes?.body?.records)) return []
  return recRes.body.records
}

function extractCountsFromResponse(stateRes) {
  if (!stateRes?.ok) return null
  return stateRes?.body?.counts || null
}

async function fetchFeedData(tab) {
  const hostStatus = TAB_FILTER[tab] || 'submitted'
  try {
    const [recRes, stateRes] = await Promise.all([listRecords({ status: hostStatus }), getState(undefined)])
    const records = extractRecordsFromResponse(recRes)
    const counts = extractCountsFromResponse(stateRes)
    return { ok: true, records, counts }
  } catch {
    return { ok: false, records: [], counts: null }
  }
}

export function useFeedData(tab, open, viewName) {
  const [records, setRecords] = useState([])
  const [counts, setCounts] = useState({ total: 0, draft: 0, submitted: 0, reviewing: 0, published: 0, failed: 0 })
  const [listLoading, setListLoading] = useState(false)
  const [revision, setRevision] = useState(undefined)

  const loadList = useCallback(async () => {
    setListLoading(true)
    const res = await fetchFeedData(tab)
    if (res.ok) {
      setRecords(res.records)
      if (res.counts) setCounts(res.counts)
    }
    setListLoading(false)
    return res.ok
  }, [tab])

  useEffect(() => {
    if (!open || viewName !== 'list') return undefined
    void loadList()
    return undefined
  }, [open, viewName, loadList])

  return { records, counts, listLoading, revision, setRevision, setCounts, loadList }
}

function applyStateRevision(body, opts) {
  if (!body || body.unchanged === true) return
  opts.setRevision(body.rev)
  if (body.counts) opts.setCounts(body.counts)
  if (opts.view?.name === 'list') void opts.loadList()
  if (opts.view?.name === 'detail') opts.setDetailTick((n) => n + 1)
}

async function executeStatePoll(revision, opts) {
  try {
    const result = await getState(revision)
    if (result?.ok) applyStateRevision(result.body, opts)
  } catch {}
}

async function stepPoll(revision, startedAtRef, setTracking, opts) {
  await executeStatePoll(revision, opts)
  const elapsed = Date.now() - startedAtRef.current
  if (elapsed > SUBMIT_POLL_MAX_MS) {
    setTracking(false)
    return false
  }
  return true
}

export function useSubmitPolling(opts) {
  const { open, tracking, revision, startedAtRef, setTracking } = opts

  useEffect(() => {
    if (!open || !tracking) return undefined
    let stopped = false
    let timer = 0

    const schedule = () => {
      timer = setTimeout(poll, SUBMIT_POLL_MS)
    }

    const poll = async () => {
      if (stopped) return
      const ok = await stepPoll(revision, startedAtRef, setTracking, opts)
      if (stopped || !ok) return
      schedule()
    }

    schedule()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [open, tracking, revision, startedAtRef, setTracking, opts])
}

export function useDraftDeleteDialog(t, showToast, loadList) {
  const [pendingDelete, setPendingDelete] = useState(null)
  const [busyDelete, setBusyDelete] = useState(false)

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return
    setBusyDelete(true)
    await executeDeleteDraft(pendingDelete, t, showToast, () => {
      setPendingDelete(null)
      void loadList()
    })
    setBusyDelete(false)
  }, [pendingDelete, t, showToast, loadList])

  return { pendingDelete, setPendingDelete, busyDelete, confirmDelete }
}

export function useBatchOperations(opts) {
  const { records, filteredRecords, loadList, showToast, t } = opts
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const deleteDialog = useDraftDeleteDialog(t, showToast, loadList)

  // Lists reload on tab switch / polling. Drop selections whose records left the
  // list so batch actions never run against stale ids (Issue #4056).
  const recordIds = useMemo(() => new Set(filteredRecords.map((r) => String(r.id))), [filteredRecords])
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const next = new Set()
      for (const id of prev) {
        if (recordIds.has(id)) next.add(id)
      }
      return next.size === prev.size ? prev : next
    })
  }, [recordIds])

  const handleToggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleToggleAll = useCallback((allSelected) => {
    const nextIds = allSelected ? new Set(filteredRecords.map((r) => String(r.id))) : new Set()
    setSelectedIds(nextIds)
  }, [filteredRecords])

  const onBatchDone = useCallback(() => {
    setSelectedIds(new Set())
    setIsBatchMode(false)
    void loadList()
  }, [loadList])

  const handleBatchRetry = useCallback(async () => {
    await executeBatchRetry(records, selectedIds, showToast, onBatchDone)
  }, [records, selectedIds, showToast, onBatchDone])

  const handleBatchDeleteDrafts = useCallback(async () => {
    await executeBatchDeleteDrafts(records, selectedIds, showToast, onBatchDone)
  }, [records, selectedIds, showToast, onBatchDone])

  return {
    isBatchMode,
    setIsBatchMode,
    selectedIds,
    handleToggleSelect,
    handleToggleAll,
    handleBatchRetry,
    handleBatchDeleteDrafts,
    ...deleteDialog,
  }
}

export function useFeedActions(data, filteredRecords, showToast) {
  const handleSingleRetry = useCallback(async (record) => {
    await executeSingleRetry(record, showToast, () => { void data.loadList() })
  }, [showToast, data])

  const handleExport = useCallback(() => {
    exportCsv(filteredRecords, showToast)
  }, [filteredRecords, showToast])

  return { handleSingleRetry, handleExport }
}

export function useFeedTracking() {
  const [toastMsg, setToastMsg] = useState('')
  const [tracking, setTracking] = useState(false)
  const startedAtRef = useRef(0)
  const [detailTick, setDetailTick] = useState(0)

  const showToast = useCallback((msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3000)
  }, [])

  const startTracking = useCallback(() => {
    startedAtRef.current = Date.now()
    setTracking(true)
  }, [])

  return {
    toastMsg,
    showToast,
    tracking,
    setTracking,
    startedAtRef,
    detailTick,
    setDetailTick,
    startTracking,
  }
}

export function usePublishFeed(opts) {
  const { open, view, t } = opts
  const filters = useFeedFilters()
  const data = useFeedData(filters.tab, open, view?.name)
  const track = useFeedTracking()

  useSubmitPolling({
    open,
    tracking: track.tracking,
    view,
    revision: data.revision,
    setTracking: track.setTracking,
    setRevision: data.setRevision,
    setCounts: data.setCounts,
    loadList: data.loadList,
    setDetailTick: track.setDetailTick,
    startedAtRef: track.startedAtRef,
  })

  const filteredRecords = useMemo(() => {
    const q = filters.searchQuery.trim().toLowerCase()
    const list = data.records.filter((rec) => filterRecord(rec, { ...filters, q }))
    list.sort((a, b) => compareRecords(a, b, filters.sortOption))
    return list
  }, [data.records, filters])

  const batch = useBatchOperations({ records: data.records, filteredRecords, loadList: data.loadList, showToast: track.showToast, t })
  const actions = useFeedActions(data, filteredRecords, track.showToast)

  return {
    ...filters,
    records: data.records,
    counts: data.counts,
    listLoading: data.listLoading,
    loadList: data.loadList,
    filteredRecords,
    ...batch,
    ...actions,
    toastMsg: track.toastMsg,
    showToast: track.showToast,
    tracking: track.tracking,
    startTracking: track.startTracking,
    detailTick: track.detailTick,
  }
}
