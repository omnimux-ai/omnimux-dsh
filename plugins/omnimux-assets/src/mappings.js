/**
 * Core-1 MappingStore: registry CRUD + persistence + revision.
 * Pure factory with explicitly injectable fs deps (tests pass real fs over
 * temp dirs; nothing here ever touches the real ~/.dsh unless asked to).
 *
 * RED LINE: remove() only deletes the registry record (and this plugin's own
 * scan cache). It NEVER touches `real_path` or any file outside the plugin's
 * own disk area.
 */
import { randomUUID } from 'node:crypto'
import { accessSync, constants, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { statStatus } from './scanner.js'

/**
 * Typed error carrying a wire error code (see http-routes.js STATUS_BY_CODE).
 */
export class AssetsError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'AssetsError'
    this.code = code
  }
}

const DEFAULT_FS = { accessSync, constants, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync }

/**
 * Derive a short record id, e.g. `map_a1b2c3d4`.
 * @param {'map' | 'art'} prefix
 */
export function newRecordId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 8)}`
}

/**
 * Atomic write: temp file + rename, 0600 files under a 0700 directory.
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
 * @param {{ paths?: { mappingsFile: string, scansDir: string }, fs?: Partial<typeof DEFAULT_FS> }} [opts]
 */
export function createMappingStore(opts = {}) {
  const fs = { ...DEFAULT_FS, ...(opts.fs ?? {}) }
  const paths = opts.paths ?? {}

  /**
   * Corrupt or missing JSON falls back to an empty registry
   * (schema field stays for future migrations).
   */
  function loadState() {
    try {
      const raw = JSON.parse(fs.readFileSync(paths.mappingsFile, 'utf8'))
      if (raw && typeof raw === 'object' && Array.isArray(raw.mappings)) {
        const mappings = raw.mappings.filter(
          (row) => row && typeof row === 'object' && typeof row.id === 'string' && typeof row.real_path === 'string',
        )
        return { schema: 1, revision: Number(raw.revision) || 0, mappings }
      }
    } catch {
      // fall through to empty registry
    }
    return { schema: 1, revision: 0, mappings: [] }
  }

  let state = loadState()

  function persist() {
    atomicWrite(fs, paths.mappingsFile, `${JSON.stringify(state, null, 2)}\n`)
  }

  /**
   * Path validation: exists / is a directory or a file / readable.
   * @param {string} realPath
   * @returns {'directory' | 'file'} the detected mapping kind
   */
  function validatePath(realPath) {
    let info
    try {
      info = fs.statSync(realPath)
    } catch (error) {
      const code = error && typeof error.code === 'string' ? error.code : ''
      if (code === 'EACCES' || code === 'EPERM') {
        throw new AssetsError('path-denied', 'path is not readable')
      }
      throw new AssetsError('path-not-found', 'path does not exist')
    }
    const kind = info.isDirectory() ? 'directory' : info.isFile() ? 'file' : null
    if (kind === null) {
      throw new AssetsError('path-unsupported', 'path is neither a file nor a directory')
    }
    try {
      if (kind === 'directory') fs.readdirSync(realPath)
      else fs.accessSync(realPath, fs.constants.R_OK)
    } catch {
      throw new AssetsError('path-denied', 'path is not readable')
    }
    return kind
  }

  /**
   * Read the cached scan for one mapping. null = no cache yet.
   * @param {string} id
   * @returns {unknown[] | null}
   */
  function readScan(id) {
    try {
      const raw = JSON.parse(fs.readFileSync(join(paths.scansDir, `${id}.json`), 'utf8'))
      return Array.isArray(raw) ? raw : []
    } catch (error) {
      const code = error && typeof error.code === 'string' ? error.code : ''
      if (code === 'ENOENT') return null
      return []
    }
  }

  /**
   * Persist one scan cache (own disk area only; the cache is rebuildable).
   * @param {string} id
   * @param {unknown[]} files
   */
  function writeScan(id, files) {
    fs.mkdirSync(paths.scansDir, { recursive: true, mode: 0o700 })
    fs.writeFileSync(join(paths.scansDir, `${id}.json`), `${JSON.stringify(files)}\n`, { mode: 0o600 })
  }

  /**
   * Runtime view: mapping fields + live status + cached file count.
   * Records written before the `kind` field existed infer it lazily.
   * @param {{ id: string, display_name: string, real_path: string, kind?: string, created_at: string, last_scanned_at: string | null }} mapping
   */
  function viewOf(mapping) {
    const kind = mapping.kind === 'file' ? 'file' : 'directory'
    const status = statStatus(mapping.real_path, kind) === 'ok' ? 'ok' : 'invalid'
    const cached = status === 'ok' ? readScan(mapping.id) : []
    return { ...mapping, kind, status, file_count: cached ? cached.length : 0 }
  }

  /** @returns {Record<string, unknown>[]} */
  function list() {
    return state.mappings.map((mapping) => viewOf(mapping))
  }

  /**
   * @param {string} id
   */
  function get(id) {
    const found = state.mappings.find((mapping) => mapping.id === id)
    return found ? { ...found } : null
  }

  /**
   * @param {string} id
   */
  function getView(id) {
    const found = state.mappings.find((mapping) => mapping.id === id)
    return found ? viewOf(found) : null
  }

  /**
   * @param {string} realPath
   * @param {string} displayName
   */
  function add(realPath, displayName) {
    const path = typeof realPath === 'string' ? realPath.trim() : ''
    const name = typeof displayName === 'string' ? displayName.trim() : ''
    if (!name) throw new AssetsError('name-required', 'display name is required')
    if (!path) throw new AssetsError('path-not-found', 'path does not exist')
    const kind = validatePath(path)
    const mapping = {
      id: newRecordId('map'),
      display_name: name,
      real_path: path,
      kind,
      created_at: new Date().toISOString(),
      last_scanned_at: null,
    }
    state.mappings.push(mapping)
    state.revision += 1
    persist()
    return { ...mapping }
  }

  /**
   * @param {string} id
   * @param {string} displayName
   */
  function rename(id, displayName) {
    const name = typeof displayName === 'string' ? displayName.trim() : ''
    if (!name) throw new AssetsError('name-required', 'display name is required')
    const found = state.mappings.find((mapping) => mapping.id === id)
    if (!found) throw new AssetsError('mapping-not-found', 'mapping not found')
    found.display_name = name
    state.revision += 1
    persist()
    return { ...found }
  }

  /**
   * Delete only the registry record (plus this plugin's own scan cache).
   * Never touches real_path.
   * @param {string} id
   */
  function remove(id) {
    const index = state.mappings.findIndex((mapping) => mapping.id === id)
    if (index < 0) throw new AssetsError('mapping-not-found', 'mapping not found')
    state.mappings.splice(index, 1)
    state.revision += 1
    persist()
    try {
      fs.rmSync(join(paths.scansDir, `${id}.json`))
    } catch {
      // absent cache is fine
    }
  }

  /**
   * Mark a scan as done: bumps revision (any write bumps).
   * @param {string} id
   */
  function touchScan(id) {
    const found = state.mappings.find((mapping) => mapping.id === id)
    if (!found) throw new AssetsError('mapping-not-found', 'mapping not found')
    found.last_scanned_at = new Date().toISOString()
    state.revision += 1
    persist()
  }

  function revision() {
    return state.revision
  }

  return { list, get, getView, add, rename, remove, touchScan, readScan, writeScan, revision }
}
