import { createHash } from 'node:crypto'

/**
 * Strips transient noise from arguments (timestamps, requestIds, random nonces).
 *
 * @param {unknown} val
 * @returns {unknown}
 */
export function sanitizeSubstantiveValue(val) {
  if (val === null || val === undefined) return val
  if (typeof val !== 'object') return val
  if (Array.isArray(val)) return val.map(sanitizeSubstantiveValue)

  const cleaned = {}
  const ignoredKeys = new Set([
    'timestamp',
    'time',
    'requestid',
    'traceid',
    'nonce',
    'clienttoken',
    'sessionid',
  ])

  for (const [key, v] of Object.entries(val)) {
    if (ignoredKeys.has(key.toLowerCase())) continue
    cleaned[key] = sanitizeSubstantiveValue(v)
  }
  return cleaned
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']'
  }
  const keys = Object.keys(obj).sort()
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
  return '{' + entries.join(',') + '}'
}

/**
 * Computes deterministic fingerprint for tool name + substantive arguments.
 *
 * @param {string} toolName
 * @param {object} [args]
 * @returns {string}
 */
export function computeCallFingerprint(toolName, args = {}) {
  const normalizedTool = String(toolName || '').trim().toLowerCase()
  const cleanedArgs = sanitizeSubstantiveValue(args)
  const canonicalJson = stableStringify(cleanedArgs)
  const hash = createHash('sha256')
    .update(`${normalizedTool}:${canonicalJson}`)
    .digest('hex')
    .slice(0, 16)
  return `${normalizedTool}#${hash}`
}

/**
 * Creates an in-memory LoopGuard state machine.
 *
 * @param {{ windowSize?: number, maxRepeats?: number }} [options]
 */
export function createLoopGuard(options = {}) {
  const windowSize = options.windowSize || 5
  const maxRepeats = options.maxRepeats || 3

  /** @type {string[]} */
  const history = []

  return {
    /**
     * Checks call against recent history. If tripped, blocks; otherwise registers.
     *
     * @param {string} toolName
     * @param {object} [args]
     * @returns {{ blocked: boolean, code?: string, message?: string, fingerprint?: string }}
     */
    recordAndCheck(toolName, args = {}) {
      const fingerprint = computeCallFingerprint(toolName, args)
      history.push(fingerprint)
      if (history.length > windowSize) {
        history.shift()
      }

      // Count occurrences of this fingerprint within the sliding window
      const count = history.filter((fp) => fp === fingerprint).length
      if (count >= maxRepeats) {
        return {
          blocked: true,
          code: 'LOOP_GUARD_BLOCKED',
          fingerprint,
          message: `LoopGuard blocked repeated identical call to '${toolName}' (${count} times in last ${history.length} calls). Must change parameters, model, or stop to ask user.`,
        }
      }

      return {
        blocked: false,
        fingerprint,
      }
    },

    getHistory() {
      return [...history]
    },

    reset() {
      history.length = 0
    },
  }
}
