/**
 * fetch wrapper over the plugin's local HTTP routes. Every call resolves to
 * `{ ok, status, body }`; the UI only renders `body.error` / `body.message`.
 */

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, body: any }>}
 */
export async function assetsRequest(path, opts = {}) {
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
 * Cheap polling state. Pass current revisions to get `unchanged: true`
 * when nothing moved; omit them for a full snapshot.
 * @param {number | undefined} [mrev]
 * @param {number | undefined} [arev]
 */
export function getState(mrev, arev) {
  const query = new URLSearchParams()
  if (Number.isFinite(/** @type {number} */ (mrev))) query.set('lrev', String(mrev))
  if (Number.isFinite(/** @type {number} */ (arev))) query.set('arev', String(arev))
  const suffix = query.toString() ? `?${query}` : ''
  return assetsRequest(`/omnimux/assets/state${suffix}`)
}

/**
 * @param {{ name: string, type?: string, description?: string, tags?: string[], files?: { real_path: string }[] }} body
 */
export function createAsset(body) {
  return assetsRequest('/omnimux/assets/library', { method: 'POST', body })
}

/**
 * @param {string} id
 * @param {{ name?: string, type?: string, description?: string, tags?: string[], files?: { real_path: string }[] }} patch
 */
export function updateAsset(id, patch) {
  return assetsRequest('/omnimux/assets/library/update', { method: 'POST', body: { id, ...patch } })
}

/**
 * Deletes the library record and recycles data/files/<id>/. User originals stay.
 * @param {string} id
 */
export function deleteAsset(id) {
  return assetsRequest('/omnimux/assets/library/delete', { method: 'POST', body: { id } })
}

/**
 * @param {string} path
 * @param {string} name
 */
export function addMapping(path, name) {
  return assetsRequest('/omnimux/assets/mappings', { method: 'POST', body: { path, name } })
}

/**
 * @param {string} id
 * @param {string} name
 */
export function renameMapping(id, name) {
  return assetsRequest('/omnimux/assets/mappings/rename', { method: 'POST', body: { id, name } })
}

/**
 * Only deletes the registry record — real files stay untouched.
 * @param {string} id
 */
export function deleteMapping(id) {
  return assetsRequest('/omnimux/assets/mappings/delete', { method: 'POST', body: { id } })
}

/**
 * Open the OS chooser. Body is `{ path, paths }` — `path` stays for older
 * callers; `paths` is the full multi-select list (empty on cancel).
 * @param {'file' | 'directory'} kind
 */
export function pickPath(kind) {
  return assetsRequest('/omnimux/assets/pick', { method: 'POST', body: { kind } })
}

/**
 * One-layer listing of an asset file/folder ref. Folders are not flattened.
 * @param {string} assetId
 * @param {string} fileId
 * @param {string} [subPath]
 */
export function listAssetFiles(assetId, fileId, subPath = '') {
  const query = new URLSearchParams({ id: assetId, file: fileId })
  if (subPath !== '') query.set('path', subPath)
  return assetsRequest(`/omnimux/assets/library/files?${query}`)
}

/**
 * Read-only image/video preview URL for an asset file or a folder child.
 * @param {string} assetId
 * @param {string} [fileId]
 * @param {string} [subPath]
 */
export function previewUrl(assetId, fileId = '', subPath = '') {
  const query = new URLSearchParams({ id: assetId })
  if (fileId) query.set('file', fileId)
  if (subPath !== '') query.set('path', subPath)
  return `/omnimux/assets/library/preview?${query}`
}

/**
 * @param {string} id
 */
export function rescanMapping(id) {
  return assetsRequest('/omnimux/assets/mappings/rescan', { method: 'POST', body: { id } })
}

/**
 * @param {string} id
 * @param {string} [subPath] relative sub directory for drill-down ('' = root)
 */
export function listFiles(id, subPath = '') {
  const query = new URLSearchParams({ id })
  if (subPath !== '') query.set('path', subPath)
  return assetsRequest(`/omnimux/assets/mappings/files?${query}`)
}

/**
 * @param {string} [type]
 * @param {number | undefined} [arev]
 */
export function listArtifacts(type, arev) {
  const query = new URLSearchParams()
  if (type) query.set('type', type)
  if (Number.isFinite(/** @type {number} */ (arev))) query.set('arev', String(arev))
  const suffix = query.toString() ? `?${query}` : ''
  return assetsRequest(`/omnimux/assets/artifacts${suffix}`)
}

/**
 * @param {string} id
 */
export function artifactDetail(id) {
  return assetsRequest(`/omnimux/assets/artifacts/detail?id=${encodeURIComponent(id)}`)
}

// ---------------------------------------------------------------------------
// cloud assets — a prebuilt static catalog served by the Host
// ---------------------------------------------------------------------------

/** Total control file: categories, sub-categories, and per-scope page counts. */
export function cloudManifest() {
  return assetsRequest('/omnimux/assets/cloud/manifest')
}

/**
 * One page of cloud assets. `scope` is `category` or `category/sub_category`;
 * pages are zero-based and 24 rows each.
 * @param {string} scope
 * @param {number} page
 */
export function cloudPage(scope, page) {
  const safeScope = String(scope).split('/').map(encodeURIComponent).join('/')
  return assetsRequest(`/omnimux/assets/cloud/${safeScope}/page-${String(page).padStart(4, '0')}.json`)
}

/**
 * Catalog-wide search. Only called from the search box, never while paging.
 * @param {{ q: string, category?: string, subCategory?: string, limit?: number, offset?: number }} query
 */
export function cloudSearch(query) {
  const params = new URLSearchParams()
  params.set('q', query.q)
  if (query.category) params.set('category', query.category)
  if (query.subCategory) params.set('sub_category', query.subCategory)
  if (Number.isFinite(query.limit)) params.set('limit', String(query.limit))
  if (Number.isFinite(query.offset)) params.set('offset', String(query.offset))
  return assetsRequest(`/omnimux/assets/cloud/search?${params}`)
}

/**
 * Read-only preview URL for a cloud asset. `which=cover` asks for the thumbnail,
 * `which=media` for the playable original.
 * @param {string} id
 * @param {'media' | 'cover'} [which]
 */
export function cloudMediaUrl(id, which = 'media') {
  const params = new URLSearchParams({ id, which })
  return `/omnimux/assets/cloud/media?${params}`
}

/**
 * Copy one cloud asset into the local library so it appears under the local tab.
 * @param {string} id
 * @param {{ name?: string, type?: string }} [options]
 */
export function cloudSaveToLocal(id, options = {}) {
  return assetsRequest('/omnimux/assets/cloud/save', { method: 'POST', body: { id, ...options } })
}
