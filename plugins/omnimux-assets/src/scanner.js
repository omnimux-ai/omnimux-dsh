/**
 * Core-1 Scanner: read-only one-layer directory scan.
 *
 * READ-ONLY RED LINE: this module may only import read-only fs APIs
 * (`readdirSync`, `statSync`). Never import writeFile/rm/rename here.
 * The scanner never mutates anything under `real_path`.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TYPE_BY_EXT = {
  image: new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif', '.heic', '.tiff']),
  video: new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.flv']),
  audio: new Set(['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.aiff']),
  document: new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv', '.rtf']),
  html: new Set(['.html', '.htm']),
  json: new Set(['.json', '.jsonl', '.ndjson']),
}

export const DEFAULT_IGNORES = ['.DS_Store']
export const DEFAULT_MAX_ENTRIES = 2000

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
 * Previewable media only — never stream unknown types out of user paths.
 * @param {string} name
 * @returns {string | null}
 */
export function previewMimeOf(name) {
  return MIME_BY_EXT[extOf(name)] ?? null
}

/**
 * Lowercase extension including the dot, or '' when absent.
 * @param {string} name
 */
export function extOf(name) {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot).toLowerCase()
}

/**
 * @typedef {{ name: string, relative_path: string, ext: string, size: number, mtime: string, is_dir: boolean, type: string }} FileEntry
 */

/**
 * Map an extension to a display bucket.
 * @param {string} ext
 * @returns {'image' | 'video' | 'audio' | 'document' | 'html' | 'json' | 'other'}
 */
export function bucketOf(ext) {
  for (const [bucket, exts] of Object.entries(TYPE_BY_EXT)) {
    if (exts.has(ext)) return /** @type {any} */ (bucket)
  }
  return 'other'
}

/**
 * Whether a path currently exists and matches the expected kind.
 * @param {string} realPath
 * @param {'directory' | 'file'} [kind] defaults to 'directory' (legacy callers)
 * @param {{ stat?: typeof statSync }} [deps]
 * @returns {'ok' | 'invalid'}
 */
export function statStatus(realPath, kind = 'directory', deps = {}) {
  const statFn = deps.stat ?? statSync
  try {
    const info = statFn(realPath)
    if (kind === 'file') return info.isFile() ? 'ok' : 'invalid'
    return info.isDirectory() ? 'ok' : 'invalid'
  } catch {
    return 'invalid'
  }
}

/**
 * Single-file scan: a file-kind mapping yields exactly one entry (itself).
 * @param {string} realPath
 * @param {{ stat?: typeof statSync }} [deps]
 * @returns {FileEntry[]}
 */
export function scanFile(realPath, deps = {}) {
  const statFn = deps.stat ?? statSync
  try {
    const info = statFn(realPath)
    if (!info.isFile()) return []
    const name = realPath.split('/').pop() ?? realPath
    const ext = extOf(name)
    return [{
      name,
      relative_path: name,
      ext,
      size: typeof info.size === 'number' ? info.size : 0,
      mtime: new Date(typeof info.mtimeMs === 'number' ? info.mtimeMs : 0).toISOString(),
      is_dir: false,
      type: bucketOf(ext),
    }]
  } catch {
    return []
  }
}

/**
 * Scan one directory layer (non-recursive) into FileEntry rows.
 * Unreadable or missing directories return [] — the caller decides
 * how to surface invalid mappings (statStatus covers that).
 * @param {string} realPath absolute directory to scan
 * @param {{ ignore?: string[], maxEntries?: number, prefix?: string }} [opts]
 *   prefix: relative path from the mapping root (e.g. "sub/dir"); it is
 *   prepended to each entry's relative_path so the UI can rebuild the
 *   absolute location.
 * @param {{ readdir?: typeof readdirSync, stat?: typeof statSync }} [deps]
 * @returns {FileEntry[]}
 */
export function scanDir(realPath, opts = {}, deps = {}) {
  const readdirFn = deps.readdir ?? readdirSync
  const statFn = deps.stat ?? statSync
  const ignore = opts.ignore ?? DEFAULT_IGNORES
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES
  const prefix = typeof opts.prefix === 'string' && opts.prefix !== '' ? `${opts.prefix}/` : ''

  let names
  try {
    names = readdirFn(realPath)
  } catch {
    return []
  }

  /** @type {FileEntry[]} */
  const entries = []
  for (const name of names) {
    if (entries.length >= maxEntries) break
    if (ignore.includes(name)) continue
    let info
    try {
      info = statFn(join(realPath, name))
    } catch {
      continue
    }
    const isDir = info.isDirectory()
    const ext = isDir ? '' : extOf(name)
    entries.push({
      name,
      relative_path: `${prefix}${name}`,
      ext,
      size: isDir ? 0 : (typeof info.size === 'number' ? info.size : 0),
      mtime: new Date(typeof info.mtimeMs === 'number' ? info.mtimeMs : 0).toISOString(),
      is_dir: isDir,
      type: isDir ? 'other' : bucketOf(ext),
    })
  }
  entries.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return entries
}
