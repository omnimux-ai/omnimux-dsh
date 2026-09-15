/** Host authentication plus exact browser-origin admission. Native authenticated clients have no browser headers. */
export function requestRejection(req, getConnection) {
  try {
    const headers = req.headers || {}
    if (headers['sec-fetch-site'] === 'cross-site' || headers['sec-fetch-site'] === 'same-site') return 403
    const source = headers.origin ?? headers.referer
    if (source !== undefined) {
      if (typeof source !== 'string' || !source || source === 'null') return 403
      const actual = new URL(source)
      const expected = new URL(`${req.socket?.encrypted ? 'https' : 'http'}://${headers.host}`)
      if (!['http:', 'https:'].includes(actual.protocol) || actual.username || actual.password || actual.origin !== expected.origin) return 403
      if (headers.origin !== undefined && (actual.pathname !== '/' || actual.search || actual.hash)) return 403
    } else if (headers['sec-fetch-site'] !== undefined) {
      // Browser writes must carry an origin or referrer; ordinary same-origin GET may omit both.
      if (!['GET', 'HEAD'].includes(req.method)) return 403
    }
  } catch {
    return 403
  }
  try {
    const connection = getConnection?.()
    if (typeof connection?.requestRejection !== 'function') return 503
    const rejection = connection.requestRejection(req)
    return rejection === undefined ? undefined : (Number.isInteger(rejection) && rejection >= 400 && rejection <= 599 ? rejection : 403)
  } catch {
    return 503
  }
}
