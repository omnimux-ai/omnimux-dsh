/**
 * SubmitService: 编排核心（单一实现，agent 工具内联 await、UI 走后台
 * runner + revision 轮询都调这里）。
 *
 * submit 流程（architecture §1.6）：
 * 1. validate（必填 + 账号可用性 + 能力矩阵冲突）
 * 2. 每个媒体 presign 一次 → PUT 上传（已上传过的复用 record.uploads）
 * 3. 逐账号 create（account_ids:[单个]）——失败 try/catch 隔离，不阻塞后续账号
 * 4. create 成功立即落盘 taskId（子任务 → submitted）
 * 5. in-flight Map：同一 record 重复 submit 返回同一 promise（幂等防双发）
 *
 * refresh：对每个有 post_id 的子任务 omnimux_publish_get → statusMap 映射。
 * retry：复用已上传媒体，仅重跑该账号 create → 新 post_id 覆写、回 submitted。
 */
import { PublishError } from './store.js'
import { extractPostId, extractRawStatus } from './hubtools.js'
import { validateForSubmit, validationError } from './validate.js'
import { requirePublishingAccounts } from './accounts.js'
import { ACCOUNT_SOURCE_MESSAGE, PUBLISH_PROVIDER } from './account-policy.js'

const INFLIGHT_TASK_STATUSES = new Set(['submitted', 'reviewing'])
const TERMINAL_TASK_STATUSES = new Set(['published', 'failed'])

/**
 * 组合发布正文：标题 + 描述 + 话题标签（hub create 只有 content 一个文本字段）。
 * @param {{ title?: string, description?: string, topics?: string[] }} record
 */
export function composeContent(record) {
  const lines = []
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  const description = typeof record.description === 'string' ? record.description.trim() : ''
  if (title) lines.push(title)
  if (description && description !== title) lines.push(description)
  const topics = Array.isArray(record.topics) ? record.topics.filter((t) => typeof t === 'string' && t.trim() !== '') : []
  if (topics.length > 0) lines.push(topics.map((t) => `#${t.replace(/^#/, '')}`).join(' '))
  return lines.join('\n')
}

/**
 * @param {{
 *   store: import('./store.js').RecordStore,
 *   media: import('./media.js').MediaStore,
 *   channel: import('./hubtools.js').HubPublishChannel,
 *   accounts: import('./accounts.js').AccountSource,
 *   config: import('./config.js').PublishConfig,
 *   fetcher?: typeof fetch,
 *   now?: () => string,
 * }} deps
 */
export function createSubmitService(deps) {
  const { store, media, channel, accounts, config } = deps
  const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString()
  const timeoutMs = Math.max(1, config.submitTimeoutSeconds) * 1000

  /** record_id → Promise（in-flight 幂等） */
  const inflight = new Map()

  /**
   * 组装执行选项：调用方 signal（agent 透传 / HTTP runner abort）+
   * 单账号超时（submitTimeoutSeconds）。
   * @param {{ agent?: unknown, signal?: AbortSignal }} [opts]
   */
  function execOpts(opts = {}) {
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
    return { ...(opts.agent !== undefined ? { agent: opts.agent } : {}), signal }
  }

  /**
   * 记录的媒体行（media_ids → MediaStore meta）。
   * @param {{ media_ids?: string[] }} record
   */
  function mediaRowsOf(record) {
    const ids = Array.isArray(record.media_ids) ? record.media_ids : []
    return ids.map((id) => {
      const row = media.get(id)
      if (!row) throw new PublishError('media-not-found', `media ${id} not found（草稿引用的媒体已被移出媒体仓）`)
      return { id: String(row.id), kind: String(row.kind) }
    })
  }

  /**
   * 确保所有媒体已上传：record.uploads 已有的复用；缺的 presign → PUT。
   * 返回 { media_id → public_url }（与 record.media_ids 同序的 url 列表由调用方组装）。
   * @param {Record<string, unknown>} record
   * @param {{ agent?: unknown, signal?: AbortSignal }} [opts]
   * @returns {Promise<Record<string, string>>}
   */
  async function ensureUploaded(record, opts = {}) {
    const uploads = { ...(record.uploads || {}) }
    const missing = (record.media_ids || []).filter((id) => !uploads[id])
    for (const mediaId of missing) {
      const { buffer, meta } = media.open(mediaId)
      const { upload_url: uploadUrl, public_url: publicUrl } = await channel.presign(
        { filename: String(meta.filename || 'media'), content_type: String(meta.content_type || 'application/octet-stream') },
        opts,
      )
      await channel.putBytes(uploadUrl, buffer, String(meta.content_type || 'application/octet-stream'), opts)
      uploads[mediaId] = publicUrl
    }
    if (missing.length > 0) store.setUploads(String(record.id), uploads)
    return uploads
  }

  /**
   * 一键发布（幂等：同一 record 重复调用返回同一 promise）。
   * prepare + dispatch 两段连续执行（工具面内联 await 用这个）。
   * @param {string} recordId
   * @param {{ agent?: unknown, signal?: AbortSignal }} [opts]
   */
  function run(recordId, opts = {}) {
    const existing = inflight.get(recordId)
    if (existing) return existing
    const promise = prepareNow(recordId, opts)
      .then(() => dispatchNow(recordId, opts))
      .finally(() => inflight.delete(recordId))
    inflight.set(recordId, promise)
    return promise
  }

  /**
   * 第一段（同步校验 + 物化）：validate（账号可用性 + 能力矩阵）→ 物化
   * per-account 子任务。校验失败在此抛出——HTTP 面用它把 4xx 直接回给
   * 调用方（PRD §5.6 不静默失败），不进后台 runner。
   * @param {string} recordId
   * @param {{ agent?: unknown, signal?: AbortSignal }} [opts]
   */
  async function prepareNow(recordId, opts = {}) {
    const record = store.get(recordId)
    if (!record) throw new PublishError('record-not-found', `record ${recordId} not found`)
    if (record.status !== 'draft') {
      throw new PublishError('record-not-draft', `record ${recordId} 已提交过（只能对 draft 一键发布；失败账号请用 retry）`)
    }

    // 1. 校验（账号可用性 + 能力矩阵）
    const { accounts: accountRows, degraded } = await accounts.list()
    if (degraded === 'needs-omnimux') {
      throw new PublishError('needs-omnimux', 'OmniMux 未登录：发布需要登录态。请先在 OmniMux 登录或设置 OMNIMUX_ACCESS_TOKEN。')
    }
    const mediaRows = mediaRowsOf(record)
    const coverRow = record.cover_media_id ? (media.get(record.cover_media_id) ? { id: String(record.cover_media_id), kind: String(media.get(record.cover_media_id).kind) } : null) : null
    const verdict = validateForSubmit(
      {
        type: String(record.type),
        title: record.title,
        description: record.description,
        mediaRows,
        coverRow,
        account_ids: record.account_ids || [],
      },
      { accounts: accountRows, platforms: config.platforms },
    )
    if (!verdict.ok) throw validationError(verdict.errors)

    const selected = (record.account_ids || [])
      .map((id) => accountRows.find((row) => String(row.id) === String(id)))
      .filter((row) => row != null)

    // 2. 物化 per-account 子任务（初始 submitting；同时清掉历史 record 级错误）
    store.materialize(recordId, selected)
    return store.getView(recordId)
  }

  /**
   * 第二段（后台执行）：presign + 上传 + 逐账号 create。失败按子任务隔离
   * 落账本；整段意外拒绝由 HTTP 面的 runner catch 写 record.error。
   * @param {string} recordId
   * @param {{ agent?: unknown, signal?: AbortSignal }} [opts]
   */
  async function dispatchNow(recordId, opts = {}) {
    const record = store.get(recordId)
    if (!record) throw new PublishError('record-not-found', `record ${recordId} not found`)
    const tasks = Array.isArray(record.subtasks) ? record.subtasks : []

    if (tasks.length === 0 || tasks.some((task) => task.provider !== PUBLISH_PROVIDER)) {
      throw new PublishError('post-provider-mismatch', ACCOUNT_SOURCE_MESSAGE)
    }
    await requirePublishingAccounts(accounts, tasks.map((task) => task.account_id))

    // 3. presign + 上传（每媒体一次；上传失败 → 全部子任务 failed，可 retry）
    let uploads
    try {
      uploads = await ensureUploaded(record, opts)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      for (const task of tasks) {
        store.updateTask(task.id, { status: 'failed', error: `media upload failed: ${message}`, settled_at: now() })
      }
      return store.getView(recordId)
    }

    // 4. 逐账号 create（隔离：单账号失败不阻塞）
    const content = composeContent(record)
    const mediaItems = (record.media_ids || []).map((mediaId) => ({ url: uploads[mediaId] }))
    for (const task of tasks) {
      const perTask = execOpts(opts)
      try {
        const data = await channel.createPost(
          { account_ids: [task.account_id], content, media_items: mediaItems },
          perTask,
        )
        // 5. taskId 即落盘
        const postId = extractPostId(data, 'omnimux_publish_create')
        store.updateTask(task.id, { status: 'submitted', post_id: postId, error: null, submitted_at: now() })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          store.updateTask(task.id, { status: 'failed', error: 'aborted', settled_at: now() })
          continue
        }
        const message = error instanceof Error ? error.message : String(error)
        store.updateTask(task.id, { status: 'failed', error: message, settled_at: now() })
      }
    }
    return store.getView(recordId)
  }

  /**
   * HTTP 面第一段：同步校验 + 物化。错误直接抛给调用方（路由转 4xx JSON），
   * 不进后台 runner——校验失败时账本零变化，绝不能让 UI 轮询空转到超时。
   * @param {string} recordId
   * @param {{ agent?: unknown, signal?: AbortSignal }} [opts]
   */
  function prepare(recordId, opts = {}) {
    return prepareNow(recordId, opts)
  }

  /**
   * HTTP 面第二段：后台 create 循环（in-flight 幂等）。整段意外拒绝由
   * 路由的 runner catch 写 record.error（revision bump，轮询可见）。
   * @param {string} recordId
   * @param {{ agent?: unknown, signal?: AbortSignal }} [opts]
   */
  function dispatch(recordId, opts = {}) {
    const existing = inflight.get(recordId)
    if (existing) return existing
    const promise = dispatchNow(recordId, opts).finally(() => inflight.delete(recordId))
    inflight.set(recordId, promise)
    return promise
  }

  /**
   * 状态同步：对每个有 post_id 且未终态的子任务拉平台状态并映射。
   * needs-omnimux/needs-hub 直接抛（调用方给出明确指引）；
   * 单任务 get 失败 → 记入 sync_errors，不阻塞其他任务。
   * @param {string} recordId
   * @param {{ agent?: unknown, signal?: AbortSignal }} [opts]
   */
  async function refresh(recordId, opts = {}) {
    const record = store.get(recordId)
    if (!record) throw new PublishError('record-not-found', `record ${recordId} not found`)
    /** @type {Array<{ task_id: string, error: string }>} */
    const syncErrors = []
    const tasks = Array.isArray(record.subtasks) ? record.subtasks : []
    for (const task of tasks) {
      if (!task.post_id || !INFLIGHT_TASK_STATUSES.has(task.status)) continue
      try {
        if (task.provider !== PUBLISH_PROVIDER) throw new PublishError('post-provider-mismatch', ACCOUNT_SOURCE_MESSAGE)
        await requirePublishingAccounts(accounts, [task.account_id])
        const data = await channel.getPost(task.post_id, opts)
        const raw = extractRawStatus(data)
        if (raw == null) {
          syncErrors.push({ task_id: task.id, error: `get response missing status: ${JSON.stringify(data).slice(0, 200)}` })
          continue
        }
        const mapped = config.statusMap[String(raw).toLowerCase()]
        const patch = { raw_status: raw }
        if (mapped && mapped !== task.status) {
          patch.status = mapped
          if (TERMINAL_TASK_STATUSES.has(mapped)) patch.settled_at = now()
        }
        store.updateTask(task.id, patch)
      } catch (error) {
        if (error instanceof PublishError && (error.code === 'needs-omnimux' || error.code === 'needs-hub')) throw error
        syncErrors.push({ task_id: task.id, error: error instanceof Error ? error.message : String(error) })
      }
    }
    return { record: store.getView(recordId), sync_errors: syncErrors }
  }

  /**
   * 单账号重试：复用已上传媒体（uploads 缺失时重新 presign+PUT），
   * 仅重跑该账号 create → 新 post_id 覆写、回 submitted、attempts+1。
   * @param {string} taskId
   * @param {{ agent?: unknown, signal?: AbortSignal }} [opts]
   */
  async function retryTask(taskId, opts = {}) {
    const { record: rawRecord, task: rawTask } = store.findTaskAnywhere(taskId)
    if (rawTask.status !== 'failed') {
      throw new PublishError('task-not-retryable', `task ${taskId} 状态为 ${rawTask.status}，只有 failed 子任务可以重试`)
    }
    if (rawTask.provider !== PUBLISH_PROVIDER) throw new PublishError('post-provider-mismatch', ACCOUNT_SOURCE_MESSAGE)
    await requirePublishingAccounts(accounts, [rawTask.account_id])
    // 标记进入 submitting（中断恢复可识别）
    store.updateTask(taskId, { status: 'submitting', error: null, settled_at: null, attempts: (rawTask.attempts || 0) + 1 })

    let uploads
    try {
      uploads = await ensureUploaded(rawRecord, opts)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      store.updateTask(taskId, { status: 'failed', error: `media upload failed: ${message}`, settled_at: now() })
      throw new PublishError('upload-failed', `retry of ${taskId} failed during media upload: ${message}`)
    }

    const content = composeContent(rawRecord)
    const mediaItems = (rawRecord.media_ids || []).map((mediaId) => ({ url: uploads[mediaId] }))
    try {
      const data = await channel.createPost(
        { account_ids: [rawTask.account_id], content, media_items: mediaItems },
        execOpts(opts),
      )
      const postId = extractPostId(data, 'omnimux_publish_create')
      const task = store.updateTask(taskId, { status: 'submitted', post_id: postId, error: null, submitted_at: now(), raw_status: null })
      return { record: store.getView(String(rawRecord.id)), task }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        store.updateTask(taskId, { status: 'failed', error: 'aborted', settled_at: now() })
        throw new PublishError('aborted', `retry of ${taskId} aborted`)
      }
      const message = error instanceof Error ? error.message : String(error)
      store.updateTask(taskId, { status: 'failed', error: message, settled_at: now() })
      throw error instanceof PublishError ? error : new PublishError('hub-tool-error', message)
    }
  }

  /**
   * 卸载清理：中止 in-flight runner 并把 submitting 子任务标 interrupted
   * （同进程语义；跨进程崩溃由加载时 recover() 兜底）。
   */
  function dispose(reason = 'plugin unloaded') {
    for (const recordId of [...inflight.keys()]) {
      const record = store.get(recordId)
      for (const task of (record?.subtasks) || []) {
        if (task.status === 'submitting') {
          store.updateTask(task.id, { status: 'failed', error: `interrupted: ${reason}`, settled_at: now() })
        }
      }
    }
    inflight.clear()
  }

  return { run, prepare, dispatch, refresh, retryTask, dispose, inflight }
}
