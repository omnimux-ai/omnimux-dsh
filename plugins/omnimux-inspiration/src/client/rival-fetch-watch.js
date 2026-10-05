/**
 * The bounded first-fetch watch (#3112) — the controlled exception to the
 * tab's「no timers」rule, kept deliberately small and pure.
 *
 * The Host already starts the first fetch the moment an account is imported
 * (`importAccount` → `enqueue(mode:'first')` → synchronous `drain()`); nothing
 * here re-triggers collection. What the client owes the user is the *promise*
 * made in the empty state — `首次采集约需 1 分钟，完成后内容会自动出现在这里。` —
 * and these functions decide three things only:
 *
 *   - whether a poll is worth scheduling at all (an account still sits in
 *     `queued`/`running`), so an idle tab never owns a timer;
 *   - whether the wait ended in a real failure (`error`/`backoff` with no
 *     posts collected), so the empty state can swap the spinner for a reason
 *     and a retry instead of spinning forever;
 *   - how long the watch may live (server-shipped interval × a bounded
 *     budget), so a broken promise cannot keep polling.
 *
 * Everything here reads the E1 account rows the tab already fetches — no new
 * endpoint, no cloud call, no job concept.
 */

/** The promise the dictionary makes: `首次采集约需 1 分钟`. */
export const FIRST_FETCH_PROMISE_MS = 60_000

/**
 * How far past the promise the watch may run. The Host's own cadence
 * (`TICK_INTERVAL_MS`, one minute) already paces queue drains; a little over
 * one promise-window covers「约 1 分钟」plus the first scheduled retry without
 * letting a stuck queue hold the page hostage.
 */
export const FETCH_WATCH_HEADROOM = 1.4

/** The interval the client uses when the server does not ship one. */
export const FALLBACK_POLL_INTERVAL_MS = 2_500

/** Account `refresh_state` values meaning「a fetch is in flight」. */
const ACTIVE_STATES = new Set(['queued', 'running'])

/** Terminal/waiting states that end the watch as a first-fetch failure. */
const FAILED_STATES = new Set(['error', 'backoff'])

/**
 * Accounts whose collection is still in flight.
 * @param {Array<Record<string, any>>} accounts
 * @returns {Array<Record<string, any>>}
 */
export function activeFetchAccounts(accounts) {
  return (Array.isArray(accounts) ? accounts : [])
    .filter((account) => ACTIVE_STATES.has(account?.refresh_state))
}

/**
 * Why the first fetch failed, or null when nothing did.
 *
 * A terminal state only counts as a *first-fetch* failure while the account
 * has collected nothing: an `error` on an account that already holds posts is
 * a scheduled-refresh problem (#3111's pool health), not this ticket's
 *「导入后没有内容」situation, and flagging it would swap a healthy feed's
 * empty state for a misleading failure.
 * @param {Array<Record<string, any>>} accounts
 * @param {number} [now]
 * @returns {{ kind: 'stopped' | 'cooling' | 'failed', account: Record<string, any>, minutes?: number } | null}
 */
export function fetchIssue(accounts, now = Date.now()) {
  for (const account of Array.isArray(accounts) ? accounts : []) {
    if (!FAILED_STATES.has(account?.refresh_state)) continue
    if (Number(account?.post_count) > 0) continue
    if (account.refresh_state === 'error') return { kind: 'stopped', account }
    const until = Date.parse(account.next_auto_refresh_at ?? '')
    if (Number.isFinite(until)) {
      const minutes = Math.max(1, Math.ceil((until - now) / 60_000))
      return { kind: 'cooling', account, minutes }
    }
    return { kind: 'failed', account }
  }
  return null
}

/**
 * The poll interval, consumed from E1's `config_summary.poll_interval_ms`.
 * The server ships it so the client never hardcodes a cadence; a missing or
 * malformed value falls back to the shipped default, not to a guess.
 * @param {Record<string, any>} [data] E1 `body.data`
 * @returns {number}
 */
export function fetchPollIntervalMs(data) {
  const value = Number(data?.config_summary?.poll_interval_ms)
  return Number.isFinite(value) && value > 0 ? value : FALLBACK_POLL_INTERVAL_MS
}

/**
 * How many polls one watch may make before giving up.
 *
 * The budget is「promised window + headroom, at the server's interval」:
 * 60_000 × 1.4 = 84_000ms, so the shipped 2_500ms interval yields 34 polls —
 * close to the hook's existing REQUEST_BUDGET (40) by design, not coincidence.
 * A floor keeps a pathological interval from ending the watch after one tick.
 * @param {number} intervalMs
 * @param {number} [watchBudgetMs] the watch window; tests inject a small one
 * @returns {number}
 */
export function fetchPollBudget(intervalMs, watchBudgetMs = FIRST_FETCH_PROMISE_MS * FETCH_WATCH_HEADROOM) {
  const interval = Number.isFinite(intervalMs) && intervalMs > 0
    ? intervalMs
    : FALLBACK_POLL_INTERVAL_MS
  const windowMs = Number.isFinite(watchBudgetMs) && watchBudgetMs > 0
    ? watchBudgetMs
    : FIRST_FETCH_PROMISE_MS * FETCH_WATCH_HEADROOM
  return Math.max(2, Math.ceil(windowMs / interval))
}
