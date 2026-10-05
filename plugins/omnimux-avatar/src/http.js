// 形象管理 HTTP 路由：单个 prefix 注册承载全部子路径。
// 约定与 omnimux-forms / omnimux-products 一致：宿主鉴权先行、写路由同源 + JSON + 体积上限。
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { PresetSnapshot } from './presets.js'
import { ETag, servedTaxonomy } from './taxonomy.js'
import { AvatarError, latestTaskOf } from './store.js'

const PREFIX = '/api/omnimux/avatar'
const BODY_LIMIT = 64 * 1024
// 超限后仍读一段以给出可读的 413，再大就直接断开连接。
const DRAIN_LIMIT = 1024 * 1024
const PRESET_ASSET_PREFIX = '/influencer-presets/'
const PRESET_ASSET_PATH = /^\/influencer-presets\/[0-9a-f]{8,}\.webp$/

const messageOf = (error) => (error instanceof Error ? error.message : String(error))

/**
 * 注册形象路由。
 * @param {{ register: (route: object) => unknown }} webServer
 * @param {{ store: object, generation: object, librarySync: object, paths: object,
 *           ctx?: unknown, connection?: unknown }} deps
 */
export function registerAvatarRoutes(webServer, deps = {}) {
  // librarySync 供 POST /sync 手动补偿使用；自动归档在任务转 ready 时已经跑过一次。
  const { store, generation, paths, librarySync } = deps

  /** 宿主连接座位：给了 ctx 就按请求实时取，便于座位后注册与测试替换。 */
  function connectionOf() {
    const ctx = deps.ctx
    if (ctx && typeof ctx.get === 'function') {
      let seat
      try {
        seat = ctx.get('connection')
      } catch {
        seat = undefined
      }
      if (seat !== undefined) return seat
    }
    return deps.connection ?? (ctx ? ctx.connection : undefined)
  }

  async function handler(req, res) {
    const send = (status, body, headers = {}) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...headers,
      })
      res.end(JSON.stringify(body))
    }
    const fail = (status, code, message) => send(status, { success: false, error: { code, message } })
    const withLatest = (avatar) => ({ ...avatar, latestTask: latestTaskOf(avatar) })

    try {
      const connection = connectionOf()
      if (typeof connection?.requestRejection !== 'function') {
        return fail(503, 'needs-connection', '宿主连接鉴权不可用')
      }
      const rejection = connection.requestRejection(req)
      if (rejection !== undefined && rejection !== null) {
        return fail(rejection, 'request-rejected', '宿主连接鉴权拒绝了该请求')
      }

      const url = new URL(req.url, 'http://localhost')
      if (!url.pathname.startsWith(PREFIX)) return fail(404, 'not-found', 'Not found')
      const route = url.pathname.slice(PREFIX.length) || '/'
      const method = req.method ?? 'GET'

      if (method === 'GET') {
        if (route === '/taxonomy') {
          return send(200, { success: true, data: servedTaxonomy(), etag: ETag() }, {
            'Cache-Control': 'private, max-age=300',
          })
        }
        if (route === '/presets') return send(200, { success: true, data: PresetSnapshot() })
        if (route === '/presets/asset') return await streamPresetAsset(req, res, url, fail, paths)
        if (route === '/avatars') {
          return send(200, { success: true, revision: store.revision(), avatars: store.list().map(withLatest) })
        }
        if (route === '/tasks') {
          const avatarId = url.searchParams.get('avatarId') ?? ''
          if (avatarId === '') return fail(400, 'invalid_request', '缺少 avatarId')
          return send(200, { success: true, tasks: store.listTasks(avatarId) })
        }
        if (route === '/task') {
          const avatarId = url.searchParams.get('avatarId') ?? ''
          const taskId = url.searchParams.get('taskId') ?? ''
          if (avatarId === '' || taskId === '') return fail(400, 'invalid_request', '缺少 avatarId 或 taskId')
          const task =
            url.searchParams.get('refresh') === '1'
              ? await generation.refreshTask({ avatarId, taskId })
              : store.findTask(avatarId, taskId)
          if (!task) throw new AvatarError('task-not-found', 'task not found', 404)
          return send(200, { success: true, task })
        }
        return fail(404, 'not-found', 'Not found')
      }

      if (method !== 'POST') return fail(405, 'method-not-allowed', 'Method not allowed')

      const rejectionOfWrite = assertWritable(req)
      if (rejectionOfWrite) return fail(rejectionOfWrite.status, rejectionOfWrite.code, rejectionOfWrite.message)

      let body
      try {
        body = await readJsonBody(req)
      } catch (error) {
        if (error instanceof AvatarError) return fail(error.status, error.code, error.message)
        throw error
      }

      switch (route) {
        case '/avatars': {
          const avatar = store.create({ name: body.name, sheet: body.sheet })
          return send(200, { success: true, avatar })
        }
        case '/avatars/update': {
          if (typeof body.id !== 'string' || body.id === '') {
            return fail(400, 'invalid_request', '缺少 id')
          }
          const avatar = store.update(body.id, { name: body.name, sheet: body.sheet })
          return send(200, { success: true, avatar })
        }
        case '/avatars/delete': {
          if (typeof body.id !== 'string' || body.id === '') {
            return fail(400, 'invalid_request', '缺少 id')
          }
          if (body.confirm !== true) {
            return fail(400, 'confirmation-required', '删除形象需要显式 confirm: true')
          }
          store.remove(body.id)
          return send(200, { success: true, deleted: true })
        }
        case '/sheet': {
          const result = await generation.submitSheet(body)
          return send(200, { success: true, ...result })
        }
        case '/multiview': {
          const result = await generation.submitMultiView(body)
          return send(200, { success: true, ...result })
        }
        case '/sync': {
          // 归档失败后的手动补偿入口；自动归档在任务转 ready 时已经跑过一次。
          if (typeof body.avatarId !== 'string' || body.avatarId === '') {
            return fail(400, 'invalid_request', '缺少 avatarId')
          }
          const kind = body.kind === 'multiview' || body.kind === 'both' ? body.kind : 'sheet'
          const sheet = kind === 'multiview' ? null : await librarySync.syncSheet(body.avatarId)
          const multiView = kind === 'sheet' ? null : await librarySync.syncMultiView(body.avatarId)
          // 补偿成功后必须清掉任务的未入库标记，否则界面会一直显示「尚未保存到资产库」。
          const cleared = generation.clearSyncError(body.avatarId, kind)
          return send(200, { success: true, sheet, multiView, cleared, status: librarySync.status(body.avatarId) })
        }
        case '/tasks/delete': {
          if (typeof body.avatarId !== 'string' || typeof body.taskId !== 'string') {
            return fail(400, 'invalid_request', '缺少 avatarId 或 taskId')
          }
          store.removeTask(body.avatarId, body.taskId)
          return send(200, { success: true })
        }
        default:
          return fail(404, 'not-found', 'Not found')
      }
    } catch (error) {
      if (error instanceof AvatarError) return fail(error.status ?? 500, error.code, error.message)
      return fail(500, 'internal_error', messageOf(error))
    }
  }

  return webServer.register({ kind: 'prefix', path: PREFIX, handler })
}

/** 写路由守卫：跨站、非同源、非 JSON 一律拒绝。 */
function assertWritable(req) {
  const headers = req.headers ?? {}
  if (String(headers['sec-fetch-site'] ?? '').toLowerCase() === 'cross-site') {
    return { status: 403, code: 'cross-site', message: '拒绝跨站写入' }
  }
  const origin = headers.origin || headers.referer
  if (origin) {
    let host = ''
    try {
      host = new URL(String(origin)).host
    } catch {
      return { status: 403, code: 'cross-site', message: '拒绝跨站写入' }
    }
    if (host !== headers.host) return { status: 403, code: 'cross-site', message: '拒绝跨站写入' }
  }
  if (!String(headers['content-type'] ?? '').startsWith('application/json')) {
    return { status: 415, code: 'json-required', message: '需要 application/json' }
  }
  return null
}

/** 读 JSON 请求体，超过 64KB 直接拒绝。 */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  let tooLarge = false
  for await (const chunk of req) {
    size += chunk.length
    if (size > BODY_LIMIT) {
      // 超限后不再缓存；继续把请求读完，客户端才读得到 413 而不是连接被掐断。
      tooLarge = true
      if (size > DRAIN_LIMIT) {
        req.destroy()
        break
      }
      continue
    }
    chunks.push(chunk)
  }
  if (tooLarge) throw new AvatarError('body-too-large', '请求体超过 64KB', 413)
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new AvatarError('invalid_json', '请求体不是合法 JSON', 400)
  }
  if (parsed === null || parsed === undefined) return {}
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AvatarError('invalid_json', '请求体必须是 JSON 对象', 400)
  }
  return parsed
}

/** 预设预览图：只认 /influencer-presets/<hex8+>.webp，支持 Range。 */
async function streamPresetAsset(req, res, url, fail, paths) {
  const raw = url.searchParams.get('path') ?? ''
  if (!PRESET_ASSET_PATH.test(raw)) return fail(404, 'not-found', 'Not found')
  const file = join(paths.presetsDir, raw.slice(PRESET_ASSET_PREFIX.length))

  let info
  try {
    info = await stat(file)
  } catch {
    return fail(404, 'not-found', 'Not found')
  }
  if (!info.isFile()) return fail(404, 'not-found', 'Not found')

  const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
  const start = range ? Number(range[1]) : 0
  const end = range?.[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1
  if (start > end || start >= info.size) {
    res.writeHead(416, { 'Content-Range': `bytes */${info.size}` })
    return res.end()
  }
  res.writeHead(range ? 206 : 200, {
    'Content-Type': 'image/webp',
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=86400',
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {}),
  })
  const stream = createReadStream(file, { start, end })
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}
