import { isPublishingAccount } from '../account-policy.js'
/**
 * TikTok 账号侧栏视图的纯函数逻辑（无 DOM / 无 React，可 node --test 直测）。
 * 数据真源：hub `GET /omnimux/accounts?platform=tiktok`（ViewRow 合并），
 * 行字段：id / platform / display_name / username / name / group / status /
 * avatar_url / agent_usable。
 */

/** 侧栏固定平台（本轮只接 TikTok 官方授权）。 */
export const ACCOUNT_PLATFORM = 'tiktok'

/**
 * 从 hub 响应体取账号行数组；任何非数组形状都归一为 []。
 * @param {unknown} body
 * @returns {Array<Record<string, unknown>>}
 */
export function extractAccounts(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return []
  const rows = /** @type {Record<string, unknown>} */ (body).accounts
  if (!Array.isArray(rows)) return []
  return rows.filter(isPublishingAccount)
}

/**
 * 本地搜索：display_name / username / name 大小写不敏感 substring。
 * 空 query 恒真。
 * @param {Record<string, unknown>} row
 * @param {string} query
 */
export function matchesAccountQuery(row, query) {
  const needle = String(query ?? '').trim().toLowerCase()
  if (needle === '') return true
  const fields = [row?.display_name, row?.username, row?.name]
  return fields.some((value) => String(value ?? '').toLowerCase().includes(needle))
}

/**
 * 搜索过滤全量账号列表。
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} [query]
 * @returns {Array<Record<string, unknown>>}
 */
export function filterAccounts(rows, query = '') {
  const list = Array.isArray(rows) ? rows : []
  return list.filter((row) => isPublishingAccount(row) && matchesAccountQuery(row, query))
}

/**
 * 行显示名：display_name → name → username → id 逐级回退。
 * @param {Record<string, unknown>} row
 */
export function accountDisplayName(row) {
  const candidates = [row?.display_name, row?.name, row?.username, row?.id]
  for (const value of candidates) {
    const text = String(value ?? '').trim()
    if (text !== '') return text
  }
  return ''
}

/**
 * @username 副标题；无 username 时为空串（UI 不渲染）。
 * @param {Record<string, unknown>} row
 */
export function accountHandle(row) {
  const username = String(row?.username ?? '').trim()
  return username === '' ? '' : `@${username}`
}

/**
 * 状态语义色。status 取值由 hub 透传（connected/active/expired/error…），
 * 未识别值归 muted；agent_usable === false 恒为 muted（另行标注）。
 * @param {Record<string, unknown>} row
 * @returns {'success' | 'warn' | 'error' | 'muted'}
 */
export function accountStatusTone(row) {
  const status = String(row?.status ?? '').trim().toLowerCase()
  if (status === 'connected' || status === 'active' || status === 'ok') return 'success'
  if (status === 'expired' || status === 'refreshing' || status === 'pending') return 'warn'
  if (status === 'error' || status === 'failed' || status === 'revoked') return 'error'
  return 'muted'
}

/**
 * connect 响应取值：只接受 https auth_url（与 hub pickConnectView 同源约束，
 * 前端再做一次防御校验）。
 * @param {unknown} body
 * @returns {string} 合法 https URL 或 ''
 */
export function pickAuthUrl(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ''
  const url = /** @type {Record<string, unknown>} */ (body).auth_url
  return typeof url === 'string' && /^https:\/\//i.test(url) ? url : ''
}

/**
 * 登录引导判定：401 / 403 或错误体带 needs-omnimux。
 * @param {{ ok: boolean, status: number, body: unknown }} result
 */
export function isNeedsLogin(result) {
  if (!result || typeof result !== 'object') return false
  if (result.status === 401 || result.status === 403) return true
  const body = result.body
  const code = body && typeof body === 'object' && !Array.isArray(body)
    ? /** @type {Record<string, unknown>} */ (body).error
    : null
  return /needs-omnimux/.test(String(code ?? ''))
}

/**
 * 轮询检测：返回 baseline 之外出现的第一行（新授权账号），无则 null。
 * @param {Set<string>} baselineIds 发起授权时的账号 id 快照
 * @param {Array<Record<string, unknown>>} rows 最新账号行
 * @returns {Record<string, unknown> | null}
 */
export function findNewAccount(baselineIds, rows) {
  const baseline = baselineIds instanceof Set ? baselineIds : new Set()
  const list = Array.isArray(rows) ? rows : []
  for (const row of list) {
    if (!isPublishingAccount(row)) continue
    if (!baseline.has(String(row.id))) return row
  }
  return null
}

/**
 * 账号 id 快照（轮询 baseline）。
 * @param {Array<Record<string, unknown>>} rows
 * @returns {Set<string>}
 */
export function snapshotAccountIds(rows) {
  const list = Array.isArray(rows) ? rows : []
  return new Set(list.map((row) => String(row?.id)))
}
