/**
 * Renderer-side first-level page tracker.
 *
 * The hub publishes `window.__omnimuxStage` (with `PRODUCT_STAGE_EVENT`) so any
 * plugin can read the currently claimed first-level page without importing hub
 * internals or copying another plugin's DOM — that public global is the only
 * seam used here.
 *
 * The tracker never talks to the analytics service directly: it posts small
 * page events to the Host ingest route, which owns the site configuration and
 * forwards through the same queue as tool-call events.
 */

/** Host route that accepts renderer-reported page events. */
export const INGEST_PATH = '/omnimux-analytics/event'

/** Event name the hub dispatches when the claimed first-level page changes. */
export const PRODUCT_STAGE_EVENT = 'dsh-product-stage'

/** @typedef {{ name: string, stage: string, dwellMs?: number }} StagePayload */

/**
 * @param {unknown} event
 * @returns {string | undefined} claimed stage id, or undefined when unreadable
 */
function readStageId(event) {
  if (event === null || typeof event !== 'object') return undefined
  const detail = /** @type {{ detail?: unknown }} */ (event).detail
  if (detail === null || typeof detail !== 'object') return undefined
  const id = /** @type {{ id?: unknown }} */ (detail).id
  return typeof id === 'string' ? id : undefined
}

/**
 * @param {StagePayload} payload
 * @returns {void}
 */
function defaultSend(payload) {
  try {
    void fetch(INGEST_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Analytics must never disturb the page.
  }
}

/**
 * Subscribe to first-level page changes and report open/close with dwell time.
 * @param {{
 *   target?: EventTarget,
 *   send?: (payload: StagePayload) => void,
 *   now?: () => number,
 * }} [options]
 * @returns {() => void} dispose
 */
export function installStageTracker(options = {}) {
  const target = options.target
  if (!target || typeof target.addEventListener !== 'function') return () => {}
  const send = typeof options.send === 'function' ? options.send : defaultSend
  const now = typeof options.now === 'function' ? options.now : () => Date.now()

  /** @type {string} */
  let current = ''
  let openedAt = 0

  const emitClose = () => {
    if (current === '') return
    const dwellMs = Math.max(0, Math.round(now() - openedAt))
    send({ name: 'stage-close', stage: current, dwellMs })
    current = ''
    openedAt = 0
  }

  /**
   * @param {Event} event
   */
  const onStage = (event) => {
    const id = readStageId(event)
    if (id === undefined || id === current) return
    emitClose()
    if (id === '') return
    current = id
    openedAt = now()
    send({ name: 'stage-open', stage: id })
  }

  target.addEventListener(PRODUCT_STAGE_EVENT, onStage)
  return () => {
    try {
      target.removeEventListener(PRODUCT_STAGE_EVENT, onStage)
    } catch {
      // Detached targets cannot be unsubscribed; nothing else to release.
    }
  }
}
