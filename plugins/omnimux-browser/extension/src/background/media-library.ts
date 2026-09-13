/**
 * Local inspiration library for page media captured by the hover capsule.
 *
 * The host's own inspiration library runs inside the DSH Node process and has no
 * write channel reachable from the extension sandbox, so this stores records in
 * `chrome.storage.local` and owns the two rules that keep it bounded:
 * de-duplication by media address, and a newest-first cap with oldest-first
 * eviction.
 *
 * @module
 */

import type { HoveredMedia } from '../content/media-hover/types.ts'

/** Storage key plus cap; mirrors the overlay's `INSPIRATION_STORE` contract. */
export const MEDIA_INSPIRATION_KEY = 'dshMediaInspiration'
export const MEDIA_INSPIRATION_LIMIT = 500

/** One stored record. `savedAt` doubles as the eviction order. */
export interface MediaInspirationRecord extends HoveredMedia {
  savedAt: number
}

/**
 * Answer for one write attempt.
 *
 * `ok` is the only field a caller may trust for the "saved" state: a rejected
 * store still answers (the worker must reply rather than hang), but it answers
 * `ok: false` so the capsule cannot paint a star for media that never landed.
 */
export interface MediaInspirationWriteResult {
  ok: boolean
  total: number
  duplicate: boolean
  evicted: number
  savedAt: number
}

function isRecord(value: unknown): value is MediaInspirationRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.src === 'string'
    && typeof record.id === 'string'
    && typeof record.savedAt === 'number'
}

/**
 * Reads the stored library, dropping entries that no longer match the record
 * shape (a partially written or hand-edited store must not break the feature).
 */
export async function readMediaInspiration(): Promise<MediaInspirationRecord[]> {
  try {
    const stored = await chrome.storage.local.get(MEDIA_INSPIRATION_KEY)
    const raw = stored[MEDIA_INSPIRATION_KEY]
    if (!Array.isArray(raw)) return []
    return raw.filter(isRecord)
  } catch {
    return []
  }
}

/** Builds the stored record from a hover payload. */
export function toInspirationRecord(payload: HoveredMedia, savedAt: number): MediaInspirationRecord {
  return { ...payload, savedAt }
}

/**
 * Merges a payload into the library.
 *
 * De-duplication is by absolute media address, so the same image captured twice
 * from different cards does not occupy two slots. Records are newest-first; the
 * list is trimmed from the tail once the cap is exceeded.
 *
 * @param payload - Normalised hover payload from the content script.
 * @param now - Timestamp override, injectable for tests.
 */
export async function appendMediaInspiration(
  payload: HoveredMedia,
  now: number = Date.now(),
): Promise<MediaInspirationWriteResult> {
  const current = await readMediaInspiration()
  const duplicate = current.some((record) => record.src === payload.src)

  if (duplicate) {
    return { ok: true, total: current.length, duplicate: true, evicted: 0, savedAt: now }
  }

  const next = [toInspirationRecord(payload, now), ...current]
  const evicted = Math.max(0, next.length - MEDIA_INSPIRATION_LIMIT)
  const kept = evicted > 0 ? next.slice(0, MEDIA_INSPIRATION_LIMIT) : next

  try {
    await chrome.storage.local.set({ [MEDIA_INSPIRATION_KEY]: kept })
  } catch {
    // The write never landed, so the record is not in the library. Reporting the
    // old list would let the caller paint a saved state for media the user would
    // not find again; the failure has to survive this boundary.
    return { ok: false, total: current.length, duplicate: false, evicted: 0, savedAt: now }
  }

  return { ok: true, total: kept.length, duplicate: false, evicted, savedAt: now }
}
