import { requestRejection } from './request-authorization.js'
import {
  createWriteStream,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import {
  CLIP_STATUS_BY_CODE,
  ClipDomainError,
  clipErrorStatus,
} from '../errors.js'
import {
  assertInsideClipRoot,
  ensureClipDirs,
  exportMp4Path,
} from '../paths.js'
import { createProjectStore } from '../store/projectStore.js'

export const CLIP_API_PREFIX = '/omnimux-clip/api'
export const CLIP_VERSION = '0.1.0'

const DEFAULT_FS = {
  createWriteStream,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
}

/**
 * 画布导出上传原始编码字节的 Content-Type。
 * 走 JSON + base64 会把体积膨胀 1/3，并撞上 8 MiB 的 JSON body 上限。
 */
export const RAW_EXPORT_CONTENT_TYPE = 'application/octet-stream'
/** 单次导出上传硬上限（字节）。 */
export const EXPORT_UPLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024
const SAVE_EXPORT_PATH_RE = /^(?:\/omnimux-clip\/api)?\/projects\/[^/]+\/save-export$/

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
export function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  })
  res.end(text)
}

/**
 * Parse a request body as JSON. Empty body = {}. Bad JSON = null.
 * @param {import('node:http').IncomingMessage} req
 * @param {{ maxBytes?: number }} [opts]
 */
export async function readJsonBody(req, opts = {}) {
  const maxBytes = opts.maxBytes ?? 8 * 1024 * 1024
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) return null
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    return null
  }
}

/**
 * Decode a video payload that the overlay posted after WebCodecs export.
 * Accepts raw base64, data-URL, or `{ path }` pointing at a tmp file already
 * inside the clip domain.
 * @param {unknown} body
 * @param {ReturnType<typeof import('../paths.js').resolveClipPaths>} paths
 * @param {typeof DEFAULT_FS} fs
 */
export function decodeExportPayload(body, paths, fs = DEFAULT_FS) {
  if (!body || typeof body !== 'object') {
    throw ClipDomainError.invalidJson('export body must be an object')
  }
  const payload = /** @type {Record<string, unknown>} */ (body)

  if (typeof payload.path === 'string' && payload.path.trim()) {
    const resolved = assertInsideClipRoot(paths.dir, payload.path)
    if (!fs.existsSync(resolved)) {
      throw ClipDomainError.notFound(`export temp file not found: ${resolved}`)
    }
    return fs.readFileSync(resolved)
  }

  const raw = typeof payload.base64 === 'string'
    ? payload.base64
    : typeof payload.data === 'string'
      ? payload.data
      : typeof payload.blob === 'string'
        ? payload.blob
        : null
  if (!raw) {
    throw ClipDomainError.invalidJson('export body needs base64, data, blob, or path')
  }
  const comma = raw.indexOf(',')
  const b64 = raw.startsWith('data:') && comma >= 0 ? raw.slice(comma + 1) : raw
  try {
    return Buffer.from(b64, 'base64')
  } catch {
    throw ClipDomainError.invalidJson('export base64 is not valid')
  }
}

/**
 * 把导出字节落到 `<exportsDir>/<id>.mp4`。
 * - `{ path }`（原始上传留下的临时文件）：同卷 rename，零拷贝、零整段内存；
 * - `base64` / `data` / `blob`（兼容旧通道）：解码后写入。
 * @returns {number} 写入字节数
 */
export function persistExportBytes(body, paths, fs, dest) {
  const tempPath = body && typeof body.path === 'string' ? body.path.trim() : ''
  if (tempPath) {
    const source = assertInsideClipRoot(paths.dir, tempPath)
    if (!fs.existsSync(source)) {
      throw ClipDomainError.notFound(`export temp file not found: ${source}`)
    }
    fs.renameSync(source, dest)
    return fs.statSync(dest).size
  }
  const bytes = decodeExportPayload(body, paths, fs)
  fs.writeFileSync(dest, bytes, { mode: 0o600 })
  return bytes.length
}

/**
 * 导出文件的内容身份（`mtimeMs:size`），口径与
 * `omnimux-workflow/src/projects/mediaRevision.ts` 一致。
 *
 * 画布导出原地覆盖同一个 `<projectId>.mp4`，路径不变；下游成片节点必须靠这个版本
 * 串才能让 `<video>` 重新取流，否则浏览器复用旧元素、停在首次加载的失败态。
 * @param {string} file
 * @param {typeof DEFAULT_FS} [fs]
 */
export function exportFileRevision(file, fs = DEFAULT_FS) {
  const stat = fs.statSync(file)
  return `${stat.mtimeMs}:${stat.size}`
}

/** 画布导出：POST save-export + application/octet-stream。 */
function isRawExportUpload(req) {
  if ((req.method || 'GET').toUpperCase() !== 'POST') return false
  const contentType = String(req.headers?.['content-type'] || '').toLowerCase()
  if (!contentType.startsWith(RAW_EXPORT_CONTENT_TYPE)) return false
  const pathname = String(req.url || '').split('?')[0].replace(/\/+$/, '')
  return SAVE_EXPORT_PATH_RE.test(pathname)
}

/**
 * 把原始上传体流式写入 clip 临时目录（不整段驻留内存），返回临时文件绝对路径。
 * @returns {Promise<string>}
 */
async function writeRawUpload(req, tmpDir, fs) {
  const tempPath = join(
    tmpDir,
    `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.bin`,
  )
  const out = fs.createWriteStream(tempPath, { mode: 0o600 })
  let size = 0
  try {
    for await (const chunk of req) {
      size += chunk.length
      if (size > EXPORT_UPLOAD_MAX_BYTES) {
        throw new Error(`export upload exceeds ${EXPORT_UPLOAD_MAX_BYTES} bytes`)
      }
      if (!out.write(chunk)) {
        await new Promise((resolve, reject) => {
          out.once('drain', resolve)
          out.once('error', reject)
        })
      }
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())))
  } catch (error) {
    out.destroy()
    fs.rmSync(tempPath, { force: true })
    throw error
  }
  return tempPath
}

/**
 * @param {{
 *   paths: ReturnType<typeof import('../paths.js').resolveClipPaths>,
 *   fs?: typeof DEFAULT_FS,
 * }} deps
 */
export function createClipDispatcher(deps) {
  const paths = deps.paths
  const fs = deps.fs ?? DEFAULT_FS
  ensureClipDirs(paths)
  const store = deps.store ?? createProjectStore({ paths, fs })

  /**
   * @param {{ method?: string, url?: string, body?: unknown }} req
   */
  async function dispatch(req) {
    const method = (req.method || 'GET').toUpperCase()
    const rawPath = req.url || CLIP_API_PREFIX
    const url = new URL(rawPath, 'http://127.0.0.1')
    const path = url.pathname.replace(/\/+$/, '') || '/'

    try {
      if (method === 'OPTIONS') {
        return { status: 204, body: {} }
      }

      if (method === 'GET' && (path === `${CLIP_API_PREFIX}/health` || path === '/health')) {
        return { status: 200, body: { clip: true, version: CLIP_VERSION } }
      }

      if (method === 'GET' && (path === `${CLIP_API_PREFIX}/projects` || path === '/projects')) {
        const items = store.list()
        return { status: 200, body: { projects: items } }
      }

      const projectMatch = path.match(/^(?:\/omnimux-clip\/api)?\/projects\/([^/]+)(?:\/(save-export))?$/)
      if (!projectMatch) {
        return { status: 404, body: { error: 'not-found', message: 'unknown route' } }
      }

      const id = decodeURIComponent(projectMatch[1])
      const action = projectMatch[2] || ''

      if (method === 'GET' && !action) {
        const envelope = store.load(id)
        return { status: 200, body: { id, schema: envelope.schema } }
      }

      if (method === 'PUT' && !action) {
        if (req.body == null || typeof req.body !== 'object') {
          throw ClipDomainError.invalidJson('PUT body must be a JSON object')
        }
        const incoming = /** @type {Record<string, unknown>} */ (req.body)
        const schema = incoming.schema ?? incoming
        const envelope = store.save(id, schema, { recordUndo: false })
        return { status: 200, body: { id, saved: true, updatedAt: envelope.updatedAt } }
      }

      if (method === 'POST' && action === 'save-export') {
        const dest = exportMp4Path(paths, id)
        const bytes = persistExportBytes(req.body, paths, fs, dest)
        return {
          status: 200,
          body: {
            id,
            saved: true,
            path: dest,
            bytes,
            revision: exportFileRevision(dest, fs),
          },
        }
      }

      return { status: 404, body: { error: 'not-found', message: 'unknown route' } }
    } catch (error) {
      if (error instanceof ClipDomainError) {
        return {
          status: clipErrorStatus(error),
          body: { error: error.code, message: error.message },
        }
      }
      if (error instanceof SyntaxError) {
        return {
          status: CLIP_STATUS_BY_CODE['invalid-json'],
          body: { error: 'invalid-json', message: error.message },
        }
      }
      const message = error instanceof Error ? error.message : String(error)
      return { status: 500, body: { error: 'internal', message } }
    }
  }

  return { dispatch, paths }
}

/**
 * Mount `/omnimux-clip/api` on the official webServer seat.
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {{ dispatch: (req: object) => Promise<{ status: number, body: unknown }> }} dispatcher
 */
export function registerClipRoutes(webServer, dispatcher, deps = {}) {
  const paths = deps.paths ?? dispatcher.paths
  const fs = deps.fs ?? DEFAULT_FS
  const dispose = webServer.register({
    kind: 'prefix',
    path: CLIP_API_PREFIX,
    async handler(req, res) {
      try {
        const rejection = requestRejection(req, deps.getConnection)
        if (rejection !== undefined) return sendJson(res, rejection, { error: 'request-denied' })
        if ((req.method || 'GET').toUpperCase() === 'OPTIONS') {
          sendJson(res, 204, {})
          return
        }
        const method = (req.method || 'GET').toUpperCase()

        // 画布导出：编码后的视频以原始字节上传，流式落到 clip 临时目录，
        // 再由 dispatcher 原子改名到 exports/<projectId>.mp4。
        if (isRawExportUpload(req)) {
          if (!paths) {
            sendJson(res, 500, { error: 'internal', message: 'clip paths unavailable' })
            return
          }
          let tempPath
          try {
            tempPath = await writeRawUpload(req, paths.tmpDir, fs)
          } catch (error) {
            sendJson(res, 413, {
              error: 'export-upload-failed',
              message: error instanceof Error ? error.message : 'export upload failed',
            })
            return
          }
          try {
            const result = await dispatcher.dispatch({
              method,
              url: req.url || CLIP_API_PREFIX,
              body: { path: tempPath },
            })
            sendJson(res, result.status, result.body)
          } finally {
            fs.rmSync(tempPath, { force: true })
          }
          return
        }

        const wantsBody = method === 'POST' || method === 'PUT'
        const body = wantsBody ? await readJsonBody(req) : undefined
        if (wantsBody && body === null) {
          sendJson(res, 400, { error: 'invalid-json', message: 'invalid json' })
          return
        }
        const result = await dispatcher.dispatch({
          method,
          url: req.url || CLIP_API_PREFIX,
          body,
        })
        sendJson(res, result.status, result.body)
      } catch {
        sendJson(res, 500, { error: 'internal', message: 'internal error' })
      }
    },
  })
  return () => {
    dispose()
  }
}

/** Kept for callers that only need the destination dirname. */
export function clipStorageHint(paths) {
  return dirname(paths.dir)
}
