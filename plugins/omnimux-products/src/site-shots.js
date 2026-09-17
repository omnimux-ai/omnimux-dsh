/**
 * Capture the desktop and mobile first screens of one landing page.
 *
 * Two viewports, one browser, real overlap: both page targets are attached and
 * navigated under `Promise.allSettled`, so the wall-clock cost is the slower
 * viewport rather than the sum. The PNGs come back as in-memory buffers only —
 * persistence happens later, and only once the draft has proved usable
 * (spec §3).
 *
 * This function never rejects. Every failure — no browser, a launch error, a
 * navigation timeout, an exhausted budget — is converted into a `screenshots`
 * report carrying a reason code, leaving the caller free to answer HTTP 200
 * with the text fields and the brand strategy intact.
 *
 * Spec: `specs/digital-product-website-screenshots.spec.md` §2, §3, §4.
 */
import { launchBrowser, attachPage, defaultSleep, CdpError } from './cdp-client.js'
import { locateBrowser } from './chrome-locator.js'
import {
  NAV_TIMEOUT_MS,
  SCREENSHOT_BUDGET_MS,
  SCREENSHOT_REASON,
  SETTLE_MS,
  VIEWPORT_ORDER,
  VIEWPORTS,
  outcomeOf,
  reportOf,
} from './screenshot-contract.js'
import { normalizeImportUrl } from './link-importer.js'

/**
 * @typedef {{ outcomes: object[], report: { status: string, viewports: object[], reason: string | null } }} CaptureResult
 */

/**
 * @param {{
 *   url: string,
 *   kind?: 'physical' | 'digital',
 *   budgetMs?: number,
 *   navTimeoutMs?: number,
 *   settleMs?: number,
 *   env?: NodeJS.ProcessEnv,
 *   locate?: (env?: NodeJS.ProcessEnv, deps?: object) => string | null,
 *   locateDeps?: object,
 *   launch?: typeof launchBrowser,
 *   attach?: typeof attachPage,
 *   attachOptions?: object,
 *   launchOptions?: object,
 *   sleep?: (ms: number) => Promise<void>,
 *   log?: (message: string) => void,
 * }} [args]
 * @returns {Promise<CaptureResult>} never rejects
 */
export async function captureSiteScreenshots(args = {}) {
  const rawUrl = typeof args.url === 'string' ? args.url.trim() : ''
  const kind = args.kind === 'digital' ? 'digital' : 'physical'

  // L4 — a physical listing never enters this chain at all.
  if (kind !== 'digital') return degraded(SCREENSHOT_REASON.NOT_DIGITAL)

  // Reuse the importer's own SSRF guard: never a second copy of the rule. The
  // guard rejects non-http(s) schemes, embedded credentials and every private
  // host, so no socket is opened for a link that cannot legally be captured.
  let url = rawUrl
  try {
    url = normalizeImportUrl(rawUrl)
  } catch {
    return degraded(SCREENSHOT_REASON.UNSAFE_URL)
  }

  const locate = args.locate ?? locateBrowser
  const launch = args.launch ?? launchBrowser
  const budgetMs = Number.isFinite(args.budgetMs) ? Number(args.budgetMs) : SCREENSHOT_BUDGET_MS
  const navTimeoutMs = Number.isFinite(args.navTimeoutMs) ? Number(args.navTimeoutMs) : NAV_TIMEOUT_MS
  const settleMs = Number.isFinite(args.settleMs) ? Number(args.settleMs) : SETTLE_MS

  /** @type {{ dispose?: () => Promise<void> } | null} */
  let handle = null
  let disposed = false
  // Teardown runs on every exit — success, failure and the budget path alike.
  // A browser that outlives its request is a leaked process, not a fast path.
  const disposeHandle = async () => {
    if (disposed || !handle) return
    disposed = true
    try {
      if (typeof handle.dispose === 'function') await handle.dispose()
    } catch {
      // A cleanup failure never changes the answer the caller already has.
    }
  }

  const work = (async () => {
    const binary = locate(args.env ?? process.env, args.locateDeps ?? {})
    if (!binary) return degraded(SCREENSHOT_REASON.NO_BROWSER)

    try {
      handle = await launch(binary, { budgetMs: args.launchOptions?.budgetMs, ...(args.launchOptions ?? {}) })
    } catch (error) {
      return degraded(reasonOf(error, SCREENSHOT_REASON.LAUNCH_FAILED))
    }

    const attach = args.attach ?? attachPage
    const sleep = args.sleep ?? defaultSleep
    try {
      const settled = await Promise.allSettled(VIEWPORT_ORDER.map((key) => captureViewport(
        handle,
        VIEWPORTS[key],
        { url, navTimeoutMs, settleMs, attach, sleep, attachOptions: args.attachOptions ?? {} },
      )))

      const outcomes = settled.map((row, index) => (row.status === 'fulfilled'
        ? row.value
        : outcomeOf(VIEWPORT_ORDER[index], false, {}, 0, reasonOf(row.reason, SCREENSHOT_REASON.CAPTURE_FAILED))))

      return { outcomes, report: reportOf(outcomes, null) }
    } finally {
      await disposeHandle()
    }
  })()

  return withBudget(work, budgetMs, disposeHandle)
}

/**
 * Detect whether a captured frame looks like an unrendered or blank/solid-color placeholder.
 *
 * Full-viewport PNGs (1440×900 or 780×1688) with actual layout, text, and graphics
 * are typically 25KB~300KB+. When a page has only rendered its dark/blank background
 * layer, Deflate compression collapses it to under 15KB (e.g. 5KB~8KB pure black).
 * Small test fixture buffers (<24 bytes) are ignored to avoid triggering in unit tests.
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function isSuspectedBlankFrame(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return false
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) return false
  try {
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    if (width >= 300 && height >= 300 && buffer.length < 15000) {
      return true
    }
  } catch {
    return false
  }
  return false
}

/**
 * @param {{ webSocketDebuggerUrl?: string, port?: number }} handle
 * @param {{ kind: string, width: number, height: number, deviceScaleFactor: number, isMobile: boolean, hasTouch: boolean }} spec
 * @param {{ url: string, navTimeoutMs: number, settleMs: number, attach: Function, sleep: (ms: number) => Promise<void>, attachOptions: object, retrySettleMs?: number }} opts
 * @returns {Promise<object>}
 */
async function captureViewport(handle, spec, opts) {
  let page = null
  try {
    page = await opts.attach(handle, spec, { timeoutMs: opts.navTimeoutMs, ...opts.attachOptions })
    await page.navigate(opts.url, opts.navTimeoutMs)
    if (opts.settleMs > 0) await opts.sleep(opts.settleMs)
    let buffer = await page.capture()
    if (!buffer || buffer.length === 0) {
      return outcomeOf(spec.kind, false, {}, 0, SCREENSHOT_REASON.CAPTURE_FAILED)
    }

    if (isSuspectedBlankFrame(buffer)) {
      const retryWaitMs = Number.isFinite(opts.retrySettleMs) ? Number(opts.retrySettleMs) : 1000
      if (retryWaitMs > 0 && typeof opts.sleep === 'function') {
        await opts.sleep(retryWaitMs)
        try {
          const retriedBuffer = await page.capture()
          if (retriedBuffer && retriedBuffer.length > buffer.length) {
            buffer = retriedBuffer
          }
        } catch {
          // Fall back to initial buffer if retry fails
        }
      }
    }

    return outcomeOf(spec.kind, true, { width: spec.width, height: spec.height }, buffer.length, null, buffer)
  } catch (error) {
    return outcomeOf(spec.kind, false, {}, 0, reasonOf(error, SCREENSHOT_REASON.NAV_FAILED))
  } finally {
    try {
      if (page && typeof page.close === 'function') await page.close()
    } catch {
      // Teardown failures never change the outcome.
    }
  }
}

/**
 * Race the chain against its hard budget. The browser is killed by the timeout
 * branch even when the chain itself never settles, so a hung process cannot
 * outlive the request.
 *
 * @param {Promise<CaptureResult>} work
 * @param {number} budgetMs
 * @param {() => Promise<void>} onExpire
 * @returns {Promise<CaptureResult>}
 */
async function withBudget(work, budgetMs, onExpire) {
  let timer = null
  const budget = new Promise((resolve) => {
    timer = setTimeout(() => {
      void (async () => {
        try {
          await onExpire()
        } catch {
          // The budget answer stands regardless.
        }
        resolve(degraded(SCREENSHOT_REASON.BUDGET_EXCEEDED))
      })()
    }, budgetMs)
    if (typeof timer.unref === 'function') timer.unref()
  })
  try {
    return await Promise.race([work, budget])
  } catch (error) {
    return degraded(reasonOf(error, SCREENSHOT_REASON.CAPTURE_FAILED))
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {string | null} reason
 * @returns {CaptureResult}
 */
function degraded(reason) {
  return { outcomes: [], report: reportOf([], reason) }
}

/**
 * @param {unknown} error
 * @param {string} fallback
 * @returns {string}
 */
function reasonOf(error, fallback) {
  if (error instanceof CdpError && typeof error.reason === 'string') return error.reason
  const reason = /** @type {{ reason?: unknown }} */ (error)?.reason
  return typeof reason === 'string' && reason ? reason : fallback
}
