#!/usr/bin/env node
/**
 * Live contract probe for the deployed Umami collection endpoint.
 *
 * The 2026-09 incident this guards against: the reporter was written against a
 * stale field name (`websiteId`), the service rejected every event with
 * `400 bad-request`, and the queue dropped failures silently — so collection
 * was dead for weeks without a single visible error. Unit tests only asserted
 * the literal we were building, so they agreed with the bug.
 *
 * This probe sends the shape the queue actually builds to a NON-EXISTENT site
 * id. The service validates structure before site lookup, so:
 *
 *   - structure accepted  → `400 Website not found.`   → CONTRACT OK
 *   - structure rejected  → discriminator error        → CONTRACT DRIFT
 *
 * No event can be recorded, because the site id does not exist.
 *
 * Usage: node scripts/contract-probe.mjs [umamiUrl]
 */

import { createEventQueue } from '../src/queue.js'

const umamiUrl = (process.argv[2] || process.env.OMNIMUX_ANALYTICS_UMAMI_URL || 'https://analytics.omnimux.ai')
  .replace(/\/+$/u, '')

/** Site id that cannot exist: the service rejects it after schema validation. */
const PROBE_WEBSITE_ID = '00000000-0000-0000-0000-000000000000'

const NOT_FOUND = 'Website not found'
const MISSING_DISCRIMINATOR = 'Exactly one of website, link, or pixel'

/**
 * Build a request through the production queue so the probe can never drift
 * from the real reporter.
 * @param {{ websiteId: string }} options
 * @returns {Promise<{ url: string, payload: Record<string, unknown> }>}
 */
async function buildRequest(options) {
  /** @type {{ url: string, payload: Record<string, unknown> } | undefined} */
  let captured
  const queue = createEventQueue({
    umamiUrl,
    websiteId: options.websiteId,
    hostname: 'omnimux-plugins',
    flushIntervalMs: 0,
    maxQueue: 10,
    sampleRate: 1,
    send: async (request) => { captured = request },
  })
  queue.push({ name: 'contract-probe', data: { probe: true } })
  await queue.flush()
  queue.dispose()
  if (!captured) throw new Error('probe could not capture a queued request')
  return captured
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ status: number, message: string, raw: string }>}
 */
async function post(payload) {
  const response = await fetch(`${umamiUrl}/api/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  })
  const raw = await response.text()
  let message = raw
  try {
    const parsed = JSON.parse(raw)
    message = String(parsed?.error?.message ?? parsed?.error ?? raw)
  } catch {
    // Non-JSON responses keep the raw text.
  }
  // Nested validation detail (why a payload was rejected) only appears in the
  // raw body, so both the summary and the raw text are returned.
  return { status: response.status, message, raw }
}

/**
 * @param {string} label
 * @param {boolean} ok
 * @param {string} detail
 */
function report(label, ok, detail) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label} — ${detail}`)
}

async function main() {
  console.log(`contract probe → ${umamiUrl}/api/send`)

  const current = await buildRequest({ websiteId: PROBE_WEBSITE_ID })
  const probe = await post(current.payload)
  const accepted = probe.status === 400 && probe.raw.includes(NOT_FOUND)
  report('current payload', accepted, `HTTP ${probe.status}: ${probe.message}`)

  // Differential check: the legacy field name must still be rejected, so a
  // regression back to it cannot pass this probe.
  const legacyPayload = { type: 'event', payload: { ...current.payload.payload, websiteId: PROBE_WEBSITE_ID } }
  delete legacyPayload.payload.website
  const legacy = await post(legacyPayload)
  const legacyRejected = legacy.status === 400 && legacy.raw.includes(MISSING_DISCRIMINATOR)
  report('legacy payload rejected', legacyRejected, `HTTP ${legacy.status}: ${legacy.message}`)

  if (!accepted) {
    console.error('\nCONTRACT DRIFT: the deployed instance rejected the payload this plugin sends.')
    console.error('Fix src/queue.js to match the instance (see its own /script.js as authority).')
    return 1
  }
  if (!legacyRejected) {
    console.error('\nCONTRACT UNEXPECTED: the legacy shape was not rejected as expected; the probe needs review.')
    return 1
  }

  console.log('\nCONTRACT OK')
  return 0
}

main().then(
  (code) => { process.exitCode = code },
  (error) => {
    console.error(`CONTRACT PROBE FAILED: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  },
)
