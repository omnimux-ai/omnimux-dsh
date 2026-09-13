/**
 * AssetsDispatcher: one request in, one result out — all stateful side
 * effects concentrate here behind `dispatch({ method, url, ... })`.
 *
 * JSON secret-emission and loopback-write guards stay local to this plugin;
 * domain plugins do not import hub internals.
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
  'catalog-not-found': 404,
  'catalog-unavailable': 503,
  'cloud-media-unavailable': 404,
  'name-conflict': 409,
  'type-invalid': 400,
  'name-invalid': 400,
  'description-too-long': 400,
  'tags-invalid': 400,
  'files-invalid': 400,
  'file-too-large': 413,
  'not-local': 403,
  'disk-space-insufficient': 413,
  'invalid-path': 400,
  'not-a-file': 400,
  'blob-url-forbidden': 400,
  'internal': 500,
}

/**
 * Catalog metadata routes, with and without the `.json` suffix.
 *
 * The gateway serves the catalog straight off disk, so the client asks for the
 * on-disk names (`manifest.json`, `index.json`). Both spellings are accepted
 * here: the extension-less form is the one this route table advertised first,
 * and a request that misses every named route falls through to the page route
 * below, which would answer a valid metadata request as a malformed page path.
 */
const CLOUD_MANIFEST_PATHS = new Set([
  '/omnimux/assets/cloud/manifest',
  '/omnimux/assets/cloud/manifest.json',
])
const CLOUD_INDEX_PATHS = new Set([
  '/omnimux/assets/cloud/index',
  '/omnimux/assets/cloud/index.json',
])

/** A catalog page name is `page-NNNN` or `page-NNNN.json`; nothing else is read. */
const CATALOG_PAGE_RE = /^page-(\d{1,6})(?:\.json)?$/
/** A catalog scope segment is a lowercase id: no `.`, `/`, or `%`. */
const CATALOG_SCOPE_SEGMENT_RE = /^[a-z][a-z0-9_]*$/

/**
 * Resolve a catalog page request to a file path inside the catalog directory.
 *
 * The page path arrives as URL segments, so every segment is validated against a
 * strict pattern before a path is joined. `../`, absolute paths, and unknown
 * scopes are refused here rather than sanitized later.
 *
 * @param {string} catalogDir
 * @param {string[]} segments e.g. ['audio', 'bgm', 'page-0002.json']
 * @returns {string} absolute page file path
 */
export function resolveCatalogPagePath(catalogDir, segments) {
  const parts = segments.filter((segment) => segment !== '')
  if (parts.length < 2 || parts.length > 3) {
    throw new AssetsError('catalog-not-found', 'catalog page path must be <category>/[<sub_category>/]page-NNNN')
  }
  const match = CATALOG_PAGE_RE.exec(parts[parts.length - 1])
  if (!match) throw new AssetsError('catalog-not-found', 'invalid catalog page name')
  const scope = parts.slice(0, -1)
  for (const segment of scope) {
    if (!CATALOG_SCOPE_SEGMENT_RE.test(segment)) {
      throw new AssetsError('catalog-not-found', 'invalid catalog scope')
    }
  }
  const fileName = `page-${match[1].padStart(4, '0')}.json`
  return resolve(catalogDir, ...scope, fileName)
}

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

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
export function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  if (serializedJsonContainsSecret(text)) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'refused to emit a secret' }))
    return
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(text)
}

/**
 * Inspect JSON as it will appear to the client. This deliberately runs after
 * the single serialization above so getters, toJSON(), boxed strings, and
 * escaped characters cannot produce a different value for the guard.
 *
 * `sk-` is a token prefix only at a string start or after a character that
 * is not ASCII alphanumeric. A prefix embedded in an ASCII word (for example
 * `risk-taking`) remains ordinary product prose.
 *
 * @param {string} text
 */
function serializedJsonContainsSecret(text) {
  let found = false
  JSON.parse(text, (key, value) => {
    if (containsSecretText(key) || (typeof value === 'string' && containsSecretText(value))) {
      found = true
    }
    return value
  })
  return found
}

/** @param {string} value */
function containsSecretText(value) {
  return value.includes('access_token') || /(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9]/.test(value)
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
  const { mappings, artifacts, library, cloud } = deps
  const picker = deps.picker ?? ((kind) => pickNativePath(kind))

  /**
   * `/omnimux/assets/cloud/<category>/[<sub_category>/]page-NNNN.json`
   *
   * Served as a stream rather than parsed JSON so the page file is forwarded
   * byte-for-byte: the client is the only thing that needs its shape, and a
   * large page never has to be materialized in the Host.
   * @param {string} pathname
   */
  function cloudPageRoute(pathname) {
    if (!cloud) throw new AssetsError('catalog-unavailable', 'cloud catalog is not mounted')
    const rest = pathname.slice('/omnimux/assets/cloud/'.length)
    const segments = rest.split('/').map((segment) => decodeURIComponent(segment))
    const file = resolveCatalogPagePath(cloud.catalogDir, segments)
    const status = statStatus(file, 'file')
    if (status !== 'ok') throw new AssetsError('catalog-not-found', 'catalog page not found')
    return {
      status: 200,
      stream: { absolutePath: file, mime: 'application/json; charset=utf-8' },
    }
  }

  /**
   * `GET /omnimux/assets/cloud/index.json` — the flat index, one row per asset.
   *
   * Streamed like a page rather than rebuilt from the in-memory map: it is the
   * same file the catalog was built from, and a few thousand rows do not need
   * re-serializing per request.
   */
  function cloudIndexRoute() {
    if (!cloud) throw new AssetsError('catalog-unavailable', 'cloud catalog is not mounted')
    const file = resolve(cloud.catalogDir, 'index.json')
    const status = statStatus(file, 'file')
    if (status !== 'ok') throw new AssetsError('catalog-not-found', 'cloud catalog index not found')
    return {
      status: 200,
      stream: { absolutePath: file, mime: 'application/json; charset=utf-8' },
    }
  }

  /** `GET /omnimux/assets/cloud/media?id=<row id>&which=media|cover` */
  function cloudMediaRoute(url) {
    if (!cloud) throw new AssetsError('catalog-unavailable', 'cloud catalog is not mounted')
    const id = url.searchParams.get('id') || ''
    const which = url.searchParams.get('which') === 'cover' ? 'cover' : 'media'
    const resolved = cloud.resolveRowMedia(id, which)
    if (!resolved) throw new AssetsError('cloud-media-unavailable', 'cloud asset media is not available')
    if (resolved.kind === 'remote') {
      // Remote assets are already public CDN URLs; the browser loads them
      // directly instead of the Host proxying the bytes.
      return { status: 302, redirect: resolved.url }
    }
    return {
      status: 200,
      stream: { absolutePath: resolved.absolutePath, mime: resolved.mime, size: resolved.size },
    }
  }

  /** `POST /omnimux/assets/cloud/save` — copy one cloud asset into the local library. */
  async function cloudSaveRoute(req) {
    if (!cloud) throw new AssetsError('catalog-unavailable', 'cloud catalog is not mounted')
    if (!library) throw new AssetsError('catalog-unavailable', 'local library is not available')
    const problem = jsonBodyProblem(req)
    if (problem) return problem
    const body = /** @type {{ id?: string, name?: string, type?: string }} */ (req.body)
    try {
      const asset = await cloud.saveToLocal(String(body.id ?? ''), { name: body.name, type: body.type })
      return { status: 200, body: { asset, lrev: library.revision() } }
    } finally {
      cloud.clearStaging()
    }
  }

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

      // ---- cloud assets -------------------------------------------------
      if (cloud && method === 'GET' && CLOUD_MANIFEST_PATHS.has(path)) {
        return { status: 200, body: cloud.getManifest() }
      }

      if (cloud && method === 'GET' && CLOUD_INDEX_PATHS.has(path)) {
        return cloudIndexRoute()
      }

      if (cloud && method === 'GET' && path === '/omnimux/assets/cloud/search') {
        return {
          status: 200,
          body: cloud.search({
            q: url.searchParams.get('q') || '',
            category: url.searchParams.get('category') || '',
            subCategory: url.searchParams.get('sub_category') || '',
            limit: url.searchParams.get('limit'),
            offset: url.searchParams.get('offset'),
          }),
        }
      }

      if (cloud && method === 'GET' && path === '/omnimux/assets/cloud/media') {
        return cloudMediaRoute(url)
      }

      if (cloud && method === 'GET' && path.startsWith('/omnimux/assets/cloud/')) {
        return cloudPageRoute(path)
      }

      if (method === 'POST' && path === '/omnimux/assets/cloud/save') {
        return await cloudSaveRoute(req)
      }

      // ---- local library ------------------------------------------------
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
        if (result.redirect) {
          // Remote cloud media lives on a public CDN; send the browser there
          // rather than proxying the bytes through the Host.
          res.writeHead(result.status ?? 302, { Location: result.redirect, 'Cache-Control': 'no-store' })
          res.end()
          return
        }
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
