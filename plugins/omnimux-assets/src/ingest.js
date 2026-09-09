/**
 * Copy a user-local file or folder into the global assets vault.
 * Never unlink / rename / move the user's original. Streaming for files.
 */
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { statfsSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { AssetsError } from './mappings.js'

export const DISK_HEADROOM_BYTES = 500 * 1024 * 1024
export const DISK_SIZE_FACTOR = 1.5

const DEFAULT_FS = {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  statfsSync,
}

/**
 * @param {string} fileName
 */
function baseAndExt(fileName) {
  const ext = extname(fileName)
  const base = ext ? fileName.slice(0, -ext.length) : fileName
  return { base: base || fileName, ext }
}

/**
 * @param {string} dir
 * @param {string} originalName
 * @param {{ existsSync: typeof existsSync }} fs
 */
export function uniqueName(dir, originalName, fs = DEFAULT_FS) {
  const safe = basename(originalName).replace(/[\u0000]/g, '')
  if (!safe || safe === '.' || safe === '..') {
    throw new AssetsError('invalid-path', 'file name is required')
  }
  if (!fs.existsSync(join(dir, safe))) return safe
  const { base, ext } = baseAndExt(safe)
  let n = 1
  while (fs.existsSync(join(dir, `${base} (${n})${ext}`))) n += 1
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
    throw new AssetsError('disk-space-insufficient', 'unable to inspect free disk space')
  }
  const free = Number(info.bavail) * Number(info.bsize)
  const needed = incomingBytes * DISK_SIZE_FACTOR + DISK_HEADROOM_BYTES
  if (!Number.isFinite(free) || free < needed) {
    throw new AssetsError(
      'disk-space-insufficient',
      `free disk ${String(free)} < required ${String(needed)}`,
    )
  }
}

/**
 * @param {string} target
 * @param {string} root
 */
export function isInsideDir(target, root) {
  const t = resolve(target)
  const r = resolve(root)
  return t === r || t.startsWith(r + sep)
}

/**
 * POSIX path relative to vault root. Absolute / `..` refused.
 * @param {string} vaultRoot
 * @param {string} abs
 */
export function toVaultRelativePath(vaultRoot, abs) {
  const root = resolve(vaultRoot)
  const target = resolve(abs)
  if (!isInsideDir(target, root)) {
    throw new AssetsError('path-denied', 'path is outside assets vault')
  }
  const rel = relative(root, target).split(sep).join('/')
  if (!rel || rel.startsWith('..')) {
    throw new AssetsError('path-denied', 'path is outside assets vault')
  }
  return rel
}

/**
 * @param {string} vaultRoot
 * @param {string} rel
 */
export function resolveVaultRelPath(vaultRoot, rel) {
  if (typeof rel !== 'string' || rel.trim() === '') {
    throw new AssetsError('path-denied', 'relative path is required')
  }
  if (rel.includes('\0') || rel.startsWith('/') || /^[A-Za-z]:[\\/]/.test(rel)) {
    throw new AssetsError('path-denied', 'absolute paths are not allowed as relative_path')
  }
  const posix = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (posix.split('/').some((segment) => segment === '..')) {
    throw new AssetsError('path-denied', 'relative path escapes assets vault')
  }
  const root = resolve(vaultRoot)
  const target = resolve(join(root, posix))
  if (!isInsideDir(target, root)) {
    throw new AssetsError('path-denied', 'relative path escapes assets vault')
  }
  return target
}

/**
 * @param {{ statSync: typeof statSync }} fs
 * @param {string} abs
 * @returns {number}
 */
export function measureBytes(abs, fs = DEFAULT_FS) {
  const info = fs.statSync(abs)
  if (info.isFile()) return Number(info.size) || 0
  if (!info.isDirectory()) return 0
  let total = 0
  const names = (fs.readdirSync || readdirSync)(abs)
  for (const name of names) {
    if (name === '.' || name === '..') continue
    total += measureBytes(join(abs, name), fs)
  }
  return total
}

/**
 * @param {string} sourceAbs
 * @param {string} destAbs
 * @param {typeof DEFAULT_FS} fs
 */
async function copyOneFile(sourceAbs, destAbs, fs) {
  fs.mkdirSync(dirname(destAbs), { recursive: true, mode: 0o700 })
  const tmp = `${destAbs}.tmp-${process.pid}-${Date.now()}`
  try {
    const read = fs.createReadStream ? fs.createReadStream(sourceAbs) : createReadStream(sourceAbs)
    const write = fs.createWriteStream ? fs.createWriteStream(tmp) : createWriteStream(tmp)
    await pipeline(read, write)
    fs.renameSync(tmp, destAbs)
  } catch (error) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    } catch {
      // ignore tmp cleanup
    }
    if (error instanceof AssetsError) throw error
    throw new AssetsError('internal', error instanceof Error ? error.message : 'copy failed')
  }
}

/**
 * @param {string} sourceAbs
 * @param {string} destAbs
 * @param {typeof DEFAULT_FS} fs
 */
async function copyTree(sourceAbs, destAbs, fs) {
  const info = fs.statSync(sourceAbs)
  if (info.isFile()) {
    await copyOneFile(sourceAbs, destAbs, fs)
    return
  }
  if (!info.isDirectory()) {
    throw new AssetsError('not-a-file', 'path is not a file or directory')
  }
  fs.mkdirSync(destAbs, { recursive: true, mode: 0o700 })
  const names = (fs.readdirSync || readdirSync)(sourceAbs)
  for (const name of names) {
    if (name === '.' || name === '..' || name === '.DS_Store') continue
    await copyTree(join(sourceAbs, name), join(destAbs, name), fs)
  }
}

/**
 * Copy sourceAbs into destDir (created if needed). Returns dest absolute path.
 * @param {{
 *   sourceAbs: string,
 *   destDir: string,
 *   vaultRoot: string,
 *   originalName?: string,
 *   fs?: Partial<typeof DEFAULT_FS>,
 *   statfs?: typeof statfsSync,
 * }} opts
 */
export async function copyIntoVault(opts) {
  const fs = { ...DEFAULT_FS, ...(opts.fs ?? {}) }
  const sourceAbs = String(opts.sourceAbs || '').trim()
  if (!sourceAbs) throw new AssetsError('invalid-path', 'source path is required')
  if (sourceAbs.includes('\0') || sourceAbs.startsWith('blob:')) {
    throw new AssetsError(sourceAbs.startsWith('blob:') ? 'blob-url-forbidden' : 'invalid-path', 'source path is invalid')
  }
  let info
  try {
    info = fs.statSync(sourceAbs)
  } catch {
    throw new AssetsError('path-not-found', `path not found: ${sourceAbs}`)
  }
  if (!info.isFile() && !info.isDirectory()) {
    throw new AssetsError('not-a-file', 'path is not a file or directory')
  }
  if (!isInsideDir(opts.destDir, opts.vaultRoot)) {
    throw new AssetsError('path-denied', 'destination escapes assets vault')
  }
  fs.mkdirSync(opts.destDir, { recursive: true, mode: 0o700 })
  const incoming = measureBytes(sourceAbs, fs)
  assertDiskSpace(opts.vaultRoot, incoming, opts.statfs ?? fs.statfsSync ?? statfsSync)
  const name = uniqueName(opts.destDir, opts.originalName || basename(sourceAbs.replace(/\/+$/, '')), fs)
  const destAbs = join(opts.destDir, name)
  if (!isInsideDir(destAbs, opts.vaultRoot)) {
    throw new AssetsError('path-denied', 'destination escapes assets vault')
  }
  await copyTree(sourceAbs, destAbs, fs)
  return {
    destAbs,
    relativePath: toVaultRelativePath(opts.vaultRoot, destAbs),
    size: info.isFile() ? Number(info.size) || 0 : incoming,
    name,
    kind: info.isDirectory() ? 'directory' : 'file',
  }
}

/**
 * Synchronous copy for lazy ledger migration (list/get must stay sync).
 * @param {{ sourceAbs: string, destDir: string, vaultRoot: string, originalName?: string, fs?: Partial<typeof DEFAULT_FS>, statfs?: typeof statfsSync }} opts
 */
export function copyIntoVaultSync(opts) {
  const fs = { ...DEFAULT_FS, ...(opts.fs ?? {}) }
  const sourceAbs = String(opts.sourceAbs || '').trim()
  if (!sourceAbs) throw new AssetsError('invalid-path', 'source path is required')
  let info
  try {
    info = fs.statSync(sourceAbs)
  } catch {
    throw new AssetsError('path-not-found', `path not found: ${sourceAbs}`)
  }
  if (!info.isFile() && !info.isDirectory()) {
    throw new AssetsError('not-a-file', 'path is not a file or directory')
  }
  if (!isInsideDir(opts.destDir, opts.vaultRoot)) {
    throw new AssetsError('path-denied', 'destination escapes assets vault')
  }
  fs.mkdirSync(opts.destDir, { recursive: true, mode: 0o700 })
  const incoming = measureBytes(sourceAbs, fs)
  assertDiskSpace(opts.vaultRoot, incoming, opts.statfs ?? fs.statfsSync ?? statfsSync)
  const name = uniqueName(opts.destDir, opts.originalName || basename(sourceAbs.replace(/\/+$/, '')), fs)
  const destAbs = join(opts.destDir, name)
  if (!isInsideDir(destAbs, opts.vaultRoot)) {
    throw new AssetsError('path-denied', 'destination escapes assets vault')
  }
  copyTreeSync(sourceAbs, destAbs, fs)
  return {
    destAbs,
    relativePath: toVaultRelativePath(opts.vaultRoot, destAbs),
    size: info.isFile() ? Number(info.size) || 0 : incoming,
    name,
    kind: info.isDirectory() ? 'directory' : 'file',
  }
}

/**
 * @param {string} sourceAbs
 * @param {string} destAbs
 * @param {typeof DEFAULT_FS} fs
 */
function copyTreeSync(sourceAbs, destAbs, fs) {
  const info = fs.statSync(sourceAbs)
  if (info.isFile()) {
    fs.mkdirSync(dirname(destAbs), { recursive: true, mode: 0o700 })
    const tmp = `${destAbs}.tmp-${process.pid}-${Date.now()}`
    try {
      ;(fs.copyFileSync || copyFileSync)(sourceAbs, tmp)
      fs.renameSync(tmp, destAbs)
    } catch (error) {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
      } catch {
        // ignore
      }
      throw error
    }
    return
  }
  if (!info.isDirectory()) throw new AssetsError('not-a-file', 'path is not a file or directory')
  fs.mkdirSync(destAbs, { recursive: true, mode: 0o700 })
  const names = (fs.readdirSync || readdirSync)(sourceAbs)
  for (const name of names) {
    if (name === '.' || name === '..' || name === '.DS_Store') continue
    copyTreeSync(join(sourceAbs, name), join(destAbs, name), fs)
  }
}
