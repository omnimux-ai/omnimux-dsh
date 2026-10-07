import { VideoError } from '../errors.js'

/**
 * Map hub / OmnimuxError-like failures onto VideoError codes.
 *
 * A re-mapped code keeps the original one on `upstreamCode`; without it the
 * hub-side cause (unknown-model / omnimux-invalid-request) would only survive
 * as prose in the message and no longer be machine-readable downstream.
 *
 * @param {unknown} error
 * @param {string} [fallbackCode]
 */
export function mapHubError(error, fallbackCode = 'video-analyze-failed') {
  if (error instanceof VideoError) return error
  const code = error && typeof error === 'object' && 'code' in error
    ? String(/** @type {{ code?: unknown }} */ (error).code || '')
    : ''
  const message = error instanceof Error ? error.message : String(error)
  if (code === 'needs-provider' || code === 'needs-omnimux' || code === 'omnimux-unconfigured') {
    const mapped = code === 'omnimux-unconfigured' ? 'needs-omnimux' : code
    return new VideoError(mapped, message, mapped === code ? undefined : { upstreamCode: code })
  }
  if (code === 'omnimux-invalid-request' && /does not accept video input/i.test(message)) {
    return new VideoError('video-understand-unsupported', message, { upstreamCode: code })
  }
  if (code === 'unknown-model' || code === 'omnimux-invalid-request') {
    return new VideoError('video-invalid-input', message, { upstreamCode: code })
  }
  return new VideoError(fallbackCode, message, code && code !== fallbackCode ? { upstreamCode: code } : undefined)
}
