/**
 * Inspiration library — official-only PAT lane to OmniMux cloud.
 * Verticals must not import this file; they hit Host `/omnimux/inspiration`.
 */

const API = '/api/inspiration/v1'
const HOST_MEDIA = '/omnimux/inspiration/media/'
const SITE_MEDIA = '/api/inspiration/v1/media/'
const PUBLISH_API = '/api/inspiration/v1/publish'

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
 * @param {{ withPat: Function }} client
 * @param {{ id?: string, expire?: '3days' | 'forever' }} args
 */
export function createInspirationShare(client, args) {
  const id = encodeURIComponent(String(args.id || ''))
  const expire = args.expire === 'forever' ? 'forever' : '3days'
  return client.withPat(`${API}/inspirations/${id}/share`, {
    method: 'POST',
    body: { expire },
  })
}

/**
 * Publish an inspiration share.
 *
 * Same gateway-key lane as the upload above: the publish route is a site route
 * behind `TokenOrUserAuth`. The server decides the link and its lifetime, so the
 * body carries content only — never an expiry the caller picked.
 * @param {{ withSkSite: Function }} client
 * @param {{
 *   category: string, title: string, prompt: string,
 *   description?: string, model?: string, mediaType?: string,
 *   mediaUrl?: string, coverUrl?: string,
 * }} input
 */
export function publishInspirationShare(client, input) {
  return client.withSkSite(PUBLISH_API, { method: 'POST', body: publishBody(input) })
}

/**
 * Upstream publish body, snake_case, with empty optional fields omitted.
 * @param {Record<string, unknown>} input
 */
export function publishBody(input) {
  const body = {
    category: input.category,
    title: input.title,
    description: input.description,
    prompt: input.prompt,
    model: input.model,
    media_type: input.mediaType,
    media_url: input.mediaUrl,
    cover_url: input.coverUrl,
  }
  for (const [key, value] of Object.entries(body)) {
    if (value == null || value === '') delete body[key]
  }
  return body
}

/**
 * `{ data: … }` or the bare payload, whichever the response carries.
 * @param {unknown} payload
 */
export function responseData(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const row = /** @type {Record<string, any>} */ (payload)
    if (row.data && typeof row.data === 'object' && !Array.isArray(row.data)) return row.data
    return row
  }
  return {}
}

/**
 * Server-owned facts of a published share.
 * @param {unknown} payload
 * @returns {{ shareId: string, shareUrl: string, storageBucket: string, isAdmin: boolean, expiresAt: string, expiresIn: string }}
 */
export function toShareResult(payload) {
  const data = responseData(payload)
  return {
    shareId: typeof data.share_id === 'string' ? data.share_id : '',
    shareUrl: typeof data.share_url === 'string' ? data.share_url : '',
    storageBucket: typeof data.storage_bucket === 'string' ? data.storage_bucket : '',
    isAdmin: data.is_admin === true,
    expiresAt: typeof data.expires_at === 'string' ? data.expires_at : '',
    expiresIn: typeof data.expires_in === 'string' ? data.expires_in : '',
  }
}

/**
 * @param {string} pathname
 */
export function mediaKeyFromHostPath(pathname) {
  const prefix = '/omnimux/inspiration/media/'
  if (!pathname.startsWith(prefix)) return ''
  return pathname.slice(prefix.length)
}
