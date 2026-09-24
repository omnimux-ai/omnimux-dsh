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
import { ensureConversationVisible } from './workbench/ensure-conversation-visible.js'
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
  reconcileRightbarFromRatio,
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
import {
  getRailVerdict,
  installSidebarActivation,
  isRailRowActive,
  requestRailActivationSync,
  resetSidebarActivationForTests,
  resolveSidebarActiveTarget,
  uninstallSidebarActivation,
} from './workbench/sidebar-activation.js'

export const WORKBENCH_GLOBAL_KEY = '__omnimuxWorkbench'

export {
  getRailVerdict,
  installSidebarActivation,
  isRailRowActive,
  requestRailActivationSync,
  resolveSidebarActiveTarget,
  uninstallSidebarActivation,
} from './workbench/sidebar-activation.js'

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
  reconcileRightbarFromRatio,
  settleConversationRatioAfterDrag,
} from './workbench/split-layout.js'

function syncAttachedPanelFocus(store, sessionId, tabId, state) {
  const record = focusRecordForTab(sessionId, tabId)
  persistClampedSplitWidth({ state, record, sessionId, tabId })

  if (record.explicit === true && record.mode === WORKBENCH_FOCUS.gui) {
    setWorkbenchFocus(record.mode, store, {}, tabId, { persistUserIntent: false })
    return
  }
  record.mode = inferWorkbenchFocus(state)
  applyDefaultWidth(getWorkbenchService(), sessionId, store, {}, false, tabId)
  // 面板宽与外壳把手必须在同一次装配里对齐：比例决定中栏后，右栏拿余量（D7-S1′）。
  reconcileRightbarFromRatio(state, { sessionId })
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

/**
 * 安全读取服务快照状态：服务可能尚未就绪或自身 `getSnapshot` 抛错（宿主能力缺失时
 * 布局同步必须是安全的空操作，绝不把宿主异常冒泡成插件崩溃）。
 * @param {object | null | undefined} service
 * @returns {object | undefined}
 */
function safeServiceState(service) {
  try {
    return liveSnapshot(service)?.state
  } catch {
    return undefined
  }
}

function handleServiceStateChange(service) {
  clearInitialFilesSeed(service)
  const state = safeServiceState(service)
  if (!state || state.panelOpen === false) {
    setConversationCollapsed(false)
  }
  notifyWorkbenchChange()
  syncSplitMaxCssVar(state)
  reconcileRightbarFromRatio(state)
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
  // layout 服务刚注入：此刻才拿得到外壳 layout 句柄，比例协调写与老用户迁移都在这里落地。
  reconcileRightbarFromRatio(safeServiceState(service))
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
    openWorkbench,
    closeTab: closeWorkbenchTab,
    closePanel: closeWorkbenchPanel,
    isOpen: isWorkbenchOpen,
    isActive: isWorkbenchActive,
    // 诊断与测试：读完整裁决 / 强制重算一次。
    getRailVerdict: () => getRailVerdict(),
    isRailRowActive: (tabId) => isRailRowActive(tabId),
    syncActivation: () => requestRailActivationSync(),
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
    // 诊断：把「可见舞台 − 比例中栏宽」写回外壳面板宽通道（D7-S1′），返回写入结果。
    reconcileRightbar: (env) => reconcileRightbarFromRatio(liveSnapshot()?.state, env),
    installLeftRailObserver: installWorkbenchLeftRailObserver,
    installSplitMin: installSplitConversationMin,
    getConversationCollapsed,
    setConversationCollapsed,
    // 「让对话可见」的唯一对外入口：宿主右侧栏全屏 + 插件折叠键两层一起处理。
    // 垂直插件（如画布「添加会话」）在全屏态下必须走这里，只清折叠键动不了宿主全屏。
    ensureConversationVisible: (opts = {}) => ensureConversationVisible(
      typeof document !== 'undefined' ? document : undefined,
      typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined,
      opts,
    ),
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
      // Preserve consumers' object identity while refreshing module-owned closures after HMR.
      Object.assign(existing, createApi())
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
  resetSidebarActivationForTests()
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
