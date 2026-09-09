import { queueSessionPrefill } from './session-prefill.js'

/** Hub-owned client adapter; injected official services are the only session authority. */
export function createFormsBridge({ sessions, workspaces, store, request = jsonRequest, upload = uploadFile, window: win = globalThis.window, uuid = () => crypto.randomUUID(), prefill = queueSessionPrefill }) {
  const operations = new Map()
  let busy = false
  const storage = win?.sessionStorage
  const storageKey = requestId => `omnimux-form-handoff:${requestId}`
  function save(requestId, state) {
    storage?.setItem(storageKey(requestId), JSON.stringify({ fingerprint: state.fingerprint, sessionId: state.sessionId, created: state.created, resumeOwnPrompt: state.resumeOwnPrompt === true }))
  }
  function getWorkspace() {
    const snapshot = sessions.list.getSnapshot()
    const items = workspaces.list.getSnapshot().items
    const current = items.find(row => row.sessionIds.includes(snapshot.current))
    const row = current || (items.length === 1 ? items[0] : null)
    return row ? { id: row.workspaceId, title: row.title } : null
  }
  function subscribeWorkspace(listener) {
    const stops = [sessions.list.subscribe(listener), workspaces.list.subscribe(listener)]
    return () => stops.forEach(stop => stop())
  }
  function getFileUrl({ workspaceId, assetId }) {
    return `/omnimux/forms/attachments/file?${new URLSearchParams({ workspaceId, assetId })}`
  }
  async function resolveFiles(input) { return (await request('/resolve', input)).files }
  function prepareDraft(input) {
    const { requestId, workspaceId, prompt, assetIds } = input
    if (!requestId || !workspaceId || typeof prompt !== 'string' || !prompt.trim() || !Array.isArray(assetIds)) return Promise.resolve({ ok: false, error: 'invalid-request' })
    const fingerprint = JSON.stringify({ workspaceId, prompt, assetIds })
    let state = operations.get(requestId)
    if (!state && storage) {
      try { state = JSON.parse(storage.getItem(storageKey(requestId)) || 'null') } catch { return Promise.resolve({ ok: false, error: 'handoff-state-invalid' }) }
    }
    if (state && state.fingerprint !== fingerprint) return Promise.resolve({ ok: false, error: 'request-conflict' })
    if (state?.result?.ok) return Promise.resolve(state.result)
    if (state?.promise) return state.promise
    if (busy) return Promise.resolve({ ok: false, error: 'composer-busy' })
    state ||= { fingerprint, sessionId: uuid(), created: false }
    try { save(requestId, state) } catch { return Promise.resolve({ ok: false, error: 'handoff-storage-unavailable' }) }
    operations.set(requestId, state)
    busy = true
    state.promise = run().catch(error => ({ ok: false, error: error.message || 'handoff-failed' })).finally(() => { state.promise = null; busy = false })
    return state.promise
    async function run() {
      if (getWorkspace()?.id !== workspaceId) throw new Error('workspace-changed')
      await resolveFiles({ workspaceId, assetIds })
      if (getWorkspace()?.id !== workspaceId) throw new Error('workspace-changed')
      if (!state.created) {
        const id = await sessions.create({ workspaceId, sessionId: state.sessionId })
        if (id !== state.sessionId) throw new Error('session-identity-mismatch')
        state.created = true
        save(requestId, state)
      }
      const files = (await request('/materialize', { requestId, workspaceId, sessionId: state.sessionId, assetIds })).files
      if (getWorkspace()?.id !== workspaceId) throw new Error('workspace-changed')
      sessions.open(state.sessionId)
      win?.__omnimuxWorkbench?.setConversationCollapsed?.(false)
      win?.__omnimuxWorkbench?.setFocus?.('split')
      const result = await prefill({ targetSessionId: state.sessionId, prompt, requireReadback: true,
        resumeOwnPrompt: state.resumeOwnPrompt === true,
        onDraftWritten() { state.resumeOwnPrompt = true; save(requestId, state) },
        attach() {
        // An existing native or hub draft is never supplemented by this operation.
        if (store.getSnapshot(state.sessionId).length > 0) return { ok: false, reason: 'draft-protected' }
        const added = []
        const rollback = () => added.forEach(id => store.removeAttachment(state.sessionId, id))
        for (const file of files) {
          const result = store.addAttachment(state.sessionId, {
            sourcePlugin: 'omnimux-forms', kind: file.kind, entityId: file.assetId,
            title: file.name, relativePath: file.relativePath,
            previewUrl: getFileUrl({ workspaceId, assetId: file.assetId }),
          })
          if (!result.ok) { rollback(); return result }
          added.push(result.attachment.id)
        }
        return { ok: true, rollback }
      } })
      state.result = result.ok ? { ok: true, sessionId: state.sessionId } : result
      return state.result
    }
  }
  return { getWorkspace, subscribeWorkspace, getFileUrl, resolveFiles, prepareDraft,
    importFile: (file, options) => upload(file, options) }
}

async function jsonRequest(path, body) {
  const response = await fetch(`/omnimux/forms/attachments${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'attachment-request-failed')
  return data
}
function uploadFile(file, { workspaceId, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/omnimux/forms/attachments/import?${new URLSearchParams({ workspaceId, name: file.name })}`)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = event => onProgress?.(event.lengthComputable ? event.loaded / event.total : 0)
    xhr.onerror = () => reject(new Error('upload-failed'))
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status < 200 || xhr.status >= 300) throw new Error(data.error || 'upload-failed')
        resolve(data)
      } catch (error) { reject(error) }
    }
    xhr.send(file)
  })
}
