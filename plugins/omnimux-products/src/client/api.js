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
export function getProductForEdit(id) {
  return productsRequest(`/omnimux/products/${encodeURIComponent(id)}?view=edit`)
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
 * Cheap client-side check so a bad paste gets an instant message. The server
 * re-validates every link it is asked to fetch.
 * @param {unknown} value
 */
export function isHttpUrl(value) {
  const text = String(value ?? '').trim()
  if (!text) return false
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Read a landing page into a product draft. Writes nothing to the library —
 * the dialog stays the only writer.
 * @param {string} url
 * @param {'physical' | 'digital'} [kind]
 */
export function importFromLink(url, kind) {
  return productsRequest('/omnimux/products/import-from-link', {
    method: 'POST',
    body: kind === 'digital' || kind === 'physical' ? { url, kind } : { url },
  })
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
