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
 */

import {
  CONVERSATION_COLLAPSED_ATTR,
  getConversationCollapsed,
  hydrateConversationCollapsed,
  resetConversationCollapseForTests,
  setConversationCollapsed,
} from './conversation-collapse.js'

export const WORKBENCH_GLOBAL_KEY = '__omnimuxWorkbench'
export const WORKBENCH_PANEL_MIN_PX = 280
export const WORKBENCH_CONVERSATION_TARGET_PX = 420
/** Visible split conversation floor. CSS and live drag clamp share this value. */
export const WORKBENCH_CONVERSATION_MIN_PX = 360
export const WORKBENCH_SPLIT_MAX_CSS_VAR = '--omnimux-split-max'
/**
 * Marker stamped on the resolved real better-sidebar right panel so the
 * split-min CSS max-width keeps applying after the drag ends — the panel
 * itself has no host attribute and only carries `data-dragging` mid-drag
 * (#505). React never removes attributes it did not set, so the marker
 * survives re-renders.
 */
export const WORKBENCH_PANEL_ATTR = 'data-omnimux-workbench-panel'
export const WORKBENCH_FOCUS_NEAR_PX = 24
/**
 * Upper bound for "looks collapsed" live measures while the track is tweening.
 * Official collapsed rail is ~56px; macOS advanced can sit near ~90. Values at
 * or below this are trusted when `data-sidebar-collapsed` is set. This is NOT
 * the preferred collapsed target — see COLLAPSED_FALLBACK_PX.
 */
export const WORKBENCH_LEFT_RAIL_COLLAPSED_MAX_PX = 72
/**
 * Preferred collapsed rail when attr is set but the grid track still reports expanded.
 * When topbar sidebar-toggle feature is on (visual 0 rail), effective fallback is 0
 * via {@link collapsedLeftRailFallbackPx} — constant stays 56 for non-feature paths.
 */
export const WORKBENCH_LEFT_RAIL_COLLAPSED_FALLBACK_PX = 56
/**
 * Healthy expanded rail is ~280px. Mid-animation widths (e.g. 80–200) sit above
 * the collapsed max but must NOT poison `lastExpandedOfficialWidth` / gui math.
 */
export const WORKBENCH_LEFT_RAIL_EXPANDED_MIN_PX = 200
/** Fallback when the expanded left rail is crushed by an oversized right panel. */
export const WORKBENCH_LEFT_RAIL_EXPANDED_FALLBACK_PX = 280
/** Debounce left-rail resize sync so mid-tween frames do not write a half-open width. */
export const WORKBENCH_LEFT_RAIL_SYNC_DEBOUNCE_MS = 50
/**
 * After a collapse/expand attr flip, AppFrame may still be mid-tween when the
 * debounced sync runs. One settle pass after the track finishes re-measures the
 * true rail (56 official / ~90 advanced) so gui width is not stuck on a stale
 * interim measure (historically 72 → 16px gutter at panel.left).
 */
export const WORKBENCH_LEFT_RAIL_SETTLE_MS = 320
export const WORKBENCH_FOCUS = Object.freeze({
  split: 'split',
  gui: 'gui',
  chat: 'chat',
})

export {
  getConversationCollapsed,
  setConversationCollapsed,
  hydrateConversationCollapsed,
  CONVERSATION_COLLAPSED_ATTR,
} from './conversation-collapse.js'

export const WORKBENCH_OCCUPANTS = Object.freeze([
  'omnimux-workflow:canvas',
  'omnimux-clip:studio',
  'omnimux-assets:library',
  'omnimux-products:library',
  'omnimux-accounts:library',
  'omnimux-inspiration:library',
  'omnimux-publish:library',
  'omnimux-analytics:library',
  'omnimux-workflow:library',
  'omnimux-market:plaza',
])

/** Human-readable Tab titles when registerTab title is unavailable (#345). */
export const WORKBENCH_TAB_TITLE_FALLBACKS = Object.freeze({
  'omnimux-workflow:canvas': '创作画布',
  'omnimux-clip:studio': '视频剪辑',
  'omnimux-assets:library': '资产库',
  'omnimux-products:library': '产品库',
  'omnimux-accounts:library': '账号',
  'omnimux-inspiration:library': '灵感库',
  'omnimux-publish:library': '发布',
  'omnimux-analytics:library': '数据分析',
  'omnimux-workflow:library': '项目',
  'omnimux-market:plaza': '插件市场',
})

export function resolveWorkbenchTabTitle(tabId, optsTitle, getTab) {
  if (typeof optsTitle === 'string' && optsTitle.trim()) return optsTitle.trim()
  if (typeof getTab === 'function' && tabId) {
    try {
      const desc = getTab(tabId)
      const raw = desc?.title
      const fromDesc = typeof raw === 'function' ? raw() : raw
      if (typeof fromDesc === 'string' && fromDesc.trim() && fromDesc.trim() !== tabId) {
        return fromDesc.trim()
      }
    } catch {
      // fall through
    }
  }
  if (tabId && WORKBENCH_TAB_TITLE_FALLBACKS[tabId]) return WORKBENCH_TAB_TITLE_FALLBACKS[tabId]
  return tabId || ''
}

export function isWorkbenchTab(tabId) {
  if (!tabId || typeof tabId !== 'string') return false
  if (WORKBENCH_OCCUPANTS.includes(tabId)) return true
  return tabId.startsWith('omnimux-') && (tabId.includes(':') || tabId.endsWith('-stage') || tabId.endsWith(':library') || tabId.endsWith(':studio') || tabId.endsWith(':plaza'))
}

export function resolveDefaultFocus(tabId) {
  if (tabId && isWorkbenchTab(tabId) && tabId !== 'omnimux-workflow:canvas') {
    return WORKBENCH_FOCUS.gui
  }
  return WORKBENCH_FOCUS.split
}

const EMPTY_BOX = Object.freeze({ top: 0, left: 0, width: 0, height: 0 })

/** @type {Set<() => void>} */
const listeners = new Set()

/** @type {{ betterSidebar?: object, layout?: object, sessions?: object }} */
const deps = {
  betterSidebar: null,
  layout: null,
  sessions: null,
}

/** @type {object | null} */
let attachedStore = null

/** @type {WeakMap<object, number>} */
const attachCounts = new WeakMap()

/** Sessions that already received a default width write. */
const appliedWidthSessions = new Set()

/** Sessions whose initial sidebar snapshot was classified for default seed cleanup. */
const classifiedSeedSessions = new Set()
const SIDEBAR_LAYOUT_STORAGE_PREFIX = 'dsh-sidebar:v1:'

/** In-memory focus records: sessionId -> { [tabId]: { mode, splitWidth } } */
const focusStorageBySession = new Map()

/** Last healthy expanded left-rail width; used when #root crush reports ~56px. */
let lastExpandedOfficialWidth = WORKBENCH_LEFT_RAIL_EXPANDED_FALLBACK_PX
/** Last trusted collapsed left-rail width (56 official / advanced rail-sized). */
let lastCollapsedOfficialWidth = WORKBENCH_LEFT_RAIL_COLLAPSED_FALLBACK_PX

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

function waitMs(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/**
 * Recursively collect split-tree tabs (does not depend on better-sidebar internals).
 * @param {object | null | undefined} node
 * @returns {Array<{ id?: string, type?: string, path?: string }>}
 */
export function collectTabs(node) {
  if (!node || typeof node !== 'object') return []
  if (node.kind === 'leaf') return Array.isArray(node.tabs) ? node.tabs : []
  if (!Array.isArray(node.children)) return []
  return node.children.flatMap(collectTabs)
}

/**
 * Empty Files seed: type=editor with no path. User-opened editors keep their path.
 * @param {{ type?: string, path?: string }} tab
 */
export function isSeedFilesTab(tab) {
  return tab?.type === 'editor' && (tab.path === undefined || tab.path === '')
}

export function listOpenTabs(state) {
  if (!state) return []
  return collectTabs(state.splits).concat(collectTabs(state.bottomSplits))
}

export function activeTabId(state) {
  if (!state) return undefined
  const activePaneId = state.activePane
  const findLeaf = (node) => {
    if (!node || typeof node !== 'object') return null
    if (node.kind === 'leaf') return node.id === activePaneId || !activePaneId ? node : null
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = findLeaf(child)
        if (found) return found
      }
    }
    return null
  }
  const leaf = findLeaf(state.splits) || findLeaf(state.bottomSplits)
  return leaf?.active ?? leaf?.tabs?.[0]?.id ?? undefined
}

export function tabIsOpen(state, tabId) {
  if (!tabId) return false
  return listOpenTabs(state).some((tab) => tab.id === tabId || tab.type === tabId)
}

function hostWindow() {
  return typeof globalThis.window !== 'undefined' ? globalThis.window : undefined
}

function hostDocument() {
  return typeof globalThis.document !== 'undefined' ? globalThis.document : hostWindow()?.document
}

/**
 * Effective collapsed left-rail fallback for gui geometry.
 * Topbar feature (`html[data-omnimux-sidebar-toggle-topbar]`) visually zeros the
 * rail; workbench must not leave a 56px gutter. Does not touch conversation collapse.
 * @param {Document | null | undefined} [doc]
 * @returns {number}
 */
export function collapsedLeftRailFallbackPx(doc) {
  const rootDoc = doc === undefined ? hostDocument() : doc
  try {
    if (rootDoc?.documentElement?.hasAttribute?.('data-omnimux-sidebar-toggle-topbar')) {
      return 0
    }
  } catch {
    // ignore
  }
  return WORKBENCH_LEFT_RAIL_COLLAPSED_FALLBACK_PX
}

function viewportWidth() {
  return hostWindow()?.innerWidth || 0
}

/**
 * Official left-rail column: AppFrame `sidebarCol` / pane, or AdvancedFrame
 * `dshDesktopSidebarSurface` (no sidebarCol class on that shell).
 */
export function findOfficialSidebarColumn(doc = hostDocument()) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  return doc.querySelector(
    '[data-pane="sidebar"], [class*="sidebarCol"], .dshDesktopSidebarSurface, [class*="dshDesktopSidebarSurface"]',
  )
}

/**
 * Geometry sanity check for panel candidates resolved from generic markers.
 * `[data-dragging]` also appears on official AppFrame drag targets, so a
 * candidate that is measurably NOT right-anchored to the viewport edge (or
 * measurably narrower than the panel minimum) is rejected. Unmeasurable
 * candidates (headless fakes) are given the benefit of the doubt.
 */
function isLikelyWorkbenchPanel(el) {
  if (!el || typeof el !== 'object') return false
  if (typeof el.getBoundingClientRect !== 'function') return true
  let rect
  try { rect = el.getBoundingClientRect() } catch { return true }
  const viewport = viewportWidth()
  if (!rect || typeof rect.right !== 'number' || !Number.isFinite(rect.right)) return true
  if (viewport > 0 && rect.right < viewport - 12) return false
  if (typeof rect.width === 'number' && Number.isFinite(rect.width)
    && rect.width > 0 && rect.width < WORKBENCH_PANEL_MIN_PX - 1) return false
  return true
}

/**
 * Resolve the real rendered better-sidebar right panel (#505).
 *
 * The panel element itself has no stable marker: `data-dragging` exists only
 * mid-drag and `data-dsh-panel-host` belongs to a different host. Resolution
 * order, most to least specific:
 * 1. The width resize strip — a direct child of the panel with the stable
 *    semantic class fragment `panelResize` (the CSS-module hash prefix
 *    varies; the bottom panel uses `bottomResize`, so no collision).
 * 2. A panel we already tagged with {@link WORKBENCH_PANEL_ATTR}.
 * 3. A `[data-dragging]` node that passes the right-anchored geometry check
 *    (official AppFrame drag targets do not hug the viewport's right edge).
 */
export function findWorkbenchPanelElement(doc = hostDocument()) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  try {
    const handle = doc.querySelector('[class*="panelResize"]')
    if (handle?.parentElement && isLikelyWorkbenchPanel(handle.parentElement)) {
      return handle.parentElement
    }
    const tagged = doc.querySelector(`[${WORKBENCH_PANEL_ATTR}]`)
    if (tagged) return tagged
    const dragging = doc.querySelector('[data-dragging]')
    if (dragging && isLikelyWorkbenchPanel(dragging)) return dragging
  } catch {
    // ignore
  }
  return null
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
 * Whether the user is actively dragging the workbench panel divider.
 * Scoped to the resolved panel (plus better-sidebar's body flag) — a bare
 * `document.querySelector('[data-dragging]')` can false-positive on official
 * AppFrame drag targets and wrongly suspend width sync.
 */
function isWorkbenchPanelDragging(doc = hostDocument(), panel = findWorkbenchPanelElement(doc)) {
  if (doc?.body?.hasAttribute?.('data-dsh-sidebar-dragging')) return true
  return Boolean(panel?.hasAttribute?.('data-dragging'))
}

/**
 * Host that carries `data-sidebar-collapsed` (AppFrame / AdvancedFrame root).
 * Prefer the sidebar column's nearest marked ancestor or its parent frame —
 * same resolution as `sidebar-coordinator.collapsedHostNode`. Bare
 * `document.querySelector('[data-sidebar-collapsed]')` is unsafe: zero-size
 * slot shells or unrelated markers can false-positive and lock width math.
 */
export function officialSidebarCollapsedHost(doc = hostDocument()) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  const column = findOfficialSidebarColumn(doc)
  if (column && typeof column.closest === 'function') {
    try {
      const marked = column.closest('[data-sidebar-collapsed]')
      if (marked) return marked
    } catch {
      // ignore
    }
    if (column.parentElement) return column.parentElement
    try {
      const slot = column.closest('[data-slot="root"]')
      if (slot) return slot
    } catch {
      // ignore
    }
  }
  const marked = doc.querySelector(
    '[class*="frame"][data-sidebar-collapsed], .dshDesktopFrame[data-sidebar-collapsed], [data-slot="root"] > [data-sidebar-collapsed], [data-sidebar-collapsed]',
  )
  if (marked) return marked
  const slot = doc.querySelector('[data-slot="root"]')
  if (slot) return slot
  return null
}

/**
 * Whether the official left session rail is collapsed.
 * Truth order:
 * 1. `data-sidebar-collapsed` on the frame host above the sidebar column
 *    (AppFrame / AdvancedFrame — not a random descendant / phantom slot).
 * 2. Optional class cue on the rail root (`_root` + `collapsed`, e.g. `_9I8crW_collapsed`).
 */
export function isOfficialSidebarCollapsed(doc = hostDocument()) {
  if (!doc || typeof doc.querySelector !== 'function') return false
  const column = findOfficialSidebarColumn(doc)
  if (column && typeof column.closest === 'function') {
    try {
      if (column.closest('[data-sidebar-collapsed]')) return true
    } catch {
      // ignore
    }
  }
  // Frame-level attr without going through a crushed/missing column.
  const frame = doc.querySelector(
    '[class*="frame"][data-sidebar-collapsed], .dshDesktopFrame[data-sidebar-collapsed]',
  )
  if (frame) return true
  // Rail class assist (official CSS-module collapsed). Do not treat this alone
  // as stronger than a missing frame attr when the column is clearly expanded.
  const rail = column?.querySelector?.('[class*="_root"]')
    || doc.querySelector('[class*="_root"][class*="collapsed"]')
  if (rail && typeof rail.className === 'string') {
    const cls = rail.className
    if (/\bcollapsed\b|_collapsed\b/.test(cls) || (cls.includes('_root') && cls.includes('collapsed'))) {
      // If the grid column is already expanded, prefer geometry over a stale class.
      if (column && typeof column.getBoundingClientRect === 'function') {
        const w = column.getBoundingClientRect().width
        if (typeof w === 'number' && w >= WORKBENCH_LEFT_RAIL_EXPANDED_MIN_PX) return false
      }
      return true
    }
  }
  return false
}

/**
 * Live width of the official left session rail.
 * When focus is `gui`, better-sidebar crushes `#root` to `viewport − panel`.
 * If that panel was sized while the rail was collapsed, an expanded rail can
 * still report ~56px (or overflow under the z-index:40 panel). Prefer the last
 * healthy expanded width so `gui` can recover instead of locking the cover.
 *
 * Collapse is the inverse: AppFrame flips `data-sidebar-collapsed` before the
 * grid track finishes animating to the ~56px rail. Returning that stale live
 * width (often still ~280) makes `gui = viewport − expanded` leave a gap to
 * the right of the true rail. While collapsed, only trust rail-sized measures
 * (#418 collapsed branch — keep).
 */
export function officialSessionSidebarWidth(env = {}) {
  if (typeof env.officialSidebarWidth === 'number' && Number.isFinite(env.officialSidebarWidth)) {
    const forced = Math.max(0, env.officialSidebarWidth)
    if (forced >= WORKBENCH_LEFT_RAIL_EXPANDED_MIN_PX) lastExpandedOfficialWidth = Math.round(forced)
    return forced
  }
  const doc = hostDocument()
  if (!doc || typeof doc.querySelector !== 'function') return 0
  const column = findOfficialSidebarColumn(doc)
  if (!column || typeof column.getBoundingClientRect !== 'function') return 0
  const width = column.getBoundingClientRect().width
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return 0
  const collapsed = isOfficialSidebarCollapsed(doc)
  if (collapsed) {
    // Topbar visual-0 feature: official track may still report 56, but chrome
    // CSS zeros the rail. Gui math must use 0 (no 56 gutter). Not middle-pane.
    const zeroRail = collapsedLeftRailFallbackPx(doc) === 0
    if (zeroRail) {
      lastCollapsedOfficialWidth = 0
      return 0
    }
    // Attribute lands before the track tween finishes. Trust any sub-expanded
    // measure (56 official rail, ~90 macOS advanced, mid-tween). Only reject
    // still-expanded widths so gui can fill instead of leaving a gap.
    if (width > 0 && width < WORKBENCH_LEFT_RAIL_EXPANDED_MIN_PX) {
      const rounded = Math.round(width)
      // Remember true rail-sized collapses (not loose mid-tween 100–199) so a
      // later attr-only frame can target panel.left == rail.right instead of
      // the historic 72 max that left a 16px gutter on the 56px official rail.
      if (rounded <= WORKBENCH_LEFT_RAIL_COLLAPSED_MAX_PX) {
        lastCollapsedOfficialWidth = rounded
      }
      return rounded
    }
    return lastCollapsedOfficialWidth || collapsedLeftRailFallbackPx(doc)
  }
  // Crushed under an oversized panel, or mid expand/collapse tween: keep last healthy width.
  if (width < WORKBENCH_LEFT_RAIL_EXPANDED_MIN_PX) {
    return lastExpandedOfficialWidth
  }
  lastExpandedOfficialWidth = Math.round(width)
  return width
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
export function syncWorkbenchGuiWidth(store = attachedStore, env = {}) {
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

export function workbenchUsableWidthPx(state, env = {}) {
  const viewport = typeof env.viewportWidth === 'number' ? env.viewportWidth : viewportWidth()
  const official = officialSessionSidebarWidth(env)
  if (viewport > 0 && official > 0) return Math.max(0, viewport - official)
  const extra = state?.panelOpen === false
    ? 0
    : (typeof state?.width === 'number' && Number.isFinite(state.width) ? state.width : 0)
  const conversation = typeof env.conversationWidth === 'number' ? env.conversationWidth : 0
  return conversation > 0 ? conversation + extra : 0
}

/**
 * Default GUI width: keep ~420px for the conversation column, give the rest
 * to the right panel (same ruler as the project canvas 15:85).
 */
export function workbenchDefaultWidthPx(state, env = {}) {
  const viewport = typeof env.viewportWidth === 'number' ? env.viewportWidth : viewportWidth()
  const max = viewport > 0 ? Math.max(WORKBENCH_PANEL_MIN_PX, viewport) : WORKBENCH_PANEL_MIN_PX
  const usable = workbenchUsableWidthPx(state, env)
  if (usable <= 0) {
    const raw = viewport > 0
      ? Math.max(WORKBENCH_PANEL_MIN_PX, viewport - WORKBENCH_CONVERSATION_TARGET_PX)
      : WORKBENCH_PANEL_MIN_PX
    return Math.min(max, raw)
  }
  let target = usable - WORKBENCH_CONVERSATION_TARGET_PX
  if (target < WORKBENCH_PANEL_MIN_PX) target = usable - WORKBENCH_CONVERSATION_MIN_PX
  return Math.min(max, Math.max(WORKBENCH_PANEL_MIN_PX, Math.round(target)))
}

/**
 * GUI-focus width: occupy the remainder of the viewport after the official
 * left rail. Conversation stays mounted and is squeezed by better-sidebar's
 * `#root { margin-right }`.
 */
export function workbenchGuiWidthPx(state, env = {}) {
  const viewport = typeof env.viewportWidth === 'number' ? env.viewportWidth : viewportWidth()
  const official = officialSessionSidebarWidth(env)
  const max = viewport > 0 ? Math.max(WORKBENCH_PANEL_MIN_PX, viewport) : WORKBENCH_PANEL_MIN_PX
  if (viewport > 0) {
    const next = Math.max(WORKBENCH_PANEL_MIN_PX, Math.round(viewport - Math.max(0, official)))
    return Math.min(max, next)
  }
  const usable = workbenchUsableWidthPx({ ...state, panelOpen: false }, env)
  if (usable > 0) return Math.min(max, Math.max(WORKBENCH_PANEL_MIN_PX, Math.round(usable)))
  return WORKBENCH_PANEL_MIN_PX
}

/**
 * Largest right-panel width that still leaves the middle conversation column at
 * least WORKBENCH_CONVERSATION_MIN_PX wide, given the viewport and the official
 * left session rail. Split focus is clamped to this; intentional gui and the
 * collapsed middle column are never clamped (the column is allowed to be 0).
 * When the viewport cannot be measured it has no safe bound, so it conservatively
 * returns the current panel width / gui upper bound (it never reduces an existing
 * split that it cannot reason about).
 */
export function workbenchSplitMaxPanelPx(state, env = {}) {
  const viewport = typeof env.viewportWidth === 'number' ? env.viewportWidth : viewportWidth()
  const leftRail = officialSessionSidebarWidth(env)
  if (viewport > 0) {
    return Math.max(WORKBENCH_PANEL_MIN_PX, viewport - leftRail - WORKBENCH_CONVERSATION_MIN_PX)
  }
  const current = typeof state?.width === 'number' && Number.isFinite(state.width) ? state.width : 0
  const gui = workbenchGuiWidthPx(state, env)
  return Math.max(WORKBENCH_PANEL_MIN_PX, current, gui)
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

export function splitConversationMinApplies(state, env = {}) {
  if (!state || state.panelOpen === false) return false
  if (getConversationCollapsed()) return false
  const sessionId = env.sessionId || liveSnapshot()?.sessionId
  const record = focusRecordForTab(sessionId, activeTabId(state))
  return record.mode !== WORKBENCH_FOCUS.gui
}

export function clampSplitPanelWidth(width, state, env = {}) {
  if (typeof width !== 'number' || !Number.isFinite(width)) return width
  const rounded = Math.round(width)
  if (!splitConversationMinApplies(state, env)) {
    return Math.max(WORKBENCH_PANEL_MIN_PX, rounded)
  }
  const max = workbenchSplitMaxPanelPx(state, env)
  return Math.min(max, Math.max(WORKBENCH_PANEL_MIN_PX, rounded))
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
      const store = attachedStore
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

function nearPx(width, target) {
  return Math.abs(width - target) <= WORKBENCH_FOCUS_NEAR_PX
}

function liveSnapshot(store = attachedStore) {
  return (typeof store?.getSnapshot === 'function' ? store.getSnapshot() : null)
    || getService()?.getSnapshot?.()
    || null
}

function sessionKey(explicitId) {
  return explicitId || currentSessionId() || liveSnapshot()?.sessionId || '__none__'
}

const STORAGE_PREFIX = 'omnimux-workbench-focus:v1:'

function loadSessionFocusMap(sessionId = sessionKey()) {
  if (focusStorageBySession.has(sessionId)) {
    return focusStorageBySession.get(sessionId)
  }
  let map = {}
  try {
    const raw = hostWindow()?.localStorage?.getItem?.(STORAGE_PREFIX + sessionId)
    if (raw) map = JSON.parse(raw) || {}
  } catch {}
  focusStorageBySession.set(sessionId, map)
  return map
}

function persistSessionFocus(sessionId, tabId, patch) {
  if (!sessionId || !tabId) return
  const map = loadSessionFocusMap(sessionId)
  map[tabId] = { ...(map[tabId] || {}), ...patch }
  try {
    hostWindow()?.localStorage?.setItem?.(STORAGE_PREFIX + sessionId, JSON.stringify(map))
  } catch {}
}

export function focusRecordForTab(sessionId = sessionKey(), tabId = undefined) {
  const snap = liveSnapshot()
  const effectiveTabId = tabId || activeTabId(snap?.state) || 'default'
  const map = loadSessionFocusMap(sessionId)
  if (!map[effectiveTabId]) {
    map[effectiveTabId] = {
      mode: resolveDefaultFocus(effectiveTabId),
      splitWidth: null,
    }
  }
  return map[effectiveTabId]
}

function rememberSplitWidth(state, record, sessionId, tabId, env = {}) {
  persistClampedSplitWidth(state, record, sessionId, tabId, env)
}

/**
 * Infer the current focus from live panel geometry. Chat = collapsed panel
 * (conversation still mounted). GUI = panel ≈ viewport − left rail. Else split.
 */
export function inferWorkbenchFocus(state, env = {}) {
  if (!state || state.panelOpen === false) return WORKBENCH_FOCUS.chat
  if (typeof state.width === 'number' && nearPx(state.width, workbenchGuiWidthPx(state, env))) {
    return WORKBENCH_FOCUS.gui
  }
  return WORKBENCH_FOCUS.split
}

export function getWorkbenchFocus(env = {}) {
  const snapshot = liveSnapshot()
  const state = snapshot?.state
  if (!state || state.panelOpen === false) return WORKBENCH_FOCUS.chat
  const inferred = inferWorkbenchFocus(state, env)
  const tabId = activeTabId(state)
  const record = focusRecordForTab(snapshot?.sessionId, tabId)

  // Preserve explicit gui intent while the panel is open. A width sized for the
  // collapsed ~56px rail is farther than NEAR from the expanded-rail gui target;
  // rewriting record.mode to split here makes syncWorkbenchGuiWidth no-op and
  // leaves the right panel covering the session list (#356).
  if (record.mode === WORKBENCH_FOCUS.gui && state?.panelOpen !== false) {
    return WORKBENCH_FOCUS.gui
  }
  // Sticky middle-collapse also reports as gui while the right panel is open (#372).
  if (getConversationCollapsed() && state?.panelOpen !== false) {
    return WORKBENCH_FOCUS.gui
  }
  record.mode = inferred
  return inferred
}

/**
 * Switch focus by writing better-sidebar geometry. Never unmounts conversation.
 * @param {'split' | 'gui' | 'chat'} mode
 * @returns {boolean}
 */
export function setWorkbenchFocus(mode, store = attachedStore, env = {}, targetTabId = undefined) {
  if (mode !== WORKBENCH_FOCUS.split && mode !== WORKBENCH_FOCUS.gui && mode !== WORKBENCH_FOCUS.chat) {
    return false
  }
  const snapshot = liveSnapshot(store)
  const state = snapshot?.state
  const sessionId = snapshot?.sessionId
  const prevTabId = activeTabId(state)
  const prevRecord = focusRecordForTab(sessionId, prevTabId)
  rememberSplitWidth(state, prevRecord, sessionId, prevTabId, env)

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

export function resetWorkbenchFocusMemory() {
  focusStorageBySession.clear()
}

function getService() {
  return deps.betterSidebar || null
}

function currentSessionId(sessions = deps.sessions) {
  try {
    const snap = sessions?.list?.getSnapshot?.()
    if (snap?.current) return String(snap.current)
  } catch {
    // Cordis Proxy may throw on unread services.
  }
  return undefined
}

async function ensureSessionId(sessions, explicitId) {
  if (explicitId) return String(explicitId)
  return currentSessionId(sessions)
}

export async function waitForBetterSidebar(timeoutMs = 4000) {
  const first = getService()
  if (first && typeof first.openTab === 'function') return first
  if (timeoutMs <= 0) return first
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    const service = getService()
    if (service && typeof service.openTab === 'function') return service
    await waitMs(50)
  }
  return getService()
}

async function waitForSidebarSession(service, sessionId, timeoutMs = 4000) {
  if (!service || !sessionId || typeof service.getSnapshot !== 'function') return false
  if (service.getSnapshot()?.sessionId === sessionId) return true
  if (timeoutMs <= 0) return false
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    if (service.getSnapshot()?.sessionId === sessionId) return true
    await waitMs(50)
  }
  return service.getSnapshot()?.sessionId === sessionId
}

async function waitForTab(service, tabId, timeoutMs = 4000) {
  if (!service || typeof service.getTab !== 'function') return Boolean(service)
  if (service.getTab(tabId)) return true
  if (timeoutMs <= 0) return false
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    if (service.getTab(tabId)) return true
    await waitMs(50)
  }
  return Boolean(service.getTab(tabId))
}

function closeSeedFiles(service, openScope) {
  const state = service.getSnapshot?.()?.state
  if (!state || typeof service.closeTab !== 'function') return
  const tabs = listOpenTabs(state)
  for (const tab of tabs) {
    if (isSeedFilesTab(tab) && tab.id) {
      try { service.closeTab(tab.id, openScope) } catch { /* ignore */ }
    }
  }
}

/**
 * Classify one session exactly once when its first sidebar snapshot arrives.
 * A reliable absent storage key identifies better-sidebar's factory state;
 * closing its path-less editor leaves the pane empty so PaneEmptyCards renders.
 */
function clearInitialFilesSeed(service) {
  if (!service || typeof service.getSnapshot !== 'function' || typeof service.closeTab !== 'function') return false
  let snapshot
  try {
    snapshot = service.getSnapshot()
  } catch {
    return false
  }
  const sessionId = snapshot?.sessionId
  const state = snapshot?.state
  if (!sessionId || !state || classifiedSeedSessions.has(sessionId)) return false

  let hasPersistedLayout
  try {
    const storage = hostWindow()?.localStorage
    if (!storage || typeof storage.getItem !== 'function') return false
    hasPersistedLayout = storage.getItem(SIDEBAR_LAYOUT_STORAGE_PREFIX + sessionId) !== null
  } catch {
    return false
  }

  classifiedSeedSessions.add(sessionId)
  if (hasPersistedLayout) return false
  const seed = listOpenTabs(state).find((tab) => isSeedFilesTab(tab) && tab.id)
  if (!seed) return false
  try {
    service.closeTab(seed.id, { sessionId })
    return true
  } catch {
    return false
  }
}

/**
 * Write the default GUI width through the tab store (public API has no setWidth).
 * @returns {number | null | undefined} number = applied; null = skip; undefined = wait
 */
export function applyDefaultWidth(service, sessionId, store = attachedStore, env = {}, force = false, targetTabId = undefined) {
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
    if (typeof deps.layout?.closeDetails === 'function') deps.layout.closeDetails()
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

export async function openWorkbench(opts = {}) {
  const tabId = typeof opts.tabId === 'string' ? opts.tabId : ''
  if (!tabId) return false
  closeDetails()
  releaseCurrentProductStage()
  const timeoutMs = opts.timeoutMs ?? 4000
  const service = await waitForBetterSidebar(timeoutMs)
  if (!service || typeof service.openTab !== 'function') return false
  await waitForTab(service, tabId, timeoutMs)

  const sessionId = await ensureSessionId(deps.sessions, opts.sessionId)
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
  setWorkbenchFocus(targetMode, attachedStore, {}, tabId)
  emit()
  return true
}

export function closeWorkbenchTab(tabId) {
  if (!tabId) return false
  const service = getService()
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
  const service = getService()
  const snapshot = (typeof attachedStore?.getSnapshot === 'function' ? attachedStore.getSnapshot() : null)
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
  if (attachedStore === store) return
  attachedStore = store
  const snapshot = liveSnapshot(store)
  if (!snapshot?.state || snapshot.state.panelOpen === false) {
    setConversationCollapsed(false)
    emit()
    return
  }
  const sessionId = currentSessionId() || snapshot?.sessionId
  const tabId = activeTabId(snapshot?.state)
  const record = focusRecordForTab(sessionId, tabId)
  rememberSplitWidth(snapshot?.state, record, sessionId, tabId)
  if (record.mode === WORKBENCH_FOCUS.gui) {
    setWorkbenchFocus(record.mode, store)
    return
  }
  record.mode = inferWorkbenchFocus(snapshot?.state)
  applyDefaultWidth(getService(), sessionId, store, {}, false, tabId)
  emit()
}

function detachStore(store) {
  if (!store) {
    attachedStore = null
    return
  }
  const remaining = Math.max(0, (attachCounts.get(store) || 1) - 1)
  if (remaining === 0) attachCounts.delete(store)
  else attachCounts.set(store, remaining)
  if (attachedStore !== store) return
  if (remaining === 0) attachedStore = null
}

function bind(next = {}) {
  if (next.betterSidebar !== undefined) deps.betterSidebar = next.betterSidebar || null
  if (next.layout !== undefined) deps.layout = next.layout || null
  if (next.sessions !== undefined) deps.sessions = next.sessions || null
  const service = getService()
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

const contextContributors = new Map()

export function registerContextContributor(tabId, contributor) {
  if (!tabId || typeof contributor !== 'function') return () => {}
  contextContributors.set(tabId, contributor)
  return () => {
    contextContributors.delete(tabId)
  }
}

export function unregisterContextContributor(tabId) {
  contextContributors.delete(tabId)
}

/**
 * Normalize a better-sidebar tab into a stable descriptor for Agent context.
 * Native official tabs (Files editor, terminal, browser, …) use opaque ids
 * like `tab:5`; their human title lives on `tab.title` / `tab.type`.
 * @param {{ id?: string, type?: string, title?: string, path?: string }} tab
 */
export function describeOpenTab(tab) {
  if (!tab || typeof tab !== 'object') return null
  const id = typeof tab.id === 'string' && tab.id ? tab.id : null
  if (!id) return null
  const type = typeof tab.type === 'string' && tab.type ? tab.type : id
  const fallback = WORKBENCH_TAB_TITLE_FALLBACKS[id] || WORKBENCH_TAB_TITLE_FALLBACKS[type] || null
  const rawTitle = typeof tab.title === 'string' ? tab.title.trim() : ''
  const title = rawTitle || fallback || id
  const kind = isWorkbenchTab(id) || isWorkbenchTab(type)
    ? 'workbench'
    : type === 'editor' || title === 'Files' || isSeedFilesTab(tab)
      ? 'files'
      : 'native'
  return { id, type, title, kind }
}

export function getUiContext() {
  const service = getService()
  const snap = service?.getSnapshot?.()
  const state = snap?.state || snap
  const activeTab = activeTabId(state)
  const panelOpen = Boolean(state?.panelOpen)
  const focus = getWorkbenchFocus()
  const conversationCollapsed = Boolean(getConversationCollapsed())
  const openedTabs = listOpenTabs(state).map(describeOpenTab).filter(Boolean)
  const sessionId = currentSessionId() || snap?.sessionId || 'default'
  const activeDesc = openedTabs.find((t) => t.id === activeTab)
    || (activeTab ? describeOpenTab({ id: activeTab, type: activeTab }) : null)

  let reason = 'ok'
  let view = null
  let selection = []

  if (!panelOpen) {
    reason = 'panel-collapsed'
  } else if (activeTab) {
    reason = 'ok'
    const contributor = contextContributors.get(activeTab)
    if (typeof contributor === 'function') {
      try {
        const res = contributor()
        if (res) {
          view = res.view || null
          selection = Array.isArray(res.selection) ? res.selection : []
        }
      } catch (err) {
        console.error('[workbench] contributor error:', err)
        reason = 'unavailable'
      }
    }
  } else {
    reason = 'no-workbench'
  }

  const envelope = {
    schemaVersion: 1,
    ok: true,
    capturedAt: Date.now(),
    reason,
    sessionId,
    surface: {
      tabId: activeTab || null,
      title: activeDesc?.title || (activeTab && WORKBENCH_TAB_TITLE_FALLBACKS[activeTab]) || activeTab || null,
      type: activeDesc?.type || activeTab || null,
      kind: activeDesc?.kind || (activeTab ? 'workbench' : null),
      plugin: activeTab && String(activeTab).includes(':') ? activeTab.split(':')[0] : null,
      panelOpen,
      focus,
      conversationCollapsed,
      openedTabs,
    },
    view,
    selection,
  }

  return envelope
}

/** Logical workspace id only — reject path-like values. */
function isSafeWorkspaceId(value) {
  return typeof value === 'string'
    && /^[A-Za-z0-9_.:-]{1,64}$/.test(value)
    && !value.includes('/')
    && !value.includes('\\')
    && !value.includes('~')
}

function isSafeShortToken(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 64
    && !value.includes('\n')
    && !value.includes('|')
}

export function formatCompactContextBlock(envelope) {
  if (!envelope || !envelope.surface) return ''
  const s = envelope.surface
  const view = envelope.view && typeof envelope.view === 'object' ? envelope.view : null
  const extra = view?.extra && typeof view.extra === 'object' ? view.extra : null
  const lines = []
  lines.push('<ui_context schema="1">')

  const titleStr = s.title && s.title !== s.tabId ? ` (${s.title})` : ''
  let firstLine = `tab: ${s.tabId || 'none'}${titleStr}`
  if (isSafeShortToken(view?.kind)) {
    firstLine += ` | view: ${view.kind}`
  }
  if (isSafeShortToken(view?.pageId)) {
    firstLine += ` | page: ${view.pageId}`
  }
  // Canvas workspace is a P0 routing key — whitelist only, never dump all extra.
  const workspaceId = extra?.workspaceId
  if (isSafeWorkspaceId(workspaceId)) {
    firstLine += ` | workspace: ${workspaceId}`
  }
  if (view?.filterType) {
    firstLine += ` | filter: ${view.filterType}`
  }
  if (view?.query) {
    firstLine += ` | query: ${view.query}`
  }
  if (Array.isArray(envelope.selection) && envelope.selection.length > 0) {
    const selStr = envelope.selection.slice(0, 3).map((item) => {
      const name = item.name || item.title || item.id
      return item.id && name !== item.id ? `${name} (${item.id})` : name
    }).join(', ')
    firstLine += ` | selected: ${selStr}`
  }
  lines.push(firstLine)

  if (Array.isArray(s.openedTabs) && s.openedTabs.length > 0) {
    const openStr = s.openedTabs.map((t) => {
      if (!t) return ''
      if (typeof t === 'string') return t
      const label = t.title && t.title !== t.id ? t.title : (t.id || t.type || '')
      return t.id === s.tabId ? `${label}*` : label
    }).filter(Boolean).join(', ')
    if (openStr) lines.push(`open: ${openStr}`)
  }

  const secondLine = `panel: ${s.panelOpen ? 'open' : 'closed'} | focus: ${s.focus || 'split'}`
  lines.push(secondLine)
  lines.push('</ui_context>')
  return lines.join(String.fromCharCode(10))
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
    applyDefaultWidth: (sessionId, store, env, force) => applyDefaultWidth(getService(), sessionId, store || attachedStore, env, force),
    getSnapshot: () => getService()?.getSnapshot?.() || null,
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
  deps.betterSidebar = null
  deps.layout = null
  deps.sessions = null
  attachedStore = null
  listeners.clear()
  appliedWidthSessions.clear()
  classifiedSeedSessions.clear()
  focusStorageBySession.clear()
  lastExpandedOfficialWidth = WORKBENCH_LEFT_RAIL_EXPANDED_FALLBACK_PX
  lastCollapsedOfficialWidth = collapsedLeftRailFallbackPx()
  resetConversationCollapseForTests()
  contextContributors.clear()
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
