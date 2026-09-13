/**
 * Cloud asset catalog: read-only reader for the prebuilt static pagination
 * directory (`cloud-catalog/`), plus the two things the static files cannot do
 * on their own — resolving a `file:` locator back to disk, and materializing a
 * catalog row into the local library on "save to local".
 *
 * The catalog itself is produced by `scripts/build-cloud-assets-catalog.mjs` and
 * committed, so this module never writes to it. See that script for the
 * manifest / page / row contract.
 *
 * The builder resolves every local media path against the asset root it was run
 * with. That root is machine-specific, so it is recorded in `manifest.json` as
 * `sourceRoot` and re-verified on load: a catalog built on another machine still
 * serves its metadata and remote URLs, and simply reports local media as
 * unavailable instead of reading whatever happens to sit at that path here.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AssetsError } from './mappings.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_CATALOG_DIR = resolve(HERE, '..', 'cloud-catalog')

const FILE_LOCATOR = 'file:'
/** Saving a remote asset to the local library is bounded so one click cannot
 *  pull a multi-gigabyte clip; local copies are trusted and not size-checked. */
const MAX_REMOTE_SAVE_BYTES = 512 * 1024 * 1024
const REMOTE_FETCH_TIMEOUT_MS = 120_000

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.flac': 'audio/flac',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

/**
 * @param {string} file
 * @returns {Record<string, unknown> | null}
 */
function readJsonFile(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** @param {string} file @param {Buffer} data */
function writeFileAtomic(file, data) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, data, { mode: 0o600 })
  renameSync(tmp, file)
}

/** @param {string} value */
function mimeOf(value) {
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return 'application/octet-stream'
  return MIME_BY_EXT[value.slice(dot).toLowerCase()] ?? 'application/octet-stream'
}

/** @param {string} value */
function locatorPath(value) {
  return value.startsWith(FILE_LOCATOR) ? value.slice(FILE_LOCATOR.length) : ''
}

/**
 * @typedef {{ id: string, category: string, sub_category: string, name: string,
 *   media_type: string, media_url: string, cover_url: string, tags: string[] }} CatalogIndexRow
 */

/**
 * @param {{
 *   catalogDir?: string,
 *   library?: ReturnType<typeof import('./library.js').createLibraryStore>,
 *   fetchImpl?: typeof fetch,
 *   env?: NodeJS.ProcessEnv,
 * }} [deps]
 */
export function createCloudCatalog(deps = {}) {
  const catalogDir = deps.catalogDir ?? DEFAULT_CATALOG_DIR
  const library = deps.library
  const env = deps.env ?? process.env
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch

  /** @type {Record<string, unknown> | null} */
  let manifest = null
  /** @type {Map<string, CatalogIndexRow> | null} */
  let index = null
  let sourceRoot = ''
  let loaded = false

  function load() {
    if (loaded) return
    loaded = true
    const parsedManifest = readJsonFile(join(catalogDir, 'manifest.json'))
    const parsedIndex = readJsonFile(join(catalogDir, 'index.json'))
    if (!parsedManifest || !Array.isArray(parsedIndex)) return
    manifest = parsedManifest
    sourceRoot = typeof parsedManifest.sourceRoot === 'string' ? parsedManifest.sourceRoot : ''
    index = new Map()
    for (const row of parsedIndex) {
      if (row && typeof row.id === 'string') index.set(row.id, /** @type {CatalogIndexRow} */ (row))
    }
  }

  /** Force a re-read; used by tests and after a catalog rebuild. */
  function reload() {
    loaded = false
    manifest = null
    index = null
    sourceRoot = ''
    load()
  }

  function ready() {
    load()
    return manifest !== null && index !== null
  }

  function getManifest() {
    if (!ready()) {
      throw new AssetsError('catalog-unavailable', 'cloud assets catalog is not built; run the build:cloud-catalog script')
    }
    return /** @type {Record<string, unknown>} */ (manifest)
  }

  /** @param {string} id */
  function getRow(id) {
    if (!ready()) return null
    return /** @type {Map<string, CatalogIndexRow>} */ (index).get(id) ?? null
  }

  /**
   * Absolute on-disk path for a local locator, or `''` when the catalog was
   * built elsewhere or the file has since moved.
   * @param {string} locator
   */
  function resolveLocal(locator) {
    const rel = locatorPath(locator)
    if (rel === '' || sourceRoot === '') return ''
    const abs = resolve(sourceRoot, rel)
    // The builder writes the locator as a path relative to its own root, so the
    // resolved path must stay inside that root: `..` in a tampered catalog must
    // not become an arbitrary file read.
    const rootAbs = resolve(sourceRoot)
    if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) return ''
    if (!existsSync(abs)) return ''
    try {
      if (!statSync(abs).isFile()) return ''
    } catch {
      return ''
    }
    return abs
  }

  /**
   * Resolve one locator into either a stream descriptor or a redirect target.
   * @param {string} locator
   * @returns {{ kind: 'local', absolutePath: string, mime: string, size: number }
   *   | { kind: 'remote', url: string } | null}
   */
  function resolveMedia(locator) {
    const value = String(locator ?? '')
    if (value === '') return null
    if (value.startsWith(FILE_LOCATOR)) {
      const abs = resolveLocal(value)
      if (abs === '') return null
      return { kind: 'local', absolutePath: abs, mime: mimeOf(abs), size: statSync(abs).size }
    }
    if (/^https?:\/\//i.test(value)) return { kind: 'remote', url: value }
    return null
  }

  /**
   * Media for a catalog row by id. Only ids present in `index.json` resolve, so
   * an id is an opaque handle rather than a path the caller supplies.
   *
   * A `cover` request is image-or-nothing: the client renders it into an `<img>`,
   * so returning a multi-megabyte video because the row happens to have one
   * would be a silent waste. A row with no poster simply reports no cover and
   * the card falls back to its hover video preview or its type icon.
   * @param {string} id
   * @param {'media' | 'cover'} [which]
   */
  function resolveRowMedia(id, which = 'media') {
    const row = getRow(id)
    if (!row) return null
    const sourceKey = which === 'cover' ? 'source_cover_url' : 'source_media_url'

    const primary = which === 'cover' ? row.cover_url : row.media_url
    const sourceFallback = row.meta?.[sourceKey]

    if (which === 'cover') {
      for (const candidate of [primary, sourceFallback]) {
        const resolved = resolveMedia(candidate)
        if (resolved === null) continue
        // A remote locator is served by the browser itself, so any URL is fine.
        if (resolved.kind === 'remote') return resolved
        if (mimeOf(resolved.absolutePath).startsWith('image/')) return resolved
      }
      return null
    }

    return resolveMedia(primary) ?? resolveMedia(row.cover_url) ?? resolveMedia(sourceFallback)
  }

  /**
   * Search the whole catalog. The index is a flat array, so this is a scan — it
   * is only reachable from an explicit search box, never from page loading.
   * @param {{ q?: string, category?: string, subCategory?: string, limit?: number, offset?: number }} query
   */
  function search(query) {
    if (!ready()) {
      throw new AssetsError('catalog-unavailable', 'cloud assets catalog is not built; run the build:cloud-catalog script')
    }
    const needle = String(query.q ?? '').trim().toLowerCase()
    const category = String(query.category ?? '')
    const subCategory = String(query.subCategory ?? '')
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 24))
    const offset = Math.max(0, Number(query.offset) || 0)

    const rows = [.../** @type {Map<string, CatalogIndexRow>} */ (index).values()].filter((row) => {
      if (category !== '' && row.category !== category) return false
      if (subCategory !== '' && row.sub_category !== subCategory) return false
      if (needle === '') return true
      return (
        row.name.toLowerCase().includes(needle)
        || row.description.toLowerCase().includes(needle)
        || (row.tags ?? []).some((tag) => String(tag).toLowerCase().includes(needle))
      )
    })

    return {
      total: rows.length,
      offset,
      limit,
      items: rows.slice(offset, offset + limit),
    }
  }

  /**
   * Copy (or download) one catalog row's media into the local asset library.
   *
   * Returns the created library asset. A descriptor-only row — an official
   * Volcengine voice, for instance — has no media at all and is saved as a
   * description-only library record instead of failing.
   * @param {string} id
   * @param {{ type?: string, name?: string }} [options]
   */
  async function saveToLocal(id, options = {}) {
    if (!library) throw new AssetsError('catalog-unavailable', 'local library is not available')
    const row = getRow(id)
    if (!row) throw new AssetsError('catalog-not-found', 'cloud asset not found')

    const resolved = resolveMedia(row.media_url)
    const name = String(options.name ?? '').trim() || row.name
    /** @type {{ real_path: string, original_name: string }[]} */
    const files = []

    if (resolved?.kind === 'local') {
      files.push({ real_path: resolved.absolutePath, original_name: basename(resolved.absolutePath) })
    } else if (resolved?.kind === 'remote') {
      const staged = await stageRemote(resolved.url, name)
      if (staged) files.push({ real_path: staged, original_name: basename(staged) })
    }

    return library.add({
      name,
      type: String(options.type ?? '') || typeForCategory(row.category),
      description: descriptionFor(row),
      tags: row.tags ?? [],
      files,
      source: `cloud:${row.id}`,
    })
  }

  /** @param {string} url @param {string} name */
  async function stageRemote(url, name) {
    if (typeof fetchImpl !== 'function') return null
    const staging = join(catalogDir, '.staging')
    mkdirSync(staging, { recursive: true, mode: 0o700 })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS)
    try {
      const response = await fetchImpl(url, { signal: controller.signal })
      if (!response.ok) return null
      const declared = Number(response.headers?.get?.('content-length') ?? 0)
      if (Number.isFinite(declared) && declared > MAX_REMOTE_SAVE_BYTES) {
        throw new AssetsError('file-too-large', `remote asset exceeds ${MAX_REMOTE_SAVE_BYTES} bytes`)
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.byteLength > MAX_REMOTE_SAVE_BYTES) {
        throw new AssetsError('file-too-large', `remote asset exceeds ${MAX_REMOTE_SAVE_BYTES} bytes`)
      }
      const ext = extensionFor(url, response.headers?.get?.('content-type') ?? '')
      const target = join(staging, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
      writeFileAtomic(target, buffer)
      return target
    } catch (error) {
      if (error instanceof AssetsError) throw error
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  /** Drop staged downloads after they have been copied into the library. */
  function clearStaging() {
    const staging = join(catalogDir, '.staging')
    if (!existsSync(staging)) return
    try {
      rmSync(staging, { recursive: true, force: true })
    } catch {
      // Staging is best-effort; a leftover file is harmless and cleaned next run.
    }
  }

  return {
    ready,
    reload,
    getManifest,
    getRow,
    search,
    resolveMedia,
    resolveRowMedia,
    saveToLocal,
    clearStaging,
    catalogDir,
    /** Diagnostic only: never used to build a path the caller chooses. */
    getSourceRoot: () => sourceRoot,
  }
}

/** @param {string} category */
function typeForCategory(category) {
  // The library's own vocabulary already covers every cloud category except
  // audio, which is not a creative-object type and therefore lands in custom.
  return category === 'character' || category === 'scene' || category === 'style' || category === 'prop' || category === 'knowledge'
    ? category
    : 'custom'
}

/** @param {CatalogIndexRow} row */
function descriptionFor(row) {
  const parts = [row.description]
  if (row.sub_category) parts.push(`云端分类：${row.sub_category}`)
  parts.push(`云端来源：${row.id}`)
  return parts.filter(Boolean).join('\n')
}

/** @param {string} url @param {string} contentType */
function extensionFor(url, contentType) {
  const fromUrl = url.split('?')[0].split('#')[0]
  const dot = fromUrl.lastIndexOf('.')
  if (dot > 0 && fromUrl.length - dot <= 6) return fromUrl.slice(dot).toLowerCase()
  const base = contentType.split(';')[0].trim().toLowerCase()
  for (const [ext, mime] of Object.entries(MIME_BY_EXT)) {
    if (mime.split(';')[0] === base) return ext
  }
  return '.bin'
}

/** Absolute path of the committed catalog directory for this install. */
export function defaultCatalogDir() {
  return DEFAULT_CATALOG_DIR
}

/** Exported for the route layer and its tests. */
export { FILE_LOCATOR, MAX_REMOTE_SAVE_BYTES, mimeOf }
