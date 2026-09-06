/**
 * AccountSource: omnimux_accounts_list 工具（站点行）+ 只读
 * `$DSH_HOME/omnimux/accounts.json` overlay（group / agent_usable / last_used_at）
 * 按 hub.md ViewRow 规格自行合并。
 *
 * 这是数据文件耦合（非模块 import，PRD 边界表明示「读写 omnimux-accounts
 * 数据」）。白名单裁剪 / 状态归一 / overlay 合并语义为 hub
 * `official/public-account.js` + `official/account-meta.js` 的等价复刻，
 * 本插件内自实现，不 import hub 模块。
 *
 * 降级语义：
 * - hub 未装（needs-hub）→ 直接抛错（明确指引安装）
 * - 未登录（needs-omnimux）→ { accounts: [], degraded: 'needs-omnimux' }（明确报因）
 *   hub 无账号缓存，站点列表必须登录才能拉（与 PRD §5.6 表述差异已上报）
 * - overlay 缺失/损坏 → 空文档降级（纯站点行）
 */
import { readFileSync } from 'node:fs'
import { PublishError } from './store.js'
import { ACCOUNT_SOURCE_MESSAGE, isPublishingAccount } from './account-policy.js'

const DEFAULT_FS = { readFileSync }

const ACCOUNT_KEYS = Object.freeze([
  'id', 'platform', 'provider', 'display_name', 'username', 'name', 'group', 'status',
  'expires_at', 'connected_at',
])

const STATUS_VALUES = new Set(['active', 'expiring', 'expired', 'error'])
const EXPIRING_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * 站点行白名单裁剪（等价复刻 hub pickAccount，不 import）。
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
  if (typeof avatar === 'string' && /^https:\/\//i.test(avatar)) out.avatar_url = avatar
  return out
}

/**
 * 兼容多种上游信封形状的行数组提取（等价复刻 hub listFromPayload）。
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
 * 状态归一（等价复刻 hub computeStatus）：site status 直通已知值，
 * 未知非空串归 error；无 status 时由 expires_at 推导。
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
 * overlay 合并（等价复刻 hub mergeMeta：只有实际设置的键才覆盖）。
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown> | undefined} meta
 */
export function mergeMeta(row, meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return { ...row }
  const out = { ...row }
  if (typeof meta.group === 'string' && meta.group !== '') out.group = meta.group
  if (typeof meta.agent_usable === 'boolean') out.agent_usable = meta.agent_usable
  if (typeof meta.last_used_at === 'string' && meta.last_used_at !== '') out.last_used_at = meta.last_used_at
  return out
}

/**
 * 账号可用性判定（本插件定）：status ∈ {active, expiring} 且 agent_usable !== false。
 * @param {Record<string, unknown>} row
 * @returns {{ ok: boolean, reason: string }}
 */
export function accountAvailability(row) {
  if (!isPublishingAccount(row)) return { ok: false, reason: ACCOUNT_SOURCE_MESSAGE }
  const status = computeStatus(row)
  if (status === 'expired') return { ok: false, reason: 'account token expired' }
  if (status === 'error') return { ok: false, reason: `account status error${typeof row.status === 'string' ? ` (${row.status})` : ''}` }
  if (row.agent_usable === false) return { ok: false, reason: 'agent_usable is false' }
  return { ok: true, reason: '' }
}

/** Resolve current source truth before any draft/task mutation or media upload.
 * @param {{ list: Function }} source
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

/**
 * @param {{ channel: { listAccounts: Function }, overlayPath?: string, fs?: Partial<typeof DEFAULT_FS>, now?: () => number }} deps
 */
export function createAccountSource(deps) {
  const channel = deps.channel
  const overlayPath = deps.overlayPath || ''
  const fs = { ...DEFAULT_FS, ...(deps.fs ?? {}) }
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now()

  /** 只读 overlay；缺失/损坏 → 空文档（降级为纯站点行）。 */
  function readOverlay() {
    if (!overlayPath) return {}
    try {
      const raw = JSON.parse(fs.readFileSync(overlayPath, 'utf8'))
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return /** @type {Record<string, Record<string, unknown>>} */ (raw)
      }
    } catch {
      // absent or corrupt — empty overlay, degrade to site rows only
    }
    return {}
  }

  /**
   * 站点行 + overlay → ViewRow 合并视图。
   * @param {unknown} raw
   */
  function viewFrom(raw) {
    if (raw?.success === false) throw new PublishError('hub-tool-error', String(raw.message || raw.error || 'account list failed'))
    if (!Array.isArray(raw) && !Array.isArray(raw?.accounts) && !Array.isArray(raw?.data?.accounts) && !Array.isArray(raw?.data) && !Array.isArray(raw?.data?.items)) {
      throw new PublishError('hub-tool-error', 'account list response is missing accounts')
    }
    const meta = readOverlay()
    const accounts = listFromPayload(raw)
      .map((item) => {
        let row = pickAccount(item)
        if (meta && typeof row.id === 'string' && meta[row.id]) row = mergeMeta(row, meta[row.id])
        row.status = computeStatus(row, now())
        return row
      })
      .filter((row) => typeof row.id === 'string' && row.id !== '' && isPublishingAccount(row))
    return accounts
  }

  /**
   * 列账号（UI 账号面板 / publish_list_accounts / submit 校验共用）。
   * @param {{ platform?: string }} [query]
   * @returns {Promise<{ accounts: Record<string, unknown>[], degraded?: string, message?: string }>}
   */
  async function list(query = {}) {
    let raw
    try {
      raw = await channel.listAccounts()
    } catch (error) {
      if (error instanceof PublishError && (error.code === 'needs-omnimux')) {
        return {
          accounts: [],
          degraded: 'needs-omnimux',
          message: 'OmniMux 未登录：账号列表需要登录态才能读取。请先在 OmniMux 登录或设置 OMNIMUX_ACCESS_TOKEN。',
        }
      }
      throw error
    }
    let accounts = viewFrom(raw)
    const platform = typeof query.platform === 'string' ? query.platform.trim().toLowerCase() : ''
    if (platform) {
      accounts = accounts.filter((row) => String(row.platform || '').toLowerCase() === platform)
    }
    return { accounts }
  }

  /**
   * 按 id 取账号行（不存在返回 null；未登录抛 needs-omnimux 语义由调用方处理）。
   * @param {string} id
   */
  async function get(id) {
    const { accounts } = await list()
    return accounts.find((row) => String(row.id) === String(id)) || null
  }

  return { list, get, viewFrom, readOverlay }
}
