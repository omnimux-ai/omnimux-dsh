/**
 * http-routes.js: PublishDispatcher（工具面与 HTTP 面共用的单一入口，
 * 同源约束）+ `/omnimux/publish`（主路由）与 `/dsh-publish`（兼容过渡别名）前缀路由注册。
 *
 * 自实现（等价复刻，无 hub import）：
 * - sendJson secret-emission guard（hub auth/http-routes.js 同义）
 * - assertLocalWrite loopback 写校验（hub apps/origin.js 同义）
 */
import { PublishError } from './store.js'
import { parseDraftPayload, validateContent, validateForSubmit } from './validate.js'

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

const STATUS_BY_CODE = {
  'invalid-arguments': 400,
  'validation-failed': 400,
  'confirm-required': 400,
  'invalid-json': 400,
  'record-not-found': 404,
  'task-not-found': 404,
  'media-not-found': 404,
  'path-not-found': 400,
  'media-too-large': 413,
  'record-not-draft': 409,
  'task-not-retryable': 409,
  'not-local': 403,
  'needs-hub': 503,
  'needs-omnimux': 503,
  'quota-exceeded': 402,
  'hub-tool-error': 502,
  'upload-failed': 502,
  'aborted': 500,
}

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
 * Parse a request body as JSON. Empty body = {}. Bad JSON = null.
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
 * Read the raw request body (media byte upload).
 * @param {import('node:http').IncomingMessage} req
 */
export async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

/** POST routes only accept same-machine browser calls. */
export function assertLocalWrite(headers = {}) {
  const site = String(headers.secFetchSite ?? headers['sec-fetch-site'] ?? '').toLowerCase()
  if (site === 'cross-site') throw new Error('cross-origin write refused')
  const origin = headers.origin || originFromReferer(headers.referer)
  if (!origin) return
  let host
  try {
    host = new URL(origin).hostname
  } catch {
    throw new Error('cross-origin write refused')
  }
  if (!LOCAL_HOSTS.has(host)) throw new Error('cross-origin write refused')
}

/**
 * @param {string | undefined} referer
 */
function originFromReferer(referer) {
  if (!referer) return ''
  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

/**
 * @param {{ headers?: Record<string, string | string[] | undefined> } | undefined} req
 * @param {string} name
 */
function header(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

/**
 * @param {unknown} error
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * PublishDispatcher: 工具 execute 与 HTTP 路由都调这里的同一组方法
 * （数据层单一真源 / 同源约束）。纯领域入口，不感知 HTTP。
 * @param {{
 *   store: import('./store.js').RecordStore,
 *   media: import('./media.js').MediaStore,
 *   accounts: import('./accounts.js').AccountSource,
 *   service: import('./submit.js').SubmitService,
 *   config: import('./config.js').PublishConfig,
 * }} deps
 */
export function createPublishDispatcher(deps) {
  const { store, media, accounts, service, config } = deps

  /**
   * 媒体引用解析：path → 入库一次；media_id → 已入库引用。
   * @param {{ path?: string, media_id?: string }} ref
   */
  function resolveMediaRef(ref) {
    if (ref.media_id) {
      const row = media.get(ref.media_id)
      if (!row) throw new PublishError('media-not-found', `media_id ${ref.media_id} 不在媒体仓中`)
      return String(row.id)
    }
    const { media: row } = media.importPath(ref.path)
    return String(row.id)
  }

  /**
   * @param {{ type: string, payload?: unknown, account_ids?: string[] }} input
   */
  function createDraft(input) {
    const parsed = parseDraftPayload(input.payload)
    const type = input.type ?? parsed.type
    if (!type) throw new PublishError('invalid-arguments', 'type is required (video | image)')
    const mediaIds = (parsed.media || []).map((ref) => resolveMediaRef(ref))
    const coverMediaId = parsed.cover ? resolveMediaRef(parsed.cover) : null
    const record = store.create({
      type,
      title: typeof parsed.title === 'string' ? parsed.title : '',
      description: typeof parsed.description === 'string' ? parsed.description : '',
      topics: parsed.topics,
      media_ids: mediaIds,
      cover_media_id: coverMediaId,
      settings: parsed.settings,
      account_ids: input.account_ids || parsed.account_ids || [],
    })
    return draftResult(record.id)
  }

  /**
   * 草稿结果：视图 + 媒体行（kind/filename，浏览器侧完整恢复与缩略图用）+
   * 内容校验错误（草稿阶段不拦截，submit 前才硬拦截；但把同一份校验结果
   * 提前暴露给调用方，UI 行内错误/agent 提示同源）。
   * @param {string} id
   */
  function draftResult(id) {
    const view = store.getView(id)
    const mediaRows = (view.media_ids || []).map((mediaId) => {
      const row = media.get(mediaId)
      return row
        ? { id: String(row.id), kind: String(row.kind), filename: String(row.filename), content_type: String(row.content_type) }
        : { id: mediaId, kind: 'other', filename: '', content_type: '' }
    })
    const coverRow = view.cover_media_id && media.get(view.cover_media_id)
      ? { id: String(view.cover_media_id), kind: String(media.get(view.cover_media_id).kind) }
      : null
    const contentErrors = validateContent({
      type: String(view.type),
      title: view.title,
      description: view.description,
      mediaRows,
      coverRow,
    })
    return { record: view, media: mediaRows, content_errors: contentErrors }
  }

  /**
   * @param {{ draft_id: string, patch?: unknown }} input
   */
  async function updateDraft(input) {
    const parsed = parseDraftPayload(input.patch)
    /** @type {Record<string, unknown>} */
    const patch = {}
    if ('type' in parsed && parsed.type !== undefined) patch.type = parsed.type
    if ('title' in parsed && parsed.title !== undefined) patch.title = parsed.title
    if ('description' in parsed && parsed.description !== undefined) patch.description = parsed.description
    if ('topics' in parsed && parsed.topics !== undefined) patch.topics = parsed.topics
    if (parsed.media !== undefined) patch.media_ids = (parsed.media || []).map((ref) => resolveMediaRef(ref))
    if (parsed.cover !== undefined) patch.cover_media_id = parsed.cover ? resolveMediaRef(parsed.cover) : null
    if ('settings' in parsed && parsed.settings !== undefined) patch.settings = parsed.settings
    const accountIdPatch = parsed.account_ids
    store.update(String(input.draft_id || ''), patch)
    // account_ids 走与工具面 publish_assign_accounts 同一条校验路径（同源约束）
    if (accountIdPatch !== undefined) {
      if (Array.isArray(accountIdPatch) && accountIdPatch.length > 0) {
        await assignAccounts({ draft_id: input.draft_id, account_ids: accountIdPatch })
      } else {
        store.update(String(input.draft_id || ''), { account_ids: [] })
      }
    }
    return draftResult(String(input.draft_id))
  }

  /**
   * 删除草稿：confirm !== true → confirm-required，不静默删。
   * @param {{ draft_id: string, confirm?: boolean }} input
   */
  function deleteDraft(input) {
    if (input.confirm !== true) {
      throw new PublishError('confirm-required', '删除草稿需要显式 confirm:true（防误删；草稿删除不可恢复）')
    }
    return store.remove(String(input.draft_id || ''))
  }

  /**
   * @param {{ platform?: string }} [input]
   */
  async function listAccounts(input = {}) {
    const result = await accounts.list({ platform: input.platform })
    return {
      ...result,
      hint: result.degraded
        ? result.message
        : 'account 可用性判定：status ∈ {active, expiring} 且 agent_usable !== false',
    }
  }

  /**
   * 挂账号：存在性 + 可用性 + 能力冲突（与 submit 同一份校验）。
   * @param {{ draft_id: string, account_ids: string[] }} input
   */
  async function assignAccounts(input) {
    if (!Array.isArray(input.account_ids) || input.account_ids.length === 0) {
      throw new PublishError('invalid-arguments', 'account_ids 必须是非空数组')
    }
    const record = store.get(String(input.draft_id || ''))
    if (!record) throw new PublishError('record-not-found', `record ${input.draft_id} not found`)
    const { accounts: rows, degraded } = await accounts.list()
    if (degraded === 'needs-omnimux') {
      throw new PublishError('needs-omnimux', 'OmniMux 未登录：挂账号前需要读取账号列表。请先在 OmniMux 登录或设置 OMNIMUX_ACCESS_TOKEN。')
    }
    const mediaRows = (record.media_ids || []).map((mediaId) => {
      const row = media.get(mediaId)
      return row ? { id: String(row.id), kind: String(row.kind) } : { id: mediaId, kind: 'other' }
    })
    const coverRow = record.cover_media_id && media.get(record.cover_media_id)
      ? { id: String(record.cover_media_id), kind: String(media.get(record.cover_media_id).kind) }
      : null
    const verdict = validateForSubmit(
      {
        type: String(record.type),
        title: record.title,
        description: record.description,
        mediaRows,
        coverRow,
        account_ids: input.account_ids,
      },
      { accounts: rows, platforms: config.platforms },
    )
    if (!verdict.ok) throw new PublishError('validation-failed', { message: '账号挂载校验未通过', errors: verdict.errors })
    const view = store.assignAccounts(String(input.draft_id), input.account_ids)
    return { record: view }
  }

  /**
   * 一键发布（工具面内联 await；HTTP 面由路由决定是否后台化——同一函数）。
   * @param {{ record_id: string, agent?: unknown, signal?: AbortSignal }} input
   */
  function submit(input) {
    return service.run(String(input.record_id || ''), { agent: input.agent, signal: input.signal })
  }

  /**
   * HTTP 面第一段：同步校验 + 物化（失败直接抛 → 路由回 4xx JSON，
   * UI 行内错误链路可达；不静默失败）。
   * @param {{ record_id: string, agent?: unknown, signal?: AbortSignal }} input
   */
  function submitPrepare(input) {
    return service.prepare(String(input.record_id || ''), { agent: input.agent, signal: input.signal })
  }

  /**
   * HTTP 面第二段：后台 create 循环。
   * @param {{ record_id: string, agent?: unknown, signal?: AbortSignal }} input
   */
  function submitDispatch(input) {
    return service.dispatch(String(input.record_id || ''), { agent: input.agent, signal: input.signal })
  }

  /**
   * record 级错误落账本（后台 runner 整段意外失败的兜底，轮询可见）。
   * @param {string} recordId
   * @param {string} message
   */
  function setRecordError(recordId, message) {
    return store.setRecordError(String(recordId || ''), message)
  }

  /**
   * 媒体字节读出（缩略图内容路由用；路由作用域里没有 media 闭包变量，
   * 必须经 dispatcher——R1 的教训）。
   * @param {string} id
   */
  function openMedia(id) {
    return media.open(String(id || ''))
  }

  /**
   * @param {{ record_id: string, refresh?: boolean, agent?: unknown, signal?: AbortSignal }} input
   */
  async function getRecord(input) {
    const id = String(input.record_id || '')
    if (input.refresh === false) {
      const view = store.getView(id)
      if (!view) throw new PublishError('record-not-found', `record ${id} not found`)
      if (view.status === 'draft') return draftResult(id)
      return { record: view }
    }
    const result = await service.refresh(id, { agent: input.agent, signal: input.signal })
    return result
  }

  /**
   * @param {{ task_id: string, agent?: unknown, signal?: AbortSignal }} input
   */
  function retryTask(input) {
    return service.retryTask(String(input.task_id || ''), { agent: input.agent, signal: input.signal })
  }

  /** @param {{ status_filter?: string, type?: string, page?: number }} [input] */
  function listRecords(input = {}) {
    return store.listViews({
      status_filter: input.status_filter || 'all',
      type: input.type || '',
      page: input.page,
    })
  }

  function capabilities() {
    return { platforms: config.platforms, statusMap: config.statusMap }
  }

  /**
   * 媒体字节入库（UI 上传 / 工具面 path 导入共用 MediaStore）。
   * @param {Buffer} buffer
   * @param {{ filename?: string, content_type?: string }} meta
   */
  function importMedia(buffer, meta) {
    return media.importBuffer(buffer, meta)
  }

  /**
   * 修订号便宜轮询（同 assets state 模式）。
   * @param {number | NaN} rev
   */
  function state(rev) {
    const current = store.revision()
    if (Number.isFinite(rev) && rev === current) {
      return { rev: current, unchanged: true }
    }
    return { rev: current, unchanged: false, counts: tabCounts() }
  }

  /** 五个 tab 的计数（UI 徽标数据源，与列表过滤同一谓词）。 */
  function tabCounts() {
    const views = store.listViews({ status_filter: 'all' })
    const records = views.records
    return {
      total: views.total,
      draft: records.filter((r) => r.status === 'draft').length,
      submitted: records.filter((r) => r.submitted_at != null).length,
      reviewing: records.filter((r) => (r.subtask_summary?.reviewing || 0) > 0).length,
      published: records.filter((r) => r.submitted_at != null && (r.subtask_summary?.total || 0) > 0 && r.subtask_summary?.published === r.subtask_summary?.total).length,
      failed: records.filter((r) => r.submitted_at != null && (r.subtask_summary?.failed || 0) > 0).length,
    }
  }

  return {
    createDraft,
    updateDraft,
    deleteDraft,
    listAccounts,
    assignAccounts,
    submit,
    submitPrepare,
    submitDispatch,
    setRecordError,
    openMedia,
    getRecord,
    retryTask,
    listRecords,
    capabilities,
    importMedia,
    importPath: (path) => media.importPath(path),
    state,
    tabCounts,
  }
}

/**
 * Strip prefix for either `/omnimux/publish` (main) or `/dsh-publish` (legacy alias).
 * @param {string} pathname
 */
function extractSubPath(pathname) {
  if (pathname.startsWith('/omnimux/publish')) {
    return pathname.slice('/omnimux/publish'.length) || '/'
  }
  if (pathname.startsWith('/dsh-publish')) {
    return pathname.slice('/dsh-publish'.length) || '/'
  }
  return pathname
}

/**
 * Mount both `/omnimux/publish` (primary) and `/dsh-publish` (legacy transition)
 * prefixes on the official webServer seat.
 * @param {{ register: (route: { kind: string, path: string, handler: Function }) => () => void }} webServer
 * @param {ReturnType<typeof createPublishDispatcher>} dispatcher
 * @returns {() => void} disposer
 */
export function registerPublishRoutes(webServer, dispatcher) {
  const handler = async (req, res) => {
    try {
      const method = (req.method || 'GET').toUpperCase()
      const url = new URL(req.url || '/omnimux/publish/state', 'http://127.0.0.1')
      const subPath = extractSubPath(url.pathname)

      if (method === 'POST') {
        try {
          assertLocalWrite({
            origin: header(req, 'origin'),
            referer: header(req, 'referer'),
            secFetchSite: header(req, 'sec-fetch-site'),
          })
        } catch {
          sendJson(res, 403, { error: 'not-local', message: 'cross-origin write refused' })
          return
        }
      }

      // ---- GET 面（无写副作用）----
      if (method === 'GET' && subPath === '/state') {
        const revRaw = url.searchParams.get('rev')
        const rev = revRaw == null || revRaw === '' ? NaN : Number(revRaw)
        sendJson(res, 200, dispatcher.state(rev))
        return
      }
      if (method === 'GET' && subPath === '/records') {
        sendJson(res, 200, dispatcher.listRecords({
          status_filter: url.searchParams.get('status') || 'all',
          type: url.searchParams.get('type') || '',
          page: Number(url.searchParams.get('page')) || 1,
        }))
        return
      }
      if (method === 'GET' && subPath === '/records/detail') {
        const id = url.searchParams.get('id') || ''
        const result = await dispatcher.getRecord({ record_id: id, refresh: false })
        sendJson(res, 200, result)
        return
      }
      if (method === 'GET' && subPath === '/capabilities') {
        sendJson(res, 200, dispatcher.capabilities())
        return
      }
      if (method === 'GET' && subPath === '/media/content') {
        // 素材卡片缩略图（PRD M1）——只读字节流，无写副作用（GET 面纪律不变）
        const id = url.searchParams.get('id') || ''
        try {
          const { buffer, meta } = dispatcher.openMedia(id)
          res.writeHead(200, {
            'Content-Type': String(meta.content_type || 'application/octet-stream'),
            'Content-Length': String(buffer.length),
            'Cache-Control': 'private, max-age=86400',
          })
          res.end(buffer)
        } catch (error) {
          if (error instanceof PublishError) {
            sendJson(res, STATUS_BY_CODE[error.code] ?? 404, { error: error.code, message: error.message })
          } else {
            sendJson(res, 500, { error: 'internal', message: messageOf(error) })
          }
        }
        return
      }

      // ---- POST 面（assertLocalWrite 已过）----
      if (method === 'POST' && subPath === '/media') {
        // 媒体字节流式上传：raw body → sha256 入库
        const buffer = await readRawBody(req)
        const result = dispatcher.importMedia(buffer, {
          filename: url.searchParams.get('filename') || undefined,
          content_type: header(req, 'content-type') || undefined,
        })
        sendJson(res, 200, result)
        return
      }

      const body = await readJsonBody(req)
      if (body === null) {
        sendJson(res, 400, { error: 'invalid-json', message: 'request body is not valid JSON' })
        return
      }
      if (typeof body !== 'object' || Array.isArray(body)) {
        sendJson(res, 400, { error: 'invalid-json', message: 'request body must be a JSON object' })
        return
      }
      const json = /** @type {Record<string, unknown>} */ (body)

      if (method === 'POST' && subPath === '/drafts') {
        sendJson(res, 200, await dispatcher.createDraft({
          type: json.type,
          payload: json.payload,
          account_ids: Array.isArray(json.account_ids) ? json.account_ids : undefined,
        }))
        return
      }
      if (method === 'POST' && subPath === '/drafts/update') {
        sendJson(res, 200, await dispatcher.updateDraft({ draft_id: String(json.draft_id || json.id || ''), patch: json.patch }))
        return
      }
      if (method === 'POST' && subPath === '/drafts/delete') {
        sendJson(res, 200, dispatcher.deleteDraft({ draft_id: String(json.draft_id || json.id || ''), confirm: json.confirm === true }))
        return
      }
      if (method === 'POST' && subPath === '/records/submit') {
        // R2：同步校验前置——validate + 物化阶段失败直接回 4xx JSON
        // （Composer 的行内错误链路直接吃），绝不进后台 runner。
        const recordId = String(json.record_id || json.id || '')
        await dispatcher.submitPrepare({ record_id: recordId })
        // 后台 create 循环：立即返回，UI 走 state?rev= 轮询。
        // 整段意外拒绝落 record.error（revision bump，轮询可见）——不静默。
        dispatcher.submitDispatch({ record_id: recordId }).catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          try {
            dispatcher.setRecordError(recordId, `submit runner failed: ${message}`)
          } catch {
            // 记录已被删除等极端场景：错误只能进 Host 日志
            console.error('[omnimux-publish] submit runner failed without a ledger row:', message)
          }
        })
        sendJson(res, 200, { started: true, record_id: recordId })
        return
      }
      if (method === 'POST' && subPath === '/records/refresh') {
        sendJson(res, 200, await dispatcher.getRecord({
          record_id: String(json.record_id || json.id || ''),
          refresh: true,
        }))
        return
      }
      if (method === 'POST' && subPath === '/tasks/retry') {
        sendJson(res, 200, await dispatcher.retryTask({ task_id: String(json.task_id || json.id || '') }))
        return
      }

      sendJson(res, 404, { error: 'not-found', message: 'unknown route' })
    } catch (error) {
      if (error instanceof PublishError) {
        sendJson(res, STATUS_BY_CODE[error.code] ?? 500, {
          error: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        })
        return
      }
      sendJson(res, 500, { error: 'internal', message: messageOf(error) })
    }
  }

  const disposePrimary = webServer.register({
    kind: 'prefix',
    path: '/omnimux/publish',
    handler,
  })
  const disposeLegacy = webServer.register({
    kind: 'prefix',
    path: '/dsh-publish',
    handler,
  })

  return () => {
    disposePrimary?.()
    disposeLegacy?.()
  }
}
