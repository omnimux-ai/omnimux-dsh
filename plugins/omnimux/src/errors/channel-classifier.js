export const CHANNEL_UNAVAILABLE_CODE = 'CHANNEL_UNAVAILABLE'
export const SAFE_CHANNEL_MESSAGE = '该模型当前不可用，请换一个试试'

const CHANNEL_PATTERNS = [
  /无可用渠道/,
  /可用渠道不存在/,
  /get_channel_failed/i,
  /\(distributor\)/,
  /分组\s+\S+\s+下模型/,
]

/**
 * A routing plan may still succeed on its *next* group when the current group is
 * empty, forbidden for this key, or does not serve the requested model. These
 * wordings never justify blind retries on an unplanned request, so they stay out
 * of `CHANNEL_PATTERNS` and are only consulted by callers that hold a plan.
 */
const GROUP_SWITCH_PATTERNS = [
  ...CHANNEL_PATTERNS,
  /无权访问该分组/,
  /model[_\s-]*not[_\s-]*found/i,
]

const ERROR_FIELDS = ['code', 'error', 'body', 'data', 'message', 'detail', 'details', 'cause', 'type']

/**
 * Walk an error envelope for wording evidence. Never infers routing failure from
 * HTTP status alone.
 * @param {unknown} value
 * @param {RegExp[]} patterns
 * @param {Set<unknown>} [seen]
 * @param {number} [depth]
 * @returns {boolean}
 */
function matchesEvidence(value, patterns, seen = new Set(), depth = 0) {
  if (value == null || depth > 8) return false
  if (typeof value === 'string') {
    if (value === CHANNEL_UNAVAILABLE_CODE || patterns.some((pattern) => pattern.test(value))) return true
    try { return matchesEvidence(JSON.parse(value), patterns, seen, depth + 1) } catch { return false }
  }
  if (typeof value !== 'object' || seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value)) return value.some((entry) => matchesEvidence(entry, patterns, seen, depth + 1))
  return ERROR_FIELDS.some((key) => matchesEvidence(value[key], patterns, seen, depth + 1))
}

/**
 * Inspect only error envelopes for an empty-channel-set failure.
 * @param {unknown} value
 * @returns {boolean}
 */
export function hasChannelEvidence(value) {
  return matchesEvidence(value, CHANNEL_PATTERNS)
}

/**
 * Evidence that another channel group of a routing plan may still serve the
 * request: empty channel set, a group this key cannot access, or a model this
 * group does not serve. Still never inferred from HTTP status alone.
 * @param {unknown} value
 * @returns {boolean}
 */
export function hasGroupFailoverEvidence(value) {
  return matchesEvidence(value, GROUP_SWITCH_PATTERNS)
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
