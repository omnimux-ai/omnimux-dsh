/** Single submit/refresh/retry service for Agent tools and the HTTP runner. */
import { PublishError } from './publish-error.js'
import { extractPostId, extractRawStatus } from './hubtools.js'
import { validateForSubmit, validationError } from './validate.js'
import { requirePublishingAccounts } from './accounts.js'
import { ACCOUNT_SOURCE_MESSAGE, PUBLISH_PROVIDER } from './account-policy.js'
import { createSubmitMedia, composeContent } from './submit-media.js'
export { composeContent } from './submit-media.js'
/** @typedef {import('./submit-media.js').ExecutionOptions} ExecutionOptions */

const INFLIGHT_TASK_STATUSES = new Set(['submitted', 'reviewing'])
const TERMINAL_TASK_STATUSES = new Set(['published', 'failed'])

/**
 * @param {{
 *   store: ReturnType<typeof import('./store.js').createRecordStore>,
 *   media: ReturnType<typeof import('./media.js').createMediaStore>,
 *   channel: ReturnType<typeof import('./hubtools.js').createHubChannel>,
 *   accounts: ReturnType<typeof import('./accounts.js').createAccountSource>,
 *   config: import('./config.js').PublishConfig,
 *   fetcher?: typeof fetch,
 *   now?: () => string,
 * }} deps
 */
export function createSubmitService(deps) {
  const { store, media, channel, accounts, config } = deps
  const { mediaRowsOf, ensureUploaded } = createSubmitMedia(deps)
  const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString()
  const timeoutMs = Math.max(1, config.submitTimeoutSeconds) * 1000
  /** @type {Map<string, Promise<import('./record-types.js').RecordView | null>>} */
  const inflight = new Map()

  /** @param {ExecutionOptions} [opts] */
  function execOpts(opts = {}) {
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
    return { ...(opts.agent !== undefined ? { agent: opts.agent } : {}), signal }
  }

  /** Concurrent calls for one record share a promise. @param {string} recordId @param {ExecutionOptions} [opts] */
  function run(recordId, opts = {}) {
    const existing = inflight.get(recordId)
    if (existing) return existing
    const promise = prepareNow(recordId, opts)
      .then(() => dispatchNow(recordId, opts))
      .finally(() => inflight.delete(recordId))
    inflight.set(recordId, promise)
    return promise
  }

  /** Validation precedes task materialization and upload. @param {string} recordId @param {ExecutionOptions} [opts] */
  async function prepareNow(recordId, opts = {}) {
    const record = store.get(recordId)
    if (!record) throw new PublishError('record-not-found', `record ${recordId} not found`)
    if (record.status !== 'draft') {
      throw new PublishError('record-not-draft', `record ${recordId} 已提交过（只能对 draft 一键发布；失败账号请用 retry）`)
    }
    const { accounts: accountRows, degraded } = await accounts.list()
    if (degraded === 'needs-omnimux') {
      throw new PublishError('needs-omnimux', 'OmniMux 未登录：发布需要登录态。请先在 OmniMux 登录或设置 OMNIMUX_ACCESS_TOKEN。')
    }
    const cover = record.cover_media_id ? media.get(record.cover_media_id) : null
    const verdict = validateForSubmit({
      type: record.type, title: record.title, description: record.description,
      mediaRows: mediaRowsOf(record), coverRow: cover ? { id: cover.id, kind: cover.kind } : null,
      account_ids: record.account_ids,
    }, { accounts: accountRows, platforms: config.platforms })
    if (!verdict.ok) throw validationError(verdict.errors)
    const selected = record.account_ids
      .map((id) => accountRows.find((row) => String(row.id) === String(id)))
      .filter((row) => row != null)
    store.materialize(recordId, selected)
    return store.getView(recordId)
  }

  /** Upload once per media; isolate per-account create failures. @param {string} recordId @param {ExecutionOptions} [opts] */
  async function dispatchNow(recordId, opts = {}) {
    const record = store.get(recordId)
    if (!record) throw new PublishError('record-not-found', `record ${recordId} not found`)
    const tasks = record.subtasks
    if (tasks.length === 0 || tasks.some((task) => task.provider !== PUBLISH_PROVIDER)) {
      throw new PublishError('post-provider-mismatch', ACCOUNT_SOURCE_MESSAGE)
    }
    await requirePublishingAccounts(accounts, tasks.map((task) => task.account_id))
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
    const content = composeContent(record)
    const mediaItems = record.media_ids.map((mediaId) => ({ url: uploads[mediaId] }))
    for (const task of tasks) {
      const perTask = execOpts(opts)
      try {
        const data = await channel.createPost({ account_ids: [task.account_id], content, media_items: mediaItems }, perTask)
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

  /** HTTP preparation errors propagate before the background runner starts. @param {string} recordId @param {ExecutionOptions} [opts] */
  function prepare(recordId, opts = {}) {
    return prepareNow(recordId, opts)
  }

  /** @param {string} recordId @param {ExecutionOptions} [opts] */
  function dispatch(recordId, opts = {}) {
    const existing = inflight.get(recordId)
    if (existing) return existing
    const promise = dispatchNow(recordId, opts).finally(() => inflight.delete(recordId))
    inflight.set(recordId, promise)
    return promise
  }

  /** @param {string} recordId @param {ExecutionOptions} [opts] */
  async function refresh(recordId, opts = {}) {
    const record = store.get(recordId)
    if (!record) throw new PublishError('record-not-found', `record ${recordId} not found`)
    /** @type {Array<{ task_id: string, error: string }>} */
    const syncErrors = []
    for (const task of record.subtasks) {
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
        /** @type {import('./record-types.js').TaskPatch} */
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

  /** Retry one failed account using already-uploaded media. @param {string} taskId @param {ExecutionOptions} [opts] */
  async function retryTask(taskId, opts = {}) {
    const { record: rawRecord, task: rawTask } = store.findTaskAnywhere(taskId)
    if (rawTask.status !== 'failed') {
      throw new PublishError('task-not-retryable', `task ${taskId} 状态为 ${rawTask.status}，只有 failed 子任务可以重试`)
    }
    if (rawTask.provider !== PUBLISH_PROVIDER) throw new PublishError('post-provider-mismatch', ACCOUNT_SOURCE_MESSAGE)
    await requirePublishingAccounts(accounts, [rawTask.account_id])
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
    const mediaItems = rawRecord.media_ids.map((mediaId) => ({ url: uploads[mediaId] }))
    try {
      const data = await channel.createPost({ account_ids: [rawTask.account_id], content, media_items: mediaItems }, execOpts(opts))
      const postId = extractPostId(data, 'omnimux_publish_create')
      const task = store.updateTask(taskId, { status: 'submitted', post_id: postId, error: null, submitted_at: now(), raw_status: null })
      return { record: store.getView(rawRecord.id), task }
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

  function dispose(reason = 'plugin unloaded') {
    for (const recordId of [...inflight.keys()]) {
      const record = store.get(recordId)
      for (const task of record?.subtasks || []) {
        if (task.status === 'submitting') {
          store.updateTask(task.id, { status: 'failed', error: `interrupted: ${reason}`, settled_at: now() })
        }
      }
    }
    inflight.clear()
  }
  return { run, prepare, dispatch, refresh, retryTask, dispose, inflight }
}
