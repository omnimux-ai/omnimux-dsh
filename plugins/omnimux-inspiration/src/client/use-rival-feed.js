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
  refreshRivalAccount,
} from './rival-api.js'
import { accountNeedsReimport, manualCooldownMinutesLeft, rivalErrorKey } from './rival-health.js'
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
  selectedRivalAccounts,
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
  const code = body?.code || body?.error?.code || body?.error
  return rivalErrorKey(res?.status === 401 ? 'needs-omnimux'
    : res?.status === 402 ? 'quota-exceeded' : code)
}

/** A successful HTTP receipt must still explicitly acknowledge a queued/running job. */
function refreshIssue(res) {
  const data = res?.body?.data
  if (res?.ok && (data?.queued === true || data?.status === 'queued' || data?.status === 'running')) return null
  const code = res?.body?.code || res?.body?.error?.code || res?.body?.error
  const reason = code === 'manual-cooldown' || data?.status === 'cooldown' ? 'cooldown'
    : code === 'refresh-budget-exhausted' || data?.status === 'budget' ? 'budget' : 'error'
  return {
    reason,
    key: reason === 'cooldown' ? 'rivalAccounts.skip.cooldown'
      : reason === 'budget' ? 'rivalAccounts.skip.budget' : errorText(res),
  }
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
 *   api?: { fetchRivalAccounts?: Function, fetchRivalFeed?: Function, refreshRivalAccount?: Function, fetchRivalStatus?: Function },
 *     test seam: when given, this object is the whole endpoint set — an
 *     endpoint it omits is not called. Production passes nothing.
 * }} [options]
 */
export function useRivalFeed(options = {}) {

  const enabled = options.enabled !== false
  const query = typeof options.query === 'string' ? options.query : ''
  const platform = typeof options.platform === 'string' ? options.platform : ''
  // UI 选项 → wire 值（规格 R4：四项排序、禁加第 5 项；recommended/latest
  // 在实现层共享 posted_at——「综合推荐」的加权公式不在本票，时间序是它
  // 当前唯一诚实的排法）。
  const sort = options.sort === 'views' ? 'views'
    : options.sort === 'velocity' ? 'velocity'
    : 'posted_at'
  const accountsApi = options.api?.fetchRivalAccounts
  const feedApi = options.api?.fetchRivalFeed
  const refreshApi = options.api?.refreshRivalAccount
  const statusApi = options.api?.fetchRivalStatus
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
  }), [
    accountsApi,
    feedApi,
    refreshApi,
    statusApi,
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
   * The toolbar keeps its 30-minute window for accepted accounts only. A
   * different selection remains refreshable; the Host still enforces every
   * account's own allowance and manual cooldown.
   */
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState(0)
  const [manualRefreshes, setManualRefreshes] = useState({})
  /** Failure of the most recent refresh action, keyed by reason kind. */
  const [refreshFailure, setRefreshFailure] = useState(null)
  const [refreshNotice, setRefreshNotice] = useState(null)
  const [refreshBusy, setRefreshBusy] = useState(false)
  // A ref closes the same-event double-click gap before React commits disabled state.
  const refreshBusyRef = useRef(false)

  /** Number of requests this hook has issued; also the request gate. */
  const issued = useRef(0)
  /** Identifier of the newest request: a stale reply must not overwrite it. */
  const latest = useRef(0)
  // Append generation: a stale page-2 response must not clear the flag of a
  // newer append that started after the page-1 reload (#3434).
  const appendTicket = useRef(0)
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
    const scoped = selectedRivalAccounts(nextAccounts, selectionRef.current, platform)
    const active = activeFetchAccounts(scoped)
    const issue = fetchIssue(scoped)
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
  }, [clearPollTimer, enabled, platform, updateFetchPhase, watchBudgetOption])

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
    // A page-1 reload supersedes any in-flight append: invalidate its
    // generation and clear the flag here, or loadMore stays blocked forever
    // after the user switches accounts mid-append (#3432 review P1).
    appendTicket.current += 1
    setLoadingMore(false)
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
      if (!isCurrent(ticket)) return
      setStatus(statusData)
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
      setError('rivalAccounts.error.failed')
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
    const append = ++appendTicket.current
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
      setError('rivalAccounts.error.failed')
    } finally {
      // Only the current append generation may clear the flag: a stale response
      // resolving after a newer append started must not unlock a second fetch
      // for the same page (#3434).
      if (appendTicket.current === append) setLoadingMore(false)
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
    clearPollTimer()
    updateFetchPhase(null)
    selectionRef.current = next
    setSelection(next)
    setPage(1)
    void load()
  }, [clearPollTimer, load, updateFetchPhase])

  /** Check or uncheck one account; the grid follows immediately. */
  const toggleAccount = useCallback((id) => {
    commitSelection(toggleAccountSelection(selectionRef.current, id, allIdsRef.current))
  }, [commitSelection])

  /** Single-select navigation: one account becomes the whole view. */
  const selectAccount = useCallback((id) => {
    const next = String(id)
    const current = selectionRef.current
    if (current.mode === 'subset' && current.ids.length === 1 && String(current.ids[0]) === next) return
    commitSelection({ mode: 'subset', ids: [next] })
  }, [commitSelection])

  /** Invert the selection (from「全部」this is the empty set). */
  const invertAccounts = useCallback(() => {
    commitSelection(invertAccountSelection(selectionRef.current, allIdsRef.current))
  }, [commitSelection])

  /** Back to the default: every monitored account. */
  const resetAccounts = useCallback(() => {
    commitSelection(resetAccountSelection())
  }, [commitSelection])

  /** One guarded submission path for toolbar refresh, row retry and first-fetch retry. */
  const refreshAccounts = useCallback(async (targets, pool = false) => {
    if (!enabled || refreshBusyRef.current) return { ok: false, reason: 'busy' }
    refreshBusyRef.current = true
    setRefreshBusy(true)
    setRefreshFailure(null)
    setRefreshNotice({ key: 'rivalAccounts.refresh.submitting', n: targets.length, failures: [] })
    const accepted = []
    const failures = []
    try {
      for (const account of targets) {
        let issue = null
        if (accountNeedsReimport(account)) {
          issue = { reason: 'reimport', key: 'rivalAccounts.health.reimportReason' }
        } else if (typeof api.refreshRivalAccount !== 'function') {
          issue = { reason: 'error', key: 'rivalAccounts.error.toolMissing' }
        } else {
          try {
            // Explicit retries use the Host's manual path, preserving its budget and cooldown checks.
            const res = await api.refreshRivalAccount(String(account.id), { manual: true })
            issue = refreshIssue(res)
          } catch {
            issue = { reason: 'error', key: 'rivalAccounts.error.failed' }
          }
        }
        if (issue) failures.push({ ...issue, account })
        else accepted.push(String(account.id))
      }
      if (pool && accepted.length > 0) {
        const at = Date.now()
        setLastManualRefreshAt(at)
        setManualRefreshes((previous) => ({ ...previous, ...Object.fromEntries(accepted.map((id) => [id, at])) }))
      }
      const failure = failures[0] || null
      setRefreshFailure(failure)
      setRefreshNotice({
        key: accepted.length > 0 ? 'rivalAccounts.refresh.queued'
          : failure?.key || 'rivalAccounts.refresh.emptySelection',
        n: accepted.length,
        failures,
      })
      clearPollTimer()
      updateFetchPhase(null)
      await loadRef.current()
      return { ok: accepted.length > 0, reason: failure?.reason, n: accepted.length }
    } finally {
      refreshBusyRef.current = false
      if (mounted.current) setRefreshBusy(false)
    }
  }, [api, clearPollTimer, enabled, updateFetchPhase])

  const scopedAccounts = useMemo(
    () => selectedRivalAccounts(accounts, selection, platform),
    [accounts, platform, selection],
  )
  const refreshPool = useCallback(
    () => refreshAccounts(selectedRivalAccounts(accounts, selectionRef.current, platform), true),
    [accounts, platform, refreshAccounts],
  )
  // The row itself names the explicit account range; it never retries neighboring accounts.
  const retryAccount = useCallback((accountId) => refreshAccounts(
    accounts.filter((account) => String(account.id) === String(accountId)),
  ), [accounts, refreshAccounts])

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
    const failed = selectedRivalAccounts(accounts, selectionRef.current, platform).filter((account) => (
      (account?.refresh_state === 'error' || account?.refresh_state === 'backoff')
      && Number(account?.post_count) === 0
    ))
    if (failed.length > 0) return refreshAccounts(failed)
    if (!refreshBusyRef.current) {
      clearPollTimer()
      updateFetchPhase(null)
      await load()
    }
  }, [accounts, clearPollTimer, enabled, load, platform, refreshAccounts, updateFetchPhase])

  /** True while an E1 row still reports a fetch in flight. */
  const fetching = useMemo(() => activeFetchAccounts(scopedAccounts).length > 0, [scopedAccounts])
  const visibleFetchPhase = !fetchPhase?.account
    || scopedAccounts.some((account) => String(account.id) === String(fetchPhase.account.id)) ? fetchPhase : null
  const cooldowns = scopedAccounts.filter((account) => !accountNeedsReimport(account))
    .map((account) => manualCooldownMinutesLeft(manualRefreshes[account.id]))
  const manualCooldownLeft = cooldowns.length > 0 && cooldowns.every((value) => value !== null)
    ? Math.min(...cooldowns) : null

  return {
    phase,
    error,
    loading,
    loadingMore,
    accounts,
    scopedAccounts,
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
    fetchPhase: visibleFetchPhase,
    retryFetch,
    load,
    loadMore,
    reload: load,
    toggleAccount,
    selectAccount,
    invertAccounts,
    resetAccounts,
    status,
    configSummary,
    lastManualRefreshAt,
    manualCooldownLeft,
    refreshFailure,
    refreshNotice,
    refreshBusy,
    refreshPool,
    retryAccount,
  }
}
