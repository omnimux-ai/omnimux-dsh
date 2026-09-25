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
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AssetsError } from './mappings.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_CATALOG_DIR = resolve(HERE, '..', 'cloud-catalog')

const FILE_LOCATOR = 'file:'
/** Cross-category scope: the client's 全部 tab searches the whole catalog. */
const ALL_CATEGORY = 'all'
/** The one category whose rows carry the eight professional dimensions. */
const CHARACTER_CATEGORY = 'character'
/** Saving a remote asset to the local library is bounded so one click cannot
 *  pull a multi-gigabyte clip; local copies are trusted and not size-checked. */
const MAX_REMOTE_SAVE_BYTES = 512 * 1024 * 1024
const REMOTE_FETCH_TIMEOUT_MS = 120_000
/** A staging slice left behind by a crashed save is swept once it is this old.
 *  A running save cannot reach that age: both of its downloads are bounded by
 *  the fetch timeout, so the whole save finishes far sooner. */
const STAGING_STALE_MS = 30 * 60 * 1000
/** A staging slice is a name this module minted, never a path a caller steers. */
const STAGING_SCOPE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

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
 * @typedef {{ id: string, category: string, sub_category: string,
 *   sub_categories?: string[], name: string,
 *   media_type: string, media_url: string, cover_url: string, tags: string[] }} CatalogIndexRow
 */

/**
 * Every shelf a catalog row belongs to.
 *
 * A row's `sub_category` is its primary shelf; `sub_categories` carries the full
 * membership list and is only longer where a category has more than one axis
 * (角色: gender and scene). A catalog built before that field existed still
 * scopes correctly, because the primary shelf is the fallback.
 * @param {CatalogIndexRow} row
 * @returns {string[]}
 */
export function catalogShelves(row) {
  const shelves = Array.isArray(row?.sub_categories) ? row.sub_categories : []
  if (shelves.length > 0) return shelves
  return row?.sub_category ? [row.sub_category] : []
}

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
  const getFetch = () => deps.fetchImpl ?? globalThis.fetch

  /** @type {Record<string, unknown> | null} */
  let manifest = null
  /** @type {Map<string, CatalogIndexRow> | null} */
  let index = null
  let sourceRoot = ''
  let loaded = false
  /** Monotonic part of a staging slice name: the clock alone can repeat. */
  let stagingSeq = 0

  function load() {
    if (loaded) return
    const parsedManifest = readJsonFile(join(catalogDir, 'manifest.json'))
    const parsedIndex = readJsonFile(join(catalogDir, 'index.json'))
    // 读到有效目录之后才上锁。目录缺失、或正撞上物化脚本「删掉再整份拷回」的窗口时这里会
    // 读空，那就保持「未加载」，让下一次请求重试——否则一次瞬时读空会把插件永久钉在
    // 「目录未构建」上，只能靠重启应用恢复。
    if (!parsedManifest || !Array.isArray(parsedIndex)) return
    loaded = true
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
   *
   * `dims` carries the 角色 filter bar's selection, so a search narrows what the
   * chips already narrowed instead of widening it: after picking 女性, typing a
   * male name must not surface a male row. The tokens are matched exactly as
   * `filter` matches them, so the two routes can never disagree about what a
   * combination means.
   * @param {{ q?: string, category?: string, subCategory?: string,
   *   dims?: string | string[], limit?: number, offset?: number }} query
   */
  function search(query) {
    if (!ready()) {
      throw new AssetsError('catalog-unavailable', 'cloud assets catalog is not built; run the build:cloud-catalog script')
    }
    const needle = String(query.q ?? '').trim().toLowerCase()
    const category = String(query.category ?? '')
    const subCategory = String(query.subCategory ?? '')
    const wants = asTokenList(query.dims)
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 24))
    const offset = Math.max(0, Number(query.offset) || 0)

    const rows = [.../** @type {Map<string, CatalogIndexRow>} */ (index).values()].filter((row) => {
      // 全部 is a scope, not a category: it matches every row, so the search box
      // keeps working while the tab sits on the whole-catalog view.
      if (category !== '' && category !== ALL_CATEGORY && row.category !== category) return false
      if (subCategory !== '' && !catalogShelves(row).includes(subCategory)) return false
      if (!matchesDimensionTokens(row, wants)) return false
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
   * The catalog rows that satisfy a dimension query, paged.
   *
   * 角色 is catalogued on eight professional dimensions, and their combination
   * space is far larger than the catalog should carry as files, so the filtered
   * view is answered here from `index.json` instead of from a page shard. Both
   * sides of the comparison are tokenized the same way, so a token the caller
   * makes up simply matches nothing rather than being trusted.
   *
   * @param {{ dims?: string | string[], limit?: number, offset?: number }} query
   */
  function filter(query) {
    if (!ready()) {
      throw new AssetsError('catalog-unavailable', 'cloud assets catalog is not built; run the build:cloud-catalog script')
    }
    const wants = asTokenList(query.dims)
    if (wants.length === 0) {
      throw new AssetsError('catalog-filter-invalid', 'a dimension filter needs at least one token')
    }
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 24))
    const offset = Math.max(0, Number(query.offset) || 0)
    const rows = [.../** @type {Map<string, CatalogIndexRow>} */ (index).values()]
      .filter((row) => row.category === CHARACTER_CATEGORY)
      // Every selected dimension must match: the eight chips narrow one query,
      // so a row has to satisfy all of them, not any one of them.
      .filter((row) => matchesDimensionTokens(row, wants))
    const total = rows.length
    return {
      total,
      offset,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      items: rows.slice(offset, offset + limit),
    }
  }

  /**
   * Helper to resolve either a primary locator or a remote fallback locator.
   * @param {string | undefined} primaryLocator
   * @param {string | undefined} fallbackLocator
   */
  function resolveResource(primaryLocator, fallbackLocator) {
    if (primaryLocator) {
      const resolved = resolveMedia(primaryLocator)
      if (resolved !== null) return resolved
    }
    if (fallbackLocator) {
      const resolved = resolveMedia(fallbackLocator)
      if (resolved !== null) return resolved
    }
    return null
  }

  /**
   * Copy (or download) one catalog row's media into the local asset library.
   *
   * Downloads both cover (image) and media (audio/video/other) files into the
   * local managed library vault, falling back to cloud remote URLs when local
   * file locators are unavailable.
   *
   * Two saves may overlap — the client admits one save per asset id, so clicking
   * a second card while the first is still running starts a second request. Each
   * save therefore downloads into a staging slice of its own and clears only
   * that slice: a save finishing must never delete what another save staged.
   *
   * @param {string} id
   * @param {{ type?: string, name?: string }} [options]
   */
  async function saveToLocal(id, options = {}) {
    if (!library) throw new AssetsError('catalog-unavailable', 'local library is not available')
    const row = getRow(id)
    if (!row) throw new AssetsError('catalog-not-found', 'cloud asset not found')

    const baseName = String(options.name ?? '').trim() || row.name
    // 若已存过该云端行且未指定重命名，直接复用返回现有资产
    if (!options.name && typeof library.list === 'function') {
      const existing = library.list().find((item) => item.source === `cloud:${row.id}`)
      if (existing) return existing
    }

    let targetName = baseName
    let nameSuffix = 2
    while (typeof library.get === 'function' && library.get(targetName)) {
      targetName = `${baseName} (${nameSuffix})`
      nameSuffix += 1
    }

    /** @type {{ real_path: string, original_name: string }[]} */
    const files = []
    const seenPaths = new Set()
    /** The first remote download that failed, held back so a partial save can still land. */
    let remoteFailure = null
    /** A failed main-media slot: the row's content file never landed. */
    let mediaStagingFailed = null

    const coverPrimary = row.cover_url
    const coverFallback = row.meta?.source_cover_url
    const mediaPrimary = row.media_url
    const mediaFallback = row.meta?.source_media_url
    /** Whether the row declared anything to fetch at all. A descriptor-only row
     *  declares nothing, which is why an empty file list stays legal for it. */
    const declaredLocators = Boolean(coverPrimary || coverFallback || mediaPrimary || mediaFallback)

    // 本次保存独占一片暂存区：并发保存的清理只删自己那一片，绝不整目录抹除。
    const stagingScope = newStagingScope()
    try {
      // 1. 优先解析并下载封面图片 (cover)
      if (coverPrimary || coverFallback) {
        const resolvedCover = resolveResource(coverPrimary, coverFallback)
        if (resolvedCover?.kind === 'local' && !seenPaths.has(resolvedCover.absolutePath)) {
          files.push({ real_path: resolvedCover.absolutePath, original_name: basename(resolvedCover.absolutePath) })
          seenPaths.add(resolvedCover.absolutePath)
        } else if (resolvedCover?.kind === 'remote') {
          try {
            const stagedCover = await stageRemote(resolvedCover.url, `${targetName}-cover`, stagingScope)
            if (stagedCover && !seenPaths.has(stagedCover)) {
              const ext = extensionFor(resolvedCover.url, '')
              files.push({ real_path: stagedCover, original_name: `${targetName}-cover${ext}` })
              seenPaths.add(stagedCover)
            }
          } catch (error) {
            // 封面失败只记不抛：主媒体仍有机会落地，file-too-large 保持立即失败。
            if (error instanceof AssetsError && error.code === 'file-too-large') throw error
            remoteFailure = error
          }
        }
      }

      // 2. 解析并下载主媒体文件 (audio/video/other)
      if (mediaPrimary || mediaFallback) {
        const isSameAsCover = (mediaPrimary && mediaPrimary === coverPrimary) || (mediaFallback && mediaFallback === coverFallback)
        if (!isSameAsCover) {
          const resolvedMedia = resolveResource(mediaPrimary, mediaFallback)
          if (resolvedMedia === null) {
            // 声明了主媒体却连定位符都解析不出内容 —— 主媒体槽同样是空的。
            mediaStagingFailed = new AssetsError('cloud-media-unavailable', 'cloud asset media is not available')
          } else if (resolvedMedia.kind === 'local' && !seenPaths.has(resolvedMedia.absolutePath)) {
            files.push({ real_path: resolvedMedia.absolutePath, original_name: basename(resolvedMedia.absolutePath) })
            seenPaths.add(resolvedMedia.absolutePath)
          } else if (resolvedMedia.kind === 'remote') {
            try {
              const stagedMedia = await stageRemote(resolvedMedia.url, targetName, stagingScope)
              if (stagedMedia && !seenPaths.has(stagedMedia)) {
                const ext = extensionFor(resolvedMedia.url, '')
                files.push({ real_path: stagedMedia, original_name: `${targetName}${ext}` })
                seenPaths.add(stagedMedia)
              }
            } catch (error) {
              // 主媒体失败只记不抛：封面可能已经落地，是否成行交给下面那道闸判断。
              if (error instanceof AssetsError && error.code === 'file-too-large') throw error
              remoteFailure = error
              mediaStagingFailed = error
            }
          }
        }
      }

      // 主媒体槽失败即抛 —— 封面落地也不能把「没存下内容文件」报成成功；
      // 声明了定位符却一个文件都没落地同样是失败，必须可见，不得落一条空资产。
      if (mediaStagingFailed || (files.length === 0 && (remoteFailure || declaredLocators))) {
        throw mediaStagingFailed ?? remoteFailure ?? new AssetsError('cloud-media-unavailable', 'cloud asset media is not available')
      }

      // 复制阶段不得静默少文件：声明过的路径必须先全部还在盘上。
      const missing = missingDeclaredFiles(files)
      if (missing.length > 0) {
        console.error(`[assets] cloud save ${row.id}: declared file is gone before the copy: ${missing.join(', ')}`)
        throw new AssetsError('internal', `declared file is gone before the copy: ${missing.join(', ')}`)
      }

      const asset = await library.add({
        name: targetName,
        type: String(options.type ?? '') || typeForCategory(row.category),
        description: descriptionFor(row),
        tags: row.tags ?? [],
        files,
        source: `cloud:${row.id}`,
      })

      // library.add 对已消失的路径静默 continue；落地数少于声明数就是「已声明却未落地」。
      // 半截资产不得冒充成功：撤掉它，把失败交给调用方。
      if (Array.isArray(asset?.files) && asset.files.length < files.length) {
        const detail = `${asset.files.length}/${files.length} declared files landed`
        console.error(`[assets] cloud save ${row.id}: copy stage dropped a declared file (${detail})`)
        rollbackAddedAsset(asset)
        throw new AssetsError('internal', `copy stage dropped a declared file (${detail})`)
      }
      return asset
    } finally {
      clearStaging(stagingScope)
    }
  }

  /** Root of the staging area; one slice per save lives under it. */
  function stagingRoot() {
    return join(catalogDir, '.staging')
  }

  /**
   * A staging slice name for one save. Two saves running at the same time get
   * different slices, so the one that finishes first cannot delete the other's
   * downloads — which is what the client's per-asset-id concurrency produces.
   */
  function newStagingScope() {
    stagingSeq += 1
    return `${Date.now().toString(36)}-${stagingSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  /** @param {string} url @param {string} name @param {string} scope */
  async function stageRemote(url, name, scope) {
    const fetchFunc = getFetch()
    if (typeof fetchFunc !== 'function') {
      throw new AssetsError('remote-fetch-failed', 'remote asset download failed')
    }
    const staging = join(stagingRoot(), scope)
    mkdirSync(staging, { recursive: true, mode: 0o700 })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS)
    try {
      const response = await fetchFunc(url, { signal: controller.signal })
      if (!response.ok) {
        throw new AssetsError('remote-fetch-failed', `remote asset answered HTTP ${response.status}`)
      }
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
      // 网络故障、超时与 abort 都是取用失败：可见地失败，不返回半截结果。
      throw new AssetsError('remote-fetch-failed', 'remote asset download failed')
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Undo an asset that landed short of what the save declared, so a half asset
   * never survives as if the save had succeeded.
   * @param {{ id?: string }} asset
   */
  function rollbackAddedAsset(asset) {
    if (typeof library?.remove !== 'function' || typeof asset?.id !== 'string') return
    try {
      library.remove(asset.id)
    } catch {
      // The failure is already on its way out; a failed undo must not hide it.
    }
  }

  /**
   * Drop staged downloads after they have been copied into the library.
   *
   * With a `scope` only that save's own slice is removed — which is what keeps
   * two overlapping saves from deleting each other's staged files. Without one
   * (the call shape the route and the Host tool keep) only slices that cannot
   * belong to a running save are swept: empty ones, and ones older than
   * {@link STAGING_STALE_MS}. A slice a save is still writing to is never
   * touched, and the whole directory is never removed in one go.
   * @param {string} [scope]
   */
  function clearStaging(scope) {
    const root = stagingRoot()
    if (!existsSync(root)) return
    const wanted = typeof scope === 'string' ? scope.trim() : ''
    if (wanted !== '') {
      // A scope is a name this module minted; anything else is not a path to follow.
      if (STAGING_SCOPE_PATTERN.test(wanted)) removeDir(join(root, wanted))
    } else {
      sweepStaleSlices(root)
    }
    removeDirIfEmpty(root)
  }

  return {
    ready,
    reload,
    getManifest,
    getRow,
    search,
    filter,
    resolveMedia,
    resolveRowMedia,
    saveToLocal,
    clearStaging,
    catalogDir,
    /** Diagnostic only: never used to build a path the caller chooses. */
    getSourceRoot: () => sourceRoot,
  }
}

/** @param {unknown} value */
function asTokenList(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => asTokenList(entry))
  }
  return String(value ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token !== '')
}

/**
 * Whether one row answers every wanted dimension token.
 *
 * An empty want list matches everything, which is what keeps an unfiltered
 * search reading the whole catalog. A row carrying no dimensions of its own —
 * every category but 角色 — answers no token at all, so a dimension query can
 * never reach outside 角色 through the search box.
 * @param {CatalogIndexRow} row
 * @param {string[]} wants
 */
function matchesDimensionTokens(row, wants) {
  if (wants.length === 0) return true
  const tokens = dimensionTokensOf(row)
  return wants.every((token) => tokens.includes(token))
}

/**
 * The filter tokens one catalog row answers to: every dimension value it carries,
 * slugged and prefixed. Mirrors `characterFilterKey` in the build script and in
 * the client, so all three agree on what `1general_lifestyle` means.
 * @param {CatalogIndexRow} row
 * @returns {string[]}
 */
function dimensionTokensOf(row) {
  const dims = row?.meta?.dims
  if (!dims || typeof dims !== 'object') return []
  return Object.values(dims).map(dimensionToken)
}

/** @param {unknown} value */
function dimensionToken(value) {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? '' : `1${slug.replace(/-/g, '_')}`
}

/** @param {string} category */
function typeForCategory(category) {
  // The library's own vocabulary already covers every cloud category except
  // material and audio, which are not creative-object types and therefore land
  // in custom.
  return category === 'character' || category === 'scene' || category === 'style' || category === 'prop' || category === 'knowledge'
    ? category
    : 'custom'
}

/** @param {CatalogIndexRow} row */
function descriptionFor(row) {
  const shelves = catalogShelves(row)
  const parts = [row.description]
  if (shelves.length > 0) parts.push(`云端分类：${shelves.join(' / ')}`)
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

/**
 * Declared slots whose file is no longer on disk.
 *
 * `library.add` copies what it is handed and silently drops a path that has
 * gone away, which would turn a lost staging file into a smaller "successful"
 * save. A save must never claim a slot it did not fill.
 * @param {{ real_path: string }[]} files
 * @returns {string[]}
 */
function missingDeclaredFiles(files) {
  return files.map((file) => file.real_path).filter((path) => !existsSync(path))
}

/** @param {string} dir */
function removeDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Staging is best-effort; a leftover file is harmless and cleaned next run.
  }
}

/**
 * Remove the staging slices under `root` that cannot belong to a running save:
 * empty ones, and ones older than {@link STAGING_STALE_MS}. A slice a save is
 * still writing to is left alone, and the whole directory is never wiped.
 * @param {string} root
 */
function sweepStaleSlices(root) {
  let entries = []
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  const cutoff = Date.now() - STAGING_STALE_MS
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    if (isDirEmpty(dir) || mtimeOf(dir) < cutoff) removeDir(dir)
  }
}

/** @param {string} dir */
function removeDirIfEmpty(dir) {
  if (isDirEmpty(dir)) removeDir(dir)
}

/** @param {string} dir */
function isDirEmpty(dir) {
  try {
    return readdirSync(dir).length === 0
  } catch {
    return false
  }
}

/** @param {string} dir */
function mtimeOf(dir) {
  try {
    return statSync(dir).mtimeMs
  } catch {
    // Unreadable means unknown age, and unknown age is never old enough to sweep.
    return Number.POSITIVE_INFINITY
  }
}

/** Exported for the route layer and its tests. */
export { FILE_LOCATOR, MAX_REMOTE_SAVE_BYTES, mimeOf }
