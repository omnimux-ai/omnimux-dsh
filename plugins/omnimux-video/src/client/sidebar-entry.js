/**
 * Google Vids (Veo) 视频生成侧边栏入口行与内测标记 (Under 新会话, Rank 7.5)
 * 遵循 docs/prd/google-vids-sidebar-entry.prd.md 与 specs/google-vids-sidebar-entry.spec.md
 */

import { GOOGLE_VIDS_SIDEBAR_I18N } from './locales.js'

export { GOOGLE_VIDS_SIDEBAR_I18N }
export const ENTRY_SELECTOR = '[data-omnimux-google-vids-entry]'
export const GOOGLE_VIDS_TAB_ID = 'omnimux-video:google-vids'

const SVG_NS = 'http://www.w3.org/2000/svg'
const COORDINATOR_TIMEOUT_MS = 10000

function createGoogleVidsIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('role', 'presentation')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')

  const rect = document.createElementNS(SVG_NS, 'rect')
  rect.setAttribute('x', '2')
  rect.setAttribute('y', '2.5')
  rect.setAttribute('width', '12')
  rect.setAttribute('height', '11')
  rect.setAttribute('rx', '2.5')
  rect.setAttribute('stroke', 'currentColor')
  rect.setAttribute('stroke-width', '1.3')

  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', 'M6.5 5.5l4 2.5-4 2.5v-5z')
  path.setAttribute('fill', 'currentColor')

  svg.append(rect, path)
  return svg
}

const STYLES = `
.omnimux-sidebar-nav-entry {
  box-sizing: border-box; display: flex; align-items: center; gap: 6px; position: relative;
  width: calc(100% - 8px); height: 32px; margin: 0 4px; padding: 0 8px;
  border: none; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font: var(--dsw-font-s-14, inherit); font-size: 14px; line-height: 20px;
  cursor: pointer; text-align: left;
}
.omnimux-sidebar-nav-entry:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.12));
}
.omnimux-sidebar-nav-entry[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-active, rgba(128, 128, 128, 0.18));
  font-weight: 500;
}
.omnimux-sidebar-nav-entry-icon {
  flex: none; display: inline-flex; width: 14px; height: 14px; align-items: center; justify-content: center;
}
.omnimux-sidebar-nav-entry svg {
  display: block; width: 14px; height: 14px;
}
.omnimux-sidebar-nav-entry-label {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 20px;
}
.omnimux-sidebar-alpha-badge {
  margin-left: auto; flex: none; padding: 0 5px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.2));
  border-radius: 4px;
  color: var(--dsw-alias-label-secondary, inherit);
  font-size: 12px; line-height: 16px; font-weight: 400;
  white-space: nowrap;
}
[data-sidebar-collapsed] [data-omnimux-google-vids-entry] {
  width: 36px;
  min-width: 36px;
  padding: 0;
  justify-content: center;
}
[data-sidebar-collapsed] [data-omnimux-google-vids-entry] .omnimux-sidebar-nav-entry-label,
[data-sidebar-collapsed] [data-omnimux-google-vids-entry] .omnimux-sidebar-alpha-badge {
  display: none !important;
}
`

function resolveText(t, key, fallback) {
  if (typeof t === 'function') {
    try {
      const res = t(key)
      if (res && res !== key) return res
    } catch {}
  }
  return fallback
}

function resolveLocaleCurrent(locale) {
  if (!locale) return 'en'
  if (typeof locale === 'string') return locale.startsWith('zh') ? 'zh' : 'en'
  if (typeof locale.get === 'function') {
    const val = locale.get()
    return typeof val === 'string' && val.startsWith('zh') ? 'zh' : 'en'
  }
  if (typeof locale.current === 'string') {
    return locale.current.startsWith('zh') ? 'zh' : 'en'
  }
  return 'en'
}

export function createGoogleVidsStageStore(t) {
  let store = null
  let boundWorkbench = null
  const ensure = () => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (store && boundWorkbench === api) return store
    if (store) {
      try { store?.dispose?.() } catch {}
      try { store?.destroy?.() } catch {}
      store = null
    }
    if (!api || typeof api.createSidebarStore !== 'function') {
      boundWorkbench = null
      return null
    }
    boundWorkbench = api
    store = api.createSidebarStore({
      tabId: GOOGLE_VIDS_TAB_ID,
      title: () => resolveText(t, 'workbench.google_vids.tab', 'Google Vids'),
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
      let disposed = false
      const started = Date.now()
      const timer = setInterval(() => {
        if (disposed) { clearInterval(timer); return }
        const next = ensure()
        if (next && typeof next.subscribe === 'function') {
          clearInterval(timer)
          const sub = next.subscribe(listener)
          if (disposed) {
            if (typeof sub === 'function') sub()
            return
          }
          unsub = typeof sub === 'function' ? sub : () => {}
          listener()
          return
        }
        if (Date.now() - started >= COORDINATOR_TIMEOUT_MS) clearInterval(timer)
      }, 200)
      return () => {
        disposed = true
        clearInterval(timer)
        unsub()
      }
    },
    open() {
      ensure()?.open?.()
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

function registerWhenCoordinatorReady(row) {
  let unregister = () => {}
  let disposed = false
  let registered = false
  const started = Date.now()
  let timer = null

  const attempt = () => {
    if (disposed || registered) return
    const win = typeof window !== 'undefined' ? window.__omnimuxSidebar : undefined
    if (win && typeof win.register === 'function') {
      try {
        const ret = win.register(row)
        registered = true
        unregister = typeof ret === 'function' ? ret : () => {}
        if (timer) clearInterval(timer)
        return
      } catch (err) {
        if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
          console.warn('[omnimux-video] sidebar coordinator register failed:', err)
        }
      }
    }
    if (Date.now() - started >= COORDINATOR_TIMEOUT_MS) {
      if (timer) clearInterval(timer)
    }
  }

  attempt()
  if (!registered) {
    timer = setInterval(attempt, 500)
  }

  return () => {
    disposed = true
    if (timer) clearInterval(timer)
    unregister()
  }
}

/**
 * 挂载 Google Vids 侧边栏行
 * @param {(key: string) => string} [t]
 * @param {{ subscribe?: (fn: () => void) => () => void, get?: () => string, current?: string }} [locale]
 * @param {{ subscribe?: (fn: () => void) => () => void, get?: () => string, current?: string }} [_legacyLocale]
 * @returns {() => void} 销毁注销函数
 */
export function mountSidebarEntry(t, locale, _legacyLocale) {
  let resolvedT = t
  let resolvedLocale = locale
  if (typeof t !== 'function' && typeof locale === 'function') {
    resolvedT = locale
    resolvedLocale = _legacyLocale
  }
  if (typeof resolvedT !== 'function') resolvedT = (k) => k
  if (typeof document === 'undefined') return () => {}
  const stageStore = createGoogleVidsStageStore(resolvedT)

  const entry = document.createElement('button')
  entry.type = 'button'
  entry.setAttribute('data-omnimux-google-vids-entry', '')
  entry.setAttribute('data-tab-id', GOOGLE_VIDS_TAB_ID)
  entry.className = 'omnimux-sidebar-nav-entry omnimux-google-vids-entry'

  const iconSpan = document.createElement('span')
  iconSpan.className = 'omnimux-sidebar-nav-entry-icon'
  iconSpan.setAttribute('aria-hidden', 'true')
  iconSpan.appendChild(createGoogleVidsIcon())

  const labelSpan = document.createElement('span')
  labelSpan.className = 'omnimux-sidebar-nav-entry-label'

  const badgeSpan = document.createElement('span')
  badgeSpan.className = 'omnimux-sidebar-alpha-badge'

  entry.append(iconSpan, labelSpan, badgeSpan)

  const updateTexts = () => {
    const lang = resolveLocaleCurrent(resolvedLocale)
    const dict = GOOGLE_VIDS_SIDEBAR_I18N[lang] || GOOGLE_VIDS_SIDEBAR_I18N.en
    const labelText = resolveText(resolvedT, 'sidebar.google_vids.nav', dict['sidebar.google_vids.nav'])
    const badgeText = resolveText(resolvedT, 'sidebar.google_vids.badge', dict['sidebar.google_vids.badge'])
    const tooltipText = resolveText(resolvedT, 'sidebar.google_vids.tooltip', dict['sidebar.google_vids.tooltip'])

    labelSpan.textContent = labelText
    badgeSpan.textContent = badgeText
    badgeSpan.setAttribute('aria-label', badgeText)
    entry.title = tooltipText
    entry.setAttribute('aria-label', tooltipText)
  }

  updateTexts()

  const handleClick = () => {
    try {
      if (typeof window !== 'undefined' && window.__omnimuxStage && typeof window.__omnimuxStage.claim === 'function') {
        window.__omnimuxStage.claim('omnimux-vids')
      }
    } catch {}
    try {
      if (typeof window !== 'undefined' && window.__omnimuxWorkbench && typeof window.__omnimuxWorkbench.open === 'function') {
        window.__omnimuxWorkbench.open({ tabId: 'omnimux-clip:studio', title: '视频剪辑' })
      }
    } catch {}
    try {
      if (typeof window !== 'undefined' && window.__omnimuxWorkbench && typeof window.__omnimuxWorkbench.setFocus === 'function') {
        window.__omnimuxWorkbench.setFocus('split')
      }
    } catch {}
  }
  entry.addEventListener('click', handleClick)

  const syncActive = () => {
    const isStageActive = typeof document !== 'undefined' && document.documentElement?.dataset?.dshProductStage === 'omnimux-vids'
    if (isStageActive) {
      entry.dataset.active = 'true'
    } else {
      delete entry.dataset.active
    }
  }

  const unsubscribeStage = stageStore.subscribe(syncActive)
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('dsh-product-stage', syncActive)
  }
  syncActive()

  const rawUnsub = typeof resolvedLocale?.subscribe === 'function' ? resolvedLocale.subscribe(updateTexts) : undefined
  const unsubscribeLocale = typeof rawUnsub === 'function' ? rawUnsub : () => {}

  const unregisterCoordinator = registerWhenCoordinatorReady({
    id: 'omnimux-video-google-vids-entry',
    rank: 7.5,
    styles: STYLES,
    styleId: 'omnimux-video-google-vids-styles',
    create: () => entry,
  })

  return () => {
    if (typeof entry?.removeEventListener === 'function') {
      entry.removeEventListener('click', handleClick)
    }
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('dsh-product-stage', syncActive)
    }
    unregisterCoordinator()
    unsubscribeStage()
    unsubscribeLocale()
    if (typeof entry?.remove === 'function') {
      entry.remove()
    }
  }
}
