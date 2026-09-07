import { classifyChannelFailure } from './channel-classifier.js'

export const QUOTA_EXCEEDED_CODE = 'quota-exceeded'
export const SAFE_QUOTA_MESSAGE = '当前操作需要更多额度，充值后即可继续使用 OmniMux。'

const QUOTA_PATTERNS = [
  /insufficient[\s_-]+(?:user[\s_-]+)?(?:quota|balance|credits?)/i,
  /(?:quota|usage[\s_-]+limit)[\s_-]+(?:exceeded|exhausted|reached)/i,
  /exceeded[\s_-]+current[\s_-]+quota/i,
  /(?:balance|credits?)[\s_-]+(?:exhausted|depleted)/i,
  /预扣费额度失败/,
]
const AUTH_CODES = new Set(['needs-omnimux'])

function parseJson(value) {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text || (text[0] !== '{' && text[0] !== '[')) return value
  try { return JSON.parse(text) } catch { return value }
}

function walk(value, seen = new Set(), depth = 0) {
  if (depth > 6 || value == null) return []
  value = parseJson(value)
  if (typeof value === 'string') return [value]
  if (typeof value !== 'object') return [String(value)]
  if (seen.has(value)) return []
  seen.add(value)
  const record = /** @type {Record<string, unknown>} */ (value)
  const out = []
  for (const key of ['code', 'error', 'data', 'message', 'detail', 'details', 'cause', 'type']) {
    if (key in record) out.push(...walk(record[key], seen, depth + 1))
  }
  return out
}

export function hasQuotaEvidence(value) {
  const parsed = parseJson(value)
  const inspect = (entry, seen = new Set(), depth = 0) => {
    if (entry == null || depth > 6) return false
    const current = parseJson(entry)
    if (typeof current === 'string') return QUOTA_PATTERNS.some((pattern) => pattern.test(current))
    if (typeof current !== 'object') return false
    if (seen.has(current)) return false
    seen.add(current)
    if (current instanceof Error && QUOTA_PATTERNS.some((pattern) => pattern.test(current.message))) return true
    for (const [key, child] of Object.entries(current)) {
      if ((key === 'code' || key === 'error') && (child === 'QUOTA' || child === 'quota-exceeded' || child === 'insufficient_user_quota')) return true
      if (key !== 'reason' && inspect(child, seen, depth + 1)) return true
    }
    return false
  }
  if (inspect(parsed)) return true
  return walk(parsed).some((part) => QUOTA_PATTERNS.some((pattern) => pattern.test(part)))
}

function safeMessage(value) {
  const parts = walk(value).filter((part) => part && !/(sk-|token|prompt|access_token|api[_ -]?key)/i.test(part))
  return parts.join('; ')
}

function causeStatus(value, seen = new Set(), depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6 || seen.has(value)) return undefined
  seen.add(value)
  return Number(value.status) || causeStatus(value.cause, seen, depth + 1) || causeStatus(value.error, seen, depth + 1)
}

export function classifyQuotaFailure({ status, body, data, error, cause, message, reason, code } = {}) {
  const numericStatus = Number(status) || causeStatus(error) || causeStatus(cause) || undefined
  const combined = { status: numericStatus, body, data, error, cause, message, reason, code }
  const quota = numericStatus === 402 || hasQuotaEvidence(combined)
  const auth = numericStatus === 401
  if (auth) return { kind: 'needs-omnimux', code: 'needs-omnimux', message: '请先登录 OmniMux。', ...(numericStatus ? { status: numericStatus } : {}), retryable: false }
  if (!quota && walk(combined).some((part) => AUTH_CODES.has(part))) return { kind: 'needs-omnimux', code: 'needs-omnimux', message: '请先登录 OmniMux。', ...(numericStatus ? { status: numericStatus } : {}), retryable: false }
  if (quota) return { kind: 'quota-exceeded', code: QUOTA_EXCEEDED_CODE, message: SAFE_QUOTA_MESSAGE, ...(numericStatus ? { status: numericStatus } : {}), retryable: false }
  const channel = classifyChannelFailure(combined)
  if (channel) return { ...channel, ...(numericStatus ? { status: numericStatus } : {}) }
  return { kind: 'other', code: typeof error?.code === 'string' ? error.code : 'omnimux-request-failed', message: safeMessage(message || error) || '请求失败。', ...(numericStatus ? { status: numericStatus } : {}), retryable: false }
}
