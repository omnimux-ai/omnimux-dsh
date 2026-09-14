/**
 * Host-side ingest route for renderer-reported page events.
 *
 * The renderer owns no analytics configuration and never talks to Umami
 * directly: it posts to this route, and the Host validates, smooths, and
 * forwards through the same queue that carries tool-call events. A closed
 * path (not `/omnimux/analytics`) keeps the hub's own dashboard prefix
 * untouched — this plugin must not shadow it.
 */

import { MAX_STAGE_ID_LENGTH, MAX_DWELL_MS, parseStageEvent } from './stage-events.js'

/** Exact route path owned by this plugin. */
export const ANALYTICS_INGEST_PATH = '/omnimux-analytics/event'

/** Largest accepted request body (stage events are tiny). */
export const MAX_INGEST_BODY_BYTES = 4 * 1024

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {Record<string, unknown>} body
 */
function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<string | undefined>} raw body, or undefined when too large
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk) => {
      if (tooLarge) return
      size += chunk.length
      if (size > MAX_INGEST_BODY_BYTES) {
        // Stop buffering but keep draining: destroying the socket here would
        // reach the caller as a transport error instead of the 413 answer.
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => { resolve(tooLarge ? undefined : Buffer.concat(chunks).toString('utf8')) })
    req.on('error', reject)
  })
}

/**
 * @param {{
 *   ingest?: (event: { name: string, data: Record<string, unknown> }) => boolean,
 *   log?: { warn?: (...args: unknown[]) => void },
 * }} deps
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createAnalyticsIngestDispatcher(deps) {
  const ingest = typeof deps.ingest === 'function' ? deps.ingest : () => false
  const log = deps.log ?? console

  return async function handleIngest(req, res) {
    const method = (req.method || 'GET').toUpperCase()
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }

    try {
      const raw = await readBody(req)
      if (raw === undefined) {
        sendJson(res, 413, { error: 'body-too-large', maxBytes: MAX_INGEST_BODY_BYTES })
        return
      }

      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        sendJson(res, 400, { error: 'invalid-json' })
        return
      }

      const event = parseStageEvent(parsed)
      if (event === undefined) {
        sendJson(res, 400, {
          error: 'invalid-event',
          allowedNames: ['stage-open', 'stage-close'],
          maxStageIdLength: MAX_STAGE_ID_LENGTH,
          maxDwellMs: MAX_DWELL_MS,
        })
        return
      }

      // Analytics never affects the caller: a dropped event is accepted.
      const queued = ingest(event)
      sendJson(res, 202, { accepted: true, queued })
    } catch (error) {
      log.warn?.(`[omnimux-analytics] ingest failed: ${error instanceof Error ? error.message : String(error)}`)
      sendJson(res, 500, { error: 'internal' })
    }
  }
}

/**
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {(req: any, res: any) => Promise<void>} dispatcher
 * @returns {() => void}
 */
export function registerAnalyticsRoutes(webServer, dispatcher) {
  return webServer.register({
    kind: 'exact',
    path: ANALYTICS_INGEST_PATH,
    handler: dispatcher,
  })
}
