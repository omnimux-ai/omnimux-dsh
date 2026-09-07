/** @typedef {'video' | 'image'} RecordType */
/**
 * Persisted tasks may contain unrecognised status strings; only updateTask writes TaskStatus.
 * @typedef {object} PublishTask
 * @property {string} id
 * @property {string} record_id
 * @property {string} account_id
 * @property {string} platform
 * @property {string} [provider]
 * @property {string} status
 * @property {string | null} post_id
 * @property {string | null} raw_status
 * @property {string | null} error
 * @property {number} attempts
 * @property {string | null} submitted_at
 * @property {string | null} settled_at
 */
/**
 * Complete ledger row, validated at the disk boundary or constructed by the store.
 * @typedef {object} PublishRecord
 * @property {string} id
 * @property {RecordType} type
 * @property {'draft' | 'submitted'} status
 * @property {string} title
 * @property {string} description
 * @property {string[]} topics
 * @property {string[]} media_ids
 * @property {string | null} cover_media_id
 * @property {Record<string, unknown>} settings
 * @property {string[]} account_ids
 * @property {Record<string, string>} uploads
 * @property {string | null} error
 * @property {PublishTask[]} subtasks
 * @property {string} created_at
 * @property {string} updated_at
 * @property {string | null} submitted_at
 */
/** @typedef {Pick<import('./shared/record-status.js').SubtaskSummary, 'total' | 'submitted' | 'reviewing' | 'published' | 'failed'>} WireSubtaskSummary */
/** @typedef {PublishRecord & { aggregate: import('./shared/record-status.js').AggregateStatus, subtask_summary: WireSubtaskSummary }} RecordView */
/** @typedef {{ schema: number, revision: number, records: PublishRecord[] }} RecordState */
/** @typedef {{ type: unknown, title?: unknown, description?: unknown, topics?: unknown, media_ids?: unknown, cover_media_id?: unknown, settings?: unknown, account_ids?: unknown }} DraftInput */
/** @typedef {Partial<{ status: import('./shared/record-status.js').TaskStatus, post_id: string | number | null, raw_status: string | null, error: string | null, submitted_at: string | null, settled_at: string | null, attempts: number }>} TaskPatch */
export {}
