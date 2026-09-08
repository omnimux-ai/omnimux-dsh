/**
 * Creative-asset library: named objects with materialized files.
 *
 * New writes copy into `$DSH_HOME/omnimux/assets/data/files/<id>/` and persist
 * vault-relative `relative_path`. User originals are never unlinked.
 * Deleting a record recycles the managed copy only.
 */
import { accessSync, constants, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { validateLedger, safeRelative } from './storage-types.js'
import { directoryPage, logicalEntries } from './directory-page.js'
import { storageSync, storageSync as defaultStorageSync } from './storage-fs.js'
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
function atomicWrite(fs, file, text, sync = storageSync) {
  fs.mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  sync('json', { root: dirname(file), rel: basename(file), value: JSON.parse(text) })
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
function viewOf(asset, fs, vaultRoot, probes = null) {
  const visibleFiles = []
  for (const file of asset.files) {
    if (['unmigrated', 'excluded'].includes(file.status) || (probes && !file.relative_path)) continue
    if (file.relative_path && vaultRoot) {
      try {
        const probe = probes ? probes.get(file.relative_path) : storageSync('stat', { root: vaultRoot, rel: file.relative_path })
        if (!probe || probe.kind === 'unsafe') continue
        if (probe.kind === 'directory' && (probes ? probe.excluded : storageSync('scan', { root: vaultRoot, rel: file.relative_path, metadataOnly: true }).excluded.length)) continue
      } catch { continue }
    }
    const abs = absoluteOf(file, vaultRoot)
    const probe = probes?.get(file.relative_path)
    const live = probes ? (probe ? {
      relative_path: file.relative_path, real_path: abs,
      original_name: file.original_name || basename(abs),
      kind: probe.kind === 'directory' ? 'directory' : bucketOf(extOf(file.original_name || basename(abs))),
      size: probe.kind === 'directory' ? null : Number(probe.identity?.size ?? probe.size ?? 0), visible: true,
    } : null) : fileView(abs, fs, file)
    if (!live) continue
    visibleFiles.push({
      id: file.id,
      ownership: file.ownership ?? 'unknown',
      logical_path: file.logical_path,
      uri: toAssetUri(abs, { scope: asset.type, rootPath: vaultRoot }),
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
    unavailable_files: asset.files.filter((file) => ['unmigrated', 'excluded'].includes(file.status)),
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
  const storageSync = opts.safeFS ? opts.safeFS.sync.bind(opts.safeFS) : defaultStorageSync
  const fs = { ...DEFAULT_FS, ...(opts.fs ?? {}) }
  const paths = opts.paths ?? {}
  const vaultRoot = paths.dir || (paths.libraryFile ? dirname(paths.libraryFile) : '')
  const filesDir = paths.filesDir || (vaultRoot ? join(vaultRoot, 'data', 'files') : '')

  function loadState() {
    try {
      const raw = validateLedger(JSON.parse(fs.readFileSync(paths.libraryFile, 'utf8')), 'library.json')
      if (raw && typeof raw === 'object' && Array.isArray(raw.assets)) {
        const assets = raw.assets.filter((row) => row && typeof row === 'object' && typeof row.id === 'string' && typeof row.name === 'string')
        return {
          ...raw,
          schema: 3,
          revision: Number(raw.revision) || 0,
          migrated_mappings: Boolean(raw.migrated_mappings),
          assets: assets.map(hydrateAsset),
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error instanceof AssetsError ? error : new AssetsError('ledger-corrupt', 'cannot load library ledger')
    }
    return { schema: 3, revision: 0, migrated_mappings: false, assets: [], file_inventory: [] }
  }

  /**
   * @param {any} row
   */
  function hydrateAsset(row) {
    const name = str(row.name)
    const type = TYPE_SET.has(row.type) ? row.type : 'custom'
    const files = Array.isArray(row.files)
      ? row.files.filter((file) => file && (typeof file.relative_path === 'string' || typeof file.real_path === 'string' || file.status)).map((file) => {
          const relative = str(file.relative_path)
          const real = str(file.real_path)
          return {
            ...file,
            id: typeof file.id === 'string' ? file.id : newRecordId('fil'),
            ...(relative ? { relative_path: relative } : {}),
            ...(real && !relative ? { real_path: real } : {}),
            original_name: str(file.original_name) || basename((relative || real).replace(/\/+$/, '')),
          }
        })
      : []
    return {
      ...row,
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

  let state = opts.initialState ? { ...opts.initialState, assets: opts.initialState.assets.map(hydrateAsset) } : loadState()

  function makeView(asset) {
    if (!opts.safeFS) return viewOf(asset, fs, vaultRoot)
    return (async () => {
      const probes = new Map()
      for (const file of asset.files) {
        if (!file.relative_path || ['unmigrated', 'excluded'].includes(file.status)) continue
        try {
          const probe = await opts.safeFS.request('stat', { root: vaultRoot, rel: file.relative_path })
          if (probe.kind === 'directory') {
            const scanned = await opts.safeFS.request('scan', { root: vaultRoot, rel: file.relative_path, metadataOnly: true })
            probe.excluded = scanned.excluded.length
          }
          probes.set(file.relative_path, probe)
        } catch (error) {
          if (!['storage-offline', 'path-denied'].includes(error.code)) throw error
        }
      }
      return viewOf(asset, fs, vaultRoot, probes)
    })()
  }

  /**
   * @param {{ id: string, relative_path?: string, real_path?: string, original_name?: string }} file
   */
  function persistableFile(file) {
    const relative = str(file.relative_path)
    const row = {
      ...file,
      id: file.id,
      original_name: str(file.original_name),
    }
    if (relative) row.relative_path = relative
    else if (file.real_path) row.real_path = file.real_path
    return row
  }

  function ledgerValue() {
    return {
      schema: 3,
      file_inventory: state.file_inventory ?? [],
      revision: state.revision,
      migrated_mappings: state.migrated_mappings,
      assets: state.assets.map((asset) => ({
        ...asset,
        files: asset.files.map(persistableFile),
      })),
    }
  }

  function persist() {
    atomicWrite(fs, paths.libraryFile, `${JSON.stringify(ledgerValue(), null, 2)}\n`, storageSync)
  }

  async function persistAsync() {
    if (opts.safeFS) await opts.safeFS.atomicJson(vaultRoot, basename(paths.libraryFile), ledgerValue())
    else persist()
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
    if (str(file.relative_path) || opts.disableLazy || file.status) return file
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
      const containerRel = `data/files/${assetId}`
      const containerStat = storageSync('stat', { root: vaultRoot, rel: containerRel, optional: true })
      if (containerStat?.identity) {
        state.file_inventory ||= []
        if (!state.file_inventory.some((item) => item.relative_path === containerRel && item.kind === 'directory')) {
          state.file_inventory.push({
            relative_path: containerRel,
            kind: 'directory',
            ownership: 'managed',
            identity: containerStat.identity,
            owners: [assetId],
          })
        }
      }
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
        safeFS: opts.safeFS,
        fs,
      })
      const request = (op, args) => opts.safeFS ? opts.safeFS.request(op, args) : storageSync(op, args)
      const leaves = copied.kind === 'directory'
        ? (await request('scan', { root: copied.destAbs })).entries.filter((row) => row.kind === 'file').map((row) => ({ rel: `${copied.relativePath}/${row.relative_path}`, identity: row.identity }))
        : [{ rel: copied.relativePath, identity: await request('hash', { root: vaultRoot, rel: copied.relativePath }) }]
      state.file_inventory ||= []
      for (const leaf of leaves) state.file_inventory.push({ relative_path: leaf.rel, kind: 'file', ownership: 'managed', identity: leaf.identity,
        sha256: leaf.identity.sha256, size: Number(leaf.identity.size), owners: [assetId] })
      const containerRel = `data/files/${assetId}`
      const containerStat = await request('stat', { root: vaultRoot, rel: containerRel, optional: true })
      if (containerStat?.identity) {
        if (!state.file_inventory.some((item) => item.relative_path === containerRel && item.kind === 'directory')) {
          state.file_inventory.push({
            relative_path: containerRel,
            kind: 'directory',
            ownership: 'managed',
            identity: containerStat.identity,
            owners: [assetId],
          })
        }
      }
      out.push({
        id: file.id,
        relative_path: copied.relativePath,
        ownership: 'managed',
        original_name: file.original_name || copied.name,
      })
    }
    return out
  }

  /** Reclaim only inventoried leaves with no library, artifact or mapping owner. */
  function recycleManagedFiles(removed) {
    const references = state.assets.flatMap((asset) => asset.files.map((file) => file.relative_path)).filter(Boolean)
    const mappingsLedger = storageSync('read', { root: vaultRoot, rel: 'mappings.json', optional: true })
    const mappings = mappingsLedger ? validateLedger(mappingsLedger, 'mappings.json').mappings : []
    for (const mapping of mappings) {
      if (mapping.relative_path) references.push(mapping.relative_path)
    }
    const artifactsLedger = storageSync('read', { root: vaultRoot, rel: 'artifacts.json', optional: true })
    if (artifactsLedger) {
      const artifacts = validateLedger(artifactsLedger, 'artifacts.json').artifacts
      for (const artifact of artifacts) {
        if (artifact.content_ref) references.push(artifact.content_ref)
        for (const ref of artifact.input_refs ?? []) {
          if (typeof ref !== 'string') continue
          const match = ref.match(/^asset:\/\/(character|scene|style|prop|knowledge|custom|artifact|tmp)\/(.+)$/)
          if (match) {
            references.push((match[1] === 'artifact' ? 'artifacts/' : match[1] === 'tmp' ? 'tmp/' : '') + match[2])
          } else {
            if (ref === removed.id) {
              references.push(...removed.files.map((file) => file.relative_path).filter(Boolean))
            } else {
              const matchedFile = removed.files.find((file) => file.id === ref)
              if (matchedFile?.relative_path) references.push(matchedFile.relative_path)
              const matchedMapping = mappings.find((m) => m.id === ref)
              if (matchedMapping?.relative_path) references.push(matchedMapping.relative_path)
            }
          }
        }
      }
    }
    const includes = (rel, parent) => rel === parent || rel.startsWith(`${parent}/`)
    const candidates = (state.file_inventory ?? []).filter((item) => item.ownership === 'managed' &&
      removed.files.some((file) => file.ownership !== 'adopted' && file.relative_path && includes(item.relative_path, file.relative_path)))
    const retained = []
    const cleaned = []
    for (const item of candidates) {
      if (references.some((rel) => includes(item.relative_path, rel) || includes(rel, item.relative_path))) { retained.push(item.relative_path); continue }
      try {
        storageSync('unlink', { root: vaultRoot, rel: item.relative_path, expected: item.identity })
        cleaned.push(item.relative_path)
      } catch (error) { retained.push({ path: item.relative_path, reason: error.code }) }
    }
    state.file_inventory = (state.file_inventory ?? []).filter((item) => !cleaned.includes(item.relative_path))
    if (cleaned.length) persist()
    // Only the application-created ID container can be removed, and only if empty and credentials verified.
    const rel = `data/files/${removed.id}`
    const containerEntry = (state.file_inventory ?? []).find((item) => item.relative_path === rel && item.kind === 'directory')
    const containerExpected = containerEntry?.identity ?? removed.container_identity
    if (containerExpected?.ino && containerExpected?.dev && removed.files.some((file) => file.ownership === 'managed' && file.relative_path?.startsWith(`${rel}/`))) {
      try {
        storageSync('rmdir', { root: vaultRoot, rel, expected: { ino: containerExpected.ino, dev: containerExpected.dev } })
        state.file_inventory = (state.file_inventory ?? []).filter((item) => item.relative_path !== rel)
      } catch (error) {
        if (!['path-denied', 'storage-offline', 'plan-stale'].includes(error.code)) retained.push({ path: rel, reason: error.code })
      }
    }
    return { cleaned: cleaned.length, retained }
  }

  /**
   * One-shot: each v0.1 mapping becomes a custom asset pointing at the same path.
   * @param {{ list: Function }} mappings
   */
  function migrateMappings(mappings, deferPersist = false) {
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
    if (!deferPersist) persist()
    return { migrated: count }
  }

  function list(filter = {}) {
    const type = str(filter.type).trim()
    const query = str(filter.query).trim().toLowerCase()
    let rows = state.assets.slice()
    if (type && TYPE_SET.has(type)) rows = rows.filter((row) => row.type === type)
    if (query) rows = rows.filter((row) => `${row.name}\n${row.handle}\n${row.description}\n${row.tags.join('\n')}`.toLowerCase().includes(query))
    rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    if (!opts.safeFS) return rows.map((asset) => makeView(materializeAssetSync(asset)))
    return (async () => {
      const views = []
      for (const asset of rows) views.push(await makeView(asset))
      return views
    })()
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
    return makeView(materializeAssetSync(live || found))
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
    await persistAsync()
    return makeView(asset)
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
    await persistAsync()
    return makeView(found)
  }

  /**
   * Drop the JSON record and recycle `data/files/<id>/`. Never unlinks user originals.
   * @param {string} id
   */
  function remove(id) {
    const index = state.assets.findIndex((asset) => asset.id === id)
    if (index < 0) throw new AssetsError('asset-not-found', 'asset not found')
    const removed = state.assets[index]
    state.assets.splice(index, 1)
    state.revision += 1
    persist()
    return { removed: removed.id, ...recycleManagedFiles(removed) }
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
  function listFileEntries(assetId, fileId, subPath = '', pageOptions = undefined) {
    if (pageOptions) return listDirectoryPage(assetId, fileId, subPath, pageOptions)
    if (opts.safeFS) return listSafeFileEntries(assetId, fileId, subPath)
    const live = get(assetId)
    if (!live) throw new AssetsError('asset-not-found', 'asset not found')
    const stored = state.assets.find((row) => row.id === live.id) || live
    materializeAssetSync(stored)
    const file = stored.files.find((row) => row.id === fileId)
    if (!file || ['unmigrated', 'excluded'].includes(file.status)) throw new AssetsError('path-not-found', 'asset file not available')
    if (file.relative_path) {
      const probe = storageSync('stat', { root: vaultRoot, rel: file.relative_path })
      if (probe.kind === 'unsafe') throw new AssetsError('path-denied', 'unsafe file reference')
    }
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
    if (!file || ['unmigrated', 'excluded'].includes(file.status)) throw new AssetsError('path-not-found', 'asset file not available')
    if (file.relative_path) {
      const probe = storageSync('stat', { root: vaultRoot, rel: file.relative_path })
      if (probe.kind === 'unsafe') throw new AssetsError('path-denied', 'unsafe file reference')
    }
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

  /** HTTP listings use bounded pages for both logical refs and physical directories. */
  async function listDirectoryPage(assetId, fileId, subPath, options) {
    const asset = get(assetId)
    if (!asset) throw new AssetsError('asset-not-found', 'asset not found')
    if (subPath) safeRelative(subPath)
    const request = (op, args) => opts.safeFS ? opts.safeFS.request(op, args) : storageSync(op, args)
    const scope = [vaultRoot, options.epoch ?? 0, state.revision, asset.id, fileId, subPath, Boolean(options.logical)]
    if (options.logical) {
      const page = directoryPage(logicalEntries(asset.files, subPath), [...scope, asset.files], options)
      // Only page-sized probes are needed; logical paths are never used for I/O.
      for (const entry of page.entries) {
        if (!entry.fileId || entry.status !== 'available') continue
        const ref = asset.files.find((file) => file.id === entry.fileId)
        const probe = await request('stat', { root: vaultRoot, rel: ref.relative_path })
        if (probe.kind === 'unsafe') { entry.status = 'excluded'; entry.reason = 'link-special-or-nested-volume'; continue }
        entry.is_dir = probe.kind === 'directory'
        entry.kind = entry.is_dir ? 'directory' : bucketOf(extOf(entry.name))
      }
      return { ...page, path: subPath, logical: true }
    }
    const file = asset.files.find((row) => row.id === fileId)
    if (!file?.relative_path || ['unmigrated', 'excluded'].includes(file.status)) throw new AssetsError('path-not-found', 'asset file not available')
    const rel = subPath ? `${file.relative_path}/${subPath}` : file.relative_path
    safeRelative(rel)
    const rootProbe = await request('stat', { root: vaultRoot, rel: file.relative_path })
    if (subPath && rootProbe.kind !== 'directory') throw new AssetsError('path-not-dir', 'file refs have no sub directories')
    const probe = subPath ? await request('stat', { root: vaultRoot, rel }) : rootProbe
    if (probe.kind === 'unsafe') throw new AssetsError('path-denied', 'unsafe file reference')
    const scanned = probe.kind === 'directory'
      ? await request('scan', { root: vaultRoot, rel, metadataOnly: true, singleLevel: true })
      : { entries: [{ ...probe, relative_path: rel }], excluded: [] }
    const rows = [...scanned.entries, ...scanned.excluded.map((row) => ({ ...row, kind: 'unsafe' }))]
      .filter((row) => !['.DS_Store', '.omnimux-assets'].includes(basename(row.relative_path)))
      .map((row) => {
        const name = basename(row.relative_path)
        const directory = row.kind === 'directory'
        return { name, relative_path: subPath ? `${subPath}/${name}` : name, fileId: file.id,
          is_dir: directory, kind: directory ? 'directory' : bucketOf(extOf(name)), type: directory ? 'other' : bucketOf(extOf(name)),
          ext: directory ? '' : extOf(name), size: directory ? 0 : Number(row.identity?.size ?? row.size ?? 0),
          status: row.kind === 'unsafe' ? 'excluded' : 'available', reason: row.reason }
      })
    rows.sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    return { ...directoryPage(rows, [...scope, probe.identity, scanned.entries, scanned.excluded, scanned.directoryIdentity], options), path: subPath,
      file: { id: file.id, original_name: file.original_name, kind: rootProbe.kind } }
  }

  async function listSafeFileEntries(assetId, fileId, subPath) {
    const asset = get(assetId)
    if (!asset) throw new AssetsError('asset-not-found', 'asset not found')
    const file = asset.files.find((row) => row.id === fileId)
    if (!file?.relative_path || ['unmigrated', 'excluded'].includes(file.status)) throw new AssetsError('path-not-found', 'asset file awaits materialization')
    const child = String(subPath)
    if (child && (child.startsWith('/') || child.includes('\\') || child.split('/').some((part) => !part || part === '.' || part === '..'))) throw new AssetsError('path-denied', 'unsafe directory subpath')
    const rel = child ? `${file.relative_path}/${child}` : file.relative_path
    resolveVaultRelPath(vaultRoot, rel)
    const probe = await opts.safeFS.request('stat', { root: vaultRoot, rel })
    if (probe.kind === 'unsafe') throw new AssetsError('path-denied', 'unsafe file reference')
    const entry = (row, path) => {
      const name = basename(path)
      const directory = row.kind === 'directory'
      return { name, relative_path: path, ext: directory ? '' : extOf(name), size: directory ? 0 : Number(row.identity?.size ?? row.size ?? 0),
        mtime: new Date(Number(row.identity?.mtimeNs ?? 0) / 1e6).toISOString(), is_dir: directory, type: directory ? 'other' : bucketOf(extOf(name)) }
    }
    const view = { id: file.id, relative_path: file.relative_path, real_path: resolveVaultRelPath(vaultRoot, file.relative_path),
      original_name: file.original_name || basename(file.relative_path), kind: probe.kind === 'directory' ? 'directory' : bucketOf(extOf(rel)) }
    if (probe.kind !== 'directory') return { file: view, path: child, entries: [entry(probe, child || basename(rel))] }
    const scanned = await opts.safeFS.request('scan', { root: vaultRoot, rel, metadataOnly: true })
    const entries = scanned.entries.filter((row) => !row.relative_path.slice(rel.length + 1).includes('/')).map((row) => entry(row, child ? `${child}/${basename(row.relative_path)}` : basename(row.relative_path)))
    return { file: view, path: child, entries, excluded: scanned.excluded }
  }

  function hasLegacy() {
    return !state.migrated_mappings || state.assets.some((asset) => asset.files.some((file) => file.real_path && !file.relative_path && !file.status))
  }

  /** Run only inside a Runtime write lease; keep IDs and retryable source refs. */
  async function materializeLegacy(mappings) {
    if (!state.migrated_mappings) {
      migrateMappings(mappings, true)
      await persistAsync()
    }
    for (const asset of state.assets) {
      for (let index = 0; index < asset.files.length; index += 1) {
        const file = asset.files[index]
        if (!file.real_path || file.relative_path || file.status) continue
        try {
          const [copied] = await materializeIncomingFiles(asset.id, [file])
          if (!copied) continue
          const { real_path, ...metadata } = file
          asset.files[index] = { ...metadata, ...copied, id: file.id }
          state.revision += 1
          await persistAsync()
        } catch (error) {
          if (!['path-not-found', 'path-denied', 'storage-offline'].includes(error.code)) throw error
        }
      }
    }
  }

  /** Resolve only a ledger-authorized relative path; the helper opens the FD. */
  function previewRef(assetId, fileId, subPath = '') {
    const asset = get(assetId)
    if (!asset) throw new AssetsError('asset-not-found', 'asset not found')
    const file = asset.files.find((row) => row.id === fileId)
    if (!file?.relative_path || ['unmigrated', 'excluded'].includes(file.status)) throw new AssetsError('path-not-found', 'asset file awaits materialization')
    const child = String(subPath)
    if (child && (child.startsWith('/') || child.includes('\\') || child.split('/').some((part) => !part || part === '.' || part === '..'))) throw new AssetsError('path-denied', 'unsafe preview subpath')
    const rel = child ? `${file.relative_path}/${child}` : file.relative_path
    resolveVaultRelPath(vaultRoot, rel)
    const mime = previewMimeOf(basename(rel))
    if (!mime) throw new AssetsError('path-unsupported', 'unsupported preview media')
    return { relativePath: rel, mime }
  }

  return { list, get, getView, add, update, remove, migrateMappings, materializeLegacy, hasLegacy, previewRef, revision, listFileEntries, resolvePreview }
}
