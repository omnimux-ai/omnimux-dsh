/** Typed domain error carrying the existing HTTP/tool wire error code. */
export class PublishError extends Error {
  /** @param {string} code @param {string | Record<string, unknown>} message */
  constructor(code, message) {
    super(typeof message === 'string' ? message : JSON.stringify(message))
    this.name = 'PublishError'
    this.code = code
    if (typeof message !== 'string') this.details = message
  }
}
