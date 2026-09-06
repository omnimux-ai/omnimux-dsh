import { OmnimuxError } from '../media/errors.js'

/** @typedef {'tiktok_direct' | 'zernio'} SocialProvider */

/** @param {unknown} value @returns {SocialProvider} */
export function requireSocialProvider(value) {
  if (value !== 'tiktok_direct' && value !== 'zernio') {
    throw new OmnimuxError('invalid-provider', 'provider must be tiktok_direct or zernio', { status: 400 })
  }
  return value
}

/** @param {Record<string, unknown>} row @param {SocialProvider} provider */
export function matchesSocialProvider(row, provider) {
  return row.provider === provider && (provider !== 'tiktok_direct' || row.platform === 'tiktok')
}

/** API errors may also arrive in an HTTP 200 envelope. @param {unknown} raw */
export function assertSocialSuccess(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.success === false) {
    const code = ['invalid-provider', 'account-provider-mismatch', 'post-provider-mismatch'].includes(raw.code)
      ? raw.code : 'omnimux-request-failed'
    throw new OmnimuxError(code, String(raw.message || 'social request failed').trim(), {
      status: code === 'invalid-provider' ? 400 : code.endsWith('-mismatch') ? 409 : 502,
    })
  }
  return raw
}
