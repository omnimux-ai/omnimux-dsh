import { relative } from 'node:path'

export const AUTH_TEXT = 'dsh web authentication required; reopen the url printed by dsh web.'
export const iso = value => new Date(typeof value === 'function' ? value() : value).toISOString()
export const isInside = (parent, candidate) => { const rel = relative(parent, candidate); return rel && !rel.startsWith('..') && !rel.includes('/../') }

export function allowedAddress(url, target) {
  let address
  try { address = new URL(url) } catch { return null }
  const port = Number(address.port)
  const local = address.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(address.hostname)
  const targetPort = target === 'dev' ? port === 45120 : target === 'l2' && port >= 44201 && port <= 44299
  if (!local || !targetPort || address.pathname !== '/' || address.username || address.password || address.search || address.hash) return null
  return address
}

export function sameOrigin(actual, expected) {
  const got = new URL(actual); const wanted = new URL(expected)
  return got.origin === wanted.origin && !got.username && !got.password && !got.search && !got.hash
}

export function sameUrl(actual, expected) {
  return sameOrigin(actual, expected) && new URL(actual).pathname === new URL(expected).pathname
}

export async function boundedRead(operation, timeoutMs) {
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => { timer = setTimeout(() => {
        const error = new Error('browser operation timed out')
        error.code = 'OMNIMUX_BROWSER_TIMEOUT'
        reject(error)
      }, timeoutMs) }),
    ])
  } finally { clearTimeout(timer) }
}

export function browserFailure(error) {
  const message = error instanceof Error ? error.message : String(error)
  if (/user is controlling|user-owned|inactive|not assigned|ownership|control lost/i.test(message)) return ['browser-control-lost', 'ego task control is unavailable; explicit user confirmation is required']
  if (error?.code === 'OMNIMUX_BROWSER_TIMEOUT' || error?.name === 'TimeoutError' || /timed?\s*out|timeout/i.test(message)) return ['browser-timeout', 'browser tool timed out']
  if (/policy|not allowed|disallow|refused by|blocked.*url/i.test(message)) return ['browser-policy', 'browser policy rejected the operation']
  return ['browser-transport', 'browser transport failed']
}

export function safeErrorMessage(error, hasValidatedRequest) {
  if (!hasValidatedRequest) return 'Prepared QA request is invalid or stale'
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/(^|\n)(\s*(?:authorization|proxy-authorization|cookie|set-cookie)\s*:)[^\r\n]*/gi, '$1$2 [redacted]')
    .replace(/"(access_token|refresh_token|id_token|token|api_key|secret|signature|cookie|authorization)"\s*:\s*"(?:[^"\\]|\\.)*"/gi, '"$1":"[redacted]"')
    .replace(/\bbearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:token|key|secret|signature|authorization)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\b(cookie|authorization|token|secret|signature)(\s*[:=]\s*)[^\s;,]+/gi, '$1$2[redacted]')
    .replace(/https?:\/\/[^\s]+/gi, value => {
      try { const parsed = new URL(value); return `${parsed.origin}${parsed.pathname}` } catch { return '[redacted-url]' }
    })
}

export async function evaluateCdp(cdp, expression, timeoutMs) {
  const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, { timeoutMs })
  if (response?.exceptionDetails) throw new Error('page evaluation failed')
  return response?.result?.value
}
