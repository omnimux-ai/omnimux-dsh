import { requestRejection } from '../host/request-authorization.js'
import { createIdentity } from './identity.js'
import {
  CLIENT_NAME,
  fetchSelf,
  pollDeviceToken,
  publicStatus,
  resolveSiteBaseUrl,
  startDeviceLogin,
} from './omnimux-auth.js'

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
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
 * Pure request handler used by tests and the webServer adapter.
 * @param {{
 *   store: ReturnType<typeof import('./store.js').createTokenStore>,
 *   pending: ReturnType<typeof import('./pending.js').createPendingStore>,
 *   siteBaseUrl: string,
 *   clientName?: string,
 *   fetcher?: typeof fetch,
 *   identity?: ReturnType<typeof import('./identity.js').createIdentity>,
 *   capabilities?: Record<string, boolean>,
 * }} deps
 */
export function createAuthDispatcher(deps) {
  const siteBaseUrl = resolveSiteBaseUrl(deps.siteBaseUrl)
  const clientName = deps.clientName || CLIENT_NAME
  const fetcher = deps.fetcher ?? fetch
  const identity = deps.identity ?? createIdentity({
    store: deps.store,
    siteBaseUrl,
    fetcher,
  })

  /**
   * @param {{ method: string, url: string, body?: unknown }} req
   */
  async function dispatch(req) {
    const url = new URL(req.url, 'http://127.0.0.1')
    const method = req.method.toUpperCase()
    const path = url.pathname

    if (method === 'GET' && path === '/omnimux/capabilities') {
      return {
        status: 200,
        body: {
          identity: true,
          videoGenerate: true,
          imageGenerate: true,
          textComplete: true,
          official: false,
          ...deps.capabilities,
        },
      }
    }

    if (method === 'GET' && (path === '/omnimux/api/brands' || path === '/omnimux/brands')) {
      const { getAllBrands } = await import('../brand/model-brands.js')
      return {
        status: 200,
        body: {
          brands: getAllBrands(),
        },
      }
    }

    if (method === 'GET' && (path === '/omnimux/api/inspiration/cards' || path === '/omnimux/api/minimax/showcase')) {
      const cards = await import('../../assets/minimax-showcase/creation-cards.json', { with: { type: 'json' } })
      return {
        status: 200,
        body: cards.default || cards,
      }
    }

    if (method === 'GET' && path === '/omnimux/auth/status') {
      const loaded = await identity.load({ verify: url.searchParams.get('verify') === '1' })
      const status = loaded.kind === 'token_invalid' ? 401 : loaded.kind === 'self_failed' ? 502 : 200
      return { status, body: loaded.body }
    }

    if (method === 'POST' && path === '/omnimux/auth/login') {
      try {
        const started = await startDeviceLogin({ fetcher, siteBaseUrl, clientName })
        const flowId = deps.pending.save({
          deviceCode: started.deviceCode,
          expiresAt: Date.now() + started.expiresIn * 1000,
          intervalMs: started.intervalSec * 1000,
          siteBaseUrl,
        })
        return {
          status: 200,
          body: {
            flow_id: flowId,
            verification_url: started.verificationUrl,
            user_code: started.userCode,
            expires_in: started.expiresIn,
            interval: started.intervalSec,
          },
        }
      } catch (error) {
        return { status: 502, body: { error: error instanceof Error ? error.message : 'login start failed' } }
      }
    }

    if (method === 'POST' && path === '/omnimux/auth/poll') {
      const body = req.body && typeof req.body === 'object' ? /** @type {Record<string, unknown>} */ (req.body) : {}
      const flowId = typeof body.flow_id === 'string' ? body.flow_id : ''
      const pending = flowId ? deps.pending.get(flowId) : undefined
      if (!pending) return { status: 404, body: { kind: 'expired', error: 'login flow not found or expired' } }
      const polled = await pollDeviceToken({
        fetcher,
        siteBaseUrl: pending.siteBaseUrl,
        deviceCode: pending.deviceCode,
      })
      if (polled.kind === 'success') {
        await deps.store.set(polled.accessToken, { userId: polled.userId, baseUrl: pending.siteBaseUrl })
        let profile = { id: polled.userId || undefined, username: polled.username || undefined }
        try {
          profile = await fetchSelf({
            fetcher,
            siteBaseUrl: pending.siteBaseUrl,
            token: polled.accessToken,
          })
        } catch {
          // token is stored; profile can fill in on the next verify
        }
        deps.store.writeProfileCache(profile)
        if (profile && profile.id != null && typeof deps.store.writeConfig === 'function') {
          deps.store.writeConfig({ userId: String(profile.id), baseUrl: pending.siteBaseUrl })
        }
        deps.pending.remove(flowId)
        return {
          status: 200,
          body: publicStatus({
            loggedIn: true,
            verified: true,
            siteBaseUrl: pending.siteBaseUrl,
            profile,
          }),
        }
      }
      if (polled.kind === 'pending' || polled.kind === 'slow_down') {
        return { status: 200, body: { kind: polled.kind, interval: polled.intervalSec } }
      }
      deps.pending.remove(flowId)
      const status = polled.kind === 'denied' ? 403 : 410
      return { status, body: { kind: polled.kind, error: polled.message } }
    }

    if (method === 'POST' && path === '/omnimux/auth/logout') {
      deps.pending.clear()
      await deps.store.unset()
      return { status: 200, body: publicStatus({ loggedIn: false, verified: null, siteBaseUrl }) }
    }

    return { status: 404, body: { error: 'not found' } }
  }

  return { dispatch }
}

/**
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {ReturnType<typeof createAuthDispatcher>} dispatcher
 */
export function registerAuthRoutes(webServer, dispatcher, deps = {}) {
  const paths = [
    '/omnimux/auth/status',
    '/omnimux/auth/login',
    '/omnimux/auth/poll',
    '/omnimux/auth/logout',
    '/omnimux/capabilities',
  ]
  const disposers = paths.map((path) => webServer.register({
    kind: 'exact',
    path,
    async handler(req, res) {
      try {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const rejection = requestRejection(req, deps.getConnection)
          if (rejection !== undefined) return sendJson(res, rejection, { error: 'request-denied' })
        }
        const body = req.method === 'POST' ? await readJsonBody(req) : undefined
        if (req.method === 'POST' && body === null) {
          sendJson(res, 400, { error: 'invalid json' })
          return
        }
        const result = await dispatcher.dispatch({
          method: req.method || 'GET',
          url: req.url || path,
          body,
        })
        sendJson(res, result.status, result.body)
      } catch {
        sendJson(res, 500, { error: 'internal error' })
      }
    },
  }))
  return () => {
    for (const dispose of disposers) dispose()
  }
}
