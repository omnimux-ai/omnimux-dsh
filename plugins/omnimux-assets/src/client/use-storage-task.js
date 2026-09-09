import { useEffect, useRef, useState } from 'react'
import { assetsRequest } from './api.js'

export const STORAGE_POLL_MS = 500
const PREFIX = '/omnimux/assets/storage'
const storageRequest = (path, options = {}) => assetsRequest(path, {
  ...options, ...(!options.method ? { timeoutMs: 15000 } : {}),
})
const emptyEntries = () => ({ entries: [], blockers: [], nextCursor: null })

function requestError(result) {
  return Object.assign(new Error(result.body?.message || result.body?.error || `HTTP ${result.status}`), {
    code: result.body?.error || 'internal',
  })
}

/** Read every existing plan page without retaining the entire file manifest in memory. */
export async function inspectStoragePlan(task, request = storageRequest, kind = '') {
  const summary = { total: 0, unresolved: 0, ordinary: 0, structure: 0, skipped: 0, recoveryBytes: 0, blockers: 0,
    planHash: task.planHash, conflictSetHash: null, decisionRevision: task.decisionRevision, unmigratedSetHash: task.unmigratedSetHash, unavailable: [] }
  let cursor = 0
  do {
    const query = new URLSearchParams({ limit: '200', cursor: String(cursor), planHash: task.planHash, decisionRevision: String(task.decisionRevision) })
    if (kind) { query.set('kind', kind); query.set('unmigratedSetHash', task.unmigratedSetHash) }
    const response = await request(`${PREFIX}/tasks/${encodeURIComponent(task.id)}/entries?${query}`)
    if (!response.ok) throw requestError(response)
    const page = response.body
    if (page.planHash !== task.planHash || page.decisionRevision !== task.decisionRevision) throw Object.assign(new Error('plan-stale'), { code: 'plan-stale' })
    if (summary.conflictSetHash && summary.conflictSetHash !== page.conflictSetHash) throw Object.assign(new Error('plan-stale'), { code: 'plan-stale' })
    if (kind && page.unmigratedSetHash !== task.unmigratedSetHash) throw Object.assign(new Error('plan-stale'), { code: 'plan-stale' })
    if (kind) summary.unavailable.push(...page.entries)
    summary.conflictSetHash = page.conflictSetHash
    summary.blockers = page.blockers?.length || 0
    for (const entry of page.entries || []) {
      summary.total += 1
      if (entry.operation?.includes('conflict') && !entry.decision) summary.unresolved += 1
      if (entry.operation === 'conflict') {
        summary.ordinary += 1
        summary.recoveryBytes += Number(entry.targetFingerprint?.size || 0)
      } else if (entry.operation?.includes('conflict')) summary.structure += 1
      if (entry.operation === 'unmigrated' || entry.decision?.action === 'skip') summary.skipped += 1
    }
    const next = page.nextCursor
    if (next != null && (!Number.isSafeInteger(next) || next <= cursor)) throw Object.assign(new Error('invalid-page'), { code: 'invalid-page' })
    cursor = next
  } while (cursor != null)
  const latest = await request(`${PREFIX}/tasks/${encodeURIComponent(task.id)}`)
  if (!latest.ok) throw requestError(latest)
  if (latest.body.task?.decisionRevision !== task.decisionRevision || latest.body.task?.planHash !== task.planHash || (kind && latest.body.task?.unmigratedSetHash !== task.unmigratedSetHash)) {
    throw Object.assign(new Error('plan-stale'), { code: 'plan-stale' })
  }
  return summary
}

/** Single read/mutation owner. View changes and POST responses invalidate older reads. */
export function createStorageController(request = storageRequest) {
  let state = { status: null, task: null, entries: emptyEntries(), error: null, readError: null, busy: false, loading: true, cursor: 0, kind: '' }
  let generation = 0
  let disposed = false
  let reading = null
  let writing = false
  let view = { cursor: 0, kind: '' }
  let listener = () => {}
  const publish = (patch) => { if (!disposed) { state = { ...state, ...patch }; listener(state) } }
  const get = async (path) => {
    const response = await request(path)
    if (!response.ok) throw requestError(response)
    return response.body
  }
  const refresh = async (force = false) => {
    if (disposed || writing) return
    if (reading) { await reading; return force ? refresh() : undefined }
    const current = generation
    reading = (async () => {
      try {
        const status = await get(PREFIX)
        if (current !== generation || disposed) return
        const changed = status.activeTask !== state.status?.activeTask
        if (changed) view = { cursor: 0, kind: '' }
        publish({ status, ...(changed ? { task: null, entries: emptyEntries(), ...view, loading: true } : {}) })
        if (status.activeTask) {
          const id = encodeURIComponent(status.activeTask)
          const taskResult = await get(`${PREFIX}/tasks/${id}`)
          if (current !== generation || disposed) return
          // Progress must not wait for a potentially slow entry page.
          publish({ task: taskResult.task })
          const query = new URLSearchParams({ limit: '200', cursor: String(view.cursor), kind: view.kind })
          const entries = await get(`${PREFIX}/tasks/${id}/entries?${query}`)
          if (current !== generation || disposed) return
          publish({ entries: { ...emptyEntries(), ...entries }, ...view })
        } else publish({ task: null, entries: emptyEntries(), ...view })
        publish({ loading: false, readError: null })
      } catch (error) {
        if (current === generation) publish({ readError: error, loading: false })
      }
    })()
    try { await reading } finally { reading = null }
  }
  const send = async (path, body = {}) => {
    if (writing || state.busy || disposed) return null
    writing = true
    generation += 1
    publish({ busy: true, error: null })
    let value = null
    try {
      const result = await request(`${PREFIX}${path}`, { method: 'POST', body })
      if (!result.ok) throw requestError(result)
      value = result.body
    } catch (error) { publish({ error }) }
    finally {
      writing = false
      await refresh(true)
      publish({ busy: false })
    }
    return value
  }
  return {
    snapshot: () => state,
    subscribe: (fn) => { listener = fn; return () => { listener = () => {} } },
    refresh, send,
    setView: (next) => {
      generation += 1
      view = { ...view, ...next }
      publish({ ...view, entries: emptyEntries(), loading: true })
      void refresh(true)
    },
    dismissError: () => publish({ error: null }),
    dispose: () => { disposed = true; generation += 1; listener = () => {} },
  }
}

/** Host owns the task; closing this hook only stops observation, never sends pause/cancel. */
export function useStorageTask(open) {
  const controller = useRef(null)
  const [state, setState] = useState({ status: null, task: null, entries: emptyEntries(), error: null, readError: null,
    busy: false, loading: true, cursor: 0, kind: '' })
  useEffect(() => {
    if (!open) return undefined
    const current = createStorageController()
    controller.current = current
    const unsubscribe = current.subscribe(setState)
    void current.refresh()
    const timer = setInterval(() => { if (!current.snapshot().busy) void current.refresh() }, STORAGE_POLL_MS)
    return () => { clearInterval(timer); unsubscribe(); current.dispose(); controller.current = null }
  }, [open])
  return { ...state, refresh: () => controller.current?.refresh(), send: (path, body) => controller.current?.send(path, body),
    setCursor: (cursor) => controller.current?.setView({ cursor }),
    setKind: (kind) => controller.current?.setView({ kind, cursor: 0 }),
    dismissError: () => controller.current?.dismissError() }
}
