import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createAsset, deleteAsset, getState, pickPath, updateAsset } from './api.js'
import {
  citeOf,
  cleanRemovedSelection,
  errText,
  filterAndSortAssets,
  messageOf,
  parsePickedPathsResult,
  toggleAssetIdInSet,
} from './feed-helpers.js'

export const POLL_MS = 5000

function resolveRevsArgs(current, force) {
  if (force) return { lrev: undefined, arev: undefined }
  if (current.lrev === null || current.arev === null) {
    return { lrev: undefined, arev: undefined }
  }
  return { lrev: current.lrev, arev: current.arev }
}

function extractRevisionsFromBody(body) {
  const rawLrev = body?.lrev ?? body?.mrev
  return {
    lrev: Number(rawLrev) || 0,
    arev: Number(body?.arev) || 0,
  }
}

async function executeStateFetch(options) {
  const { revisionsRef, force, t, setRevisions, applyFreshState, setError } = options
  const revs = resolveRevsArgs(revisionsRef.current, force)

  try {
    const result = await getState(revs.lrev, revs.arev)
    if (!result.ok) {
      setError(messageOf(result, t))
      return
    }
    setError('')
    const next = extractRevisionsFromBody(result.body)
    revisionsRef.current = next
    setRevisions(next)
    applyFreshState(result.body)
  } catch (caught) {
    setError(errText(caught))
  }
}

async function executeMutation(options) {
  const { work, after, refreshState, setBusy, setError, setFormError, t } = options
  setBusy(true)
  setError('')
  try {
    const result = await Promise.resolve(work())
    if (!result.ok) {
      const msg = messageOf(result, t)
      setError(msg)
      setFormError(msg)
      return
    }
    setFormError('')
    if (after) after(result)
    await refreshState(true)
  } catch (caught) {
    setError(errText(caught))
  } finally {
    setBusy(false)
  }
}

async function executeDeleteBatch(ids) {
  let last = { ok: true, status: 200, body: {} }
  for (const id of ids) {
    last = await deleteAsset(id)
    if (!last.ok) return last
  }
  return last
}

function removeIdsFromSet(prev, ids) {
  const next = new Set(prev)
  for (const id of ids) next.delete(id)
  return next
}

function useFeedFilterState() {
  const [filterType, setFilterType] = useState('')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('updated_at')
  const [viewMode, setViewMode] = useState('grid')

  return {
    filterType,
    setFilterType,
    query,
    setQuery,
    sortKey,
    setSortKey,
    viewMode,
    setViewMode,
  }
}

function useFeedSelection(assets) {
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [pendingRemove, setPendingRemove] = useState(null)

  const toggleSelect = useCallback((asset) => {
    setSelectedIds((prev) => toggleAssetIdInSet(prev, asset.id))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleRemoveSingle = useCallback((asset) => {
    setPendingRemove({ ids: [asset.id], names: [asset.name] })
  }, [])

  const handleOpenBatchDelete = useCallback(() => {
    const names = assets.filter((row) => selectedIds.has(row.id)).map((row) => row.name)
    setPendingRemove({ ids: [...selectedIds], names })
  }, [assets, selectedIds])

  return {
    selectedIds,
    setSelectedIds,
    pendingRemove,
    setPendingRemove,
    selectedCount: selectedIds.size,
    selecting: selectedIds.size > 0,
    toggleSelect,
    clearSelection,
    handleRemoveSingle,
    handleOpenBatchDelete,
  }
}

function useFeedPolling(open, refreshState) {
  useEffect(() => {
    if (!open) return undefined
    void refreshState(true)
  }, [open, refreshState])

  useEffect(() => {
    if (!open) return undefined

    const hubEvents = typeof window !== 'undefined' ? window.__omnimuxHubEvents : undefined
    let timer = null
    const startPoll = () => {
      if (!timer) timer = setInterval(() => { void refreshState() }, POLL_MS)
    }
    const stopPoll = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }

    if (!hubEvents?.isHealthy?.()) {
      startPoll()
    }

    const unsub = hubEvents?.subscribe?.('*', (ev) => {
      if (ev.type === 'omnimux:assets:changed') {
        void refreshState(true)
      } else if (ev.type === 'omnimux:connected' || ev.type === 'omnimux:heartbeat') {
        stopPoll()
      } else if (ev.type === 'omnimux:disconnected' || ev.type === 'omnimux:silence') {
        startPoll()
      }
    })

    return () => {
      stopPoll()
      if (typeof unsub === 'function') unsub()
    }
  }, [open, refreshState])
}

function useFreshStateApplier(options) {
  const { setAssets, setDetail, setSelectedIds } = options
  return useCallback((body) => {
    if (body.unchanged) return
    const nextAssets = Array.isArray(body.assets) ? body.assets : []
    setAssets(nextAssets)
    setDetail((curr) => {
      if (!curr) return curr
      const fresh = nextAssets.find((row) => row.id === curr.id)
      return fresh ?? curr
    })
    setSelectedIds((prev) => cleanRemovedSelection(prev, nextAssets))
  }, [setAssets, setDetail, setSelectedIds])
}

function useFeedData(options) {
  const { t, open, assets, setAssets, setDetail, setSelectedIds } = options
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revisions, setRevisions] = useState({ lrev: null, arev: null })
  const revisionsRef = useRef(revisions)

  const applyFreshState = useFreshStateApplier({ setAssets, setDetail, setSelectedIds })

  const refreshState = useCallback((force = false) => {
    return executeStateFetch({ revisionsRef, force, t, setRevisions, applyFreshState, setError })
  }, [applyFreshState, t])

  useFeedPolling(open, refreshState)

  return {
    assets,
    setAssets,
    error,
    setError,
    formError,
    setFormError,
    busy,
    setBusy,
    revisions,
    refreshState,
  }
}

function useCiteCopy() {
  const [copiedId, setCopiedId] = useState('')
  const copyCite = useCallback((asset) => {
    const text = citeOf(asset)
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text)
    }
    setCopiedId(asset.id)
    window.setTimeout(() => { setCopiedId('') }, 1500)
  }, [])
  return { copiedId, copyCite }
}

function usePickHandler(t, setFormError) {
  return useCallback(async (kind) => {
    const result = await pickPath(kind)
    const parsed = parsePickedPathsResult(result, t)
    if (!parsed.ok) {
      setFormError(parsed.error)
      return []
    }
    return parsed.paths
  }, [setFormError, t])
}

function useCreateHandler(options) {
  const { run, setCreating, setDetail, setFilterType } = options
  return useCallback((payload) => {
    return run(() => createAsset(payload), (result) => {
      const asset = result.body?.asset
      setCreating(null)
      if (asset?.type) setFilterType(asset.type)
      if (asset) setDetail(asset)
    })
  }, [run, setCreating, setDetail, setFilterType])
}

function useSaveDetailHandler(options) {
  const { detail, run, setDetail } = options
  return useCallback((patch) => {
    if (!detail) return
    return run(() => updateAsset(detail.id, patch), (result) => {
      setDetail(result.body?.asset ?? { ...detail, ...patch })
    })
  }, [detail, run, setDetail])
}

function useDeleteBatchHandler(options) {
  const { pendingRemove, run, detail, setDetail, setPendingRemove, setSelectedIds } = options
  return useCallback(() => {
    if (!pendingRemove) return
    const ids = pendingRemove.ids
    const after = () => {
      setPendingRemove(null)
      if (detail && ids.includes(detail.id)) setDetail(null)
      setSelectedIds((prev) => removeIdsFromSet(prev, ids))
    }
    return run(() => executeDeleteBatch(ids), after)
  }, [detail, pendingRemove, run, setDetail, setPendingRemove, setSelectedIds])
}

function useFeedMutations(options) {
  const { t, detail, setDetail, setCreating, refreshState, setBusy, setError, setFormError, setSelectedIds, setPendingRemove, pendingRemove, setFilterType } = options

  const run = useCallback((work, after) => {
    return executeMutation({ work, after, refreshState, setBusy, setError, setFormError, t })
  }, [refreshState, setBusy, setError, setFormError, t])

  const handlePick = usePickHandler(t, setFormError)
  const { copiedId, copyCite } = useCiteCopy()
  const handleCreate = useCreateHandler({ run, setCreating, setDetail, setFilterType })
  const handleSaveDetail = useSaveDetailHandler({ detail, run, setDetail })
  const handleConfirmDelete = useDeleteBatchHandler({
    pendingRemove,
    run,
    detail,
    setDetail,
    setPendingRemove,
    setSelectedIds,
  })

  return {
    copiedId,
    run,
    handlePick,
    copyCite,
    handleCreate,
    handleSaveDetail,
    handleConfirmDelete,
  }
}

/**
 * Core assets data feed hook.
 * Manages state, polling, filtering, sorting, selection, and mutation actions.
 * @param {{
 *   t: (key: string) => string,
 *   open: boolean,
 * }} options
 */
export function useAssetsFeed(options) {
  const { t, open } = options
  const [detail, setDetail] = useState(null)
  const [creating, setCreating] = useState(null)
  const [assets, setAssets] = useState([])

  const filters = useFeedFilterState()
  const selection = useFeedSelection(assets)

  const data = useFeedData({
    t,
    open,
    assets,
    setAssets,
    setDetail,
    setSelectedIds: selection.setSelectedIds,
  })

  const mutations = useFeedMutations({
    t,
    detail,
    setDetail,
    setCreating,
    refreshState: data.refreshState,
    setBusy: data.setBusy,
    setError: data.setError,
    setFormError: data.setFormError,
    setSelectedIds: selection.setSelectedIds,
    setPendingRemove: selection.setPendingRemove,
    pendingRemove: selection.pendingRemove,
    setFilterType: filters.setFilterType,
  })

  const visible = useMemo(() => {
    return filterAndSortAssets(assets, filters.filterType, filters.query, filters.sortKey)
  }, [assets, filters.filterType, filters.query, filters.sortKey])

  return {
    ...data,
    ...filters,
    ...selection,
    ...mutations,
    detail,
    setDetail,
    creating,
    setCreating,
    visible,
  }
}
