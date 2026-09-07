/**
 * Workbench 几何计算：会话栏 / 三栏布局 / 收起展开的纯数值真源。
 *
 * 本模块只计算值与测量宿主几何（getBoundingClientRect 等只读探测）；
 * store 写入、CSS 变量、inline style 等 DOM 修改全部留在装配层
 * `src/client/workbench.js`。
 */

import { getConversationCollapsed } from '../conversation-collapse.js'
import { WORKBENCH_FOCUS } from '../../workbench/contract.js'
import { activeTabId, hostDocument, hostWindow, liveSnapshot } from './host-adapter.js'
import { focusRecordForTab } from './focus-state.js'

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

/** Last healthy expanded left-rail width; used when #root crush reports ~56px. */
let lastExpandedOfficialWidth = WORKBENCH_LEFT_RAIL_EXPANDED_FALLBACK_PX
/** Last trusted collapsed left-rail width (56 official / advanced rail-sized). */
let lastCollapsedOfficialWidth = WORKBENCH_LEFT_RAIL_COLLAPSED_FALLBACK_PX

export function resetWorkbenchGeometryMemory() {
  lastExpandedOfficialWidth = WORKBENCH_LEFT_RAIL_EXPANDED_FALLBACK_PX
  lastCollapsedOfficialWidth = collapsedLeftRailFallbackPx()
}

export function viewportWidth() {
  return hostWindow()?.innerWidth || 0
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
 * Whether the user is actively dragging the workbench panel divider.
 * Scoped to the resolved panel (plus better-sidebar's body flag) — a bare
 * `document.querySelector('[data-dragging]')` can false-positive on official
 * AppFrame drag targets and wrongly suspend width sync.
 */
export function isWorkbenchPanelDragging(doc = hostDocument(), panel = findWorkbenchPanelElement(doc)) {
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

export function nearPx(width, target) {
  return Math.abs(width - target) <= WORKBENCH_FOCUS_NEAR_PX
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
 * left rail. Conversation stays mounted inside the AppFrame's remaining
 * content area after better-sidebar reserves the panel padding.
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
