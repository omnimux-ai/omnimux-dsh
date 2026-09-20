import { shareSourceOf } from './share-status.js'

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
  'traffic_type', 'posted_after', 'posted_before', 'projection',
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
    // Local rows are not tagged with the cloud's free-text categories, so a
    // leftover `digital` selection must not ride onto `/local` (Issue #2497 H1).
    category: tab === 'local' ? undefined : (category.trim() || undefined),
    duration_min: duration_min !== '' && duration_min != null ? duration_min : undefined,
    duration_max: duration_max !== '' && duration_max != null ? duration_max : undefined,
    views_min: views_min !== '' && views_min != null ? views_min : undefined,
    views_max: views_max !== '' && views_max != null ? views_max : undefined,
    traffic_type: traffic_type.trim() || undefined,
    posted_after: posted_after.trim() || undefined,
    posted_before: posted_before.trim() || undefined,
    page,
    page_size: pageSize,
    projection: 'lean',
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
 * Cloud catalogue categories aggregated by the hub (Issue #2497).
 *
 * The hub walks the catalogue and answers `{ data: [{ name, count }] }`;
 * callers degrade to the fixed 全部-only option set on any failure, so this
 * call is intentionally left unguarded — a category list must never pop a
 * login or quota gate over a filter dropdown.
 */
export function listCategories() {
  return inspirationRequest('/omnimux/inspiration/categories')
}

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
 * Playable video source of a row, or `''` when it has none.
 *
 * `media_urls` is the single source of truth for a local record's video: the
 * import pipeline writes the host-relative play path there, and only when a real
 * video file was saved.
 *
 * Three prefixes are legitimate, and each one is passed through verbatim because
 * it is already a URL the Host serves:
 * 1. Absolute `http(s)://…` — a public CDN link stored as-is.
 * 2. `/omnimux/inspiration/local/media/…` — a file this machine downloaded.
 * 3. `/omnimux/inspiration/media/…` — the Host-media form a cloud catalogue row
 *    carries: the hub's social adapter rewrites cloud media onto this prefix, and
 *    `hostMediaSrc` above accepts it. Without this branch a cloud item's video
 *    could never play, and every one of them would fall back to its cover.
 *
 * Form 3 is not a prefix of form 2 (nor the reverse), so neither branch can
 * serve the other's rows; each matches its own exact prefix.
 *
 * `local_paths.video` is deliberately NOT read here. It holds an absolute
 * filesystem path (`/Users/…/videos/video_ab12.mp4`), so running it through
 * `hostMediaSrc` produces a malformed request such as
 * `/omnimux/inspiration/media//Users/…` — the same class of bug as the
 * hand-built `/local/media/<id>/video.mp4` route, which never existed. A value
 * matching none of the three prefixes yields `''`, which the caller renders as a
 * cover instead of a permanently blank player.
 * @param {unknown} row
 * @returns {string}
 */
export function pickVideoSrc(row) {
  if (!row || typeof row !== 'object') return ''
  const rec = /** @type {Record<string, unknown>} */ (row)
  const first = Array.isArray(rec.media_urls)
    ? rec.media_urls.find((url) => typeof url === 'string' && url)
    : ''
  if (!first) return ''
  if (/^https?:\/\//i.test(first)) return first
  if (first.startsWith('/omnimux/inspiration/local/media/')) return first
  if (first.startsWith('/omnimux/inspiration/media/')) return first
  return ''
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

/** The ordinary form of a media address the Host serves on our behalf. */
const HOST_MEDIA_PREFIX = '/omnimux/inspiration/media/'
/**
 * The prefix the cloud's public catalogue serves the *same* bytes under. The hub
 * accepts only this prefix on the publish route — its own guard against a page
 * handing an arbitrary third-party URL to be published — so the address must be
 * handed over in that form, not in the Host's local proxy form.
 */
const CLOUD_PUBLISH_MEDIA_PREFIX = '/api/inspiration/v1/public/media/'

/**
 * A media address in the form the publish route accepts.
 *
 * The catalogue's rows carry the Host's own media paths
 * (`/omnimux/inspiration/media/…`), which is what the page renders; the publish
 * route takes the cloud's public prefix for the same object. Only that one
 * rewrite happens here: an address already in cloud form, or an absolute
 * `http(s)` one, is handed over untouched, and whether the hub will accept it
 * stays the hub's decision.
 *
 * Nothing else is rewritten. A value that is not a usable single path — empty,
 * non-string, or carrying a traversal segment — becomes `''`, which the caller
 * drops rather than publishing a mangled address.
 * @param {unknown} raw
 * @returns {string}
 */
export function publishableMediaAddress(raw) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return ''
  if (value.includes('..')) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith(CLOUD_PUBLISH_MEDIA_PREFIX)) return value
  if (value.startsWith(HOST_MEDIA_PREFIX)) {
    return `${CLOUD_PUBLISH_MEDIA_PREFIX}${value.slice(HOST_MEDIA_PREFIX.length)}`
  }
  return value
}

/**
 * The publish request a row needs, or `undefined` when the Host already holds
 * everything it needs.
 *
 * A local row is the Host's own record: it has the files on disk, so the request
 * carries nothing. A cloud row is not — the Host has never seen it, and the
 * media it must republish is addressed by the cloud, so the page hands over the
 * entry it is showing: the addresses the cloud already serves, and the copy that
 * goes into the share. That is the whole difference between the two publish
 * paths, and it is why a cloud share transfers no media at all.
 *
 * Three spellings of the cloud's media fields are read, because the catalogue
 * answers `cover_key` / `media_keys` while a row that came through a different
 * seam may carry `coverUrl` / `mediaUrls` or the snake_case forms. Missing the
 * catalogue's own spelling is not a cosmetic difference: the addresses would
 * come out empty and the publish would be refused as having no media at all.
 * @param {unknown} row
 * @returns {Record<string, any> | undefined}
 */
export function shareRequestPayload(row) {
  if (!row || typeof row !== 'object') return undefined
  const rec = /** @type {Record<string, any>} */ (row)
  if (shareSourceOf(rec) !== 'cloud') return undefined
  const text = (value) => (typeof value === 'string' ? value.trim() : '')
  const mediaKeys = Array.isArray(rec.media_keys)
    ? rec.media_keys
    : Array.isArray(rec.mediaKeys)
      ? rec.mediaKeys
      : Array.isArray(rec.mediaUrls)
        ? rec.mediaUrls
        : Array.isArray(rec.media_urls)
          ? rec.media_urls
          : []
  const mediaUrls = mediaKeys.map(publishableMediaAddress).filter(Boolean)
  const deconstruction = shareDeconstructionOf(rec)
  return {
    source: 'cloud',
    type: text(rec.type),
    title: text(rec.title),
    caption: text(rec.caption ?? rec.content),
    category: text(rec.category),
    coverUrl: publishableMediaAddress(rec.cover_key ?? rec.coverKey ?? rec.coverUrl ?? rec.cover_url),
    mediaUrls,
    embedUrl: text(rec.embedUrl ?? rec.embed_url),
    sourceUrl: text(rec.sourceUrl ?? rec.source_url),
    ...(deconstruction ? { deconstruction } : {}),
  }
}

/**
 * The breakdown a cloud row carries, in the shape the publish side reads.
 *
 * The catalogue keeps the entry's own account of the footage under `analysis` —
 * `visual_breakdown` is the scene description (framing, light, composition) and
 * `hook_highlight` is the opening hook. Without them the publish side has no
 * breakdown to synthesize from and falls back to the entry's post copy, which
 * describes the post rather than the footage: the share then carries the
 * original caption instead of a same-footage generation prompt.
 *
 * Only the two fields that drive a visual prompt are forwarded. The catalogue's
 * marketing fields (`target_goal`, `narrative_strategy`, `replication_action`)
 * describe the campaign, not the picture, so they are deliberately left out.
 * @param {Record<string, any>} rec
 * @returns {{ visual_breakdown: string, hook: string } | undefined}
 */
export function shareDeconstructionOf(rec) {
  const analysis = rec?.analysis
  const source = analysis && typeof analysis === 'object' ? analysis : null
  const own = rec?.deconstruction && typeof rec.deconstruction === 'object' ? rec.deconstruction : {}
  const read = (value) => (typeof value === 'string' ? value.trim() : '')
  const visualBreakdown = read(source?.visual_breakdown) || read(own.visual_breakdown)
  const hook = read(source?.hook_highlight) || read(source?.hook) || read(own.hook)
  if (!visualBreakdown && !hook) return undefined
  return { visual_breakdown: visualBreakdown, hook }
}

/**
 * Start a publish for an inspiration item.
 *
 * The Host owns the publish (it uploads the assets and calls the cloud, or — for
 * a cloud entry — republishes the addresses the cloud already serves), and it
 * answers 202 with the row while the job runs — the caller then polls the row
 * for the real stages and the link the cloud returned. A failed request comes
 * back as a failure. Nothing here builds a link of its own: a caller that got
 * `ok` is holding what the cloud answered, and a caller that did not has
 * nothing to show.
 * @param {string} id
 * @param {Record<string, any>} [payload] `shareRequestPayload(row)` for a cloud row
 */
export async function createShareLink(id, payload) {
  return inspirationRequest(`/omnimux/inspiration/local/${encodeURIComponent(id)}/share`, {
    method: 'POST',
    body: payload,
  })
}

/**
 * 基于商品生成 10 维结构化关键词雷达
 * @param {object} product
 */
export async function generateRadarKeywordsApi(product) {
  return inspirationRequest('/omnimux/inspiration/local/radar/keywords', {
    method: 'POST',
    body: { product },
  })
}

/**
 * 调用 Jev 决策模型执行毫秒级灵感匹配与深度数据分析
 * @param {{ keywords: string[], product?: object, region?: string, limit?: number }} params
 */
export async function matchRadarInspirationsApi(params) {
  return inspirationRequest('/omnimux/inspiration/local/radar/match', {
    method: 'POST',
    body: params,
  })
}
