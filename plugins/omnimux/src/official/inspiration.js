/**
 * Inspiration library — official-only PAT lane to OmniMux cloud.
 * Verticals must not import this file; they hit Host `/omnimux/inspiration`.
 */

const API = '/api/inspiration/v1'
const HOST_MEDIA = '/omnimux/inspiration/media/'
const SITE_MEDIA = '/api/inspiration/v1/media/'

const LIST_KEYS = [
  'type', 'tag', 'tags', 'q', 'is_favorite', 'sort', 'page', 'page_size',
  'country', 'category', 'duration_min', 'duration_max', 'views_min', 'views_max',
  'traffic_type', 'posted_after', 'posted_before',
]

/**
 * Rewrite gateway media URLs so the browser loads covers through Host
 * instead of hitting omnimux.ai directly. Tools keep the original JSON.
 * @param {unknown} payload
 */
export function rewriteMediaUrlsForHost(payload) {
  if (payload == null) return payload
  const text = JSON.stringify(payload)
  const rewritten = text
    .split(`"https://omnimux.ai${SITE_MEDIA}`).join(`"${HOST_MEDIA}`)
    .split(`"https://www.omnimux.ai${SITE_MEDIA}`).join(`"${HOST_MEDIA}`)
    .split(`"${SITE_MEDIA}`).join(`"${HOST_MEDIA}`)
  try {
    return JSON.parse(rewritten)
  } catch {
    return payload
  }
}

/**
 * @param {Record<string, unknown>} [query]
 */
export function listQueryString(query = {}) {
  const params = new URLSearchParams()
  for (const key of LIST_KEYS) {
    const value = query[key]
    if (value == null || value === '') continue
    params.set(key, String(value))
  }
  const suffix = params.toString()
  return suffix ? `?${suffix}` : ''
}

/**
 * @param {{ withPat: Function }} client
 * @param {Record<string, unknown>} [query]
 */
export function listInspirations(client, query = {}) {
  return client.withPat(`${API}/inspirations${listQueryString(query)}`)
}

/**
 * @param {{ withPat: Function }} client
 * @param {{ id?: string }} args
 */
export function getInspiration(client, args) {
  const id = encodeURIComponent(String(args.id || ''))
  return client.withPat(`${API}/inspirations/${id}`)
}

/**
 * @param {{ withPat: Function }} client
 * @param {Record<string, unknown>} body
 */
export function createInspiration(client, body) {
  const rest = body && typeof body === 'object' ? { ...body } : {}
  const existing = rest.return_existing
  delete rest.return_existing
  const suffix = existing ? '?return_existing=true' : ''
  return client.withPat(`${API}/inspirations${suffix}`, { method: 'POST', body: rest })
}

/**
 * @param {{ withPat: Function }} client
 * @param {{ id?: string } & Record<string, unknown>} args
 */
export function updateInspiration(client, args) {
  const id = encodeURIComponent(String(args.id || ''))
  const { id: _id, ...body } = args
  return client.withPat(`${API}/inspirations/${id}`, { method: 'PATCH', body })
}

/**
 * @param {{ withPat: Function }} client
 * @param {{ id?: string }} args
 */
export function deleteInspiration(client, args) {
  const id = encodeURIComponent(String(args.id || ''))
  return client.withPat(`${API}/inspirations/${id}`, { method: 'DELETE' })
}

/**
 * @param {{ withPat: Function }} client
 * @param {Record<string, unknown>} body
 */
export function uploadMedia(client, body) {
  return client.withPat(`${API}/media`, { method: 'POST', body })
}

/**
 * @param {{ withPat: Function }} client
 */
export function listTags(client) {
  return client.withPat(`${API}/tags`)
}

/**
 * @param {{ withPat: Function }} client
 */
export function inspirationStatus(client) {
  return client.withPat(`${API}/status`)
}

/**
 * @param {string} pathname
 */
export function mediaKeyFromHostPath(pathname) {
  const prefix = '/omnimux/inspiration/media/'
  if (!pathname.startsWith(prefix)) return ''
  return pathname.slice(prefix.length)
}
