/**
 * fetch wrapper over the plugin's local HTTP routes. Every call resolves to
 * `{ ok, status, body }`; the UI only renders `body.error` / `body.message`.
 */

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown, timeoutMs?: number }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, body: any }>}
 */
let activeEpoch = null

export async function assetsRequest(path, opts = {}) {
  const capturedEpoch = activeEpoch
  const requestPath = activeEpoch != null && !path.includes('/storage') ? `${path}${path.includes('?') ? '&' : '?'}epoch=${activeEpoch}` : path
  const response = await fetch(requestPath, {
    method: opts.method ?? 'GET',
    ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
    headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  let json = {}
  try {
    json = await response.json()
  } catch {
    json = { error: `HTTP ${String(response.status)}` }
  }
  if (Number.isSafeInteger(json.epoch)) {
    if (activeEpoch != null && json.epoch < activeEpoch) return { ok: false, status: 409, body: { error: 'stale-root', message: 'Stale root response discarded' } }
    if (activeEpoch != null && json.epoch !== activeEpoch && typeof window !== 'undefined') window.dispatchEvent(new Event('omnimux-assets-root-changed'))
    activeEpoch = json.epoch
  } else if (capturedEpoch !== activeEpoch && !path.includes('/storage')) return { ok: false, status: 409, body: { error: 'stale-root' } }
  if (json.error === 'stale-root') activeEpoch = null
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
 * Removes the record; the Host may recycle only verified, unreferenced managed files.
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
export function listAssetFiles(assetId, fileId = '', subPath = '', options = {}) {
  const query = new URLSearchParams({ id: assetId, limit: String(options.limit ?? 100) })
  if (fileId) query.set('file', fileId)
  if (options.logical) query.set('logical', '1')
  if (options.cursor) query.set('cursor', options.cursor)
  if (subPath !== '') query.set('path', subPath)
  return assetsRequest(`/omnimux/assets/library/files?${query}`, { timeoutMs: 15000 })
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
  if (activeEpoch != null) query.set('epoch', String(activeEpoch))
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
