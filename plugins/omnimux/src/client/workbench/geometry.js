/**
 * Workbench 几何计算：会话栏 / 三栏布局 / 收起展开的纯数值真源。
 *
 * 本模块只计算值与测量宿主几何（getBoundingClientRect 等只读探测）；
 * store 写入、CSS 变量、inline style 等 DOM 修改全部留在装配层
 * `src/client/workbench.js`。
 */

import { getConversationCollapsed } from '../conversation-collapse.js'
import {
  CONVERSATION_MIN_CHAT_PX,
  conversationStageWidthPx,
  resolveConversationPixelBudget,
} from '../conversation-ratio.js'
import { WORKBENCH_FOCUS } from '../../workbench/contract.js'
import { activeTabId, hostDocument, hostWindow, liveSnapshot } from './host-adapter.js'
import { focusRecordForTab } from './focus-state.js'
// 比例解析的唯一真源在顶栏模块（存储 → 老用户迁移 → 默认 + 缓存）。本模块只消费它的结果，
// 不得自己实现一套（H-4）。依赖方向：workbench/geometry → client/sidebar-toggle-topbar，
// 后者只依赖 conversation-ratio / workspace-layout-store / host-adapter，不构成环。
import { resolveConversationRatio } from '../sidebar-toggle-topbar.js'

export const WORKBENCH_PANEL_MIN_PX = 280
export const ASSET_HUB_TAB_ID = 'omnimux:asset-hub'
export const ASSET_HUB_CHAT_PX = 380

/**
 * 判定当前活跃 Tab 是否为右栏素材工作台（Asset Hub）。
 * 深度适配真实结构：兼容对象属性、嵌套快照 (state.state)、Tab ID 字段与原生 split 节点。
 * @param {object | string} [state]
 * @returns {boolean}
 */
export function isAssetHubActive(state) {
  if (!state) return false
  if (typeof state === 'string') return state === ASSET_HUB_TAB_ID
  if (typeof state !== 'object') return false
  if (state.activeTab === ASSET_HUB_TAB_ID || state.tabId === ASSET_HUB_TAB_ID || state.activeTabId === ASSET_HUB_TAB_ID || state.tab === ASSET_HUB_TAB_ID) return true
  if (state.state && typeof state.state === 'object' && state.state !== state) {
    if (isAssetHubActive(state.state)) return true
  }
  const currentTab = activeTabId(state)
  return currentTab === ASSET_HUB_TAB_ID
}

/**
 * Visible split conversation floor. CSS and live drag clamp share this value.
 *
 * 单一真源在 `conversation-ratio.js`（`CONVERSATION_MIN_CHAT_PX`）：拖拽下限与派生下限
 * 曾各自为政（360 / 320 两处不一致），比例制把两处统一到同一个常量。
 */
export const WORKBENCH_CONVERSATION_MIN_PX = CONVERSATION_MIN_CHAT_PX
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

/**
 * 最后一次展开态左栏宽度（基线）。
 *
 * 收起左栏时中栏分母要锁「展开态基线」才能保宽（契约 INV-1/INV-2）。收起态下
 * `officialSessionSidebarWidth` 返回的是收起宽度（0 / 56 / 90），本值是其保留的
 * 展开态记忆——外壳在收起态 authored 的第一轨是收起宽度，无法当基线用。
 * @returns {number}
 */
export function officialExpandedRailBaselinePx() {
  return lastExpandedOfficialWidth
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
  // 严格排除外层总容器与顶层布局节点，防止将整个 AppFrame 误判为右面板
  if (el.classList?.contains('dshDesktopFrame')
    || el.hasAttribute?.('data-desktop-mode')
    || el.hasAttribute?.('data-desktop-platform')
    || (typeof el.matches === 'function' && (el.matches('.dshDesktopFrame, [class*="frame"], [class*="centerCol"], [class*="sidebarCol"]') || el.matches('#root, body, html')))) {
    return false
  }
  if (typeof el.getBoundingClientRect !== 'function') return true
  let rect
  try { rect = el.getBoundingClientRect() } catch { return true }
  const viewport = viewportWidth()
  if (!rect || typeof rect.right !== 'number' || !Number.isFinite(rect.right)) return true
  if (viewport > 0 && rect.right < viewport - 12) return false
  if (typeof rect.width === 'number' && Number.isFinite(rect.width)
    && rect.width > 0 && rect.width < WORKBENCH_PANEL_MIN_PX - 1) return false
  // 右侧分栏面板在分栏模式下宽度不可能占满整个视口，全宽节点必为外层视口容器
  if (viewport > 0 && typeof rect.width === 'number' && rect.width >= viewport - 10) return false
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
    const tagged = doc.querySelector(`[${WORKBENCH_PANEL_ATTR}]:not(.dshDesktopFrame):not([class*="frame"])`)
    if (tagged && isLikelyWorkbenchPanel(tagged)) return tagged
    const dragging = doc.querySelector('[data-dragging]:not(.dshDesktopFrame):not([class*="frame"])')
    if (dragging && isLikelyWorkbenchPanel(dragging)) return dragging
    const rightPanel = doc.querySelector('[data-sidebar-right-panel][data-sidebar-right-open]')
    if (rightPanel && isLikelyWorkbenchPanel(rightPanel)) return rightPanel
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
  // 文档来源必须与调用方同源：注入 `env.doc`（测试 / 多文档）时不得回读全局文档，
  // 否则一次调用里「面板宽按注入文档、左栏宽按全局文档」各算一套（M-6）。
  const doc = env.doc || hostDocument()
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
 * 当前生效的比例：显式注入优先，其余走**唯一真源** `sidebar-toggle-topbar.resolveConversationRatio`
 * （存储 → 老用户迁移 → 产品默认 + 缓存）。
 *
 * 两侧必须给出同一个值——一个算中栏、一个算右栏，比例若不同源，「三栏之和 = 视口」当场破裂。
 * 本模块曾经只做 `readChatRatio() ?? 默认`：那会跳过老用户迁移，使中栏按迁移值、右栏按
 * 默认 0.3 各算一套（H-4）。此处不再保留任何重复实现。
 * @param {{ chatRatio?: number, doc?: Document }} [env]
 * @returns {number}
 */
function resolveChatRatio(env = {}) {
  return resolveConversationRatio(env.doc || hostDocument(), env)
}

/**
 * 中间会话栏与画布的像素预算（比例制真源）。
 *
 * 三个宽度必须同时成立，缺一就会出现「把手与真实列边界错位」或「收起左栏不保宽」：
 *
 * - `stage`（**基线舞台**）：窗口内容宽 − 左栏。收起左栏时改用「展开态左栏基线」，
 *   使收起动作对中栏宽度成为恒等变换（契约 INV-1/INV-2 保宽）。
 * - `budget.chatWidth`：`clamp(round(舞台 × 比例), 360, min(舞台 × 72%, 舞台 − 320))`。
 * - `visibleStage`（**可见舞台**）：窗口内容宽 − **可见**左栏。画布/面板宽永远按可见舞台算：
 *   CSS 保宽规则把第一轨钉成 0，释放的左栏宽度物理上归第三轨，若面板仍按基线舞台算，
 *   外壳 authored 第三轨会小于真实列宽，右分隔线把手随之偏离真实列边界（方案 D7）。
 * @param {{ viewportWidth?: number, officialSidebarWidth?: number, chatRatio?: number, railBaselinePx?: number }} [env]
 * @returns {{ visibleStage: number, stage: number, budget: { chatWidth: number, minChatWidth: number, maxChatWidth: number } }}
 */
function isEnvConfig(obj) {
  if (!obj || typeof obj !== 'object') return false
  return (
    typeof obj.viewportWidth === 'number' ||
    typeof obj.collapsed === 'boolean' ||
    typeof obj.ratio === 'number' ||
    typeof obj.isAssetHub === 'boolean' ||
    (Boolean(obj.doc) && typeof obj.doc === 'object') ||
    typeof obj.officialSidebarWidth === 'number' ||
    typeof obj.railBaselinePx === 'number'
  )
}

function workbenchConversationGeometryPx(arg1 = {}, arg2 = undefined) {
  let env = {}
  let state = undefined
  if (isEnvConfig(arg1)) {
    env = arg1
    state = arg2 ?? liveSnapshot()?.state
  } else if (isEnvConfig(arg2)) {
    state = arg1
    env = arg2
  } else {
    env = arg1 || {}
    state = arg2 ?? liveSnapshot()?.state
  }

  const viewport = typeof env.viewportWidth === 'number' ? env.viewportWidth : viewportWidth()
  const railVisible = officialSessionSidebarWidth(env)
  const collapsed = isOfficialSidebarCollapsed(env.doc || hostDocument())
  const railBaseline = typeof env.railBaselinePx === 'number' && Number.isFinite(env.railBaselinePx)
    ? env.railBaselinePx
    : officialExpandedRailBaselinePx()
  const ratio = resolveChatRatio(env)
  const visibleStage = Math.max(0, Math.round(viewport) - Math.max(0, railVisible))
  const stage = conversationStageWidthPx({
    viewportWidth: viewport,
    railVisiblePx: railVisible,
    railBaselinePx: railBaseline,
    collapsed,
  })
  const budget = resolveConversationPixelBudget(stage, ratio)
  if (isAssetHubActive(state) || env.isAssetHub) {
    const lockedChat = Math.min(visibleStage, ASSET_HUB_CHAT_PX)
    return {
      visibleStage,
      stage,
      budget: {
        ...budget,
        chatWidth: lockedChat,
        minChatWidth: lockedChat,
      },
    }
  }
  return { visibleStage, stage, budget }
}

/**
 * Default GUI width: hand the right panel everything the middle conversation
 * column does not take, at the configured ratio.
 *
 * 算式由「可用宽 − 380」换成「可见舞台 − 比例中栏宽」；写入通道不变
 * （`applyDefaultWidth → updateStoreWithDefaultWidth`，终点是 better-sidebar 的 tab store）。
 *
 * **该通道不驱动外壳 `panels.rightbar`**（取证见
 * `.agent-reports/conversation-ratio-layout/forensics-s1-s2.md`：外壳那个字段的唯一写入者是
 * 外壳自己的手柄拖拽 `layout.setRightbar`，外壳客户端不读 better-sidebar store）。
 * 因此本函数只决定「右栏该多宽」，**不决定分隔线把手位置**；把手的对齐由 T04 的 D7-S1′
 * 桥负责——复用 `workbench/tab-viewport-reconciler.js` 已持有的 `layout.setRightbar()` 通道。
 */
export function workbenchDefaultWidthPx(state, env = {}) {
  const viewport = typeof env.viewportWidth === 'number' ? env.viewportWidth : viewportWidth()
  if (!(viewport > 0)) return WORKBENCH_PANEL_MIN_PX
  const max = Math.max(WORKBENCH_PANEL_MIN_PX, viewport)
  const { visibleStage, budget } = workbenchConversationGeometryPx(env, state)
  const target = Math.max(WORKBENCH_PANEL_MIN_PX, Math.round(visibleStage - budget.chatWidth))
  return Math.min(max, target)
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
 * least its floor wide, given the viewport and the official left session rail.
 * Split focus is clamped to this; intentional gui and the collapsed middle column
 * are never clamped (the column is allowed to be 0).
 * When the viewport cannot be measured it has no safe bound, so it conservatively
 * returns the current panel width / gui upper bound (it never reduces an existing
 * split that it cannot reason about).
 *
 * 物理余量按**可见**舞台算（不是基线舞台）：左栏收起时第一轨被钉成 0，释放的宽度
 * 物理上归第三轨，面板上限必须允许它吃到 `视口 − 可见左栏 − 中栏下限`；若按基线舞台算，
 * 收起态面板会被夹小、中栏被反向挤窄，保宽（INV-1）当场失效。
 * 地板来自比例预算的 `minChatWidth`，与拖拽下限、派生下限同源。
 */
export function workbenchSplitMaxPanelPx(state, env = {}) {
  const viewport = typeof env.viewportWidth === 'number' ? env.viewportWidth : viewportWidth()
  if (viewport > 0) {
    const { visibleStage, budget } = workbenchConversationGeometryPx(env, state)
    return Math.max(WORKBENCH_PANEL_MIN_PX, visibleStage - budget.minChatWidth)
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
