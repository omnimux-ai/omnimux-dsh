export const ENTRY_SELECTOR = '[data-omnimux-device-entry]'
export const DEVICE_TAB_ID = 'omnimux-device:library'

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="18" r="1" fill="currentColor"/></svg>'

const SIDEBAR_ENTRY_COMMON_STYLES = `
.omnimux-sidebar-nav-entry {
  box-sizing: border-box; display: flex; align-items: center; gap: 6px; position: relative;
  width: calc(100% - 8px); height: 32px; margin: 0 4px; padding: 0 8px;
  border: none; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font: var(--dsw-font-s-14, inherit); font-size: 14px; line-height: 20px;
  cursor: pointer; text-align: left;
}
.omnimux-sidebar-nav-entry[data-hidden="true"],
.omnimux-sidebar-nav-entry.omnimux-sidebar-nav-entry-hidden {
  display: none !important;
}
.omnimux-sidebar-nav-entry:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.06));
}
.omnimux-sidebar-nav-entry[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-active, rgba(255,255,255,0.12));
  font-weight: 500;
}
.omnimux-sidebar-nav-entry-icon {
  flex: none; display: inline-flex; width: 14px; height: 14px; align-items: center; justify-content: center;
}
.omnimux-sidebar-nav-entry-icon svg {
  display: block; width: 14px; height: 14px;
}
.omnimux-sidebar-nav-entry-label {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 20px;
}
`

function resolveLabel(label) {
  return typeof label === 'function' ? label() : label
}

function paintLabel(entry, labelText) {
  entry.setAttribute('aria-label', labelText)
  const node = entry.querySelector('.omnimux-sidebar-nav-entry-label')
  if (node) node.textContent = labelText
}

function registerWhenCoordinatorReady(row) {
  let unregister = () => {}
  let disposed = false
  const attempt = () => {
    if (disposed) return
    const win = typeof window !== 'undefined' ? window.__omnimuxSidebar : undefined
    if (!win || typeof win.register !== 'function') return
    unregister = win.register(row)
    clearInterval(timer)
  }
  const timer = setInterval(attempt, 500)
  attempt()
  return () => {
    disposed = true
    clearInterval(timer)
    unregister()
  }
}

function createSidebarEntry(options) {
  const { id, rank, label, iconSvg, stageStore, locale, customClassName, datasetKey } = options

  const entry = document.createElement('button')
  entry.type = 'button'
  if (datasetKey) {
    entry.setAttribute(datasetKey, '')
  }
  entry.className = `omnimux-sidebar-nav-entry ${customClassName || ''}`.trim()
  entry.innerHTML = `<span class="omnimux-sidebar-nav-entry-icon">${iconSvg}</span><span class="omnimux-sidebar-nav-entry-label"></span>`

  const updateLabel = () => {
    paintLabel(entry, resolveLabel(label))
  }
  updateLabel()

  entry.addEventListener('click', () => {
    stageStore.open()
  })

  const syncActive = () => {
    if (stageStore.getSnapshot()) {
      entry.dataset.active = 'true'
    } else {
      delete entry.dataset.active
    }
  }

  const unsubscribeStage = stageStore.subscribe(syncActive)
  syncActive()

  const unsubscribeLocale = typeof locale?.subscribe === 'function' ? locale.subscribe(updateLabel) : () => {}

  const unregisterCoordinator = registerWhenCoordinatorReady({
    id: `${id}-entry`,
    rank,
    styles: SIDEBAR_ENTRY_COMMON_STYLES,
    styleId: 'omnimux-sidebar-nav-entry-styles',
    create: () => entry,
  })

  return () => {
    unregisterCoordinator()
    unsubscribeStage()
    unsubscribeLocale()
  }
}

function resolveWorkbenchTitle(t) {
  try {
    const val = typeof t === 'function' ? t('nav') : undefined
    if (val && val !== 'nav') return val
  } catch {}
  return '手机管理'
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
    id: 'omnimux-device',
    rank: 3.5,
    label: () => (typeof t === 'function' ? t('nav') : '手机管理'),
    iconSvg: ICON,
    stageStore: createWorkbenchStageStore(t, DEVICE_TAB_ID),
    locale,
    access: 'offline',
    customClassName: 'omnimux-device-entry',
    datasetKey: 'data-omnimux-device-entry',
  })
}
