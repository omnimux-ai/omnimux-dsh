/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown }} [opts]
 */
export async function inspirationRequest(path, opts = {}) {
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
 * Wrap a Host call so a 401 pops the hub login gate, then replays once.
 * @param {(...args: any[]) => Promise<{ ok: boolean, status: number, body: any }>} fn
 */
export function isQuotaHttpResult(result) {
  if (!result || result.ok) return false
  if (result.status === 402) return true
  const err = result.body && typeof result.body === 'object' ? result.body.error : null
  return err === 'quota-exceeded'
}

export function notifyQuota(result, context) {
  const quota = typeof window !== 'undefined' ? window.__omnimuxQuota : undefined
  if (!quota || typeof quota.notify !== 'function' || !isQuotaHttpResult(result)) return result
  quota.notify({ status: result.status, body: result.body, code: result.body?.error }, context)
  return result
}

export function quotaGuard(fn, context) {
  return (...args) => {
    const quota = typeof window !== 'undefined' ? window.__omnimuxQuota : undefined
    const run = () => Promise.resolve(fn(...args)).then((result) => notifyQuota(result, context))
    if (!quota || typeof quota.ensureQuota !== 'function') return run()
    return Promise.resolve(quota.ensureQuota(context)).then((gate) => {
      if (gate?.ok === false && gate.reason === 'quota') return { ok: false, status: 402, body: { error: 'quota-exceeded' } }
      if (gate?.ok === false) return { ok: false, status: 401, body: { error: 'needs-omnimux' } }
      return run()
    })
  }
}

export function authGuard(fn) {
  return (...args) => {
    const run = async () => {
      const result = await fn(...args)
      if (result.status !== 401) return result
      const gate = typeof window !== 'undefined' ? /** @type {any} */ (window).__omnimuxAuth : undefined
      if (!gate || typeof gate.ensureLogin !== 'function') return result
      return new Promise((resolve, reject) => {
        gate.ensureLogin({
          kind: 'write',
          onSuccess: () => {
            fn(...args).then(resolve, reject)
          },
          onCancel: () => resolve(result),
        })
      })
    }
    return run()
  }
}

/**
 * @param {(api: any) => void} cb
 * @returns {() => void}
 */
export function whenAuthReady(cb) {
  if (typeof window === 'undefined') return () => {}
  let done = false
  const attempt = () => {
    if (done) return
    const api = window.__omnimuxAuth
    if (!api || typeof api.ensureLogin !== 'function') return
    done = true
    clearInterval(timer)
    cb(api)
  }
  const timer = setInterval(attempt, 500)
  attempt()
  return () => {
    done = true
    clearInterval(timer)
  }
}

/**
 * SWR L1 in-memory cache pool (TTL = 2 min)
 */
const CACHE_TTL_MS = 120_000
const memoryCache = new Map()

export function getInspirationCache(key) {
  const entry = memoryCache.get(key)
  if (!entry) return null
  const isStale = Date.now() - entry.at > CACHE_TTL_MS
  return { data: entry.data, isStale }
}

export function setInspirationCache(key, data) {
  memoryCache.set(key, { data, at: Date.now() })
}

export function invalidateInspirationCache() {
  memoryCache.clear()
}

const CLOUD_FILTER_KEYS = [
  'type', 'tag', 'tags', 'q', 'platform', 'is_favorite', 'sort', 'page', 'page_size',
  'country', 'category', 'duration_min', 'duration_max', 'views_min', 'views_max',
  'traffic_type', 'posted_after', 'posted_before',
]

const LOCAL_FILTER_KEYS = [
  'type', 'tag', 'tags', 'q', 'platform', 'is_favorite', 'sort', 'page', 'page_size',
  'country', 'category', 'duration_min', 'duration_max', 'views_min', 'views_max',
  'traffic_type', 'posted_after', 'posted_before',
]

/**
 * @param {{ type?: string, tag?: string, tags?: string, q?: string, is_favorite?: string, sort?: string, page?: number, page_size?: number, country?: string, category?: string, duration_min?: number | string, duration_max?: number | string, views_min?: number | string, views_max?: number | string, traffic_type?: string, posted_after?: string, posted_before?: string }} [filters]
 */
export function listInspirations(filters = {}) {
  const query = new URLSearchParams()
  for (const key of CLOUD_FILTER_KEYS) {
    const value = filters[/** @type {keyof typeof filters} */ (key)]
    if (value == null || value === '') continue
    query.set(key, String(value))
  }
  const suffix = query.toString() ? `?${query}` : ''
  return inspirationRequest(`/omnimux/inspiration${suffix}`)
}

export const listInspirationsGuarded = quotaGuard(authGuard(listInspirations), { capability: 'inspiration' })

/**
 * Local library calls
 * @param {{ type?: string, tag?: string, tags?: string, q?: string, platform?: string, is_favorite?: string, sort?: string, page?: number, page_size?: number, country?: string, category?: string, duration_min?: number | string, duration_max?: number | string, views_min?: number | string, views_max?: number | string, traffic_type?: string, posted_after?: string, posted_before?: string }} [filters]
 */
export function listLocalInspirations(filters = {}) {
  const query = new URLSearchParams()
  for (const key of LOCAL_FILTER_KEYS) {
    const value = filters[/** @type {keyof typeof filters} */ (key)]
    if (value == null || value === '') continue
    query.set(key, String(value))
  }
  const suffix = query.toString() ? `?${query}` : ''
  return inspirationRequest(`/omnimux/inspiration/local${suffix}`)
}

/**
 * Atomic multi-source loader with SWR cache support
 * @param {{ tab: string, q?: string, platform?: string, type?: string, sort?: string, favorite?: string, page?: number, pageSize?: number, country?: string, category?: string, duration_min?: number | string, duration_max?: number | string, views_min?: number | string, views_max?: number | string, traffic_type?: string, posted_after?: string, posted_before?: string }} params
 */
export async function loadInspirationsAtomic(params) {
  const {
    tab = 'all',
    q = '',
    platform = '',
    type = '',
    sort = 'hot',
    favorite = '0',
    page = 1,
    pageSize = 20,
    country = '',
    category = '',
    duration_min = '',
    duration_max = '',
    views_min = '',
    views_max = '',
    traffic_type = '',
    posted_after = '',
    posted_before = '',
  } = params
  const filterArgs = {
    q: q.trim() || undefined,
    platform: platform ? platform.trim() : undefined,
    type: type || undefined,
    sort: sort || undefined,
    is_favorite: favorite === '1' ? '1' : undefined,
    country: country.trim() || undefined,
    category: category.trim() || undefined,
    duration_min: duration_min !== '' && duration_min != null ? duration_min : undefined,
    duration_max: duration_max !== '' && duration_max != null ? duration_max : undefined,
    views_min: views_min !== '' && views_min != null ? views_min : undefined,
    views_max: views_max !== '' && views_max != null ? views_max : undefined,
    traffic_type: traffic_type.trim() || undefined,
    posted_after: posted_after.trim() || undefined,
    posted_before: posted_before.trim() || undefined,
    page,
    page_size: pageSize,
  }

  if (tab === 'local') {
    const res = await listLocalInspirations(filterArgs)
    if (!res.ok) throw new Error(res.body?.error || `HTTP ${res.status}`)
    const items = (res.body?.data?.items || []).map((it) => ({ ...it, is_local: true }))
    const total = Number(res.body?.data?.total) || items.length
    const platforms = res.body?.data?.platforms || []
    return { items, total, hasMore: items.length === pageSize && page * pageSize < total, phase: 'ready', platforms }
  }

  if (tab === 'public') {
    const res = await listInspirationsGuarded(filterArgs)
    if (res.status === 401) return { items: [], total: 0, hasMore: false, phase: 'need-login' }
    if (!res.ok) throw new Error(res.body?.error || `HTTP ${res.status}`)
    const items = (res.body?.data?.items || []).map((it) => ({ ...it, is_local: false }))
    const total = Number(res.body?.data?.total) || items.length
    return { items, total, hasMore: items.length === pageSize && page * pageSize < total, phase: 'ready' }
  }

  // tab === 'all': Fetch both simultaneously and merge atomically
  const [localOutcome, pubOutcome] = await Promise.allSettled([
    listLocalInspirations(filterArgs),
    listInspirationsGuarded(filterArgs),
  ])

  let items = []
  let total = 0
  let needLogin = false
  let platforms = []

  if (localOutcome.status === 'fulfilled' && localOutcome.value.ok) {
    const lItems = (localOutcome.value.body?.data?.items || []).map((it) => ({ ...it, is_local: true }))
    items.push(...lItems)
    total += Number(localOutcome.value.body?.data?.total) || lItems.length
    if (Array.isArray(localOutcome.value.body?.data?.platforms)) {
      platforms = localOutcome.value.body?.data?.platforms
    }
  }

  if (pubOutcome.status === 'fulfilled') {
    const pubRes = pubOutcome.value
    if (pubRes.status === 401) {
      needLogin = true
    } else if (pubRes.ok) {
      const pItems = (pubRes.body?.data?.items || []).map((it) => ({ ...it, is_local: false }))
      items.push(...pItems)
      total += Number(pubRes.body?.data?.total) || pItems.length
    }
  }

  return {
    items,
    total,
    hasMore: items.length >= pageSize,
    phase: needLogin && items.length === 0 ? 'need-login' : 'ready',
    platforms,
  }
}

/**
 * Import and deconstruct URL to local vault
 * @param {{ url: string, tags?: string[], auto_analyze?: boolean }} payload
 */
export function importLocalInspiration(payload) {
  invalidateInspirationCache()
  return inspirationRequest('/omnimux/inspiration/local/import-url', {
    method: 'POST',
    body: payload,
  })
}

/**
 * Trigger or re-run AI deconstruction on an existing local inspiration item
 * @param {string} id
 */
export function triggerAnalyzeInspiration(id) {
  invalidateInspirationCache()
  return quotaGuard(() => inspirationRequest(`/omnimux/inspiration/local/${encodeURIComponent(id)}/analyze`, {
    method: 'POST',
  }), { capability: 'inspiration-analyze' })()
}

export function translateInspiration(id, lang = 'zh') {
  invalidateInspirationCache()
  return quotaGuard(() => inspirationRequest(`/omnimux/inspiration/local/${encodeURIComponent(id)}/translate`, {
    method: 'POST',
    body: { lang },
  }), { capability: 'inspiration-analyze' })()
}

export function patchLocalInspiration(id, patch) {
  invalidateInspirationCache()
  return inspirationRequest(`/omnimux/inspiration/local/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
  })
}

/**
 * Batch delete multiple local inspirations
 * @param {string[]} ids
 */
export function batchDeleteLocalInspirations(ids) {
  invalidateInspirationCache()
  return inspirationRequest('/omnimux/inspiration/local/batch-delete', {
    method: 'POST',
    body: { ids },
  })
}

/**
 * Delete single local inspiration
 * @param {string} id
 */
export function deleteLocalInspiration(id) {
  invalidateInspirationCache()
  return inspirationRequest(`/omnimux/inspiration/local/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/**
 * Get single local inspiration details
 * @param {string} id
 */
export function getLocalInspiration(id) {
  return inspirationRequest(`/omnimux/inspiration/local/${encodeURIComponent(id)}`)
}

export const listTags = quotaGuard(
  () => inspirationRequest('/omnimux/inspiration/tags'),
  { capability: 'inspiration' },
)

/**
 * Host-rewritten media path for <img src>. Absolute http(s) URLs pass through.
 * Bare keys (detail envelope) get the Host media prefix.
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
  return hostMediaSrc(rec.cover_key ?? rec.cover_url)
}

/**
 * Gateway seed covers are 1×1 JPEG stubs. Treat those as empty.
 * @param {number} width
 * @param {number} height
 */
export function isUsableCoverSize(width, height) {
  return Number(width) >= 8 && Number(height) >= 8
}

/**
 * @param {unknown} title
 */
export function coverGlyph(title) {
  const text = typeof title === 'string' ? title.trim() : ''
  return text.slice(0, 1) || '灵'
}

const TIKTOK_VIDEO_RE = /tiktok\.com\/@?[^/]+\/video\/(\d{15,25})/i
const TIKTOK_V_RE = /tiktok\.com\/v\/(\d{15,25})/i
const TIKTOK_PLAYER_RE = /tiktok\.com\/player\/v1\/(\d{15,25})/i

/**
 * Extract TikTok video ID from a URL or raw string.
 * @param {unknown} url
 * @returns {string | null}
 */
export function extractTikTokVideoId(url) {
  if (typeof url !== 'string' || !url.trim()) return null
  const m = url.match(TIKTOK_VIDEO_RE) || url.match(TIKTOK_V_RE) || url.match(TIKTOK_PLAYER_RE)
  if (m && m[1]) return m[1]
  return null
}

/**
 * Construct safe TikTok official embed player URL.
 * @param {unknown} sourceUrlOrId
 * @returns {string | null}
 */
export function resolveTikTokEmbedUrl(sourceUrlOrId) {
  if (!sourceUrlOrId) return null
  const raw = String(sourceUrlOrId).trim()
  const playerMatch = raw.match(/^https?:\/\/(?:www\.)?tiktok\.com\/player\/v1\/(\d{15,25})(?:[/?#].*)?$/i)
  if (playerMatch && playerMatch[1]) {
    return `https://www.tiktok.com/player/v1/${playerMatch[1]}`
  }
  if (/^\d{15,25}$/.test(raw)) {
    return `https://www.tiktok.com/player/v1/${raw}`
  }
  const id = extractTikTokVideoId(raw)
  return id ? `https://www.tiktok.com/player/v1/${id}` : null
}

/**
 * Resolve author homepage URL across platforms.
 * @param {unknown} creator
 * @param {string} [sourceUrl]
 * @param {string} [platform]
 * @returns {string | null}
 */
export function resolveCreatorProfileUrl(creator, sourceUrl = '', platform = '') {
  if (creator && typeof creator === 'object') {
    const rec = /** @type {Record<string, unknown>} */ (creator)
    if (typeof rec.profile_url === 'string' && /^https?:\/\//i.test(rec.profile_url)) {
      return rec.profile_url
    }
    if (typeof rec.url === 'string' && /^https?:\/\//i.test(rec.url)) {
      return rec.url
    }
  }

  const rawHandle = typeof creator === 'string'
    ? creator
    : (typeof creator === 'object' && creator !== null
        ? String(/** @type {Record<string, unknown>} */ (creator).handle || /** @type {Record<string, unknown>} */ (creator).name || '')
        : '')

  let handle = rawHandle.replace(/^@+/, '').trim()
  const sUrl = typeof sourceUrl === 'string' ? sourceUrl : ''
  const plat = typeof platform === 'string' ? platform.toLowerCase() : ''

  if (!handle || handle.toLowerCase() === 'creator' || handle.toLowerCase() === 'social') {
    const m = sUrl.match(/@([^/?#]+)/)
    if (m && m[1]) handle = m[1]
    else return null
  }

  const sUrlLower = sUrl.toLowerCase()
  if (sUrlLower.includes('instagram.com') || plat === 'instagram') {
    return `https://www.instagram.com/${handle}`
  }
  if (sUrlLower.includes('youtube.com') || sUrlLower.includes('youtu.be') || plat === 'youtube') {
    return `https://www.youtube.com/@${handle}`
  }
  if (sUrlLower.includes('twitter.com') || sUrlLower.includes('x.com') || plat === 'twitter' || plat === 'x') {
    return `https://x.com/${handle}`
  }
  return `https://www.tiktok.com/@${handle}`
}
