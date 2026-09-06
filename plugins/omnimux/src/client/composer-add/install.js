import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { AssetPickerModal } from './AssetPickerModal.jsx'
import { getGlobalAttachmentStore } from '../attachments/store.ts'
import { inferKindFromName } from './kind.js'
import { installComposerAttachmentSubmitCapture } from './submit-inject.js'

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

function currentSessionId(store) {
  const id = store.getActiveSessionId?.() || ''
  return id && id !== 'default' ? id : ''
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
  for (const item of items) {
    if (!item || item.ok === false) {
      failed += 1
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
  }
  const parts = []
  if (added) parts.push(tx(t, 'composerAdd.toast.added', { n: added }))
  if (duplicate) parts.push(tx(t, 'composerAdd.toast.duplicate', { n: duplicate }))
  if (quota) parts.push(tx(t, 'composerAdd.toast.quota'))
  if (failed) parts.push(tx(t, 'composerAdd.toast.failed', { n: failed }))
  if (parts.length) toast(parts.join(' · '))
  console.debug('[omnimux:composer-add]', 'add-results', { added, duplicate, quota, failed })
  return { added, duplicate, quota, failed }
}

async function requestJson(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
 * Composer 附件业务侧：资产库 modal、本地文件物化、window 事件监听与
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
  const state = {
    libraryOpen: false,
  }

  const renderModal = () => {
    const sessionId = currentSessionId(store)
    if (!modalRoot) modalRoot = createRoot(host)
    modalRoot.render(createElement(AssetPickerModal, {
      open: state.libraryOpen,
      onClose: () => { state.libraryOpen = false; renderModal() },
      t,
      occupied: sessionId ? store.getSnapshot(sessionId).length : 0,
      alreadyIds: sessionId ? alreadyEntityIds(store, sessionId) : new Set(),
      onConfirm: async (picked) => {
        if (!sessionId) return
        const result = await requestJson('/omnimux/composer/attachments/instantiate', {
          sessionId,
          assetIds: picked.map((row) => row.id),
        })
        const rows = Array.isArray(result.body.results) ? result.body.results : []
        applyAddResults(store, sessionId, rows.map((row) => ({
          ...row,
          entityId: row.entityId || row.sourcePath,
        })), t)
        if (!result.ok && rows.length === 0) {
          toast(result.body.message || tx(t, 'composerAdd.toast.failed', { n: 1 }))
        }
        state.libraryOpen = false
        renderModal()
      },
    }))
  }

  /**
   * @param {string} sessionId
   * @param {'file' | 'directory'} kind
   */
  async function addLocalPaths(sessionId, kind = 'file') {
    if (!sessionId) {
      toast(tx(t, 'composerAdd.needSession'))
      return
    }
    const pickKind = kind === 'directory' ? 'directory' : 'file'
    const picked = await requestJson('/omnimux/assets/pick', { kind: pickKind })
    if (picked.status === 501) {
      toast(tx(t, 'composerAdd.pickerUnsupported'))
      return
    }
    const paths = Array.isArray(picked.body.paths) ? picked.body.paths.filter(Boolean) : []
    if (!picked.ok) {
      toast(picked.body.message || tx(t, 'composerAdd.toast.failed', { n: 1 }))
      return
    }
    if (paths.length === 0) return
    const materialized = await requestJson('/omnimux/composer/attachments/materialize', { sessionId, paths })
    const rows = Array.isArray(materialized.body.results) ? materialized.body.results : []
    applyAddResults(store, sessionId, rows, t)
    if (!materialized.ok && rows.length === 0) {
      toast(materialized.body.message || tx(t, 'composerAdd.toast.failed', { n: 1 }))
    }
  }

  const onKey = (event) => {
    if (event.key !== 'Escape') return
    if (state.libraryOpen) {
      state.libraryOpen = false
      renderModal()
    }
  }

  doc.addEventListener('keydown', onKey)
  const onCmdFile = () => { void addLocalPaths(currentSessionId(store), 'file') }
  const onCmdFolder = () => { void addLocalPaths(currentSessionId(store), 'directory') }
  const onCmdLibrary = () => { state.libraryOpen = true; renderModal() }
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null)
  win?.addEventListener?.('omnimux:composer-add-file', onCmdFile)
  win?.addEventListener?.('omnimux:composer-add-folder', onCmdFolder)
  win?.addEventListener?.('omnimux:composer-add-library', onCmdLibrary)
  renderModal()
  const stopSubmit = installComposerAttachmentSubmitCapture(doc, { store })

  return () => {
    doc.removeEventListener('keydown', onKey)
    win?.removeEventListener?.('omnimux:composer-add-file', onCmdFile)
    win?.removeEventListener?.('omnimux:composer-add-folder', onCmdFolder)
    win?.removeEventListener?.('omnimux:composer-add-library', onCmdLibrary)
    stopSubmit()
    modalRoot?.unmount()
    host.remove()
  }
}
