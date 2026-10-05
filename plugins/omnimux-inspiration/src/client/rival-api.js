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

/**
 * Aggregated feed of every monitored account's works (E15).
 *
 * One request for the whole grid: the tab lists works rather than accounts, and
 * a per-account fan-out would multiply the request count by the number of
 * accounts on every filter change. `accounts: ''` means「every account」and is
 * left out of the URL, so the aggregate and an explicit selection stay
 * distinguishable on the wire.
 * @param {{
 *   accounts?: string,
 *   q?: string,
 *   platform?: string,
 *   sort?: string,
 *   page?: number,
 *   page_size?: number,
 * }} [filter]
 */
export function fetchRivalFeed(filter = {}) {
  return guarded(async () => {
    const query = new URLSearchParams()
    for (const key of ['accounts', 'q', 'platform', 'sort', 'page', 'page_size']) {
      const value = filter[key]
      if (value == null || value === '') continue
      query.set(key, String(value))
    }
    const suffix = query.toString() ? `?${query}` : ''
    return request(`/posts${suffix}`)
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

/**
 * Re-enqueue one account's refresh (E-account-refresh, existing endpoint).
 *
 * Two lines grew this seam independently, so it carries two names: #3112's
 * failure retry calls it as `refreshRivalAccount(id, { manual })` — a
 * re-enqueued first fetch must cost exactly the same budget the import already
 * pays, and the client never collects anything itself — while #3111's「已停止」
 * row calls it as `retryRivalAccount(id)`, where the flag is always manual.
 * Both share this one wire path, so the endpoint and its guard cannot drift
 * apart into two differently-guarded calls.
 * @param {string} id
 * @param {{ manual?: boolean }} [opts]
 */
export function refreshRivalAccount(id, opts = {}) {
  return guarded(
    () => request(`/${encodeURIComponent(id)}/refresh`, {
      method: 'POST',
      body: { manual: opts.manual === true },
    }),
    'inspiration-rival',
  )()
}

/**
 * Manual refresh of one account (E7) — the「已停止」row's「重试」.
 * @param {string} id
 */
export function retryRivalAccount(id) {
  return refreshRivalAccount(id, { manual: true })
}

/**
 * Scheduler snapshot (E9): running jobs, the daily budget ledger and paused
 * reasons. The pool status bar reads「今日剩余刷新额度」from here — the one
 * place the used side of the ledger is already on the wire.
 */
export function fetchRivalStatus() {
  return guarded(() => request('/status', {}), 'inspiration-rival')()
}

/**
 * Manual refresh of every monitored account (E8).
 * The Host answer names what it skipped and why; the caller decides what to
 * show instead of guessing from status codes.
 */
export function refreshAllRivalAccounts() {
  return guarded(
    () => request('/refresh-all', { method: 'POST', body: { manual: true } }),
    'inspiration-rival',
  )()
}

/** Path of the account list, exported so the client store and tests agree. */
export const RIVAL_API_PREFIX = PREFIX
