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
 * A publish has two sources and they walk different stage lists, so the steps
 * come from the row's own `share_source`: a cloud entry republishes media the
 * cloud already holds and never uploads, so rendering an "uploading" step for it
 * would be a stage the job never runs.
 *
 * @typedef {'idle' | 'running' | 'done' | 'failed'} ShareStatus
 * @typedef {'preparing' | 'uploading' | 'publishing'} ShareStage
 * @typedef {'local' | 'cloud'} ShareSource
 */

export const SHARE_STATUS_IDLE = 'idle'
export const SHARE_STATUS_RUNNING = 'running'
export const SHARE_STATUS_DONE = 'done'
export const SHARE_STATUS_FAILED = 'failed'

/** The publish path a row was produced by. */
export const SHARE_SOURCES = Object.freeze({
  LOCAL: 'local',
  CLOUD: 'cloud',
})

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
  generating_prompt: 'modal.share.generatingPrompt',
  uploading: 'modal.share.uploading',
  publishing: 'modal.share.publishing',
})

/** Every stage of a publish, in order. */
export const SHARE_STAGE_ORDER = Object.freeze([
  'preparing',
  'generating_prompt',
  'uploading',
  'publishing',
])

/**
 * The cloud publish path, which has no upload leg: the entry's media is already
 * in the cloud, so the job only probes it and publishes it.
 */
export const CLOUD_SHARE_STAGE_ORDER = Object.freeze([
  'preparing',
  'generating_prompt',
  'publishing',
])

/**
 * Which publish path a row belongs to.
 *
 * `share_source` is written by the server on the row it hands back. A row that
 * has not been published yet has none, so the feed's own `is_local` marker is
 * the fallback — that is the flag `loadInspirationsAtomic` puts on a cloud row,
 * and it is what makes the very first click take the no-upload path.
 * @param {unknown} row
 * @returns {ShareSource}
 */
export function shareSourceOf(row) {
  const rec = row && typeof row === 'object' ? /** @type {Record<string, any>} */ (row) : {}
  const source = typeof rec.share_source === 'string' ? rec.share_source.trim().toLowerCase() : ''
  if (source === SHARE_SOURCES.CLOUD || source === SHARE_SOURCES.LOCAL) return source
  return rec.is_local === false ? SHARE_SOURCES.CLOUD : SHARE_SOURCES.LOCAL
}

/**
 * The stage list this row's publish walks.
 * @param {unknown} row
 * @returns {readonly string[]}
 */
export function shareStageOrderOf(row) {
  return shareSourceOf(row) === SHARE_SOURCES.CLOUD ? CLOUD_SHARE_STAGE_ORDER : SHARE_STAGE_ORDER
}

/**
 * The stage a running publish has reached, or `''` when it is not running.
 * @param {unknown} row
 * @returns {string}
 */
export function shareStageOf(row) {
  const rec = row && typeof row === 'object' ? /** @type {Record<string, any>} */ (row) : {}
  if (!isShareRunning(rec)) return ''
  const order = shareStageOrderOf(rec)
  const stage = typeof rec.share_stage === 'string' ? rec.share_stage.trim().toLowerCase() : ''
  return order.includes(stage) ? stage : order[0]
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
  const order = shareStageOrderOf(row)
  const current = shareStageOf(row)
  if (!current) return []
  const currentIndex = order.indexOf(current)
  return order.map((id, index) => ({
    id,
    label: translate(STAGE_KEYS[id]),
    state: index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'todo',
  }))
}

/**
 * What the result area must say about an asset the share had to leave out.
 *
 * The cloud's public media endpoint cannot serve a publication's video/image
 * today (upstream storage defect laozhong86/OmniMux#257), and that is not
 * something this side can fix — so a share that still succeeds without it says
 * so, in the same place the link appears. Rendering the link silently would hand
 * the user a share whose player opens onto nothing.
 * @param {unknown} row
 * @param {(key: string) => string} translate
 * @returns {string}
 */
export function shareMediaNotice(row, translate) {
  const rec = row && typeof row === 'object' ? /** @type {Record<string, any>} */ (row) : {}
  const kind = typeof rec.share_media_skipped === 'string' ? rec.share_media_skipped.trim().toLowerCase() : ''
  if (kind !== 'video' && kind !== 'image') return ''
  return translate(`modal.share.mediaUnavailable.${kind}`)
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
    'modal.share.mediaUnavailable.video',
    'modal.share.mediaUnavailable.image',
  ]
}
