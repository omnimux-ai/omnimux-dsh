import { readJsonBody, sendJson } from '../auth/http-routes.js'
import { requestRejection } from '../host/request-authorization.js'

/**
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {{ list: () => object }} deps
 */
/**
 * Protected, stateless product directory and preview on the existing Host.
 * @param {{register: Function}} webServer
 * @param {{products?: {list: Function, preparePreview: Function}, getConnection?: Function}} deps
 */
export function registerGenerationProductRoutes(webServer, deps) {
  const paths = ['/omnimux/generation-products', '/omnimux/generation-products/preview']
  const failure = code => ({ schemaVersion: 1, status: code === 'catalog_unavailable' ? 'pending' : 'rejected', executable: false, issues: [{ code }] })
  const disposers = paths.map((path, index) => webServer.register({ kind: 'exact', path, async handler(req, res) {
    const method = (req.method || 'GET').toUpperCase()
    if (method !== (index === 0 ? 'GET' : 'POST')) return sendJson(res, 404, { error: 'not found' })
    const rejection = requestRejection(req, deps.getConnection)
    if (rejection !== undefined) return sendJson(res, rejection, { error: 'request-denied' })
    try {
      if (!deps.products) return sendJson(res, 503, failure('catalog_unavailable'))
      if (index === 0) return sendJson(res, 200, deps.products.list())
      const body = await readJsonBody(req, 1048576)
      if (body === null) return sendJson(res, 400, failure('invalid_request'))
      const checked = deps.products.preparePreview(body)
      const code = checked.issues[0]?.code
      const status = code === 'stale_fingerprint' ? 409 : ['invalid_request', 'unsupported_version', 'unknown_product', 'unknown_intent', 'unknown_parameter'].includes(code) ? 400 : 200
      return sendJson(res, status, checked)
    } catch (error) {
      const oversized = error?.code === 'request_too_large'
      return sendJson(res, oversized ? 413 : 503, failure(oversized ? 'request_too_large' : 'catalog_unavailable'))
    }
  } }))
  return () => { for (const dispose of disposers) dispose() }
}

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
        const body = typeof deps.list === 'function' ? deps.list() : null
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
