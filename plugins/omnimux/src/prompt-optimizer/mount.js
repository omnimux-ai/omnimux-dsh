import { evaluate, isConfigured } from './optimize.js'
import { readJsonBody, sendJson } from '../auth/http-routes.js'
import { requestRejection } from '../host/request-authorization.js'

export const PROMPT_OPTIMIZER_ROUTE = '/omnimux/prompt-optimizer'

/**
 * Merge mount-time deps with the lazily-resolved credentials seam.
 * @param {object} ctx
 * @param {object} deps
 */
function resolveServiceDeps(ctx, deps) {
  return {
    env: deps.env,
    fetcher: deps.fetcher,
    credentials: deps.credentials || ctx.get?.('credentials'),
    credentialsPath: deps.credentialsPath,
  }
}

/**
 * Mount the prompt-optimizer host service.
 * Provides `ctx.provide('promptOptimizer', …)` — the client bridge calls
 * `evaluate(draft)` and polls `isConfigured()` for the disabled tooltip.
 *
 * @param {{
 *   provide?: (name: string, value: unknown) => void,
 *   get?: (name: string) => unknown,
 * }} ctx
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   fetcher?: typeof fetch,
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   credentialsPath?: string,
 * }} [deps]
 */
export function mountPromptOptimizer(ctx, deps = {}) {
  const serviceDeps = resolveServiceDeps(ctx, deps)

  if (typeof ctx.provide === 'function') {
    ctx.provide('promptOptimizer', {
      evaluate: (text, options) => evaluate(serviceDeps, text, options),
      isConfigured: () => isConfigured(serviceDeps),
    })
  }
}

/**
 * Same-origin HTTP face for the composer UI:
 * - GET  /omnimux/prompt-optimizer → { configured: bool }
 * - POST /omnimux/prompt-optimizer { text } → evaluate result, or
 *   200 + { ok: false, unconfigured: true } when JEV_API_KEY is absent.
 *
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {{
 *   getConnection?: () => { requestRejection: Function } | undefined,
 *   env?: Record<string, string | undefined>,
 *   fetcher?: typeof fetch,
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   credentialsPath?: string,
 * }} [deps]
 */
export function registerPromptOptimizerRoutes(webServer, deps = {}) {
  if (!webServer || typeof webServer.register !== 'function') return () => {}
  const serviceDeps = {
    env: deps.env,
    fetcher: deps.fetcher,
    credentials: deps.credentials,
    credentialsPath: deps.credentialsPath,
  }

  return webServer.register({
    // WebRouteKind is 'exact' | 'prefix' (dsh-host-webserver); every route in
    // this plugin uses the same vocabulary — there is no 'json' kind.
    kind: 'exact',
    path: PROMPT_OPTIMIZER_ROUTE,
    async handler(req, res) {
      const method = (req.method || 'GET').toUpperCase()

      try {
        if (method === 'GET') {
          sendJson(res, 200, { configured: await isConfigured(serviceDeps) })
          return
        }

        if (method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
          return
        }

        const rejection = requestRejection(req, deps.getConnection)
        if (rejection !== undefined) {
          sendJson(res, rejection, { ok: false, error: 'request-denied' })
          return
        }

        const body = await readJsonBody(req)
        if (!body || typeof body !== 'object') {
          sendJson(res, 400, { ok: false, error: 'invalid-json' })
          return
        }
        const text = typeof body.text === 'string' ? body.text : ''
        if (!text.trim()) {
          sendJson(res, 400, { ok: false, error: 'text is required' })
          return
        }

        if (!(await isConfigured(serviceDeps))) {
          sendJson(res, 200, { ok: false, unconfigured: true })
          return
        }

        const result = await evaluate(serviceDeps, text)
        sendJson(res, 200, result)
      } catch (error) {
        if (error && typeof error === 'object' && error.code === 'omnimux-unconfigured') {
          sendJson(res, 200, { ok: false, unconfigured: true })
          return
        }
        sendJson(res, 500, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  })
}
