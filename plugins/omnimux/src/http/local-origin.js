/** Local Host write routes only accept same-machine browser calls. */

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

/**
 * @param {{ origin?: string, referer?: string, secFetchSite?: string, host?: string, secure?: boolean }} headers
 * @param {{ rejectSameSite?: boolean }} [options]
 */
export function assertLocalWrite(headers, options = {}) {
  const site = String(headers.secFetchSite || '').toLowerCase()
  if (site === 'cross-site' || (options.rejectSameSite === true && site === 'same-site')) {
    throw new Error('cross-origin write refused')
  }
  const origin = headers.origin || originFromReferer(headers.referer)
  if (!origin) return
  let parsed
  try {
    parsed = new URL(origin)
  } catch {
    throw new Error('cross-origin write refused')
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) throw new Error('cross-origin write refused')
  if (headers.host) {
    let expected
    try {
      expected = new URL(`${headers.secure === true ? 'https' : 'http'}://${headers.host}`).origin
    } catch {
      throw new Error('cross-origin write refused')
    }
    if (parsed.origin !== expected) throw new Error('cross-origin write refused')
  }
}

/**
 * @param {string | undefined} referer
 */
function originFromReferer(referer) {
  if (!referer) return ''
  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

/**
 * @param {{ headers?: Record<string, string | string[] | undefined> } | undefined} req
 */
export function readOriginHeaders(req) {
  const headers = req?.headers ?? {}
  const get = (name) => {
    const value = headers[name] ?? headers[name.toLowerCase()]
    return Array.isArray(value) ? value[0] : value
  }
  return {
    origin: get('origin') || get('Origin') || '',
    referer: get('referer') || get('Referer') || '',
    secFetchSite: get('sec-fetch-site') || get('Sec-Fetch-Site') || '',
  }
}
