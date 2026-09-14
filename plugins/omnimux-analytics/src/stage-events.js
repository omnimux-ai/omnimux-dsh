/**
 * Whitelist parsing for renderer-reported first-level page events.
 *
 * The renderer is untrusted input for the Host: only a closed event-name set
 * and a closed field set may cross the ingest route, so no free-form text can
 * reach the analytics queue. Page identity travels as a validated stage id
 * (the same id the hub publishes on `window.__omnimuxStage`), never as a raw
 * label or URL.
 */

/** Event names the renderer may report. */
export const STAGE_EVENT_NAMES = Object.freeze(['stage-open', 'stage-close'])

/** Maximum accepted stage id length. */
export const MAX_STAGE_ID_LENGTH = 64

/** Longest accepted dwell time (24h); longer values mean a stuck clock. */
export const MAX_DWELL_MS = 24 * 60 * 60 * 1000

/** Stage ids mirror the hub's own id shape: no spaces, no path separators. */
const STAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u

const ALLOWED_KEYS = new Set(['name', 'stage', 'dwellMs'])

/**
 * @typedef {{ name: string, data: { stage: string, dwellMs?: number } }} StageEvent
 */

/**
 * Parse one renderer-reported page event. Unknown event names, unknown keys,
 * malformed stage ids, and out-of-range dwell times all return `undefined`
 * rather than being forwarded.
 * @param {unknown} value
 * @returns {StageEvent | undefined}
 */
export function parseStageEvent(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = /** @type {Record<string, unknown>} */ (value)
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.has(key)) return undefined
  }

  const name = raw.name
  if (typeof name !== 'string' || !STAGE_EVENT_NAMES.includes(name)) return undefined

  const stage = raw.stage
  if (typeof stage !== 'string'
    || stage.length === 0
    || stage.length > MAX_STAGE_ID_LENGTH
    || !STAGE_ID_PATTERN.test(stage)) {
    return undefined
  }

  /** @type {{ stage: string, dwellMs?: number }} */
  const data = { stage }
  if (raw.dwellMs !== undefined) {
    const dwellMs = raw.dwellMs
    if (typeof dwellMs !== 'number'
      || !Number.isSafeInteger(dwellMs)
      || dwellMs < 0
      || dwellMs > MAX_DWELL_MS) {
      return undefined
    }
    data.dwellMs = dwellMs
  }

  return { name, data }
}
