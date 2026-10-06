/**
 * Google Vids / Veo Host HTTP:
 * - GET  /omnimux-video/api/veo/health
 * - POST /omnimux-video/api/veo/tasks
 * - GET  /omnimux-video/api/veo/tasks/:id
 * - POST /omnimux-video/api/veo/uploads   （选图上传：把图片落到插件自己的媒体目录）
 * - GET  /omnimux-video/api/veo/media/:fileName
 *
 * 生成后端在装载期按「中枢缝是否可用」选择（Issue #3186）：中枢可用走 `videoGenerate`，
 * 否则回退插件自带的内部驱动。对外路径、请求体与轮询语义保持不变。
 */

import fs from 'node:fs'
import path from 'node:path'
import { requestRejection } from './request-authorization.js'
import { createVeoTaskStore, defaultVeoMediaDir, safeMediaBase, veoMediaUrl } from './veo-task-store.js'
import { seedVeoTask, VEO_DEFAULT_DURATION_SEC, VEO_DEFAULT_RESOLUTION } from '../shared/veoTaskSeed.js'
import { validateVeoTaskRequest } from '../contracts/veoContracts.js'
import { VEO_TASK_SPEC } from '../shared/veoTaskSpec.js'
import {
  detectOpenCliEnvironment,
  generateVideoSilently,
} from '../driver/veoHeadlessDriver.js'

export const VEO_API_PREFIX = '/omnimux-video/api/veo'

/** 选图上传：接受的最小图片集合与体积上限。 */
export const VEO_UPLOAD_MAX_BYTES = 8 * 1024 * 1024

/** @type {Readonly<Record<string, string>>} mime → 扩展名 */
const VEO_UPLOAD_EXTENSIONS = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
})

/** @type {Readonly<Record<string, string>>} 扩展名 → 响应 Content-Type */
const VEO_MEDIA_CONTENT_TYPES = Object.freeze({
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
})

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

/**
 * 读取原始字节体；超过上限返回 null（由调用方给出可读的 413）。
 * @param {import('node:http').IncomingMessage} req
 * @param {number} maxBytes
 * @returns {Promise<Buffer | null>}
 */
export async function readRawBody(req, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) return null
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * 按魔数判定图片类型——只信字节，不信请求头里的声明。
 * @param {Buffer} buffer
 * @returns {string} mime 或空串
 */
export function sniffImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return ''
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return ''
}

/**
 * 媒体目录里的对外地址。中枢与本机服务要抓取的是**绝对**地址，所以优先用请求 Host 拼；
 * 没有 Host（非 HTTP 调用）时退回同源相对地址。
 * @param {{ headers?: Record<string, unknown>, socket?: { encrypted?: boolean } }} req
 * @param {string} fileName
 */
export function veoPublicMediaUrl(req, fileName) {
  const relative = `/omnimux-video/api/veo/media/${encodeURIComponent(fileName)}`
  const host = typeof req?.headers?.host === 'string' ? req.headers.host.trim() : ''
  if (!host) return relative
  const scheme = req?.socket?.encrypted ? 'https' : 'http'
  return `${scheme}://${host}${relative}`
}

function defaultOutputDir() {
  return defaultVeoMediaDir()
}

/**
 * @param {{
 *   store?: ReturnType<typeof createVeoTaskStore>,
 *   detectEnv?: typeof detectOpenCliEnvironment,
 *   generate?: typeof generateVideoSilently,
 *   hubAvailable?: () => boolean,
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
  // 中枢缝可用时，本机 opencli / 桥接的就绪与否与生成无关（Issue #3186）：
  // 前置门禁只约束内部驱动这条回退路径。
  const hubAvailable = deps.hubAvailable || (() => false)
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
      const hub = Boolean(hubAvailable())
      return {
        status: 200,
        body: {
          ok: hub || Boolean(env.installed && env.bridgeConnected),
          opencli: env,
          hub: { available: hub },
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
      const channel = hubAvailable() ? 'hub' : 'internal'

      if (channel === 'internal') {
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
        channel,
      }
      if (request.image_url) vidsFields.image_url = request.image_url
      if (request.video_id) vidsFields.video_id = request.video_id
      const task = store.create({ ...seeded, ...vidsFields })

      // Fire-and-forget background generation.
      // 内部驱动忽略 `mode` 且不把 durationSec 写进页面控件（模式仅为 UI/校验）；
      // 中枢缝则消费 operation / image_url / video_id 三个字段。
      if (!running.has(id)) {
        running.add(id)
        Promise.resolve()
          .then(async () => {
            /** @type {Record<string, unknown>} */
            const starting = {
              status: 'generating',
              phase: channel === 'hub' ? 'submitting' : 'initializing',
              message: channel === 'hub'
                ? '正在提交到本机 Google Vids 通道…'
                : '正在初始化 opencli 后台沙箱…',
            }
            // 内部驱动的百分比是它自己上报的真实阶段值；中枢缝没有进度通道，
            // 因此这里不给中枢路径填百分比（进度只反映真实阶段）。
            if (channel === 'internal') starting.progress = 3
            store.update(id, starting)

            const result = await generate({
              prompt: seeded.prompt,
              durationSec: seeded.durationSec,
              seconds: request.seconds,
              mode: request.mode,
              operation: request.operation,
              resolution: request.resolution,
              aspectRatio: request.aspect_ratio,
              imageUrl: request.image_url,
              videoId: request.video_id,
              outputDir,
              onProgress: (evt) => {
                /** @type {Record<string, unknown>} */
                const patch = {
                  status: 'generating',
                  phase: evt?.phase || 'rendering',
                  message: evt?.message || '生成中…',
                }
                if (typeof evt?.percent === 'number') patch.progress = evt.percent
                store.update(id, patch)
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
            /** @type {Record<string, unknown>} */
            const completed = {
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
              channel,
              // Keep enqueue title; do not recompute from prompt.
              title: current?.title || seeded.title,
            }
            // 上游标识只在中枢路径存在；回填后「修改 / 延续」才能引用这条成片。
            if (result.upstreamTaskId) completed.upstreamTaskId = result.upstreamTaskId
            if (result.upstreamUrl) completed.upstreamUrl = result.upstreamUrl
            store.update(id, completed)
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err)
            /** @type {Record<string, unknown>} */
            const patch = { status: 'failed', phase: 'failed', message, error: message }
            const code = err && typeof err.code === 'string' ? err.code : ''
            if (code) patch.errorCode = code
            store.update(id, patch)
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

  return { dispatch, store, outputDir, hubAvailable }
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
  const contentType = VEO_MEDIA_CONTENT_TYPES[path.extname(base).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
  })
  fs.createReadStream(full).pipe(res)
  return true
}

/**
 * 处理一次选图上传：只接受声明且魔数匹配的图片类型，文件名由插件生成
 * （不接受任何调用方给出的路径），落进插件自己的媒体目录。
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ outputDir: string, now?: () => number }} deps
 * @returns {Promise<boolean>} true = 已响应
 */
export async function handleVeoUpload(req, res, deps) {
  const declared = String(req.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase()
  const extension = VEO_UPLOAD_EXTENSIONS[declared]
  if (!extension) {
    sendJson(res, 415, {
      error: 'unsupported-media-type',
      message: '仅支持 PNG / JPEG / WebP 图片',
    })
    return true
  }

  const buffer = await readRawBody(req, VEO_UPLOAD_MAX_BYTES)
  if (buffer === null) {
    sendJson(res, 413, {
      error: 'payload-too-large',
      message: `图片体积超过上限 ${Math.round(VEO_UPLOAD_MAX_BYTES / 1024 / 1024)} MB`,
    })
    return true
  }
  if (buffer.length === 0) {
    sendJson(res, 400, { error: 'empty-payload', message: '没有收到图片数据' })
    return true
  }

  const sniffed = sniffImageMime(buffer)
  if (sniffed !== declared) {
    sendJson(res, 415, {
      error: 'unsupported-media-type',
      message: '图片内容与声明的类型不一致',
    })
    return true
  }

  const now = deps.now || Date.now
  const fileName = `vids_upload_${now()}.${extension}`
  const full = path.join(deps.outputDir, fileName)
  fs.mkdirSync(deps.outputDir, { recursive: true })
  fs.writeFileSync(full, buffer)

  sendJson(res, 200, {
    url: veoPublicMediaUrl(req, fileName),
    fileName,
    fileSize: buffer.length,
    mime: sniffed,
  })
  return true
}

/**
 * @param {{ register: Function }} webServer
 * @param {ReturnType<typeof createVeoDispatcher>} dispatcher
 * @param {{ getConnection?: () => unknown, outputDir?: string, now?: () => number }} [deps]
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

        // 选图上传走原始字节体，不能落进下面的 JSON 体解析。
        if (method === 'POST' && url.pathname === `${VEO_API_PREFIX}/uploads`) {
          const handled = await handleVeoUpload(req, res, { outputDir, now: deps.now })
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
      } catch (err) {
        // 不把可读原因压成通用 500：真实原因必须能到达调用方。
        const message = err instanceof Error && err.message ? err.message : '内部错误'
        const code = err && typeof err.code === 'string' ? err.code : ''
        sendJson(res, 500, { error: 'internal', message, ...(code ? { code } : {}) })
      }
    },
  })
  return () => {
    dispose()
  }
}
