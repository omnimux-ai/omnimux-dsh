import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { AssetPickerModal } from './AssetPickerModal.jsx'
import { LocalPathPicker } from '../components/local-path-picker/LocalPathPicker.jsx'
import { createPathImporter } from './path-import.js'
import { getGlobalAttachmentStore } from '../attachments/store.ts'
import { inferKindFromName, MAX_ATTACHMENTS } from './kind.js'
import { installComposerAttachmentSubmitCapture } from './submit-inject.js'
import { registerComposerAddCommands } from './commands.js'
import { notifyClientActionRuntimeUpdateOnce } from './client-action-runtime-notice.js'
import { createPickerActionController } from './picker-action.js'

const HOST_ID = 'omnimux-composer-add-host'

function interpolate(template, vars) {
  if (!vars || typeof template !== 'string') return template
  return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] == null ? '' : String(vars[key])))
}

function toast(message) {
  if (!message) return
  console.debug('[omnimux:composer-add]', message)
  if (typeof document === 'undefined') return
  const existing = document.getElementById('omnimux-composer-add-toast')
  if (existing) existing.remove()
  const node = document.createElement('div')
  node.id = 'omnimux-composer-add-toast'
  node.setAttribute('role', 'status')
  node.textContent = message
  node.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:90',
    'padding:8px 12px',
    'border-radius:8px',
    'background:var(--dsw-alias-bg-layer-3)',
    'color:var(--dsw-alias-label-primary)',
    'border:1px solid var(--dsw-alias-border-l2)',
    'font-size:12px',
    'pointer-events:none',
  ].join(';')
  document.body.appendChild(node)
  window.setTimeout(() => { node.remove() }, 3200)
}

function tx(t, key, vars) {
  const raw = t(key, vars)
  return interpolate(typeof raw === 'string' && raw ? raw : key, vars)
}

function alreadyEntityIds(store, sessionId) {
  return new Set(
    store.getSnapshot(sessionId).map((row) => row.entityId).filter(Boolean),
  )
}

function applyAddResults(store, sessionId, items, t) {
  let added = 0
  let duplicate = 0
  let quota = 0
  let failed = 0
  const outcomes = []
  for (const item of items) {
    if (!item || item.ok === false) {
      failed += 1
      outcomes.push(item)
      continue
    }
    const result = store.addAttachment(sessionId, {
      sourcePlugin: 'omnimux',
      kind: item.kind || inferKindFromName(item.title, item.relativePath),
      entityId: item.entityId || item.relativePath,
      title: item.title,
      extension: item.extension,
      relativePath: item.relativePath,
      previewUrl: item.previewUrl,
      metadata: item.files ? { files: item.files } : undefined,
    })
    if (result.ok) added += 1
    else if (result.reason === 'duplicate') duplicate += 1
    else if (result.reason === 'quota-exceeded') quota += 1
    else failed += 1
    outcomes.push(result.ok || result.reason === 'duplicate' ? item : {
      ...item,
      ok: false,
      message: tx(t, result.reason === 'quota-exceeded' ? 'composerAdd.toast.quota' : 'composerAdd.toast.failed', { n: 1 }),
    })
  }
  const parts = []
  if (added) parts.push(tx(t, 'composerAdd.toast.added', { n: added }))
  if (duplicate) parts.push(tx(t, 'composerAdd.toast.duplicate', { n: duplicate }))
  if (quota) parts.push(tx(t, 'composerAdd.toast.quota'))
  if (failed) parts.push(tx(t, 'composerAdd.toast.failed', { n: failed }))
  if (parts.length) toast(parts.join(' · '))
  console.debug('[omnimux:composer-add]', 'add-results', { added, duplicate, quota, failed })
  return { added, duplicate, quota, failed, outcomes }
}

async function requestJson(path, body, signal) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  let json = {}
  try { json = await response.json() } catch { json = {} }
  return { ok: response.ok, status: response.status, body: json }
}

function ensureHost(doc) {
  let host = doc.getElementById(HOST_ID)
  if (host) return host
  host = doc.createElement('div')
  host.id = HOST_ID
  doc.body.appendChild(host)
  return host
}

/**
 * Composer 附件业务侧：资产库与本地路径面板、文件物化与
 * 提交拦截。「+」菜单入口由 commands.js 通过官方 commandUi.register
 * 贡献（合并进原生命令列表），这里不再拦截任何官方按钮。
 *
 * @param {Document | null} doc
 * @param {{ t: (key: string, vars?: object) => string, store?: object }} options
 */
export function installComposerAddCapture(doc = (typeof document !== 'undefined' ? document : null), options = {}) {
  if (!doc || typeof doc.addEventListener !== 'function') return () => {}
  const t = typeof options.t === 'function' ? options.t : (key) => key
  const store = options.store || getGlobalAttachmentStore()
  const host = ensureHost(doc)
  let modalRoot = null
  const pickerActions = createPickerActionController()

  const closePickerAction = (action) => {
    if (!pickerActions.settle(action)) return false
    renderModal()
    return true
  }

  const renderModal = () => {
    const action = pickerActions.current()
    if (!modalRoot) modalRoot = createRoot(host)
    if (!action) {
      modalRoot.render(null)
      return
    }
    const { sessionId } = action
    const owned = () => !action.signal.aborted && pickerActions.isCurrent(action)
    const common = {
      key: `picker-action-${pickerActions.revision()}`,
      onClose: () => { closePickerAction(action) },
      t: (key, vars) => tx(t, key, vars),
    }
    if (action.kind === 'paths') {
      action.importPaths ??= createPathImporter({
        materialize: async (paths) => {
          const result = await requestJson('/omnimux/composer/attachments/materialize', {
            sessionId, paths,
          }, action.requestSignal)
          const rows = Array.isArray(result.body.results) ? result.body.results : []
          if (rows.length === 0) {
            throw new Error(result.body.message || tx(t, 'composerAdd.toast.failed', { n: paths.length }))
          }
          return rows
        },
        adopt: (rows) => applyAddResults(store, sessionId, rows, t).outcomes,
        isCurrent: owned,
      })
      modalRoot.render(createElement(LocalPathPicker, {
        ...common,
        remaining: Math.max(0, MAX_ATTACHMENTS - store.getSnapshot(sessionId).length),
        onConfirm: async (paths) => {
          if (!owned()) return null
          const remaining = MAX_ATTACHMENTS - store.getSnapshot(sessionId).length
          if (paths.length > remaining) throw new Error(tx(t, 'composerAdd.toast.quota'))
          const failed = await action.importPaths(paths)
          if (!failed) return null
          if (failed.remainingPaths.length === 0) closePickerAction(action)
          return failed
        },
      }))
      return
    }
    modalRoot.render(createElement(AssetPickerModal, {
      ...common,
      open: true,
      occupied: store.getSnapshot(sessionId).length,
      alreadyIds: alreadyEntityIds(store, sessionId),
      onConfirm: async (picked) => {
        if (!owned()) return
        const result = await requestJson('/omnimux/composer/attachments/instantiate', {
          sessionId,
          assetIds: picked.map((row) => row.id),
        }, action.requestSignal)
        if (!owned()) return
        const rows = Array.isArray(result.body.results) ? result.body.results : []
        applyAddResults(store, sessionId, rows.map((row) => ({
          ...row,
          entityId: row.entityId || row.sourcePath,
        })), t)
        if (!result.ok && rows.length === 0) {
          const message = result.body.message || tx(t, 'composerAdd.toast.failed', { n: 1 })
          toast(message)
          throw new Error(message)
        }
        closePickerAction(action)
      },
    }))
  }

  const onKey = (event) => {
    if (event.key === 'Escape') closePickerAction(pickerActions.current())
  }
  doc.addEventListener('keydown', onKey)

  const openPicker = (kind, sessionId, signal, restoreComposerFocus, registrationSignal) => new Promise((resolve) => {
    const actionSignal = AbortSignal.any([signal, registrationSignal])
    if (!sessionId || actionSignal.aborted) {
      resolve()
      return
    }
    const requestController = new AbortController()
    const closeIfCurrent = () => { closePickerAction(action) }
    const action = pickerActions.start({
      kind,
      sessionId,
      signal: actionSignal,
      requestSignal: AbortSignal.any([actionSignal, requestController.signal]),
      restoreComposerFocus,
      resolve: () => {
        actionSignal.removeEventListener('abort', closeIfCurrent)
        requestController.abort()
        resolve()
      },
    })
    actionSignal.addEventListener('abort', closeIfCurrent, { once: true })
    renderModal()
  })
  const onAddFile = (...args) => openPicker('paths', ...args)
  const onAddLibrary = (...args) => openPicker('library', ...args)
  registerComposerAddCommands(options.ctx || {}, {
    t,
    onAddFile,
    onAddLibrary,
    onClientActionUnavailable: () => {
      notifyClientActionRuntimeUpdateOnce({
        storage: () => doc.defaultView?.localStorage,
        notify: () => toast(tx(t, 'composerAdd.runtimeUpdateRequired')),
      })
    },
  })
  renderModal()
  const stopSubmit = installComposerAttachmentSubmitCapture(doc, { store })

  return () => {
    doc.removeEventListener('keydown', onKey)
    closePickerAction(pickerActions.current())
    stopSubmit()
    modalRoot?.unmount()
    host.remove()
  }
}
