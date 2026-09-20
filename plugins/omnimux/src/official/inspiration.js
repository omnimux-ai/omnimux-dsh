/**
 * Inspiration library — official-only PAT lane to OmniMux cloud.
 * Verticals must not import this file; they hit Host `/omnimux/inspiration`.
 */

const API = '/api/inspiration/v1'
const HOST_MEDIA = '/omnimux/inspiration/media/'
const SITE_MEDIA = '/api/inspiration/v1/media/'
const PUBLISH_API = '/api/inspiration/v1/publish'
const SHARE_API = '/api/inspiration/v1/share'

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

/** Category aggregation pulls the catalogue in pages of this size. */
const CATEGORY_PAGE_SIZE = 100
/** Pages fetched in parallel while aggregating categories. */
const CATEGORY_CONCURRENCY = 5
/** Aggregated categories are served from memory for this long (SWR). */
const CATEGORY_CACHE_TTL_MS = 10 * 60 * 1000
/**
 * Hard cap on catalogue pages walked for one aggregate.
 * `page_size=100` × 50 ≈ 5000 rows; a poisoned `total` must not schedule more.
 */
export const CATEGORY_MAX_PAGES = 50
/**
 * Whole-walk deadline. A timeout fails the walk so the route can
 * stale-while-revalidate degrade to `200 { data: [] }`.
 */
export const CATEGORY_TIMEOUT_MS = 15_000

/**
 * Run `worker` over every item with at most `limit` calls in flight.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(lanes)
  return results
}

/**
 * Trimmed category of a catalogue row; `''` when it carries none. Empty and
 * missing categories are dropped from the aggregate: an unnamed bucket is
 * useless as a dropdown option, and the dropdown's 全部 entry already covers
 * the unfiltered view.
 * @param {unknown} item
 */
function categoryNameOf(item) {
  if (!item || typeof item !== 'object') return ''
  const name = /** @type {Record<string, unknown>} */ (item).category
  return typeof name === 'string' ? name.trim() : ''
}

/** @param {Map<string, number>} counts */
function sortedCategoryRows(counts) {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/**
 * Settle `work` or reject when `timeoutMs` elapses. The loser is ignored so a
 * late walk rejection cannot surface as unhandled; in-flight `withPat` calls
 * are not aborted (the official client has no AbortController).
 * @param {Promise<T>} work
 * @param {number} timeoutMs
 * @param {string} message
 * @returns {Promise<T>}
 * @template T
 */
function withDeadline(work, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message))
    }, timeoutMs)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Page through the cloud catalogue and aggregate its `category` field into
 * `{ name, count }` rows, sorted by count desc (name asc on ties).
 *
 * The cloud has no category aggregation endpoint, so this walks the list with
 * `page_size=100` and `concurrency` pages in flight. Bounds:
 * - at most `maxPages` (default 50);
 * - a page shorter than `pageSize` ends the walk;
 * - a `timeoutMs` (default 15s) deadline fails the whole walk so callers can
 *   SWR-degrade;
 * - only a page-1 failure fails the walk; later pages are skipped.
 *
 * Callers wrap this in a cache; it is too heavy to run per request.
 * @param {{ withPat: Function }} client
 * @param {{ pageSize?: number, concurrency?: number, maxPages?: number, timeoutMs?: number }} [opts]
 * @returns {Promise<Array<{ name: string, count: number }>>}
 */
export async function collectCategoryCounts(client, opts = {}) {
  const pageSize = Math.max(1, Number(opts.pageSize) || CATEGORY_PAGE_SIZE)
  const concurrency = Math.max(1, Number(opts.concurrency) || CATEGORY_CONCURRENCY)
  const maxPages = Math.max(1, Number(opts.maxPages) || CATEGORY_MAX_PAGES)
  const timeoutMs = Math.max(1, Number(opts.timeoutMs) || CATEGORY_TIMEOUT_MS)

  const walk = async () => {
    /** @type {Map<string, number>} */
    const counts = new Map()
    const absorb = (payload) => {
      const items = responseData(payload).items
      if (!Array.isArray(items)) return 0
      for (const item of items) {
        const name = categoryNameOf(item)
        if (name) counts.set(name, (counts.get(name) || 0) + 1)
      }
      return items.length
    }

    const first = await client.withPat(`${API}/inspirations?page=1&page_size=${pageSize}`)
    const firstCount = absorb(first)
    if (firstCount < pageSize) return sortedCategoryRows(counts)

    const rawTotal = Number(responseData(first).total)
    const hasTotal = Number.isFinite(rawTotal) && rawTotal >= 0
    const pageCount = Math.min(
      maxPages,
      hasTotal ? Math.max(1, Math.ceil(rawTotal / pageSize)) : maxPages,
    )
    if (pageCount <= 1) return sortedCategoryRows(counts)

    // Walk remaining pages in concurrent batches. A short page ends the
    // walk after the current batch so later batches are never scheduled.
    for (let page = 2; page <= pageCount; ) {
      const batch = []
      while (batch.length < concurrency && page <= pageCount) {
        batch.push(page)
        page += 1
      }
      let short = false
      await mapWithConcurrency(batch, concurrency, async (target) => {
        try {
          const count = absorb(await client.withPat(`${API}/inspirations?page=${target}&page_size=${pageSize}`))
          if (count < pageSize) short = true
        } catch {
          // Later pages are best-effort: one failed page must not wipe page 1.
        }
      })
      if (short) break
    }
    return sortedCategoryRows(counts)
  }

  return withDeadline(walk(), timeoutMs, 'category aggregation timed out')
}

/**
 * In-memory SWR cache for the aggregated categories.
 *
 * `read()` reports whether the held value is stale; `refresh(loader)` dedupes
 * concurrent reloads onto one in-flight promise and only replaces the entry on
 * success, so a failed reload never destroys a usable stale value.
 * @param {{ ttlMs?: number, now?: () => number }} [opts]
 */
export function createCategoryCache(opts = {}) {
  const ttlMs = Math.max(0, Number(opts.ttlMs) || CATEGORY_CACHE_TTL_MS)
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now()
  /** @type {{ data: Array<{ name: string, count: number }>, at: number } | null} */
  let entry = null
  /** @type {Promise<Array<{ name: string, count: number }>> | null} */
  let inflight = null
  return {
    /**
     * The held value, or null when never loaded.
     * @returns {{ data: Array<{ name: string, count: number }>, stale: boolean } | null}
     */
    read() {
      if (!entry) return null
      return { data: entry.data, stale: now() - entry.at > ttlMs }
    },
    /**
     * Load (or reload) the aggregate, sharing one in-flight attempt.
     * @param {() => Promise<Array<{ name: string, count: number }>>} loader
     */
    refresh(loader) {
      if (!inflight) {
        inflight = Promise.resolve()
          .then(loader)
          .then((data) => {
            entry = { data, at: now() }
            return data
          })
          .finally(() => {
            inflight = null
          })
      }
      return inflight
    },
  }
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
 * Post to the unified inspiration share entry (`POST /api/inspiration/v1/share`).
 *
 * Supports both:
 * - cloud source: `{ source: 'cloud', id: '...' }` (zero uploads, permanent)
 * - local source: `{ source: 'local', category, title, prompt, media_url, cover_url, expire }`
 * @param {{ withSkSite: Function }} client
 * @param {Record<string, unknown>} input
 */
export function postInspirationShare(client, input) {
  return client.withSkSite(SHARE_API, { method: 'POST', body: shareBody(input) })
}

/**
 * Publish an inspiration share (compatibility alias using /publish).
 * @param {{ withSkSite: Function }} client
 * @param {Record<string, unknown>} input
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
    media_type: input.mediaType ?? input.media_type,
    media_url: input.mediaUrl ?? input.media_url,
    cover_url: input.coverUrl ?? input.cover_url,
    expire: input.expire,
  }
  for (const [key, value] of Object.entries(body)) {
    if (value == null || value === '') delete body[key]
  }
  return body
}

/**
 * Unified inspiration share body, snake_case, with empty optional fields omitted.
 * @param {Record<string, unknown>} input
 */
export function shareBody(input) {
  const body = {
    source: input.source,
    id: input.id ?? input.inspirationId ?? input.inspiration_id,
    inspiration_id: input.inspirationId ?? input.inspiration_id,
    category: input.category,
    title: input.title,
    description: input.description,
    prompt: input.prompt,
    model: input.model,
    media_type: input.mediaType ?? input.media_type,
    media_url: input.mediaUrl ?? input.media_url,
    cover_url: input.coverUrl ?? input.cover_url,
    expire: input.expire,
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
 * @returns {{ shareId: string, shareUrl: string, storageBucket: string, isAdmin: boolean, expiresAt: string, expiresIn: string, source?: string, permanent?: boolean }}
 */
export function toShareResult(payload) {
  const data = responseData(payload)
  const shareId = typeof data.share_id === 'string' && data.share_id ? data.share_id : (typeof data.id === 'string' ? data.id : '')
  const result = {
    shareId,
    shareUrl: typeof data.share_url === 'string' ? data.share_url : '',
    storageBucket: typeof data.storage_bucket === 'string' ? data.storage_bucket : '',
    isAdmin: data.is_admin === true,
    expiresAt: typeof data.expires_at === 'string' ? data.expires_at : '',
    expiresIn: typeof data.expires_in === 'string' ? data.expires_in : '',
  }
  if (typeof data.source === 'string' && data.source) result.source = data.source
  if (typeof data.permanent === 'boolean') result.permanent = data.permanent
  return result
}

/**
 * @param {string} pathname
 */
export function mediaKeyFromHostPath(pathname) {
  const prefix = '/omnimux/inspiration/media/'
  if (!pathname.startsWith(prefix)) return ''
  return pathname.slice(prefix.length)
}
