import { PublishError } from './publish-error.js'
import { newId, TASK_STATUSES } from './record-schema.js'

/**
 * @param {{ state: import('./record-types.js').RecordState, now: () => string, persist: () => void, findRecord: (id: string) => import('./record-types.js').PublishRecord }} deps
 */
export function createTaskLedger({ state, now, persist, findRecord }) {
  function recover() {
    let touched = false
    for (const record of state.records) {
      for (const task of record.subtasks) {
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

  /** @param {string} id @param {Array<{ id: string, platform: string, provider?: string }>} accountRows */
  function materialize(id, accountRows) {
    const record = findRecord(id)
    if (record.status !== 'draft') throw new PublishError('record-not-draft', `record ${id} is already submitted`)
    if (!Array.isArray(accountRows) || accountRows.length === 0) {
      throw new PublishError('invalid-arguments', 'at least one account is required to submit')
    }
    record.subtasks = accountRows.map((row) => ({
      id: newId('tsk'), record_id: record.id, account_id: String(row.id),
      provider: row.provider, platform: String(row.platform || ''), status: 'submitting',
      post_id: null, raw_status: null, error: null, attempts: 0, submitted_at: null, settled_at: null,
    }))
    record.status = 'submitted'
    record.submitted_at = now()
    record.updated_at = now()
    record.error = null
    state.revision += 1
    persist()
    return record.subtasks.map((task) => ({ ...task }))
  }

  /** @param {string} recordId @param {string} taskId */
  function findTask(recordId, taskId) {
    const record = findRecord(recordId)
    const task = record.subtasks.find((row) => row.id === taskId)
    if (!task) throw new PublishError('task-not-found', `task ${taskId} not found in record ${recordId}`)
    return { record, task }
  }

  /** @param {string} taskId */
  function findTaskAnywhere(taskId) {
    for (const record of state.records) {
      const task = record.subtasks.find((row) => row.id === taskId)
      if (task) return { record, task }
    }
    throw new PublishError('task-not-found', `task ${taskId} not found`)
  }

  /** @param {string} taskId @param {import('./record-types.js').TaskPatch} patch */
  function updateTask(taskId, patch) {
    const { record, task } = findTaskAnywhere(taskId)
    const source = patch && typeof patch === 'object' ? patch : {}
    if ('status' in source && source.status !== undefined) {
      if (!TASK_STATUSES.includes(source.status)) {
        throw new PublishError('invalid-arguments', `task.status must be one of ${TASK_STATUSES.join(' | ')}`)
      }
      task.status = source.status
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
  return { recover, materialize, findTask, findTaskAnywhere, updateTask }
}
