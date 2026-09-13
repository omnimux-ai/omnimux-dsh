/**
 * State of the 账号监控 feed: monitored accounts, the selection, and the works.
 *
 * The one state source of the tab, mounted by the shell so the filter in the
 * toolbar and the grid in the content area read the same numbers.
 *
 * It is deliberately timer-free: this module has no `setInterval`, no polling,
 * and no「retry in a moment」state. A request either lands or reports the failure
 * it got; a background refresh that nobody asked for is cost without benefit,
 * and a spinner that outlives its request is worse than an honest error.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hostMediaSrc } from './api.js'
import { fetchRivalAccounts, fetchRivalFeed } from './rival-api.js'
import {
  ALL_ACCOUNTS,
  accountIds,
  invertAccountSelection,
  resetAccountSelection,
  selectionQuery,
  toRivalCardRow,
  toggleAccountSelection,
} from './rival-filter.js'

/** Requests one feed page may make before the hook is considered looping. */
const REQUEST_BUDGET = 40

/**
 * @param {unknown} res
 * @returns {string}
 */
function errorText(res) {
  const body = res?.body
  if (body && typeof body.error === 'string' && body.error.trim()) return body.error.trim()
  return 'error.generic'
}

/**
 * How many accounts a selection excludes.
 * @param {{ mode?: string, ids?: string[] | Set<string> }} state
 * @returns {number}
 */
function selectionSize(state) {
  if (state?.mode !== 'subset') return 0
  return state.ids instanceof Set ? state.ids.size : (state.ids || []).length
}

/**
 * @param {{
 *   enabled?: boolean,
 *   query?: string,
 *   platform?: string,
 *   sort?: string,
 *   api?: { fetchRivalAccounts?: Function, fetchRivalFeed?: Function },
 * }} [options]
 */
export function useRivalFeed(options = {}) {

  const enabled = options.enabled !== false
  const query = typeof options.query === 'string' ? options.query : ''
  const platform = typeof options.platform === 'string' ? options.platform : ''
  const sort = options.sort === 'views' ? 'views' : 'posted_at'
  const accountsApi = options.api?.fetchRivalAccounts
  const feedApi = options.api?.fetchRivalFeed
  const api = useMemo(() => ({
    fetchRivalAccounts: accountsApi ?? fetchRivalAccounts,
    fetchRivalFeed: feedApi ?? fetchRivalFeed,
  }), [accountsApi, feedApi])

  const [accounts, setAccounts] = useState([])
  const [selection, setSelection] = useState(ALL_ACCOUNTS)
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  /** Number of requests this hook has issued; also the request gate. */
  const issued = useRef(0)
  /** Identifier of the newest request: a stale reply must not overwrite it. */
  const latest = useRef(0)
  const mounted = useRef(true)
  /**
   * The selection as the request path needs it.
   *
   * Kept beside the state rather than in the callback's dependency list: a
   * selection change already triggers its own reload, and having it here as well
   * would fire a second, duplicate request for the same click.
   */
  const selectionRef = useRef(selection)
  const allIdsRef = useRef([])

  useEffect(() => () => {
    mounted.current = false
  }, [])

  const allIds = useMemo(() => accountIds(accounts), [accounts])
  allIdsRef.current = allIds

  /** Whether a reply still belongs to the request the UI is waiting for. */
  const isCurrent = useCallback((ticket) => mounted.current && ticket === latest.current, [])

  /**
   * Load page 1 under whatever the toolbar currently holds.
   *
   * The account list is fetched first because it is the only source of the
   * account count, the avatars and the ids the feed filters by; running the two
   * in parallel would let the grid answer a selection that does not exist yet.
   */
  const load = useCallback(async () => {
    if (!enabled) return
    if (issued.current >= REQUEST_BUDGET) {
      setError('error.generic')
      return
    }
    issued.current += 1
    latest.current += 1
    const ticket = latest.current
    setLoading(true)
    setError(null)
    try {
      const accountRes = await api.fetchRivalAccounts({})
      if (!isCurrent(ticket)) return
      if (!accountRes?.ok) {
        setPhase('ready')
        setError(errorText(accountRes))
        return
      }
      const accountData = accountRes.body?.data || {}
      const nextAccounts = Array.isArray(accountData.items) ? accountData.items : []
      setAccounts(nextAccounts)
      const nextAllIds = accountIds(nextAccounts)
      allIdsRef.current = nextAllIds

      // An empty selection means「exclude everything」, and the wire has no way to
      // say that: an omitted `accounts` parameter means *every* account. So the
      // request is not made at all — the honest answer to "which works of no
      // accounts" is an empty grid, not the whole feed.
      if (selectionRef.current.mode === 'subset'
        && selectionQuery(selectionRef.current, nextAllIds) === '') {
        setItems([])
        setTotal(0)
        setPage(1)
        setHasMore(false)
        setPhase('ready')
        return
      }

      const feedRes = await api.fetchRivalFeed({
        accounts: selectionQuery(selectionRef.current, nextAllIds),
        q: query || undefined,
        platform: platform || undefined,
        sort,
        page: 1,
      })
      if (!isCurrent(ticket)) return
      if (!feedRes?.ok) {
        setPhase('ready')
        setError(errorText(feedRes))
        return
      }
      const feedData = feedRes.body?.data || {}
      setItems(Array.isArray(feedData.items) ? feedData.items : [])
      setTotal(Number(feedData.total) || 0)
      setPage(Number(feedData.page) || 1)
      setHasMore(Boolean(feedData.has_more))
      setPhase('ready')
    } catch (err) {
      if (!isCurrent(ticket)) return
      setPhase('ready')
      setError(String(err?.message || err))
    } finally {
      if (isCurrent(ticket)) setLoading(false)
    }
  }, [api, enabled, isCurrent, platform, query, sort])

  useEffect(() => {
    if (!enabled) return
    void load()
    // `load` re-identifies itself when the toolbar inputs change, which is
    // exactly when the first page has to be re-read.
  }, [enabled, load])

  /** Append the next page; used by the grid's bottom sentinel. */
  const loadMore = useCallback(async () => {
    if (!enabled || loading || loadingMore || !hasMore) return
    if (issued.current >= REQUEST_BUDGET) return
    issued.current += 1
    latest.current += 1
    const ticket = latest.current
    const nextPage = page + 1
    setLoadingMore(true)
    try {
      const res = await api.fetchRivalFeed({
        accounts: selectionQuery(selectionRef.current, allIdsRef.current),
        q: query || undefined,
        platform: platform || undefined,
        sort,
        page: nextPage,
      })
      if (!isCurrent(ticket)) return
      if (!res?.ok) {
        setError(errorText(res))
        return
      }
      const data = res.body?.data || {}
      setItems((previous) => [...previous, ...(Array.isArray(data.items) ? data.items : [])])
      setTotal(Number(data.total) || 0)
      setPage(Number(data.page) || nextPage)
      setHasMore(Boolean(data.has_more))
    } catch (err) {
      if (!isCurrent(ticket)) return
      setError(String(err?.message || err))
    } finally {
      if (isCurrent(ticket)) setLoadingMore(false)
    }
  }, [api, enabled, hasMore, isCurrent, loading, loadingMore, page, platform, query, sort])

  /**
   * Re-read page 1 after the selection changed.
   *
   * The next selection is written to the ref *before* the state update, so the
   * request that follows carries the click the user just made rather than the
   * one before it.
   * @param {{ mode: 'all' | 'subset', ids: string[] }} next
   */
  const commitSelection = useCallback((next) => {
    selectionRef.current = next
    setSelection(next)
    setPage(1)
    void load()
  }, [load])

  /** Check or uncheck one account; the grid follows immediately. */
  const toggleAccount = useCallback((id) => {
    commitSelection(toggleAccountSelection(selectionRef.current, id, allIdsRef.current))
  }, [commitSelection])

  /** Invert the selection (from「全部」this is the empty set). */
  const invertAccounts = useCallback(() => {
    commitSelection(invertAccountSelection(selectionRef.current, allIdsRef.current))
  }, [commitSelection])

  /** Back to the default: every monitored account. */
  const resetAccounts = useCallback(() => {
    commitSelection(resetAccountSelection())
  }, [commitSelection])

  /**
   * Cards for the grid. `cover_src` is derived once on the server and still
   * passed through the plugin's own address whitelist: the grid must never be
   * the one place that trusts a URL it was handed.
   */
  const cards = useMemo(() => items.map((row) => {
    const card = toRivalCardRow(row)
    return { ...card, cover_key: hostMediaSrc(card.cover_key) }
  }), [items])

  return {
    phase,
    error,
    loading,
    loadingMore,
    accounts,
    allIds,
    selection,
    items,
    cards,
    total,
    page,
    hasMore,
    /** True while the first page has not produced a row yet (first-paint skeleton). */
    firstLoad: loading && items.length === 0,
    /** True when the selection excludes everything — an empty grid by request. */
    emptySelection: selection.mode === 'subset' && selectionSize(selection) === 0,
    load,
    loadMore,
    reload: load,
    toggleAccount,
    invertAccounts,
    resetAccounts,
  }
}
