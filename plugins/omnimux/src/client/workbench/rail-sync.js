/**
 * Workbench Left-Rail Synchronization.
 * Monitors left rail expand/collapse transitions and keeps workbench GUI width aligned.
 */

import { getConversationCollapsed } from '../conversation-collapse.js'
import {
  activeTabId,
  getAttachedStore,
  hostDocument,
  hostWindow,
  liveSnapshot,
} from './host-adapter.js'
import {
  WORKBENCH_FOCUS,
  focusRecordForTab,
} from './focus-state.js'
import {
  WORKBENCH_FOCUS_NEAR_PX,
  clampSplitPanelWidth,
  findOfficialSidebarColumn,
  isWorkbenchPanelDragging,
  officialSidebarCollapsedHost,
  workbenchGuiWidthPx,
  workbenchSplitMaxPanelPx,
} from './geometry.js'
import { notifyWorkbenchChange } from './event-bus.js'
import {
  setSplitResizeHandler,
  syncSplitMaxCssVar,
} from './split-layout.js'

export const WORKBENCH_LEFT_RAIL_SYNC_DEBOUNCE_MS = 50
export const WORKBENCH_LEFT_RAIL_SETTLE_MS = 320

/** @type {ResizeObserver | null} */
let leftRailResizeObserver = null
/** @type {MutationObserver | null} */
let leftRailAttrObserver = null
/** @type {number | null} */
let leftRailSyncTimer = null
/** @type {number | null} */
let leftRailSettleTimer = null
let leftRailObserverDoc = null

function clearTimer(handle) {
  if (handle == null) return
  const win = hostWindow()
  if (win && typeof win.clearTimeout === 'function') {
    win.clearTimeout(handle)
  } else {
    clearTimeout(handle)
  }
}

function scheduleGuiWidthSync() {
  clearTimer(leftRailSyncTimer)
  leftRailSyncTimer = null
  clearTimer(leftRailSettleTimer)
  leftRailSettleTimer = null

  const win = hostWindow()
  const schedule = (fn, ms) => {
    if (win && typeof win.setTimeout === 'function') {
      return win.setTimeout(fn, ms)
    }
    return setTimeout(fn, ms)
  }

  leftRailSyncTimer = schedule(() => {
    leftRailSyncTimer = null
    syncWorkbenchGuiWidth()
  }, WORKBENCH_LEFT_RAIL_SYNC_DEBOUNCE_MS)

  leftRailSettleTimer = schedule(() => {
    leftRailSettleTimer = null
    syncWorkbenchGuiWidth()
  }, WORKBENCH_LEFT_RAIL_SETTLE_MS)
}

function createRailResizeObserver(column, collapsedHost) {
  if (typeof ResizeObserver === 'undefined') return null
  const observer = new ResizeObserver(() => { scheduleGuiWidthSync() })
  if (column) observer.observe(column)
  if (collapsedHost && collapsedHost !== column) {
    try {
      observer.observe(collapsedHost)
    } catch {
      // ignore
    }
  }
  return observer
}

function resolveRailMutationTarget(doc, collapsedHost) {
  if (collapsedHost && collapsedHost.isConnected !== false) {
    return { target: collapsedHost, subtree: false }
  }
  const fallback = doc.documentElement || doc.body
  const isRootSlot = typeof fallback?.getAttribute === 'function' && fallback.getAttribute('data-slot') === 'root'
  const hasCollapsedAttr = typeof fallback?.hasAttribute === 'function' && fallback.hasAttribute('data-sidebar-collapsed')
  const subtree = !collapsedHost || (isRootSlot && !hasCollapsedAttr)
  return { target: fallback, subtree: Boolean(subtree) }
}

function createRailMutationObserver(doc, collapsedHost) {
  if (typeof MutationObserver === 'undefined') return null
  const observer = new MutationObserver(() => { scheduleGuiWidthSync() })
  const resolved = resolveRailMutationTarget(doc, collapsedHost)
  if (resolved.target) {
    observer.observe(resolved.target, {
      attributes: true,
      attributeFilter: ['data-sidebar-collapsed'],
      subtree: resolved.subtree,
    })
  }
  return observer
}

/**
 * Keep gui panel width glued to the official left rail as it expands/collapses.
 * @param {Document} [doc]
 * @returns {() => void} cleanup
 */
export function installWorkbenchLeftRailObserver(doc = hostDocument()) {
  if (!doc) return () => {}
  if (leftRailObserverDoc === doc && (leftRailResizeObserver || leftRailAttrObserver)) {
    return uninstallWorkbenchLeftRailObserver
  }
  uninstallWorkbenchLeftRailObserver()
  leftRailObserverDoc = doc

  const column = findOfficialSidebarColumn(doc)
  const collapsedHost = officialSidebarCollapsedHost(doc)
  leftRailResizeObserver = createRailResizeObserver(column, collapsedHost)
  leftRailAttrObserver = createRailMutationObserver(doc, collapsedHost)

  scheduleGuiWidthSync()
  return uninstallWorkbenchLeftRailObserver
}

export function uninstallWorkbenchLeftRailObserver() {
  if (leftRailResizeObserver) {
    try { leftRailResizeObserver.disconnect() } catch { /* ignore */ }
    leftRailResizeObserver = null
  }
  if (leftRailAttrObserver) {
    try { leftRailAttrObserver.disconnect() } catch { /* ignore */ }
    leftRailAttrObserver = null
  }
  clearTimer(leftRailSyncTimer)
  leftRailSyncTimer = null
  clearTimer(leftRailSettleTimer)
  leftRailSettleTimer = null
  leftRailObserverDoc = null
}

function resolveGuiWidthReducer(current, nextWidth) {
  if (!current || current.panelOpen === false) return current
  const isWidthMatching = typeof current.width === 'number'
    && Number.isFinite(current.width)
    && Math.abs(current.width - nextWidth) < 1
  if (isWidthMatching && current.panelOpen === true) {
    return current
  }
  return { ...current, panelOpen: true, width: nextWidth }
}

function applyGuiWidthWrite(store, env) {
  if (!store || typeof store.reduce !== 'function') return false
  let wrote = false
  store.reduce((current) => {
    const nextWidth = workbenchGuiWidthPx(current, env)
    const updated = resolveGuiWidthReducer(current, nextWidth)
    if (updated !== current) wrote = true
    return updated
  })
  if (wrote) notifyWorkbenchChange()
  const currentSnapshot = liveSnapshot(store)
  syncSplitMaxCssVar(currentSnapshot?.state, env)
  return wrote
}

function clampSplitReducer(current, sessionId, env) {
  if (typeof current?.width !== 'number' || !Number.isFinite(current.width)) return current
  const next = clampSplitPanelWidth(current.width, current, { ...env, sessionId })
  if (Math.abs(current.width - next) < 1) return current
  return { ...current, width: next }
}

function clampSplitWidthWrite(store, snapshot, env) {
  const sessionId = snapshot?.sessionId
  store.reduce((current) => clampSplitReducer(current, sessionId, env))
  notifyWorkbenchChange()
  const nextSnapshot = liveSnapshot(store)
  const syncEnv = { ...env, sessionId }
  syncSplitMaxCssVar(nextSnapshot?.state, syncEnv)
  return true
}

function handleDraggingSync(doc, store, env) {
  if (!isWorkbenchPanelDragging(doc)) return false
  const draggingSnapshot = liveSnapshot(store)
  const sessionId = draggingSnapshot?.sessionId
  const syncEnv = { ...env, sessionId }
  syncSplitMaxCssVar(draggingSnapshot?.state, syncEnv)
  return true
}

function isPanelOversized(state, env) {
  if (typeof state?.width !== 'number' || !Number.isFinite(state.width)) return false
  const target = workbenchSplitMaxPanelPx(state, env)
  return state.width > target + WORKBENCH_FOCUS_NEAR_PX
}

function wantsGuiFocus(sessionId, state) {
  const tabId = activeTabId(state)
  const record = focusRecordForTab(sessionId, tabId)
  return record.mode === WORKBENCH_FOCUS.gui || getConversationCollapsed()
}

function canReduceStore(store) {
  return Boolean(store && typeof store.reduce === 'function')
}

/**
 * Re-apply gui geometry from the live left rail.
 * @param {object} [store]
 * @param {object} [env]
 * @returns {boolean} whether a write was attempted
 */
export function syncWorkbenchGuiWidth(store = getAttachedStore(), env = {}) {
  const doc = hostDocument()
  if (handleDraggingSync(doc, store, env)) return false

  const snapshot = liveSnapshot(store)
  const state = snapshot?.state
  if (!state || state.panelOpen === false) return false

  if (wantsGuiFocus(snapshot?.sessionId, state)) {
    return applyGuiWidthWrite(store, env)
  }

  if (isPanelOversized(state, env) && canReduceStore(store)) {
    return clampSplitWidthWrite(store, snapshot, env)
  }

  syncSplitMaxCssVar(state, env)
  return false
}

setSplitResizeHandler(() => {
  syncWorkbenchGuiWidth()
})
