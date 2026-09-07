import { randomUUID } from 'node:crypto'
import { PublishError } from './publish-error.js'
import { isObject, isStringArray } from './shared/values.js'

export const RECORD_TYPES = Object.freeze(['video', 'image'])
/** @type {ReadonlyArray<import('./shared/record-status.js').TaskStatus>} */
export const TASK_STATUSES = Object.freeze(['submitting', 'submitted', 'reviewing', 'published', 'failed'])

/** @param {'rec' | 'tsk'} prefix */
export function newId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 8)}`
}

/** @param {unknown} value @param {string} where @returns {import('./record-types.js').RecordType} */
export function recordType(value, where) {
  if (value === 'video' || value === 'image') return value
  throw new PublishError('invalid-arguments', `${where} must be one of ${RECORD_TYPES.join(' | ')}`)
}

/** @param {unknown} value @returns {value is string | null} */
const nullableString = (value) => value === null || typeof value === 'string'

/** @param {unknown} value @returns {value is import('./record-types.js').PublishTask} */
function isTask(value) {
  if (!isObject(value)) return false
  return ['id', 'record_id', 'account_id', 'platform', 'status'].every((key) => typeof value[key] === 'string')
    && (value.provider === undefined || typeof value.provider === 'string')
    && ['post_id', 'raw_status', 'error', 'submitted_at', 'settled_at'].every((key) => nullableString(value[key]))
    && typeof value.attempts === 'number' && Number.isFinite(value.attempts)
}

/**
 * The disk boundary checks all fields consumers rely on, not just id/type.
 * Unknown task status strings remain intact for defensive aggregate projection.
 * @param {unknown} value
 * @returns {value is import('./record-types.js').PublishRecord}
 */
export function isPublishRecord(value) {
  if (!isObject(value)) return false
  return (value.type === 'video' || value.type === 'image')
    && (value.status === 'draft' || value.status === 'submitted')
    && ['id', 'title', 'description', 'created_at', 'updated_at'].every((key) => typeof value[key] === 'string')
    && ['error', 'cover_media_id', 'submitted_at'].every((key) => nullableString(value[key]))
    && ['topics', 'media_ids', 'account_ids'].every((key) => isStringArray(value[key]))
    && isObject(value.settings) && isObject(value.uploads)
    && Object.values(value.uploads).every((url) => typeof url === 'string')
    && Array.isArray(value.subtasks) && value.subtasks.every(isTask)
}

/** Preserve JSON ledger cloning semantics without allowing JSON.parse to erase types.
 * @param {import('./record-types.js').PublishRecord} record
 */
export function cloneRecord(record) {
  /** @type {unknown} */
  const copy = JSON.parse(JSON.stringify(record))
  if (!isPublishRecord(copy)) throw new PublishError('invalid-record', 'record cannot be represented as a complete JSON ledger row')
  return copy
}
