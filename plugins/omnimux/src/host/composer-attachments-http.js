import { assertLocalWrite, readOriginHeaders } from '../apps/origin.js'
import { readJsonBody, sendJson } from '../auth/http-routes.js'
import {
  ComposerAttachmentError,
  instantiateAssets,
  statusForCode,
} from './composer-attachments.js'

function requestOrigin(req) {
  const origin = header(req, 'origin') || header(req, 'referer') || ''
  if (!origin) return 'http://127.0.0.1'
  try {
    return new URL(origin).origin
  } catch {
    return 'http://127.0.0.1'
  }
}

function header(req, name) {
  const headers = req?.headers ?? {}
  const value = headers[name] ?? headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

/**
 * @param {{
 *   sessionQuery?: { observeSession?: Function } | null,
 *   getSessionQuery?: () => { observeSession?: Function } | null,
 *   fetchAsset?: (id: string) => Promise<any>,
 *   fetchImpl?: typeof fetch,
 *   origin?: string,
 * }} [deps]
 */
export function createComposerAttachmentsDispatcher(deps = {}) {
  /**
   * @param {{ method: string, url: string, body?: unknown, origin?: string, referer?: string, secFetchSite?: string, host?: string, secure?: boolean }} req
   */
  async function dispatch(req) {
    const url = new URL(req.url, 'http://127.0.0.1')
    const method = (req.method || 'GET').toUpperCase()
    const path = url.pathname
    if (method !== 'POST') {
      return { status: 405, body: { error: 'method-not-allowed', message: 'method not allowed' } }
    }
    try {
      assertLocalWrite(req)
    } catch {
      return { status: 403, body: { error: 'not-local', message: 'cross-origin write refused' } }
    }
    if (req.body === null) {
      return { status: 400, body: { error: 'invalid-json', message: 'invalid json' } }
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    const sessionQuery = typeof deps.getSessionQuery === 'function'
      ? deps.getSessionQuery()
      : (deps.sessionQuery ?? null)
    const origin = deps.origin || req.origin || 'http://127.0.0.1'
    try {
      if (path === '/omnimux/composer/attachments/instantiate') {
        const { results } = await instantiateAssets({
          sessionId,
          assetIds: body.assetIds,
          sessionQuery,
          fetchAsset: deps.fetchAsset,
          fetchImpl: deps.fetchImpl,
          origin,
        })
        return { status: 200, body: { results } }
      }
      return { status: 404, body: { error: 'not-found', message: 'unknown route' } }
    } catch (error) {
      if (error instanceof ComposerAttachmentError) {
        return {
          status: statusForCode(error.code),
          body: { error: error.code, message: error.message },
        }
      }
      return { status: 500, body: { error: 'internal', message: error instanceof Error ? error.message : String(error) } }
    }
  }

  return { dispatch }
}

/**
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {ReturnType<typeof createComposerAttachmentsDispatcher>} dispatcher
 */
export function registerComposerAttachmentRoutes(webServer, dispatcher) {
  return webServer.register({
    kind: 'prefix',
    path: '/omnimux/composer/attachments',
    async handler(req, res) {
      try {
        const body = req.method === 'POST' ? await readJsonBody(req) : undefined
        if (req.method === 'POST' && body === null) {
          sendJson(res, 400, { error: 'invalid-json', message: 'invalid json' })
          return
        }
        const originHeaders = readOriginHeaders(req)
        const result = await dispatcher.dispatch({
          method: req.method || 'GET',
          url: req.url || '/omnimux/composer/attachments',
          body,
          origin: originHeaders.origin || requestOrigin(req),
          referer: originHeaders.referer,
          secFetchSite: originHeaders.secFetchSite,
          host: header(req, 'host'),
          secure: Boolean(req.socket?.encrypted),
        })
        sendJson(res, result.status, result.body)
      } catch {
        sendJson(res, 500, { error: 'internal', message: 'internal error' })
      }
    },
  })
}
