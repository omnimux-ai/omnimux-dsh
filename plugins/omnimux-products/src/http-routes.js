/**
 * ProductsDispatcher: one request in, one result out.
 *
 * Writes (POST / PUT / DELETE) all run assertLocalWrite. Assets only
 * gated POST — do not copy that shortcut.
 */
import { createReadStream } from 'node:fs'
import { LinkImportError, importProductFromUrl } from './link-importer.js'
import { PRODUCT_KINDS, listViewOf, ProductsError } from './library.js'
import { PickerError, pickNativePath } from './picker.js'

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
const PREFIX = '/omnimux/products'

const STATUS_BY_CODE = {
  'invalid-json': 400,
  'path-not-found': 400,
  'path-unsupported': 400,
  'name-required': 400,
  'name-invalid': 400,
  'kind-invalid': 400,
  'text-too-long': 400,
  'categories-invalid': 400,
  'media-invalid': 400,
  'media-path-invalid': 400,
  'media-path-unavailable': 400,
  'content-required': 400,
  'brand-strategy-invalid': 400,
  'invalid-url': 400,
  'link-import-empty': 422,
  'link-import-failed': 502,
  'library-corrupt': 500,
  'picker-invalid-kind': 400,
  'picker-unsupported': 501,
  'picker-failed': 500,
  'product-not-found': 404,
  'name-conflict': 409,
  'not-local': 403,
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
 * Write routes only accept same-machine browser calls.
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
 * @param {string} pathname
 */
function parseProductPath(pathname) {
  if (pathname === PREFIX || pathname === `${PREFIX}/`) return { kind: 'collection' }
  if (pathname === `${PREFIX}/state`) return { kind: 'state' }
  if (pathname === `${PREFIX}/pick`) return { kind: 'pick' }
  if (pathname === `${PREFIX}/import-from-link`) return { kind: 'import-from-link' }
  if (!pathname.startsWith(`${PREFIX}/`)) return { kind: 'unknown' }
  const rest = pathname.slice(`${PREFIX}/`.length)
  const media = rest.match(/^([^/]+)\/media$/)
  if (media) return { kind: 'media', id: decodeURIComponent(media[1]) }
  if (!rest.includes('/')) return { kind: 'item', id: decodeURIComponent(rest) }
  return { kind: 'unknown' }
}

/**
 * @param {{
 *   library: ReturnType<typeof import('./library.js').createLibraryStore>,
 *   picker?: (kind: 'file' | 'directory') => Promise<{ path: string | null, paths?: string[] }>,
 *   importFromUrl?: (args: { url: unknown, kind?: 'physical' | 'digital', env?: Record<string, string | undefined> }) => Promise<object>,
 *   env?: Record<string, string | undefined>,
 * }} deps
 */
export function createProductsDispatcher(deps) {
  const { library } = deps
  const picker = deps.picker ?? ((kind) => pickNativePath(kind))
  const importFromUrl = deps.importFromUrl ?? importProductFromUrl

  /**
   * @param {{ body?: unknown }} req
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
   * GET /omnimux/products/state?prev=<n>
   * Single revision. Matching prev answers `unchanged: true` with no products.
   */
  function stateRoute(url) {
    const current = library.revision()
    const prevRaw = url.searchParams.get('prev')
    const prev = prevRaw == null || prevRaw === '' ? NaN : Number(prevRaw)
    if (Number.isFinite(prev) && prev === current) {
      return { status: 200, body: { revision: current, unchanged: true } }
    }
    return {
      status: 200,
      body: {
        revision: current,
        unchanged: false,
        products: library.list().map(listViewOf),
      },
    }
  }

  /**
   * @param {{ method: string, url: string, origin?: string, referer?: string, secFetchSite?: string, body?: unknown }} req
   * @returns {Promise<{ status: number, body?: unknown, stream?: unknown }>}
   */
  async function dispatch(req) {
    try {
      const url = new URL(req.url, 'http://127.0.0.1')
      const method = (req.method || 'GET').toUpperCase()
      const parsed = parseProductPath(url.pathname)

      if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        try {
          assertLocalWrite(req)
        } catch {
          return { status: 403, body: { error: 'not-local', message: 'cross-origin write refused' } }
        }
      }

      if (method === 'GET' && parsed.kind === 'state') {
        return stateRoute(url)
      }

      if (method === 'POST' && parsed.kind === 'pick') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {{ kind?: string }} */ (req.body)
        const kind = body.kind === 'directory' ? 'directory' : 'file'
        const result = await picker(kind)
        const paths = Array.isArray(result?.paths)
          ? result.paths.filter((row) => typeof row === 'string' && row !== '')
          : (typeof result?.path === 'string' && result.path !== '' ? [result.path] : [])
        return { status: 200, body: { path: paths[0] ?? result?.path ?? null, paths } }
      }

      /**
       * POST /omnimux/products/import-from-link
       * Read a landing page and answer a product draft. Local-only (the write
       * guard above), and the importer re-validates the url it is handed.
       */
      if (method === 'POST' && parsed.kind === 'import-from-link') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {{ url?: unknown, kind?: unknown }} */ (req.body)
        if (body.kind !== undefined && !PRODUCT_KINDS.includes(/** @type {'physical' | 'digital'} */ (body.kind))) {
          throw new ProductsError('kind-invalid', `kind must be one of ${PRODUCT_KINDS.join(', ')}`)
        }
        const data = await importFromUrl({
          url: body.url,
          kind: body.kind === 'digital' ? 'digital' : 'physical',
          env: deps.env,
        })
        return { status: 200, body: { success: true, data } }
      }

      if (method === 'GET' && parsed.kind === 'collection') {
        const query = url.searchParams.get('q') || url.searchParams.get('query') || ''
        return {
          status: 200,
          body: {
            revision: library.revision(),
            products: library.list({ query }).map(listViewOf),
          },
        }
      }

      if (method === 'POST' && parsed.kind === 'collection') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {Record<string, unknown>} */ (req.body)
        const product = library.add(body)
        return { status: 200, body: { product, revision: library.revision() } }
      }

      if (method === 'GET' && parsed.kind === 'media') {
        const product = library.getView(parsed.id)
        if (!product) throw new ProductsError('product-not-found', 'product not found')
        return { status: 200, body: { product, media: product.media } }
      }

      if (method === 'GET' && parsed.kind === 'item') {
        const preview = url.searchParams.get('preview')
        if (preview) {
          const stream = library.resolvePreview(parsed.id, preview)
          return { status: 200, stream }
        }
        // Editing must retain persisted references even when files are currently unavailable.
        const product = url.searchParams.get('view') === 'edit'
          ? library.get(parsed.id)
          : library.getView(parsed.id)
        if (!product) throw new ProductsError('product-not-found', 'product not found')
        return { status: 200, body: { product } }
      }

      if (method === 'PUT' && parsed.kind === 'item') {
        const problem = jsonBodyProblem(req)
        if (problem) return problem
        const body = /** @type {Record<string, unknown>} */ (req.body)
        const product = library.update(parsed.id, body)
        return { status: 200, body: { product, revision: library.revision() } }
      }

      if (method === 'DELETE' && parsed.kind === 'item') {
        library.remove(parsed.id)
        return { status: 200, body: { revision: library.revision() } }
      }

      return { status: 404, body: { error: 'not-found', message: 'unknown route' } }
    } catch (error) {
      if (error instanceof ProductsError || error instanceof PickerError || error instanceof LinkImportError) {
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
 * Mount the products prefix on the official webServer seat.
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {{ dispatch: (req: object) => Promise<{ status: number, body?: unknown, stream?: unknown }> }} dispatcher
 * @returns {() => void} disposer
 */
export function registerProductsRoutes(webServer, dispatcher) {
  const dispose = webServer.register({
    kind: 'prefix',
    path: PREFIX,
    async handler(req, res) {
      try {
        const method = (req.method || 'GET').toUpperCase()
        const body = method === 'POST' || method === 'PUT' ? await readJsonBody(req) : undefined
        const result = await dispatcher.dispatch({
          method,
          url: req.url || `${PREFIX}/state`,
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
