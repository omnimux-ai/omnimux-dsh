/**
 * Browser-side HTTP wrapper for the rival-accounts endpoints.
 *
 * Every call goes through the plugin's existing request helper and its guards, so
 * a 401 opens the hub login gate and a 402 raises the quota notice exactly like
 * the rest of the plugin — a second, unguarded call path is how a feature ends up
 * bypassing the quota UI.
 */

import { authGuard, inspirationRequest, quotaGuard } from './api.js'

const PREFIX = '/omnimux/inspiration/local/rival-accounts'

/** @param {string} path @param {{ method?: string, body?: unknown }} [opts] */
function request(path, opts) {
  return inspirationRequest(`${PREFIX}${path}`, opts)
}

/**
 * @template T
 * @param {(...args: any[]) => Promise<{ ok: boolean, status: number, body: any }>} fn
 * @param {string} capability
 */
function guarded(fn, capability) {
  return authGuard(quotaGuard(fn, { capability }))
}

/**
 * Accounts endpoint (E1).
 * @param {{ q?: string, platform?: string, refresh_state?: string }} [filter]
 */
export function fetchRivalAccounts(filter = {}) {
  return guarded(async () => {
    const query = new URLSearchParams()
    for (const key of ['q', 'platform', 'refresh_state']) {
      const value = filter[key]
      if (value == null || value === '') continue
      query.set(key, String(value))
    }
    const suffix = query.toString() ? `?${query}` : ''
    return request(suffix, {})
  }, 'inspiration-rival')()
}

/**
 * Classify a pasted URL before importing it (E3).
 * @param {string} url
 */
export function classifyRivalInput(url) {
  return guarded(
    () => request('/classify', { method: 'POST', body: { url } }),
    'inspiration-rival',
  )()
}

/**
 * Import an account (E2).
 * @param {{ url: string, tags?: string[], force?: boolean }} payload
 */
export function importRivalAccount(payload) {
  return guarded(
    () => request('', { method: 'POST', body: { ...payload, background: true } }),
    'inspiration-rival',
  )()
}

/**
 * Account detail (E4).
 * @param {string} id
 */
export function fetchRivalAccount(id) {
  return guarded(() => request(`/${encodeURIComponent(id)}`), 'inspiration-rival')()
}

/**
 * Patch tags and the refresh interval (E5).
 * @param {string} id
 * @param {{ tags?: string[], refresh_interval_hours?: number }} patch
 */
export function patchRivalAccount(id, patch) {
  return guarded(
    () => request(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),
    'inspiration-rival',
  )()
}

/**
 * Remove an account (E6).
 * @param {string} id
 */
export function removeRivalAccount(id) {
  return guarded(
    () => request(`/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    'inspiration-rival',
  )()
}

/** Refresh one account (E7). */
export function refreshRivalAccount(id) {
  return guarded(
    () => request(`/${encodeURIComponent(id)}/refresh`, { method: 'POST', body: { manual: true } }),
    'inspiration-rival',
  )()
}

/** Refresh every account (E8). */
export function refreshAllRivalAccounts() {
  return guarded(
    () => request('/refresh-all', { method: 'POST', body: { manual: true } }),
    'inspiration-rival',
  )()
}

/** Scheduler status (E9). */
export function fetchRivalStatus() {
  return guarded(() => request('/status'), 'inspiration-rival')()
}

/** Monitor view (E10). */
export function fetchRivalMonitor(id) {
  return guarded(() => request(`/${encodeURIComponent(id)}/monitor`), 'inspiration-rival')()
}

/** Local analysis (E11) — zero cloud calls. */
export function analyzeRivalAccount(id) {
  return guarded(
    () => request(`/${encodeURIComponent(id)}/analyze`, { method: 'POST' }),
    'inspiration-rival',
  )()
}

/**
 * Post list (E12).
 * @param {string} id
 * @param {{ only_potential?: boolean, limit?: number, sort?: string }} [filter]
 */
export function fetchRivalPosts(id, filter = {}) {
  return guarded(async () => {
    const query = new URLSearchParams()
    if (filter.only_potential) query.set('only_potential', '1')
    if (filter.limit) query.set('limit', String(filter.limit))
    if (filter.sort) query.set('sort', String(filter.sort))
    const suffix = query.toString() ? `?${query}` : ''
    return request(`/${encodeURIComponent(id)}/posts${suffix}`)
  }, 'inspiration-rival')()
}

/** Convert one post into the inspiration library (E13). */
export function convertRivalPost(id, postId, opts = {}) {
  return guarded(
    () => request(`/${encodeURIComponent(id)}/posts/${encodeURIComponent(postId)}/to-inspiration`, {
      method: 'POST',
      body: { tags: opts.tags, auto_analyze: opts.auto_analyze !== false },
    }),
    'inspiration-rival',
  )()
}

/**
 * Make sure a post's media file is on disk (E14 is the read side of this).
 * @param {string} id
 * @param {string} postId
 * @param {'cover' | 'video'} kind
 */
export function ensureRivalPostMedia(id, postId, kind = 'cover') {
  return guarded(
    () => request(`/${encodeURIComponent(id)}/posts/${encodeURIComponent(postId)}/media`, {
      method: 'POST',
      body: { kind },
    }),
    'inspiration-rival',
  )()
}

/** Path of the account list, exported so the client store and tests agree. */
export const RIVAL_API_PREFIX = PREFIX
