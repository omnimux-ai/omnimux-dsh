import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createComposerAddController } from './controller.js'
import { LIBRARY_STAGE_EVENT } from './library-stage-model.js'
import { LibraryBrowser } from '../session-guide/LibraryBrowser.jsx'

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
      root.render(null)
      const stageEvent = new doc.defaultView.CustomEvent(LIBRARY_STAGE_EVENT, { detail: model, cancelable: true })
      doc.defaultView.dispatchEvent(stageEvent)
      doc.defaultView.setTimeout(() => {
        if (!model) {
          root?.render(null)
          return
        }
        if (stageEvent.defaultPrevented || doc.querySelector('[data-omnimux-library-stage]')) return
        root.render(createElement(LibraryBrowser, { model, t }))
      }, 0)
    },
    onPrompt(prompt) {
      doc.defaultView?.dispatchEvent(new CustomEvent('omnimux:library-stage:prompt', { detail: { prompt } }))
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
