import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolveInspirationPaths } from './paths.js'
import { getCanonicalItemKey, isSameSocialContent, normalizeUrl } from './url-normalizer.js'
import { moveToTrash } from './trash.js'
import { calculateRecommendationScore } from './recommendation-engine.js'

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
 * @property {'importing' | 'ready' | 'degraded' | 'failed'} [import_status] absent means `ready` (legacy rows)
 * @property {'resolving' | 'downloading' | 'analyzing' | 'persisting' | null} [import_stage] phase a running import is in
 * @property {string | null} [import_error] reason a step could not finish; a non-terminal marker, so it also appears on `ready`/`degraded` rows (the import succeeded, one part of it — the AI breakdown — did not). Only `failed` means nothing was stored. Never read this as "the import failed": check `import_status` first.
 * @property {boolean} [auto_analyze] whether a retry of this URL should re-run the AI breakdown; absent means `true`
 * @property {string} [import_started_at] ISO timestamp the running import began at
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

/**
 * Normalize an incoming record into the persisted row shape.
 * @param {Partial<LocalInspirationRecord> & { title?: string }} record
 * @param {{ id?: string, created_at?: string }} [identity] values an existing row keeps
 * @returns {LocalInspirationRecord}
 */
function buildRow(record, identity = {}) {
  const now = new Date().toISOString()
  const canonical = record.source_url ? getCanonicalItemKey(record.source_url) : null
  return {
    id: identity.id || record.id || `insp_${randomUUID().slice(0, 8)}`,
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
    import_status: record.import_status || 'ready',
    import_stage: record.import_stage ?? null,
    import_error: record.import_error ?? null,
    // `??` and not `||`: an explicit `false` is the user's choice to skip the AI
    // breakdown, and `||` would silently turn it back into `true` on the way out.
    auto_analyze: record.auto_analyze ?? true,
    import_started_at: record.import_started_at,
    created_at: identity.created_at || record.created_at || now,
    updated_at: now,
  }
}

/**
 * Media files of a replaced row that the replacement does not reference, so
 * re-importing never leaves orphaned downloads behind.
 *
 * A path the new row still points at is never recycled: the upgrade path passes
 * the same `local_paths` through, and trashing it would delete live media.
 * @param {LocalInspirationRecord} previous
 * @param {LocalInspirationRecord} next
 * @returns {string[]}
 */
function orphanedMedia(previous, next) {
  const kept = new Set(
    [next.local_paths?.video, next.local_paths?.cover].filter(Boolean).map(String),
  )
  return [previous.local_paths?.video, previous.local_paths?.cover]
    .filter(Boolean)
    .map(String)
    .filter((filePath) => !kept.has(filePath))
}

export function createLocalStore(opts = {}) {
  const paths = opts.paths ?? resolveInspirationPaths()

  /**
   * Tail of the store's exclusive-work chain.
   *
   * Serialization scope: operations that mutate the library *across an await*
   * (`replace`, which recycles the previous row's media before answering). Two
   * background imports finishing at the same moment used to interleave their
   * read-modify-write windows and lose one another's rows; chaining them keeps
   * the window between `readAll()` and `writeAll()` free of other completions.
   *
   * Single-tick mutations (`add`, `update`, `delete`, `deleteBatch`) need no
   * chain: Node runs each of them from `readAll()` to `writeAll()` without
   * yielding, so they are already atomic with respect to every other operation.
   * Chaining them too would mean making them asynchronous, which would change the
   * call contract for every existing caller that consumes a returned row.
   * @type {Promise<unknown>}
   */
  let exclusiveTail = Promise.resolve()

  /**
   * @template T
   * @param {() => T | Promise<T>} work
   * @returns {Promise<T>}
   */
  function runExclusive(work) {
    const result = exclusiveTail.then(() => work())
    exclusiveTail = result.then(() => undefined, () => undefined)
    return result
  }

  /**
   * Tail of the store's media-recycling chain.
   *
   * Trashing is deliberately off the mutation path — it is a filesystem move
   * whose outcome cannot change a caller's return value — but it is not
   * fire-and-forget either: the moves are serialized and their tail is reachable
   * through `settled()`, so "the row is gone" and "its files are gone" stay
   * distinguishable facts instead of a race.
   * @type {Promise<unknown>}
   */
  let trashTail = Promise.resolve()

  /**
   * Recycle media off the request path.
   * @param {string[]} filePaths
   */
  function queueTrash(filePaths) {
    const pending = filePaths.filter(Boolean).map(String)
    if (pending.length === 0) return
    trashTail = trashTail.then(async () => {
      for (const filePath of pending) {
        try {
          await moveToTrash(filePath)
        } catch (err) {
          console.error(`Failed to move ${filePath} to trash:`, err)
        }
      }
    })
  }

  function ensureDirs() {
    if (!existsSync(paths.dir)) mkdirSync(paths.dir, { recursive: true })
    if (!existsSync(paths.coversDir)) mkdirSync(paths.coversDir, { recursive: true })
    if (!existsSync(paths.videosDir)) mkdirSync(paths.videosDir, { recursive: true })
    if (!existsSync(paths.imagesDir)) mkdirSync(paths.imagesDir, { recursive: true })
  }

  /**
   * Reading the library costs a `statSync` even when it throws, which is what a
   * read-heavy caller (`readAll` on every `get`, twice per poll) pays for.
   * @returns {import('node:fs').Stats | null}
   */
  function statOf() {
    try {
      return statSync(paths.libraryFile)
    } catch {
      return null
    }
  }

  /**
   * Snapshot a caller can hand back to a later read of the same request.
   *
   * The poll endpoint reads the library twice per request — once for the stale
   * sweep and once for the row lookup — and a running import is polled every
   * 2.5s per row. The snapshot carries the file identity the items were parsed
   * from, so reusing it is only ever an optimization: a file that changed since
   * (another process, or a write between the two reads) fails the identity check
   * and is read again.
   */
  let cachedSnapshot = null

  /**
   * @returns {{ items: LocalInspirationRecord[], stat: import('node:fs').Stats | null }}
   */
  function snapshotForRead() {
    return { items: readAll(), stat: statOf() }
  }

  /**
   * @param {unknown} snapshot
   * @returns {LocalInspirationRecord[] | null} the snapshot's items, or null when they are stale
   */
  function snapshotItems(snapshot) {
    const usable = snapshot && typeof snapshot === 'object' && Array.isArray(snapshot.items)
    if (!usable) return null
    if (snapshot !== cachedSnapshot) return null
    const current = statOf()
    const asOf = snapshot.stat ?? null
    if (current === null && asOf === null) return snapshot.items
    if (current === null || asOf === null) return null
    if (current.mtimeMs !== asOf.mtimeMs || current.size !== asOf.size) return null
    return snapshot.items
  }

  /**
   * @returns {LocalInspirationRecord[]}
   */
  function readAll() {
    if (!statOf()) return []
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
     * Every stored row, unfiltered and unsorted.
     *
     * Exposed for the read-side import sweep, which has to look at rows a query
     * would have filtered away (a stale row is found by status, not by any of the
     * list filters). Callers that want a page use `list()`.
     * @returns {LocalInspirationRecord[]}
     */
    readAll,

    /**
     * Read the library once, as a snapshot a later read in the same request can
     * reuse. Optional for callers: `get(id)` without it reads the file itself.
     * @returns {{ items: LocalInspirationRecord[], stat: import('node:fs').Stats | null }}
     */
    snapshotForRead,

    /**
     * Make a snapshot reusable. Only the caller that took the snapshot can know
     * whether anything has written the library since — the sweep endpoint does,
     * and passes it only when the sweep itself changed nothing.
     * @param {{ items: LocalInspirationRecord[], stat: import('node:fs').Stats | null }} snapshot
     */
    cacheReadSnapshot(snapshot) {
      cachedSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : null
    },

    /**
     * Resolve once every queued media move has finished.
     *
     * Callers that only need the library to be consistent do not have to await
     * this: `delete` and `replace` answer as soon as the row change is durable.
     * It exists for the callers that also assert on the filesystem, and for
     * shutdown paths that want to let the remaining moves drain.
     * @returns {Promise<void>}
     */
    settled() {
      return trashTail.then(() => undefined, () => undefined)
    },

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
      let scoreMap = null
      if (sortMode === 'hot' || sortMode === 'recommend') {
        scoreMap = new Map()
        for (const it of items) {
          const algoScore = calculateRecommendationScore(it)
          const manualScore = typeof it.hot_score === 'number' ? it.hot_score : 0
          scoreMap.set(it, Math.max(algoScore, manualScore))
        }
      }

      items.sort((a, b) => {
        if (sortMode === 'fav') {
          if (Boolean(b.is_favorite) !== Boolean(a.is_favorite)) {
            return b.is_favorite ? 1 : -1
          }
        }
        if (sortMode === 'hot' || sortMode === 'recommend') {
          const scoreA = scoreMap?.get(a) ?? 0
          const scoreB = scoreMap?.get(b) ?? 0
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
     * @param {{ items: LocalInspirationRecord[], stat: import('node:fs').Stats | null }} [snapshot]
     *   a library read the caller already paid for (see `snapshotForRead`); ignored
     *   when it is stale, which keeps the parameter a pure optimization
     * @returns {LocalInspirationRecord | null}
     */
    get(id, snapshot) {
      const cached = snapshot === undefined ? null : snapshotItems(snapshot)
      const items = cached || readAll()
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
      const row = buildRow(record)
      items.unshift(row)
      writeAll(items)
      return row
    },

    /**
     * Replace an existing row in place, keeping its id and creation time.
     *
     * Used by the re-import/upgrade path: the previous row's media files that the
     * new row does not reference are moved to the system trash, which is what
     * keeps a degraded → video upgrade from orphaning the old download.
     * @param {string} id
     * @param {Partial<LocalInspirationRecord> & { title?: string }} record
     * @returns {Promise<LocalInspirationRecord | null>} the new row, or null when the id is gone
     */
    replace(id, record) {
      const outcome = runExclusive(() => {
        const items = readAll()
        const index = items.findIndex((item) => item.id === id)
        if (index === -1) return { row: null, trash: Promise.resolve() }
        const previous = items[index]
        const row = buildRow({
          ...record,
          is_favorite: record.is_favorite ?? previous.is_favorite,
          favorited_at: record.favorited_at ?? previous.favorited_at,
          tags: Array.isArray(record.tags) && record.tags.length > 0 ? record.tags : (previous.tags || []),
          // A replacement is the *completion* of the import the previous row
          // started — the background job's placeholder today, an upgraded
          // degraded row before that. The completion record carries no start
          // timestamp of its own, so without this the field the placeholder
          // persisted is dropped by the whitelist and the finished row loses the
          // only record of when its import began.
          import_started_at: record.import_started_at ?? previous.import_started_at,
        }, { id: previous.id, created_at: previous.created_at })
        items[index] = row
        writeAll(items)
        queueTrash(orphanedMedia(previous, row))
        // Snapshot the queue tail inside the lock, so the answer covers the
        // recycling this replacement caused and not a later caller's.
        return { row, trash: trashTail }
      })
      // Resolves once the row change *and* its media recycling are done, which is
      // the contract `replace` has always had. Returning earlier would make the
      // library consistent while the filesystem still held the old files.
      return outcome.then(async (settled) => {
        await settled.trash
        return settled.row
      })
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
     *
     * The row is removed and the library rewritten in one tick, so a concurrent
     * import completion cannot read the pre-delete library and write the row back
     * from under the user. The media moves are queued behind that critical
     * section and awaited before answering, which is what the previous
     * `await moveToTrash()` sequence did.
     * @param {string} id
     */
    async delete(id) {
      const items = readAll()
      const index = items.findIndex((item) => item.id === id)
      if (index === -1) throw new InspirationError('not-found', `inspiration ${id} not found`, 404)
      const [removed] = items.splice(index, 1)
      writeAll(items)
      queueTrash([removed.local_paths?.video, removed.local_paths?.cover])
      await this.settled()
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
        } else {
          remaining.push(item)
        }
      }

      writeAll(remaining)
      queueTrash(removed.flatMap((item) => [item.local_paths?.video, item.local_paths?.cover]))
      await this.settled()
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
