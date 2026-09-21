import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { AssetPickerModal } from './AssetPickerModal.jsx'
import { ProductPickerModal } from './ProductPickerModal.jsx'
import { InspirationPickerModal } from './InspirationPickerModal.jsx'
import { createComposerAddController } from './controller.js'

function createToast(doc) {
  let toast = null
  let timer
  return {
    show(message) {
      if (!message) return
      toast?.remove()
      doc.defaultView.clearTimeout(timer)
      toast = doc.createElement('div')
      toast.id = 'omnimux-composer-add-toast'
      toast.setAttribute('role', 'status')
      toast.textContent = message
      toast.style.cssText = [
        'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
        'z-index:90', 'padding:8px 12px', 'border-radius:8px',
        'background:var(--dsw-alias-bg-layer-3)', 'color:var(--dsw-alias-label-primary)',
        'border:1px solid var(--dsw-alias-border-l2)', 'font-size:12px', 'pointer-events:none',
      ].join(';')
      doc.body.appendChild(toast)
      timer = doc.defaultView.setTimeout(() => { toast?.remove() }, 3200)
    },
    dispose() {
      doc.defaultView.clearTimeout(timer)
      toast?.remove()
    },
  }
}

function pickerFor(model, t) {
  if (!model) return null
  const shared = { ...model, open: true, t }
  if (model.kind === 'product') return createElement(ProductPickerModal, shared)
  if (model.kind === 'inspiration') return createElement(InspirationPickerModal, shared)
  return createElement(AssetPickerModal, shared)
}

/**
 * Bind the existing pickers to the official selected-session store.
 * @param {Document} doc
 * @param {{
 *   t: (key: string, vars?: object) => string,
 *   store: import('../attachments/store.ts').AttachmentStore,
 *   sessions: { list: { getSnapshot: () => { current?: string }, subscribe: (listener: () => void) => () => void } },
 * }} options
 */
export function installComposerAddCapture(doc, { t, store, sessions }) {
  const host = doc.createElement('div')
  host.id = 'omnimux-composer-add-host'
  doc.body.appendChild(host)
  let root = null
  let focusTarget = null
  const toast = createToast(doc)
  const controller = createComposerAddController({
    t,
    store,
    getCurrentSessionId: () => sessions.list.getSnapshot().current,
    subscribeCurrentSession: listener => sessions.list.subscribe(listener),
    notify: message => toast.show(message),
    onBegin: () => { focusTarget = doc.activeElement },
    restoreFocus: () => {
      if (focusTarget?.isConnected && typeof focusTarget.focus === 'function') focusTarget.focus()
    },
    renderLibrary(model) {
      if (!root && !model) return
      if (!root) root = createRoot(host)
      root.render(pickerFor(model, t))
    },
  })
  return {
    openLibrary(sessionId) {
      controller.openLibrary(sessionId)
    },
    openProduct(sessionId) {
      controller.openProduct(sessionId)
    },
    openInspiration(sessionId) {
      controller.openInspiration(sessionId)
    },
    dispose() {
      controller.dispose()
      root?.unmount()
      host.remove()
      toast.dispose()
    },
  }
}
