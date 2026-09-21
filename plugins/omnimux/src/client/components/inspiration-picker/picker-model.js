/**
 * 灵感库选择器逻辑模型（中枢共享层）。
 * 只走公开 HTTP，禁止 import omnimux-inspiration 客户端。
 */
import { isAlreadyAdded, remainingQuota, toggleSelect } from '../asset-picker/picker-model.js'

export { isAlreadyAdded, remainingQuota, toggleSelect }

/** Tab 第一项必须是「全部」 */
export const INSPIRATION_TABS = Object.freeze([
  { id: 'all', labelKey: 'inspirationPicker.tab.all' },
  { id: 'local', labelKey: 'inspirationPicker.tab.local' },
  { id: 'public', labelKey: 'inspirationPicker.tab.public' },
])

/**
 * Host-rewritten media path for img src.
 * @param {unknown} url
 */
export function hostMediaSrc(url) {
  if (typeof url !== 'string' || url === '') return ''
  if (url.includes('..')) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/omnimux/inspiration/local/media/')) return url
  if (url.startsWith('/omnimux/inspiration/media/')) return url
  if (url.startsWith('/api/inspiration/v1/media/')) {
    return `/omnimux/inspiration/media/${url.slice('/api/inspiration/v1/media/'.length)}`
  }
  return `/omnimux/inspiration/media/${url.replace(/^\/+/, '')}`
}

/**
 * @param {unknown} row
 */
export function pickCoverSrc(row) {
  if (!row || typeof row !== 'object') return ''
  const rec = /** @type {Record<string, unknown>} */ (row)
  return hostMediaSrc(rec.cover_key ?? rec.cover_url ?? rec.cover)
}

/**
 * @param {unknown} row
 */
export function pickVideoSrc(row) {
  if (!row || typeof row !== 'object') return ''
  const rec = /** @type {Record<string, unknown>} */ (row)
  const first = Array.isArray(rec.media_urls)
    ? rec.media_urls.find((url) => typeof url === 'string' && url)
    : (typeof rec.media_url === 'string' ? rec.media_url : '')
  if (!first) return ''
  return hostMediaSrc(first)
}

/**
 * @param {unknown} row
 * @param {boolean} [isLocal]
 */
export function mapInspirationRow(row, isLocal = false) {
  if (!row || typeof row !== 'object') return null
  const rec = /** @type {Record<string, any>} */ (row)
  const id = rec.id == null ? '' : String(rec.id)
  if (!id) return null
  const video = pickVideoSrc(rec)
  const title = String(rec.title || rec.name || id)
  return {
    id,
    title,
    name: title,
    previewUrl: pickCoverSrc(rec) || video,
    kind: video ? 'video' : 'image',
    is_local: Boolean(isLocal || rec.is_local),
    category: String(rec.category || ''),
    platform: String(rec.platform || ''),
    source: rec,
  }
}

function queryString(filters) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value == null || value === '') continue
    query.set(key, String(value))
  }
  const suffix = query.toString()
  return suffix ? `?${suffix}` : ''
}

async function requestJson(path) {
  const response = await fetch(path)
  let json = {}
  try {
    json = await response.json()
  } catch {
    json = {}
  }
  return { ok: response.ok, status: response.status, body: json }
}

/**
 * @param {{ tab?: string, q?: string, category?: string, page?: number, pageSize?: number }} params
 */
export async function defaultFetchInspirations(params = {}) {
  const tab = params.tab || 'all'
  const q = String(params.q || '').trim()
  const category = tab === 'local' ? '' : String(params.category || '').trim()
  const page = Number(params.page) || 1
  const pageSize = Number(params.pageSize) || 24
  const shared = {
    q: q || undefined,
    sort: 'hot',
    page,
    page_size: pageSize,
    projection: 'lean',
  }
  const cloud = { ...shared, category: category || undefined }

  const merge = (items, isLocal) => items.map((row) => mapInspirationRow(row, isLocal)).filter(Boolean)

  if (tab === 'local') {
    const res = await requestJson(`/omnimux/inspiration/local${queryString(shared)}`)
    if (!res.ok) throw new Error(res.body?.error || `HTTP ${res.status}`)
    const items = merge(res.body?.data?.items || [], true)
    return { items, phase: 'ready' }
  }

  if (tab === 'public') {
    const res = await requestJson(`/omnimux/inspiration${queryString(cloud)}`)
    if (res.status === 401) return { items: [], phase: 'need-login' }
    if (!res.ok) throw new Error(res.body?.error || `HTTP ${res.status}`)
    return { items: merge(res.body?.data?.items || [], false), phase: 'ready' }
  }

  const [localRes, cloudRes] = await Promise.all([
    requestJson(`/omnimux/inspiration/local${queryString(shared)}`),
    requestJson(`/omnimux/inspiration${queryString(cloud)}`),
  ])
  if (!localRes.ok) {
    throw new Error(localRes.body?.error || `HTTP ${localRes.status}`)
  }
  if (!cloudRes.ok && cloudRes.status !== 401) {
    throw new Error(cloudRes.body?.error || `HTTP ${cloudRes.status}`)
  }
  const localItems = merge(localRes.body?.data?.items || [], true)
  if (cloudRes.status === 401) {
    return { items: localItems, phase: localItems.length ? 'ready' : 'need-login' }
  }
  const cloudItems = merge(cloudRes.body?.data?.items || [], false)
  const seen = new Set()
  const items = []
  for (const row of [...localItems, ...cloudItems]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    items.push(row)
  }
  return { items, phase: 'ready' }
}

/**
 * @returns {Promise<Array<{ id: string, label: string }>>}
 */
export async function defaultFetchCategories() {
  const res = await requestJson('/omnimux/inspiration/categories')
  if (!res.ok) return []
  const raw = res.body?.data?.items || res.body?.data || res.body?.items || []
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      if (!row) return null
      if (typeof row === 'string') return { id: row, label: row }
      const id = String(row.id || row.value || '')
      if (!id) return null
      return { id, label: String(row.zh || row.name || row.label || id) }
    })
    .filter(Boolean)
}

/**
 * @param {{ occupied: number, selectedCount: number, max?: number, n: number }} state
 */
export function selectedMetaVars(state) {
  const quota = remainingQuota(state)
  return { n: Number(state.n) || 0, m: quota.remaining }
}
