/**
 * fetch wrapper over Host `/omnimux/products`. UI uses `{ ok, status, body }`.
 */

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown }} [opts]
 */
export async function productsRequest(path, opts = {}) {
  const response = await fetch(path, {
    method: opts.method ?? 'GET',
    headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  let json = {}
  try {
    json = await response.json()
  } catch {
    json = { error: `HTTP ${String(response.status)}` }
  }
  return { ok: response.ok, status: response.status, body: json }
}

/**
 * @param {number | undefined} [prev]
 */
export function getState(prev) {
  const suffix = Number.isFinite(/** @type {number} */ (prev)) ? `?prev=${String(prev)}` : ''
  return productsRequest(`/omnimux/products/state${suffix}`)
}

/**
 * @param {string} id
 */
export function getProduct(id) {
  return productsRequest(`/omnimux/products/${encodeURIComponent(id)}`)
}

/**
 * @param {Record<string, unknown>} body
 */
export function createProduct(body) {
  return productsRequest('/omnimux/products', { method: 'POST', body })
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} patch
 */
export function updateProduct(id, patch) {
  return productsRequest(`/omnimux/products/${encodeURIComponent(id)}`, { method: 'PUT', body: patch })
}

/**
 * Only deletes the library record — real files stay untouched.
 * @param {string} id
 */
export function deleteProduct(id) {
  return productsRequest(`/omnimux/products/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/**
 * @param {'file' | 'directory'} kind
 */
export function pickPath(kind) {
  return productsRequest('/omnimux/products/pick', { method: 'POST', body: { kind } })
}

/**
 * Optional image preview (read-only stream). Card fallback is the first glyph.
 * @param {string} productId
 * @param {string} mediaId
 */
export function previewUrl(productId, mediaId) {
  const query = new URLSearchParams({ preview: mediaId })
  return `/omnimux/products/${encodeURIComponent(productId)}?${query}`
}
