/** Official account rows plus a read-only metadata overlay; never imports hub internals. */
import { readFileSync } from 'node:fs'
import { PublishError } from './publish-error.js'
import { ACCOUNT_SOURCE_MESSAGE, isPublishingAccount } from './account-policy.js'
import { isObject } from './shared/values.js'
/** @typedef {Record<string, unknown> & { id: string, platform: 'tiktok', provider: 'tiktok_direct', status: 'active' | 'expiring' | 'expired' | 'error' }} AccountRow */
const DEFAULT_FS = { readFileSync }
const ACCOUNT_KEYS = Object.freeze([
  'id', 'platform', 'provider', 'display_name', 'username', 'name', 'group', 'status', 'expires_at', 'connected_at',
])
const EXPIRING_WINDOW_MS = 24 * 60 * 60 * 1000

/** @param {unknown} raw */
export function pickAccount(raw) {
  const row = isObject(raw) ? raw : {}
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const key of ACCOUNT_KEYS) {
    const value = row[key]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = value
  }
  if (typeof row.id === 'number') out.id = String(row.id)
  if (typeof row.avatar_url === 'string' && /^https:\/\//i.test(row.avatar_url)) out.avatar_url = row.avatar_url
  return out
}

/** @param {unknown} raw @returns {unknown[] | null} */
function accountList(raw) {
  if (Array.isArray(raw)) return raw
  if (!isObject(raw)) return null
  if (Array.isArray(raw.accounts)) return raw.accounts
  if (Array.isArray(raw.data)) return raw.data
  if (isObject(raw.data)) {
    if (Array.isArray(raw.data.accounts)) return raw.data.accounts
    if (Array.isArray(raw.data.items)) return raw.data.items
  }
  return null
}

/** @param {unknown} raw @returns {unknown[]} */
export function listFromPayload(raw) {
  return accountList(raw) || []
}

/** @param {Record<string, unknown> | null | undefined} row @param {number | Date} [now] @returns {AccountRow['status']} */
export function computeStatus(row, now = Date.now()) {
  const base = now instanceof Date ? now.getTime() : now
  const source = row || {}
  const status = typeof source.status === 'string' ? source.status.trim().toLowerCase() : ''
  if (status !== '') return status === 'active' || status === 'expiring' || status === 'expired' ? status : 'error'
  const expires = typeof source.expires_at === 'string' ? Date.parse(source.expires_at) : NaN
  if (Number.isFinite(expires)) {
    if (expires <= base) return 'expired'
    if (expires <= base + EXPIRING_WINDOW_MS) return 'expiring'
  }
  return 'active'
}

/** @param {Record<string, unknown>} row @param {unknown} meta */
export function mergeMeta(row, meta) {
  if (!isObject(meta)) return { ...row }
  const out = { ...row }
  if (typeof meta.group === 'string' && meta.group !== '') out.group = meta.group
  if (typeof meta.agent_usable === 'boolean') out.agent_usable = meta.agent_usable
  if (typeof meta.last_used_at === 'string' && meta.last_used_at !== '') out.last_used_at = meta.last_used_at
  return out
}

/** @param {Record<string, unknown>} row @returns {{ ok: boolean, reason: string }} */
export function accountAvailability(row) {
  if (!isPublishingAccount(row)) return { ok: false, reason: ACCOUNT_SOURCE_MESSAGE }
  const status = computeStatus(row)
  if (status === 'expired') return { ok: false, reason: 'account token expired' }
  if (status === 'error') return { ok: false, reason: `account status error${typeof row.status === 'string' ? ` (${row.status})` : ''}` }
  if (row.agent_usable === false) return { ok: false, reason: 'agent_usable is false' }
  return { ok: true, reason: '' }
}

/** Resolve current account truth before any mutation or upload.
 * @param {Pick<ReturnType<typeof createAccountSource>, 'list'>} source
 * @param {string[]} ids
 */
export async function requirePublishingAccounts(source, ids) {
  const { accounts, degraded, message } = await source.list()
  if (degraded) throw new PublishError(degraded, message || '无法读取官方授权账号。')
  const selected = []
  for (const id of ids) {
    const row = accounts.find((account) => String(account.id) === String(id))
    if (!isPublishingAccount(row)) throw new PublishError('account-provider-mismatch', ACCOUNT_SOURCE_MESSAGE)
    const available = accountAvailability(row)
    if (!available.ok) throw new PublishError('account-unavailable', available.reason)
    selected.push(row)
  }
  return selected
}

/** @param {{ channel: { listAccounts: () => Promise<unknown> }, overlayPath?: string, fs?: Partial<typeof DEFAULT_FS>, now?: () => number }} deps */
export function createAccountSource(deps) {
  const channel = deps.channel
  const overlayPath = deps.overlayPath || ''
  const fs = { ...DEFAULT_FS, ...(deps.fs ?? {}) }
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now()

  /** Missing/corrupt metadata degrades to site rows. @returns {Record<string, unknown>} */
  function readOverlay() {
    if (!overlayPath) return {}
    try {
      /** @type {unknown} */
      const raw = JSON.parse(fs.readFileSync(overlayPath, 'utf8'))
      return isObject(raw) ? raw : {}
    } catch {
      return {}
    }
  }

  /** @param {unknown} raw @returns {AccountRow[]} */
  function viewFrom(raw) {
    if (isObject(raw) && raw.success === false) throw new PublishError('hub-tool-error', String(raw.message || raw.error || 'account list failed'))
    const items = accountList(raw)
    if (!items) throw new PublishError('hub-tool-error', 'account list response is missing accounts')
    const meta = readOverlay()
    /** @type {AccountRow[]} */
    const accounts = []
    for (const item of items) {
      let row = pickAccount(item)
      if (typeof row.id === 'string' && meta[row.id]) row = mergeMeta(row, meta[row.id])
      if (typeof row.id !== 'string' || row.id === '' || !isPublishingAccount(row)) continue
      accounts.push({ ...row, id: row.id, platform: row.platform, provider: row.provider, status: computeStatus(row, now()) })
    }
    return accounts
  }

  /** @param {{ platform?: string }} [query] @returns {Promise<{ accounts: AccountRow[], degraded?: string, message?: string }>} */
  async function list(query = {}) {
    let raw
    try {
      raw = await channel.listAccounts()
    } catch (error) {
      if (error instanceof PublishError && error.code === 'needs-omnimux') {
        return { accounts: [], degraded: 'needs-omnimux', message: 'OmniMux 未登录：账号列表需要登录态才能读取。请先在 OmniMux 登录或设置 OMNIMUX_ACCESS_TOKEN。' }
      }
      throw error
    }
    let accounts = viewFrom(raw)
    const platform = typeof query.platform === 'string' ? query.platform.trim().toLowerCase() : ''
    if (platform) accounts = accounts.filter((row) => row.platform.toLowerCase() === platform)
    return { accounts }
  }

  /** @param {string} id */
  async function get(id) {
    const { accounts } = await list()
    return accounts.find((row) => String(row.id) === String(id)) || null
  }
  return { list, get, viewFrom, readOverlay }
}
