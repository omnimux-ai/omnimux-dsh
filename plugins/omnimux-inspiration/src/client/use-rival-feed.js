/**
 * State of the 账号监控 feed: monitored accounts, the selection, and the works.
 *
 * The one state source of the tab, mounted by the shell so the filter in the
 * toolbar and the grid in the content area read the same numbers.
 *
 * It is deliberately timer-free: this module has no `setInterval`, no
 *「retry in a moment」state. A request either lands or reports the failure it
 * got; a background refresh that nobody asked for is cost without benefit,
 * and a spinner that outlives its request is worse than an honest error.
 *
 * One controlled exception (Issue #3112): while an E1 account sits in
 * `queued`/`running` — the only「first fetch in flight」signal — the hook
 * re-reads the same two endpoints at the server-shipped
 * `config_summary.poll_interval_ms`. The watch is bounded three ways: it
 * exists only while something is collecting (an idle tab owns zero timers),
 * it gives up after `fetchPollBudget` polls and surfaces a failure instead of
 * spinning, and the timer dies with the hook. The last poll is what re-reads
 * page 1 — content appears because the queue emptied, not because anything
 * was optimistically inserted.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hostMediaSrc } from './api.js'
import {
  fetchRivalAccounts,
  fetchRivalFeed,
  fetchRivalStatus,
  refreshAllRivalAccounts,
  refreshRivalAccount,
  retryRivalAccount,
} from './rival-api.js'
import {
  activeFetchAccounts,
  FALLBACK_POLL_INTERVAL_MS,
  fetchIssue,
  fetchPollBudget,
  fetchPollIntervalMs,
} from './rival-fetch-watch.js'
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
 *   api?: { fetchRivalAccounts?: Function, fetchRivalFeed?: Function, refreshRivalAccount?: Function, fetchRivalStatus?: Function, refreshAllRivalAccounts?: Function, retryRivalAccount?: Function },
 *     test seam: when given, this object is the whole endpoint set — an
 *     endpoint it omits is not called. Production passes nothing.
 * }} [options]
 */
export function useRivalFeed(options = {}) {

  const enabled = options.enabled !== false
  const query = typeof options.query === 'string' ? options.query : ''
  const platform = typeof options.platform === 'string' ? options.platform : ''
  const sort = options.sort === 'views' ? 'views' : 'posted_at'
  const accountsApi = options.api?.fetchRivalAccounts
  const feedApi = options.api?.fetchRivalFeed
  const refreshApi = options.api?.refreshRivalAccount
  const statusApi = options.api?.fetchRivalStatus
  const refreshAllApi = options.api?.refreshAllRivalAccounts
  const retryApi = options.api?.retryRivalAccount
  /**
   * Endpoint resolution.
   *
   * `api` is a test seam and nothing else — the shell mounts this hook bare,
   * so production always takes the real set below. When a caller *does* inject
   * it, that object is the whole endpoint set: an endpoint it leaves out is
   * not called, instead of quietly falling back to the real one. Per-endpoint
   * fallback is what lets a partial injection escape to real egress, and a
   * suite that mixes stubs with live network calls proves nothing — the
   * deny-network harness fails the file precisely to catch that.
   */
  const api = useMemo(() => ({
    fetchRivalAccounts: accountsApi ?? fetchRivalAccounts,
    fetchRivalFeed: feedApi ?? fetchRivalFeed,
    refreshRivalAccount: refreshApi ?? (options.api ? undefined : refreshRivalAccount),
    fetchRivalStatus: statusApi ?? (options.api ? undefined : fetchRivalStatus),
    refreshAllRivalAccounts: refreshAllApi ?? (options.api ? undefined : refreshAllRivalAccounts),
    retryRivalAccount: retryApi ?? (options.api ? undefined : retryRivalAccount),
  }), [
    accountsApi,
    feedApi,
    refreshApi,
    statusApi,
    refreshAllApi,
    retryApi,
    options.api,
  ])
  /**
   * Test-only seams: the watch cadence is the server's `poll_interval_ms`, and
   * the watch window is「promised minute + headroom」. Production never sets
   * these; tests inject millisecond-scale values so the bounded behaviour can
   * be observed in real time.
   */
  const pollIntervalOption = Number.isFinite(options.pollIntervalMs) ? options.pollIntervalMs : null
  const watchBudgetOption = Number.isFinite(options.watchBudgetMs) ? options.watchBudgetMs : null

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
  /**
   * Why the first-fetch wait ended, or null while it is still worth waiting.
   * `stopped`/`cooling`/`failed` come from the Host's terminal states;
   * `timeout` is the watch's own budget ceiling — the「不无限转圈」half of
   * the promise.
   * @type {[null | { kind: 'stopped'|'cooling'|'failed'|'timeout', account?: any, minutes?: number }, Function]}
   */
  const [fetchPhase, setFetchPhase] = useState(null)
  /**
   * The scheduler snapshot (E9): the used side of the daily refresh ledger.
   * `null` until its first answer lands — the quota line waits for the real
   * number rather than inventing one.
   */
  const [status, setStatus] = useState(null)
  const [configSummary, setConfigSummary] = useState(null)
  /**
   * When this client last asked for a manual pool refresh. The Host enforces
   * a 30-minute window on `refresh-all`; mirroring it locally is what lets the
   * 置灰 button name its own reason instead of waiting for a refusal.
   */
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState(0)
  /** Failure of the most recent refresh action, keyed by reason kind. */
  const [refreshFailure, setRefreshFailure] = useState(null)

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
  /** The timer fires `load` — a ref keeps the watch out of its own deps. */
  const loadRef = useRef(null)
  /** The single poll timer and how many polls the current watch has made. */
  const pollTimerRef = useRef(null)
  const pollCountRef = useRef(0)
  const pollIntervalRef = useRef(pollIntervalOption ?? FALLBACK_POLL_INTERVAL_MS)
  const fetchPhaseRef = useRef(null)

  useEffect(() => () => {
    mounted.current = false
    if (pollTimerRef.current != null) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const allIds = useMemo(() => accountIds(accounts), [accounts])
  allIdsRef.current = allIds

  /** Whether a reply still belongs to the request the UI is waiting for. */
  const isCurrent = useCallback((ticket) => mounted.current && ticket === latest.current, [])

  const updateFetchPhase = useCallback((next) => {
    fetchPhaseRef.current = next
    setFetchPhase(next)
  }, [])

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current != null) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
    pollCountRef.current = 0
  }, [])

  /**
   * Decide, from the latest E1 rows, whether the watch lives another round.
   *
   * Called after every successful account read — the initial load, a manual
   * reload and every poll — so the same three outcomes hold regardless of who
   * asked: keep waiting (schedule exactly one more poll), end as a failure
   * (terminal Host state or the budget ceiling), or end as landed (nothing
   * queued/running → the read that follows puts the works on screen).
   * @param {Array<Record<string, any>>} nextAccounts
   * @param {boolean} polled true when this read came from the poll timer
   */
  const watchAccounts = useCallback((nextAccounts, polled) => {
    const active = activeFetchAccounts(nextAccounts)
    const issue = fetchIssue(nextAccounts)
    if (issue && active.length === 0) {
      clearPollTimer()
      updateFetchPhase(issue)
      return
    }
    if (active.length === 0) {
      clearPollTimer()
      updateFetchPhase(null)
      return
    }
    const budget = fetchPollBudget(
      pollIntervalRef.current,
      watchBudgetOption ?? undefined,
    )
    if (pollCountRef.current >= budget) {
      clearPollTimer()
      updateFetchPhase({ kind: 'timeout', account: active[0] })
      return
    }
    updateFetchPhase(null)
    if (polled) pollCountRef.current += 1
    if (pollTimerRef.current != null) clearTimeout(pollTimerRef.current)
    pollTimerRef.current = setTimeout(() => {
      pollTimerRef.current = null
      if (!mounted.current || !enabled) return
      void loadRef.current({ polled: true })
    }, pollIntervalRef.current)
  }, [clearPollTimer, enabled, updateFetchPhase, watchBudgetOption])

  /**
   * Load page 1 under whatever the toolbar currently holds.
   *
   * The account list is fetched first because it is the only source of the
   * account count, the avatars and the ids the feed filters by; running the two
   * in parallel would let the grid answer a selection that does not exist yet.
   */
  const load = useCallback(async (opts = {}) => {
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
      if (pollIntervalOption == null) pollIntervalRef.current = fetchPollIntervalMs(accountData)
      setAccounts(nextAccounts)
      setConfigSummary(accountData.config_summary || null)
      // The status snapshot rides the same reload: a failed snapshot degrades
      // the quota display, it never blocks the feed. An injected endpoint set
      // that omits it simply has no snapshot to show.
      let statusData = null
      if (typeof api.fetchRivalStatus === 'function') {
        try {
          const statusRes = await api.fetchRivalStatus()
          statusData = statusRes?.ok ? (statusRes.body?.data || null) : null
        } catch { statusData = null }
      }
      if (isCurrent(ticket)) setStatus(statusData)
      const nextAllIds = accountIds(nextAccounts)
      allIdsRef.current = nextAllIds
      watchAccounts(nextAccounts, opts.polled === true)

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
  }, [api, enabled, isCurrent, platform, pollIntervalOption, query, sort, watchAccounts])

  loadRef.current = load

  useEffect(() => {
    if (!enabled) {
      clearPollTimer()
      updateFetchPhase(null)
      return
    }
    void load()
    // `load` re-identifies itself when the toolbar inputs change, which is
    // exactly when the first page has to be re-read.
  }, [enabled, load, clearPollTimer, updateFetchPhase])

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
   * 「刷新」：一次性让 Host 把筛选集内的账号都排进刷新队列。
   *
   * 本地镜像的只是「上一次按下去的时刻」——冷却期内的置灰理由由外壳读它；
   * 真正的额度与拒绝理由仍以 Host 的 `skipped`/`budget` 回答为准。
   * @returns {Promise<{ ok: boolean, reason?: 'cooldown' | 'budget' | 'error', n?: number }>}
   */
  const refreshPool = useCallback(async () => {
    if (typeof api.refreshAllRivalAccounts !== 'function') return { ok: false, reason: 'error' }
    try {
      const res = await api.refreshAllRivalAccounts()
      if (!res?.ok) {
        const code = res?.body?.code || res?.body?.error?.code || ''
        if (code === 'refresh-budget-exhausted' || code === 'manual-cooldown' || res?.status === 429) {
          const reason = code === 'manual-cooldown' ? 'cooldown' : 'budget'
          setRefreshFailure({ reason })
          return { ok: false, reason }
        }
        setRefreshFailure({ reason: 'error' })
        return { ok: false, reason: 'error' }
      }
      setLastManualRefreshAt(Date.now())
      setRefreshFailure(null)
      void load()
      return { ok: true }
    } catch {
      setRefreshFailure({ reason: 'error' })
      return { ok: false, reason: 'error' }
    }
  }, [api, load])

  /**
   * 「已停止」行的重试：让 Host 把这个账号重新排进队列。
   *
   * Host 接受后刷新事实马上重读——`refresh_state` 变 `queued`，行回 `normal`，
   * 正是规格 §8.1 要求的即时恢复语义；连续失败计数由 Host 在新一轮刷新成功
   * 后清零。
   * @param {string} accountId
   * @returns {Promise<{ ok: boolean, reason?: 'cooldown' | 'budget' | 'error' }>}
   */
  const retryAccount = useCallback(async (accountId) => {
    if (typeof api.retryRivalAccount !== 'function') return { ok: false, reason: 'error' }
    try {
      const res = await api.retryRivalAccount(accountId)
      if (!res?.ok) {
        const code = res?.body?.code || res?.body?.error?.code || ''
        const reason = code === 'manual-cooldown' ? 'cooldown'
          : (code === 'refresh-budget-exhausted' || res?.status === 429) ? 'budget'
          : 'error'
        setRefreshFailure({ reason })
        return { ok: false, reason }
      }
      setRefreshFailure(null)
      await load()
      return { ok: true }
    } catch {
      setRefreshFailure({ reason: 'error' })
      return { ok: false, reason: 'error' }
    }
  }, [api, load])

  /**
   * Cards for the grid. `cover_src` is derived once on the server and still
   * passed through the plugin's own address whitelist: the grid must never be
   * the one place that trusts a URL it was handed.
   */
  const cards = useMemo(() => items.map((row) => {
    const card = toRivalCardRow(row)
    return { ...card, cover_key: hostMediaSrc(card.cover_key) }
  }), [items])

  /**
   * The failure-exit the ticket promises: re-enqueue accounts the first fetch
   * gave up on and restart the (bounded) watch.
   *
   * `timeout` needs no request — those accounts are still queued/running on
   * the Host, so resuming the watch is the whole retry. `stopped`/`cooling`
   * re-queue via the existing single-account refresh endpoint; that path is
   * the same one the import uses (`enqueue` → one `reserve` → `drain()`), so
   * the cost contract is unchanged — the client asks the Host to retry, it
   * does not collect anything itself.
   */
  const retryFetch = useCallback(async () => {
    if (!enabled) return
    clearPollTimer()
    const failed = (accounts || []).filter((account) => (
      (account?.refresh_state === 'error' || account?.refresh_state === 'backoff')
      && Number(account?.post_count) === 0
    ))
    updateFetchPhase(null)
    if (typeof api.refreshRivalAccount === 'function') {
      for (const account of failed) {
        // eslint-disable-next-line no-await-in-loop
        try { await api.refreshRivalAccount(String(account.id), { manual: false }) } catch { /* the next read reports the truth */ }
      }
    }
    await load()
  }, [accounts, api, clearPollTimer, enabled, load, updateFetchPhase])

  /** True while an E1 row still reports a fetch in flight. */
  const fetching = useMemo(() => activeFetchAccounts(accounts).length > 0, [accounts])

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
    /**
     * First-fetch signal (#3112): `fetching` is live while the Host collects;
     * `fetchPhase` is set only when the wait ended badly — a terminal Host
     * state (`stopped`/`cooling`/`failed`) or the watch's own budget ceiling
     * (`timeout`). Both drive the empty state; `retryFetch` is its exit.
     */
    fetching,
    fetchPhase,
    retryFetch,
    load,
    loadMore,
    reload: load,
    toggleAccount,
    invertAccounts,
    resetAccounts,
    status,
    configSummary,
    lastManualRefreshAt,
    refreshFailure,
    refreshPool,
    retryAccount,
  }
}
