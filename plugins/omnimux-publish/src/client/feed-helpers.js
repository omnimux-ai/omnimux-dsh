import { deleteDraft, errorText, retryTask } from './api.js'
import { displayStatus } from './status-display.js'
import { ACCOUNT_SOURCE_MESSAGE, isRetryablePublishingTask } from '../account-policy.js'

/** tab → Host status_filter */
export const TAB_FILTER = {
  all: 'submitted',
  drafts: 'draft',
  reviewing: 'reviewing',
  published: 'published',
  retry: 'failed',
}

export const SUBMIT_POLL_MS = 2000
export const SUBMIT_POLL_MAX_MS = 5 * 60 * 1000

const TAB_MATCHERS = {
  all: (rec) => rec.status !== 'draft',
  drafts: (rec) => rec.status === 'draft',
  reviewing: (rec) => displayStatus(rec) === 'reviewing',
  published: (rec) => displayStatus(rec) === 'published',
  retry: (rec) => {
    const s = displayStatus(rec)
    return s === 'failed' || s === 'partial_failed'
  },
}

export function matchesTab(rec, tab) {
  const matcher = TAB_MATCHERS[tab]
  return matcher ? matcher(rec) : true
}

export function matchesSearchQuery(rec, q) {
  if (!q) return true
  const title = String(rec.title || '').toLowerCase()
  const desc = String(rec.description || '').toLowerCase()
  const topics = Array.isArray(rec.topics) ? rec.topics.join(' ').toLowerCase() : ''
  return title.includes(q) || desc.includes(q) || topics.includes(q)
}

export function filterRecord(rec, filters) {
  const { tab, q, typeFilter, modeFilter } = filters
  if (!matchesTab(rec, tab)) return false
  if (!matchesSearchQuery(rec, q)) return false
  if (typeFilter && rec.type !== typeFilter) return false
  if (modeFilter && rec.mode !== modeFilter) return false
  return true
}

const RECORD_COMPARATORS = {
  recent: (a, b) => {
    const aTime = String(a.updated_at || a.created_at || '')
    const bTime = String(b.updated_at || b.created_at || '')
    return bTime.localeCompare(aTime)
  },
  dateDesc: (a, b) => {
    const aTime = String(a.submitted_at || a.created_at || '')
    const bTime = String(b.submitted_at || b.created_at || '')
    return bTime.localeCompare(aTime)
  },
  dateAsc: (a, b) => {
    const aTime = String(a.submitted_at || a.created_at || '')
    const bTime = String(b.submitted_at || b.created_at || '')
    return aTime.localeCompare(bTime)
  },
  title: (a, b) => {
    const aTitle = String(a.title || '')
    const bTitle = String(b.title || '')
    return aTitle.localeCompare(bTitle)
  },
}

export function compareRecords(a, b, sortOption) {
  const comp = RECORD_COMPARATORS[sortOption]
  return comp ? comp(a, b) : 0
}

export function buildCsvRow(r) {
  const title = (r.title || '').replace(/"/g, '""')
  const type = r.type || 'image'
  const subtasks = Array.isArray(r.subtasks) ? r.subtasks : []
  const platforms = subtasks.map((s) => s.platform).join(';')
  const date = r.submitted_at || r.created_at || ''
  const status = displayStatus(r)
  const mode = r.mode || 'instant'
  return `"${r.id}","${title}","${type}","${platforms}","${date}","${status}","${mode}"`
}

export function buildCsvContent(records) {
  const headers = 'ID,Title,Type,Platforms,Date,Status,Mode'
  const rows = records.map(buildCsvRow)
  return '\uFEFF' + [headers, ...rows].join('\n')
}

export function exportCsv(records, showToast) {
  if (!records || records.length === 0) {
    showToast('当前无记录可导出')
    return
  }
  const csv = buildCsvContent(records)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `publish_records_${Date.now()}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  showToast(`已导出 ${records.length} 条记录`)
}

export async function executeSingleRetry(record, showToast, onSuccess) {
  try {
    const count = await retryRecordSubtasks(record)
    if (count === 0) { showToast(ACCOUNT_SOURCE_MESSAGE); return }
    showToast('已下发重试')
    onSuccess?.()
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error))
  }
}

async function retryRecordSubtasks(rec) {
  if (!rec || !Array.isArray(rec.subtasks)) return 0
  let count = 0
  const failedTasks = rec.subtasks.filter(isRetryablePublishingTask)
  for (const task of failedTasks) {
    const result = await retryTask(task.id)
    if (!result.ok) throw new Error(errorText(result.body, result.status))
    count++
  }
  return count
}

export async function executeBatchRetry(records, selectedIds, showToast, onSuccess) {
  let retryCount = 0
  try {
    for (const id of selectedIds) {
      const rec = records.find((r) => String(r.id) === id)
      retryCount += await retryRecordSubtasks(rec)
    }
    if (retryCount === 0) { showToast(ACCOUNT_SOURCE_MESSAGE); return }
    showToast(`已重试 ${retryCount} 个失败子任务`)
    onSuccess?.()
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error))
  }
}

export async function executeBatchDeleteDrafts(records, selectedIds, showToast, onSuccess) {
  let deletedCount = 0
  for (const id of selectedIds) {
    const rec = records.find((r) => String(r.id) === id)
    if (rec && rec.status === 'draft') {
      const res = await deleteDraft(id)
      if (res.ok) deletedCount++
    }
  }
  showToast(`已删除 ${deletedCount} 条草稿`)
  onSuccess?.()
}

export async function executeDeleteDraft(pendingDelete, t, showToast, onSuccess) {
  if (!pendingDelete) return
  try {
    const result = await deleteDraft(String(pendingDelete.id))
    if (result.ok) {
      showToast('已删除草稿')
      onSuccess?.()
      return
    }
    const reason = errorText(result.body, result.status)
    showToast(t('records.deleteFailed', { reason }))
  } catch (e) {
    showToast(String(e))
  }
}
