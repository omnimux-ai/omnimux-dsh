/** Shared open state for the sidebar Apps entry and the center stage. */

import { PRODUCT_STAGE_EVENT, claimProductStage, releaseProductStage } from './conversation-box.js'

const STAGE_ID = 'omnimux-apps'

export function createAppsStore() {
  let open = false
  try {
    open = window.localStorage.getItem('omnimux_active_product_stage') === STAGE_ID
  } catch {}

  const listeners = new Set()

  function emit() {
    for (const listener of listeners) listener()
  }

  if (open) {
    const restore = () => {
      try {
        if (typeof document !== 'undefined' && typeof document.querySelector === 'function' && !document.querySelector('.omnimux-apps-stage')) {
          try { window.localStorage?.removeItem('omnimux_active_product_stage') } catch {}
          open = false
          return
        }
        claimProductStage(STAGE_ID)
      } catch {}
    }
    if (typeof queueMicrotask === 'function') queueMicrotask(restore)
    else setTimeout(restore, 0)
  }

  window.addEventListener(PRODUCT_STAGE_EVENT, (event) => {
    const id = event instanceof CustomEvent ? event.detail?.id : undefined
    if (id !== STAGE_ID && open) {
      open = false
      emit()
    } else if (id === STAGE_ID && !open) {
      open = true
      emit()
    }
  })

  return {
    getSnapshot: () => open,
    /**
     * @param {() => void} listener
     */
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    /**
     * @param {boolean} next
     */
    set(next) {
      if (open === next) return
      open = next
      if (open) claimProductStage(STAGE_ID)
      else releaseProductStage(STAGE_ID)
      emit()
    },
    toggle() {
      this.set(!open)
    },
  }
}
