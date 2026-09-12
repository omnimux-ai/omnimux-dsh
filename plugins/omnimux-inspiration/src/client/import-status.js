/**
 * Import lifecycle presentation contract (client side).
 *
 * The server owns the values a row carries (`import_status`, `import_stage`);
 * this module owns the single mapping from those values to the locale keys the UI
 * renders, so the card pill, the preview panel and the test that asserts the
 * zh/en key sets all read the same table.
 *
 * @typedef {'resolving' | 'downloading' | 'analyzing' | 'persisting'} ImportStage
 */

/** A row with no `import_status` was written before the field existed: done. */
export const IMPORT_STATUS_READY = 'ready'
/** A completed import that obtained no downloadable video. */
export const IMPORT_STATUS_DEGRADED = 'degraded'
/** A background job owns this row right now. */
export const IMPORT_STATUS_IMPORTING = 'importing'
/** The import failed; the row is kept, with `import_error` set. */
export const IMPORT_STATUS_FAILED = 'failed'

/** Locale key per stage, in the order an import walks them. */
const STAGE_KEYS = Object.freeze({
  resolving: 'add.status.resolving',
  downloading: 'add.status.downloading',
  analyzing: 'add.status.analyzing',
  persisting: 'add.status.persisting',
})

/** Locale key shown while a row is importing but its stage is unknown. */
export const IMPORT_STAGE_FALLBACK_KEY = STAGE_KEYS.resolving

/** Refresh interval for the completion poll, in milliseconds. */
export const IMPORT_POLL_INTERVAL_MS = 2500

/**
 * @param {unknown} item
 * @returns {string}
 */
export function importStatusOf(item) {
  const row = item && typeof item === 'object' ? /** @type {Record<string, any>} */ (item) : {}
  return typeof row.import_status === 'string' && row.import_status
    ? row.import_status
    : IMPORT_STATUS_READY
}

/**
 * @param {unknown} item
 * @returns {boolean}
 */
export function isImportingRow(item) {
  return importStatusOf(item) === IMPORT_STATUS_IMPORTING
}

/**
 * @param {unknown} item
 * @returns {boolean}
 */
export function isFailedRow(item) {
  return importStatusOf(item) === IMPORT_STATUS_FAILED
}

/**
 * Locale key for the stage a row is in.
 *
 * An unrecognized or missing stage falls back to `resolving` rather than
 * rendering nothing: a row that is importing must always say something, or the
 * card looks frozen.
 * @param {unknown} stage
 * @returns {string}
 */
export function importStageKey(stage) {
  const key = typeof stage === 'string' ? stage.trim().toLowerCase() : ''
  return STAGE_KEYS[key] || IMPORT_STAGE_FALLBACK_KEY
}

/**
 * Every locale key this module can render, for the zh/en parity check.
 * @returns {string[]}
 */
export function importLocaleKeys() {
  return [
    ...Object.values(STAGE_KEYS),
    'add.status.failed',
    'add.failedDetail',
    'add.retryHint',
    'add.analysisFailed',
  ]
}

/**
 * Localized stage text for a row, or `''` when it is not importing.
 * @param {unknown} item
 * @param {(key: string) => string} translate
 * @returns {string}
 */
export function importStageLabel(item, translate) {
  if (!isImportingRow(item)) return ''
  const row = /** @type {Record<string, any>} */ (item)
  return translate(importStageKey(row.import_stage))
}

/**
 * Text for the card pill of a row, or `''` when no pill should render.
 *
 * A settled row renders nothing at all: `ready`/`degraded` are the states the
 * grid already had before this field existed, and a permanent success badge would
 * be pure visual noise. Only a running or failed import is worth a pill.
 * @param {unknown} item
 * @param {(key: string) => string} translate
 * @returns {string}
 */
export function importPillLabel(item, translate) {
  if (isFailedRow(item)) return translate('add.status.failed')
  return importStageLabel(item, translate)
}

/**
 * Failure detail for a row that carries an `import_error`, or `''` when it has
 * none.
 *
 * Keyed off the field and not off `import_status`: `import_error` is a
 * non-terminal marker, so a row that imported fine but could not be broken down
 * carries one too. Gating this on `failed` would hide exactly the reason the user
 * needs — why the breakdown the import promised is missing.
 * @param {unknown} item
 * @param {(key: string) => string} translate
 * @returns {string}
 */
export function importErrorText(item, translate) {
  const detail = importErrorDetail(item)
  if (!detail) return ''
  return translate('add.failedDetail').replace('{error}', detail)
}

/**
 * Whether this row's error means the import stored nothing, as opposed to a
 * completed import that is missing one part of itself.
 * @param {unknown} item
 * @returns {boolean}
 */
export function isImportFailure(item) {
  return isFailedRow(item) && importErrorDetail(item) !== ''
}

/**
 * What the user can do about a row's error, or `''` when there is no advice to
 * give. A failed import is retryable by importing the same URL again — the
 * server reuses the row's id and restarts the job in place.
 * @param {unknown} item
 * @param {(key: string) => string} translate
 * @returns {string}
 */
export function importRetryHint(item, translate) {
  return isImportFailure(item) ? translate('add.retryHint') : ''
}

/**
 * Notice text for a background import that stored its item but could not produce
 * the AI breakdown, or `''` when the row has nothing to report.
 *
 * A row with no `import_error` is a clean completion. A `failed` row is left to
 * `importErrorText`, which already says the import itself did not happen.
 * @param {unknown} item
 * @param {(key: string) => string} translate
 * @returns {string}
 */
export function importSettledNotice(item, translate) {
  const detail = importErrorDetail(item)
  if (!detail || isFailedRow(item)) return ''
  return translate('add.analysisFailed').replace('{error}', detail)
}

/**
 * Raw `import_error` of a row, trimmed, or `''`.
 *
 * Exported because the poller needs the same "is there anything on this row to
 * report" test and reimplementing it there would be a second definition of the
 * field to keep in sync.
 * @param {unknown} item
 * @returns {string}
 */
export function importErrorDetail(item) {
  const row = item && typeof item === 'object' ? /** @type {Record<string, any>} */ (item) : {}
  return typeof row.import_error === 'string' ? row.import_error.trim() : ''
}

/**
 * Ids of the rows a completion poll must watch.
 * @param {unknown} items
 * @returns {string[]}
 */
export function importingIds(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => isImportingRow(item))
    .map((item) => String(/** @type {Record<string, any>} */ (item).id))
    .filter(Boolean)
}
