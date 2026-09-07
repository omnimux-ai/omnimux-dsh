import { assertLocalWrite, readOriginHeaders } from '../apps/origin.js'
import { readJsonBody, sendJson } from '../auth/http-routes.js'
import {
  ComposerAttachmentError,
  instantiateAssets,
  materializePaths,
  resolveSessionCwd,
  statusForCode,
} from './composer-attachments.js'

const PICK_FILES_PATH = '/omnimux/composer/attachments/pick-files'

function header(req, name) {
  const headers = req?.headers ?? {}
  const value = headers[name] ?? headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function requestOrigin(req) {
  const origin = header(req, 'origin') || header(req, 'referer') || ''
  if (!origin) return 'http://127.0.0.1'
  try {
    return new URL(origin).origin
  } catch {
    return 'http://127.0.0.1'
  }
}

/** Native dialogs require an explicit browser origin matching this Host exactly. */
function isSameOrigin(req) {
  if (!req.host || (!req.origin && !req.referer)) return false
  try {
    const source = new URL(req.origin || req.referer).origin
    const target = new URL(`${req.secure ? 'https' : 'http'}://${req.host}`).origin
    return source === target
  } catch {
    return false
  }
}

/**
 * @param {{
 *   sessionQuery?: { observeSession?: Function } | null,
 *   getSessionQuery?: () => { observeSession?: Function } | null,
 *   getDesktopRuntime?: () => { pickFiles?: () => Promise<string[]> } | undefined,
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
      if (path === PICK_FILES_PATH && !isSameOrigin(req)) throw new Error('cross-origin write refused')
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
      if (path === PICK_FILES_PATH) {
        await resolveSessionCwd(sessionId, sessionQuery)
        const runtime = deps.getDesktopRuntime?.()
        if (typeof runtime?.pickFiles !== 'function') {
          return { status: 501, body: { error: 'native-picker-unavailable', message: 'native file picker is unavailable' } }
        }
        try {
          const paths = await runtime.pickFiles()
          if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string')) {
            throw new Error('native file picker returned invalid paths')
          }
          return { status: 200, body: { paths } }
        } catch (error) {
          if (error?.code === 'native-picker-busy') {
            return { status: 409, body: { error: 'native-picker-busy', message: 'a native file picker is already open' } }
          }
          throw error
        }
      }
      if (path === '/omnimux/composer/attachments/materialize') {
        const { results } = await materializePaths({
          sessionId,
          paths: body.paths,
          filesOnly: body.filesOnly,
          sessionQuery,
        })
        return { status: 200, body: { results } }
      }
      if (path === '/omnimux/composer/attachments/instantiate') {
        const { results } = await instantiateAssets({
          sessionId,
          assetIds: body.assetIds,
          sessionQuery,
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
 * @param {{ getConnection?: () => { requestRejection: Function } | undefined }} [deps]
 */
export function registerComposerAttachmentRoutes(webServer, dispatcher, deps = {}) {
  return webServer.register({
    kind: 'prefix',
    path: '/omnimux/composer/attachments',
    async handler(req, res) {
      try {
        const isPicker = new URL(req.url || '/', 'http://127.0.0.1').pathname === PICK_FILES_PATH
        if (isPicker) {
          const connection = deps.getConnection?.()
          if (typeof connection?.requestRejection !== 'function') {
            sendJson(res, 503, { error: 'auth-unavailable', message: 'Host connection authentication is unavailable' })
            return
          }
          const rejection = connection.requestRejection(req)
          if (rejection !== undefined) {
            sendJson(res, rejection, { error: rejection === 401 ? 'unauthorized' : 'forbidden', message: 'Host connection authentication refused the request' })
            return
          }
        }
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
          origin: isPicker ? originHeaders.origin : (originHeaders.origin || requestOrigin(req)),
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
