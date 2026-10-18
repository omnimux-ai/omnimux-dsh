/**
 * Conversation-local file materialization for composer attachments.
 * Copies into `<session cwd>/assets/imported/` so @path is workspace-relative.
 * Never unlinks, renames, or moves the user's original file.
 */
import {
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  linkSync,
  mkdirSync,
  realpathSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { statfsSync } from 'node:fs'
import { basename, extname, isAbsolute, join, posix, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'

export const DISK_HEADROOM_BYTES = 500 * 1024 * 1024
export const DISK_SIZE_FACTOR = 1.5
export const IMPORTED_REL = 'assets/imported'

/**
 * Preview URL the slot card can actually load. Library preview requires a file id.
 * @param {string} assetId
 * @param {string} fileId
 */
export function libraryPreviewUrl(assetId, fileId) {
  const id = typeof assetId === 'string' ? assetId : ''
  const file = typeof fileId === 'string' ? fileId : ''
  if (!id || !file) return ''
  return `/omnimux/assets/library/preview?id=${encodeURIComponent(id)}&file=${encodeURIComponent(file)}`
}

const DEFAULT_FS = {
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  linkSync,
  mkdirSync,
  realpathSync,
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
 * Validate each target directory before a copy can create bytes there.
 * @param {string} cwd
 * @param {string} [destDir]
 * @param {Partial<typeof DEFAULT_FS>} [fsOverrides]
 */
export function ensureImportedDirectory(cwd, destDir, fsOverrides) {
  const fs = { ...DEFAULT_FS, ...fsOverrides }
  const requestedCwd = resolve(cwd)
  const realCwd = fs.realpathSync(requestedCwd)
  if (!fs.lstatSync(realCwd).isDirectory()) {
    throw new ComposerAttachmentError('import-directory-invalid', 'import-directory-invalid')
  }
  const requestedDest = destDir ? resolve(destDir) : join(requestedCwd, ...IMPORTED_REL.split('/'))
  const destination = isInsideDir(requestedDest, requestedCwd)
    ? join(realCwd, requestedDest.slice(requestedCwd.length)) : requestedDest
  assertDestInsideCwd(destination, realCwd)
  let current = realCwd
  for (const part of destination.slice(realCwd.length).split(sep).filter(Boolean)) {
    current = join(current, part)
    let info
    try { info = fs.lstatSync(current) } catch (error) {
      if (error.code !== 'ENOENT') throw error
      try { fs.mkdirSync(current, { mode: 0o700 }) } catch (mkdirError) {
        if (mkdirError.code !== 'EEXIST') throw mkdirError
      }
      info = fs.lstatSync(current)
    }
    if (!info.isDirectory() || info.isSymbolicLink() || fs.realpathSync(current) !== current) {
      throw new ComposerAttachmentError('import-directory-invalid', 'import-directory-invalid')
    }
  }
  return { cwd: realCwd, destDir: destination }
}

/**
 * @param {{
 *   cwd: string,
 *   sourceAbs: string,
 *   destDir?: string,
 *   originalName?: string,
 *   fs?: Partial<typeof DEFAULT_FS>,
 *   statfs?: typeof statfsSync,
 *   signal?: AbortSignal,
 *   expectedDigest?: string,
 * }} opts
 */
export async function copyFileIntoImported(opts) {
  opts.signal?.throwIfAborted()
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
  const { cwd, destDir } = ensureImportedDirectory(opts.cwd, opts.destDir, fs)
  opts.signal?.throwIfAborted()
  assertDiskSpace(cwd, stat.size, opts.statfs ?? statfsSync)
  const originalName = opts.originalName || basename(opts.sourceAbs)
  const exists = (path) => {
    try { fs.lstatSync(path); return true } catch (error) {
      if (error.code === 'ENOENT') return false
      throw error
    }
  }
  let name = uniqueImportedName(destDir, originalName, exists)
  let destAbs = join(destDir, name)
  assertDestInsideCwd(destAbs, cwd)
  const tmp = join(destDir, `.attachment-${randomUUID()}.tmp`)
  try {
    const streams = [fs.createReadStream(opts.sourceAbs)]
    const digest = opts.expectedDigest ? createHash('sha256') : null
    if (digest) streams.push(new Transform({ transform(bytes, _encoding, done) { digest.update(bytes); done(null, bytes) } }))
    streams.push(fs.createWriteStream(tmp, { flags: 'wx', mode: 0o600 }))
    await pipeline(streams, { signal: opts.signal })
    if (digest && digest.digest('hex') !== opts.expectedDigest) {
      throw new ComposerAttachmentError('attachment-source-changed', 'attachment-source-changed')
    }
    opts.signal?.throwIfAborted()
    ensureImportedDirectory(cwd, destDir, fs)
    assertDestInsideCwd(tmp, cwd)
    // Atomic no-overwrite publication also preserves dangling symlink entries.
    for (;;) {
      try { fs.linkSync(tmp, destAbs); break } catch (error) {
        if (error.code !== 'EEXIST') throw error
        name = uniqueImportedName(destDir, originalName, exists)
        destAbs = join(destDir, name)
      }
    }
    fs.unlinkSync(tmp)
  } catch (error) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    } catch {
      // tmp cleanup is best-effort
    }
    if (opts.signal?.aborted || error?.name === 'AbortError') throw error
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
 * @param {string} ext
 */
export function inferKindFromExtension(ext) {
  const lower = String(ext || '').replace(/^\./, '').toLowerCase()
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(lower)) return 'image'
  if (['mp4', 'webm', 'mov'].includes(lower)) return 'video'
  if (['mp3', 'wav', 'm4a', 'aac'].includes(lower)) return 'audio'
  if (['htable', 'csv', 'xlsx'].includes(lower)) return 'table'
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
 * Copy regular files into `<session cwd>/assets/imported/`; directories are
 * rejected per item as `not-a-file`.
 * @param {{
 *   sessionId: string,
 *   paths: unknown,
 *   sessionQuery?: { observeSession?: Function } | null,
 *   fs?: Partial<typeof DEFAULT_FS>,
 *   statfs?: typeof statfsSync,
 *   resolveCwd?: (sessionId: string) => Promise<string>,
 *   signal?: AbortSignal,
 *   expectedDigests?: string[],
 * }} opts
 */
export async function materializePaths(opts) {
  opts.signal?.throwIfAborted()
  if (!Array.isArray(opts.paths)) {
    throw new ComposerAttachmentError('invalid-payload', 'paths must be an array')
  }
  const cwd = opts.resolveCwd
    ? await opts.resolveCwd(opts.sessionId)
    : await resolveSessionCwd(opts.sessionId, opts.sessionQuery)
  const results = []
  for (const [index, raw] of opts.paths.entries()) {
    opts.signal?.throwIfAborted()
    const sourcePath = typeof raw === 'string' ? raw : ''
    try {
      const copied = await copyFileIntoImported({
        cwd,
        sourceAbs: sourcePath,
        fs: opts.fs,
        statfs: opts.statfs,
        signal: opts.signal,
        expectedDigest: opts.expectedDigests?.[index],
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
    } catch (error) {
      if (opts.signal?.aborted || error?.name === 'AbortError') throw error
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
      const coverFile = visible[coverIndex >= 0 ? coverIndex : 0] || visible[0]
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
        previewUrl: libraryPreviewUrl(assetId, coverFile?.id || coverId || ''),
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
