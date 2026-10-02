export const PRODUCT_STAGE_EVENT = 'dsh-product-stage'
export const ACTIVE_STAGE_STORAGE_KEY = 'omnimux_active_product_stage'

export interface StageBox {
  top: number
  left: number
  width: number
  height: number
}

export interface StageHostSingleton {
  claim?: (id: string) => void
  release?: (id: string) => void
  readBox?: () => StageBox
}

export interface StageStore {
  getSnapshot: () => boolean
  subscribe: (listener: () => void) => () => void
  open: () => void
  close: () => void
  set: (next: boolean) => void
  readBox: () => StageBox
}

/**
 * Creates an idempotent StageStore for a first-level product page.
 * Manages mutual exclusion with other product stages via `dsh-product-stage` event.
 * @param stageId Unique product stage identifier (e.g. 'omnimux-assets')
 * @param getStage Function resolving the host singleton (defaults to window.__omnimuxStage)
 */
export function createStageStore(
  stageId: string,
  getStage: () => StageHostSingleton | undefined = () =>
    typeof window !== 'undefined' ? (window as unknown as { __omnimuxStage?: StageHostSingleton }).__omnimuxStage : undefined,
): StageStore {
  let open = false
  if (typeof window !== 'undefined') {
    try {
      open = window.localStorage.getItem(ACTIVE_STAGE_STORAGE_KEY) === stageId
    } catch {}
  }

  const listeners = new Set<() => void>()

  function emit() {
    for (const listener of listeners) {
      try {
        listener()
      } catch (err) {
        console.error('StageStore listener error:', err)
      }
    }
  }

  if (open && typeof window !== 'undefined') {
    const restore = () => {
      try {
        const stage = getStage()
        if (stage && typeof stage.claim === 'function') {
          stage.claim(stageId)
        }
      } catch {}
    }
    if (typeof queueMicrotask === 'function') queueMicrotask(restore)
    else setTimeout(restore, 0)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener(PRODUCT_STAGE_EVENT, (event: Event) => {
      const id = event instanceof CustomEvent ? (event.detail?.id as string | undefined) : undefined
      if (id !== stageId && open) {
        open = false
        emit()
      } else if (id === stageId && !open) {
        open = true
        emit()
      }
    })
  }

  const store: StageStore = {
    getSnapshot: () => open,
    readBox() {
      const stage = getStage()
      if (stage && typeof stage.readBox === 'function') {
        return stage.readBox()
      }
      const left = 56
      const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
      const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800
      return {
        top: 0,
        left,
        width: Math.max(8, winWidth - left),
        height: Math.max(8, winHeight),
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set(next: boolean) {
      if (open === next) return
      open = next
      const stage = getStage()
      if (open) {
        stage?.claim?.(stageId)
      } else {
        stage?.release?.(stageId)
      }
      emit()
    },
    open() {
      this.set(true)
    },
    close() {
      this.set(false)
    },
  }

  return store
}
