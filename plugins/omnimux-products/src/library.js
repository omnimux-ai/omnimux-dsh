/**
 * Product library: named sellable objects with path-only media refs.
 *
 * RED LINE: this store never copies, moves, or deletes anything under a
 * media `real_path`. Writes reject unavailable paths; persisted paths that
 * later disappear drop out of the visible media list.
 * HTTP and tools MUST both call this module — no second normalizer.
 */
import { randomUUID } from 'node:crypto'
import { accessSync, constants, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute } from 'node:path'
import { emptyBrandStrategy, isDigitalProduct, isPlainStrategy, normalizeBrandStrategy } from './brand-strategy.js'
import { ProductsError } from './errors.js'

const DEFAULT_FS = { accessSync, constants, mkdirSync, readFileSync, renameSync, statSync, writeFileSync }

export { emptyBrandStrategy, isDigitalProduct, isPlainStrategy, normalizeBrandStrategy }
export { ProductsError }
export const PRODUCT_KINDS = Object.freeze(['physical', 'digital'])
export const CITE_PREFIX = '产品'

const KIND_SET = new Set(PRODUCT_KINDS)
const NAME_MAX = 40
const TEXT_MAX = 4000
const CATEGORIES_MAX = 5
const HANDLE_FORBIDDEN = /[/\u0000-\u001f]/

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif', '.heic', '.tiff'])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.flv'])
const AUDIO_EXT = new Set(['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.aiff'])
const DOCUMENT_EXT = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv', '.rtf'])

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v',
  '.flv': 'video/x-flv',
}

/**
 * Persist source: only `manual` is legal in P1. url-import / brand-analysis
 * and anything else collapse to manual (no fetch / no analysis store).
 * @param {unknown} source
 */
export function normalizeSource(_source) {
  return 'manual'
}

/**
 * Deep-clone a persisted strategy so UI mutations cannot poke the in-memory store.
 * @param {unknown} value
 */
function cloneStrategy(value) {
  if (value == null) return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

/**
 * Hydrate path: illegal / empty strategy → null, never throw.
 * @param {unknown} value
 */
function hydrateBrandStrategy(value) {
  try {
    return normalizeBrandStrategy(value)
  } catch (error) {
    if (error instanceof ProductsError && error.code === 'brand-strategy-invalid') return null
    throw error
  }
}

/**
 * @param {'prd' | 'med'} prefix
 */
export function newRecordId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 8)}`
}

/**
 * @param {unknown} value
 */
function str(value) {
  return typeof value === 'string' ? value : ''
}

/**
 * @param {typeof DEFAULT_FS} fs
 * @param {string} file
 * @param {string} text
 */
function atomicWrite(fs, file, text) {
  fs.mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, text, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

/**
 * @param {string} name
 */
function extOf(name) {
  const ext = extname(name).toLowerCase()
  return ext
}

/**
 * @param {string} ext
 * @returns {'image' | 'video' | 'audio' | 'document' | 'other'}
 */
export function bucketOf(ext) {
  if (IMAGE_EXT.has(ext)) return 'image'
  if (VIDEO_EXT.has(ext)) return 'video'
  if (AUDIO_EXT.has(ext)) return 'audio'
  if (DOCUMENT_EXT.has(ext)) return 'document'
  return 'other'
}

/**
 * Previewable image/video only — never stream unknown types out of user paths.
 * @param {string} name
 * @returns {string | null}
 */
export function previewMimeOf(name) {
  return MIME_BY_EXT[extOf(name)] ?? null
}

/**
 * @param {unknown} kind
 */
export function normalizeKind(kind) {
  const raw = str(kind).trim()
  if (raw === '') return 'physical'
  if (!KIND_SET.has(raw)) throw new ProductsError('kind-invalid', 'unknown product kind')
  return raw
}

/**
 * Display name: trim 1–40, no slash / control chars.
 * @param {unknown} name
 */
export function normalizeName(name) {
  const trimmed = str(name).trim()
  if (!trimmed) throw new ProductsError('name-required', 'display name is required')
  if (trimmed.length > NAME_MAX) throw new ProductsError('name-invalid', `display name must be at most ${NAME_MAX} characters`)
  if (HANDLE_FORBIDDEN.test(trimmed)) throw new ProductsError('name-invalid', 'display name cannot contain slashes or control characters')
  return trimmed
}

/**
 * @param {unknown} value
 * @param {string} field
 */
export function normalizeText(value, field) {
  const text = str(value)
  if (text.length > TEXT_MAX) throw new ProductsError('text-too-long', `${field} must be at most ${TEXT_MAX} characters`)
  return text
}

/**
 * @param {unknown} categories
 * @returns {string[]}
 */
export function normalizeCategories(categories) {
  if (categories == null) return []
  if (typeof categories === 'string') {
    return normalizeCategories(categories.split(/[,，]/))
  }
  if (!Array.isArray(categories)) throw new ProductsError('categories-invalid', 'categories must be an array of strings')
  const out = []
  const seen = new Set()
  for (const item of categories) {
    const tag = str(item).trim()
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= CATEGORIES_MAX) break
  }
  return out
}

/**
 * Handle used in @产品/名称 citations. Same display name shares one handle.
 * @param {string} name
 */
export function handleOf(name) {
  return name.trim().replace(/\s+/g, ' ')
}

/**
 * @param {string} name
 */
export function citeOf(name) {
  return `@${CITE_PREFIX}/${name}`
}

/**
 * Agent create: name is checked separately.
 * Physical → selling_points or description.
 * Digital → link, persisted-shaped brand_strategy, selling_points, or description.
 * HTTP/UI create may omit copy.
 * @param {{
 *   kind?: unknown,
 *   selling_points?: unknown,
 *   description?: unknown,
 *   link?: unknown,
 *   brand_strategy?: unknown,
 * }} input
 */
export function assertAgentContent(input) {
  const points = str(input?.selling_points).trim()
  const description = str(input?.description).trim()
  if (points || description) return
  const digital = input?.kind === 'digital'
  if (digital) {
    if (str(input?.link).trim()) return
    try {
      if (normalizeBrandStrategy(input?.brand_strategy)) return
    } catch {
      // invalid strategy is not content
    }
  }
  throw new ProductsError(
    'content-required',
    digital
      ? 'digital products need link, brand_strategy, selling_points, or description'
      : 'selling_points or description is required',
  )
}

/**
 * Visible media probe: missing path → hidden (record stays on disk JSON).
 * @param {string} realPath
 * @param {{ statSync: typeof statSync }} fs
 */
function mediaView(realPath, fs) {
  const path = str(realPath).trim()
  if (!path) return null
  try {
    const info = fs.statSync(path)
    if (!info.isFile()) return null
    const name = basename(path.replace(/\/+$/, '')) || path
    const ext = extOf(name)
    return {
      real_path: path,
      original_name: name,
      kind: bucketOf(ext),
      size: Number(info.size) || 0,
      visible: true,
    }
  } catch {
    return null
  }
}

/**
 * @param {unknown[]} media
 * @param {{ statSync: typeof statSync, accessSync: typeof accessSync, constants: typeof constants }} fs
 */
function normalizeMedia(media, fs) {
  if (media == null) return []
  if (!Array.isArray(media)) throw new ProductsError('media-invalid', 'media must be an array')
  const out = []
  const seen = new Set()
  let sort = 0
  for (const item of media) {
    const path = typeof item === 'string' ? item.trim() : str(item?.real_path ?? item?.path).trim()
    if (!path || !isAbsolute(path) || path.includes('\0')) {
      throw new ProductsError('media-path-invalid', 'media path must be absolute and contain no null bytes')
    }
    if (seen.has(path)) continue
    seen.add(path)
    try {
      const info = fs.statSync(path)
      if (!info.isFile()) throw new Error('not a file')
      fs.accessSync(path, fs.constants.R_OK)
    } catch {
      throw new ProductsError('media-path-unavailable', 'media path is missing, not a file, or unreadable')
    }
    const name = typeof item === 'object' && item ? str(item.original_name) : ''
    const id = typeof item === 'object' && item && typeof item.id === 'string' && item.id
      ? item.id
      : newRecordId('med')
    out.push({
      id,
      real_path: path,
      original_name: name || basename(path.replace(/\/+$/, '')) || path,
      sort_order: sort,
      is_primary: sort === 0,
    })
    sort += 1
  }
  return out
}

/**
 * @param {any} product
 * @param {{ statSync: typeof statSync }} fs
 */
function viewOf(product, fs) {
  const visibleMedia = []
  for (const row of product.media) {
    const live = mediaView(row.real_path, fs)
    if (!live) continue
    visibleMedia.push({
      id: row.id,
      sort_order: row.sort_order,
      is_primary: row.is_primary,
      ...live,
    })
  }
  const cover = visibleMedia.find((row) => row.id === product.cover_media_id)
    ?? visibleMedia.find((row) => row.kind === 'image')
    ?? visibleMedia[0]
    ?? null
  return {
    ...product,
    media: visibleMedia,
    cover_media_id: cover ? cover.id : null,
    cover,
    missing_media_count: product.media.length - visibleMedia.length,
    brand_strategy: cloneStrategy(product.brand_strategy),
    cite: citeOf(product.name),
  }
}

/**
 * Compact list/search payload: cover path + media count, not the full gallery.
 * @param {ReturnType<typeof viewOf>} view
 */
export function listViewOf(view) {
  return {
    id: view.id,
    name: view.name,
    handle: view.handle,
    kind: view.kind,
    description: view.description,
    selling_points: view.selling_points,
    target_audience: view.target_audience,
    brand: view.brand,
    features: view.features,
    price: view.price,
    sku: view.sku,
    promotion: view.promotion,
    categories: view.categories,
    language: view.language,
    status: view.status,
    link: view.link,
    cover_media_id: view.cover_media_id,
    cover: view.cover,
    media_count: view.media.length,
    missing_media_count: view.missing_media_count,
    brand_strategy: view.brand_strategy,
    source: view.source,
    created_at: view.created_at,
    updated_at: view.updated_at,
    cite: view.cite,
  }
}

/**
 * @param {{
 *   paths?: { libraryFile: string },
 *   fs?: Partial<typeof DEFAULT_FS>,
 * }} [opts]
 */
export function createLibraryStore(opts = {}) {
  const fs = { ...DEFAULT_FS, ...(opts.fs ?? {}) }
  const paths = opts.paths ?? {}

  function loadState() {
    let rawText
    try {
      rawText = fs.readFileSync(paths.libraryFile, 'utf8')
    } catch (error) {
      const code = /** @type {NodeJS.ErrnoException} */ (error).code
      if (code === 'ENOENT') {
        return { schema: 1, revision: 0, products: [] }
      }
      throw error
    }
    let raw
    try {
      raw = JSON.parse(rawText)
    } catch {
      throw new ProductsError('library-corrupt', 'library.json is not valid JSON')
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.products)) {
      throw new ProductsError('library-corrupt', 'library.json is missing products[]')
    }
    const products = raw.products
      .filter((row) => row && typeof row === 'object' && typeof row.id === 'string' && typeof row.name === 'string')
      .map(hydrateProduct)
    return {
      schema: 1,
      revision: Number(raw.revision) || 0,
      products,
    }
  }

  /**
   * @param {any} row
   */
  function hydrateProduct(row) {
    const name = str(row.name)
    const media = Array.isArray(row.media)
      ? row.media.filter((file) => file && typeof file.real_path === 'string').map((file, index) => ({
          id: typeof file.id === 'string' ? file.id : newRecordId('med'),
          real_path: file.real_path,
          original_name: str(file.original_name) || basename(file.real_path),
          sort_order: Number.isFinite(file.sort_order) ? Number(file.sort_order) : index,
          is_primary: Boolean(file.is_primary) || index === 0,
        }))
      : []
    return {
      id: row.id,
      name,
      handle: str(row.handle) || handleOf(name),
      kind: KIND_SET.has(row.kind) ? row.kind : 'physical',
      description: str(row.description),
      selling_points: str(row.selling_points),
      target_audience: str(row.target_audience),
      brand: str(row.brand),
      features: str(row.features),
      price: str(row.price),
      sku: str(row.sku),
      promotion: str(row.promotion),
      categories: Array.isArray(row.categories) ? row.categories.filter((tag) => typeof tag === 'string') : [],
      language: str(row.language) || 'auto',
      status: 'active',
      link: str(row.link),
      media,
      cover_media_id: typeof row.cover_media_id === 'string' ? row.cover_media_id : null,
      brand_strategy: hydrateBrandStrategy(row.brand_strategy),
      source: normalizeSource(row.source),
      created_at: str(row.created_at) || new Date().toISOString(),
      updated_at: str(row.updated_at) || str(row.created_at) || new Date().toISOString(),
    }
  }

  let state = loadState()

  function persist() {
    atomicWrite(fs, paths.libraryFile, `${JSON.stringify({
      schema: 1,
      revision: state.revision,
      products: state.products,
    }, null, 2)}\n`)
  }

  function fieldsFrom(input) {
    return {
      description: normalizeText(input?.description, 'description'),
      selling_points: normalizeText(input?.selling_points, 'selling_points'),
      target_audience: normalizeText(input?.target_audience, 'target_audience'),
      brand: normalizeText(input?.brand, 'brand'),
      features: normalizeText(input?.features, 'features'),
      price: normalizeText(input?.price, 'price'),
      sku: normalizeText(input?.sku, 'sku'),
      promotion: normalizeText(input?.promotion, 'promotion'),
      categories: normalizeCategories(input?.categories),
      language: str(input?.language).trim() || 'auto',
      link: normalizeText(input?.link, 'link'),
    }
  }

  function list(filter = {}) {
    const query = str(filter.query).trim().toLowerCase()
    let rows = state.products.map((product) => viewOf(product, fs))
    if (query) {
      rows = rows.filter((row) => {
        const hay = [
          row.name,
          row.handle,
          row.description,
          row.selling_points,
          row.target_audience,
          row.brand,
          row.sku,
          row.link,
          row.categories.join('\n'),
        ].join('\n').toLowerCase()
        return hay.includes(query)
      })
    }
    rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    return rows
  }

  /**
   * @param {string} idOrHandle
   */
  function get(idOrHandle) {
    const key = str(idOrHandle)
    const found = state.products.find((product) => product.id === key || product.handle === key)
    return found
      ? {
          ...found,
          media: found.media.map((file) => ({ ...file })),
          categories: [...found.categories],
          brand_strategy: cloneStrategy(found.brand_strategy),
        }
      : null
  }

  /**
   * @param {string} idOrHandle
   */
  function getView(idOrHandle) {
    const found = get(idOrHandle)
    return found ? viewOf(found, fs) : null
  }

  /**
   * @param {{
   *   name: unknown,
   *   kind?: unknown,
   *   description?: unknown,
   *   selling_points?: unknown,
   *   target_audience?: unknown,
   *   brand?: unknown,
   *   features?: unknown,
   *   price?: unknown,
   *   sku?: unknown,
   *   promotion?: unknown,
   *   categories?: unknown,
   *   language?: unknown,
   *   link?: unknown,
   *   media?: unknown,
   *   cover_media_id?: unknown,
   *   brand_strategy?: unknown,
   *   source?: string,
   *   requireContent?: boolean,
   * }} input
   */
  function add(input) {
    const name = normalizeName(input?.name)
    const handle = handleOf(name)
    if (state.products.some((product) => product.handle === handle)) {
      throw new ProductsError('name-conflict', 'a product with this name already exists')
    }
    if (input?.requireContent) assertAgentContent(input)
    const kind = normalizeKind(input?.kind)
    const copy = fieldsFrom(input)
    const media = normalizeMedia(input?.media, fs)
    const now = new Date().toISOString()
    const coverHint = typeof input?.cover_media_id === 'string' ? input.cover_media_id : null
    const product = {
      id: newRecordId('prd'),
      name,
      handle,
      kind,
      ...copy,
      status: 'active',
      media,
      cover_media_id: coverHint && media.some((row) => row.id === coverHint) ? coverHint : (media[0]?.id ?? null),
      brand_strategy: normalizeBrandStrategy(input?.brand_strategy),
      source: normalizeSource(input?.source),
      created_at: now,
      updated_at: now,
    }
    state.products.push(product)
    state.revision += 1
    persist()
    return viewOf(product, fs)
  }

  /**
   * @param {string} idOrHandle
   * @param {Record<string, unknown>} patch
   */
  function hasField(patch, key) {
    return Boolean(patch) && Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== undefined
  }

  function update(idOrHandle, patch) {
    const found = state.products.find((product) => product.id === idOrHandle || product.handle === idOrHandle)
    if (!found) throw new ProductsError('product-not-found', 'product not found')
    const nextMedia = hasField(patch, 'media') ? normalizeMedia(patch.media, fs) : null
    if (hasField(patch, 'name')) {
      const name = normalizeName(patch.name)
      const handle = handleOf(name)
      if (handle !== found.handle && state.products.some((product) => product.handle === handle)) {
        throw new ProductsError('name-conflict', 'a product with this name already exists')
      }
      found.name = name
      found.handle = handle
    }
    if (hasField(patch, 'kind')) {
      found.kind = normalizeKind(patch.kind)
    }
    const textKeys = ['description', 'selling_points', 'target_audience', 'brand', 'features', 'price', 'sku', 'promotion', 'link']
    for (const key of textKeys) {
      if (hasField(patch, key)) {
        found[key] = normalizeText(patch[key], key)
      }
    }
    if (hasField(patch, 'categories')) {
      found.categories = normalizeCategories(patch.categories)
    }
    if (hasField(patch, 'language')) {
      found.language = str(patch.language).trim() || 'auto'
    }
    if (nextMedia !== null) {
      found.media = nextMedia
      found.cover_media_id = found.media[0]?.id ?? null
    }
    if (hasField(patch, 'cover_media_id')) {
      const nextCover = typeof patch.cover_media_id === 'string' ? patch.cover_media_id : null
      if (nextCover && found.media.some((row) => row.id === nextCover)) found.cover_media_id = nextCover
      else if (nextCover == null) found.cover_media_id = found.media[0]?.id ?? null
    }
    if (hasField(patch, 'brand_strategy')) {
      found.brand_strategy = normalizeBrandStrategy(patch.brand_strategy)
    }
    found.status = 'active'
    found.updated_at = new Date().toISOString()
    state.revision += 1
    persist()
    return viewOf(found, fs)
  }

  /**
   * Delete only the JSON record. Never unlinks real_path.
   * @param {string} idOrHandle
   */
  function remove(idOrHandle) {
    const index = state.products.findIndex((product) => product.id === idOrHandle || product.handle === idOrHandle)
    if (index < 0) throw new ProductsError('product-not-found', 'product not found')
    state.products.splice(index, 1)
    state.revision += 1
    persist()
  }

  function revision() {
    return state.revision
  }

  /**
   * @param {string} productId
   * @param {string} mediaId
   * @returns {{ absolutePath: string, mime: string, size: number }}
   */
  function resolvePreview(productId, mediaId) {
    const product = get(productId)
    if (!product) throw new ProductsError('product-not-found', 'product not found')
    const file = product.media.find((row) => row.id === mediaId)
    if (!file) throw new ProductsError('path-not-found', 'product media not found')
    const view = mediaView(file.real_path, fs)
    if (!view) throw new ProductsError('path-not-found', 'path does not exist')
    const mime = previewMimeOf(view.original_name)
    if (!mime) throw new ProductsError('path-unsupported', 'preview only supports image and video')
    return { absolutePath: file.real_path, mime, size: view.size }
  }

  return { list, get, getView, add, update, remove, revision, resolvePreview }
}
