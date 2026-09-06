/**
 * AssetsDispatcher: one request in, one result out — all stateful side
 * effects concentrate here behind `dispatch({ method, url, ... })`.
 *
 * Self-implemented (equivalent copies of hub logic, no hub imports):
 * - sendJson with a secret-emission guard (hub auth/http-routes.js)
 * - assertLocalWrite loopback write check (hub apps/origin.js)
 */
import { createReadStream, realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { statStatus, scanDir, scanFile } from './scanner.js'
import { AssetsError } from './mappings.js'
import { PickerError, pickNativePath } from './picker.js'

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

const STATUS_BY_CODE = {
  'invalid-json': 400,
  'path-not-found': 400,
  'path-not-dir': 400,
  'path-unsupported': 400,
  'path-denied': 400,
  'name-required': 400,
  'secret-detected': 400,
  'picker-invalid-kind': 400,
  'picker-unsupported': 501,
  'picker-failed': 500,
  'mapping-not-found': 404,
  'artifact-not-found': 404,
  'asset-not-found': 404,
  'name-conflict': 409,
  'type-invalid': 400,
  'name-invalid': 400,
  'description-too-long': 400,
  'tags-invalid': 400,
  'files-invalid': 400,
  'not-local': 403,
  'disk-space-insufficient': 413,
  'invalid-path': 400,
  'not-a-file': 400,
  'blob-url-forbidden': 400,
  'internal': 500,
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
/**
 * Read-only media stream. Never writes user files.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {{ absolutePath: string, mime: string, size?: number }} stream
 */
export function sendPreview(res, status, stream) {
  res.writeHead(status, {
    'Content-Type': stream.mime,
    ...(Number.isFinite(stream.size) ? { 'Content-Length': String(stream.size) } : {}),
    'Cache-Control': 'private, max-age=30',
  })
  createReadStream(stream.absolutePath).on('error', () => {
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'internal', message: 'preview stream failed' })
      return
    }
    res.destroy()
  }).pipe(res)
}

export function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  if (/access_token|sk-[A-Za-z0-9]/.test(text)) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'refused to emit a secret' }))
    return
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(text)
}

/**
 * Parse a request body as JSON. Empty body = {}. Bad JSON = null.
 * @param {import('node:http').IncomingMessage} req
 */
export async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    return null
  }
}

/**
 * POST routes only accept same-machine browser calls.
 * @param {{ origin?: string, referer?: string, secFetchSite?: string }} headers
 */
export function assertLocalWrite(headers = {}) {
  const site = String(headers.secFetchSite || '').toLowerCase()
  if (site === 'cross-site') throw new Error('cross-origin write refused')
  const origin = headers.origin || originFromReferer(headers.referer)
  if (!origin) return
  let host
  try {
    host = new URL(origin).hostname
  } catch {
    throw new Error('cross-origin write refused')
  }
  if (!LOCAL_HOSTS.has(host)) throw new Error('cross-origin write refused')
}

/**
 * @param {string | undefined} referer
 */
function originFromReferer(referer) {
  if (!referer) return ''
  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

/**
 * @param {{ headers?: Record<string, string | string[] | undefined> } | undefined} req
 * @param {string} name
 */
function header(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

/**
 * @param {unknown} error
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * @param {{
 *   mappings: ReturnType<typeof import('./mappings.js').createMappingStore>,
 *   artifacts: ReturnType<typeof import('./artifacts.js').createArtifactStore>,
 *   library?: ReturnType<typeof import('./library.js').createLibraryStore>,
 *   picker?: (kind: 'file' | 'directory') => Promise<{ path: string | null }>,
 * }} deps
 */
export function createAssetsDispatcher(deps) {
  const { mappings, artifacts, library } = deps
  const picker = deps.picker ?? ((kind) => pickNativePath(kind))

  /**
   * Reject null (bad JSON) / non-object POST bodies.
   * @param {{ body?: unknown }} req
   * @returns {{ status: number, body: { error: string, message: string } } | null}
   */
  function jsonBodyProblem(req) {
    if (req.body === null) {
      return { status: 400, body: { error: 'invalid-json', message: 'request body is not valid JSON' } }
    }
    if (req.body === undefined || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return { status: 400, body: { error: 'invalid-json', message: 'request body must be a JSON object' } }
    }
    return null
  }

  /**
   * GET /omnimux/assets/state?lrev=<n>&arev=<n>
   * Cheap polling: matching revisions answer `unchanged: true`.
   * `mrev` is accepted as a legacy alias of `lrev`.
   */
  function stateRoute(url) {
    const lrevParam = url.searchParams.has('lrev')
      ? url.searchParams.get('lrev')
      : url.searchParams.get('mrev')
    const hasBoth = lrevParam != null && url.searchParams.has('arev')
    const lrev = hasBoth ? Number(lrevParam) : NaN
    const arev = hasBoth ? Number(url.searchParams.get('arev')) : NaN
    const currentL = library ? library.revision() : mappings.revision()
    const currentA = artifacts.revision()
    if (Number.isFinite(lrev) && Number.isFinite(arev) && lrev === currentL && arev === currentA) {
      return { status: 200, body: { lrev: currentL, mrev: currentL, arev: currentA, unchanged: true } }
    }
    return {
      status: 200,
      body: {
        lrev: currentL,
        mrev: currentL,
        arev: currentA,
        unchanged: false,
        assets: library ? library.list() : [],
        mappings: mappings.list(),
      },
    }
  }

  /**
   * Resolve a user-supplied sub path inside the mapping root, refusing any
   * escape. Both the lexical form and the realpath (symlink-resolved) form
   * must stay under the root — a `..` climb or an escaping symlink throws.
   * @param {string} rootPath mapping real_path (must exist)
   * @param {string} subPath relative path from the client (may be '')
   * @returns {string} absolute in-root directory to scan
   */
  function resolveSubPath(rootPath, subPath) {
    const cleaned = String(subPath ?? '').replace(/^\/+/, '')
    if (cleaned === '') return rootPath
    let rootReal
    try {
      rootReal = realpathSync(rootPath)
    } catch {
      throw new AssetsError('path-not-found', 'mapping root does not exist')
    }
    const resolved = resolve(rootReal, cleaned)
    if (resolved !== rootReal && !resolved.startsWith(rootReal + sep)) {
      throw new AssetsError('path-denied', 'sub path escapes the mapping root')
    }
    let real
    try {
      real = realpathSync(resolved)
    } catch {
      throw new AssetsError('path-not-found', 'sub path does not exist')
    }
    if (real !== rootReal && !real.startsWith(rootReal + sep)) {
      throw new AssetsError('path-denied', 'sub path escapes the mapping root')
    }
    return real
  }

  /**
   * Scan one mapping according to its kind: directories list one level,
   * file-kind mappings yield the file itself.
   * @param {{ id: string, real_path: string, kind?: string }} mapping
   * @param {string} [subPath]
   */
  function scanMapping(mapping, subPath = '') {
    if (mapping.kind === 'file') return scanFile(mapping.real_path)
    const target = resolveSubPath(mapping.real_path, subPath)
    return scanDir(target, { prefix: subPath === '' ? '' : subPath.replace(/^\/+|\/+$/g, '') })
  }

  /**
   * Shared mapping files loader: auto-scan once when no cache exists.
   * @param {string} id
   */
  function loadMappingFiles(id) {
    const mapping = mappings.get(id)
    if (!mapping) throw new AssetsError('mapping-not-found', 'mapping not found')
    const kind = mapping.kind === 'file' ? 'file' : 'directory'
    if (statStatus(mapping.real_path, kind) !== 'ok') {
      return { mapping: mappings.getView(id), files: [] }
    }
    let files = mappings.readScan(id)
    if (files === null) {
      files = scanMapping({ ...mapping, kind })
      mappings.writeScan(id, files)
      mappings.touchScan(id)
    }
    return { mapping: mappings.getView(id), files }
  }

  /**
   * @param {{ method: string, url: string, origin?: string, referer?: string, secFetchSite?: string, body?: unknown }} req
   * @returns {Promise<{ status: number, body: unknown }>}
   */
  async function dispatch(req) {
    try {
      const url = new URL(req.url, 'http://127.0.0.1')
      const method = (req.method || 'GET').toUpperCase()
      const path = url.pathname

      if (method === 'POST') {
        try {
          assertLocalWrite(req)
        } catch {
          return { status: 403, body: { error: 'not-local', message: 'cross-origin write refused' } }
        }
      }

      if (method === 'GET' && path === '/omnimux/assets/state') {
        return stateRoute(url)
      }

      if (library && method === 'GET' && path === '/omnimux/assets/library') {
        const type = url.searchParams.get('type') || ''
        const query = url.searchParams.get('q') || ''
        return { status: 200, body: { lrev: library.revision(), assets: library.list({ type, query }) } }
      }

      if (library && method === 'GET' && path === '/omnimux/assets/library/detail') {
        const id = url.searchParams.get('id') || ''
        const asset = library.getView(id)
        if (!asset) throw new AssetsError('asset-not-found', 'asset not found')
        return { status: 200, body: { asset } }
      }

      if (library && method === 'GET' && path === '/omnimux/assets/library/files') {
        const id = url.searchParams.get('id') || ''
        const fileId = url.searchParams.get('file') || ''
        const subPath = url.searchParams.get('path') || ''
        const listed = library.listFileEntries(id, fileId, subPath)
        return { status: 200, body: listed }
      }

      if (library && method === 'GET' && path === '/omnimux/assets/library/preview') {
        const id = url.searchParams.get('id') || ''
        const fileId = url.searchParams.get('file') || ''
        const subPath = url.searchParams.get('path') || ''
        const preview = library.resolvePreview(id, fileId, subPath)
        return { status: 200, stream: preview }
      }

      if (library && method === 'POST' && path === '/omnimux/assets/library') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {{ name?: string, type?: string, description?: string, tags?: unknown, files?: unknown }} */ (req.body)
        const asset = await library.add(body)
        return { status: 200, body: { asset, lrev: library.revision() } }
      }

      if (library && method === 'POST' && path === '/omnimux/assets/library/update') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {{ id?: string, name?: string, type?: string, description?: string, tags?: unknown, files?: unknown }} */ (req.body)
        const id = String(body.id ?? '')
        const asset = await library.update(id, body)
        return { status: 200, body: { asset, lrev: library.revision() } }
      }

      if (library && method === 'POST' && path === '/omnimux/assets/library/delete') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {{ id?: string }} */ (req.body)
        library.remove(String(body.id ?? ''))
        return { status: 200, body: { lrev: library.revision() } }
      }

      if (method === 'POST' && path === '/omnimux/assets/mappings') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {{ path?: string, name?: string }} */ (req.body)
        const mapping = mappings.add(body.path, body.name)
        return { status: 200, body: { mapping: mappings.getView(mapping.id) } }
      }

      if (method === 'POST' && path === '/omnimux/assets/mappings/rename') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {{ id?: string, name?: string }} */ (req.body)
        mappings.rename(String(body.id ?? ''), body.name)
        return { status: 200, body: { mapping: mappings.getView(String(body.id ?? '')) } }
      }

      if (method === 'POST' && path === '/omnimux/assets/mappings/delete') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {{ id?: string }} */ (req.body)
        // Only drops the registry record; never touches real files.
        mappings.remove(String(body.id ?? ''))
        return { status: 200, body: { mrev: mappings.revision() } }
      }

      if (method === 'POST' && path === '/omnimux/assets/mappings/rescan') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {{ id?: string }} */ (req.body)
        const id = String(body.id ?? '')
        const mapping = mappings.get(id)
        if (!mapping) throw new AssetsError('mapping-not-found', 'mapping not found')
        const kind = mapping.kind === 'file' ? 'file' : 'directory'
        if (statStatus(mapping.real_path, kind) !== 'ok') {
          return { status: 200, body: { mapping: mappings.getView(id), files: [] } }
        }
        const files = scanMapping({ ...mapping, kind })
        mappings.writeScan(id, files)
        mappings.touchScan(id)
        return { status: 200, body: { mapping: mappings.getView(id), files } }
      }

      if (method === 'POST' && path === '/omnimux/assets/pick') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {{ kind?: string }} */ (req.body)
        const kind = body.kind === 'file' ? 'file' : 'directory'
        const result = await picker(kind)
        const paths = Array.isArray(result?.paths)
          ? result.paths.filter((row) => typeof row === 'string' && row !== '')
          : (typeof result?.path === 'string' && result.path !== '' ? [result.path] : [])
        return { status: 200, body: { path: paths[0] ?? result?.path ?? null, paths } }
      }

      if (method === 'GET' && path === '/omnimux/assets/mappings/files') {
        const id = url.searchParams.get('id') || ''
        const subPath = url.searchParams.get('path') || ''
        if (subPath === '') {
          const result = loadMappingFiles(id)
          return { status: 200, body: result }
        }
        // Sub-directory drill-down: scanned live, never cached at top level.
        const mapping = mappings.get(id)
        if (!mapping) throw new AssetsError('mapping-not-found', 'mapping not found')
        if (mapping.kind === 'file') throw new AssetsError('path-not-dir', 'file mappings have no sub directories')
        // Root may have been deleted/moved after mounting: answer like the
        // top-level loader (invalid view + empty list) instead of a 500.
        if (statStatus(mapping.real_path, 'directory') !== 'ok') {
          return { status: 200, body: { mapping: mappings.getView(id), files: [] } }
        }
        const files = scanMapping({ ...mapping, kind: 'directory' }, subPath)
        return { status: 200, body: { mapping: mappings.getView(id), files, path: subPath } }
      }

      if (method === 'GET' && path === '/omnimux/assets/artifacts') {
        const type = url.searchParams.get('type') || ''
        const hasArev = url.searchParams.has('arev')
        const arev = hasArev ? Number(url.searchParams.get('arev')) : NaN
        const currentA = artifacts.revision()
        if (Number.isFinite(arev) && arev === currentA) {
          return { status: 200, body: { arev: currentA, unchanged: true } }
        }
        return {
          status: 200,
          body: { arev: currentA, artifacts: artifacts.list(type ? { type } : {}) },
        }
      }

      if (method === 'GET' && path === '/omnimux/assets/artifacts/detail') {
        const id = url.searchParams.get('id') || ''
        const artifact = artifacts.get(id)
        if (!artifact) throw new AssetsError('artifact-not-found', 'artifact not found')
        return { status: 200, body: { artifact } }
      }

      return { status: 404, body: { error: 'not-found', message: 'unknown route' } }
    } catch (error) {
      if (error instanceof AssetsError || error instanceof PickerError) {
        return {
          status: STATUS_BY_CODE[error.code] ?? 400,
          body: { error: error.code, message: error.message },
        }
      }
      return { status: 500, body: { error: 'internal', message: messageOf(error) } }
    }
  }

  return { dispatch }
}

/**
 * Mount the assets prefix on the official webServer seat.
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {{ dispatch: (req: object) => Promise<{ status: number, body: unknown }> }} dispatcher
 * @returns {() => void} disposer
 */
export function registerAssetsRoutes(webServer, dispatcher) {
  const dispose = webServer.register({
    kind: 'prefix',
    path: '/omnimux/assets',
    async handler(req, res) {
      try {
        const method = (req.method || 'GET').toUpperCase()
        const body = method === 'POST' ? await readJsonBody(req) : undefined
        const result = await dispatcher.dispatch({
          method,
          url: req.url || '/omnimux/assets/state',
          origin: header(req, 'origin'),
          referer: header(req, 'referer'),
          secFetchSite: header(req, 'sec-fetch-site'),
          body,
        })
        if (result.stream) {
          sendPreview(res, result.status, result.stream)
          return
        }
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
