import { createComposerAddController } from './controller.js'
import { LIBRARY_STAGE_PROMPT_EVENT } from './library-stage-model.js'

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
      // 废除旧全屏 LibraryBrowser 覆盖层，改由右栏 AssetHubPanel 承载
      // 避免 owner 操作者残留：三栏架构下由右栏原生工作台接管交互，主动释放旧 operation 占位
      if (model && typeof model.onClose === 'function') {
        model.onClose()
      }
    },
    onPrompt(prompt) {
      const sessionId = sessions.list.getSnapshot().current
      doc.defaultView?.dispatchEvent(new doc.defaultView.CustomEvent(LIBRARY_STAGE_PROMPT_EVENT, {
        detail: { prompt, sessionId },
      }))
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
      toast.dispose()
    },
  }
}
