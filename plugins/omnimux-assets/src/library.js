/**
 * Creative-asset library: named objects with materialized files.
 *
 * New writes copy into `$DSH_HOME/omnimux/assets/data/files/<id>/` and persist
 * vault-relative `relative_path`. User originals are never unlinked.
 * Deleting a record recycles the managed copy only.
 */
import { accessSync, constants, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { bucketOf, extOf, previewMimeOf, scanDir, scanFile, statStatus } from './scanner.js'
import { AssetsError, newRecordId } from './mappings.js'
import { formatAssetUri, isAssetUri, parseAssetUri, toAssetUri } from './protocol.js'
import { copyIntoVault, copyIntoVaultSync, isInsideDir, resolveVaultRelPath } from './ingest.js'

const DEFAULT_FS = { accessSync, constants, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync }

export const ASSET_TYPES = Object.freeze(['character', 'scene', 'style', 'prop', 'knowledge', 'custom'])

/** Citation prefix in @类型/名称. Chinese labels are the product surface. */
export const TYPE_CITE = Object.freeze({
  character: '角色',
  scene: '场景',
  style: '风格包',
  prop: '道具',
  knowledge: '知识包',
  custom: '自定义',
})

const TYPE_SET = new Set(ASSET_TYPES)
const NAME_MAX = 40
const DESCRIPTION_MAX = 4000
const HANDLE_FORBIDDEN = /[/\u0000-\u001f]/

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
 * Unselected type falls into custom (not a seventh creative kind).
 * @param {unknown} type
 */
export function normalizeType(type) {
  const raw = str(type).trim()
  if (raw === '') return 'custom'
  if (!TYPE_SET.has(raw)) throw new AssetsError('type-invalid', 'unknown asset type')
  return raw
}

/**
 * @param {unknown} name
 */
export function normalizeName(name) {
  const trimmed = str(name).trim()
  if (!trimmed) throw new AssetsError('name-required', 'display name is required')
  if (trimmed.length > NAME_MAX) throw new AssetsError('name-invalid', `display name must be at most ${NAME_MAX} characters`)
  if (HANDLE_FORBIDDEN.test(trimmed)) throw new AssetsError('name-invalid', 'display name cannot contain slashes or control characters')
  return trimmed
}

/**
 * @param {unknown} description
 */
export function normalizeDescription(description) {
  const text = str(description)
  if (text.length > DESCRIPTION_MAX) throw new AssetsError('description-too-long', `description must be at most ${DESCRIPTION_MAX} characters`)
  return text
}

/**
 * @param {unknown} tags
 * @returns {string[]}
 */
export function normalizeTags(tags) {
  if (tags == null) return []
  if (!Array.isArray(tags)) throw new AssetsError('tags-invalid', 'tags must be an array of strings')
  const out = []
  const seen = new Set()
  for (const item of tags) {
    const tag = str(item).trim()
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= 20) break
  }
  return out
}

/**
 * Handle used in @type/name citations. Same display name shares one handle.
 * @param {string} name
 */
export function handleOf(name) {
  return name.trim().replace(/\s+/g, ' ')
}

/**
 * Resolve a ledger file row to an absolute path inside the vault when possible.
 * @param {{ relative_path?: string, real_path?: string }} file
 * @param {string | undefined} vaultRoot
 */
function absoluteOf(file, vaultRoot) {
  const rel = str(file?.relative_path).trim()
  if (rel && vaultRoot) {
    try {
      return resolveVaultRelPath(vaultRoot, rel)
    } catch {
      return ''
    }
  }
  return str(file?.real_path).trim()
}

/**
 * Visible file probe: missing path → hidden (record stays on disk JSON).
 * @param {string} absPath
 * @param {{ statSync: typeof statSync }} fs
 * @param {{ relative_path?: string, original_name?: string }} [file]
 */
function fileView(absPath, fs, file = {}) {
  const path = str(absPath).trim()
  if (!path) return null
  try {
    const info = fs.statSync(path)
    if (!info.isFile() && !info.isDirectory()) return null
    const name = str(file.original_name) || basename(path.replace(/\/+$/, '')) || path
    const ext = extOf(name)
    const kind = info.isDirectory() ? 'directory' : bucketOf(ext)
    const relative = str(file.relative_path)
    return {
      relative_path: relative || undefined,
      real_path: path,
      original_name: name,
      kind,
      size: info.isFile() ? Number(info.size) || 0 : null,
      visible: true,
    }
  } catch {
    return null
  }
}

/**
 * @param {{
 *   id: string,
 *   name: string,
 *   handle: string,
 *   type: string,
 *   description: string,
 *   tags: string[],
 *   files: { id: string, relative_path?: string, real_path?: string, original_name?: string }[],
 *   cover_file_id: string | null,
 *   source: string,
 *   created_at: string,
 *   updated_at: string,
 * }} asset
 * @param {{ statSync: typeof statSync }} fs
 * @param {string | undefined} vaultRoot
 */
function viewOf(asset, fs, vaultRoot) {
  const visibleFiles = []
  for (const file of asset.files) {
    const abs = absoluteOf(file, vaultRoot)
    const live = fileView(abs, fs, file)
    if (!live) continue
    visibleFiles.push({
      id: file.id,
      uri: toAssetUri(abs, { scope: asset.type }),
      ...live,
    })
  }
  const cover = visibleFiles.find((row) => row.id === asset.cover_file_id)
    ?? visibleFiles.find((row) => row.kind === 'image')
    ?? visibleFiles[0]
    ?? null
  return {
    ...asset,
    uri: formatAssetUri(asset.type, asset.handle || asset.id),
    files: visibleFiles,
    cover_file_id: cover ? cover.id : null,
    cover: cover,
    missing_file_count: asset.files.length - visibleFiles.length,
    cite: citeOf(asset.name, asset.type),
  }
}

/**
 * @param {string} type
 */
export function typeCiteLabel(type) {
  return TYPE_CITE[type] || TYPE_CITE.custom
}

/**
 * @param {string} name
 * @param {string} type
 */
export function citeOf(name, type) {
  return `@${typeCiteLabel(type)}/${name}`
}

/**
 * @param {unknown[]} files
 * @param {{ statSync: typeof statSync, accessSync: typeof accessSync, constants: typeof constants }} fs
 * @param {{ requireExisting?: boolean }} [opts]
 */
function normalizeFiles(files, fs, opts = {}) {
  if (files == null) return []
  if (!Array.isArray(files)) throw new AssetsError('files-invalid', 'files must be an array')
  const out = []
  const seen = new Set()
  for (const item of files) {
    const path = typeof item === 'string' ? item.trim() : str(item?.real_path ?? item?.path).trim()
    if (!path) continue
    if (seen.has(path)) continue
    seen.add(path)
    const statusFile = statStatus(path, 'file', { stat: (p) => fs.statSync(p) })
    const statusDir = statStatus(path, 'directory', { stat: (p) => fs.statSync(p) })
    const exists = statusFile === 'ok' || statusDir === 'ok'
    if (!exists) {
      // Spec: missing paths are refused as files, the asset itself can still be created.
      if (opts.requireExisting) throw new AssetsError('path-not-found', 'path does not exist')
      continue
    }
    try {
      fs.accessSync(path, fs.constants.R_OK)
    } catch {
      if (opts.requireExisting) throw new AssetsError('path-denied', 'path is not readable')
      continue
    }
    const name = typeof item === 'object' && item ? str(item.original_name) : ''
    out.push({
      id: newRecordId('fil'),
      real_path: path,
      original_name: name || basename(path.replace(/\/+$/, '')) || path,
    })
  }
  return out
}

/**
 * @param {{
 *   paths?: { libraryFile: string, mappingsFile?: string, dir?: string, filesDir?: string },
 *   fs?: Partial<typeof DEFAULT_FS>,
 *   migrateFrom?: { list?: Function },
 * }} [opts]
 */
export function createLibraryStore(opts = {}) {
  const fs = { ...DEFAULT_FS, ...(opts.fs ?? {}) }
  const paths = opts.paths ?? {}
  const vaultRoot = paths.dir || (paths.libraryFile ? dirname(paths.libraryFile) : '')
  const filesDir = paths.filesDir || (vaultRoot ? join(vaultRoot, 'data', 'files') : '')

  function loadState() {
    try {
      const raw = JSON.parse(fs.readFileSync(paths.libraryFile, 'utf8'))
      if (raw && typeof raw === 'object' && Array.isArray(raw.assets)) {
        const assets = raw.assets.filter((row) => row && typeof row === 'object' && typeof row.id === 'string' && typeof row.name === 'string')
        return {
          schema: 2,
          revision: Number(raw.revision) || 0,
          migrated_mappings: Boolean(raw.migrated_mappings),
          assets: assets.map(hydrateAsset),
        }
      }
    } catch {
      // fall through
    }
    return { schema: 2, revision: 0, migrated_mappings: false, assets: [] }
  }

  /**
   * @param {any} row
   */
  function hydrateAsset(row) {
    const name = str(row.name)
    const type = TYPE_SET.has(row.type) ? row.type : 'custom'
    const files = Array.isArray(row.files)
      ? row.files.filter((file) => file && (typeof file.relative_path === 'string' || typeof file.real_path === 'string')).map((file) => {
          const relative = str(file.relative_path)
          const real = str(file.real_path)
          return {
            id: typeof file.id === 'string' ? file.id : newRecordId('fil'),
            ...(relative ? { relative_path: relative } : {}),
            ...(real && !relative ? { real_path: real } : {}),
            original_name: str(file.original_name) || basename((relative || real).replace(/\/+$/, '')),
          }
        })
      : []
    return {
      id: row.id,
      name,
      handle: str(row.handle) || handleOf(name),
      type,
      description: str(row.description),
      tags: Array.isArray(row.tags) ? row.tags.filter((tag) => typeof tag === 'string') : [],
      files,
      cover_file_id: typeof row.cover_file_id === 'string' ? row.cover_file_id : null,
      source: str(row.source) || 'manual',
      created_at: str(row.created_at) || new Date().toISOString(),
      updated_at: str(row.updated_at) || str(row.created_at) || new Date().toISOString(),
    }
  }

  let state = loadState()

  /**
   * @param {{ id: string, relative_path?: string, real_path?: string, original_name?: string }} file
   */
  function persistableFile(file) {
    const relative = str(file.relative_path)
    const row = {
      id: file.id,
      original_name: str(file.original_name),
    }
    if (relative) row.relative_path = relative
    else if (file.real_path) row.real_path = file.real_path
    return row
  }

  function persist() {
    atomicWrite(fs, paths.libraryFile, `${JSON.stringify({
      schema: 2,
      revision: state.revision,
      migrated_mappings: state.migrated_mappings,
      assets: state.assets.map((asset) => ({
        ...asset,
        files: asset.files.map(persistableFile),
      })),
    }, null, 2)}\n`)
  }

  function managedDirOf(assetId) {
    return filesDir ? join(filesDir, assetId) : ''
  }

  /**
   * Copy a leftover desktop path into the vault. Missing sources stay hidden.
   * @param {string} assetId
   * @param {{ id: string, relative_path?: string, real_path?: string, original_name?: string }} file
   */
  function materializeFileSync(assetId, file) {
    if (str(file.relative_path)) return file
    const source = str(file.real_path)
    if (!source || !filesDir || !vaultRoot) return file
    try {
      const copied = copyIntoVaultSync({
        sourceAbs: source,
        destDir: managedDirOf(assetId),
        vaultRoot,
        originalName: file.original_name || basename(source.replace(/\/+$/, '')),
        fs,
      })
      return {
        id: file.id,
        relative_path: copied.relativePath,
        original_name: file.original_name || copied.name,
      }
    } catch {
      return file
    }
  }

  function materializeAssetSync(asset) {
    if (!asset || !Array.isArray(asset.files) || asset.files.length === 0) return asset
    let changed = false
    const files = asset.files.map((file) => {
      const next = materializeFileSync(asset.id, file)
      if (next !== file) changed = true
      return next
    })
    if (!changed) return asset
    asset.files = files
    persist()
    return asset
  }

  /**
   * @param {string} assetId
   * @param {unknown} files
   */
  async function materializeIncomingFiles(assetId, files) {
    const sources = normalizeFiles(files, fs, { requireExisting: false })
    if (!filesDir || !vaultRoot) return sources
    const out = []
    for (const file of sources) {
      const source = str(file.real_path)
      if (!source) continue
      const copied = await copyIntoVault({
        sourceAbs: source,
        destDir: managedDirOf(assetId),
        vaultRoot,
        originalName: file.original_name,
        fs,
      })
      out.push({
        id: file.id,
        relative_path: copied.relativePath,
        original_name: file.original_name || copied.name,
      })
    }
    return out
  }

  function recycleManagedDir(assetId) {
    const dir = managedDirOf(assetId)
    if (!dir || !vaultRoot || !isInsideDir(dir, vaultRoot)) return
    if (typeof fs.rmSync === 'function') {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore recycle failure
      }
    }
  }

  /**
   * One-shot: each v0.1 mapping becomes a custom asset pointing at the same path.
   * @param {{ list: Function }} mappings
   */
  function migrateMappings(mappings) {
    if (state.migrated_mappings) return { migrated: 0 }
    const rows = typeof mappings?.list === 'function' ? mappings.list() : []
    let count = 0
    for (const mapping of rows) {
      if (!mapping || typeof mapping.id !== 'string') continue
      const already = state.assets.some((asset) => asset.source === 'migrated-mapping' && asset.id === `ast_${mapping.id.replace(/^map_/, '')}`)
      if (already) continue
      const name = str(mapping.display_name) || basename(str(mapping.real_path)) || mapping.id
      let uniqueName = name
      let suffix = 2
      while (state.assets.some((asset) => asset.handle === handleOf(uniqueName))) {
        uniqueName = `${name} (${suffix})`
        suffix += 1
      }
      const now = new Date().toISOString()
      const path = str(mapping.real_path)
      state.assets.push({
        id: newRecordId('ast'),
        name: uniqueName,
        handle: handleOf(uniqueName),
        type: 'custom',
        description: '',
        tags: [],
        files: path
          ? [{ id: newRecordId('fil'), real_path: path, original_name: basename(path.replace(/\/+$/, '')) || path }]
          : [],
        cover_file_id: null,
        source: 'migrated-mapping',
        created_at: str(mapping.created_at) || now,
        updated_at: now,
      })
      count += 1
    }
    state.migrated_mappings = true
    state.revision += 1
    persist()
    return { migrated: count }
  }

  function list(filter = {}) {
    const type = str(filter.type).trim()
    const query = str(filter.query).trim().toLowerCase()
    let rows = state.assets.map((asset) => viewOf(materializeAssetSync(asset), fs, vaultRoot))
    if (type && TYPE_SET.has(type)) rows = rows.filter((row) => row.type === type)
    if (query) {
      rows = rows.filter((row) => {
        const hay = `${row.name}\n${row.handle}\n${row.description}\n${row.tags.join('\n')}`.toLowerCase()
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
    let parsedKey = key
    if (isAssetUri(key)) {
      const parsed = parseAssetUri(key)
      if (parsed) {
        parsedKey = parsed.path || parsed.scope
      }
    }
    const found = state.assets.find((asset) => (
      asset.id === key ||
      asset.handle === key ||
      asset.id === parsedKey ||
      asset.handle === parsedKey ||
      formatAssetUri(asset.type, asset.handle) === key ||
      formatAssetUri(asset.type, asset.id) === key
    ))
    return found ? { ...found, files: found.files.map((file) => ({ ...file })) } : null
  }

  /**
   * @param {string} idOrHandle
   */
  function getView(idOrHandle) {
    const found = get(idOrHandle)
    if (!found) return null
    const live = state.assets.find((asset) => asset.id === found.id)
    return viewOf(materializeAssetSync(live || found), fs, vaultRoot)
  }

  /**
   * @param {{ name: unknown, type?: unknown, description?: unknown, tags?: unknown, files?: unknown, source?: string }} input
   */
  async function add(input) {
    const name = normalizeName(input?.name)
    const handle = handleOf(name)
    if (state.assets.some((asset) => asset.handle === handle)) {
      throw new AssetsError('name-conflict', 'an asset with this name already exists')
    }
    const type = normalizeType(input?.type)
    const description = normalizeDescription(input?.description)
    const tags = normalizeTags(input?.tags)
    const now = new Date().toISOString()
    const asset = {
      id: newRecordId('ast'),
      name,
      handle,
      type,
      description,
      tags,
      files: [],
      cover_file_id: null,
      source: str(input?.source) || 'manual',
      created_at: now,
      updated_at: now,
    }
    asset.files = await materializeIncomingFiles(asset.id, input?.files)
    asset.cover_file_id = asset.files[0]?.id ?? null
    state.assets.push(asset)
    state.revision += 1
    persist()
    return viewOf(asset, fs, vaultRoot)
  }

  /**
   * @param {string} id
   * @param {{ name?: unknown, type?: unknown, description?: unknown, tags?: unknown, files?: unknown }} patch
   */
  async function update(id, patch) {
    const found = state.assets.find((asset) => asset.id === id)
    if (!found) throw new AssetsError('asset-not-found', 'asset not found')
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'name')) {
      const name = normalizeName(patch.name)
      const handle = handleOf(name)
      if (handle !== found.handle && state.assets.some((asset) => asset.handle === handle)) {
        throw new AssetsError('name-conflict', 'an asset with this name already exists')
      }
      found.name = name
      found.handle = handle
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'type')) {
      found.type = normalizeType(patch.type)
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'description')) {
      found.description = normalizeDescription(patch.description)
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'tags')) {
      found.tags = normalizeTags(patch.tags)
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'files')) {
      found.files = await materializeIncomingFiles(found.id, patch.files)
      found.cover_file_id = found.files[0]?.id ?? null
    }
    found.updated_at = new Date().toISOString()
    state.revision += 1
    persist()
    return viewOf(found, fs, vaultRoot)
  }

  /**
   * Drop the JSON record and recycle `data/files/<id>/`. Never unlinks user originals.
   * @param {string} id
   */
  function remove(id) {
    const index = state.assets.findIndex((asset) => asset.id === id)
    if (index < 0) throw new AssetsError('asset-not-found', 'asset not found')
    const assetId = state.assets[index].id
    state.assets.splice(index, 1)
    state.revision += 1
    persist()
    recycleManagedDir(assetId)
  }

  function revision() {
    return state.revision
  }

  /**
   * Keep a drill-down inside one stored file ref. Same escape rules as mapping
   * scan: lexical resolve + realpath must stay under the file root.
   * @param {string} rootPath
   * @param {string} subPath
   */
  function resolveFileSubPath(rootPath, subPath) {
    const cleaned = String(subPath ?? '').replace(/^\/+/, '')
    if (cleaned === '') return rootPath
    let rootReal
    try {
      rootReal = fs.realpathSync ? fs.realpathSync(rootPath) : resolve(rootPath)
    } catch {
      throw new AssetsError('path-not-found', 'file root does not exist')
    }
    const resolved = resolve(rootReal, cleaned)
    if (resolved !== rootReal && !resolved.startsWith(rootReal + sep)) {
      throw new AssetsError('path-denied', 'sub path escapes the file root')
    }
    let real
    try {
      real = fs.realpathSync ? fs.realpathSync(resolved) : resolved
    } catch {
      throw new AssetsError('path-not-found', 'sub path does not exist')
    }
    if (real !== rootReal && !real.startsWith(rootReal + sep)) {
      throw new AssetsError('path-denied', 'sub path escapes the file root')
    }
    return real
  }

  /**
   * One-layer listing for an asset file ref. Directories are not flattened.
   * @param {string} assetId
   * @param {string} fileId
   * @param {string} [subPath]
   */
  function listFileEntries(assetId, fileId, subPath = '') {
    const live = get(assetId)
    if (!live) throw new AssetsError('asset-not-found', 'asset not found')
    const stored = state.assets.find((row) => row.id === live.id) || live
    materializeAssetSync(stored)
    const file = stored.files.find((row) => row.id === fileId)
    if (!file) throw new AssetsError('path-not-found', 'asset file not found')
    const abs = absoluteOf(file, vaultRoot)
    const view = fileView(abs, fs, file)
    if (!view) throw new AssetsError('path-not-found', 'path does not exist')
    if (view.kind !== 'directory') {
      if (String(subPath ?? '') !== '') {
        throw new AssetsError('path-not-dir', 'file refs have no sub directories')
      }
      return { file: { id: file.id, ...view }, path: '', entries: scanFile(abs, { stat: (p) => fs.statSync(p) }) }
    }
    const target = resolveFileSubPath(abs, subPath)
    const prefix = String(subPath ?? '').replace(/^\/+|\/+$/g, '')
    return {
      file: { id: file.id, ...view },
      path: prefix,
      entries: scanDir(target, { prefix }, { readdir: (p) => fs.readdirSync(p), stat: (p) => fs.statSync(p) }),
    }
  }

  /**
   * Resolve an in-library media file for read-only preview. Directories and
   * unknown types are refused — never streams a user path blindly.
   * @param {string} assetId
   * @param {string} fileId
   * @param {string} [subPath]
   * @returns {{ absolutePath: string, mime: string, size: number }}
   */
  function resolvePreview(assetId, fileId, subPath = '') {
    const live = get(assetId)
    if (!live) throw new AssetsError('asset-not-found', 'asset not found')
    const stored = state.assets.find((row) => row.id === live.id) || live
    materializeAssetSync(stored)
    const file = stored.files.find((row) => row.id === fileId)
    if (!file) throw new AssetsError('path-not-found', 'asset file not found')
    const abs = absoluteOf(file, vaultRoot)
    const view = fileView(abs, fs, file)
    if (!view) throw new AssetsError('path-not-found', 'path does not exist')
    let absolutePath = abs
    if (view.kind === 'directory') {
      const cleaned = String(subPath ?? '').replace(/^\/+/, '')
      if (cleaned === '') throw new AssetsError('path-not-dir', 'folders cannot be previewed')
      absolutePath = resolveFileSubPath(abs, cleaned)
    } else if (String(subPath ?? '') !== '') {
      throw new AssetsError('path-not-dir', 'file refs have no sub directories')
    }
    let info
    try {
      info = fs.statSync(absolutePath)
    } catch {
      throw new AssetsError('path-not-found', 'path does not exist')
    }
    if (!info.isFile()) throw new AssetsError('path-not-dir', 'preview target is not a file')
    const mime = previewMimeOf(basename(absolutePath.replace(/\/+$/, '')))
    if (!mime) throw new AssetsError('path-unsupported', 'preview only supports image and video')
    return { absolutePath, mime, size: Number(info.size) || 0 }
  }

  return { list, get, getView, add, update, remove, migrateMappings, revision, listFileEntries, resolvePreview }
}
