/** RecordStore: the single publishing ledger. Draft and submitted views share records.json. */
import { PublishError } from './publish-error.js'
import { newId, recordType, cloneRecord } from './record-schema.js'
import { RECORD_FS, loadRecordState, persistRecordState } from './record-persistence.js'
import { createTaskLedger } from './record-tasks.js'
import { isObject, stringArray } from './shared/values.js'
import { aggregateStatus, calculateSubtaskSummary } from './shared/record-status.js'

export { PublishError } from './publish-error.js'
export { RECORD_TYPES, TASK_STATUSES, newId } from './record-schema.js'
export { aggregateStatus, calculateSubtaskSummary } from './shared/record-status.js'
/** @typedef {import('./record-types.js').PublishRecord} PublishRecord */
/** @typedef {import('./record-types.js').RecordView} RecordView */

/**
 * Filters retain their ledger semantics: submitted includes every submitted record.
 * @param {{ status: string, subtasks?: unknown, submitted_at?: string | null }} record
 * @param {string} filter
 */
export function matchesStatusFilter(record, filter) {
  if (filter === 'all') return true
  if (filter === 'draft') return record.status === 'draft'
  const summary = calculateSubtaskSummary(record.subtasks)
  const submitted = record.submitted_at != null
  if (filter === 'submitted') return submitted
  if (filter === 'reviewing') return submitted && summary.reviewing > 0
  if (filter === 'published') return submitted && summary.total > 0 && summary.published === summary.total
  if (filter === 'failed') return submitted && summary.failed > 0
  return true
}

/** @param {PublishRecord} record @returns {RecordView} */
function viewOf(record) {
  const { total, submitted, reviewing, published, failed } = calculateSubtaskSummary(record.subtasks)
  // inFlight is internal; preserve the existing HTTP subtask_summary shape.
  return { ...cloneRecord(record), aggregate: aggregateStatus(record), subtask_summary: { total, submitted, reviewing, published, failed } }
}

/**
 * @param {{ paths?: { recordsFile: string }, fs?: Partial<typeof RECORD_FS>, now?: () => string }} [opts]
 */
export function createRecordStore(opts = {}) {
  const fs = { ...RECORD_FS, ...(opts.fs ?? {}) }
  const file = opts.paths?.recordsFile
  const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString()
  const state = loadRecordState(fs, file)
  const persist = () => persistRecordState(fs, file, state)

  /** @param {string} id */
  function get(id) {
    const found = state.records.find((record) => record.id === id)
    return found ? cloneRecord(found) : null
  }

  /** @param {{ status_filter?: string, type?: string, page?: number }} [query] */
  function listViews(query = {}) {
    const filter = query.status_filter || 'all'
    const type = query.type || ''
    const pageSize = 50
    const page = Math.max(1, Number(query.page) || 1)
    const rows = state.records
      .filter((record) => matchesStatusFilter(record, filter))
      .filter((record) => (type ? record.type === type : true))
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
    return {
      page, page_size: pageSize, total: rows.length,
      records: rows.slice((page - 1) * pageSize, page * pageSize).map(viewOf),
    }
  }

  /** @param {string} id */
  function getView(id) {
    const found = state.records.find((record) => record.id === id)
    return found ? viewOf(found) : null
  }

  /** @param {string} id */
  function findRecord(id) {
    const found = state.records.find((record) => record.id === id)
    if (!found) throw new PublishError('record-not-found', `record ${id} not found`)
    return found
  }

  /** @param {import('./record-types.js').DraftInput} input */
  function create(input) {
    /** @type {PublishRecord} */
    const record = {
      id: newId('rec'),
      type: recordType(input.type, 'type'),
      status: 'draft',
      title: typeof input.title === 'string' ? input.title.trim() : '',
      description: typeof input.description === 'string' ? input.description : '',
      topics: stringArray(input.topics),
      media_ids: Array.isArray(input.media_ids) ? input.media_ids.filter((v) => typeof v === 'string') : [],
      cover_media_id: typeof input.cover_media_id === 'string' && input.cover_media_id ? input.cover_media_id : null,
      settings: isObject(input.settings) ? { ...input.settings } : {},
      account_ids: stringArray(input.account_ids),
      uploads: {}, error: null, subtasks: [],
      created_at: now(), updated_at: now(), submitted_at: null,
    }
    state.records.push(record)
    state.revision += 1
    persist()
    return viewOf(record)
  }

  /** @param {string} id @param {Record<string, unknown>} patch */
  function update(id, patch) {
    const record = findRecord(id)
    if (record.status !== 'draft') {
      throw new PublishError('record-not-draft', `record ${id} is already submitted; only drafts are editable`)
    }
    const source = isObject(patch) ? patch : {}
    if ('type' in source) record.type = recordType(source.type, 'patch.type')
    if ('title' in source && source.title !== undefined) record.title = typeof source.title === 'string' ? source.title.trim() : record.title
    if ('description' in source && source.description !== undefined) record.description = typeof source.description === 'string' ? source.description : record.description
    if ('topics' in source && source.topics !== undefined) record.topics = stringArray(source.topics)
    if ('media_ids' in source && source.media_ids !== undefined) {
      record.media_ids = Array.isArray(source.media_ids) ? source.media_ids.filter((v) => typeof v === 'string') : record.media_ids
    }
    if ('cover_media_id' in source) {
      record.cover_media_id = typeof source.cover_media_id === 'string' && source.cover_media_id ? source.cover_media_id : null
    }
    if (isObject(source.settings)) record.settings = { ...source.settings }
    if ('account_ids' in source && source.account_ids !== undefined) record.account_ids = stringArray(source.account_ids)
    record.updated_at = now()
    state.revision += 1
    persist()
    return viewOf(record)
  }

  /** @param {string} id */
  function remove(id) {
    const record = findRecord(id)
    if (record.status !== 'draft') {
      throw new PublishError('record-not-draft', `record ${id} is already submitted; submitted records are kept as the ledger`)
    }
    state.records.splice(state.records.indexOf(record), 1)
    state.revision += 1
    persist()
    return { id, deleted: true }
  }

  /** @param {string} id @param {string[]} accountIds */
  function assignAccounts(id, accountIds) {
    const record = findRecord(id)
    if (record.status !== 'draft') {
      throw new PublishError('record-not-draft', `record ${id} is already submitted; only drafts accept account assignment`)
    }
    const ids = stringArray(accountIds)
    if (new Set(ids).size !== ids.length) throw new PublishError('invalid-arguments', 'account_ids contains duplicates')
    record.account_ids = ids
    record.updated_at = now()
    state.revision += 1
    persist()
    return viewOf(record)
  }

  /** @param {string} recordId @param {Record<string, string>} uploads @param {{ replace?: boolean }} [opts] */
  function setUploads(recordId, uploads, opts = {}) {
    const record = findRecord(recordId)
    record.uploads = opts.replace ? { ...uploads } : { ...record.uploads, ...uploads }
    record.updated_at = now()
    state.revision += 1
    persist()
  }

  /** @param {string} recordId @param {string} message */
  function setRecordError(recordId, message) {
    const record = findRecord(recordId)
    record.error = String(message || 'unknown error')
    record.updated_at = now()
    state.revision += 1
    persist()
    return getView(recordId)
  }

  return {
    create, get, getView, listViews, update, remove, assignAccounts, setUploads, setRecordError,
    ...createTaskLedger({ state, now, persist, findRecord }),
    revision: () => state.revision,
  }
}
