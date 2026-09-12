import { classifyChannelFailure } from '../errors/channel-classifier.js'

export class OmnimuxError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {ErrorOptions & { status?: number, details?: unknown, retryable?: boolean }} [options]
   */
  constructor(code, message, options = {}) {
    super(message, options)
    this.name = 'OmnimuxError'
    this.code = code
    if (typeof options.status === 'number') this.status = options.status
    if (options.details !== undefined) this.details = options.details
    // Pure data (#1382): states whether repeating the request could plausibly
    // change the answer. It never retries anything by itself — the poll loop is
    // the only retry authority.
    if (options.retryable !== undefined) this.retryable = options.retryable
  }
}

/**
 * runtime-kit wraps HTTP failures as `ADAPTER_FAILED` and hides the
 * provider message on `error.cause`. Classify the entire envelope before
 * returning it so routing diagnostics cannot reach canvas / tool errors.
 *
 * @param {unknown} error
 * @returns {unknown}
 */
export function unwrapAdapterError(error) {
  const channel = classifyChannelFailure(error)
  if (channel) return new OmnimuxError(channel.code, channel.message)
  if (!error || typeof error !== 'object') return error
  const coded = /** @type {{ code?: unknown, message?: unknown, cause?: unknown }} */ (error)
  if (coded.code !== 'ADAPTER_FAILED') return error
  const detail = collectCauseMessages(coded.cause)
  const base = typeof coded.message === 'string' && coded.message.trim()
    ? coded.message.trim()
    : 'Adapter failed'
  const message = detail && !base.includes(detail) ? `${base}: ${detail}` : base
  if (error instanceof OmnimuxError && error.message === message) return error
  return new OmnimuxError('ADAPTER_FAILED', message, error instanceof Error ? { cause: error } : undefined)
}

/**
 * @param {unknown} cause
 * @returns {string}
 */
function collectCauseMessages(cause) {
  /** @type {string[]} */
  const parts = []
  const seen = new Set()
  let current = cause
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (seen.has(current)) break
    seen.add(current)
    if (current instanceof Error) {
      const text = current.message.trim()
      if (text && !parts.includes(text)) parts.push(text)
      current = current.cause
      continue
    }
    const text = String(current).trim()
    if (text && !parts.includes(text)) parts.push(text)
    break
  }
  return parts.join(': ')
}
