/**
 * 任务表单 row under 新会话, placed by the single sidebar coordinator.
 * Consumes standardized createSidebarEntry from dsh-ui-kit with idempotent activation.
 */
import { createSidebarEntry } from 'dsh-ui-kit'

export const ENTRY_SELECTOR = '[data-omnimux-forms-entry]'
export const FORMS_TAB_ID = 'omnimux-forms:tasks'

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid meet"><path fill="currentColor" d="M12.841 15.1L12 13l-.841 2.1L9 15.292l1.64 1.489L10.146 19L12 17.821L13.854 19l-.494-2.219L15 15.292zM6 2h12v2H6zM4 6h16v2H4z"/><path fill="currentColor" d="M20 12v8H4v-8zm0-2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2"/></svg>'



function resolveWorkbenchTitle(t) {
  try {
    const val = typeof t === 'function' ? t('nav') : undefined
    if (val && val !== 'nav') return val
  } catch {}
  return '任务表单'
}

function createWorkbenchStageStore(t, tabId) {
  let store = null
  const ensure = () => {
    if (store) return store
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.createSidebarStore !== 'function') return null
    store = api.createSidebarStore({
      tabId,
      title: () => resolveWorkbenchTitle(t),
    })
    return store
  }
  return {
    getSnapshot() {
      return Boolean(ensure()?.getSnapshot?.())
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {}
      const ready = ensure()
      if (ready && typeof ready.subscribe === 'function') return ready.subscribe(listener)
      let unsub = () => {}
      const started = Date.now()
      const timer = setInterval(() => {
        const next = ensure()
        if (next && typeof next.subscribe === 'function') {
          clearInterval(timer)
          unsub = next.subscribe(listener)
          listener()
          return
        }
        if (Date.now() - started > 8000) clearInterval(timer)
      }, 50)
      return () => {
        clearInterval(timer)
        unsub()
      }
    },
    open() {
      const s = ensure()
      if (!s) return
      s.open()
    },
    close() {
      ensure()?.close?.()
    },
    set(next) {
      if (next) this.open()
      else this.close()
    },
    readBox() {
      return ensure()?.readBox?.() || { top: 0, left: 0, width: 0, height: 0 }
    },
  }
}


export function mountSidebarEntry(_stage, t, locale) {
  return createSidebarEntry({
    id: 'omnimux-forms',
    rank: 11,
    label: () => t('nav'),
    iconSvg: ICON,
    stageStore: createWorkbenchStageStore(t, FORMS_TAB_ID),
    locale,
    access: 'offline',
    customClassName: 'omnimux-forms-entry',
    datasetKey: 'data-omnimux-forms-entry',
  })
}
