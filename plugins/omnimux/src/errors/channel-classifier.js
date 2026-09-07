export const CHANNEL_UNAVAILABLE_CODE = 'CHANNEL_UNAVAILABLE'
export const SAFE_CHANNEL_MESSAGE = '该模型当前不可用，请换一个试试'

const CHANNEL_PATTERNS = [
  /无可用渠道/,
  /可用渠道不存在/,
  /get_channel_failed/i,
  /\(distributor\)/,
  /分组\s+\S+\s+下模型/,
]
const ERROR_FIELDS = ['code', 'error', 'body', 'data', 'message', 'detail', 'details', 'cause', 'type']

/** Inspect only error envelopes; never infer routing failure from HTTP status alone. */
export function hasChannelEvidence(value, seen = new Set(), depth = 0) {
  if (value == null || depth > 8) return false
  if (typeof value === 'string') {
    if (value === CHANNEL_UNAVAILABLE_CODE || CHANNEL_PATTERNS.some((pattern) => pattern.test(value))) return true
    try { return hasChannelEvidence(JSON.parse(value), seen, depth + 1) } catch { return false }
  }
  if (typeof value !== 'object' || seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value)) return value.some((entry) => hasChannelEvidence(entry, seen, depth + 1))
  return ERROR_FIELDS.some((key) => hasChannelEvidence(value[key], seen, depth + 1))
}

/**
 * Classify a gateway routing empty-set without retaining raw provider diagnostics.
 * @param {unknown} failure
 * @returns {{ kind: 'channel-unavailable', code: string, message: string, userMessage: string, retryable: boolean, hideFromPicker: boolean } | null}
 */
export function classifyChannelFailure(failure) {
  if (!hasChannelEvidence(failure)) return null
  return {
    kind: 'channel-unavailable',
    code: CHANNEL_UNAVAILABLE_CODE,
    message: SAFE_CHANNEL_MESSAGE,
    userMessage: SAFE_CHANNEL_MESSAGE,
    retryable: true,
    hideFromPicker: true,
  }
}
