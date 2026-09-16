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
 * `share_source` says which of the two publish paths produced the row: `local`
 * uploads the library's own files first, `cloud` republishes an entry that is
 * already in the cloud from its existing addresses and never uploads anything.
 * The two walk different stage sequences, so the field is what keeps the
 * progress the page renders honest about the work actually being done.
 *
 * `share_media_skipped` records that the cloud could not serve the entry's
 * video/image (`video`/`image`) and the share therefore carries only the cover
 * and the copy. It is the marker the page turns into a visible warning; a share
 * never ships a player nothing can open without saying so.
 *
 * @typedef {'idle' | 'running' | 'done' | 'failed'} ShareStatus
 * @typedef {'preparing' | 'uploading' | 'publishing' | null} ShareStage
 * @typedef {'local' | 'cloud'} ShareSource
 */

/** No publish has been attempted for this row (also the legacy-row reading). */
export const SHARE_STATUS_IDLE = 'idle'
/** A publish job owns this row right now. */
export const SHARE_STATUS_RUNNING = 'running'
/** The row holds a server-issued link. */
export const SHARE_STATUS_DONE = 'done'
/** The publish attempt failed; the row is kept, with `share_error` set. */
export const SHARE_STATUS_FAILED = 'failed'

/** The publish path that produced a row. */
export const SHARE_SOURCES = Object.freeze({
  LOCAL: 'local',
  CLOUD: 'cloud',
})

/** The only stage sequence a publish may walk, in order. */
export const SHARE_STAGES = Object.freeze({
  PREPARING: 'preparing',
  GENERATING_PROMPT: 'generating_prompt',
  UPLOADING: 'uploading',
  PUBLISHING: 'publishing',
})

/** Stage order, for a progress bar that marks what is already behind the job. */
export const SHARE_STAGE_ORDER = Object.freeze([
  SHARE_STAGES.PREPARING,
  SHARE_STAGES.GENERATING_PROMPT,
  SHARE_STAGES.UPLOADING,
  SHARE_STAGES.PUBLISHING,
])

/**
 * The cloud path has no upload leg — the assets are already in the cloud — so
 * its sequence is shorter. Reporting `uploading` here would be a stage the job
 * never reaches, which is exactly the fabricated progress this contract forbids.
 */
export const CLOUD_SHARE_STAGE_ORDER = Object.freeze([
  SHARE_STAGES.PREPARING,
  SHARE_STAGES.GENERATING_PROMPT,
  SHARE_STAGES.PUBLISHING,
])

/**
 * The stage sequence a publish of this source walks.
 * @param {unknown} source
 * @returns {readonly string[]}
 */
export function shareStageOrderFor(source) {
  return source === SHARE_SOURCES.CLOUD ? CLOUD_SHARE_STAGE_ORDER : SHARE_STAGE_ORDER
}

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
 * @param {{ now?: string, source?: string }} [options]
 */
export function shareRunningPatch(stage, options = {}) {
  return {
    share_status: SHARE_STATUS_RUNNING,
    share_stage: stage,
    share_source: options.source === SHARE_SOURCES.CLOUD ? SHARE_SOURCES.CLOUD : SHARE_SOURCES.LOCAL,
    share_started_at: options.now || new Date().toISOString(),
    share_completed_at: null,
    share_error: null,
    share_url: null,
    share_id: null,
    share_storage_bucket: null,
    share_is_admin: null,
    share_expires_at: null,
    share_expires_in: null,
    share_media_skipped: null,
  }
}

/**
 * The patch that stores the cloud answer as-is.
 * @param {{
 *   shareId?: string, shareUrl?: string, storageBucket?: string,
 *   isAdmin?: boolean, expiresAt?: string, expiresIn?: string,
 *   mediaSkipped?: string,
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
    share_media_skipped: result?.mediaSkipped === 'video' || result?.mediaSkipped === 'image'
      ? result.mediaSkipped
      : null,
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
    share_media_skipped: null,
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
