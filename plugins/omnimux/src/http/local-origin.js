/** Local Host write routes only accept same-machine browser calls. */

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

/**
 * @param {{ origin?: string, referer?: string, secFetchSite?: string }} headers
 */
export function assertLocalWrite(headers) {
  const site = String(headers.secFetchSite || '').toLowerCase()
  if (site === 'cross-site') throw new Error('cross-origin write refused')
  const origin = headers.origin || originFromReferer(headers.referer)
  if (!origin) return
  let host
  try {
    host = new URL(origin).hostname
  } catch {
    throw new Error('cross-origin write refused')
  }
  if (!LOCAL_HOSTS.has(host)) throw new Error('cross-origin write refused')
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
