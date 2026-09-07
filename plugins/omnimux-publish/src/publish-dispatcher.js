/** Shared domain entry points for Agent tools and HTTP; no req/res dependency. */
import { PublishError } from './publish-error.js'
import { parseDraftPayload, validateContent, validateForSubmit, validationError } from './validate.js'
import { requirePublishingAccounts } from './accounts.js'
import { isStringArray } from './shared/values.js'
/** @typedef {import('./submit-media.js').ExecutionOptions & { record_id: string }} RecordExecution */

/**
 * @param {{
 *   store: ReturnType<typeof import('./store.js').createRecordStore>,
 *   media: ReturnType<typeof import('./media.js').createMediaStore>,
 *   accounts: ReturnType<typeof import('./accounts.js').createAccountSource>,
 *   service: ReturnType<typeof import('./submit.js').createSubmitService>,
 *   config: import('./config.js').PublishConfig,
 * }} deps
 */
export function createPublishDispatcher(deps) {
  const { store, media, accounts, service, config } = deps

  /** @param {{ path?: string, media_id?: string }} ref */
  function resolveMediaRef(ref) {
    if (ref.media_id) {
      const row = media.get(ref.media_id)
      if (!row) throw new PublishError('media-not-found', `media_id ${ref.media_id} 不在媒体仓中`)
      return row.id
    }
    return media.importPath(ref.path || '').media.id
  }

  /** @param {{ type?: unknown, payload?: unknown, account_ids?: unknown }} input */
  async function createDraft(input) {
    const parsed = parseDraftPayload(input.payload)
    const type = input.type ?? parsed.type
    if (!type) throw new PublishError('invalid-arguments', 'type is required (video | image)')
    const accountIds = input.account_ids || parsed.account_ids || []
    if (!isStringArray(accountIds)) throw new PublishError('invalid-arguments', 'account_ids must be an array of strings')
    if (accountIds.length > 0) await requirePublishingAccounts(accounts, accountIds)
    const record = store.create({
      type,
      title: typeof parsed.title === 'string' ? parsed.title : '',
      description: typeof parsed.description === 'string' ? parsed.description : '',
      topics: parsed.topics, media_ids: (parsed.media || []).map(resolveMediaRef),
      cover_media_id: parsed.cover ? resolveMediaRef(parsed.cover) : null,
      settings: parsed.settings, account_ids: accountIds,
    })
    return draftResult(record.id)
  }

  /** @param {string} id */
  function draftResult(id) {
    const view = store.getView(id)
    if (!view) throw new PublishError('record-not-found', `record ${id} not found`)
    const mediaRows = view.media_ids.map((mediaId) => {
      const row = media.get(mediaId)
      return row
        ? { id: row.id, kind: row.kind, filename: row.filename, content_type: row.content_type }
        : { id: mediaId, kind: 'other', filename: '', content_type: '' }
    })
    const cover = view.cover_media_id ? media.get(view.cover_media_id) : null
    const contentErrors = validateContent({
      type: view.type, title: view.title, description: view.description, mediaRows,
      coverRow: cover ? { id: cover.id, kind: cover.kind } : null,
    })
    return { record: view, media: mediaRows, content_errors: contentErrors }
  }

  /** @param {{ draft_id: string, patch?: unknown }} input */
  async function updateDraft(input) {
    const parsed = parseDraftPayload(input.patch)
    if (parsed.account_ids && parsed.account_ids.length > 0) await requirePublishingAccounts(accounts, parsed.account_ids)
    /** @type {Record<string, unknown>} */
    const patch = {}
    if ('type' in parsed && parsed.type !== undefined) patch.type = parsed.type
    if ('title' in parsed && parsed.title !== undefined) patch.title = parsed.title
    if ('description' in parsed && parsed.description !== undefined) patch.description = parsed.description
    if ('topics' in parsed && parsed.topics !== undefined) patch.topics = parsed.topics
    if (parsed.media !== undefined) patch.media_ids = parsed.media.map(resolveMediaRef)
    if (parsed.cover !== undefined) patch.cover_media_id = parsed.cover ? resolveMediaRef(parsed.cover) : null
    if ('settings' in parsed && parsed.settings !== undefined) patch.settings = parsed.settings
    store.update(String(input.draft_id || ''), patch)
    const accountIdPatch = parsed.account_ids
    if (accountIdPatch !== undefined) {
      if (accountIdPatch.length > 0) await assignAccounts({ draft_id: input.draft_id, account_ids: accountIdPatch })
      else store.update(String(input.draft_id || ''), { account_ids: [] })
    }
    return draftResult(String(input.draft_id))
  }

  /** @param {{ draft_id: string, confirm?: boolean }} input */
  function deleteDraft(input) {
    if (input.confirm !== true) throw new PublishError('confirm-required', '删除草稿需要显式 confirm:true（防误删；草稿删除不可恢复）')
    return store.remove(String(input.draft_id || ''))
  }

  /** @param {{ platform?: string }} [input] */
  async function listAccounts(input = {}) {
    const result = await accounts.list({ platform: input.platform })
    return { ...result, hint: result.degraded ? result.message : 'account 可用性判定：status ∈ {active, expiring} 且 agent_usable !== false' }
  }

  /** @param {{ draft_id: string, account_ids: string[] }} input */
  async function assignAccounts(input) {
    if (!Array.isArray(input.account_ids) || input.account_ids.length === 0) throw new PublishError('invalid-arguments', 'account_ids 必须是非空数组')
    const record = store.get(String(input.draft_id || ''))
    if (!record) throw new PublishError('record-not-found', `record ${input.draft_id} not found`)
    const { accounts: rows, degraded } = await accounts.list()
    if (degraded === 'needs-omnimux') {
      throw new PublishError('needs-omnimux', 'OmniMux 未登录：挂账号前需要读取账号列表。请先在 OmniMux 登录或设置 OMNIMUX_ACCESS_TOKEN。')
    }
    const mediaRows = record.media_ids.map((mediaId) => {
      const row = media.get(mediaId)
      return row ? { id: row.id, kind: row.kind } : { id: mediaId, kind: 'other' }
    })
    const cover = record.cover_media_id ? media.get(record.cover_media_id) : null
    const verdict = validateForSubmit({
      type: record.type, title: record.title, description: record.description, mediaRows,
      coverRow: cover ? { id: cover.id, kind: cover.kind } : null, account_ids: input.account_ids,
    }, { accounts: rows, platforms: config.platforms })
    if (!verdict.ok) throw validationError(verdict.errors)
    return { record: store.assignAccounts(String(input.draft_id), input.account_ids) }
  }

  /** @param {RecordExecution} input */
  function submit(input) {
    return service.run(String(input.record_id || ''), { agent: input.agent, signal: input.signal })
  }
  /** @param {RecordExecution} input */
  function submitPrepare(input) {
    return service.prepare(String(input.record_id || ''), { agent: input.agent, signal: input.signal })
  }
  /** @param {RecordExecution} input */
  function submitDispatch(input) {
    return service.dispatch(String(input.record_id || ''), { agent: input.agent, signal: input.signal })
  }
  /** @param {string} recordId @param {string} message */
  function setRecordError(recordId, message) {
    return store.setRecordError(String(recordId || ''), message)
  }
  /** @param {string} id */
  function openMedia(id) {
    return media.open(String(id || ''))
  }

  /** @param {RecordExecution & { refresh?: boolean }} input */
  async function getRecord(input) {
    const id = String(input.record_id || '')
    if (input.refresh === false) {
      const view = store.getView(id)
      if (!view) throw new PublishError('record-not-found', `record ${id} not found`)
      return view.status === 'draft' ? draftResult(id) : { record: view }
    }
    return service.refresh(id, { agent: input.agent, signal: input.signal })
  }
  /** @param {import('./submit-media.js').ExecutionOptions & { task_id: string }} input */
  function retryTask(input) {
    return service.retryTask(String(input.task_id || ''), { agent: input.agent, signal: input.signal })
  }
  /** @param {{ status_filter?: string, type?: string, page?: number }} [input] */
  function listRecords(input = {}) {
    return store.listViews({ status_filter: input.status_filter || 'all', type: input.type || '', page: input.page })
  }
  function capabilities() {
    return { platforms: config.platforms, statusMap: config.statusMap }
  }
  /** @param {Buffer} buffer @param {{ filename?: string, content_type?: string }} meta */
  function importMedia(buffer, meta) {
    return media.importBuffer(buffer, meta)
  }
  /** @param {string} path */
  function importPath(path) {
    return media.importPath(path)
  }
  /** @param {number} rev */
  function state(rev) {
    const current = store.revision()
    if (Number.isFinite(rev) && rev === current) return { rev: current, unchanged: true }
    return { rev: current, unchanged: false, counts: tabCounts() }
  }
  function tabCounts() {
    const views = store.listViews({ status_filter: 'all' })
    const records = views.records
    return {
      total: views.total,
      draft: records.filter((r) => r.status === 'draft').length,
      submitted: records.filter((r) => r.submitted_at != null).length,
      reviewing: records.filter((r) => r.subtask_summary.reviewing > 0).length,
      published: records.filter((r) => r.submitted_at != null && r.subtask_summary.total > 0 && r.subtask_summary.published === r.subtask_summary.total).length,
      failed: records.filter((r) => r.submitted_at != null && r.subtask_summary.failed > 0).length,
    }
  }
  return {
    createDraft, updateDraft, deleteDraft, listAccounts, assignAccounts, submit, submitPrepare, submitDispatch,
    setRecordError, openMedia, getRecord, retryTask, listRecords, capabilities, importMedia, importPath, state, tabCounts,
  }
}
