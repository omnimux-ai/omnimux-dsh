/**
 * Host-side Umami event queue.
 *
 * Umami's collection API takes one event per POST (`/api/send`), so the queue
 * batches events in a small in-memory buffer and flushes them with bounded
 * concurrency. Failures are dropped silently (analytics must never affect the
 * tool pipeline); sampling drops events before they enter the queue.
 *
 * Payload shape follows the deployed Umami collection contract, which is
 * discriminated by exactly one of `website` / `link` / `pixel`:
 * `{ type: 'event', payload: { website, hostname, language, referrer,
 * screen, title, url, name, data } }`.
 *
 * The wire field is `website`; operator-facing config keeps the dashboard's
 * `data-website-id` naming. Sending that attribute name on the wire is
 * rejected with `400 bad-request`, so the instance's own `/script.js` is the
 * authority here — `scripts/contract-probe.mjs` re-checks it live.
 */

/**
 * @typedef {{ name: string, data: Record<string, unknown> }} AnalyticsEvent
 */

/**
 * @param {{
 *   umamiUrl: string,
 *   websiteId: string,
 *   hostname: string,
 *   flushIntervalMs: number,
 *   maxQueue: number,
 *   sampleRate: number,
 *   send?: (request: { url: string, payload: Record<string, unknown> }) => Promise<unknown>,
 *   random?: () => number,
 *   log?: { debug?: (...args: unknown[]) => void },
 * }} options
 * @returns {{
 *   push: (event: AnalyticsEvent) => void,
 *   flush: () => Promise<void>,
 *   dispose: () => void,
 *   stats: { sent: number, dropped: number, failed: number },
 *   pending: () => number,
 * }}
 */
export function createEventQueue(options) {
  const {
    umamiUrl,
    websiteId,
    hostname,
    flushIntervalMs,
    maxQueue,
    sampleRate,
    send = defaultSend,
    random = Math.random,
    log = console,
  } = options

  /** @type {Array<{ url: string, payload: Record<string, unknown> }>} */
  const queue = []
  const stats = { sent: 0, dropped: 0, failed: 0 }
  let timer = null
  let disposed = false

  /**
   * @param {AnalyticsEvent} event
   */
  function buildRequest(event) {
    return {
      url: `${umamiUrl}/api/send`,
      payload: {
        type: 'event',
        payload: {
          website: websiteId,
          hostname,
          language: 'en-US',
          referrer: '',
          screen: '',
          title: hostname,
          url: 'omnimux://plugins',
          name: event.name,
          data: event.data ?? {},
        },
      },
    }
  }

  /**
   * @param {AnalyticsEvent} event
   */
  function push(event) {
    if (disposed) return
    if (sampleRate < 1 && random() >= sampleRate) {
      stats.dropped += 1
      return
    }
    // Drop the oldest event when overflowing instead of losing the newest.
    if (queue.length >= maxQueue) queue.shift()
    queue.push(buildRequest(event))
    if (flushIntervalMs > 0) {
      if (!timer) timer = setTimeout(() => { timer = null; void flush() }, flushIntervalMs)
    } else {
      void flush()
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async function flush() {
    if (disposed) return
    const batch = queue.splice(0, queue.length)
    if (batch.length === 0) return
    const concurrency = 4
    let index = 0
    /* eslint-disable no-await-in-loop */
    const workers = Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
      while (index < batch.length) {
        const request = batch[index]
        index += 1
        try {
          await send(request)
          stats.sent += 1
        } catch {
          stats.failed += 1
        }
      }
    })
    await Promise.all(workers)
    if (batch.length > 0) {
      log.debug?.(`[omnimux-analytics] flushed ${stats.sent} sent, ${stats.failed} failed`)
    }
  }

  /**
   * @returns {void}
   */
  function dispose() {
    disposed = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    push,
    flush,
    dispose,
    stats,
    pending: () => queue.length,
  }
}

/**
 * @param {{ url: string, payload: Record<string, unknown> }} request
 * @returns {Promise<unknown>}
 */
async function defaultSend(request) {
  const signal = typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(8000)
    : undefined
  const response = await fetch(request.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request.payload),
    signal,
  })
  if (!response.ok) {
    throw new Error(`umami /api/send responded ${response.status}`)
  }
  return response
}
