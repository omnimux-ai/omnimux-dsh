/**
 * Gateway snapshot refresh (P1a).
 *
 * One refresh = fetch the public pricing payload, normalize it, and let the
 * store decide whether to accept it. Three protections, all of which leave the
 * previously accepted snapshot serving:
 *
 *   - an empty or membership-less response never replaces a usable snapshot;
 *   - a response that drops more than half of the currently known models is
 *     refused (a gateway misconfiguration must not wipe every client at once);
 *   - a network/parse failure only marks the stored snapshot stale.
 *
 * A refresh that changes nothing produces no "changed" signal, so callers can
 * forward it to the model-catalog event without spamming consumers.
 */

import { isSnapshotEmpty, normalizePricingPayload } from './snapshot.js'

/** Refuse a refresh when this share of the known models disappeared. */
export const DISAPPEARANCE_LIMIT = 0.5

/** Minimum known models before the disappearance guard applies. */
export const DISAPPEARANCE_MIN_MODELS = 4

/** @param {unknown} value */
function modelIds(snapshot) {
  const models = Array.isArray(snapshot?.models) ? snapshot.models : []
  const ids = new Set()
  for (const model of models) {
    const id = typeof model?.id === 'string' ? model.id.trim() : ''
    if (id) ids.add(id)
  }
  return ids
}

/**
 * How many currently known models the incoming snapshot drops.
 *
 * @param {object|undefined} current
 * @param {object} incoming
 * @returns {{ known: number, missing: number, ratio: number }}
 */
export function disappearance(current, incoming) {
  const before = modelIds(current)
  const after = modelIds(incoming)
  if (before.size === 0) return { known: 0, missing: 0, ratio: 0 }
  let missing = 0
  for (const id of before) if (!after.has(id)) missing += 1
  return { known: before.size, missing, ratio: missing / before.size }
}

/**
 * @param {{
 *   live: { resolve: Function, setMemory: Function, store: object },
 *   url: string,
 *   ttlSeconds: number,
 *   timeoutMs: number,
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 *   onChanged?: (snapshot: object) => void,
 *   origin?: string,
 * }} deps
 */
export function createCatalogRefresher(deps) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch
  const now = deps.now ?? Date.now
  let refresh = 'idle'
  let lastError = null
  let lastFetchedAt = null
  let inFlight

  function due() {
    if (!(deps.ttlSeconds > 0)) return false
    const meta = deps.live.store.read()?.meta
    // The clock is the last *successful* attempt, recorded by `acceptRefresh`
    // (changed) or `markFresh` (unchanged). A failed attempt deliberately does
    // not move it, so the next tick retries instead of waiting out a full TTL.
    const fetchedAt = typeof meta?.fetchedAt === 'string' ? meta.fetchedAt : null
    if (!fetchedAt) return true
    const elapsed = now() - Date.parse(fetchedAt)
    if (!Number.isFinite(elapsed)) return true
    return elapsed >= deps.ttlSeconds * 1000
  }

  function state() {
    // `error` keeps the detail for logs; `errorCode` is the stable, path-free
    // value callers may surface (diagnostics, settings UI).
    const code = typeof lastError === 'string' ? lastError.split(':')[0].trim() : null
    return { refresh, error: lastError, errorCode: lastError ? code : null, fetchedAt: lastFetchedAt, due: due() }
  }

  /**
   * @param {boolean} [force]
   * @returns {Promise<{ status: string, changed: boolean, reason?: string, summary?: object }>}
   */
  async function refreshOnce(force = false) {
    if (inFlight) return inFlight
    if (!force && !due()) return { status: 'skipped', changed: false, reason: 'not-due' }
    if (typeof fetchImpl !== 'function') {
      refresh = 'failed'
      lastError = 'no-fetch'
      return { status: 'failed', changed: false, reason: 'no-fetch' }
    }
    refresh = 'running'
    inFlight = (async () => {
      const fetchedAt = new Date(now()).toISOString()
      let payload
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), deps.timeoutMs)
        try {
          const response = await fetchImpl(deps.url, { signal: controller.signal, headers: { accept: 'application/json' } })
          if (!response || response.ok !== true) {
            throw new Error(`http-${response?.status ?? 'unknown'}`)
          }
          payload = await response.json()
        } finally {
          clearTimeout(timer)
        }
      } catch (error) {
        deps.live.store.markStale('fetch-failed', fetchedAt)
        refresh = 'failed'
        lastError = `fetch-failed: ${String(error?.message ?? error)}`
        lastFetchedAt = fetchedAt
        return { status: 'failed', changed: false, reason: 'fetch-failed' }
      }

      const normalized = normalizePricingPayload(payload, { generatedAt: fetchedAt })
      const snapshot = normalized.snapshot
      if (isSnapshotEmpty(snapshot)) {
        deps.live.store.markStale('empty-response', fetchedAt)
        refresh = 'failed'
        lastError = 'empty-response'
        lastFetchedAt = fetchedAt
        return { status: 'failed', changed: false, reason: 'empty-response', summary: { issues: normalized.issues } }
      }

      const current = deps.live.resolve().snapshot
      const gone = disappearance(current, snapshot)
      if (gone.known >= DISAPPEARANCE_MIN_MODELS && gone.ratio > DISAPPEARANCE_LIMIT) {
        deps.live.store.markStale('disappearance-guard', fetchedAt)
        refresh = 'failed'
        lastError = `disappearance-guard: ${gone.missing}/${gone.known}`
        lastFetchedAt = fetchedAt
        return { status: 'failed', changed: false, reason: 'disappearance-guard', summary: gone }
      }

      const accepted = deps.live.store.acceptRefresh(snapshot, {
        fetchedAt,
        origin: deps.origin ?? null,
        source: snapshot.source,
      })
      lastFetchedAt = fetchedAt
      lastError = null
      refresh = 'idle'
      if (!accepted.accepted) {
        // 'unchanged' is a healthy outcome: nothing to announce, but the
        // attempt time and any stale mark still have to move.
        deps.live.store.markFresh({ fetchedAt })
        return { status: 'ok', changed: false, reason: accepted.reason, digest: accepted.digest }
      }
      deps.live.setMemory(snapshot)
      if (typeof deps.onChanged === 'function') deps.onChanged(snapshot)
      return { status: 'ok', changed: true, digest: accepted.digest, summary: { models: modelIds(snapshot).size } }
    })()
    try {
      return await inFlight
    } finally {
      inFlight = undefined
    }
  }

  return { state, due, refreshOnce, maybeRefresh: () => refreshOnce(false) }
}
