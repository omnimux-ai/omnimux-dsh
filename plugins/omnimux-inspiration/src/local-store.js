import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolveInspirationPaths } from './paths.js'
import { getCanonicalItemKey, isSameSocialContent, normalizeUrl } from './url-normalizer.js'
import { moveToTrash } from './trash.js'

export class InspirationError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [status]
   */
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'InspirationError'
    this.code = code
    this.status = status
  }
}

/**
 * @typedef {Object} LocalInspirationRecord
 * @property {string} id
 * @property {string} title
 * @property {string} [type] video | image | link
 * @property {string} [source_platform] tiktok | instagram | youtube | x
 * @property {string} [source_url]
 * @property {string} [cover_url] relative host media path or absolute url
 * @property {string[]} [media_urls] relative host media paths or urls
 * @property {Record<string, unknown>} [local_paths]
 * @property {string[]} [tags]
 * @property {boolean} [is_favorite]
 * @property {number} [hot_score]
 * @property {string} [content]
 * @property {Record<string, unknown> | string} [deconstruction] five-dimension breakdown object or markdown
 * @property {Record<string, unknown>} [stats] likes, comments, shares, etc.
 * @property {Record<string, unknown>} [author] name, handle, avatar
 * @property {number} [duration] seconds
 * @property {number} [views]
 * @property {string} [country_code]
 * @property {string} [category]
 * @property {string} [traffic_type] ad | organic
 * @property {string} [posted_at]
 * @property {string} [published_at]
 * @property {string} [favorited_at]
 * @property {{ lang?: string, text?: string, segments?: Array<{ id: string, text: string }> }} [script_translation]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @param {{ paths?: ReturnType<typeof resolveInspirationPaths> }} [opts]
 */
function rowDuration(row) {
  if (typeof row?.duration === 'number' && Number.isFinite(row.duration)) return row.duration
  if (row?.stats && typeof row.stats === 'object') {
    const d = Number(row.stats.duration || row.stats.video_duration)
    if (Number.isFinite(d)) return d
  }
  return 0
}

function rowViews(row) {
  if (typeof row?.views === 'number' && Number.isFinite(row.views)) return row.views
  if (row?.stats && typeof row.stats === 'object') {
    const v = Number(row.stats.views)
    if (Number.isFinite(v)) return v
  }
  return 0
}

export function createLocalStore(opts = {}) {
  const paths = opts.paths ?? resolveInspirationPaths()

  function ensureDirs() {
    if (!existsSync(paths.dir)) mkdirSync(paths.dir, { recursive: true })
    if (!existsSync(paths.coversDir)) mkdirSync(paths.coversDir, { recursive: true })
    if (!existsSync(paths.videosDir)) mkdirSync(paths.videosDir, { recursive: true })
    if (!existsSync(paths.imagesDir)) mkdirSync(paths.imagesDir, { recursive: true })
  }

  /**
   * @returns {LocalInspirationRecord[]}
   */
  function readAll() {
    if (!existsSync(paths.libraryFile)) return []
    try {
      const raw = readFileSync(paths.libraryFile, 'utf8')
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed.items) ? parsed.items : []
    } catch {
      return []
    }
  }

  /**
   * @param {LocalInspirationRecord[]} items
   */
  function writeAll(items) {
    ensureDirs()
    const tempFile = `${paths.libraryFile}.${randomUUID()}.tmp`
    const payload = JSON.stringify({ version: 1, items, updated_at: new Date().toISOString() }, null, 2)
    writeFileSync(tempFile, payload, 'utf8')
    renameSync(tempFile, paths.libraryFile)
  }

  return {
    paths,

    /**
     * Read all items and extract unique valid platforms with their item counts.
     * Normalizes twitter alias to x.
     * @returns {Array<{ name: string, count: number }>}
     */
    platforms() {
      const items = readAll()
      const counts = {}
      for (const item of items) {
        let plat = (item.source_platform || item.platform || '').trim().toLowerCase()
        if (plat === 'twitter') plat = 'x'
        if (!plat || plat === 'unknown') continue
        counts[plat] = (counts[plat] || 0) + 1
      }
      return Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    },

    /**
     * @param {{
     *   q?: string,
     *   type?: string,
     *   platform?: string,
     *   tag?: string,
     *   tags?: string,
     *   is_favorite?: string | boolean,
     *   sort?: string,
     *   page?: number,
     *   page_size?: number
     * }} [query]
     */
    list(query = {}) {
      let items = readAll()

      if (query.q && typeof query.q === 'string') {
        const needle = query.q.toLowerCase().trim()
        items = items.filter((row) => {
          const t = (row.title || '').toLowerCase()
          const c = (row.content || '').toLowerCase()
          const u = (row.source_url || '').toLowerCase()
          const dec = typeof row.deconstruction === 'string'
            ? row.deconstruction.toLowerCase()
            : JSON.stringify(row.deconstruction || {}).toLowerCase()
          const tags = Array.isArray(row.tags) ? row.tags.join(' ').toLowerCase() : ''
          return t.includes(needle) || c.includes(needle) || u.includes(needle) || dec.includes(needle) || tags.includes(needle)
        })
      }

      if (query.type) {
        items = items.filter((row) => row.type === query.type)
      }

      if (query.platform) {
        const targetPlat = String(query.platform).toLowerCase().trim()
        items = items.filter((row) => {
          const rowPlat = (row.source_platform || row.platform || '').toLowerCase().trim()
          if (targetPlat === 'x' || targetPlat === 'twitter') {
            return rowPlat === 'x' || rowPlat === 'twitter'
          }
          return rowPlat === targetPlat
        })
      }

      const matchTag = query.tag || query.tags
      if (matchTag) {
        const expected = String(matchTag).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
        if (expected.length > 0) {
          items = items.filter((row) => {
            const current = (row.tags || []).map((t) => t.toLowerCase())
            return expected.some((exp) => current.includes(exp))
          })
        }
      }

      if (query.is_favorite !== undefined && query.is_favorite !== '') {
        const fav = query.is_favorite === true || query.is_favorite === 'true'
        items = items.filter((row) => Boolean(row.is_favorite) === fav)
      }

      if (query.country) {
        const c = String(query.country).toLowerCase().trim()
        items = items.filter((row) => (row.country_code || '').toLowerCase() === c)
      }

      if (query.category) {
        const cat = String(query.category).toLowerCase().trim()
        items = items.filter((row) => (row.category || '').toLowerCase().includes(cat))
      }

      if (query.duration_min != null && query.duration_min !== '') {
        const min = Number(query.duration_min)
        if (Number.isFinite(min)) items = items.filter((row) => rowDuration(row) >= min)
      }

      if (query.duration_max != null && query.duration_max !== '') {
        const max = Number(query.duration_max)
        if (Number.isFinite(max)) items = items.filter((row) => rowDuration(row) <= max)
      }

      if (query.views_min != null && query.views_min !== '') {
        const min = Number(query.views_min)
        if (Number.isFinite(min)) items = items.filter((row) => rowViews(row) >= min)
      }

      if (query.views_max != null && query.views_max !== '') {
        const max = Number(query.views_max)
        if (Number.isFinite(max)) items = items.filter((row) => rowViews(row) <= max)
      }

      if (query.traffic_type) {
        const tt = String(query.traffic_type).toLowerCase().trim()
        items = items.filter((row) => (row.traffic_type || 'organic').toLowerCase() === tt)
      }

      if (query.posted_after) {
        const afterMs = Date.parse(query.posted_after)
        if (!Number.isNaN(afterMs)) {
          items = items.filter((row) => {
            const p = row.posted_at || row.published_at
            if (!p) return false
            const itemMs = Date.parse(p)
            return !Number.isNaN(itemMs) && itemMs >= afterMs
          })
        }
      }

      if (query.posted_before) {
        const beforeMs = Date.parse(query.posted_before)
        if (!Number.isNaN(beforeMs)) {
          const effectiveBefore = /^\d{4}-\d{2}-\d{2}$/.test(String(query.posted_before).trim())
            ? beforeMs + 86400000 - 1
            : beforeMs
          items = items.filter((row) => {
            const p = row.posted_at || row.published_at
            if (!p) return false
            const itemMs = Date.parse(p)
            return !Number.isNaN(itemMs) && itemMs <= effectiveBefore
          })
        }
      }

      const sortMode = query.sort || 'new'
      items.sort((a, b) => {
        if (sortMode === 'fav') {
          if (Boolean(b.is_favorite) !== Boolean(a.is_favorite)) {
            return b.is_favorite ? 1 : -1
          }
        }
        if (sortMode === 'hot') {
          const scoreA = typeof a.hot_score === 'number' ? a.hot_score : 0
          const scoreB = typeof b.hot_score === 'number' ? b.hot_score : 0
          if (scoreB !== scoreA) return scoreB - scoreA
        }
        if (sortMode === 'views') {
          const viewsA = rowViews(a)
          const viewsB = rowViews(b)
          if (viewsB !== viewsA) return viewsB - viewsA
        }
        const timeA = new Date(a.created_at || 0).getTime()
        const timeB = new Date(b.created_at || 0).getTime()
        return timeB - timeA
      })

      const total = items.length
      const page = Math.max(1, Number(query.page) || 1)
      const pageSize = Math.max(1, Math.min(100, Number(query.page_size) || 20))
      const start = (page - 1) * pageSize
      const paginated = items.slice(start, start + pageSize)

      return {
        items: paginated,
        total,
        page,
        page_size: pageSize,
      }
    },

    /**
     * @param {string} id
     */
    get(id) {
      const items = readAll()
      return items.find((item) => item.id === id) || null
    },

    /**
     * Find existing item by URL (supports canonical & query-stripped matching).
     * @param {string} url
     */
    findByUrl(url) {
      if (!url) return null
      const items = readAll()
      return items.find((item) => item.source_url && isSameSocialContent(item.source_url, url)) || null
    },

    /**
     * @param {Partial<LocalInspirationRecord> & { title: string }} record
     * @param {{ allowDuplicate?: boolean }} [opts]
     */
    add(record, opts = {}) {
      const items = readAll()
      if (record.source_url && !opts.allowDuplicate) {
        const existing = items.find((item) => item.source_url && isSameSocialContent(item.source_url, record.source_url))
        if (existing) return existing
      }
      const now = new Date().toISOString()
      const canonical = record.source_url ? getCanonicalItemKey(record.source_url) : null
      /** @type {LocalInspirationRecord} */
      const row = {
        id: record.id || `insp_${randomUUID().slice(0, 8)}`,
        title: record.title || 'Untitled',
        type: record.type || 'video',
        source_platform: record.source_platform || canonical?.platform,
        source_url: record.source_url,
        cover_url: record.cover_url,
        media_urls: record.media_urls || [],
        local_paths: record.local_paths || {},
        tags: Array.isArray(record.tags) ? record.tags : [],
        is_favorite: Boolean(record.is_favorite),
        hot_score: typeof record.hot_score === 'number' ? record.hot_score : 0,
        content: record.content || '',
        deconstruction: record.deconstruction,
        stats: record.stats || {},
        author: record.author || {},
        duration: record.duration,
        views: record.views,
        country_code: record.country_code || '',
        category: record.category || '',
        traffic_type: record.traffic_type || 'organic',
        posted_at: record.posted_at || null,
        published_at: record.published_at || '',
        favorited_at: record.favorited_at || (record.is_favorite ? now : ''),
        script_translation: record.script_translation,
        created_at: record.created_at || now,
        updated_at: now,
      }
      items.unshift(row)
      writeAll(items)
      return row
    },

    /**
     * @param {string} id
     * @param {Partial<LocalInspirationRecord>} patch
     */
    update(id, patch) {
      const items = readAll()
      const index = items.findIndex((item) => item.id === id)
      if (index === -1) throw new InspirationError('not-found', `inspiration ${id} not found`, 404)
      const current = items[index]
      const now = new Date().toISOString()
      const nextFavorite = patch.is_favorite !== undefined ? Boolean(patch.is_favorite) : current.is_favorite
      const updated = {
        ...current,
        ...patch,
        id: current.id,
        is_favorite: nextFavorite,
        favorited_at: nextFavorite
          ? (patch.favorited_at || current.favorited_at || now)
          : (patch.favorited_at !== undefined ? patch.favorited_at : current.favorited_at),
        updated_at: now,
      }
      items[index] = updated
      writeAll(items)
      return updated
    },

    /**
     * Delete single item and move its associated media files to the OS system trash.
     * @param {string} id
     */
    async delete(id) {
      const items = readAll()
      const index = items.findIndex((item) => item.id === id)
      if (index === -1) throw new InspirationError('not-found', `inspiration ${id} not found`, 404)
      const [removed] = items.splice(index, 1)

      // Move associated local media files to trash
      if (removed.local_paths) {
        if (removed.local_paths.video) await moveToTrash(String(removed.local_paths.video))
        if (removed.local_paths.cover) await moveToTrash(String(removed.local_paths.cover))
      }

      writeAll(items)
      return removed
    },

    /**
     * Batch delete multiple items and move all their local media files to trash.
     * @param {string[]} ids
     */
    async deleteBatch(ids) {
      if (!Array.isArray(ids) || ids.length === 0) return { deleted: [], count: 0 }
      const idSet = new Set(ids)
      const items = readAll()
      const remaining = []
      const removed = []

      for (const item of items) {
        if (idSet.has(item.id)) {
          removed.push(item)
          if (item.local_paths) {
            if (item.local_paths.video) await moveToTrash(String(item.local_paths.video))
            if (item.local_paths.cover) await moveToTrash(String(item.local_paths.cover))
          }
        } else {
          remaining.push(item)
        }
      }

      writeAll(remaining)
      return { deleted: removed.map((it) => it.id), count: removed.length }
    },

    tags() {
      const items = readAll()
      /** @type {Record<string, number>} */
      const counts = {}
      for (const item of items) {
        for (const tag of item.tags || []) {
          counts[tag] = (counts[tag] || 0) + 1
        }
      }
      return Object.entries(counts).map(([name, count]) => ({ name, count }))
    },
  }
}
