import { inferKindFromName, MAX_ATTACHMENTS } from './kind.js'

/**
 * @typedef {import('../attachments/store.ts').AttachmentStore} AttachmentStore
 * @typedef {{ ok: boolean, status: number, body: object }} JsonResponse
 * @typedef {{ id: number, sessionId: string, kind: 'library', importing: boolean, selection: AbortController }} Operation
 */

/** Reads JSON through the Host attachment seam without assuming a response shape. */
export async function requestComposerJson(path, body, signal) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  })
  const json = await response.json()
  if (!json || typeof json !== 'object') throw new Error('Invalid attachment response')
  return { ok: response.ok, status: response.status, body: json }
}

/**
 * Own one visible adding operation while admitted imports retain their session.
 * @param {{
 *   store: AttachmentStore,
 *   getCurrentSessionId: () => string | undefined,
 *   subscribeCurrentSession: (listener: () => void) => () => void,
 *   t: (key: string, vars?: object) => string,
 *   notify: (message: string) => void,
 *   renderLibrary: (model: object | null) => void,
 *   request?: (path: string, body: object, signal?: AbortSignal) => Promise<JsonResponse>,
 *   onBegin?: () => void,
 *   restoreFocus?: (sessionId: string) => void,
 * }} options
 */
export function createComposerAddController(options) {
  const { store, getCurrentSessionId, t, notify, renderLibrary } = options
  const request = options.request || requestComposerJson
  let disposed = false
  let revision = 0
  const importingSessions = new Set()
  /** @type {Operation | null} */
  let owner = null
  let stopAttachments = () => {}

  const text = (key, vars) => t(key, vars).replace(/\{(\w+)\}/g, (match, name) => (
    vars?.[name] == null ? match : String(vars[name])
  ))
  const visible = (operation) => !disposed && owner === operation
    && getCurrentSessionId() === operation.sessionId
  const rowsFor = (sessionId) => store.getSnapshot(sessionId)
  const entityIds = (sessionId) => new Set(rowsFor(sessionId).map(row => row.entityId).filter(Boolean))

  function summary(counts) {
    const parts = []
    if (counts.added) parts.push(text('composerAdd.toast.added', { n: counts.added }))
    if (counts.duplicate) parts.push(text('composerAdd.toast.duplicate', { n: counts.duplicate }))
    if (counts.quota) parts.push(text('composerAdd.toast.quota'))
    if (counts.failed) parts.push(text('composerAdd.toast.failed', { n: counts.failed }))
    return parts.join(' · ')
  }

  function close(operation, focus = false) {
    if (owner !== operation) return
    const restore = focus && visible(operation)
    operation.selection.abort()
    stopAttachments()
    stopAttachments = () => {}
    owner = null
    renderLibrary(null)
    if (restore) options.restoreFocus?.(operation.sessionId)
  }

  function render(operation) {
    if (!visible(operation)) return
    renderLibrary({
      key: operation.id,
      occupied: rowsFor(operation.sessionId).length,
      alreadyIds: entityIds(operation.sessionId),
      onClose: () => close(operation, true),
      onConfirm: (picked) => confirmLibrary(operation, picked),
    })
  }

  function begin(sessionId) {
    if (disposed) return null
    if (!sessionId || sessionId === 'default') {
      notify(text('composerAdd.needSession'))
      return null
    }
    if (getCurrentSessionId() !== sessionId) return null
    if (owner || importingSessions.has(sessionId)) {
      notify(text('composerAdd.busy'))
      return null
    }
    if (rowsFor(sessionId).length >= MAX_ATTACHMENTS) {
      notify(text('composerAdd.toast.quota'))
      return null
    }
    const operation = { id: ++revision, sessionId, kind: 'library', importing: false, selection: new AbortController() }
    owner = operation
    options.onBegin?.()
    stopAttachments = store.subscribe(sessionId, () => render(operation))
    return operation
  }

  function addResults(operation, items, counts) {
    if (disposed) return counts
    const known = entityIds(operation.sessionId)
    for (const item of items) {
      if (!item || item.ok !== true) {
        counts.failed += 1
        continue
      }
      const id = item.entityId || item.sourcePath
      if (id && known.has(id)) {
        counts.duplicate += 1
        continue
      }
      const metadata = {
        ...(Array.isArray(item.files) ? { files: item.files } : {}),
      }
      const result = store.addAttachment(operation.sessionId, {
        sourcePlugin: 'omnimux',
        kind: item.kind || inferKindFromName(item.title, item.relativePath),
        entityId: id || item.relativePath,
        title: item.title,
        extension: item.extension,
        relativePath: item.relativePath,
        previewUrl: item.previewUrl,
        metadata,
      })
      if (result.ok) {
        counts.added += 1
        if (id) known.add(id)
      } else if (result.reason === 'duplicate') counts.duplicate += 1
      else if (result.reason === 'quota-exceeded') counts.quota += 1
      else counts.failed += 1
    }
    return counts
  }

  async function confirmLibrary(operation, picked) {
    if (!visible(operation) || operation.importing) return
    const known = entityIds(operation.sessionId)
    const remaining = Math.max(0, MAX_ATTACHMENTS - rowsFor(operation.sessionId).length)
    const assetIds = [...new Set(picked.map(row => row.id))].filter(id => !known.has(id)).slice(0, remaining)
    if (!assetIds.length) throw new Error(text('composerAdd.toast.quota'))
    operation.importing = true
    importingSessions.add(operation.sessionId)
    try {
      const response = await request('/omnimux/composer/attachments/instantiate', {
        sessionId: operation.sessionId, assetIds,
      })
      if (!Array.isArray(response.body.results)) {
        throw new Error(text('composerAdd.invalidResponse'))
      }
      const items = response.body.results
      const counts = addResults(operation, items, { added: 0, duplicate: 0, quota: 0, failed: 0 })
      if (!visible(operation)) return
      if (!counts.added && !counts.duplicate) {
        const failed = items.find(item => item?.ok === false)
        throw new Error(failed?.message || response.body.message || summary(counts) || text('composerAdd.toast.failed', { n: 1 }))
      }
      notify(summary(counts))
      close(operation, true)
    } finally {
      operation.importing = false
      importingSessions.delete(operation.sessionId)
    }
  }

  const stopSession = options.subscribeCurrentSession(() => {
    if (owner && getCurrentSessionId() !== owner.sessionId) close(owner)
  })

  return {
    openLibrary(sessionId) {
      const operation = begin(sessionId)
      if (operation) render(operation)
    },
    dispose() {
      if (disposed) return
      if (owner) close(owner)
      disposed = true
      stopSession()
    },
  }
}
