import {
  IMPORT_POLL_INTERVAL_MS,
  IMPORT_STATUS_FAILED,
  IMPORT_STATUS_IMPORTING,
  importStatusOf,
  isImportingRow,
} from './import-status.js'

/**
 * Completion poll for background imports.
 *
 * A background import answers 202 with a placeholder row and finishes on the
 * server; nothing pushes the result back to the page, so the page asks about each
 * row it is waiting for until the row settles. One row per request — the list
 * endpoint cannot say "which of these changed since you last asked".
 *
 * Deliberate properties:
 * - Recursive `setTimeout`, never `setInterval`: a slow response must not queue
 *   overlapping ticks.
 * - No client-side deadline. The server's stale sweep is the single authority on
 *   "this import is dead"; timing out here would abandon an analysis that is
 *   legitimately long-running.
 * - Polling pauses while the tab is hidden and resumes immediately on return,
 *   because a hidden page polling for minutes is pure waste.
 *
 * Every dependency is injected, so the state machine is exercised directly by
 * tests with a fake clock rather than through a real browser.
 *
 * @typedef {'pending' | 'settled' | 'failed' | 'gone' | 'keep'} PollAction
 */

/**
 * What a single poll answer means for the row it was asked about.
 *
 * `keep` is the answer to a request that did not produce a verdict — a network
 * blip, a 500, malformed JSON. The row keeps its current state and stays in the
 * poll set: dropping it there would be the wrong call, since the import is
 * probably still running.
 * @param {{ ok?: boolean, status?: number, body?: any } | null | undefined} response
 * @param {unknown} current current known row, used when the response carries none
 * @returns {{ action: PollAction, item?: Record<string, any> }}
 */
export function decidePollOutcome(response, current) {
  if (!response || typeof response !== 'object') return { action: 'keep' }
  if (response.status === 404) return { action: 'gone' }
  if (!response.ok) return { action: 'keep' }
  const item = response.body?.data
  if (!item || typeof item !== 'object') {
    // A success that carries no row is not evidence that the import finished, so
    // the poll keeps the row's current state and keeps asking. The one case that
    // does settle is a row already known to be done, which is there to stop a
    // redundant extra request after the completion was delivered elsewhere.
    return { action: isImportingRow(current) || !current ? 'keep' : 'settled' }
  }
  const status = importStatusOf(item)
  if (status === IMPORT_STATUS_IMPORTING) return { action: 'pending', item }
  if (status === IMPORT_STATUS_FAILED) return { action: 'failed', item }
  return { action: 'settled', item }
}

/**
 * @param {unknown} doc
 * @returns {boolean} true when a poll may run right now
 */
function documentVisible(doc) {
  if (!doc || typeof doc !== 'object') return true
  const visibility = /** @type {Record<string, any>} */ (doc).visibilityState
  return visibility !== 'hidden'
}

/**
 * @param {{
 *   intervalMs?: number,
 *   deps?: {
 *     fetchItem?: (id: string) => Promise<any>,
 *     onItem?: (item: Record<string, any>) => void,
 *     onRemove?: (id: string) => void,
 *     onFailed?: (item: Record<string, any> | null, id: string) => void,
 *     onDegraded?: (item: Record<string, any>) => void,
 *     setTimeout?: (fn: () => void, ms: number) => any,
 *     clearTimeout?: (handle: any) => void,
 *     getDocument?: () => any,
 *   },
 * }} [options]
 */
export function createImportPoller(options = {}) {
  const deps = options.deps || {}
  const intervalMs = options.intervalMs ?? IMPORT_POLL_INTERVAL_MS
  const schedule = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
  const unschedule = deps.clearTimeout ?? ((handle) => clearTimeout(handle))
  const fetchItem = deps.fetchItem ?? (async () => null)
  const getDocument = deps.getDocument ?? (() => (typeof document === 'undefined' ? null : document))

  /** @type {Set<string>} ids being watched */
  const pending = new Set()
  /** @type {any} */
  let timer = null
  let ticking = false
  let running = false
  let disposed = false
  /** @type {any} */
  let detached = null

  const handleOutcome = (id, outcome) => {
    if (outcome.action === 'gone') {
      pending.delete(id)
      deps.onRemove?.(id)
      return
    }
    if (outcome.action === 'failed') {
      pending.delete(id)
      deps.onFailed?.(outcome.item || null, id)
      return
    }
    if (outcome.action === 'settled') {
      pending.delete(id)
      const item = outcome.item || null
      if (item && importStatusOf(item) === 'degraded') deps.onDegraded?.(item)
      if (item) deps.onItem?.(item)
      return
    }
    if (outcome.action === 'pending') {
      if (outcome.item) deps.onItem?.(outcome.item)
      return
    }
    // 'keep': the row keeps its previous state and stays watched.
  }

  const tick = async () => {
    timer = null
    if (disposed || !running || ticking) return
    if (!documentVisible(getDocument())) return
    if (pending.size === 0) return
    ticking = true
    try {
      for (const id of [...pending]) {
        if (disposed) break
        let outcome
        try {
          outcome = decidePollOutcome(await fetchItem(id), null)
        } catch {
          outcome = { action: 'keep' }
        }
        handleOutcome(id, outcome)
      }
    } finally {
      ticking = false
      arm()
    }
  }

  function arm() {
    if (disposed || !running || timer !== null) return
    if (pending.size === 0) return
    if (!documentVisible(getDocument())) return
    timer = schedule(() => {
      void tick()
    }, intervalMs)
  }

  function handleVisibility() {
    if (!running) return
    if (!documentVisible(getDocument())) {
      if (timer !== null) {
        unschedule(timer)
        timer = null
      }
      return
    }
    // Returning to the foreground polls at once instead of waiting out an
    // interval that was suspended while the page was in the background.
    if (timer !== null) {
      unschedule(timer)
      timer = null
    }
    void tick()
  }

  return {
    /**
     * Start watching additional row ids.
     * @param {unknown} ids
     */
    track(ids) {
      const list = Array.isArray(ids) ? ids : [ids]
      let added = false
      for (const raw of list) {
        const id = raw == null ? '' : String(raw)
        if (!id || pending.has(id)) continue
        pending.add(id)
        added = true
      }
      if (added) arm()
    },

    /**
     * Replace the watched set with exactly the ids a feed load reported.
     *
     * A row that settled while the page was closed must not stay watched, and a
     * job started elsewhere still must be — this runs on every load, so it does
     * not depend on anything the page kept in memory.
     * @param {unknown} items
     */
    sync(items) {
      const wanted = new Set(
        (Array.isArray(items) ? items : [])
          .filter((item) => isImportingRow(item))
          .map((item) => String(/** @type {Record<string, any>} */ (item).id)),
      )
      for (const id of [...pending]) {
        if (!wanted.has(id)) pending.delete(id)
      }
      this.track([...wanted])
    },

    /** Begin polling (and stop when nothing is being watched). */
    start() {
      if (disposed || running) return
      running = true
      const doc = getDocument()
      if (doc && typeof doc.addEventListener === 'function') {
        detached = handleVisibility
        doc.addEventListener('visibilitychange', detached)
      }
      arm()
    },

    /** Stop polling; watched ids are kept so `start()` can resume them. */
    stop() {
      running = false
      if (timer !== null) {
        unschedule(timer)
        timer = null
      }
      const doc = getDocument()
      if (detached && doc && typeof doc.removeEventListener === 'function') {
        doc.removeEventListener('visibilitychange', detached)
      }
      detached = null
    },

    /** Release the poller; it cannot be restarted afterwards. */
    dispose() {
      this.stop()
      disposed = true
    },

    /** Ids currently watched, in insertion order. */
    watchedIds() {
      return [...pending]
    },
  }
}
