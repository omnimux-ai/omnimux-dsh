import { requestRejection } from './request-authorization.js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
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

const DEFAULT_FS = { existsSync, readFileSync, writeFileSync }

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
        const bytes = decodeExportPayload(req.body, paths, fs)
        const dest = exportMp4Path(paths, id)
        fs.writeFileSync(dest, bytes, { mode: 0o600 })
        return {
          status: 200,
          body: {
            id,
            saved: true,
            path: dest,
            bytes: bytes.length,
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
