/**
 * RecordStore: the single publishing ledger (`records.json`).
 *
 * 三类记录是状态机视图不是三份数据（PRD §2.2①）：draft 就是一条
 * `status:'draft'` 的 record，submit 原地转 `submitted` 并物化 `subtasks[]`。
 *
 * 持久化纪律（同 omnimux-assets）：目录 0700 / JSON 0600 / tmp+rename 原子写，
 * 每次写 bump revision。加载时发现 `submitting` 子任务无 in-flight runner
 * → 标 failed('interrupted')（中断恢复）。
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Typed error carrying a wire error code (see http-routes.js STATUS_BY_CODE). */
export class PublishError extends Error {
  /**
   * @param {string} code
   * @param {string | Record<string, unknown>} message message or structured payload
   */
  constructor(code, message) {
    super(typeof message === 'string' ? message : JSON.stringify(message))
    this.name = 'PublishError'
    this.code = code
    if (typeof message !== 'string') this.details = message
  }
}

const DEFAULT_FS = { mkdirSync, readFileSync, renameSync, writeFileSync }

export const RECORD_TYPES = Object.freeze(['video', 'image'])
export const TASK_STATUSES = Object.freeze(['submitting', 'submitted', 'reviewing', 'published', 'failed'])
const SETTLED = new Set(['published', 'failed'])

/**
 * Derive a short record id, e.g. `rec_a1b2c3d4` / `tsk_a1b2c3d4`.
 * @param {'rec' | 'tsk'} prefix
 */
export function newId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 8)}`
}

/**
 * @param {typeof DEFAULT_FS} fs
 * @param {string} file
 * @param {string} text
 */
function atomicWrite(fs, file, text) {
  fs.mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, text, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

/**
 * @param {unknown} value
 * @param {string[]} allowed
 * @param {string} where
 */
function pickEnum(value, allowed, where) {
  if (typeof value === 'string' && allowed.includes(value)) return value
  throw new PublishError('invalid-arguments', `${where} must be one of ${allowed.join(' | ')}`)
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function stringArray(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
}

/**
 * 记录聚合状态（PRD §5.2）：任一 in-flight → publishing；全部 published → published；
 * 部分 failed → partial_failed / 全 failed → failed；draft 即 draft。
 * @param {{ status: string, subtasks?: Array<{ status: string }> }} record
 * @returns {'draft' | 'publishing' | 'partial_failed' | 'failed' | 'published'}
 */
export function aggregateStatus(record) {
  if (record.status === 'draft') return 'draft'
  const tasks = Array.isArray(record.subtasks) ? record.subtasks : []
  if (tasks.length === 0) return 'publishing'
  const published = tasks.filter((t) => t.status === 'published').length
  const failed = tasks.filter((t) => t.status === 'failed').length
  const inflight = tasks.length - published - failed
  if (inflight > 0) return 'publishing'
  if (failed === 0) return 'published'
  if (published === 0) return 'failed'
  return 'partial_failed'
}

/**
 * 三 tab / status_filter 的过滤谓词（列表页与 publish_list_records 同源）。
 * - draft：草稿箱
 * - submitted：发布记录 tab（一切已 submit 的记录）
 * - reviewing：存在 reviewing 子任务（待审核 tab，发布记录的过滤视图）
 * - published：全部子任务 published
 * - failed：存在 failed 子任务
 * @param {{ status: string, subtasks?: Array<{ status: string }>, submitted_at?: string | null }} record
 * @param {string} filter
 */
export function matchesStatusFilter(record, filter) {
  if (filter === 'all') return true
  if (filter === 'draft') return record.status === 'draft'
  const tasks = Array.isArray(record.subtasks) ? record.subtasks : []
  const submitted = record.submitted_at != null
  if (filter === 'submitted') return submitted
  if (filter === 'reviewing') return submitted && tasks.some((t) => t.status === 'reviewing')
  if (filter === 'published') return submitted && tasks.length > 0 && tasks.every((t) => t.status === 'published')
  if (filter === 'failed') return submitted && tasks.some((t) => t.status === 'failed')
  return true
}

/**
 * @param {{ paths?: { recordsFile: string }, fs?: Partial<typeof DEFAULT_FS>, now?: () => string }} [opts]
 */
export function createRecordStore(opts = {}) {
  const fs = { ...DEFAULT_FS, ...(opts.fs ?? {}) }
  const paths = opts.paths ?? {}
  const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString()

  /** 损坏/缺失的账本回落空文档（不是坏配置，是数据文件；与 assets 惯例一致）。 */
  function loadState() {
    try {
      const raw = JSON.parse(fs.readFileSync(paths.recordsFile, 'utf8'))
      if (raw && typeof raw === 'object' && Array.isArray(raw.records)) {
        const records = raw.records.filter(
          (row) => row && typeof row === 'object' && typeof row.id === 'string' && typeof row.type === 'string',
        )
        return { schema: 1, revision: Number(raw.revision) || 0, records }
      }
    } catch {
      // fall through to empty ledger
    }
    return { schema: 1, revision: 0, records: [] }
  }

  let state = loadState()

  function persist() {
    atomicWrite(fs, paths.recordsFile, `${JSON.stringify(state, null, 2)}\n`)
  }

  /**
   * 中断恢复：`submitting` 子任务意味着 Host 在 create 调用中途死过。
   * 落 failed('interrupted')，可 retry。
   */
  function recover() {
    let touched = false
    for (const record of state.records) {
      for (const task of record.subtasks || []) {
        if (task.status === 'submitting') {
          task.status = 'failed'
          task.error = 'interrupted'
          task.settled_at = now()
          touched = true
        }
      }
    }
    if (touched) persist()
    return touched
  }

  /**
   * @param {string} id
   */
  function get(id) {
    const found = state.records.find((record) => record.id === id)
    return found ? JSON.parse(JSON.stringify(found)) : null
  }

  /**
   * 列表视图：聚合状态 + 子任务计数摘要，按 updated_at 倒序分页。
   * @param {{ status_filter?: string, type?: string, page?: number }} [query]
   */
  function listViews(query = {}) {
    const filter = query.status_filter || 'all'
    const type = query.type || ''
    const pageSize = 50
    const page = Math.max(1, Number(query.page) || 1)
    const rows = state.records
      .filter((record) => matchesStatusFilter(record, filter))
      .filter((record) => (type ? record.type === type : true))
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
    const total = rows.length
    const slice = rows.slice((page - 1) * pageSize, page * pageSize)
    return {
      page,
      page_size: pageSize,
      total,
      records: slice.map((record) => viewOf(record)),
    }
  }

  /**
   * @param {Record<string, unknown>} record
   */
  function viewOf(record) {
    const tasks = Array.isArray(record.subtasks) ? record.subtasks : []
    const summary = {
      total: tasks.length,
      submitted: tasks.filter((t) => t.status === 'submitted' || t.status === 'submitting').length,
      reviewing: tasks.filter((t) => t.status === 'reviewing').length,
      published: tasks.filter((t) => t.status === 'published').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
    }
    return { ...JSON.parse(JSON.stringify(record)), aggregate: aggregateStatus(record), subtask_summary: summary }
  }

  /**
   * @param {string} id
   */
  function getView(id) {
    const found = state.records.find((record) => record.id === id)
    return found ? viewOf(found) : null
  }

  function findRecord(id) {
    const found = state.records.find((record) => record.id === id)
    if (!found) throw new PublishError('record-not-found', `record ${id} not found`)
    return found
  }

  /**
   * 新建草稿。media 已在 MediaStore 入库，这里只收 media_ids。
   * @param {{ type: string, title?: string, description?: string, topics?: unknown, media_ids?: string[], cover_media_id?: string | null, settings?: Record<string, unknown>, account_ids?: string[] }} input
   */
  function create(input) {
    const type = pickEnum(input.type, RECORD_TYPES, 'type')
    const record = {
      id: newId('rec'),
      type,
      status: 'draft',
      title: typeof input.title === 'string' ? input.title.trim() : '',
      description: typeof input.description === 'string' ? input.description : '',
      topics: stringArray(input.topics),
      media_ids: Array.isArray(input.media_ids) ? input.media_ids.filter((v) => typeof v === 'string') : [],
      cover_media_id: typeof input.cover_media_id === 'string' && input.cover_media_id ? input.cover_media_id : null,
      settings: input.settings && typeof input.settings === 'object' && !Array.isArray(input.settings) ? { ...input.settings } : {},
      account_ids: stringArray(input.account_ids),
      uploads: {},
      error: null,
      subtasks: [],
      created_at: now(),
      updated_at: now(),
      submitted_at: null,
    }
    state.records.push(record)
    state.revision += 1
    persist()
    return viewOf(record)
  }

  /**
   * 更新草稿（仅 draft 可编辑；submitted 记录只能 refresh / retry 子任务）。
   * @param {string} id
   * @param {Record<string, unknown>} patch
   */
  function update(id, patch) {
    const record = findRecord(id)
    if (record.status !== 'draft') {
      throw new PublishError('record-not-draft', `record ${id} is already submitted; only drafts are editable`)
    }
    const source = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}
    if ('type' in source) record.type = pickEnum(source.type, RECORD_TYPES, 'patch.type')
    if ('title' in source && source.title !== undefined) record.title = typeof source.title === 'string' ? source.title.trim() : record.title
    if ('description' in source && source.description !== undefined) record.description = typeof source.description === 'string' ? source.description : record.description
    if ('topics' in source && source.topics !== undefined) record.topics = stringArray(source.topics)
    if ('media_ids' in source && source.media_ids !== undefined) {
      record.media_ids = Array.isArray(source.media_ids) ? source.media_ids.filter((v) => typeof v === 'string') : record.media_ids
    }
    if ('cover_media_id' in source) {
      record.cover_media_id = typeof source.cover_media_id === 'string' && source.cover_media_id ? source.cover_media_id : null
    }
    if ('settings' in source && source.settings !== undefined && source.settings !== null && typeof source.settings === 'object' && !Array.isArray(source.settings)) {
      record.settings = { ...source.settings }
    }
    if ('account_ids' in source && source.account_ids !== undefined) record.account_ids = stringArray(source.account_ids)
    record.updated_at = now()
    state.revision += 1
    persist()
    return viewOf(record)
  }

  /**
   * 删除草稿（仅 draft）。
   * @param {string} id
   */
  function remove(id) {
    const record = findRecord(id)
    if (record.status !== 'draft') {
      throw new PublishError('record-not-draft', `record ${id} is already submitted; submitted records are kept as the ledger`)
    }
    const index = state.records.indexOf(record)
    state.records.splice(index, 1)
    state.revision += 1
    persist()
    return { id, deleted: true }
  }

  /**
   * 挂账号到草稿（存在性/可用性/能力校验在 validate 层，这里只做形状收敛）。
   * @param {string} id
   * @param {string[]} accountIds
   */
  function assignAccounts(id, accountIds) {
    const record = findRecord(id)
    if (record.status !== 'draft') {
      throw new PublishError('record-not-draft', `record ${id} is already submitted; only drafts accept account assignment`)
    }
    const ids = stringArray(accountIds)
    if (new Set(ids).size !== ids.length) {
      throw new PublishError('invalid-arguments', 'account_ids contains duplicates')
    }
    record.account_ids = ids
    record.updated_at = now()
    state.revision += 1
    persist()
    return viewOf(record)
  }

  /**
   * submit 物化：为每个账号生成一个 per-account 子任务（PRD §2.2② 分发粒度是账号）。
   * record.status → submitted，记录 submitted_at。子任务初始 `submitting`
   * （create 成功即转 submitted；加载时遗留 submitting = interrupted）。
   * @param {string} id
   * @param {Array<{ id: string, platform: string, provider: string }>} accountRows
   */
  function materialize(id, accountRows) {
    const record = findRecord(id)
    if (record.status !== 'draft') {
      throw new PublishError('record-not-draft', `record ${id} is already submitted`)
    }
    if (!Array.isArray(accountRows) || accountRows.length === 0) {
      throw new PublishError('invalid-arguments', 'at least one account is required to submit')
    }
    record.subtasks = accountRows.map((row) => ({
      id: newId('tsk'),
      record_id: record.id,
      account_id: String(row.id),
      provider: row.provider,
      platform: String(row.platform || ''),
      status: 'submitting',
      post_id: null,
      raw_status: null,
      error: null,
      attempts: 0,
      submitted_at: null,
      settled_at: null,
    }))
    record.status = 'submitted'
    record.submitted_at = now()
    record.updated_at = now()
    record.error = null // 新一轮提交开始：清掉上一轮 record 级错误
    state.revision += 1
    persist()
    return record.subtasks.map((task) => ({ ...task }))
  }

  /**
   * @param {string} recordId
   */
  function findTask(recordId, taskId) {
    const record = findRecord(recordId)
    const task = (record.subtasks || []).find((row) => row.id === taskId)
    if (!task) throw new PublishError('task-not-found', `task ${taskId} not found in record ${recordId}`)
    return { record, task }
  }

  /**
   * 全局找子任务（工具面只拿 task_id）。
   * @param {string} taskId
   */
  function findTaskAnywhere(taskId) {
    for (const record of state.records) {
      const task = (record.subtasks || []).find((row) => row.id === taskId)
      if (task) return { record, task }
    }
    throw new PublishError('task-not-found', `task ${taskId} not found`)
  }

  /**
   * 子任务状态迁移（taskId 即落盘：每次迁移都 persist）。
   * @param {string} taskId
   * @param {Partial<{ status: string, post_id: string | null, raw_status: string | null, error: string | null, submitted_at: string | null, settled_at: string | null, attempts: number }>} patch
   */
  function updateTask(taskId, patch) {
    const { record, task } = findTaskAnywhere(taskId)
    const source = patch && typeof patch === 'object' ? patch : {}
    if ('status' in source && source.status !== undefined) {
      task.status = pickEnum(source.status, TASK_STATUSES, 'task.status')
    }
    if ('post_id' in source) task.post_id = source.post_id == null ? null : String(source.post_id)
    if ('raw_status' in source) task.raw_status = source.raw_status == null ? null : String(source.raw_status)
    if ('error' in source) task.error = source.error == null ? null : String(source.error)
    if ('submitted_at' in source) task.submitted_at = source.submitted_at || null
    if ('settled_at' in source) task.settled_at = source.settled_at || null
    if ('attempts' in source && typeof source.attempts === 'number') task.attempts = source.attempts
    record.updated_at = now()
    state.revision += 1
    persist()
    return { ...task }
  }

  /**
   * 记录已上传媒体映射（media_id → public_url），供 retry 复用已上传媒体。
   * 默认合并；`replace:true` 整体覆写（重置场景）。
   * @param {string} recordId
   * @param {Record<string, string>} uploads
   * @param {{ replace?: boolean }} [opts]
   */
  function setUploads(recordId, uploads, opts = {}) {
    const record = findRecord(recordId)
    record.uploads = opts.replace ? { ...uploads } : { ...(record.uploads || {}), ...uploads }
    record.updated_at = now()
    state.revision += 1
    persist()
  }

  /**
   * record 级错误（后台 runner 整段意外失败的落点）：写 error 字段并 bump
   * revision——UI 的 state?rev= 轮询据此看到失败，而不是空转到超时
   * （PRD §5.6 不静默失败）。新一次 materialize 会清掉它。
   * @param {string} recordId
   * @param {string} message
   */
  function setRecordError(recordId, message) {
    const record = findRecord(recordId)
    record.error = String(message || 'unknown error')
    record.updated_at = now()
    state.revision += 1
    persist()
    return getView(recordId)
  }

  function revision() {
    return state.revision
  }

  return {
    create,
    get,
    getView,
    listViews,
    update,
    remove,
    assignAccounts,
    materialize,
    updateTask,
    findTask,
    findTaskAnywhere,
    setUploads,
    setRecordError,
    recover,
    revision,
  }
}
