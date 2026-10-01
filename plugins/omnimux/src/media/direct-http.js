import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readJsonBody, sendJson } from '../auth/http-routes.js'
import { resolveSyncOfficialToken } from './mount.js'

export const DIRECT_MEDIA_GENERATE_ROUTE = '/omnimux/api/media/generate'

/**
 * Direct Media Generation HTTP Route.
 * Bypasses LLM Agent conversation loops, directly dispatching to the hub's media execution engines.
 *
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {{
 *   executeImage: (req: object) => Promise<any>,
 *   executeVideo: (req: object) => Promise<any>,
 * }} deps
 */
export function registerDirectMediaRoutes(webServer, deps) {
  if (!webServer || typeof webServer.register !== 'function') return () => {}
  const { executeImage, executeVideo } = deps || {}

  return webServer.register({
    kind: 'exact',
    path: DIRECT_MEDIA_GENERATE_ROUTE,
    async handler(req, res) {
      const method = (req.method || 'GET').toUpperCase()
      if (method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }

      let body
      try {
        body = await readJsonBody(req)
      } catch (err) {
        sendJson(res, 400, { ok: false, error: 'invalid-json' })
        return
      }

      if (!body || typeof body !== 'object') {
        sendJson(res, 400, { ok: false, error: 'body-required' })
        return
      }

      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
      const hasTaskHandle = Boolean(
        (typeof body.taskId === 'string' && body.taskId.trim())
        || (typeof body.task_id === 'string' && body.task_id.trim())
        || (typeof body.taskRef === 'string' && body.taskRef.trim())
        || (typeof body.task_ref === 'string' && body.task_ref.trim())
      )
      if (!prompt && !hasTaskHandle) {
        sendJson(res, 400, { ok: false, error: 'prompt-required' })
        return
      }

      const kind = body.kind === 'video' ? 'video' : 'image'
      const operation = typeof body.operation === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(body.operation)
        ? body.operation
        : undefined
      const executor = kind === 'video' ? executeVideo : executeImage
      if (typeof executor !== 'function') {
        sendJson(res, 503, { ok: false, error: `${kind}-generator-unavailable` })
        return
      }

      // 准备可写临时输出路径
      const destDir = path.join(os.tmpdir(), 'omnimux-generations')
      try {
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true })
        }
      } catch {
        // ignore mkdir error if already exists
      }

      const ext = kind === 'video' ? 'mp4' : 'png'
      const dest = body.dest || path.join(destDir, `direct_${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`)

      const envKey = resolveSyncOfficialToken()

      try {
        const requestedGroup = (typeof body.group === 'string' && body.group.trim())
          || (typeof body.channel === 'string' && body.channel.trim())
          || undefined
        const rawTaskId = body.taskId ?? body.task_id
        const normalizedTaskId = typeof rawTaskId === 'string' && rawTaskId.trim() ? rawTaskId.trim() : undefined
        const rawTaskRef = body.taskRef ?? body.task_ref
        const normalizedTaskRef = typeof rawTaskRef === 'string' && rawTaskRef.trim() ? rawTaskRef.trim() : undefined
        const normalizedRequestKey = typeof body.requestKey === 'string' && body.requestKey.trim() ? body.requestKey.trim() : undefined

        const executePayload = {
          prompt,
          dest,
          model: body.model,
          group: requestedGroup,
          channel: requestedGroup,
          operation,
          aspectRatio: body.aspectRatio,
          resolution: body.resolution,
          duration: body.duration,
          seed: body.seed,
          wait: body.wait !== false,
          requireListed: false,
          references: Array.isArray(body.references) ? body.references : undefined,
          taskId: normalizedTaskId,
          taskRef: normalizedTaskRef,
          requestKey: normalizedRequestKey,
          env: envKey ? { OMNIMUX_API_KEY: envKey } : undefined,
        }

        const result = await executor(executePayload)
        sendJson(res, 200, {
          ok: true,
          mode: result?.mode || 'live',
          taskId: result?.taskId || null,
          taskRef: result?.taskRef || null,
          url: result?.url || null,
          dest,
          kind,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        sendJson(res, 500, {
          ok: false,
          error: message,
        })
      }
    },
  })
}
