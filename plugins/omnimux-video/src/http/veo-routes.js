/**
 * Google Vids / Veo Host HTTP:
 * - GET  /omnimux-video/api/veo/health
 * - POST /omnimux-video/api/veo/tasks
 * - GET  /omnimux-video/api/veo/tasks/:id
 * - GET  /omnimux-video/api/veo/media/:fileName
 */

import fs from 'node:fs'
import path from 'node:path'
import { requestRejection } from './request-authorization.js'
import { createVeoTaskStore, safeMediaBase, veoMediaUrl } from './veo-task-store.js'
import { seedVeoTask, VEO_DEFAULT_DURATION_SEC, VEO_DEFAULT_RESOLUTION } from '../shared/veoTaskSeed.js'
import { validateVeoTaskRequest } from '../contracts/veoContracts.js'
import { VEO_TASK_SPEC } from '../shared/veoTaskSpec.js'
import {
  detectOpenCliEnvironment,
  generateVideoSilently,
} from '../driver/veoHeadlessDriver.js'

export const VEO_API_PREFIX = '/omnimux-video/api/veo'

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
export function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text),
  })
  res.end(text)
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {{ maxBytes?: number }} [opts]
 */
export async function readJsonBody(req, opts = {}) {
  const maxBytes = opts.maxBytes ?? 1 * 1024 * 1024
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) return null
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    return null
  }
}

function defaultOutputDir() {
  return path.resolve(process.cwd(), '.workbuddy/demo/media')
}

/**
 * @param {{
 *   store?: ReturnType<typeof createVeoTaskStore>,
 *   detectEnv?: typeof detectOpenCliEnvironment,
 *   generate?: typeof generateVideoSilently,
 *   outputDir?: string,
 *   now?: () => number,
 * }} [deps]
 */
/**
 * Normalize Host/test URLs to relative paths under VEO_API_PREFIX.
 * Parses via URL so query strings stay out of the pathname match.
 * @param {string} rawPath
 */
export function normalizeVeoDispatchPath(rawPath) {
  const url = new URL(rawPath || '/', 'http://127.0.0.1')
  let pathname = url.pathname.replace(/\/+$/, '') || '/'
  if (pathname === VEO_API_PREFIX) {
    pathname = '/'
  } else if (pathname.startsWith(`${VEO_API_PREFIX}/`)) {
    pathname = pathname.slice(VEO_API_PREFIX.length) || '/'
  }
  return pathname
}

export function createVeoDispatcher(deps = {}) {
  const store = deps.store || createVeoTaskStore()
  const detectEnv = deps.detectEnv || detectOpenCliEnvironment
  const generate = deps.generate || generateVideoSilently
  const outputDir = deps.outputDir || defaultOutputDir()
  const now = deps.now || Date.now
  /** @type {Set<string>} */
  const running = new Set()

  /**
   * @param {{ method?: string, url?: string, body?: unknown }} req
   */
  async function dispatch(req) {
    const method = (req.method || 'GET').toUpperCase()
    const pathname = normalizeVeoDispatchPath(req.url || '/')

    if (method === 'GET' && pathname === '/health') {
      const env = detectEnv()
      return {
        status: 200,
        body: {
          ok: Boolean(env.installed && env.bridgeConnected),
          opencli: env,
          mediaDir: outputDir,
        },
      }
    }

    if (method === 'POST' && pathname === '/tasks') {
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      // 整个请求体交给契约校验：四模式新契约与旧契约（durationSec / parameters.durationSec）都从真源派生。
      const validation = validateVeoTaskRequest(body)
      if (!validation.valid) {
        return {
          status: 400,
          body: { error: 'invalid-request', message: validation.error, code: validation.code },
        }
      }
      const request = validation.request

      const env = detectEnv()
      if (!env.installed) {
        return {
          status: 503,
          body: { error: 'opencli-missing', message: '本机未安装 opencli，无法后台生成 Google Vids 成片' },
        }
      }
      if (!env.bridgeConnected) {
        return {
          status: 503,
          body: {
            error: 'opencli-bridge-disconnected',
            message: 'opencli 浏览器桥未连接，请先打开 Bridge / Extension 后再试',
          },
        }
      }

      const id = `task_veo_${now()}`
      const seeded = seedVeoTask({
        id,
        prompt: request.prompt,
        mode: request.mode,
        durationSec: request.seconds,
        status: 'queued',
        progress: 1,
        phase: 'queued',
        message: '任务已入队，准备启动无头沙箱…',
      })
      /** @type {Record<string, unknown>} */
      const vidsFields = {
        operation: request.operation,
        seconds: request.seconds,
        resolution: request.resolution,
        aspect_ratio: request.aspect_ratio,
      }
      if (request.image_url) vidsFields.image_url = request.image_url
      if (request.video_id) vidsFields.video_id = request.video_id
      const task = store.create({ ...seeded, ...vidsFields })

      // Fire-and-forget background generation.
      // NOTE: generateVideoSilently currently ignores `mode` and does not push
      // durationSec into Google Vids page controls — modes are UI/validation only.
      if (!running.has(id)) {
        running.add(id)
        Promise.resolve()
          .then(async () => {
            store.update(id, {
              status: 'generating',
              progress: 3,
              phase: 'initializing',
              message: '正在初始化 opencli 后台沙箱…',
            })
            const result = await generate({
              prompt: seeded.prompt,
              durationSec: seeded.durationSec,
              outputDir,
              onProgress: (evt) => {
                store.update(id, {
                  status: 'generating',
                  progress: evt?.percent ?? 0,
                  phase: evt?.phase || 'rendering',
                  message: evt?.message || '生成中…',
                })
              },
            })
            // Prefer generator fileName; otherwise basename of localPath — then
            // validate once so an unsafe provided name cannot fall through.
            const fileName = safeMediaBase(
              result.fileName || path.basename(result.localPath || ''),
            )
            if (!fileName) {
              throw new Error('invalid media file name')
            }
            const current = store.get(id)
            store.update(id, {
              status: 'completed',
              progress: 100,
              phase: 'completed',
              message: '成片已就绪',
              fileName,
              localPath: result.localPath,
              fileSize: result.fileSize,
              durationSec: result.durationSec || seeded.durationSec,
              resolution: result.resolution || current?.resolution || VEO_TASK_SPEC.resolution,
              videoUrl: veoMediaUrl(fileName),
              // Keep enqueue title; do not recompute from prompt.
              title: current?.title || seeded.title,
            })
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err)
            store.update(id, {
              status: 'failed',
              phase: 'failed',
              message,
              error: message,
            })
          })
          .finally(() => {
            running.delete(id)
          })
      }

      return { status: 202, body: { task } }
    }

    const taskMatch = pathname.match(/^\/tasks\/([^/]+)$/)
    if (method === 'GET' && taskMatch) {
      const id = decodeURIComponent(taskMatch[1] || '')
      const task = store.get(id)
      if (!task) return { status: 404, body: { error: 'not-found', message: `task not found: ${id}` } }
      return { status: 200, body: { task } }
    }

    return { status: 404, body: { error: 'not-found', message: `no route for ${method} ${pathname}` } }
  }

  return { dispatch, store, outputDir }
}

/**
 * Stream a completed media file if it stays inside the media directory.
 * @param {string} fileName
 * @param {string} outputDir
 * @param {import('node:http').ServerResponse} res
 */
export function trySendVeoMedia(fileName, outputDir, res) {
  const base = safeMediaBase(fileName)
  if (!base) return false
  const full = path.resolve(outputDir, base)
  const root = path.resolve(outputDir)
  if (!full.startsWith(root + path.sep) && full !== root) return false
  if (!fs.existsSync(full)) {
    sendJson(res, 404, { error: 'not-found', message: 'media missing' })
    return true
  }
  const stat = fs.statSync(full)
  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
  })
  fs.createReadStream(full).pipe(res)
  return true
}

/**
 * @param {{ register: Function }} webServer
 * @param {ReturnType<typeof createVeoDispatcher>} dispatcher
 * @param {{ getConnection?: () => unknown, outputDir?: string }} [deps]
 */
export function registerVeoRoutes(webServer, dispatcher, deps = {}) {
  const outputDir = deps.outputDir || dispatcher.outputDir || defaultOutputDir()
  const dispose = webServer.register({
    kind: 'prefix',
    path: VEO_API_PREFIX,
    async handler(req, res) {
      try {
        const rejection = requestRejection(req, deps.getConnection)
        if (rejection !== undefined) return sendJson(res, rejection, { error: 'request-denied' })

        const method = (req.method || 'GET').toUpperCase()
        if (method === 'OPTIONS') return sendJson(res, 204, {})

        const url = new URL(req.url || VEO_API_PREFIX, 'http://127.0.0.1')
        const mediaMatch = url.pathname.match(new RegExp(`^${VEO_API_PREFIX}/media/([^/]+)$`))
        if (method === 'GET' && mediaMatch) {
          const handled = trySendVeoMedia(decodeURIComponent(mediaMatch[1] || ''), outputDir, res)
          if (handled) return
        }

        const wantsBody = method === 'POST' || method === 'PUT'
        const body = wantsBody ? await readJsonBody(req) : undefined
        if (wantsBody && body === null) {
          sendJson(res, 400, { error: 'invalid-json', message: 'invalid json' })
          return
        }
        const result = await dispatcher.dispatch({
          method,
          url: req.url || VEO_API_PREFIX,
          body,
        })
        sendJson(res, result.status, result.body)
      } catch {
        sendJson(res, 500, { error: 'internal', message: 'internal error' })
      }
    },
  })
  return () => {
    dispose()
  }
}
