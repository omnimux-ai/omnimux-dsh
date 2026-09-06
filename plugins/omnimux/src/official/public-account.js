/** Strip official account payloads down to browser-safe fields. */

import { mergeMeta } from './account-meta.js'

export const ACCOUNT_KEYS = Object.freeze([
  'id', 'platform', 'provider', 'display_name', 'username', 'name', 'group', 'status',
  'expires_at', 'connected_at',
])

/** Statuses the UI knows how to render. Anything else normalizes to error. */
const STATUS_VALUES = new Set(['active', 'expiring', 'expired', 'error'])

/** An expires_at inside this window counts as expiring (D7). */
const EXPIRING_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Normalizes an account status. Site status strings pass through when they
 * already match a known value (unknown non-empty strings become 'error');
 * with no site status, expires_at drives the verdict; with neither the
 * account is active. Pure.
 * @param {Record<string, unknown> | null | undefined} row
 * @param {number | Date} [now]
 * @returns {'active' | 'expiring' | 'expired' | 'error'}
 */
export function computeStatus(row, now = Date.now()) {
  const base = now instanceof Date ? now.getTime() : now
  const source = row && typeof row === 'object' ? row : {}
  const status = typeof source.status === 'string' ? source.status.trim().toLowerCase() : ''
  if (status !== '') return STATUS_VALUES.has(status) ? /** @type {'active' | 'expiring' | 'expired' | 'error'} */ (status) : 'error'
  const expires = typeof source.expires_at === 'string' ? Date.parse(source.expires_at) : NaN
  if (Number.isFinite(expires)) {
    if (expires <= base) return 'expired'
    if (expires <= base + EXPIRING_WINDOW_MS) return 'expiring'
  }
  return 'active'
}

/**
 * @param {unknown} raw
 */
export function pickAccount(raw) {
  const row = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? /** @type {Record<string, unknown>} */ (raw)
    : {}
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const key of ACCOUNT_KEYS) {
    const value = row[key]
    if (value == null) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    }
  }
  if (typeof row.id === 'number') out.id = String(row.id)
  const avatar = row.avatar_url
  if (typeof avatar === 'string' && isAllowedAvatarUrl(avatar, out.id)) out.avatar_url = avatar
  return out
}

/**
 * Same-origin cached avatar path the Host GET-list rewrite emits.
 * Absolute URLs (even with this path) are rejected so `http://evil/...` cannot sneak through.
 * @param {unknown} id
 */
export function localAvatarUrl(id) {
  if (id == null) return ''
  const text = String(id)
  if (text === '') return ''
  return `/omnimux/accounts/${encodeURIComponent(text)}/avatar`
}

/**
 * @param {string} avatar
 * @param {unknown} id
 */
function isAllowedAvatarUrl(avatar, id) {
  if (/^https:\/\//i.test(avatar)) return true
  const expected = localAvatarUrl(id)
  return expected !== '' && avatar === expected
}

/**
 * @param {unknown} raw
 */
export function listFromPayload(raw) {
  if (Array.isArray(raw)) return raw
  if (!raw || typeof raw !== 'object') return []
  const row = /** @type {Record<string, unknown>} */ (raw)
  if (Array.isArray(row.accounts)) return row.accounts
  if (Array.isArray(row.data)) return row.data
  const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data)
    ? /** @type {Record<string, unknown>} */ (row.data)
    : null
  if (data && Array.isArray(data.accounts)) return data.accounts
  if (data && Array.isArray(data.items)) return data.items
  return []
}

/**
 * Builds the browser-safe account view. When `opts.meta` is provided each row
 * is overlay-merged with its local metadata (local group / agent_usable /
 * last_used_at win over site fields) and every row gets a computed status.
 * @param {unknown} raw
 * @param {{ meta?: Record<string, Record<string, unknown>>, now?: number | Date }} [opts]
 */
export function pickAccountsView(raw, opts = {}) {
  const meta = opts.meta && typeof opts.meta === 'object' && !Array.isArray(opts.meta)
    ? /** @type {Record<string, Record<string, unknown>>} */ (opts.meta)
    : null
  const now = opts.now === undefined ? Date.now() : opts.now
  const accounts = listFromPayload(raw)
    .map((item) => {
      let row = pickAccount(item)
      if (meta && typeof row.id === 'string' && meta[row.id]) row = mergeMeta(row, meta[row.id])
      row.status = computeStatus(row, now)
      return row
    })
    .filter((row) => typeof row.id === 'string' && row.id !== '')
  return { accounts }
}

/**
 * @param {unknown} raw
 */
export function pickConnectView(raw) {
  const row = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? /** @type {Record<string, unknown>} */ (raw)
    : {}
  const nested = row.data && typeof row.data === 'object' && !Array.isArray(row.data)
    ? /** @type {Record<string, unknown>} */ (row.data)
    : {}
  const url = [row.auth_url, row.url, nested.auth_url, nested.url].find((value) => typeof value === 'string')
  if (typeof url === 'string' && /^https:\/\//i.test(url)) return { auth_url: url }
  return { auth_url: '' }
}

/**
 * Platform / group filter over already-built view rows.
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ platform?: string, group?: string }} [filters]
 */
export function filterRows(rows, filters = {}) {
  const platform = typeof filters.platform === 'string' ? filters.platform.trim().toLowerCase() : ''
  const group = typeof filters.group === 'string' ? filters.group.trim().toLowerCase() : ''
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (platform && String(row.platform || '').toLowerCase() !== platform) return false
    if (group && String(row.group || '').toLowerCase() !== group) return false
    return true
  })
}

/**
 * @param {unknown} raw
 * @param {{ platform?: string, group?: string }} [filters]
 * @param {{ meta?: Record<string, Record<string, unknown>>, now?: number | Date }} [opts]
 */
export function filterAccounts(raw, filters = {}, opts = {}) {
  const view = pickAccountsView(raw, opts)
  return { accounts: filterRows(view.accounts, filters) }
}
