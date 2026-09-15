/**
 * Publish lifecycle presentation contract (client side).
 *
 * The server owns the values a row carries (`share_status`, `share_stage`,
 * `share_error`, and the cloud's own `share_url` / `share_expires_in`); this
 * module owns the single mapping from those values to what the popover renders,
 * plus the poll verdict that decides when to stop asking.
 *
 * Nothing here invents a link or a validity: a row with no server-issued
 * `share_url` renders no link at all.
 *
 * @typedef {'idle' | 'running' | 'done' | 'failed'} ShareStatus
 * @typedef {'preparing' | 'uploading' | 'publishing'} ShareStage
 */

export const SHARE_STATUS_IDLE = 'idle'
export const SHARE_STATUS_RUNNING = 'running'
export const SHARE_STATUS_DONE = 'done'
export const SHARE_STATUS_FAILED = 'failed'

/** A row with no `share_status` was written before the field existed: never published. */
export function shareStatusOf(row) {
  const rec = row && typeof row === 'object' ? /** @type {Record<string, any>} */ (row) : {}
  return typeof rec.share_status === 'string' && rec.share_status ? rec.share_status : SHARE_STATUS_IDLE
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
 * The server-issued link of this row, or `''` when there is none.
 *
 * Gated on the status on purpose: a failed attempt clears the link server-side,
 * and a client that read the field alone would still render a dead one.
 * @param {unknown} row
 * @returns {string}
 */
export function shareUrlOf(row) {
  const rec = row && typeof row === 'object' ? /** @type {Record<string, any>} */ (row) : {}
  if (shareStatusOf(rec) !== SHARE_STATUS_DONE) return ''
  return typeof rec.share_url === 'string' ? rec.share_url.trim() : ''
}

/**
 * Raw failure text of this row, or `''`.
 * @param {unknown} row
 * @returns {string}
 */
export function shareErrorText(row) {
  const rec = row && typeof row === 'object' ? /** @type {Record<string, any>} */ (row) : {}
  if (!isShareFailed(rec)) return ''
  return typeof rec.share_error === 'string' ? rec.share_error.trim() : ''
}

/** Locale key per stage, in the order a publish walks them. */
const STAGE_KEYS = Object.freeze({
  preparing: 'modal.share.preparing',
  uploading: 'modal.share.uploading',
  publishing: 'modal.share.publishing',
})

/** Every stage of a publish, in order. */
export const SHARE_STAGE_ORDER = Object.freeze(['preparing', 'uploading', 'publishing'])

/**
 * The stage a running publish has reached, or `''` when it is not running.
 * @param {unknown} row
 * @returns {string}
 */
export function shareStageOf(row) {
  const rec = row && typeof row === 'object' ? /** @type {Record<string, any>} */ (row) : {}
  if (!isShareRunning(rec)) return ''
  const stage = typeof rec.share_stage === 'string' ? rec.share_stage.trim().toLowerCase() : ''
  return SHARE_STAGE_ORDER.includes(stage) ? stage : SHARE_STAGE_ORDER[0]
}

/**
 * The steps the progress list renders, each marked with its real state.
 *
 * `done` comes from the stage the server published, so a step the job already
 * passed keeps its completed mark while the next one runs.
 * @param {unknown} row
 * @param {(key: string) => string} translate
 * @returns {Array<{ id: string, label: string, state: 'done' | 'active' | 'todo' }>}
 */
export function shareSteps(row, translate) {
  const current = shareStageOf(row)
  if (!current) return []
  const currentIndex = SHARE_STAGE_ORDER.indexOf(current)
  return SHARE_STAGE_ORDER.map((id, index) => ({
    id,
    label: translate(STAGE_KEYS[id]),
    state: index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'todo',
  }))
}

/**
 * Validity text from the cloud's own `expires_in`, or `''` when it said nothing.
 *
 * The cloud answers `72h` for ordinary accounts (and `permanent` for an
 * administrator), so the text is derived from what it returned rather than from
 * an assumption about the account.
 * @param {unknown} row
 * @param {(key: string) => string} translate
 * @returns {string}
 */
export function shareValidityText(row, translate) {
  const rec = row && typeof row === 'object' ? /** @type {Record<string, any>} */ (row) : {}
  const expiresIn = typeof rec.share_expires_in === 'string' ? rec.share_expires_in.trim() : ''
  if (!expiresIn) return ''
  return translate('modal.share.validity').replace('{duration}', expiryDurationText(expiresIn, translate))
}

/**
 * @param {string} expiresIn
 * @param {(key: string) => string} translate
 * @returns {string}
 */
export function expiryDurationText(expiresIn, translate) {
  const text = String(expiresIn || '').trim()
  if (!text) return ''
  if (/^(permanent|forever|never)$/i.test(text)) return translate('modal.share.permanent')
  const hours = /^(\d+(?:\.\d+)?)\s*h(?:ours?)?$/i.exec(text)
  if (hours) return translate('modal.share.hours').replace('{n}', hours[1])
  const days = /^(\d+(?:\.\d+)?)\s*d(?:ays?)?$/i.exec(text)
  if (days) return translate('modal.share.days').replace('{n}', days[1])
  return text
}

/**
 * What a single share poll answer means for the row it asked about.
 *
 * Mirrors the import poll's contract: `keep` covers a request that produced no
 * verdict (blip, 500, malformed body) so the row stays watched; `settled` means
 * the publish finished, whichever way it finished — the failure text rides on
 * the row itself.
 * @param {{ ok?: boolean, status?: number, body?: any } | null | undefined} response
 * @param {unknown} current
 * @returns {{ action: 'pending' | 'settled' | 'failed' | 'gone' | 'keep', item?: Record<string, any> }}
 */
export function decideSharePollOutcome(response, current) {
  if (!response || typeof response !== 'object') return { action: 'keep' }
  if (response.status === 404) return { action: 'gone' }
  if (!response.ok) return { action: 'keep' }
  const item = response.body?.data
  if (!item || typeof item !== 'object') {
    return { action: isShareRunning(current) || !current ? 'keep' : 'settled' }
  }
  const status = shareStatusOf(item)
  if (status === SHARE_STATUS_RUNNING) return { action: 'pending', item }
  if (status === SHARE_STATUS_FAILED) return { action: 'failed', item }
  return { action: 'settled', item }
}

/**
 * Every locale key this module can render, for the zh/en parity check.
 * @returns {string[]}
 */
export function shareLocaleKeys() {
  return [
    ...Object.values(STAGE_KEYS),
    'modal.share.validity',
    'modal.share.hours',
    'modal.share.days',
    'modal.share.permanent',
  ]
}
