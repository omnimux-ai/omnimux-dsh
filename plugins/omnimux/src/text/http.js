import { requestRejection } from '../host/request-authorization.js'
import { completeTextViaChat } from './chat.js'

function sendJsonResponse(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(text)
}

/**
 * Register local text complete HTTP routes on the webServer.
 * Endpoint: POST /omnimux/text/complete
 *
 * @param {{ register: (spec: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {{
 *   getTextComplete?: () => { execute: Function } | undefined,
 *   textComplete?: { execute: Function },
 *   credentials?: object,
 *   settings?: object,
 *   env?: Record<string, string | undefined>,
 * }} [deps]
 * @returns {() => void} stop handle
 */
export function registerTextCompleteRoutes(webServer, deps = {}) {
  return webServer.register({
    kind: 'exact',
    path: '/omnimux/text/complete',
    async handler(req, res) {
      const rejection = requestRejection(req, deps.getConnection)
      if (rejection !== undefined) return sendJsonResponse(res, rejection, { ok: false, error: 'request-denied' })
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

      if (req.method !== 'POST') {
        return sendJsonResponse(res, 405, { ok: false, error: 'method-not-allowed' })
      }

      try {
        const chunks = []
        let length = 0
        const limit = 65536
        for await (const chunk of req) {
          length += chunk.length
          if (length > limit) {
            return sendJsonResponse(res, 413, { ok: false, error: 'payload-too-large' })
          }
          chunks.push(chunk)
        }

        const raw = Buffer.concat(chunks).toString('utf8')
        const body = raw ? JSON.parse(raw) : {}
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : (typeof body.userMessage === 'string' ? body.userMessage.trim() : '')
        const system = typeof body.system === 'string' ? body.system.trim() : (typeof body.systemPrompt === 'string' ? body.systemPrompt.trim() : '')
        const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined
        const maxTokens = typeof body.maxTokens === 'number' && body.maxTokens > 0 ? body.maxTokens : 1000

        if (!prompt && !system) {
          return sendJsonResponse(res, 400, { ok: false, error: 'prompt is required' })
        }

        // 1. 优先调用宿主注入的标准 textComplete 管道 (ctx.llm.stream)
        const textComplete = deps.getTextComplete?.() ?? deps.textComplete
        if (textComplete && typeof textComplete.execute === 'function') {
          try {
            const result = await textComplete.execute({
              prompt,
              system,
              model,
              maxTokens,
            })
            const text = typeof result === 'string' ? result : (result?.text || result?.content || '')
            if (text.trim()) {
              return sendJsonResponse(res, 200, { ok: true, text: text.trim() })
            }
          } catch (execErr) {
            console.warn('[TextComplete HTTP] textComplete.execute failed, fallback to completeTextViaChat:', execErr?.message)
          }
        }

        // 2. 回退通道：通过 completeTextViaChat 直接连接已配置的模型供应商
        const chatResult = await completeTextViaChat({
          model: model || 'gemini-3.8-flash',
          prompt,
          system,
          maxTokens,
          credentials: deps.credentials,
          settings: deps.settings,
          env: deps.env ?? process.env,
        })

        const text = typeof chatResult === 'string' ? chatResult : (chatResult?.text || chatResult?.content || '')
        if (!text.trim()) {
          return sendJsonResponse(res, 502, { ok: false, error: 'model returned empty text' })
        }

        return sendJsonResponse(res, 200, { ok: true, text: text.trim() })
      } catch (err) {
        console.error('[TextComplete HTTP] Route handler error:', err)
        return sendJsonResponse(res, 500, { ok: false, error: err?.message || String(err) })
      }
    },
  })
}
