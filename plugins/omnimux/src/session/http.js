export const SESSION_MODEL_ROUTE = '/omnimux/session-model'

/**
 * Read/write route for the composer's model picker.
 *
 * The picker lives in the market client and previously wrote its choice to
 * browser-local state, where no generation path could read it. Keeping the
 * choice in the hub gives the agent context injector and the media tools one
 * authority to read.
 *
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {{ preference: { get: Function, set: Function } }} deps
 */
export function registerSessionModelRoutes(webServer, deps) {
  if (!webServer || typeof webServer.register !== 'function') return () => {}
  const preference = deps?.preference
  if (!preference || typeof preference.get !== 'function' || typeof preference.set !== 'function') {
    return () => {}
  }

  return webServer.register({
    kind: 'exact',
    path: SESSION_MODEL_ROUTE,
    async handler(req, res) {
      const { readJsonBody, sendJson } = await import('../auth/http-routes.js')
      const method = (req.method || 'GET').toUpperCase()

      if (method === 'GET') {
        let sessionId = ''
        try {
          sessionId = new URL(req.url ?? SESSION_MODEL_ROUTE, 'http://127.0.0.1').searchParams.get('sessionId') ?? ''
        } catch {
          sessionId = ''
        }
        const choice = preference.get(sessionId)
        sendJson(res, 200, {
          ok: true,
          sessionId,
          // A session on "automatic" reports the same shape the client writes,
          // so a caller never has to distinguish absent from auto.
          auto: !choice,
          modelId: choice?.modelId ?? '',
          label: choice?.label ?? '',
        })
        return
      }

      if (method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }

      const body = await readJsonBody(req)
      if (!body || typeof body !== 'object') {
        sendJson(res, 400, { ok: false, error: 'invalid-json' })
        return
      }

      const sessionId = String(body.sessionId || '').trim()
      if (!sessionId) {
        sendJson(res, 400, { ok: false, error: 'session-required' })
        return
      }

      const choice = preference.set(sessionId, body)
      sendJson(res, 200, {
        ok: true,
        sessionId,
        auto: !choice || choice.auto !== false || !choice.modelId,
        modelId: choice?.modelId ?? '',
        label: choice?.label ?? '',
      })
    },
  })
}
