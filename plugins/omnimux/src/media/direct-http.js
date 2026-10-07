import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readJsonBody, sendJson } from '../auth/http-routes.js'
import { resolveExecutionPlan } from './execution-plan.js'
import { requestRejection } from '../host/request-authorization.js'
import { assertCapabilityEnabled } from '../gate/guard.js'
import {
  getMediaTaskRecord,
  findMediaTaskByUpstreamId,
  findMediaTaskByRequestKey,
  recordMediaCollectionFailure,
  updateMediaTaskRecord,
  canRecoverMediaTask,
} from './task-store.js'
import { appendMediaTaskLog } from './task-log.js'

export const DIRECT_MEDIA_GENERATE_ROUTE = '/omnimux/api/media/generate'

/**
 * Direct Media Generation HTTP Route.
 * Bypasses LLM Agent conversation loops, directly dispatching to the hub's media execution engines.
 *
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {{
 *   executeImage: (req: object) => Promise<any>,
 *   executeVideo: (req: object) => Promise<any>,
 *   runtimeSettings?: object,
 *   storageDir?: string,
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

      if (deps.getConnection) {
        const rejected = requestRejection(req, deps.getConnection)
        if (rejected) { sendJson(res, rejected, { ok: false, error: 'request-not-authorized' }); return }
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
        void appendMediaTaskLog({
          event: 'submit.rejected',
          capability: body.kind === 'video' ? 'video' : 'image',
          httpStatus: 400,
          message: 'prompt-required',
        })
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

      // 账本引用需提升到 try 外：catch 分支要按记录回写 failed 状态（#3011, #3062）
      const ledgerOpts = deps?.storageDir ? { storageDir: deps.storageDir } : {}
      let ledgerRecord = null
      let normalizedRequestKey = undefined

      try {
        if (deps.gate) assertCapabilityEnabled(deps.gate, kind, 'media')
        const requestedGroup = (typeof body.group === 'string' && body.group.trim())
          || (typeof body.channel === 'string' && body.channel.trim())
          || undefined
        const rawTaskId = body.taskId ?? body.task_id
        const normalizedTaskId = typeof rawTaskId === 'string' && rawTaskId.trim() ? rawTaskId.trim() : undefined
        const rawTaskRef = body.taskRef ?? body.task_ref
        const normalizedTaskRef = typeof rawTaskRef === 'string' && rawTaskRef.trim() ? rawTaskRef.trim() : undefined
        normalizedRequestKey = typeof body.requestKey === 'string' && body.requestKey.trim() ? body.requestKey.trim() : undefined

        // 账本短路（Issue #3011）：取回请求先读任务记录，ready/failed/中断
        // 状态在路由层直接裁决，不再把已终结的任务交给执行器轮询。
        if (normalizedTaskRef) {
          ledgerRecord = getMediaTaskRecord(normalizedTaskRef, ledgerOpts)
        } else if (normalizedTaskId) {
          ledgerRecord = findMediaTaskByUpstreamId(normalizedTaskId, ledgerOpts)
        } else if (normalizedRequestKey) {
          ledgerRecord = findMediaTaskByRequestKey(normalizedRequestKey, ledgerOpts)
        } else {
          ledgerRecord = null
        }

        if (ledgerRecord && ledgerRecord.capability !== kind) {
          sendJson(res, 409, { ok: false, error: '任务媒体类型与请求不一致', code: 'omnimux-task-conflict' })
          return
        }
        if (!normalizedTaskRef && !normalizedTaskId && ledgerRecord && body.model && ledgerRecord.model !== body.model.split('@')[0]) {
          sendJson(res, 409, { ok: false, error: '请求标识已绑定其他模型', code: 'omnimux-task-conflict' })
          return
        }
        if (normalizedTaskRef && !ledgerRecord && !normalizedTaskId) {
          sendJson(res, 500, {
            ok: false,
            error: '未找到对应的媒体任务记录，请重新提交生成',
            code: 'omnimux-task-not-found',
          })
          return
        }
        if (ledgerRecord && ledgerRecord.status === 'ready' && ledgerRecord.artifact?.cachePath
          && fs.existsSync(ledgerRecord.artifact.cachePath)) {
          sendJson(res, 200, {
            ok: true,
            mode: 'live',
            taskId: ledgerRecord.upstreamTaskId || ledgerRecord.taskRef,
            taskRef: ledgerRecord.taskRef,
            url: ledgerRecord.artifact.cachePath,
            dest: ledgerRecord.artifact.cachePath,
            kind,
          })
          return
        }
        if (ledgerRecord && ledgerRecord.status === 'failed' && !canRecoverMediaTask(ledgerRecord)) {
          sendJson(res, 500, {
            ok: false,
            taskRef: ledgerRecord.taskRef,
            recoverable: false,
            error: typeof ledgerRecord.error === 'string' && ledgerRecord.error.trim()
              ? ledgerRecord.error
              : '生成失败，请稍后重试',
            code: typeof ledgerRecord.errorCode === 'string' && ledgerRecord.errorCode.trim()
              ? ledgerRecord.errorCode
              : 'omnimux-failed',
          })
          return
        }
        if (normalizedTaskRef && ledgerRecord && (ledgerRecord.status === 'submitting' || ledgerRecord.status === 'submitted')
          && !ledgerRecord.upstreamTaskId && !ledgerRecord.artifact?.sourceUrl) {
          sendJson(res, 500, {
            ok: false,
            error: '任务已中断，请重新提交',
            code: 'omnimux-task-interrupted',
          })
          return
        }

        // 与 mount 同一条放行链：官方/BYOK 判定、凭据注入、requireListed
        // 全部由 resolveExecutionPlan 决定（BYOK → requireListed false 保持可用）。
        const plan = resolveExecutionPlan({
          kind,
          req: {
            prompt,
            model: body.model,
            group: requestedGroup,
            channel: requestedGroup,
            taskId: normalizedTaskId,
            taskRef: normalizedTaskRef,
          },
          current: deps?.getRuntimeSettings?.() ?? deps?.runtimeSettings,
        })
        const recoveredHandle = (ledgerRecord?.upstreamTaskId || ledgerRecord?.artifact?.sourceUrl) && canRecoverMediaTask(ledgerRecord)
        const executePayload = {
          ...plan.finalReq,
          prompt,
          dest,
          operation,
          aspectRatio: body.aspectRatio,
          resolution: body.resolution,
          duration: body.duration,
          sound: typeof body.sound === 'boolean' ? body.sound : undefined,
          seed: body.seed,
          requireListed: plan.requireListed,
          references: Array.isArray(body.references) ? body.references : undefined,
          taskId: recoveredHandle ? ledgerRecord.upstreamTaskId : normalizedTaskId,
          taskRef: recoveredHandle ? ledgerRecord.taskRef : normalizedTaskRef,
          requestKey: normalizedRequestKey,
          wait: recoveredHandle ? true : body.wait !== false,
        }

        const result = await executor(executePayload)
        // 只要带了 requestKey，响应必须能找回对应任务（Issue #3011）：
        // 执行器漏回 taskRef 时按 requestKey 从账本补捞同一记录。
        let responseTaskRef = result?.taskRef || null
        if (!responseTaskRef && normalizedRequestKey) {
          const keyed = findMediaTaskByRequestKey(normalizedRequestKey, ledgerOpts)
          if (keyed) responseTaskRef = keyed.taskRef
        }
        sendJson(res, 200, {
          ok: true,
          mode: result?.mode || 'live',
          taskId: result?.taskId || null,
          taskRef: responseTaskRef,
          url: result?.url || null,
          dest,
          kind,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        let targetRecord = ledgerRecord
        if (!targetRecord && normalizedRequestKey) {
          try {
            targetRecord = findMediaTaskByRequestKey(normalizedRequestKey, ledgerOpts)
          } catch {}
        }
        if (targetRecord?.upstreamTaskId || targetRecord?.artifact?.sourceUrl) {
          try {
            recordMediaCollectionFailure(targetRecord.taskRef, err, ledgerOpts)
          } catch (ledgerError) {
            void appendMediaTaskLog({
              event: 'request.failed',
              taskRef: targetRecord?.taskRef,
              message: `collection diagnostic could not be persisted: ${ledgerError.message}`,
            })
          }
        } else if (targetRecord && (targetRecord.status === 'submitting' || targetRecord.status === 'submitted')) {
          try {
            const failCode = err?.code || (err?.status ? `HTTP_${err.status}` : 'omnimux-failed')
            updateMediaTaskRecord(targetRecord.taskRef, {
              status: 'failed',
              error: message,
              errorCode: failCode,
            }, ledgerOpts)
          } catch (upErr) {
            void appendMediaTaskLog({
              event: 'request.failed',
              taskRef: targetRecord?.taskRef,
              message: `updateMediaTaskRecord failed: ${upErr instanceof Error ? upErr.message : String(upErr)}`,
            })
          }
        }
        const latest = targetRecord ? getMediaTaskRecord(targetRecord.taskRef, ledgerOpts) : null
        void appendMediaTaskLog({
          event: 'request.failed',
          taskRef: latest?.taskRef || targetRecord?.taskRef,
          requestKey: normalizedRequestKey,
          capability: kind,
          model: latest?.model,
          channel: latest?.group,
          httpStatus: typeof err?.status === 'number' ? err.status : undefined,
          upstreamCode: typeof err?.code === 'string' ? err.code : undefined,
          message,
        })
        const failure = { ok: false, error: message }
        if (latest) {
          failure.taskRef = latest.taskRef
          failure.recoverable = canRecoverMediaTask(latest)
        }
        if (typeof err?.code === 'string' && err.code.trim()) failure.code = err.code
        if (typeof err?.status === 'number' && Number.isFinite(err.status)) failure.status = err.status
        sendJson(res, 500, failure)
      }
    },
  })
}
