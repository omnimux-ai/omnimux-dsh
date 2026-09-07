/**
 * MediaStore: sha256 内容寻址媒体仓（`media/<sha256>` + `media.json` 索引）。
 * UI 拾取的文件字节与 agent 引用的本地路径统一入库一份（去重），
 * draft 只引用 media_id —— 保证 A4「重开完整恢复」不依赖浏览器内存，
 * 也保证未登录可建草稿（媒体不能在拾取时就上云，presign 需要登录态）。
 */
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { PublishError } from './publish-error.js'
import { isObject } from './shared/values.js'
import { isMediaRecord } from './media-types.js'
/** @typedef {import('./media-types.js').MediaRecord} MediaRecord */
/** @typedef {{ schema: number, revision: number, media: MediaRecord[] }} MediaState */

/** @typedef {Pick<typeof import('node:fs'), 'copyFileSync' | 'mkdirSync' | 'readFileSync' | 'renameSync' | 'statSync' | 'writeFileSync'>} MediaFs */
/** @type {MediaFs} */
const DEFAULT_FS = { copyFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync }

/** @type {Record<string, string>} */
const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.heic': 'image/heic',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
  '.webm': 'video/webm', '.m4v': 'video/mp4', '.flv': 'video/x-flv',
}

/**
 * @param {string} filename
 * @returns {string}
 */
export function contentTypeOf(filename) {
  return MIME_BY_EXT[extname(filename).toLowerCase()] || 'application/octet-stream'
}

/**
 * @param {string} contentType
 * @returns {'image' | 'video' | 'other'}
 */
export function mediaKindOf(contentType) {
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('video/')) return 'video'
  return 'other'
}

/**
 * @param {MediaFs} io
 * @param {string} file
 * @param {string} text
 */
function atomicWrite(io, file, text) {
  io.mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.tmp`
  io.writeFileSync(tmp, text, { mode: 0o600 })
  io.renameSync(tmp, file)
}

/**
 * @param {{ paths?: { mediaIndexFile: string, mediaDir: string }, fs?: Partial<typeof DEFAULT_FS>, maxBytes?: number, createHash?: typeof createHash, now?: () => string }} [opts]
 */
export function createMediaStore(opts = {}) {
  const fs = { ...DEFAULT_FS, ...(opts.fs ?? {}) }
  if (!opts.paths) throw new PublishError('invalid-arguments', 'mediaIndexFile and mediaDir are required')
  const paths = opts.paths
  const maxBytes = typeof opts.maxBytes === 'number' && opts.maxBytes > 0 ? opts.maxBytes : 512 * 1024 * 1024
  const hashOf = opts.createHash ?? createHash
  const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString()

  /** @returns {MediaState} */
  function loadState() {
    /** @type {unknown} */
    let raw
    try {
      raw = JSON.parse(fs.readFileSync(paths.mediaIndexFile, 'utf8'))
    } catch {
      return { schema: 1, revision: 0, media: [] }
    }
    if (!isObject(raw) || !Array.isArray(raw.media)) return { schema: 1, revision: 0, media: [] }
    if (!raw.media.every(isMediaRecord)) {
      throw new PublishError('invalid-media', 'media.json contains an incomplete or invalid row; original data was not modified')
    }
    return { schema: 1, revision: Number(raw.revision) || 0, media: raw.media }
  }

  let state = loadState()

  function persist() {
    atomicWrite(fs, paths.mediaIndexFile, `${JSON.stringify(state, null, 2)}\n`)
  }

  /**
   * @param {string} sha256
   */
  function findRow(sha256) {
    return state.media.find((row) => row.sha256 === sha256) || null
  }

  /**
   * 字节入库（内容寻址去重）。同一 sha256 二次入库只刷新 filename/时间戳。
   * @param {Buffer} buffer
   * @param {{ filename?: string, content_type?: string }} [meta]
   */
  function importBuffer(buffer, meta = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new PublishError('invalid-arguments', 'media buffer is empty')
    }
    if (buffer.length > maxBytes) {
      throw new PublishError('media-too-large', `media exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit (${buffer.length} bytes)`)
    }
    const sha256 = hashOf('sha256').update(buffer).digest('hex')
    const filename = typeof meta.filename === 'string' && meta.filename.trim() !== '' ? meta.filename.trim() : `${sha256.slice(0, 12)}.bin`
    const contentType = typeof meta.content_type === 'string' && meta.content_type.trim() !== ''
      ? meta.content_type.trim()
      : contentTypeOf(filename)
    const existing = findRow(sha256)
    const target = join(paths.mediaDir, sha256)
    if (!existing) {
      fs.mkdirSync(paths.mediaDir, { recursive: true, mode: 0o700 })
      const tmp = `${target}.tmp`
      fs.writeFileSync(tmp, buffer, { mode: 0o600 })
      fs.renameSync(tmp, target)
      const row = {
        id: sha256,
        sha256,
        filename,
        content_type: contentType,
        kind: mediaKindOf(contentType),
        size: buffer.length,
        created_at: now(),
      }
      state.media.push(row)
      state.revision += 1
      persist()
      return { media: { ...row }, deduplicated: false }
    }
    existing.filename = filename
    existing.content_type = contentType
    existing.kind = mediaKindOf(contentType)
    state.revision += 1
    persist()
    return { media: { ...existing }, deduplicated: true }
  }

  /**
   * 本地路径导入（agent 引用 ~/Desktop/a.jpg / omnimux-assets 产物路径）。
   * 只读源文件，拷贝进媒体仓，源文件永不动。
   * @param {string} filePath
   * @param {{ filename?: string, content_type?: string }} [meta]
   */
  function importPath(filePath, meta = {}) {
    const path = typeof filePath === 'string' ? filePath.trim() : ''
    if (!path) throw new PublishError('path-not-found', 'media path is required')
    let info
    try {
      info = fs.statSync(path)
    } catch {
      throw new PublishError('path-not-found', `media path does not exist: ${path}`)
    }
    if (!info.isFile()) throw new PublishError('path-not-found', `media path is not a file: ${path}`)
    if (info.size > maxBytes) {
      throw new PublishError('media-too-large', `media exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit (${info.size} bytes)`)
    }
    const buffer = fs.readFileSync(path)
    return importBuffer(buffer, {
      filename: meta.filename || basename(path),
      content_type: meta.content_type,
    })
  }

  /**
   * @param {string} id
   */
  function get(id) {
    const row = findRow(String(id))
    return row ? { ...row } : null
  }

  /**
   * 读出字节（SubmitService 上传用）。
   * @param {string} id
   * @returns {{ buffer: Buffer, meta: MediaRecord }}
   */
  function open(id) {
    const row = findRow(String(id))
    if (!row) throw new PublishError('media-not-found', `media ${id} not found`)
    let buffer
    try {
      buffer = fs.readFileSync(join(paths.mediaDir, row.sha256))
    } catch {
      throw new PublishError('media-not-found', `media content missing for ${id} (index row exists, file does not)`)
    }
    return { buffer, meta: { ...row } }
  }

  function list() {
    return state.media.map((row) => ({ ...row })).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  }

  function revision() {
    return state.revision
  }

  return { importBuffer, importPath, get, open, list, revision }
}
