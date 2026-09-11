/**
 * Workbench Sidebar Controller.
 * Coordinates sidebar lifecycle, stage overlay release, session toasts,
 * and workbench tab operations.
 */

import {
  activeTabId,
  closeSeedFiles,
  ensureSessionId,
  getAttachedStore,
  getWorkbenchLayout,
  getWorkbenchService,
  getWorkbenchSessions,
  hostDocument,
  hostWindow,
  listOpenTabs,
  liveSnapshot,
  tabIsOpen,
  waitForBetterSidebar,
  waitForSidebarSession,
  waitForTab,
} from './host-adapter.js'
import {
  WORKBENCH_FOCUS,
  isWorkbenchTab,
  loadSessionFocusMap,
  resolveDefaultFocus,
  resolveWorkbenchTabTitle,
} from './focus-state.js'
import { notifyWorkbenchChange } from './event-bus.js'
import { setWorkbenchFocus } from './split-layout.js'

export const WORKBENCH_GLOBAL_KEY = '__omnimuxWorkbench'

export {
  WORKBENCH_LEFT_RAIL_SYNC_DEBOUNCE_MS,
  WORKBENCH_LEFT_RAIL_SETTLE_MS,
  installWorkbenchLeftRailObserver,
  uninstallWorkbenchLeftRailObserver,
  syncWorkbenchGuiWidth,
} from './rail-sync.js'

const EMPTY_BOX = Object.freeze({ top: 0, left: 0, width: 0, height: 0 })
const TOAST_ID = 'omnimux-workbench-needs-session'
const CHOOSER_SELECTORS = [
  'button[aria-label="Choose workspace"]',
  'button[aria-label="选择工作区"]',
  'input[aria-label="Choose workspace"]',
  'input[aria-label="选择工作区"]',
]

function releaseStageGlobal(win, current) {
  try {
    const stage = win ? win.__omnimuxStage : null
    if (stage && typeof stage.release === 'function') {
      stage.release(current)
    }
  } catch {
    // ignore
  }
}

function clearStageDataset(dataset, current) {
  if (dataset && dataset.dshProductStage === current) {
    try {
      delete dataset.dshProductStage
    } catch {
      // ignore
    }
  }
}

function dispatchStageEvent(win) {
  try {
    if (win && typeof win.dispatchEvent === 'function') {
      win.dispatchEvent(new CustomEvent('dsh-product-stage', { detail: { id: null } }))
    }
  } catch {
    // ignore
  }
}

/**
 * Library overlays claim data-dsh-product-stage, which hides the
 * better-sidebar panel. Opening a workbench tab must drop that claim.
 */
export function releaseCurrentProductStage() {
  const win = hostWindow()
  const doc = hostDocument()
  const root = doc ? doc.documentElement : null
  const dataset = root ? root.dataset : null
  const current = dataset ? dataset.dshProductStage : null
  if (!current) return false

  releaseStageGlobal(win, current)
  clearStageDataset(dataset, current)
  dispatchStageEvent(win)
  return true
}

function tryFocusElement(el) {
  try {
    if (typeof el.focus === 'function') {
      el.focus({ preventScroll: false })
    }
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  } catch {
    // ignore
  }
}

function focusWorkspaceChooser(doc) {
  for (const selector of CHOOSER_SELECTORS) {
    const el = doc.querySelector(selector)
    if (el) {
      tryFocusElement(el)
      return
    }
  }
}

function createToastElement(doc) {
  const existing = doc.getElementById(TOAST_ID)
  if (existing) existing.remove()
  const toast = doc.createElement('div')
  toast.id = TOAST_ID
  toast.setAttribute('role', 'status')
  toast.textContent = '请先选择工作区并新建会话，再打开此面板'
  toast.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:28px',
    'transform:translateX(-50%)',
    'z-index:100000',
    'max-width:min(420px,90vw)',
    'padding:10px 14px',
    'border-radius:10px',
    'font:var(--dsw-font-s-14, 13px/18px system-ui)',
    'color:var(--dsw-alias-label-primary, #f8fafc)',
    'background:var(--dsw-alias-bg-elevated, #1c1c1f)',
    'border:1px solid var(--dsw-alias-border-l1, #334155)',
    'box-shadow:var(--dsw-shadow-lv2, 0 8px 24px rgba(0,0,0,.35))',
    'pointer-events:none',
  ].join(';')
  return toast
}

let toastTimer = null

function clearToastTimer() {
  if (toastTimer == null) return
  const win = hostWindow()
  if (win && typeof win.clearTimeout === 'function') {
    win.clearTimeout(toastTimer)
  } else {
    clearTimeout(toastTimer)
  }
  toastTimer = null
}

function scheduleToastDismissal(win, toast) {
  clearToastTimer()
  if (win && typeof win.setTimeout === 'function') {
    toastTimer = win.setTimeout(() => {
      try {
        toast.remove()
      } catch {
        // ignore
      }
      toastTimer = null
    }, 3200)
  }
}

/**
 * Surface a short cue when a workbench tab is opened without an active session.
 * @param {Document} [doc]
 * @returns {boolean}
 */
export function nudgeWorkbenchNeedsSession(doc = hostWindow()?.document) {
  if (!doc || typeof doc.createElement !== 'function') return false
  focusWorkspaceChooser(doc)
  const toast = createToastElement(doc)
  try {
    if (doc.body) {
      doc.body.appendChild(toast)
    }
    scheduleToastDismissal(hostWindow(), toast)
  } catch {
    return false
  }
  return true
}

function closeDetails() {
  try {
    const layout = getWorkbenchLayout()
    if (typeof layout?.closeDetails === 'function') {
      layout.closeDetails()
    }
  } catch {
    // layout may be an unwired Proxy
  }
}

function resolveTargetFocusMode(sessionId, tabId) {
  const map = loadSessionFocusMap(sessionId)
  const explicitMode = map[tabId]?.mode
  if (explicitMode === WORKBENCH_FOCUS.gui || explicitMode === WORKBENCH_FOCUS.split) {
    return explicitMode
  }
  return resolveDefaultFocus(tabId)
}

function resolveTabScope(sessionId, cwd, ready) {
  if (!ready) return undefined
  const scope = { sessionId }
  if (cwd) scope.cwd = cwd
  return scope
}

function resolveTabPayload(service, tabId, titleOpt, pathOpt) {
  let titleResolver = undefined
  if (service && typeof service.getTab === 'function') {
    titleResolver = (id) => service.getTab(id)
  }
  const title = resolveWorkbenchTabTitle(tabId, titleOpt, titleResolver)
  let path = tabId
  if (typeof pathOpt === 'string' && pathOpt) {
    path = pathOpt
  }
  return { type: tabId, id: tabId, title, path }
}

/**
 * Open a workbench tab in the right panel. Never claims a product stage.
 * @param {object} [opts]
 * @returns {Promise<boolean>}
 */
export async function openWorkbench(opts = {}) {
  const tabId = typeof opts.tabId === 'string' ? opts.tabId : ''
  if (!tabId) return false
  closeDetails()
  releaseCurrentProductStage()

  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 4000
  const service = await waitForBetterSidebar(timeoutMs)
  if (!service || typeof service.openTab !== 'function') return false
  await waitForTab(service, tabId, timeoutMs)

  const sessionId = await ensureSessionId(getWorkbenchSessions(), opts.sessionId)
  if (!sessionId) {
    nudgeWorkbenchNeedsSession()
    return false
  }

  const ready = await waitForSidebarSession(service, sessionId, timeoutMs)
  const openScope = resolveTabScope(sessionId, opts.cwd, ready)
  closeSeedFiles(service, openScope)

  const payload = resolveTabPayload(service, tabId, opts.title, opts.path)
  service.openTab(payload, openScope)

  const targetMode = resolveTargetFocusMode(sessionId, tabId)
  setWorkbenchFocus(targetMode, getAttachedStore(), {}, tabId)
  notifyWorkbenchChange()
  return true
}

export function closeWorkbenchPanel() {
  return setWorkbenchFocus(WORKBENCH_FOCUS.chat)
}

export function closeWorkbenchTab(tabId) {
  if (!tabId) return false
  const service = getWorkbenchService()
  if (!service || typeof service.closeTab !== 'function') return false
  const snapshot = liveSnapshot()
  const sessionId = snapshot?.sessionId
  const scope = sessionId ? { sessionId } : undefined
  try {
    service.closeTab(tabId, scope)
  } catch {
    return false
  }
  const afterSnap = liveSnapshot()
  const remaining = listOpenTabs(afterSnap?.state).filter((t) => isWorkbenchTab(t.id || t.type))
  if (remaining.length === 0) {
    closeWorkbenchPanel()
  }
  notifyWorkbenchChange()
  return true
}

export function isWorkbenchOpen(tabId) {
  const service = getWorkbenchService()
  const attached = getAttachedStore()
  let snapshot = null
  if (typeof attached?.getSnapshot === 'function') {
    snapshot = attached.getSnapshot()
  } else if (typeof service?.getSnapshot === 'function') {
    snapshot = service.getSnapshot()
  }
  return tabIsOpen(snapshot?.state, tabId)
}

export function isWorkbenchActive(tabId) {
  if (!tabId) return false
  const snapshot = liveSnapshot()
  const state = snapshot?.state
  if (!state || state.panelOpen === false) return false
  return activeTabId(state) === tabId
}

function getWorkbenchApi() {
  const win = hostWindow()
  if (win && WORKBENCH_GLOBAL_KEY in win) {
    return win[WORKBENCH_GLOBAL_KEY]
  }
  return undefined
}

function resolveStoreTitle(options, tabId) {
  const title = options.title
  if (typeof title === 'function') return title()
  return title || tabId
}

function readSidebarSnapshot(tabId) {
  const api = getWorkbenchApi()
  if (api && typeof api.isActive === 'function') {
    return Boolean(api.isActive(tabId))
  }
  if (api && typeof api.isOpen === 'function') {
    return Boolean(api.isOpen(tabId))
  }
  return false
}

function closeSidebarStore(tabId) {
  const api = getWorkbenchApi()
  if (api && typeof api.closeTab === 'function') {
    api.closeTab(tabId)
    return
  }
  if (api && typeof api.closePanel === 'function') {
    api.closePanel()
  }
}

function pollApiSubscription(listener) {
  let unsub = () => {}
  const started = Date.now()
  const timer = setInterval(() => {
    const next = getWorkbenchApi()
    if (next && typeof next.subscribe === 'function') {
      clearInterval(timer)
      unsub = next.subscribe(listener)
      return
    }
    if (Date.now() - started > 8000) {
      clearInterval(timer)
    }
  }, 50)
  return () => {
    clearInterval(timer)
    unsub()
  }
}

function subscribeSidebarStore(listener) {
  if (typeof listener !== 'function') return () => {}
  const api = getWorkbenchApi()
  if (api && typeof api.subscribe === 'function') {
    return api.subscribe(listener)
  }
  return pollApiSubscription(listener)
}

function openSidebarStore(options, tabId, path) {
  const api = getWorkbenchApi()
  if (api && typeof api.open === 'function') {
    const title = resolveStoreTitle(options, tabId)
    void api.open({ tabId, title, path })
  }
}

export function createWorkbenchSidebarStore(options) {
  const tabId = options.tabId
  const path = options.path || tabId

  return {
    getSnapshot: () => readSidebarSnapshot(tabId),
    subscribe: (listener) => subscribeSidebarStore(listener),
    open: () => openSidebarStore(options, tabId, path),
    close: () => closeSidebarStore(tabId),
    set(next) {
      if (next) this.open()
      else this.close()
    },
    readBox: () => EMPTY_BOX,
  }
}
