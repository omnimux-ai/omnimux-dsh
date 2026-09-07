/**
 * Workbench split: keep the official conversation column, put plugin GUI
 * in dsh-better-sidebar, never claim a product-stage overlay.
 *
 * Installed on `window.__omnimuxWorkbench` at module top-level (same
 * pattern as `__omnimuxStage`). Vertical plugins read the global — they
 * MUST NOT import this module. Opening a workbench tab MUST NOT set
 * `data-dsh-product-stage` (that chrome hides `[data-dsh-panel-host]`).
 *
 * Middle-pane hide (#372) is `conversationCollapsed` (CSS), not solely
 * "right panel = viewport − left". Left-rail resize must not re-show chat.
 *
 * 本文件只是装配层：组合 ./workbench/ 下的专一子模块
 * （host-adapter / focus-state / geometry / context），保留 global API、
 * DOM observer 与 store 写入。纯计算与快照判定已下沉，occupant 单真源在
 * `src/workbench/contract.js`。
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
  closeSeedFiles,
  currentSessionId,
  ensureSessionId,
  getAttachedStore,
  getWorkbenchLayout,
  getWorkbenchService,
  getWorkbenchSessions,
  hostDocument,
  hostWindow,
  listOpenTabs,
  liveSnapshot,
  resetWorkbenchHostAdapter,
  setAttachedStore,
  tabIsOpen,
  waitForBetterSidebar,
  waitForSidebarSession,
  waitForTab,
} from './workbench/host-adapter.js'
import {
  WORKBENCH_FOCUS,
  focusRecordForTab,
  getWorkbenchFocus,
  inferWorkbenchFocus,
  isWorkbenchTab,
  loadSessionFocusMap,
  persistSessionFocus,
  resetWorkbenchFocusMemory,
  resolveDefaultFocus,
  resolveWorkbenchTabTitle,
} from './workbench/focus-state.js'
import {
  WORKBENCH_FOCUS_NEAR_PX,
  WORKBENCH_PANEL_ATTR,
  WORKBENCH_SPLIT_MAX_CSS_VAR,
  clampSplitPanelWidth,
  findOfficialSidebarColumn,
  findWorkbenchPanelElement,
  isWorkbenchPanelDragging,
  nearPx,
  officialSidebarCollapsedHost,
  resetWorkbenchGeometryMemory,
  splitConversationMinApplies,
  workbenchDefaultWidthPx,
  workbenchGuiWidthPx,
  workbenchSplitMaxPanelPx,
} from './workbench/geometry.js'
import {
  formatCompactContextBlock,
  getUiContext,
  registerContextContributor,
  resetWorkbenchContextContributors,
  unregisterContextContributor,
} from './workbench/context.js'

export const WORKBENCH_GLOBAL_KEY = '__omnimuxWorkbench'
/** Debounce left-rail resize sync so mid-tween frames do not write a half-open width. */
export const WORKBENCH_LEFT_RAIL_SYNC_DEBOUNCE_MS = 50
/**
 * After a collapse/expand attr flip, AppFrame may still be mid-tween when the
 * debounced sync runs. One settle pass after the track finishes re-measures the
 * true rail (56 official / ~90 advanced) so gui width is not stuck on a stale
 * interim measure (historically 72 → 16px gutter at panel.left).
 */
export const WORKBENCH_LEFT_RAIL_SETTLE_MS = 320

export {
  getConversationCollapsed,
  setConversationCollapsed,
  hydrateConversationCollapsed,
  CONVERSATION_COLLAPSED_ATTR,
} from './conversation-collapse.js'

const EMPTY_BOX = Object.freeze({ top: 0, left: 0, width: 0, height: 0 })

/** @type {Set<() => void>} */
const listeners = new Set()

/** @type {WeakMap<object, number>} */
const attachCounts = new WeakMap()

/** Sessions that already received a default width write. */
const appliedWidthSessions = new Set()

/** @type {ResizeObserver | null} */
let leftRailResizeObserver = null
/** @type {MutationObserver | null} */
let leftRailAttrObserver = null
/** @type {number | null} */
let leftRailSyncTimer = null
/** @type {number | null} */
let leftRailSettleTimer = null
let leftRailObserverDoc = null

function emit() {
  for (const listener of listeners) {
    try { listener() } catch (err) {
      console.error('[omnimux-workbench] listener error:', err)
    }
  }
}

/**
 * Stamp {@link WORKBENCH_PANEL_ATTR} on the resolved panel (idempotent) so
 * the split-min CSS max-width binds to the real right panel permanently —
 * including after pointerup, when `data-dragging` is gone (#505).
 * @returns {Element | null} the resolved panel
 */
function tagWorkbenchPanel(doc = hostDocument()) {
  const panel = findWorkbenchPanelElement(doc)
  if (panel && typeof panel.setAttribute === 'function' && !panel.hasAttribute?.(WORKBENCH_PANEL_ATTR)) {
    try { panel.setAttribute(WORKBENCH_PANEL_ATTR, '') } catch { /* ignore */ }
  }
  return panel
}

/**
 * Re-apply `gui` geometry from the live left rail.
 * Also clamps any open panel that is wider than `viewport − leftRail` so the
 * right panel cannot cover the official session list (#353 / #356).
 *
 * Left-rail resize MUST only rewrite panel width. It MUST NOT call
 * `setConversationCollapsed` / flip middle-pane intent (#372). `wantsGui` is
 * pure intent: stored gui mode OR an already-collapsed middle column.
 * @returns {boolean} whether a write was attempted
 */
export function syncWorkbenchGuiWidth(store = getAttachedStore(), env = {}) {
  const doc = hostDocument()
  // Suspend auto-clamping while user is actively dragging the panel divider to
  // eliminate layout fighting, stutter, and cyclic resize thrashing. Scoped to
  // the resolved workbench panel so AppFrame [data-dragging] nodes cannot
  // wrongly suspend the sync (#505).
  if (isWorkbenchPanelDragging(doc)) {
    const snapshot = liveSnapshot(store)
    syncSplitMaxCssVar(snapshot?.state, { ...env, sessionId: snapshot?.sessionId })
    return false
  }
  const snapshot = liveSnapshot(store)
  const state = snapshot?.state
  if (!state || state.panelOpen === false) return false
  const tabId = activeTabId(state)
  const record = focusRecordForTab(snapshot?.sessionId, tabId)
  // Intentional gui (or a collapsed middle column) is allowed to squeeze the
  // conversation column, so it is NEVER clamped here. Every other "split"
  // record is clamped to the split max so the column keeps its minimum width.
  const wantsGui = record.mode === WORKBENCH_FOCUS.gui || getConversationCollapsed()
  const target = wantsGui ? workbenchGuiWidthPx(state, env) : workbenchSplitMaxPanelPx(state, env)
  const oversized = typeof state.width === 'number'
    && Number.isFinite(state.width)
    && state.width > target + WORKBENCH_FOCUS_NEAR_PX

  if (wantsGui) {
    // Panel geometry only — do NOT route through setWorkbenchFocus (that would
    // re-enter setConversationCollapsed and couple left-rail collapse to the
    // middle pane, regressing #372).
    if (!store || typeof store.reduce !== 'function') return false
    let wrote = false
    store.reduce((current) => {
      if (!current || current.panelOpen === false) return current
      const nextWidth = workbenchGuiWidthPx(current, env)
      if (typeof current.width === 'number' && Number.isFinite(current.width)
        && Math.abs(current.width - nextWidth) < 1
        && current.panelOpen === true) {
        return current
      }
      wrote = true
      return { ...current, panelOpen: true, width: nextWidth }
    })
    if (wrote) emit()
    syncSplitMaxCssVar(liveSnapshot(store)?.state, env)
    return wrote
  }
  // Independence invariant + conversation-column guard: even a "split" record
  // must be clamped so it neither covers the left rail nor squeezes the middle
  // conversation column below its minimum (stale gui width after getFocus
  // clobber looks like split and used to no-op).
  if (!oversized || !store || typeof store.reduce !== 'function') {
    syncSplitMaxCssVar(state, env)
    return false
  }
  store.reduce((current) => {
    if (typeof current?.width !== 'number' || !Number.isFinite(current.width)) return current
    const next = clampSplitPanelWidth(current.width, current, { ...env, sessionId: snapshot?.sessionId })
    if (Math.abs(current.width - next) < 1) return current
    return { ...current, width: next }
  })
  emit()
  syncSplitMaxCssVar(liveSnapshot(store)?.state, { ...env, sessionId: snapshot?.sessionId })
  return true
}

function clearTimer(handle) {
  if (handle == null) return
  const win = hostWindow()
  if (win?.clearTimeout) win.clearTimeout(handle)
  else clearTimeout(handle)
}

function scheduleGuiWidthSync() {
  clearTimer(leftRailSyncTimer)
  leftRailSyncTimer = null
  clearTimer(leftRailSettleTimer)
  leftRailSettleTimer = null
  const win = hostWindow()
  const schedule = (fn, ms) => (win?.setTimeout ? win.setTimeout(fn, ms) : setTimeout(fn, ms))
  leftRailSyncTimer = schedule(() => {
    leftRailSyncTimer = null
    syncWorkbenchGuiWidth()
  }, WORKBENCH_LEFT_RAIL_SYNC_DEBOUNCE_MS)
  // Settle after the official rail track tween so a mid-animation measure
  // (or COLLAPSED_MAX_PX=72 fallback) cannot leave a permanent 16px gutter.
  leftRailSettleTimer = schedule(() => {
    leftRailSettleTimer = null
    syncWorkbenchGuiWidth()
  }, WORKBENCH_LEFT_RAIL_SETTLE_MS)
}

/**
 * Keep `gui` panel width glued to the official left rail as it expands/collapses.
 * Without this, hiding chat while the rail is collapsed (or a stale 56px measure)
 * lets the right panel cover the expanded session list (fixed host z-index 40).
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
  if (typeof ResizeObserver !== 'undefined') {
    leftRailResizeObserver = new ResizeObserver(() => { scheduleGuiWidthSync() })
    if (column) leftRailResizeObserver.observe(column)
    // Frame track animates grid-template-columns; observe the host when it is a
    // distinct element so collapse tweens still schedule a sync.
    if (collapsedHost && collapsedHost !== column) {
      try { leftRailResizeObserver.observe(collapsedHost) } catch { /* ignore */ }
    }
  }

  // Attribute-only on the frame host (AppFrame / AdvancedFrame). Prefer the
  // sidebar-coordinator collapsedHostNode shape over html+subtree so phantom
  // markers elsewhere cannot thrash sync. Fall back to documentElement subtree
  // when the host is not mounted yet.
  if (typeof MutationObserver !== 'undefined') {
    leftRailAttrObserver = new MutationObserver(() => { scheduleGuiWidthSync() })
    const host = collapsedHost && collapsedHost.isConnected !== false
      ? collapsedHost
      : (doc.documentElement || doc.body)
    if (host) {
      const subtree = !collapsedHost
        || (typeof host.getAttribute === 'function'
          && host.getAttribute('data-slot') === 'root'
          && !host.hasAttribute('data-sidebar-collapsed'))
      leftRailAttrObserver.observe(host, {
        attributes: true,
        attributeFilter: ['data-sidebar-collapsed'],
        subtree: Boolean(subtree),
      })
    }
  }

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

export const WORKBENCH_SPLIT_MIN_STYLE_ID = 'omnimux-split-conversation-min-chrome'
// The panel max-width binds to the persistent WORKBENCH_PANEL_ATTR marker
// (stamped on the resolved real right panel), NOT to [data-dragging]: the
// real better-sidebar panel only carries data-dragging mid-drag, so a
// drag-only selector releases the clamp exactly when the oversized inline
// width is committed (#505).
export const WORKBENCH_SPLIT_MIN_CSS = `
html:not([${CONVERSATION_COLLAPSED_ATTR}]) [${WORKBENCH_PANEL_ATTR}]{
  max-width:min(100vw,var(${WORKBENCH_SPLIT_MAX_CSS_VAR},100vw))!important;
}
`

const wrappedStores = new WeakSet()
let splitMinDoc = null
let splitMinUnsub = null

export function ensureSplitMinChrome(doc = hostDocument()) {
  if (!doc?.head) return null
  let style = typeof doc.getElementById === 'function' ? doc.getElementById(WORKBENCH_SPLIT_MIN_STYLE_ID) : null
  if (!style) {
    style = doc.createElement('style')
    style.id = WORKBENCH_SPLIT_MIN_STYLE_ID
    doc.head.append(style)
  }
  if (style.textContent !== WORKBENCH_SPLIT_MIN_CSS) style.textContent = WORKBENCH_SPLIT_MIN_CSS
  return style
}

export function syncSplitMaxCssVar(state = liveSnapshot()?.state, env = {}) {
  const root = hostDocument()?.documentElement
  if (!root?.style?.setProperty) return false
  ensureSplitMinChrome()
  if (!splitConversationMinApplies(state, env)) {
    try { root.style.removeProperty(WORKBENCH_SPLIT_MAX_CSS_VAR) } catch { /* ignore */ }
    return false
  }
  // Tag the real right panel whenever the split ceiling applies so the CSS
  // max-width keeps binding after any drag ends (#505).
  tagWorkbenchPanel(hostDocument())
  root.style.setProperty(WORKBENCH_SPLIT_MAX_CSS_VAR, `${workbenchSplitMaxPanelPx(state, env)}px`)
  return true
}

function clampLiveSplitDom(state = liveSnapshot()?.state, env = {}) {
  syncSplitMaxCssVar(state, env)
  if (!splitConversationMinApplies(state, env)) return
  const max = workbenchSplitMaxPanelPx(state, env)
  const doc = hostDocument()
  const panel = findWorkbenchPanelElement(doc)
  // Mid-drag the panel rewrites its inline width and the layout CSS var on
  // every frame; the tagged marker + --omnimux-split-max already clamp the
  // visuals through CSS, so do NOT fight those writes here (jitter). Clamp
  // the DOM only once the drag has settled (#505).
  if (isWorkbenchPanelDragging(doc, panel)) return
  const root = doc?.documentElement
  if (root?.style?.getPropertyValue) {
    const current = Number.parseFloat(root.style.getPropertyValue('--dsh-sidebar-width'))
    if (Number.isFinite(current) && current > max) {
      root.style.setProperty('--dsh-sidebar-width', `${max}px`)
    }
  }
  // The real right panel — resolved from its resize handle / marker, not from
  // [data-dragging] (gone after release).
  if (panel?.style) {
    const current = Number.parseFloat(panel.style.width)
    if (Number.isFinite(current) && current > max) panel.style.width = `${max}px`
  }
}

function wrapStoreReduce(store) {
  if (!store || typeof store.reduce !== 'function' || wrappedStores.has(store)) return store
  const original = store.reduce.bind(store)
  store.reduce = (reducer) => original((current) => {
    const next = typeof reducer === 'function' ? reducer(current) : current
    if (!next || next === current) return next
    if (typeof next.width !== 'number' || !Number.isFinite(next.width)) return next
    const sessionId = typeof store.getSnapshot === 'function' ? store.getSnapshot()?.sessionId : undefined
    const clamped = clampSplitPanelWidth(next.width, next, { sessionId })
    if (clamped === next.width) return next
    return { ...next, width: clamped }
  })
  wrappedStores.add(store)
  return store
}

function persistClampedSplitWidth(state, record, sessionId, tabId, env = {}) {
  if (state?.panelOpen === false) return
  if (typeof state?.width !== 'number' || !Number.isFinite(state.width)) return
  if (record.mode === WORKBENCH_FOCUS.gui) return
  const width = clampSplitPanelWidth(state.width, state, env)
  if (nearPx(width, workbenchGuiWidthPx(state, env))) return
  record.splitWidth = width
  if (sessionId && tabId) persistSessionFocus(sessionId, tabId, { splitWidth: width })
}

function onSplitPointerSample() {
  const win = hostWindow()
  // Tag synchronously: this capture-phase listener runs before the panel's
  // own React handler writes the drag width, so the CSS max-width already
  // binds when that write lands (#505).
  try { tagWorkbenchPanel(hostDocument()) } catch { /* ignore */ }
  const run = () => clampLiveSplitDom()
  if (win?.requestAnimationFrame) win.requestAnimationFrame(run)
  else run()
}

export function installSplitConversationMin(doc = hostDocument()) {
  if (!doc) return () => {}
  if (splitMinDoc === doc && splitMinUnsub) return splitMinUnsub
  uninstallSplitConversationMin()
  splitMinDoc = doc
  ensureSplitMinChrome(doc)
  syncSplitMaxCssVar()
  tagWorkbenchPanel(doc)
  const onMove = () => onSplitPointerSample()
  const onUp = () => {
    onSplitPointerSample()
    // This capture-phase listener runs BEFORE the panel's own onPointerUp
    // commits the final drag width to the store; defer the store read to the
    // next frame so it never clamps against the pre-drag state (#505).
    const clampStore = () => {
      const store = getAttachedStore()
      const snapshot = liveSnapshot(store)
      const state = snapshot?.state
      if (!store || typeof store.reduce !== 'function' || !splitConversationMinApplies(state)) return
      const max = workbenchSplitMaxPanelPx(state)
      if (typeof state?.width === 'number' && state.width > max) {
        store.reduce((current) => {
          if (typeof current?.width !== 'number') return current
          const next = clampSplitPanelWidth(current.width, current, { sessionId: snapshot?.sessionId })
          return next === current.width ? current : { ...current, width: next }
        })
      }
    }
    const win = hostWindow()
    if (win?.requestAnimationFrame) win.requestAnimationFrame(clampStore)
    else clampStore()
  }
  doc.addEventListener?.('pointermove', onMove, true)
  doc.addEventListener?.('pointerup', onUp, true)
  doc.addEventListener?.('pointercancel', onUp, true)
  const win = hostWindow()
  // The viewport can shrink while the official rail keeps the same width.
  const onResize = () => syncWorkbenchGuiWidth()
  win?.addEventListener?.('resize', onResize)
  splitMinUnsub = () => {
    doc.removeEventListener?.('pointermove', onMove, true)
    doc.removeEventListener?.('pointerup', onUp, true)
    doc.removeEventListener?.('pointercancel', onUp, true)
    win?.removeEventListener?.('resize', onResize)
    if (splitMinDoc === doc) {
      splitMinDoc = null
      splitMinUnsub = null
    }
  }
  return splitMinUnsub
}

export function uninstallSplitConversationMin() {
  if (typeof splitMinUnsub === 'function') splitMinUnsub()
  splitMinUnsub = null
  splitMinDoc = null
}

/**
 * Switch focus by writing better-sidebar geometry. Never unmounts conversation.
 * @param {'split' | 'gui' | 'chat'} mode
 * @returns {boolean}
 */
export function setWorkbenchFocus(mode, store = getAttachedStore(), env = {}, targetTabId = undefined) {
  if (mode !== WORKBENCH_FOCUS.split && mode !== WORKBENCH_FOCUS.gui && mode !== WORKBENCH_FOCUS.chat) {
    return false
  }
  const snapshot = liveSnapshot(store)
  const state = snapshot?.state
  const sessionId = snapshot?.sessionId
  const prevTabId = activeTabId(state)
  const prevRecord = focusRecordForTab(sessionId, prevTabId)
  persistClampedSplitWidth(state, prevRecord, sessionId, prevTabId, env)

  const effectiveTabId = targetTabId || prevTabId
  const record = focusRecordForTab(sessionId, effectiveTabId)
  if (mode !== WORKBENCH_FOCUS.chat && sessionId && effectiveTabId) {
    record.mode = mode
    persistSessionFocus(sessionId, effectiveTabId, { mode })
  }
  // gui → mid collapsed; split → mid open; chat (right closed) → mid MUST stay
  // open so the session view is never blank when the workbench panel is gone.
  // (#372 still holds: left-rail collapse never flips mid on its own.)
  if (mode === WORKBENCH_FOCUS.gui) setConversationCollapsed(true, { sessionId })
  else if (mode === WORKBENCH_FOCUS.split || mode === WORKBENCH_FOCUS.chat) {
    setConversationCollapsed(false, { sessionId })
  }
  if (!store || typeof store.reduce !== 'function') {
    emit()
    return false
  }
  store.reduce((current) => {
    if (mode === WORKBENCH_FOCUS.chat) {
      return current?.panelOpen === false ? current : { ...current, panelOpen: false }
    }
    let nextWidth = mode === WORKBENCH_FOCUS.gui
      ? workbenchGuiWidthPx(current, env)
      : (typeof record.splitWidth === 'number'
        ? record.splitWidth
        : workbenchDefaultWidthPx(current, env))
    // Split focus must never push the middle conversation column below its min
    // width (gui focus and the collapsed middle are allowed to squeeze it).
    if (mode === WORKBENCH_FOCUS.split) {
      nextWidth = clampSplitPanelWidth(nextWidth, { ...current, panelOpen: true }, { ...env, sessionId })
    }
    if (current?.panelOpen === true && typeof current.width === 'number' && Math.abs(current.width - nextWidth) < 1) {
      return current
    }
    return {
      ...current,
      panelOpen: true,
      width: nextWidth,
    }
  })
  emit()
  syncSplitMaxCssVar(liveSnapshot(store)?.state, env)
  return true
}

export function resetWorkbenchWidthMemory() {
  appliedWidthSessions.clear()
}

/**
 * Write the default GUI width through the tab store (public API has no setWidth).
 * @returns {number | null | undefined} number = applied; null = skip; undefined = wait
 */
export function applyDefaultWidth(service, sessionId, store = getAttachedStore(), env = {}, force = false, targetTabId = undefined) {
  if (!sessionId) return null
  if (!force && appliedWidthSessions.has(sessionId + ':' + (targetTabId || ''))) return null
  const snapshot = (typeof store?.getSnapshot === 'function' ? store.getSnapshot() : null)
    || service?.getSnapshot?.()
  const state = snapshot?.state
  if (!state) return undefined
  const tabId = targetTabId || activeTabId(state)
  const record = focusRecordForTab(sessionId, tabId)
  if (!force && record.mode !== WORKBENCH_FOCUS.split) return null
  // Default split width, then clamp so the middle conversation column keeps its
  // minimum width even when a narrow viewport would otherwise squeeze it.
  const splitMax = workbenchSplitMaxPanelPx(state, env)
  let nextWidth = workbenchDefaultWidthPx(state, env)
  if (nextWidth > splitMax) nextWidth = splitMax
  const canReduce = snapshot?.sessionId === sessionId && typeof store?.reduce === 'function'
  if (typeof state.width === 'number' && Math.abs(state.width - nextWidth) < 1) {
    if (!canReduce) return undefined
    appliedWidthSessions.add(sessionId + ':' + (targetTabId || ''))
    return nextWidth
  }
  if (canReduce) {
    store.reduce((currentState) => (
      typeof currentState?.width === 'number' && Math.abs(currentState.width - nextWidth) < 1
        ? currentState
        : { ...currentState, width: nextWidth, panelOpen: currentState?.panelOpen === false ? true : currentState?.panelOpen }
    ))
    appliedWidthSessions.add(sessionId + ':' + (targetTabId || ''))
    emit()
    return nextWidth
  }
  return undefined
}

function closeDetails() {
  try {
    const layout = getWorkbenchLayout()
    if (typeof layout?.closeDetails === 'function') layout.closeDetails()
  } catch {
    // layout may be an unwired Proxy
  }
}

/**
 * Library overlays claim `data-dsh-product-stage`, which hides the
 * better-sidebar panel. Opening a workbench tab must drop that claim
 * without claiming a new one.
 */
export function releaseCurrentProductStage() {
  const win = hostWindow()
  const doc = hostDocument()
  const current = doc?.documentElement?.dataset?.dshProductStage
  if (!current) return false
  try {
    const stage = win?.__omnimuxStage
    if (stage && typeof stage.release === 'function') stage.release(current)
  } catch {
    // ignore
  }
  if (doc?.documentElement?.dataset?.dshProductStage === current) {
    try { delete doc.documentElement.dataset.dshProductStage } catch { /* ignore */ }
  }
  try {
    win?.dispatchEvent?.(new CustomEvent('dsh-product-stage', { detail: { id: null } }))
  } catch {
    // ignore
  }
  return true
}

/**
 * Workbench tabs are session-scoped (better-sidebar leaf). Without a current
 * session, openTab would attach nowhere — surface a short cue instead of a
 * silent no-op so left-rail clicks do not look "dead".
 */
export function nudgeWorkbenchNeedsSession(doc = hostWindow()?.document) {
  if (!doc || typeof doc.createElement !== 'function') return false
  const chooser =
    doc.querySelector('button[aria-label="Choose workspace"]')
    || doc.querySelector('button[aria-label="选择工作区"]')
    || doc.querySelector('input[aria-label="Choose workspace"]')
    || doc.querySelector('input[aria-label="选择工作区"]')
  try { chooser?.focus?.({ preventScroll: false }) } catch { /* ignore */ }
  try { chooser?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }) } catch { /* ignore */ }

  const existing = doc.getElementById('omnimux-workbench-needs-session')
  if (existing) existing.remove()
  const toast = doc.createElement('div')
  toast.id = 'omnimux-workbench-needs-session'
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
  try {
    doc.body?.appendChild(toast)
    const win = hostWindow()
    win?.setTimeout?.(() => { try { toast.remove() } catch { /* ignore */ } }, 3200)
  } catch {
    return false
  }
  return true
}

/**
 * Open a workbench tab in the right panel. Never claims a product stage.
 * @param {{
 *   tabId: string,
 *   title?: string,
 *   path?: string,
 *   sessionId?: string,
 *   cwd?: string,
 *   timeoutMs?: number,
 * }} opts
 * @returns {Promise<boolean>}
 */
export async function openWorkbench(opts = {}) {
  const tabId = typeof opts.tabId === 'string' ? opts.tabId : ''
  if (!tabId) return false
  closeDetails()
  releaseCurrentProductStage()
  const timeoutMs = opts.timeoutMs ?? 4000
  const service = await waitForBetterSidebar(timeoutMs)
  if (!service || typeof service.openTab !== 'function') return false
  await waitForTab(service, tabId, timeoutMs)

  const sessionId = await ensureSessionId(getWorkbenchSessions(), opts.sessionId)
  if (!sessionId) {
    nudgeWorkbenchNeedsSession()
    return false
  }
  const cwd = opts.cwd
  const scope = { sessionId, ...(cwd ? { cwd } : {}) }
  const ready = await waitForSidebarSession(service, sessionId, timeoutMs)
  const openScope = ready ? scope : undefined

  closeSeedFiles(service, openScope)

  const title = resolveWorkbenchTabTitle(
    tabId,
    opts.title,
    service && typeof service.getTab === 'function' ? (id) => service.getTab(id) : undefined,
  )
  const path = typeof opts.path === 'string' && opts.path ? opts.path : tabId
  service.openTab({
    type: tabId,
    id: tabId,
    title,
    path,
  }, openScope)

  const map = loadSessionFocusMap(sessionId)
  const explicitMode = map[tabId]?.mode
  const targetMode = explicitMode === WORKBENCH_FOCUS.gui || explicitMode === WORKBENCH_FOCUS.split
    ? explicitMode
    : resolveDefaultFocus(tabId)
  setWorkbenchFocus(targetMode, getAttachedStore(), {}, tabId)
  emit()
  return true
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
  emit()
  return true
}

export function closeWorkbenchPanel() {
  return setWorkbenchFocus(WORKBENCH_FOCUS.chat)
}

export function isWorkbenchOpen(tabId) {
  const service = getWorkbenchService()
  const attached = getAttachedStore()
  const snapshot = (typeof attached?.getSnapshot === 'function' ? attached.getSnapshot() : null)
    || service?.getSnapshot?.()
  return tabIsOpen(snapshot?.state, tabId)
}

/**
 * Left-row selection predicate: focused workbench tab only.
 * Presence (`isOpen`) may be true for several coexisting tabs; only the
 * active leaf tab lights the matching left entry. Cleared while the right
 * panel is collapsed (`panelOpen === false` / focus `chat`).
 */
export function isWorkbenchActive(tabId) {
  if (!tabId) return false
  const snapshot = liveSnapshot()
  const state = snapshot?.state
  if (!state || state.panelOpen === false) return false
  return activeTabId(state) === tabId
}

function subscribeWorkbench(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function attachStore(store) {
  if (!store) return
  wrapStoreReduce(store)
  const next = (attachCounts.get(store) || 0) + 1
  attachCounts.set(store, next)
  if (getAttachedStore() === store) return
  setAttachedStore(store)
  const snapshot = liveSnapshot(store)
  if (!snapshot?.state || snapshot.state.panelOpen === false) {
    setConversationCollapsed(false)
    emit()
    return
  }
  const sessionId = currentSessionId() || snapshot?.sessionId
  const tabId = activeTabId(snapshot?.state)
  const record = focusRecordForTab(sessionId, tabId)
  persistClampedSplitWidth(snapshot?.state, record, sessionId, tabId)
  if (record.mode === WORKBENCH_FOCUS.gui) {
    setWorkbenchFocus(record.mode, store)
    return
  }
  record.mode = inferWorkbenchFocus(snapshot?.state)
  applyDefaultWidth(getWorkbenchService(), sessionId, store, {}, false, tabId)
  emit()
}

function detachStore(store) {
  if (!store) {
    setAttachedStore(null)
    return
  }
  const remaining = Math.max(0, (attachCounts.get(store) || 1) - 1)
  if (remaining === 0) attachCounts.delete(store)
  else attachCounts.set(store, remaining)
  if (getAttachedStore() !== store) return
  if (remaining === 0) setAttachedStore(null)
}

function bind(next = {}) {
  bindWorkbenchDeps(next)
  const service = getWorkbenchService()
  clearInitialFilesSeed(service)
  if (service && typeof service.subscribeState === 'function' && !service.__omnimuxWorkbenchHooked) {
    try {
      service.subscribeState(() => {
        clearInitialFilesSeed(service)
        let state
        try {
          state = service.getSnapshot?.()?.state
        } catch {
          state = undefined
        }
        emit()
        syncSplitMaxCssVar(state)
        if (state?.panelOpen && typeof state.width === 'number') {
          const sessionId = currentSessionId()
          const tabId = activeTabId(state)
          const record = focusRecordForTab(sessionId, tabId)
          persistClampedSplitWidth(state, record, sessionId, tabId)
        }
      })
      service.__omnimuxWorkbenchHooked = true
    } catch {
      // ignore
    }
  }
  emit()
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
    applyDefaultWidth: (sessionId, store, env, force) => applyDefaultWidth(getWorkbenchService(), sessionId, store || getAttachedStore(), env, force),
    getSnapshot: () => getWorkbenchService()?.getSnapshot?.() || null,
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
  // Upgrade in place when an older singleton is missing pane APIs (#372).
  if (existing !== undefined) {
    if (typeof existing.getConversationCollapsed === 'function') return existing
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
  listeners.clear()
  appliedWidthSessions.clear()
  resetWorkbenchFocusMemory()
  resetWorkbenchGeometryMemory()
  resetConversationCollapseForTests()
  resetWorkbenchContextContributors()
  if (target && Object.prototype.hasOwnProperty.call(target, WORKBENCH_GLOBAL_KEY)) {
    try { delete target[WORKBENCH_GLOBAL_KEY] } catch { target[WORKBENCH_GLOBAL_KEY] = undefined }
  }
}

/**
 * StageStore-shaped adapter for `createSidebarEntry`. `open()` talks to the
 * workbench global; it never claims a product stage.
 * @param {{ tabId: string, title?: string | (() => string), path?: string }} options
 */
export function createWorkbenchSidebarStore(options) {
  const tabId = options.tabId
  const path = options.path || tabId
  const resolveTitle = () => {
    const title = options.title
    return typeof title === 'function' ? title() : (title || tabId)
  }
  const apiOf = () => hostWindow()?.[WORKBENCH_GLOBAL_KEY]
  return {
    getSnapshot() {
      const api = apiOf()
      if (api && typeof api.isActive === 'function') return Boolean(api.isActive(tabId))
      return Boolean(api && typeof api.isOpen === 'function' && api.isOpen(tabId))
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {}
      const api = apiOf()
      if (api && typeof api.subscribe === 'function') return api.subscribe(listener)
      let unsub = () => {}
      const started = Date.now()
      const timer = setInterval(() => {
        const next = apiOf()
        if (next && typeof next.subscribe === 'function') {
          clearInterval(timer)
          unsub = next.subscribe(listener)
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
      const api = apiOf()
      if (!api || typeof api.open !== 'function') return
      void api.open({ tabId, title: resolveTitle(), path })
    },
    close() {
      const api = apiOf()
      if (api && typeof api.closeTab === 'function') {
        api.closeTab(tabId)
      } else {
        api?.closePanel?.()
      }
    },
    set(next) {
      if (next) this.open()
      else this.close()
    },
    readBox() {
      return EMPTY_BOX
    },
  }
}

if (hostWindow()) installWorkbenchGlobal(hostWindow())
