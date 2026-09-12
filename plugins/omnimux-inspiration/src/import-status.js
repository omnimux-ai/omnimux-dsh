import { DOWNLOAD_TIMEOUT_MS } from './downloader.js'

/**
 * Import lifecycle contract shared by the background runner and the read-side
 * stale sweep.
 *
 * A row carries `import_status` (`ready` when the field is absent, so every row
 * written before this field existed reads as a completed import), an optional
 * `import_stage`, the failure text in `import_error`, and the ISO timestamp the
 * running job began at in `import_started_at`.
 *
 * @typedef {'importing' | 'ready' | 'degraded' | 'failed'} ImportStatus
 * @typedef {'resolving' | 'downloading' | 'analyzing' | 'persisting' | null} ImportStage
 */

/** Stamped on a record written by a completed import. */
export const IMPORT_STATUS_READY = 'ready'
/** Stamped on a record that completed without a downloadable video. */
export const IMPORT_STATUS_DEGRADED = 'degraded'
/** Stamped on the placeholder row a background import writes before it starts. */
export const IMPORT_STATUS_IMPORTING = 'importing'
/** Stamped on a row whose import failed, is still listed, and can be retried. */
export const IMPORT_STATUS_FAILED = 'failed'

/** The only stage sequence a background import may publish. */
export const IMPORT_STAGES = Object.freeze({
  RESOLVING: 'resolving',
  DOWNLOADING: 'downloading',
  ANALYZING: 'analyzing',
  PERSISTING: 'persisting',
})

/** Failure text a swept row carries; the shape `add.failedDetail` renders. */
export const IMPORT_STALE_ERROR = '导入中断或超时，请重试'

/**
 * Analysis is the one unbounded step: it hands a video to the multimodal tool
 * and no local timer covers that call, so the deadline allows for it on top of
 * the download budget the downloader enforces internally.
 */
export const IMPORT_ANALYZE_BUDGET_MS = 60_000

/**
 * Wall-clock budget for one import job before the read side may declare it dead.
 *
 * The sweep is the authority: a browser polls until the row settles and never
 * times out on its own, so this value is the only bound on a row that is stuck
 * showing "running".
 */
export const IMPORT_STALE_AFTER_MS = DOWNLOAD_TIMEOUT_MS + IMPORT_ANALYZE_BUDGET_MS

/**
 * A legacy row (no `import_status`) and any row that already settled is a
 * completed import.
 * @param {unknown} item
 * @returns {ImportStatus}
 */
export function importStatusOf(item) {
  const row = item && typeof item === 'object' ? /** @type {Record<string, any>} */ (item) : {}
  return typeof row.import_status === 'string' && row.import_status
    ? /** @type {ImportStatus} */ (row.import_status)
    : IMPORT_STATUS_READY
}

/**
 * @param {unknown} item
 * @returns {boolean}
 */
export function isImporting(item) {
  return importStatusOf(item) === IMPORT_STATUS_IMPORTING
}

/**
 * @param {unknown} item
 * @returns {boolean}
 */
export function isImportFailed(item) {
  return importStatusOf(item) === IMPORT_STATUS_FAILED
}

/**
 * @param {unknown} item
 * @returns {boolean}
 */
export function isImportBlocked(item) {
  return isImporting(item)
}

/**
 * Rows the sweep may declare dead.
 *
 * A row is stale only when its deadline has passed *and* no live job owns it.
 * The liveness half matters while the process runs: a slow but healthy import
 * must not be failed underneath itself. With an empty active-jobs registry —
 * the state after a Host restart — every expired row is genuinely abandoned, so
 * failing it is correct.
 * @param {unknown} items
 * @param {{ now?: number, activeIds?: Set<string>, staleAfterMs?: number }} [options]
 * @returns {Array<Record<string, any>>}
 */
export function findStaleImports(items, options = {}) {
  const now = options.now ?? Date.now()
  const activeIds = options.activeIds instanceof Set ? options.activeIds : new Set()
  const staleAfterMs = options.staleAfterMs ?? IMPORT_STALE_AFTER_MS
  const deadline = now - staleAfterMs

  return (Array.isArray(items) ? items : []).filter((item) => {
    if (!isImporting(item)) return false
    if (activeIds.has(String(/** @type {Record<string, any>} */ (item).id))) return false
    const startedAt = Date.parse(/** @type {Record<string, any>} */ (item).import_started_at)
    if (!Number.isFinite(startedAt)) return true
    return startedAt < deadline
  })
}

/**
 * Whether a row is already dead on read, without waiting for a write-side sweep.
 *
 * `handleGetItem` answers a single row, so it needs the same verdict the list
 * sweep would reach. A live job is never reported stale, however old the row is.
 * @param {unknown} item
 * @param {{ now?: number, activeIds?: Set<string>, staleAfterMs?: number }} [options]
 * @returns {boolean}
 */
export function isStaleImport(item, options = {}) {
  return findStaleImports([item], options).length > 0
}

/**
 * The patch that fails a stale row.
 * @returns {{ import_status: 'failed', import_stage: null, import_error: string }}
 */
export function staleImportPatch() {
  return {
    import_status: IMPORT_STATUS_FAILED,
    import_stage: null,
    import_error: IMPORT_STALE_ERROR,
  }
}
