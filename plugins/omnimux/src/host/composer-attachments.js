/**
 * Conversation-local file materialization for composer add-file / add-from-library.
 * Copies into `<session cwd>/assets/imported/` so @path is workspace-relative.
 * Never unlinks, renames, or moves the user's original file.
 */
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { statfsSync } from 'node:fs'
import { basename, extname, isAbsolute, join, posix, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'

export const DISK_HEADROOM_BYTES = 500 * 1024 * 1024
export const DISK_SIZE_FACTOR = 1.5
export const IMPORTED_REL = 'assets/imported'

const DEFAULT_FS = {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
}

export class ComposerAttachmentError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'ComposerAttachmentError'
    this.code = code
  }
}

/**
 * @param {unknown} target
 * @param {unknown} root
 */
export function isInsideDir(target, root) {
  const t = typeof target === 'string' ? target : ''
  const r = typeof root === 'string' ? root : ''
  return t === r || t.startsWith(r + sep)
}

/**
 * @param {unknown} raw
 * @returns {'blob-url-forbidden' | 'invalid-path' | 'path-denied' | null}
 */
export function forbiddenSourcePathCode(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return 'invalid-path'
  if (raw.includes('\0')) return 'invalid-path'
  if (raw.startsWith('blob:')) return 'blob-url-forbidden'
  const posixPath = raw.replace(/\\/g, '/')
  if (posixPath.split('/').includes('..')) return 'path-denied'
  if (!isAbsolute(raw)) return 'invalid-path'
  return null
}

/**
 * @param {string} dir
 * @param {string} originalName
 * @param {(path: string) => boolean} [exists]
 */
export function uniqueImportedName(dir, originalName, exists = existsSync) {
  const safe = basename(originalName).replace(/[\u0000]/g, '')
  if (!safe || safe === '.' || safe === '..') {
    throw new ComposerAttachmentError('invalid-path', 'file name is required')
  }
  if (!exists(join(dir, safe))) return safe
  const ext = extname(safe)
  const base = ext ? safe.slice(0, -ext.length) : safe
  let n = 1
  while (exists(join(dir, `${base} (${n})${ext}`))) n += 1
  return `${base} (${n})${ext}`
}

/**
 * @param {string} root
 * @param {number} incomingBytes
 * @param {(path: string) => { bavail: number | bigint, bsize: number | bigint }} [statfs]
 */
export function assertDiskSpace(root, incomingBytes, statfs = statfsSync) {
  let info
  try {
    info = statfs(root)
  } catch {
    throw new ComposerAttachmentError('disk-space-insufficient', 'unable to inspect free disk space')
  }
  const free = Number(info.bavail) * Number(info.bsize)
  const needed = incomingBytes * DISK_SIZE_FACTOR + DISK_HEADROOM_BYTES
  if (!Number.isFinite(free) || free < needed) {
    throw new ComposerAttachmentError(
      'disk-space-insufficient',
      `free disk ${String(free)} < required ${String(needed)}`,
    )
  }
}

/**
 * @param {string} sessionId
 * @param {{ observeSession?: Function } | null | undefined} sessionQuery
 * @returns {Promise<string>}
 */
export async function resolveSessionCwd(sessionId, sessionQuery) {
  const id = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (!id || id === 'default') {
    throw new ComposerAttachmentError('session-not-found', 'session is not available')
  }
  if (!sessionQuery || typeof sessionQuery.observeSession !== 'function') {
    throw new ComposerAttachmentError('session-not-found', 'session query is unavailable')
  }
  let observation
  try {
    observation = await sessionQuery.observeSession(id, { projectionMode: 'none' })
  } catch (error) {
    throw new ComposerAttachmentError(
      'session-not-found',
      error instanceof Error ? error.message : 'session not found',
    )
  }
  try {
    const cwd = observation?.header?.cwd
    if (typeof cwd !== 'string' || cwd.trim() === '') {
      throw new ComposerAttachmentError('session-not-found', 'session has no workspace')
    }
    return cwd
  } finally {
    try {
      observation?.[Symbol.dispose]?.()
    } catch {
      // lease best-effort
    }
  }
}

function toPosixRelative(cwd, abs) {
  const rel = abs.slice(cwd.length).replace(/\\/g, '/')
  return rel.replace(/^\/+/, '')
}

function assertDestInsideCwd(abs, cwd) {
  const destReal = resolve(abs)
  const cwdReal = resolve(cwd)
  if (!isInsideDir(destReal, cwdReal)) {
    throw new ComposerAttachmentError('path-denied', 'destination escapes workspace')
  }
}

/**
 * @param {{
 *   cwd: string,
 *   sourceAbs: string,
 *   destDir?: string,
 *   originalName?: string,
 *   fs?: Partial<typeof DEFAULT_FS>,
 *   statfs?: typeof statfsSync,
 * }} opts
 */
export async function copyFileIntoImported(opts) {
  const fs = { ...DEFAULT_FS, ...opts.fs }
  const sourceCode = forbiddenSourcePathCode(opts.sourceAbs)
  if (sourceCode) {
    throw new ComposerAttachmentError(sourceCode, 'source path is invalid')
  }
  let stat
  try {
    stat = fs.statSync(opts.sourceAbs)
  } catch {
    throw new ComposerAttachmentError('not-a-file', `path not found: ${opts.sourceAbs}`)
  }
  if (!stat.isFile()) {
    throw new ComposerAttachmentError('not-a-file', 'path is not a regular file')
  }
  const cwd = resolve(opts.cwd)
  const destDir = opts.destDir ? resolve(opts.destDir) : join(cwd, ...IMPORTED_REL.split('/'))
  assertDestInsideCwd(destDir, cwd)
  fs.mkdirSync(destDir, { recursive: true })
  assertDiskSpace(cwd, stat.size, opts.statfs ?? statfsSync)
  const name = uniqueImportedName(destDir, opts.originalName || basename(opts.sourceAbs), (p) => fs.existsSync(p))
  const destAbs = join(destDir, name)
  assertDestInsideCwd(destAbs, cwd)
  const tmp = `${destAbs}.tmp-${process.pid}-${Date.now()}`
  try {
    await pipeline(fs.createReadStream(opts.sourceAbs), fs.createWriteStream(tmp))
    assertDestInsideCwd(tmp, cwd)
    fs.renameSync(tmp, destAbs)
  } catch (error) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    } catch {
      // tmp cleanup is best-effort
    }
    if (error instanceof ComposerAttachmentError) throw error
    throw new ComposerAttachmentError('internal', error instanceof Error ? error.message : 'copy failed')
  }
  let destReal = destAbs
  try {
    destReal = fs.realpathSync(destAbs)
  } catch {
    destReal = destAbs
  }
  let cwdReal = cwd
  try {
    cwdReal = fs.realpathSync(cwd)
  } catch {
    cwdReal = cwd
  }
  if (!isInsideDir(destReal, cwdReal)) {
    throw new ComposerAttachmentError('path-denied', 'destination escapes workspace')
  }
  return {
    destAbs,
    relativePath: toPosixRelative(cwdReal, destReal) || posix.join(IMPORTED_REL, name),
    size: stat.size,
    name,
  }
}

/**
 * Walk a directory tree; retain directories, regular files and total byte size.
 * Symlinks and special nodes are skipped (never followed).
 * @param {string} rootAbs
 * @param {typeof DEFAULT_FS} fs
 * @returns {{ files: Array<{ abs: string, rel: string }>, directories: string[], totalBytes: number }}
 */
function collectDirectoryFiles(rootAbs, fs) {
  const files = []
  const directories = []
  let totalBytes = 0
  /** @param {string} dirAbs @param {string} relPrefix */
  const walk = (dirAbs, relPrefix) => {
    let entries
    try {
      entries = fs.readdirSync(dirAbs, { withFileTypes: true })
    } catch (error) {
      throw new ComposerAttachmentError(
        'internal',
        error instanceof Error ? error.message : 'readdir failed',
      )
    }
    for (const entry of entries) {
      const name = entry.name
      if (!name || name === '.' || name === '..') continue
      const childAbs = join(dirAbs, name)
      const childRel = relPrefix ? posix.join(relPrefix, name) : name
      let isDir = false
      let isFile = false
      try {
        if (typeof entry.isSymbolicLink === 'function' && entry.isSymbolicLink()) continue
        isDir = entry.isDirectory()
        isFile = entry.isFile()
      } catch {
        continue
      }
      if (isDir) {
        directories.push(childRel)
        walk(childAbs, childRel)
        continue
      }
      if (!isFile) continue
      let size = 0
      try {
        size = Number(fs.statSync(childAbs).size) || 0
      } catch {
        continue
      }
      totalBytes += size
      files.push({ abs: childAbs, rel: childRel })
    }
  }
  walk(rootAbs, '')
  return { files, directories, totalBytes }
}

/**
 * Recursively copy a directory tree into `<cwd>/assets/imported/<uniqueName>/`.
 * One attachment row points at the directory root; `files` lists every copied
 * relative path under that root for prompt expansion.
 * @param {{
 *   cwd: string,
 *   sourceAbs: string,
 *   originalName?: string,
 *   fs?: Partial<typeof DEFAULT_FS>,
 *   statfs?: typeof statfsSync,
 * }} opts
 */
export async function copyDirectoryIntoImported(opts) {
  const fs = { ...DEFAULT_FS, ...opts.fs }
  const sourceCode = forbiddenSourcePathCode(opts.sourceAbs)
  if (sourceCode) {
    throw new ComposerAttachmentError(sourceCode, 'source path is invalid')
  }
  let stat
  try {
    stat = fs.statSync(opts.sourceAbs)
  } catch {
    throw new ComposerAttachmentError('not-a-file', `path not found: ${opts.sourceAbs}`)
  }
  if (!stat.isDirectory()) {
    throw new ComposerAttachmentError('not-a-directory', 'path is not a directory')
  }
  const cwd = resolve(opts.cwd)
  const importedRoot = join(cwd, ...IMPORTED_REL.split('/'))
  assertDestInsideCwd(importedRoot, cwd)
  fs.mkdirSync(importedRoot, { recursive: true })
  const { files, directories, totalBytes } = collectDirectoryFiles(opts.sourceAbs, fs)
  assertDiskSpace(cwd, totalBytes, opts.statfs ?? statfsSync)
  const name = uniqueImportedName(
    importedRoot,
    opts.originalName || basename(opts.sourceAbs.replace(/[\\/]+$/, '') || opts.sourceAbs),
    (p) => fs.existsSync(p),
  )
  const destRoot = join(importedRoot, name)
  assertDestInsideCwd(destRoot, cwd)
  fs.mkdirSync(destRoot, { recursive: true })
  for (const relativeDirectory of directories) {
    const destDirectory = join(destRoot, ...relativeDirectory.split('/'))
    assertDestInsideCwd(destDirectory, cwd)
    fs.mkdirSync(destDirectory, { recursive: true })
  }
  const copiedRels = []
  let copiedBytes = 0
  for (const file of files) {
    const destAbs = join(destRoot, ...file.rel.split('/'))
    assertDestInsideCwd(destAbs, cwd)
    fs.mkdirSync(join(destAbs, '..'), { recursive: true })
    const tmp = `${destAbs}.tmp-${process.pid}-${Date.now()}`
    try {
      await pipeline(fs.createReadStream(file.abs), fs.createWriteStream(tmp))
      assertDestInsideCwd(tmp, cwd)
      fs.renameSync(tmp, destAbs)
    } catch (error) {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
      } catch {
        // tmp cleanup is best-effort
      }
      if (error instanceof ComposerAttachmentError) throw error
      throw new ComposerAttachmentError('internal', error instanceof Error ? error.message : 'copy failed')
    }
    const relUnderImported = toPosixRelative(cwd, destAbs) || posix.join(IMPORTED_REL, name, file.rel)
    copiedRels.push(relUnderImported)
    try {
      copiedBytes += Number(fs.statSync(destAbs).size) || 0
    } catch {
      // size is best-effort
    }
  }
  let destReal = destRoot
  try {
    destReal = fs.realpathSync(destRoot)
  } catch {
    destReal = destRoot
  }
  let cwdReal = cwd
  try {
    cwdReal = fs.realpathSync(cwd)
  } catch {
    cwdReal = cwd
  }
  if (!isInsideDir(destReal, cwdReal)) {
    throw new ComposerAttachmentError('path-denied', 'destination escapes workspace')
  }
  return {
    destAbs: destReal,
    relativePath: toPosixRelative(cwdReal, destReal) || posix.join(IMPORTED_REL, name),
    size: copiedBytes,
    name,
    files: copiedRels,
  }
}

/**
 * @param {string} ext
 */
export function inferKindFromExtension(ext) {
  const lower = String(ext || '').replace(/^\./, '').toLowerCase()
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(lower)) return 'image'
  if (['mp4', 'webm', 'mov'].includes(lower)) return 'video'
  if (['mp3', 'wav', 'm4a', 'aac'].includes(lower)) return 'audio'
  if (['htable', 'csv', 'xlsx'].includes(lower)) return 'table'
  if (lower === 'dir' || lower === 'folder') return 'document'
  return 'document'
}

function itemError(sourcePath, error) {
  const code = error instanceof ComposerAttachmentError ? error.code : 'internal'
  return {
    ok: false,
    sourcePath,
    error: code,
    message: error instanceof Error ? error.message : String(error),
  }
}

/**
 * @param {{
 *   sessionId: string,
 *   paths: unknown,
 *   filesOnly?: boolean,
 *   sessionQuery?: { observeSession?: Function } | null,
 *   fs?: Partial<typeof DEFAULT_FS>,
 *   statfs?: typeof statfsSync,
 *   resolveCwd?: (sessionId: string) => Promise<string>,
 * }} opts
 */
export async function materializePaths(opts) {
  if (!Array.isArray(opts.paths)) {
    throw new ComposerAttachmentError('invalid-payload', 'paths must be an array')
  }
  if (opts.filesOnly !== undefined && typeof opts.filesOnly !== 'boolean') {
    throw new ComposerAttachmentError('invalid-payload', 'filesOnly must be a boolean')
  }
  const cwd = opts.resolveCwd
    ? await opts.resolveCwd(opts.sessionId)
    : await resolveSessionCwd(opts.sessionId, opts.sessionQuery)
  const fs = { ...DEFAULT_FS, ...opts.fs }
  const results = []
  for (const raw of opts.paths) {
    const sourcePath = typeof raw === 'string' ? raw : ''
    try {
      let isDirectory = false
      try {
        isDirectory = fs.statSync(sourcePath).isDirectory()
      } catch {
        isDirectory = false
      }
      if (isDirectory) {
        if (opts.filesOnly) {
          throw new ComposerAttachmentError('not-a-file', 'path is not a regular file')
        }
        const copied = await copyDirectoryIntoImported({
          cwd,
          sourceAbs: sourcePath,
          fs: opts.fs,
          statfs: opts.statfs,
        })
        results.push({
          ok: true,
          sourcePath,
          relativePath: copied.relativePath,
          title: copied.name,
          extension: 'DIR',
          kind: 'document',
          size: copied.size,
          files: copied.files,
        })
      } else {
        const copied = await copyFileIntoImported({
          cwd,
          sourceAbs: sourcePath,
          fs: opts.fs,
          statfs: opts.statfs,
        })
        const extension = extname(copied.name).replace(/^\./, '').toUpperCase() || 'FILE'
        results.push({
          ok: true,
          sourcePath,
          relativePath: copied.relativePath,
          title: copied.name,
          extension,
          kind: inferKindFromExtension(extension),
          size: copied.size,
        })
      }
    } catch (error) {
      results.push(itemError(sourcePath, error))
    }
  }
  return { cwd, results }
}

function safeAssetId(id) {
  const raw = typeof id === 'string' ? id.trim() : ''
  if (!raw) throw new ComposerAttachmentError('invalid-payload', 'asset id is required')
  if (raw.includes('..') || /[\\/]/.test(raw)) {
    throw new ComposerAttachmentError('invalid-payload', 'asset id is invalid')
  }
  return raw
}

/**
 * @param {string} id
 * @param {typeof fetch} [fetchImpl]
 * @param {string} [origin]
 */
export async function fetchLibraryAsset(id, fetchImpl = fetch, origin = 'http://127.0.0.1') {
  const detailUrl = `${origin.replace(/\/$/, '')}/omnimux/assets/library/detail?id=${encodeURIComponent(id)}`
  const response = await fetchImpl(detailUrl)
  let json = {}
  try {
    json = await response.json()
  } catch {
    json = {}
  }
  if (response.ok && json && typeof json === 'object' && json.asset) return json.asset
  if (response.status === 404) {
    throw new ComposerAttachmentError('asset-not-found', 'asset not found')
  }
  const listUrl = `${origin.replace(/\/$/, '')}/omnimux/assets/library`
  const listed = await fetchImpl(listUrl)
  let listJson = {}
  try {
    listJson = await listed.json()
  } catch {
    listJson = {}
  }
  const assets = Array.isArray(listJson.assets) ? listJson.assets : []
  const found = assets.find((row) => row && row.id === id)
  if (!found) throw new ComposerAttachmentError('asset-not-found', 'asset not found')
  return found
}

/**
 * @param {{
 *   sessionId: string,
 *   assetIds: unknown,
 *   sessionQuery?: { observeSession?: Function } | null,
 *   fetchAsset?: (id: string) => Promise<any>,
 *   origin?: string,
 *   fetchImpl?: typeof fetch,
 *   fs?: Partial<typeof DEFAULT_FS>,
 *   statfs?: typeof statfsSync,
 *   resolveCwd?: (sessionId: string) => Promise<string>,
 * }} opts
 */
export async function instantiateAssets(opts) {
  if (!Array.isArray(opts.assetIds)) {
    throw new ComposerAttachmentError('invalid-payload', 'assetIds must be an array')
  }
  const cwd = opts.resolveCwd
    ? await opts.resolveCwd(opts.sessionId)
    : await resolveSessionCwd(opts.sessionId, opts.sessionQuery)
  const fetchAsset = opts.fetchAsset
    || ((id) => fetchLibraryAsset(id, opts.fetchImpl, opts.origin))
  const results = []
  for (const rawId of opts.assetIds) {
    const sourcePath = typeof rawId === 'string' ? rawId : ''
    try {
      const assetId = safeAssetId(rawId)
      const asset = await fetchAsset(assetId)
      if (!asset) throw new ComposerAttachmentError('asset-not-found', 'asset not found')
      const files = Array.isArray(asset.files) ? asset.files : []
      const visible = files.filter((file) => file && file.visible !== false)
      const destDir = join(cwd, ...IMPORTED_REL.split('/'), assetId)
      const copiedFiles = []
      for (const file of visible) {
        const sourceAbs = typeof file.real_path === 'string' ? file.real_path : ''
        if (!sourceAbs) continue
        const originalName = file.original_name || basename(sourceAbs)
        const copied = await copyFileIntoImported({
          cwd,
          sourceAbs,
          destDir,
          originalName,
          fs: opts.fs,
          statfs: opts.statfs,
        })
        copiedFiles.push(copied)
      }
      if (copiedFiles.length === 0) {
        throw new ComposerAttachmentError('asset-not-found', 'asset has no visible files')
      }
      const coverId = asset.cover_file_id
      const coverIndex = coverId
        ? visible.findIndex((file) => file && file.id === coverId)
        : 0
      const primary = copiedFiles[coverIndex >= 0 ? coverIndex : 0] || copiedFiles[0]
      results.push({
        ok: true,
        sourcePath,
        relativePath: primary.relativePath,
        title: typeof asset.name === 'string' && asset.name ? asset.name : primary.name,
        extension: extname(primary.name).replace(/^\./, '').toUpperCase() || 'FILE',
        kind: 'asset',
        size: primary.size,
        files: copiedFiles.map((row) => row.relativePath),
        previewUrl: `/omnimux/assets/library/preview?id=${encodeURIComponent(assetId)}`,
        entityId: assetId,
      })
    } catch (error) {
      results.push(itemError(sourcePath, error))
    }
  }
  return { cwd, results }
}

export function statusForCode(code) {
  if (code === 'not-local') return 403
  if (code === 'session-not-found' || code === 'asset-not-found') return 404
  if (code === 'disk-space-insufficient') return 413
  if (code === 'internal') return 500
  return 400
}
