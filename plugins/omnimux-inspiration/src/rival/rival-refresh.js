/**
 * Refresh scheduler: serial queue, backoff, pause and manual cooldown.
 *
 * Policy lives here; the actual refresh body is injected as `runCycle`, so this
 * file has no cloud access at all (G10 asserts that statically). The state
 * machine it drives:
 *
 * - `idle → queued → running → idle` on success (failures reset, next due = now
 *   + interval).
 * - `running → backoff` while `consecutive_failures < len(backoff)`, then
 *   `backoff → queued` when the window elapses.
 * - `running → error` once the backoff sequence is exhausted, or immediately
 *   when the cloud refuses the account identity. `error` is terminal: the tick
 *   stops scheduling that account until the user refreshes it by hand.
 * - any state `→ paused` when the budget ledger refuses; `paused` is reported in
 *   the status snapshot so the UI can keep showing "why", never failing silently.
 *
 * One account's failure cannot touch another's row: each job re-reads its own
 * account, and a thrown job only writes to that account.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  BACKOFF_MINUTES,
  BUDGET_REASONS,
  IDENTITY_KINDS,
  LIMIT_CALLS_PER_ACCOUNT_CYCLE,
  MANUAL_COOLDOWN_MINUTES,
  REFRESH_STALE_AFTER_MS,
  RIVAL_ERROR_CODES,
  RIVAL_LOCALE_KEYS,
  TICK_INTERVAL_MS,
} from './constants.js'

/**
 * @typedef {Object} EnqueueResult
 * @property {boolean} queued
 * @property {'queued' | 'running' | 'cooldown' | 'budget' | 'not-found' | 'skipped'} status
 * @property {string} [reason_key]
 * @property {string} account_id
 */

/**
 * @param {{ store: any, remote: any, runCycle?: Function, now?: () => number, tickIntervalMs?: number, cooldownMinutes?: { single: number, all: number }, onError?: (err: unknown) => void }} deps
 */
export function createRivalRefreshScheduler(deps) {
  const store = deps.store
  const remote = deps.remote
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now()
  const tickIntervalMs = typeof deps.tickIntervalMs === 'number' ? deps.tickIntervalMs : TICK_INTERVAL_MS
  const cooldownMinutes = deps.cooldownMinutes ?? {
    single: MANUAL_COOLDOWN_MINUTES.single,
    all: MANUAL_COOLDOWN_MINUTES.all,
  }
  const onError = typeof deps.onError === 'function' ? deps.onError : () => {}
  const runCycle = typeof deps.runCycle === 'function' ? deps.runCycle : null

  /** @type {string[]} */
  const queue = []
  /** @type {Set<string>} */
  const queued = new Set()
  /** @type {Map<string, string>} */
  const running = new Map()
  /** @type {Set<string>} */
  const inFlight = new Set()
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null
  let draining = false
  let jobActive = false
  /**
   * Tail of the work this scheduler has started. `settled()` waits on this plus
   * the queue flag, which is what makes it a statement about *this* scheduler's
   * work rather than a snapshot that can be read between two of its awaits.
   * @type {Promise<unknown>}
   */
  let jobTail = Promise.resolve()
  /** @type {Map<string, number>} */
  const lastManualAt = new Map()
  let lastManualAllAt = 0
  let cooldownLoaded = false

  /** @param {string} file */
  function readJson(file) {
    if (!existsSync(file)) return {}
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  function loadCooldowns() {
    if (cooldownLoaded) return
    cooldownLoaded = true
    const raw = readJson(store.paths.cooldownFile)
    if (raw && typeof raw.per_account === 'object' && raw.per_account) {
      for (const [id, at] of Object.entries(raw.per_account)) {
        if (typeof at === 'number' && Number.isFinite(at)) lastManualAt.set(id, at)
      }
    }
    if (typeof raw.last_manual_all_at === 'number' && Number.isFinite(raw.last_manual_all_at)) {
      lastManualAllAt = raw.last_manual_all_at
    }
  }

  function persistCooldowns() {
    try {
      const dir = store.paths.dir
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const temp = `${store.paths.cooldownFile}.${randomUUID()}.tmp`
      const perAccount = {}
      for (const [id, at] of lastManualAt.entries()) perAccount[id] = at
      writeFileSync(temp, JSON.stringify({ version: 1, per_account: perAccount, last_manual_all_at: lastManualAllAt }, null, 2), 'utf8')
      renameSync(temp, store.paths.cooldownFile)
    } catch (err) {
      // A cooldown that could not be persisted only means the limit is enforced
      // for this process lifetime; it must not fail the refresh the user asked for.
      onError(err)
    }
  }

  /**
   * @param {string} accountId
   * @param {'first' | 'auto' | 'manual'} mode
   * @param {number} [scope] 1 for "refresh all", for the wider cooldown window
   * @returns {{ allowed: boolean, reason_key?: string, retry_in_ms?: number }}
   */
  function checkManualCooldown(accountId, mode, scope = 0) {
    // Only a manual refresh is rate limited: the automatic tick is already
    // bounded by `next_auto_refresh_at` and the daily ledger.
    if (mode !== 'manual') return { allowed: true }
    loadCooldowns()
    const at = now()
    if (scope === 1) {
      const waitMs = cooldownMinutes.all * 60_000
      if (lastManualAllAt && at - lastManualAllAt < waitMs) {
        return { allowed: false, reason_key: RIVAL_LOCALE_KEYS.SKIP_COOLDOWN, retry_in_ms: waitMs - (at - lastManualAllAt) }
      }
    }
    const last = lastManualAt.get(accountId) || 0
    const waitMs = cooldownMinutes.single * 60_000
    if (last && at - last < waitMs) {
      return { allowed: false, reason_key: RIVAL_LOCALE_KEYS.SKIP_COOLDOWN, retry_in_ms: waitMs - (at - last) }
    }
    return { allowed: true }
  }

  /**
   * @param {string} accountId
   * @param {'first' | 'auto' | 'manual'} mode
   */
  function markManual(accountId, mode) {
    if (mode !== 'manual') return
    loadCooldowns()
    lastManualAt.set(accountId, now())
    persistCooldowns()
  }

  /**
   * Park an account whose daily allowance is gone.
   *
   * `paused`, not `idle`: the allowance will not come back before the ledger
   * rolls over, and writing `idle` here would let the tick queue the account
   * again on the next round, spending the rest of the day refusing it. The
   * reason is kept in `error_code` and in the status snapshot, so the UI can
   * keep explaining the situation instead of failing silently.
   * @param {string} accountId
   * @param {string} reason
   */
  function parkForBudget(accountId, reason) {
    pausedAccounts.set(accountId, reason)
    store.updateAccount(accountId, {
      refresh_state: 'paused',
      error_code: reason,
      error_message: null,
    })
  }

  /**
   * Claim a job. The claim is immediate and synchronous, which is what makes two
   * clicks on the same account produce one job rather than two.
   *
   * The order is: run-state → existence → budget → rate limit.
   *
   * The budget is evaluated before the rate limit on purpose. A spent daily
   * allowance will not come back for hours, while the cooldown window is minutes:
   * reporting "you asked too soon" for an account that cannot refresh at all
   * today would leave it reading `idle` — the silent failure this module must
   * not produce. The probe is non-mutating (`canReserve`), so nothing is
   * charged for an answer that does not start a job.
   * @param {{ account_id: string, mode?: 'first' | 'auto' | 'manual', scope?: number }} request
   * @returns {EnqueueResult}
   */
  function enqueue(request) {
    const accountId = String(request?.account_id || '')
    if (!accountId) return { queued: false, status: 'not-found', account_id: accountId }
    if (inFlight.has(accountId)) return { queued: false, status: 'running', account_id: accountId }
    if (queued.has(accountId)) return { queued: true, status: 'queued', account_id: accountId }
    const mode = request.mode || 'auto'
    const account = store.getAccount(accountId)
    if (!account) return { queued: false, status: 'not-found', account_id: accountId }
    const budgetProbe = store.canReserve({ accountId })
    if (!budgetProbe.allowed) {
      const reason = budgetProbe.reason || BUDGET_REASONS.GLOBAL_DAILY_CAP
      parkForBudget(accountId, reason)
      return { queued: false, status: 'budget', reason_key: RIVAL_LOCALE_KEYS.SKIP_BUDGET, account_id: accountId }
    }
    const cooldown = checkManualCooldown(accountId, mode, request.scope)
    if (!cooldown.allowed) {
      return { queued: false, status: 'cooldown', reason_key: cooldown.reason_key, account_id: accountId }
    }
    const decision = store.reserve({ accountId, scope: 'cycle' })
    if (!decision.allowed) {
      const reason = decision.reason || BUDGET_REASONS.GLOBAL_DAILY_CAP
      parkForBudget(accountId, reason)
      return { queued: false, status: 'budget', reason_key: RIVAL_LOCALE_KEYS.SKIP_BUDGET, account_id: accountId }
    }
    queued.add(accountId)
    queue.push(accountId)
    store.updateAccount(accountId, { refresh_state: 'queued' })
    markManual(accountId, mode)
    drain()
    return { queued: true, status: 'queued', account_id: accountId }
  }

  /**
   * Enqueue every account the caller names, skipping the ones the rules refuse.
   * Used by both "refresh all" and the automatic tick.
   * @param {{ mode: 'auto' | 'manual', accountIds?: string[], scope?: number }} request
   * @returns {{ queued: string[], skipped: Array<{ id: string, reason_key: string }> }}
   */
  function enqueueMany(request) {
    const mode = request.mode || 'auto'
    const scope = request.scope ?? 0
    const accounts = store.listAccounts()
    const targets = Array.isArray(request.accountIds) && request.accountIds.length > 0
      ? accounts.filter((account) => request.accountIds.includes(account.id))
      : accounts
    const queuedIds = []
    /** @type {Array<{ id: string, reason_key: string }>} */
    const skipped = []
    for (const account of targets) {
      if (account.refresh_state === 'error') {
        skipped.push({ id: account.id, reason_key: RIVAL_LOCALE_KEYS.SKIP_ACCOUNT_ERROR })
        continue
      }
      const result = enqueue({ account_id: account.id, mode, scope })
      if (result.queued) queuedIds.push(account.id)
      else if (result.status === 'cooldown' && result.reason_key) skipped.push({ id: account.id, reason_key: result.reason_key })
      else if (result.status === 'budget' && result.reason_key) skipped.push({ id: account.id, reason_key: result.reason_key })
    }
    return { queued: queuedIds, skipped }
  }

  /**
   * Run jobs one at a time. `draining` makes the loop re-entrant-safe: an enqueue
   * that happens while a job is awaiting simply adds to the queue the running
   * loop will pick up.
   */
  async function drain() {
    if (draining) return
    draining = true
    try {
      while (queue.length > 0) {
        const accountId = /** @type {string} */ (queue.shift())
        queued.delete(accountId)
        if (inFlight.has(accountId)) continue
        inFlight.add(accountId)
        running.set(accountId, new Date(now()).toISOString())
        try {
          // The budget was claimed at enqueue time: one claim, one job. A job
          // re-reserving here would double-charge the ledger for a single cycle.
          const account = store.getAccount(accountId)
          if (!account) continue
          await runJob(accountId)
        } catch (err) {
          onError(err)
        } finally {
          inFlight.delete(accountId)
          running.delete(accountId)
        }
      }
    } finally {
      draining = false
    }
  }

  /** @type {Map<string, string>} */
  const pausedAccounts = new Map()

  /**
   * Execute one account's refresh. Every state change writes through the store,
   * so a process restart resumes from the persisted state rather than from a
   * stale in-memory view.
   * @param {string} accountId
   */
  async function runJob(accountId) {
    const account = store.getAccount(accountId)
    if (!account) return
    store.updateAccount(accountId, { refresh_state: 'running' })
    // Chain the job onto the tail so `settled()` can await the real completion
    // instead of polling flags that a single tick can miss.
    const tracked = jobTail.then(() => executeJob(accountId, account))
    jobTail = tracked.then(() => undefined, () => undefined)
    return tracked
  }

  /**
   * @param {string} accountId
   * @param {Record<string, any>} account
   */
  async function executeJob(accountId, account) {
    let outcome
    jobActive = true
    try {
      outcome = await runCycle({ account, cycle: {} })
    } catch (err) {
      outcome = {
        ok: false,
        code: typeof err === 'object' && err !== null && typeof (/** @type {any} */ (err).code) === 'string'
          ? /** @type {any} */ (err).code
          : RIVAL_ERROR_CODES.CLOUD_ERROR,
        message: err instanceof Error ? err.message : String(err),
        error: err,
        calls_used: typeof err === 'object' && err !== null && typeof (/** @type {any} */ (err).calls_used) === 'number'
          ? /** @type {any} */ (err).calls_used
          : 0,
      }
    }
    try {
      if (outcome && outcome.ok) {
        onSuccess(accountId, account, outcome)
        return
      }
      onFailure(accountId, account, outcome || {})
    } finally {
      jobActive = false
    }
  }

  /**
   * @param {string} accountId
   * @param {Record<string, any>} account
   * @param {Record<string, any>} outcome
   */
  function onSuccess(accountId, account, outcome) {
    const intervalHours = account.refresh_interval_hours
    const nextAt = intervalHours > 0
      ? new Date(now() + intervalHours * 3_600_000).toISOString()
      : null
    store.updateAccount(accountId, {
      refresh_state: 'idle',
      consecutive_failures: 0,
      error_code: null,
      error_message: null,
      refresh_count: (account.refresh_count || 0) + 1,
      last_refresh_at: new Date(now()).toISOString(),
      last_success_at: new Date(now()).toISOString(),
      next_auto_refresh_at: nextAt,
      ...(outcome.accountPatch || {}),
    })
  }

  /**
   * @param {string} accountId
   * @param {Record<string, any>} account
   * @param {Record<string, any>} outcome
   */
  function onFailure(accountId, account, outcome) {
    const code = outcome.code || RIVAL_ERROR_CODES.CLOUD_ERROR
    const failures = (account.consecutive_failures || 0) + 1
    const identityUnverified = code === RIVAL_ERROR_CODES.IDENTITY_UNVERIFIED
    const exhausted = failures > BACKOFF_MINUTES.length
    if (identityUnverified || exhausted) {
      store.updateAccount(accountId, {
        refresh_state: 'error',
        consecutive_failures: failures,
        error_code: identityUnverified ? RIVAL_ERROR_CODES.IDENTITY_UNVERIFIED : code,
        error_message: outcome.message || null,
        last_refresh_at: new Date(now()).toISOString(),
        // A terminal state stops the automatic refresh; the persisted null makes
        // that visible in the account list instead of an overdue timestamp.
        next_auto_refresh_at: null,
      })
      return
    }
    const backoffMinutes = BACKOFF_MINUTES[Math.min(failures, BACKOFF_MINUTES.length) - 1]
    store.updateAccount(accountId, {
      refresh_state: 'backoff',
      consecutive_failures: failures,
      error_code: code,
      error_message: outcome.message || null,
      last_refresh_at: new Date(now()).toISOString(),
      next_auto_refresh_at: new Date(now() + backoffMinutes * 60_000).toISOString(),
    })
  }

  /**
   * One scheduler tick: queue every account whose `next_auto_refresh_at` has
   * passed, subject to the budget and to the terminal states.
   * @param {number} [atMs]
   * @returns {{ due: string[], queued: string[], skipped: Array<{ id: string, reason_key: string }> }}
   */
  function tick(atMs) {
    const at = typeof atMs === 'number' ? atMs : now()
    const accounts = store.listAccounts()
    /** @type {string[]} */
    const due = []
    for (const account of accounts) {
      // `error` and `paused` are terminal for the automatic tick: the first waits
      // for the user to fix the identity, the second for the daily ledger to roll
      // over. Queuing them again would produce a refresh that cannot succeed.
      if (account.refresh_state === 'error' || account.refresh_state === 'paused') continue
      if (queued.has(account.id) || inFlight.has(account.id)) continue
      if (!store.isRefreshDue(account, at)) continue
      due.push(account.id)
    }
    const result = due.length > 0 ? enqueueMany({ mode: 'auto', accountIds: due }) : { queued: [], skipped: [] }
    return { due, queued: result.queued, skipped: result.skipped }
  }

  function start() {
    if (timer) return
    timer = setInterval(() => {
      try {
        tick()
      } catch (err) {
        onError(err)
      }
    }, tickIntervalMs)
    if (typeof timer.unref === 'function') timer.unref()
  }

  function stop() {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  /**
   * Status snapshot for `GET /rival-accounts/status`.
   * @returns {{
   *   running: Array<{ id: string, since: string }>,
   *   queued: string[],
   *   paused: { global: boolean, reason: string | null, paused_at: string | null },
   *   budget_used: { global_calls: number, per_account: Record<string, number> },
   *   budget_limits: Record<string, number>,
   *   next_auto_at: string | null,
   *   per_account_paused: Array<{ id: string, reason: string }>,
   * }}
   */
  function snapshot() {
    const budget = store.readBudget()
    const limits = store.readConfig().limits
    const accounts = store.listAccounts()
    const nextTimes = accounts
      .map((account) => Date.parse(String(account.next_auto_refresh_at || '')))
      .filter((value) => !Number.isNaN(value))
    const perAccount = {}
    for (const [id, entry] of Object.entries(budget.per_account || {})) {
      perAccount[id] = typeof entry === 'object' && entry ? Number(entry.calls) || 0 : 0
    }
    return {
      running: [...running.entries()].map(([id, since]) => ({ id, since })),
      queued: [...queue],
      paused: { ...budget.paused },
      budget_used: { global_calls: budget.global_calls, per_account: perAccount },
      budget_limits: { ...limits },
      next_auto_at: nextTimes.length > 0 ? new Date(Math.min(...nextTimes)).toISOString() : null,
      per_account_paused: [...pausedAccounts.entries()].map(([id, reason]) => ({ id, reason })),
    }
  }

  /**
   * Whether a job appears stuck. Used by the HTTP layer to report honest state
   * instead of a card that spins forever.
   * @param {string} accountId
   * @returns {boolean}
   */
  function isStale(accountId) {
    const since = running.get(accountId)
    if (!since) return false
    return now() - Date.parse(since) > REFRESH_STALE_AFTER_MS
  }

  return {
    enqueue,
    enqueueMany,
    /** Queue a manual refresh; refuses inside the cooldown window. */
    refreshAccount(accountId, opts = {}) {
      return enqueue({ account_id: accountId, mode: opts.manual === false ? 'auto' : 'manual' })
    },
    refreshAll(opts = {}) {
      return enqueueMany({
        mode: opts.manual === false ? 'auto' : 'manual',
        scope: 1,
        ...(opts.accountIds ? { accountIds: opts.accountIds } : {}),
      })
    },
    tick,
    start,
    stop,
    snapshot,
    isStale,
    /**
     * Resolve once no work is pending: the queue is empty, the drain loop has
     * finished, and no job is mid-flight.
     *
     * `draining` alone is not enough — it is recomputed around each job, so a
     * caller polling only that flag can observe "settled" while its refresh is
     * still awaiting a file write. Each round yields through the macrotask queue
     * (`setTimeout 0`), which is what lets the drain loop and the awaited job
     * both make progress instead of the poller spinning on microtasks and
     * finishing first.
     */
    async settled() {
      let guard = 0
      while ((queue.length > 0 || draining || jobActive || inFlight.size > 0) && guard < 20_000) {
        guard += 1
        await new Promise((resolve) => { setTimeout(resolve, 0) })
      }
      // The flags above say "nothing is queued or marked running"; the tail says
      // "and the work that was started really finished". Both are needed: the
      // flags alone can be read in the gap between two awaits of a live job.
      await jobTail
    },
  }
}

/** Identity kinds a first refresh may promote. */
export const PROMOTABLE_IDENTITY_KINDS = IDENTITY_KINDS
