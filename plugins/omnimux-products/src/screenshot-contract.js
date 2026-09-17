/**
 * The one source of truth for the website-screenshot contract.
 *
 * Every number the screenshot chain depends on lives here — viewport geometry,
 * time budgets, file modes, the name template — so no other module ever hard
 * codes `1440`, `390`, `2` or `0o600`. The capture layer, the persistence layer
 * and the tests all read this file.
 *
 * Spec: `specs/digital-product-website-screenshots.spec.md` §2.
 */
import { randomUUID } from 'node:crypto'

/**
 * Desktop first screen: 1440×900 CSS px at 1× → a 1440×900 PNG.
 * @type {Readonly<{ kind: string, width: number, height: number, deviceScaleFactor: number, isMobile: boolean, hasTouch: boolean }>}
 */
export const DESKTOP_VIEWPORT = Object.freeze({
  kind: 'desktop',
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
})

/**
 * Mobile first screen: 390×844 CSS px at 2× → a 780×1688 PNG.
 * @type {Readonly<{ kind: string, width: number, height: number, deviceScaleFactor: number, isMobile: boolean, hasTouch: boolean }>}
 */
export const MOBILE_VIEWPORT = Object.freeze({
  kind: 'mobile',
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})

/** @type {Readonly<Record<'desktop' | 'mobile', typeof DESKTOP_VIEWPORT>>} */
export const VIEWPORTS = Object.freeze({
  desktop: DESKTOP_VIEWPORT,
  mobile: MOBILE_VIEWPORT,
})

/**
 * Capture order — and therefore the order of `media[]` in the import draft.
 * Desktop leads, so `media[0]` is always the desktop shot when it succeeded.
 * @type {ReadonlyArray<'desktop' | 'mobile'>}
 */
export const VIEWPORT_ORDER = Object.freeze(['desktop', 'mobile'])

/** Alias for the same frozen array, kept for the task-level contract wording. */
export const REQUIRED_ORDER = VIEWPORT_ORDER

export const SCREENSHOT_STATUS = Object.freeze({
  CAPTURED: 'captured',
  SKIPPED: 'skipped',
  FAILED: 'failed',
})

export const SCREENSHOT_REASON = Object.freeze({
  NO_BROWSER: 'no-browser',
  LAUNCH_FAILED: 'launch-failed',
  NAV_FAILED: 'nav-failed',
  NAV_TIMEOUT: 'nav-timeout',
  CAPTURE_FAILED: 'capture-failed',
  BUDGET_EXCEEDED: 'budget-exceeded',
  UNSAFE_URL: 'unsafe-url',
  NOT_DIGITAL: 'not-digital',
})

/**
 * Reasons that mean "the chain never started" rather than "it started and lost".
 * They answer `skipped`; every other failure answers `failed` (spec §4).
 * @type {ReadonlyArray<string>}
 */
export const SKIPPED_REASONS = Object.freeze([
  SCREENSHOT_REASON.NO_BROWSER,
  SCREENSHOT_REASON.NOT_DIGITAL,
  SCREENSHOT_REASON.UNSAFE_URL,
])

/** Hard ceiling for the whole screenshot chain, browser launch included. */
export const SCREENSHOT_BUDGET_MS = 25000

/** Ceiling for a single viewport's navigation. */
export const NAV_TIMEOUT_MS = 15000

/** Ceiling for the browser's `DevToolsActivePort` to appear. */
export const PORT_DISCOVERY_MS = 10000

/** Quiet window after `load` so the first paint has settled. */
export const SETTLE_MS = 600

/**
 * Heuristics for blank/unrendered frame detection and retry mitigation.
 */
export const BLANK_FRAME_MIN_DIM = 300
export const BLANK_FRAME_MAX_BYTES = 15000
export const BLANK_FRAME_HEADER_FLOOR = 24
export const RETRY_SETTLE_MS = 1000
export const RETRY_CAPTURE_HEADROOM_MS = 1000
export const PNG_IHDR_WIDTH_OFFSET = 16
export const PNG_IHDR_HEIGHT_OFFSET = 20

/** First screen only — never a full-page long shot. */
export const CAPTURE_BEYOND_VIEWPORT = false

export const MEDIA_DIR_MODE = 0o700
export const MEDIA_FILE_MODE = 0o600

/** Host names are folded into this many characters in a file name. */
export const HOST_SLUG_MAX = 40

/**
 * Fold a host name into a file-name-safe slug: lowercase, runs of anything
 * that is not a letter or digit become one `-`, leading / trailing `-` dropped.
 *
 * @param {unknown} host
 * @returns {string}
 */
export function hostSlug(host) {
  const slug = String(host ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, HOST_SLUG_MAX)
    .replace(/-+$/, '')
  return slug || 'site'
}

/**
 * `20260914T031932Z` — second-resolution UTC, filesystem safe.
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function utcStampOf(date = new Date()) {
  const iso = date.toISOString()
  return `${iso.slice(0, 10).replace(/-/g, '')}T${iso.slice(11, 19).replace(/:/g, '')}Z`
}

/**
 * Four lowercase hex characters. Injectable so a test can pin a name.
 *
 * @param {() => number} [rand]
 * @returns {string}
 */
export function randomSuffix(rand = Math.random) {
  const roll = Math.floor(Number(rand()) * 0x10000)
  const safe = Number.isFinite(roll) ? Math.abs(roll) : 0
  return (safe % 0x10000).toString(16).padStart(4, '0')
}

/**
 * `site-<host>-<viewport>-<stamp>-<rand>.png` (spec §2.2).
 *
 * Defaults keep two calls for the same host and viewport from ever colliding.
 *
 * @param {unknown} host
 * @param {string} kind
 * @param {string} [stamp]
 * @param {string} [rand]
 * @returns {string}
 */
export function buildScreenshotName(host, kind, stamp, rand) {
  const tail = typeof rand === 'string' && rand ? rand : randomSuffix(uuidRoll)
  const at = typeof stamp === 'string' && stamp ? stamp : utcStampOf()
  return `site-${hostSlug(host)}-${hostSlug(kind)}-${at}-${tail}.png`
}

/** A uniform roll in [0, 1) drawn from a fresh UUID, for the default name tail. */
function uuidRoll() {
  return Number.parseInt(randomUUID().replace(/-/g, '').slice(0, 8), 16) / 0x100000000
}

/**
 * One viewport's result. `buffer` is the in-memory PNG and never crosses the
 * wire — `reportOf` projects it away (spec §2.3).
 *
 * @param {string} kind
 * @param {boolean} ok
 * @param {{ width?: number, height?: number }} [dims]
 * @param {number} [bytes]
 * @param {string | null} [reason]
 * @param {Buffer | null} [buffer]
 * @returns {{ kind: string, ok: boolean, width: number, height: number, bytes: number, reason: string | null, buffer: Buffer | null }}
 */
export function outcomeOf(kind, ok, dims = {}, bytes = 0, reason = null, buffer = null) {
  return {
    kind: String(kind ?? ''),
    ok: ok === true,
    width: ok === true ? Number(dims.width ?? 0) : 0,
    height: ok === true ? Number(dims.height ?? 0) : 0,
    bytes: ok === true ? Number(bytes ?? 0) : 0,
    reason: ok === true ? null : (reason ?? SCREENSHOT_REASON.CAPTURE_FAILED),
    buffer: ok === true ? buffer : null,
  }
}

/**
 * The wire-shaped report: `{ status, viewports, reason }` with no buffers.
 *
 * - at least one viewport captured → `captured`, reason names the loser (if any)
 * - every viewport failed → `failed`, reason is the first failure
 * - nothing ran → `skipped` for the "never started" reasons, else `failed`
 *
 * @param {ReadonlyArray<object>} [outcomes]
 * @param {string | null} [fallbackReason]
 * @returns {{ status: string, viewports: object[], reason: string | null }}
 */
export function reportOf(outcomes = [], fallbackReason = null) {
  const list = Array.isArray(outcomes) ? outcomes : []
  const viewports = list.map(wireOutcomeOf)
  const captured = viewports.filter((row) => row.ok)
  if (captured.length > 0) {
    const failed = viewports.find((row) => !row.ok)
    return { status: SCREENSHOT_STATUS.CAPTURED, viewports, reason: failed ? failed.reason : null }
  }
  if (viewports.length > 0) {
    return {
      status: SCREENSHOT_STATUS.FAILED,
      viewports,
      reason: viewports[0].reason ?? fallbackReason ?? SCREENSHOT_REASON.CAPTURE_FAILED,
    }
  }
  const reason = fallbackReason ?? null
  return {
    status: SKIPPED_REASONS.includes(reason) ? SCREENSHOT_STATUS.SKIPPED : SCREENSHOT_STATUS.FAILED,
    viewports: [],
    reason,
  }
}

/**
 * @param {object} outcome
 * @returns {{ kind: string, ok: boolean, width: number, height: number, bytes: number, reason: string | null }}
 */
function wireOutcomeOf(outcome) {
  return {
    kind: String(outcome?.kind ?? ''),
    ok: outcome?.ok === true,
    width: Number(outcome?.width ?? 0),
    height: Number(outcome?.height ?? 0),
    bytes: Number(outcome?.bytes ?? 0),
    reason: outcome?.ok === true ? null : (outcome?.reason ?? SCREENSHOT_REASON.CAPTURE_FAILED),
  }
}

/**
 * `true` when the draft carries at least one persisted screenshot.
 *
 * @param {{ status?: string } | null | undefined} report
 * @returns {boolean}
 */
export function isCapturedReport(report) {
  return report?.status === SCREENSHOT_STATUS.CAPTURED
}
