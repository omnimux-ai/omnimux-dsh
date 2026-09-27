import { sendJson } from '../auth/http-routes.js'
import { getCreativeTemplatesSnapshot, TemplatesDataUnavailableError } from './snapshot.js'

const TEMPLATES_ROUTE_PREFIX = '/omnimux/templates'
const SNAPSHOT_PATH = `${TEMPLATES_ROUTE_PREFIX}/creative`
const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * @param {{ loadSnapshot?: () => { schemaVersion: number, dataVersion: string, items: Array<object> } }} [deps]
 * loadSnapshot is injectable so tests can cover the unavailable/empty branches.
 */
export function createTemplatesDispatcher(deps = {}) {
  const loadSnapshot = deps.loadSnapshot ?? getCreativeTemplatesSnapshot

  /**
   * @param {{ method: string, url: string }} req
   * @returns {{ status: number, body: object, headers?: Record<string, string> }}
   */
  function dispatch(req) {
    const url = new URL(req.url, 'http://127.0.0.1')
    const method = String(req.method || 'GET').toUpperCase()
    const path = url.pathname.replace(/\/+$/, '') || '/'
    if (method !== 'GET') {
      return {
        status: 405,
        body: { error: 'method not allowed' },
        headers: { ...NO_STORE, Allow: 'GET' },
      }
    }
    if (path !== SNAPSHOT_PATH) {
      return { status: 404, body: { error: 'not found' }, headers: NO_STORE }
    }
    try {
      const snapshot = loadSnapshot()
      return { status: 200, body: snapshot, headers: NO_STORE }
    } catch (error) {
      if (error instanceof TemplatesDataUnavailableError
        || (error && error.code === 'templates-unavailable')) {
        return { status: 503, body: { error: 'templates-unavailable' }, headers: NO_STORE }
      }
      return { status: 500, body: { error: 'internal error' }, headers: NO_STORE }
    }
  }

  return { dispatch }
}

/**
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {ReturnType<typeof createTemplatesDispatcher>} dispatcher
 */
export function registerTemplatesRoutes(webServer, dispatcher) {
  const dispose = webServer.register({
    kind: 'prefix',
    path: TEMPLATES_ROUTE_PREFIX,
    async handler(req, res) {
      try {
        const result = dispatcher.dispatch({
          method: req.method || 'GET',
          url: req.url || SNAPSHOT_PATH,
        })
        if (result.headers) {
          for (const [name, value] of Object.entries(result.headers)) {
            res.setHeader(name, value)
          }
        }
        sendJson(res, result.status, result.body)
      } catch {
        sendJson(res, 500, { error: 'internal error' })
      }
    },
  })
  return () => {
    dispose()
  }
}
