import { readJsonBody, sendJson, SECRET_PATTERN } from '../auth/http-routes.js'
import { requestRejection } from '../host/request-authorization.js'

/**
 * Protected, stateless product directory and preview on the existing Host.
 * @param {{register: (route: {kind: string, path: string, handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}) => () => void}} webServer
 * @param {{products?: ReturnType<import('./generation-products.js').createGenerationProducts>, getConnection?: () => {requestRejection: (req: import('node:http').IncomingMessage) => number | undefined} | undefined}} deps
 */
export function registerGenerationProductRoutes(webServer, deps) {
  const paths = ['/omnimux/generation-products', '/omnimux/generation-products/preview']
  const failure = code => ({ schemaVersion: 1, status: code === 'catalog_unavailable' ? 'pending' : 'rejected', executable: false, issues: [{ code }] })
  /** Existing serializer refusal is a fixed V1 failure, not a field filter or qualification check. */
  const respond = (res, status, body) => SECRET_PATTERN.test(JSON.stringify(body))
    ? sendJson(res, 503, failure('catalog_unavailable')) : sendJson(res, status, body)
  const disposers = paths.map((path, index) => webServer.register({ kind: 'exact', path, async handler(req, res) {
    const method = (req.method || 'GET').toUpperCase()
    if (method !== (index === 0 ? 'GET' : 'POST')) return sendJson(res, 404, { error: 'not found' })
    const rejection = requestRejection(req, deps.getConnection)
    if (rejection !== undefined) return sendJson(res, rejection, { error: 'request-denied' })
    try {
      if (!deps.products) return sendJson(res, 503, failure('catalog_unavailable'))
      if (index === 0) return respond(res, 200, deps.products.list())
      const body = await readJsonBody(req, 1048576)
      if (body === null) return sendJson(res, 400, failure('invalid_request'))
      const checked = deps.products.preparePreview(body)
      const code = checked.issues[0]?.code
      const status = code === 'stale_fingerprint' ? 409 : ['invalid_request', 'unsupported_version', 'unknown_product', 'unknown_intent', 'unknown_parameter'].includes(code) ? 400 : 200
      return respond(res, status, checked)
    } catch (error) {
      const oversized = error?.code === 'request_too_large'
      return sendJson(res, oversized ? 413 : 503, failure(oversized ? 'request_too_large' : 'catalog_unavailable'))
    }
  } }))
  return () => { for (const dispose of disposers) dispose() }
}

/**
 * The model catalog, and its read-only gateway diagnostics.
 *
 * `GET /omnimux/model-catalog` returns the catalog unchanged.
 * `GET /omnimux/model-catalog?view=diagnostics` returns where the current
 * gateway snapshot came from, whether it is stale, and how the gateway view
 * differs from the catalog the hub serves (P1a). Diagnostics ride the same
 * protected resource as a view instead of a second path: no extra route to keep
 * in sync, and the catalog body is byte-for-byte what it was before.
 *
 * @param {{register: (route: {kind: string, path: string, handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}) => () => void}} webServer
 * @param {{list?: () => object|null, diagnostics?: () => object|null}} deps
 */
export function registerCatalogRoutes(webServer, deps) {
  return webServer.register({
    kind: 'exact',
    path: '/omnimux/model-catalog',
    async handler(req, res) {
      const method = (req.method || 'GET').toUpperCase()
      if (method !== 'GET') {
        sendJson(res, 404, { error: 'not found' })
        return
      }
      try {
        const view = new URL(req.url || '/', 'http://localhost').searchParams.get('view')
        const read = view === 'diagnostics' ? deps.diagnostics : deps.list
        const body = typeof read === 'function' ? read() : null
        if (!body || typeof body !== 'object') {
          sendJson(res, 503, { error: 'catalog unavailable' })
          return
        }
        sendJson(res, 200, body)
      } catch {
        sendJson(res, 500, { error: 'internal error' })
      }
    },
  })
}
