/**
 * Share lifecycle contract shared by the publishing job, the HTTP handler and
 * the client poller.
 *
 * A row carries `share_status` (`idle` when the field is absent, so every row
 * written before this field existed reads as "never published"), an optional
 * `share_stage` while the job runs, the failure text in `share_error`, and the
 * server-owned result once it lands: `share_url`, `share_id`,
 * `share_storage_bucket`, `share_is_admin`, `share_expires_at`,
 * `share_expires_in`.
 *
 * The result fields are copied from the cloud answer verbatim — this plugin
 * never builds a link of its own, and never decides how long one lives.
 *
 * @typedef {'idle' | 'running' | 'done' | 'failed'} ShareStatus
 * @typedef {'preparing' | 'uploading' | 'publishing' | null} ShareStage
 */

/** No publish has been attempted for this row (also the legacy-row reading). */
export const SHARE_STATUS_IDLE = 'idle'
/** A publish job owns this row right now. */
export const SHARE_STATUS_RUNNING = 'running'
/** The row holds a server-issued link. */
export const SHARE_STATUS_DONE = 'done'
/** The publish attempt failed; the row is kept, with `share_error` set. */
export const SHARE_STATUS_FAILED = 'failed'

/** The only stage sequence a publish may walk, in order. */
export const SHARE_STAGES = Object.freeze({
  PREPARING: 'preparing',
  UPLOADING: 'uploading',
  PUBLISHING: 'publishing',
})

/** Stage order, for a progress bar that marks what is already behind the job. */
export const SHARE_STAGE_ORDER = Object.freeze([
  SHARE_STAGES.PREPARING,
  SHARE_STAGES.UPLOADING,
  SHARE_STAGES.PUBLISHING,
])

/**
 * @param {unknown} row
 * @returns {ShareStatus}
 */
export function shareStatusOf(row) {
  const rec = row && typeof row === 'object' ? /** @type {Record<string, any>} */ (row) : {}
  return typeof rec.share_status === 'string' && rec.share_status
    ? /** @type {ShareStatus} */ (rec.share_status)
    : SHARE_STATUS_IDLE
}

/**
 * @param {unknown} row
 * @returns {boolean}
 */
export function isShareRunning(row) {
  return shareStatusOf(row) === SHARE_STATUS_RUNNING
}

/**
 * @param {unknown} row
 * @returns {boolean}
 */
export function isShareFailed(row) {
  return shareStatusOf(row) === SHARE_STATUS_FAILED
}

/**
 * The patch that claims the row for a running publish.
 *
 * Writing the running state *before* the first upload is what makes the page's
 * progress honest: the stages it renders come from this row, and a previous
 * attempt's link is cleared so a stale url can never be read as this attempt's
 * result.
 * @param {string} stage
 * @param {{ now?: string }} [options]
 */
export function shareRunningPatch(stage, options = {}) {
  return {
    share_status: SHARE_STATUS_RUNNING,
    share_stage: stage,
    share_started_at: options.now || new Date().toISOString(),
    share_completed_at: null,
    share_error: null,
    share_url: null,
    share_id: null,
    share_storage_bucket: null,
    share_is_admin: null,
    share_expires_at: null,
    share_expires_in: null,
  }
}

/**
 * The patch that stores the cloud answer as-is.
 * @param {{
 *   shareId?: string, shareUrl?: string, storageBucket?: string,
 *   isAdmin?: boolean, expiresAt?: string, expiresIn?: string,
 * }} result
 * @param {{ now?: string }} [options]
 */
export function shareDonePatch(result, options = {}) {
  return {
    share_status: SHARE_STATUS_DONE,
    share_stage: null,
    share_completed_at: options.now || new Date().toISOString(),
    share_error: null,
    share_id: result?.shareId || null,
    share_url: result?.shareUrl || null,
    share_storage_bucket: result?.storageBucket || null,
    share_is_admin: result?.isAdmin === true,
    share_expires_at: result?.expiresAt || null,
    share_expires_in: result?.expiresIn || null,
  }
}

/**
 * The patch that fails the attempt. No link is kept: a failed publish has none
 * to offer, and the page must never render one.
 * @param {unknown} reason
 * @param {{ now?: string }} [options]
 */
export function shareFailedPatch(reason, options = {}) {
  return {
    share_status: SHARE_STATUS_FAILED,
    share_stage: null,
    share_completed_at: options.now || new Date().toISOString(),
    share_error: String(reason || '').trim() || '分享发布失败，请稍后重试',
    share_url: null,
    share_id: null,
    share_expires_at: null,
    share_expires_in: null,
  }
}

/**
 * Ids of the rows a share poll must keep asking about.
 * @param {unknown} items
 * @returns {string[]}
 */
export function sharingIds(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => isShareRunning(item))
    .map((item) => String(/** @type {Record<string, any>} */ (item).id))
    .filter(Boolean)
}

/** The cloud refuses a single uploaded file above this size. */
export const SHARE_UPLOAD_MAX_BYTES = 100 * 1024 * 1024

/**
 * Readable reason for a file the cloud would reject, or `''` when it fits.
 * @param {unknown} fileName
 * @param {unknown} size
 * @returns {string}
 */
export function shareUploadLimitMessage(fileName, size) {
  const bytes = Number(size)
  if (!Number.isFinite(bytes) || bytes <= SHARE_UPLOAD_MAX_BYTES) return ''
  const mb = (bytes / 1024 / 1024).toFixed(1)
  return `素材超过 100MB 上限（${String(fileName || '素材')}：${mb}MB），请压缩后重试`
}
