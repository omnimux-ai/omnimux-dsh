/**
 * Typed domain error for omnimux-clip. Tools MUST throw this class
 * (never return `{ ok: false }` as a successful value).
 *
 * Stable `code` strings are the wire contract — keep them ASCII kebab /
 * SCREAMING_SNAKE as frozen in the clip-studio spec.
 */
export class ClipDomainError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'ClipDomainError'
    this.code = code
  }

  /**
   * @param {string} message
   */
  static needsClipPlugin(message = 'clip plugin is not loaded') {
    return new ClipDomainError('needs-clip-plugin', message)
  }

  /**
   * @param {string} message
   */
  static exportEncodeFailed(message = 'WebCodecs encoder failed') {
    return new ClipDomainError('export-encode-failed', message)
  }

  /**
   * Overlay is not mounted — snapshot / view RPC only.
   * @param {string} message
   */
  static previewNotReady(message = 'clip overlay is not mounted') {
    return new ClipDomainError('PREVIEW_NOT_READY', message)
  }

  /**
   * No UI channel exists in this realm — clip_open only.
   * @param {string} message
   */
  static uiUnavailable(message = 'clip UI channel is unavailable') {
    return new ClipDomainError('ui-unavailable', message)
  }

  /**
   * @param {string} message
   */
  static timelineGap(message = 'timeline has a gap') {
    return new ClipDomainError('timeline_gap', message)
  }

  /**
   * @param {string} message
   */
  static clipOverlap(message = 'clips overlap on the same track') {
    return new ClipDomainError('clip_overlap', message)
  }

  /**
   * @param {string} message
   */
  static mediaMissing(message = 'media file is missing') {
    return new ClipDomainError('media_missing', message)
  }

  /**
   * @param {string} message
   */
  static schemaTooLarge(message = 'event detail exceeds 1MB; persist via projectId') {
    return new ClipDomainError('schema-too-large', message)
  }

  /**
   * @param {string} message
   */
  static canceled(message = 'export canceled') {
    return new ClipDomainError('canceled', message)
  }

  /**
   * @param {string} message
   */
  static pathDenied(message = 'path escapes the clip storage domain') {
    return new ClipDomainError('path-denied', message)
  }

  /**
   * @param {string} message
   */
  static notFound(message = 'project not found') {
    return new ClipDomainError('not-found', message)
  }

  /**
   * @param {string} message
   */
  static invalidJson(message = 'invalid json') {
    return new ClipDomainError('invalid-json', message)
  }

  /**
   * @param {string} message
   */
  static invalidId(message = 'invalid project id') {
    return new ClipDomainError('invalid-id', message)
  }
}

/** HTTP status mapping for ClipDomainError.code. Unknown codes fall back to 400. */
export const CLIP_STATUS_BY_CODE = {
  'needs-clip-plugin': 503,
  'export-encode-failed': 500,
  PREVIEW_NOT_READY: 409,
  'ui-unavailable': 409,
  timeline_gap: 400,
  clip_overlap: 400,
  media_missing: 400,
  'schema-too-large': 413,
  canceled: 499,
  'path-denied': 403,
  'not-found': 404,
  'invalid-json': 400,
  'invalid-id': 400,
}

/**
 * @param {unknown} error
 * @returns {error is ClipDomainError}
 */
export function isClipDomainError(error) {
  return error instanceof ClipDomainError
}

/**
 * @param {unknown} error
 */
export function clipErrorStatus(error) {
  if (error instanceof ClipDomainError) {
    return CLIP_STATUS_BY_CODE[error.code] ?? 400
  }
  return 500
}
