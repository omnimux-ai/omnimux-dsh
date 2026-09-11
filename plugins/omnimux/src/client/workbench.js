/**
 * Workbench split: keep the official conversation column, put plugin GUI
 * in dsh-better-sidebar, never claim a product-stage overlay.
 *
 * Assembly layer coordinating submodules:
 * - split-layout: split clamping, CSS variables, focus modes, default widths
 * - sidebar-controller: tabs lifecycle, left-rail sync, product stage release
 * - event-bus: change notifications, listeners, and store attachment counts
 * - host-adapter / focus-state / geometry / context: primitives and calculations
 */

import {
  CONVERSATION_COLLAPSED_ATTR,
  getConversationCollapsed,
  hydrateConversationCollapsed,
  resetConversationCollapseForTests,
  setConversationCollapsed,
} from './conversation-collapse.js'
import {
  activeTabId,
  bindWorkbenchDeps,
  clearInitialFilesSeed,
  currentSessionId,
  getAttachedStore,
  getWorkbenchService,
  hostWindow,
  liveSnapshot,
  resetWorkbenchHostAdapter,
  setAttachedStore,
  waitForBetterSidebar,
} from './workbench/host-adapter.js'
import {
  WORKBENCH_FOCUS,
  focusRecordForTab,
  getWorkbenchFocus,
  inferWorkbenchFocus,
  isWorkbenchTab,
  resetWorkbenchFocusMemory,
  resolveDefaultFocus,
} from './workbench/focus-state.js'
import {
  resetWorkbenchGeometryMemory,
  workbenchSplitMaxPanelPx,
} from './workbench/geometry.js'
import {
  formatCompactContextBlock,
  getUiContext,
  registerContextContributor,
  resetWorkbenchContextContributors,
  unregisterContextContributor,
} from './workbench/context.js'
import {
  decrementAttachCount,
  incrementAttachCount,
  notifyWorkbenchChange,
  resetWorkbenchListeners,
  subscribeWorkbench,
} from './workbench/event-bus.js'
import {
  applyDefaultWidth,
  persistClampedSplitWidth,
  resetWorkbenchWidthMemory,
  setWorkbenchFocus,
  syncSplitMaxCssVar,
  wrapStoreReduce,
} from './workbench/split-layout.js'
import {
  closeWorkbenchPanel,
  closeWorkbenchTab,
  createWorkbenchSidebarStore,
  installWorkbenchLeftRailObserver,
  isWorkbenchActive,
  isWorkbenchOpen,
  openWorkbench,
  syncWorkbenchGuiWidth,
  uninstallWorkbenchLeftRailObserver,
} from './workbench/sidebar-controller.js'
import {
  installSplitConversationMin,
  uninstallSplitConversationMin,
} from './workbench/split-layout.js'

export const WORKBENCH_GLOBAL_KEY = '__omnimuxWorkbench'

export {
  getConversationCollapsed,
  setConversationCollapsed,
  hydrateConversationCollapsed,
  CONVERSATION_COLLAPSED_ATTR,
} from './conversation-collapse.js'

export {
  WORKBENCH_LEFT_RAIL_SYNC_DEBOUNCE_MS,
  WORKBENCH_LEFT_RAIL_SETTLE_MS,
  syncWorkbenchGuiWidth,
  installWorkbenchLeftRailObserver,
  uninstallWorkbenchLeftRailObserver,
  releaseCurrentProductStage,
  nudgeWorkbenchNeedsSession,
  openWorkbench,
  closeWorkbenchTab,
  closeWorkbenchPanel,
  isWorkbenchOpen,
  isWorkbenchActive,
  createWorkbenchSidebarStore,
} from './workbench/sidebar-controller.js'

export {
  WORKBENCH_SPLIT_MIN_STYLE_ID,
  WORKBENCH_SPLIT_MIN_CSS,
  ensureSplitMinChrome,
  syncSplitMaxCssVar,
  installSplitConversationMin,
  uninstallSplitConversationMin,
  setWorkbenchFocus,
  resetWorkbenchWidthMemory,
  applyDefaultWidth,
} from './workbench/split-layout.js'

function syncAttachedPanelFocus(store, sessionId, tabId, state) {
  const record = focusRecordForTab(sessionId, tabId)
  persistClampedSplitWidth({ state, record, sessionId, tabId })

  if (record.mode === WORKBENCH_FOCUS.gui) {
    setWorkbenchFocus(record.mode, store)
    return
  }
  record.mode = inferWorkbenchFocus(state)
  applyDefaultWidth(getWorkbenchService(), sessionId, store, {}, false, tabId)
  notifyWorkbenchChange()
}

function attachStore(store) {
  if (!store) return
  wrapStoreReduce(store)
  incrementAttachCount(store)
  if (getAttachedStore() === store) return
  setAttachedStore(store)

  const snapshot = liveSnapshot(store)
  const state = snapshot?.state
  if (!state || state.panelOpen === false) {
    setConversationCollapsed(false)
    notifyWorkbenchChange()
    return
  }

  const sessionId = currentSessionId() || snapshot.sessionId
  const tabId = activeTabId(state)
  syncAttachedPanelFocus(store, sessionId, tabId, state)
}

function detachStore(store) {
  if (!store) {
    setAttachedStore(null)
    return
  }
  const remaining = decrementAttachCount(store)
  if (getAttachedStore() !== store) return
  if (remaining === 0) setAttachedStore(null)
}

function handleServiceStateChange(service) {
  clearInitialFilesSeed(service)
  let state
  try {
    const snapshot = typeof service.getSnapshot === 'function' ? service.getSnapshot() : null
    state = snapshot?.state
  } catch {
    state = undefined
  }
  notifyWorkbenchChange()
  syncSplitMaxCssVar(state)
  if (state?.panelOpen && typeof state.width === 'number') {
    const sessionId = currentSessionId()
    const tabId = activeTabId(state)
    const record = focusRecordForTab(sessionId, tabId)
    persistClampedSplitWidth({ state, record, sessionId, tabId })
  }
}

function bind(next = {}) {
  bindWorkbenchDeps(next)
  const service = getWorkbenchService()
  clearInitialFilesSeed(service)
  if (service && typeof service.subscribeState === 'function' && !service.__omnimuxWorkbenchHooked) {
    try {
      service.subscribeState(() => handleServiceStateChange(service))
      service.__omnimuxWorkbenchHooked = true
    } catch {
      // ignore
    }
  }
  notifyWorkbenchChange()
}

function applyDefaultWidthFromGlobal(sessionId, store, env, force) {
  const activeStore = store || getAttachedStore()
  return applyDefaultWidth(getWorkbenchService(), sessionId, activeStore, env, force)
}

function resolveWorkbenchSnapshot() {
  const service = getWorkbenchService()
  if (service && typeof service.getSnapshot === 'function') {
    return service.getSnapshot()
  }
  return null
}

function createApi() {
  return {
    open: openWorkbench,
    closeTab: closeWorkbenchTab,
    closePanel: closeWorkbenchPanel,
    isOpen: isWorkbenchOpen,
    isActive: isWorkbenchActive,
    isWorkbenchTab,
    resolveDefaultFocus,
    subscribe: subscribeWorkbench,
    attachStore,
    detachStore,
    bind,
    createSidebarStore: createWorkbenchSidebarStore,
    waitForService: waitForBetterSidebar,
    applyDefaultWidth: applyDefaultWidthFromGlobal,
    getSnapshot: resolveWorkbenchSnapshot,
    getFocus: getWorkbenchFocus,
    setFocus: setWorkbenchFocus,
    inferFocus: inferWorkbenchFocus,
    syncGuiWidth: syncWorkbenchGuiWidth,
    splitMaxPx: workbenchSplitMaxPanelPx,
    installLeftRailObserver: installWorkbenchLeftRailObserver,
    installSplitMin: installSplitConversationMin,
    getConversationCollapsed,
    setConversationCollapsed,
    hydrateConversationCollapsed,
    registerContextContributor,
    unregisterContextContributor,
    getUiContext,
    formatCompactContextBlock,
  }
}

/**
 * Install the shared workbench API on the window global. Idempotent.
 * @param {Window & { [WORKBENCH_GLOBAL_KEY]?: unknown }} [target]
 */
export function installWorkbenchGlobal(target = hostWindow()) {
  if (!target) return createApi()
  const existing = target[WORKBENCH_GLOBAL_KEY]
  if (existing !== undefined) {
    if (typeof existing.getConversationCollapsed === 'function') {
      return existing
    }
    const api = createApi()
    target[WORKBENCH_GLOBAL_KEY] = api
    return api
  }
  const api = createApi()
  target[WORKBENCH_GLOBAL_KEY] = api
  return api
}

/**
 * Test-only: drop bound services, listeners, and the window singleton.
 * @param {Window & { [WORKBENCH_GLOBAL_KEY]?: unknown }} [target]
 */
export function resetWorkbenchForTests(target = hostWindow()) {
  uninstallWorkbenchLeftRailObserver()
  uninstallSplitConversationMin()
  resetWorkbenchHostAdapter()
  resetWorkbenchListeners()
  resetWorkbenchWidthMemory()
  resetWorkbenchFocusMemory()
  resetWorkbenchGeometryMemory()
  resetConversationCollapseForTests()
  resetWorkbenchContextContributors()
  if (target && Object.prototype.hasOwnProperty.call(target, WORKBENCH_GLOBAL_KEY)) {
    try {
      delete target[WORKBENCH_GLOBAL_KEY]
    } catch {
      target[WORKBENCH_GLOBAL_KEY] = undefined
    }
  }
}

if (hostWindow()) {
  installWorkbenchGlobal(hostWindow())
}
