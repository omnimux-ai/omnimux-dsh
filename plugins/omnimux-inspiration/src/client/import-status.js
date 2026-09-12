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
  return [...Object.values(STAGE_KEYS), 'add.status.failed', 'add.failedDetail']
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
 * Failure detail for a failed row, or `''` when it has none.
 * @param {unknown} item
 * @param {(key: string) => string} translate
 * @returns {string}
 */
export function importErrorText(item, translate) {
  const row = item && typeof item === 'object' ? /** @type {Record<string, any>} */ (item) : {}
  const detail = typeof row.import_error === 'string' ? row.import_error.trim() : ''
  if (!detail) return ''
  return translate('add.failedDetail').replace('{error}', detail)
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
