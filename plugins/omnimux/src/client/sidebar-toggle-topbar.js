/**
 * Relocate the left-sidebar toggle into the topbar (traffic-light safe inset →
 * toggle → [collapsed: new-session] → workbench tab bar / session title).
 * Plugin CSS + DOM only — never touch harness packages, better-sidebar,
 * middle-pane hide toggle, or conversation collapse APIs.
 *
 * The official AppFrame toggle is trapped in the sidebar's low stacking context
 * (logoRow z-index 11 inside a transformed fixed shell), so it cannot be fixed
 * over the full-width workbench tab bar (better-sidebar subtree stacks above
 * the app root). Instead we inject our OWN toggle button as a child of the
 * better-sidebar `tabBar` (guaranteed on top + hit-testable) and drive the
 * official sidebar action by programmatically clicking the (hidden) official
 * button. Icons + blue-dot mirror the collapse flag on `<html>`.
 *
 * While the left rail is collapsed, a second fixed control (new session) sits
 * immediately to the toggle's right and opens the coordinator new-menu anchored
 * to that visible control (not the hidden rail button, which caused the menu
 * to "split" away from the icon).
 */

import { openCollapsedNewMenuAt } from './sidebar-coordinator.js'
import {
  CONVERSATION_RATIO_DEFAULT,
  conversationStageWidthPx,
  conversationWidthFromRatio,
  ratioFromConversationWidth,
} from './conversation-ratio.js'
import { getWorkbenchLayout } from './workbench/host-adapter.js'
import {
  migrateChatRatioFromAuthoredGeometry,
  persistChatRatioNow,
  readChatRatio,
} from './workbench/workspace-layout-store.js'

export const SIDEBAR_TOGGLE_TOPBAR_ATTR = 'data-omnimux-sidebar-toggle-topbar'
export const SIDEBAR_TOGGLE_TOPBAR_HTML_ATTR = 'data-omnimux-sidebar-toggle-topbar'
export const LEFT_COLLAPSED_HTML_ATTR = 'data-omnimux-left-collapsed'
/** Marks the hidden official AppFrame toggle used as the programmatic trigger. */
export const SIDEBAR_ORIGINAL_TOGGLE_ATTR = 'data-omnimux-original-sidebar-toggle'
/** Injected topbar "new session" control (collapsed rail only). */
export const TOPBAR_NEW_SESSION_ATTR = 'data-omnimux-topbar-new-session'
/** Injected topbar right sidebar expand button (shown when right panel is closed). */
export const TOPBAR_RIGHT_EXPAND_ATTR = 'data-omnimux-topbar-right-expand'

/** Web gutter; the macOS desktop marker reserves its native window controls. */
export const TOPBAR_TOGGLE_LEFT_PX = 8
export const TOPBAR_MACOS_INSET_PX = 84
export const TOPBAR_TOGGLE_SIZE_PX = 32
export const TOPBAR_TOGGLE_GAP_PX = 8
export const TOPBAR_TOGGLE_RIGHT_MARGIN_PX = 8
export const TOPBAR_TOGGLE_TOP_PX = 4
export const TOPBAR_TOGGLE_Z_INDEX = 2147483647

/**
 * Trigger click robustly penetrating React 17/18 synthetic event props.
 * @param {HTMLElement | null | undefined} el
 */
export function triggerClick(el) {
  if (!el) return
  try {
    const propKey = Object.keys(el).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'))
    if (propKey && typeof el[propKey]?.onClick === 'function') {
      el[propKey].onClick({
        preventDefault: () => {},
        stopPropagation: () => {},
        nativeEvent: new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
        target: el,
        currentTarget: el,
      })
      return
    }
  } catch {
    // fall through
  }
  try {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return
  } catch {
    // fall through
  }
  try {
    el.click()
  } catch {
    // fall through
  }
}

const TOGGLE_ARIA_LABELS = Object.freeze([
  '打开侧边栏',
  '收起侧边栏',
  'Open sidebar',
  'Collapse sidebar',
])

const NEW_SESSION_ARIA_LABELS = Object.freeze([
  '新建会话',
  '新会话',
  '新对话',
  '新建对话',
  'New session',
  'New Session',
  'New chat',
  'New Chat',
])

/** Shown while the sidebar is expanded (action = collapse). */
const COLLAPSE_ICON_SVG = `<svg data-omnimux-sidebar-toggle-icon="collapse" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="2"/><line x1="6.8" y1="2.5" x2="6.8" y2="13.5"/><path d="M11.5 8h-1.3"/><path d="M11.4 6.9l-1.2 1.1 1.2 1.1"/></svg>`

/** Shown while the sidebar is collapsed (action = expand). */
const EXPAND_ICON_SVG = `<svg data-omnimux-sidebar-toggle-icon="expand" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="2"/><line x1="9.8" y1="2.5" x2="9.8" y2="13.5"/><path d="M9.8 8h1.3"/><path d="M9.9 6.9l1.2 1.1-1.2 1.1"/></svg>`

/** Official ic_ds_new_chat_outline_16 path (ui-primitives IconNewChatOutline16). */
const NEW_SESSION_ICON_SVG = `<svg data-omnimux-topbar-new-session-icon width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8.00003 0.3237C3.76075 0.3237 0.32373 3.76072 0.32373 8C0.32373 9.17603 0.589121 10.2922 1.0632 11.2901L1.35291 11.8989L2.5705 11.3205L2.28079 10.7117C1.89079 9.89074 1.67301 8.97167 1.67301 8C1.67301 4.50546 4.50549 1.67298 8.00003 1.67298C11.4946 1.67298 14.3271 4.50546 14.3271 8C14.3271 11.4945 11.4946 14.327 8.00003 14.327C7.28473 14.327 6.76077 14.277 6.29621 14.1487C5.83857 14.0224 5.40441 13.8109 4.88514 13.4488C4.12569 12.919 3.03778 12.7316 2.141 13.2978L2.12682 13.307L2.11264 13.3171L1.34886 13.854L1.79659 15.188L2.86122 14.4384C3.19068 14.2305 3.68325 14.2542 4.11326 14.5539C4.72789 14.9826 5.30042 15.2724 5.93762 15.4484C6.56803 15.6224 7.22776 15.6763 8.00003 15.6763C12.2393 15.6763 15.6763 12.2393 15.6763 8C15.6763 3.76072 12.2393 0.3237 8.00003 0.3237ZM7.32033 4.82535V7.32536H4.82538V8.67464H7.32033V11.1747H8.6696V8.67464H11.1747V7.32536H8.6696V4.82535H7.32033Z" fill="currentColor"/></svg>`

/** Right sidebar expand icon (the "展开右侧侧边栏" glyph). */
export const RIGHT_EXPAND_ICON_SVG = `<svg data-omnimux-right-expand-icon width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1.5" y="2" width="13" height="12" rx="2.5" stroke="currentColor" stroke-width="1.5"/><rect x="10.5" y="3.25" width="2.75" height="9.5" rx="1" fill="currentColor" stroke="none"/></svg>`

/**
 * @param {Document | null | undefined} doc
 * @returns {HTMLElement | null}
 */
export function findOfficialSidebarToggle(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  // Never match our own injected topbar toggle (would cause click recursion).
  const notInjected = `:not([${SIDEBAR_TOGGLE_TOPBAR_ATTR}])`
  for (const label of TOGGLE_ARIA_LABELS) {
    const byAria = doc.querySelector(`button[aria-label="${label}"]${notInjected}`)
    if (byAria instanceof HTMLElement) return byAria
  }
  const byClass = doc.querySelector(`button.x-Wl6W_toggle${notInjected}, .x-Wl6W_toggle${notInjected}`)
  if (byClass instanceof HTMLElement) return byClass
  const fallback = doc.querySelector(
    `[class*="sidebarCol"] [class*="logoRow"] [class*="toggle"]${notInjected}, [class*="sidebarCol"] [class*="logoRow"] button[class*="toggle"]${notInjected}`,
  )
  if (fallback instanceof HTMLElement) return fallback
  return null
}

/**
 * Official sidebar "New session" control (expanded row or collapsed rail icon).
 * Never returns our injected topbar new-session button.
 * @param {Document | null | undefined} doc
 * @returns {HTMLElement | null}
 */
export function findOfficialNewSessionButton(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  const notInjected = `:not([${TOPBAR_NEW_SESSION_ATTR}])`
  for (const label of NEW_SESSION_ARIA_LABELS) {
    const byAria = doc.querySelector(`button[aria-label="${label}"]${notInjected}`)
    if (byAria instanceof HTMLElement) return byAria
  }
  const byClass = doc.querySelector(
    `[class*="sidebarCol"] button[class*="newSession"]${notInjected}, [data-pane="sidebar"] button[class*="newSession"]${notInjected}, .dshDesktopSidebarSurface button[class*="newSession"]${notInjected}`,
  )
  if (byClass instanceof HTMLElement) return byClass
  // Text fallback for localized labels without exact aria match.
  try {
    for (const btn of doc.querySelectorAll(`button${notInjected}`)) {
      if (!(btn instanceof HTMLElement)) continue
      const text = `${btn.getAttribute('aria-label') || ''} ${btn.textContent || ''}`
      if (/新会话|新建会话|新对话|新建对话|new session/i.test(text)) return btn
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * @param {Document | null | undefined} doc
 * @returns {Element | null}
 */
export function findSidebarCollapsedHost(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  const column = doc.querySelector(
    '[data-pane="sidebar"], [class*="sidebarCol"], .dshDesktopSidebarSurface, [class*="dshDesktopSidebarSurface"]',
  )
  if (column && typeof column.closest === 'function') {
    try {
      const marked = column.closest('[data-sidebar-collapsed]')
      if (marked) return marked
    } catch {
      // ignore
    }
  }
  return doc.querySelector(
    '[class*="frame"][data-sidebar-collapsed], .dshDesktopFrame[data-sidebar-collapsed], [data-sidebar-collapsed]',
  )
}

/**
 * 官方 AppFrame 把 `data-sidebar-collapsed` 写在 frame 根节点，不是 `<html>`。
 * 监听必须覆盖真正带该属性的节点。优先绑 sidebar 列祖先里「已经带属性」
 * 的节点，展开时属性不在则绑列的 parent（即 AppFrame）。不要对 html/body
 * 做全树 attributes 或 childList subtree。
 * @param {Document | null | undefined} doc
 * @returns {Element | null}
 */
export function collapsedHostNode(doc = typeof document !== 'undefined' ? document : undefined) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  const column = doc.querySelector(
    '[data-pane="sidebar"], [class*="sidebarCol"], .dshDesktopSidebarSurface, [class*="dshDesktopSidebarSurface"]',
  )
  if (column instanceof HTMLElement) {
    const marked = column.closest('[data-sidebar-collapsed]')
    if (marked instanceof HTMLElement) return marked
    if (column.parentElement instanceof HTMLElement) return column.parentElement
    const slot = column.closest('[data-slot="root"]')
    if (slot instanceof HTMLElement) return slot
  }
  const marked = doc.querySelector(
    '[class*="frame"][data-sidebar-collapsed], .dshDesktopFrame[data-sidebar-collapsed], [data-sidebar-collapsed]',
  )
  if (marked instanceof HTMLElement) return marked
  const slot = doc.querySelector('[data-slot="root"]')
  if (slot instanceof HTMLElement) return slot
  return null
}

/**
 * @param {Document | null | undefined} doc
 * @returns {boolean}
 */
export function isLeftSidebarCollapsed(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return false
  const column = doc.querySelector(
    '[data-pane="sidebar"], [class*="sidebarCol"], .dshDesktopSidebarSurface, [class*="dshDesktopSidebarSurface"]',
  )
  if (column && typeof column.closest === 'function') {
    try {
      if (column.closest('[data-sidebar-collapsed]')) return true
    } catch {
      // ignore
    }
  }
  return Boolean(
    doc.querySelector(
      '[class*="frame"][data-sidebar-collapsed], .dshDesktopFrame[data-sidebar-collapsed]',
    ),
  )
}

/**
 * Explicit user collapse intent. Protects against official AppFrame's
 * SIDEBAR_AUTO_COLLAPSE (1024px) heuristic from flipping the left sidebar
 * open when dragging the right workbench divider.
 * @type {boolean | null}
 */
let explicitLeftCollapseIntent = null

export function setExplicitLeftCollapseIntent(val) {
  explicitLeftCollapseIntent = typeof val === 'boolean' ? val : null
}

export function getExplicitLeftCollapseIntent() {
  return explicitLeftCollapseIntent
}

/**
 * Mirror frame `data-sidebar-collapsed` onto html for icon + blue-dot CSS.
 * @param {Document | null | undefined} doc
 * @returns {boolean}
 */
export function syncLeftCollapsedHtmlAttr(doc) {
  const root = doc?.documentElement
  if (!root || typeof root.setAttribute !== 'function') return false
  const isDragging = Boolean(
    doc.body?.hasAttribute?.('data-dsh-sidebar-dragging') ||
    doc.querySelector?.('[data-dragging]')
  )
  let collapsed = isLeftSidebarCollapsed(doc)
  if (explicitLeftCollapseIntent === true) {
    if (isDragging || !collapsed) collapsed = true
  } else if (explicitLeftCollapseIntent === false) {
    if (isDragging && collapsed) collapsed = false
  }
  if (collapsed) root.setAttribute(LEFT_COLLAPSED_HTML_ATTR, '')
  else root.removeAttribute(LEFT_COLLAPSED_HTML_ATTR)
  return collapsed
}

/**
 * Visible right workbench panel (not the hidden off-screen clone, not the
 * bottom drawer, not panelBody/Resize). Used to dock tab labels to overlap
 * with the topbar toggle instead of a collapsed-boolean padding hack.
 * @param {Document | null | undefined} doc
 * @returns {Element | null}
 */
export function findVisibleWorkbenchPanel(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null
  const vw = (() => {
    try {
      const w = doc.defaultView?.innerWidth
      return typeof w === 'number' && w > 0 ? w : 1e9
    } catch {
      return 1e9
    }
  })()
  const nodes = doc.querySelectorAll(
    '[data-dsh-better-sidebar] [data-dsh-panel-host] > [class*="_panel"]',
  )
  for (const el of nodes) {
    const cls = typeof el.className === 'string' ? el.className : String(el.className || '')
    // Official right panel class fragment is `_panel` (CSS-module hashed).
    if (!/(^|[\s_])panel($|[\s_])/i.test(cls)) continue
    if (/panelHidden|bottomPanel|panelResize|panelBody|panelHost/i.test(cls)) continue
    try {
      const box = el.getBoundingClientRect?.()
      if (!box) continue
      if (box.width > 40 && box.height > 40 && box.left < vw - 8) return el
    } catch {
      // ignore
    }
  }
  return null
}

/** Rail narrower than this while expanded is a poisoned reading, never a layout. */
export const LEFT_RAIL_MIN_PX = 64

/**
 * `<html>` marker owned by `conversation-collapse.js` (the middle-pane collapse).
 * Read-only here: this file must not import that module, which owns the state —
 * the coupling the module's hard-constraint test forbids.
 */
const CONVERSATION_COLLAPSED_MARKER = 'data-omnimux-conversation-collapsed'

/** Published before the shell exposes an authored split; also the CSS fallback. */
export const CONVERSATION_WIDTH_FALLBACK_PX = 380
/** Never publish a conversation column narrower than this. */
export const CONVERSATION_WIDTH_MIN_PX = 320
/**
 * 展开态左栏基线兜底（外壳 `SIDEBAR_DEFAULT`）。
 *
 * 分母在收起态要锁「展开态左栏」，而外壳在收起态 authored 的第一轨是**收起**宽度
 * （macOS advanced 90px），不能当基线用。正常路径下 `computeChromeLayout` 会把
 * `lastGoodLeftRailW`（最后一次展开态宽度）传进来，只有「冷启动即处于收起态」才走到本兜底。
 * 数值与 `workbench/geometry.js` 的 `WORKBENCH_LEFT_RAIL_EXPANDED_FALLBACK_PX` 一致；
 * 本模块按硬约束不得依赖 workbench 几何模块（其传递依赖 conversation-collapse.js）。
 */
export const CONVERSATION_RAIL_BASELINE_FALLBACK_PX = 280

/** Last plausible expanded rail width; repairs a poisoned reading (see below). */
let lastGoodLeftRailW = 0

/**
 * 外壳分隔线是否正在被拖动。
 *
 * 拖拽期是「authored 几何权威」的判据（方案 D3）：此时宽度必须由外壳当帧写出的内联栅格
 * 派生，比例不得参与任何写入路径——否则等价于把「记忆式基准」重新钉回轨道，#2097 原样复发。
 * @param {Document | null | undefined} doc
 * @returns {boolean}
 */
export function isShellSplitDragging(doc) {
  return Boolean(
    doc?.body?.hasAttribute?.('data-dsh-sidebar-dragging') ||
    doc?.querySelector?.('[data-dragging]'),
  )
}

/**
 * 幂等写判据：几何不变时不得重复 `setProperty`。
 *
 * 外壳 frame 的 `style` 是每次 render 重建的新对象，插件又用 `style` MutationObserver 盯它，
 * 非幂等写会形成「外壳写 → 观察者 → 插件写 → 再触发观察者」的自激回路（契约 E-2 / 禁改清单 §5）。
 * @param {string} current 变量当前值（如 `"492px"`）
 * @param {number} nextPx 期望的像素值
 * @returns {boolean} true 表示差异小于 1px，可跳过写入
 */
export function isSamePxValue(current, nextPx) {
  const parsed = Number.parseFloat(current)
  return Number.isFinite(parsed) && Math.abs(parsed - nextPx) < 1
}

/**
 * The desktop shell's frame element — the grid host both of us write to.
 * @param {Document | null | undefined} doc
 * @returns {Element | null}
 */
function readFrame(doc) {
  return doc?.querySelector?.('.dshDesktopFrame:has([data-sidebar-right-panel]), [class*="frame"]:has([data-sidebar-right-panel])')
    || doc?.querySelector?.('.dshDesktopFrame')
    || doc?.querySelector?.('[class*="frame"]')
    || null
}

/**
 * The split the shell authored, as `{ rail, right }` px (null when absent).
 *
 * `conversation-box.js` pins the frame's rails with `!important`, so a *measured*
 * column width is a function of the value we are about to write — a
 * self-confirming reading. The inline `grid-template-columns` is authored by the
 * shell and survives that override, which makes it the authoritative split
 * input. The middle token may contain spaces (`minmax(0px, 1fr)`), so the third
 * track is read from the end of the list.
 * @param {Document | null | undefined} doc
 * @returns {{ rail: number | null, right: number | null }}
 */
export function readShellSplitPx(doc) {
  const grid = String(readFrame(doc)?.style?.gridTemplateColumns || '').trim()
  if (!grid) return { rail: null, right: null }
  const tokens = grid.split(/\s+/)
  /** @param {string} token */
  const toPx = (token) => {
    const matched = /^(\d+(?:\.\d+)?)px$/.exec(token || '')
    if (!matched) return null
    const px = Math.round(Number(matched[1]))
    return Number.isFinite(px) ? px : null
  }
  return {
    rail: toPx(tokens[0]),
    right: tokens.length >= 3 ? toPx(tokens[tokens.length - 1]) : null,
  }
}

/**
 * Conversation-column width for the current shell state.
 *
 * 两个状态，两条权威链（方案 D3，唯一硬约束）：
 *
 * - **稳态（默认）**：比例权威。宽度 = `conversationWidthFromRatio(舞台, 比例)`，
 *   舞台 = 窗口内容宽 − 左栏（收起态锁展开态基线）。窗口缩放按同一比例重算，
 *   多出来的宽度不再全部落进中栏（#2316 的荒原）。
 * - **拖拽期**（`body[data-dsh-sidebar-dragging]` 或外壳 `[data-dragging]`）：外壳
 *   authored 内联栅格是唯一权威，与 #2097 修复后的实现逐字一致。比例在此分支**只记录、
 *   绝不参与宽度来源**——用测量值或比例反推宽度再写回就是自证读数，会让渲染被钉住、
 *   整段拖拽零写入，松手后再展开跳变（#2097）。
 *
 * 收起左栏的保宽（契约 INV-1/INV-2）在两条链上都成立：稳态靠基线分母，拖拽期靠
 * `releasedRailW` 把释放宽度还给中栏，同一表达式在两种状态下给出同一数值。
 * @param {Document | null | undefined} doc
 * @param {boolean} collapsed
 * @param {number} leftRailW visible rail width (0 while collapsed)
 * @param {number} [expandedRailW] last trustworthy expanded rail width
 * @param {{ chatRatio?: number }} [env] 显式比例（单测 / 诊断用）；缺省走持久化真源
 * @returns {number}
 */
export function deriveConversationWidthPx(doc, collapsed, leftRailW, expandedRailW = 0, env = {}) {
  const viewportW = readViewportWidthPx(doc)
  if (viewportW <= 0) return CONVERSATION_WIDTH_FALLBACK_PX

  const { rail, right } = readShellSplitPx(doc)
  const railW = collapsed ? 0 : (rail ?? leftRailW ?? 0)

  // 拖拽期：authored 权威（与 #2097 修复后的实现逐字一致）。
  if (isShellSplitDragging(doc)) {
    const authored = authoredConversationWidthPx({
      viewportWidth: viewportW,
      railVisiblePx: railW,
      rightTrackPx: right,
      releasedRailPx: collapsed ? (expandedRailW || 0) : 0,
    })
    return authored ?? CONVERSATION_WIDTH_FALLBACK_PX
  }

  // 稳态：比例权威。分母在收起态锁定展开态左栏基线，使收起动作对中栏宽度成为恒等变换。
  const stage = conversationStageWidthPx({
    viewportWidth: viewportW,
    railVisiblePx: railW,
    railBaselinePx: expandedRailW || CONVERSATION_RAIL_BASELINE_FALLBACK_PX,
    collapsed,
  })
  return conversationWidthFromRatio(stage, resolveConversationRatio(doc, env))
}

/**
 * 视口内容宽（外壳把手的 `viewport` 口径为 frame 实测宽，此处保留窗口口径供几何推导；
 * 需要与外壳完全同口径时用 {@link readFrameWidthPx}）。
 * @param {Document | null | undefined} doc
 * @returns {number} 整数像素；不可测时为 0
 */
function readViewportWidthPx(doc) {
  return Math.round(doc?.defaultView?.innerWidth || doc?.documentElement?.clientWidth || 0)
}

/**
 * 外壳 frame 的实测宽度 —— 外壳 `computeDesktopColumns(viewport, …)` 与把手
 * `left = viewport − normal.rightbar` 用的就是这个口径（`AdvancedFrame.tsx`）。
 * 回写 `panels.rightbar` 时必须与外壳同口径，否则夹紧结果与把手位置各算一套。
 * @param {Document | null | undefined} doc
 * @returns {number} 整数像素；测不到时退回窗口内容宽
 */
export function readFrameWidthPx(doc) {
  const frame = readFrame(doc)
  try {
    const width = frame?.getBoundingClientRect?.().width
    if (typeof width === 'number' && Number.isFinite(width) && width > 0) return Math.round(width)
  } catch {
    // ignore
  }
  return readViewportWidthPx(doc)
}

/**
 * 拖拽期宽度算式（纯函数）：`视口 − 可见左栏 − 外壳 authored 第三轨 − 收起释放宽`。
 *
 * 抽成纯函数是为了让「拖拽期发布什么值」与「松手后反推什么比例」共用同一个表达式：
 * 两处若各写一遍，结算出的比例就会与用户实际拖到的宽度差一截（AC-7 比例记忆 ±0.005）。
 * @param {{ viewportWidth?: number, railVisiblePx?: number, rightTrackPx?: number | null, releasedRailPx?: number }} geometry
 * @returns {number | null} 无可用第三轨（右栏收起 / 外壳未 authored）时返回 `null`
 */
export function authoredConversationWidthPx(geometry = {}) {
  const viewportW = Number(geometry.viewportWidth)
  const right = Number(geometry.rightTrackPx)
  if (!Number.isFinite(viewportW)) return null
  if (!Number.isFinite(right) || right <= 0) return null
  const railW = Math.max(0, Number(geometry.railVisiblePx) || 0)
  const releasedRailW = Math.max(0, Number(geometry.releasedRailPx) || 0)
  return Math.max(CONVERSATION_WIDTH_MIN_PX, Math.round(viewportW) - railW - Math.round(right) - releasedRailW)
}

/**
 * 当前生效的比例：存储 → 老用户迁移 → 产品默认。
 *
 * 显式注入的 `env.chatRatio` 优先（单测与诊断用），其余走持久化真源。
 * @param {Document | null | undefined} doc
 * @param {{ chatRatio?: number }} [env]
 * @returns {number}
 */
export function resolveConversationRatio(doc, env = {}) {
  if (typeof env.chatRatio === 'number' && Number.isFinite(env.chatRatio)) return env.chatRatio
  const stored = readChatRatio()
  if (stored !== null) return stored
  const migrated = migrateConversationRatioOnce(doc)
  return migrated ?? CONVERSATION_RATIO_DEFAULT
}

/** 迁移只允许发生一次；失败（外壳几何尚未就绪）不置位，留给下一帧重试。 */
let ratioMigrationSettled = false

/**
 * 老用户首跑迁移：只在**外壳已持有用户自己写出的面板宽**时反推。
 *
 * 外壳 `panels.rightbar` 的初值是 `null`，唯一写入者是用户拖动分隔线；因此
 * 「它是数字」等价于「这位用户曾经亲手定过版式」。全新用户没有可迁移的版式，
 * 必须拿到产品默认 30%（规格 §10），不能被外壳默认 45% 面板反推成 47%。
 * @param {Document | null | undefined} doc
 * @returns {number | null} 落盘的比例；不满足迁移前提时为 `null`
 */
function migrateConversationRatioOnce(doc) {
  if (ratioMigrationSettled) return null
  const snapshot = getWorkbenchLayout()?.getSnapshot?.()
  if (!snapshot || typeof snapshot.rightbar !== 'number') return null
  const viewportW = readViewportWidthPx(doc)
  const collapsed = isLeftSidebarCollapsed(doc)
  const { rail, right } = readShellSplitPx(doc)
  const migrated = migrateChatRatioFromAuthoredGeometry({
    viewportWidth: viewportW,
    railVisiblePx: collapsed ? 0 : (rail ?? lastGoodLeftRailW ?? 0),
    railBaselinePx: lastGoodLeftRailW || CONVERSATION_RAIL_BASELINE_FALLBACK_PX,
    collapsed,
    rightTrackPx: right,
  })
  if (migrated !== null) ratioMigrationSettled = true
  return migrated
}

/**
 * 拖拽结算：把用户刚拖到的宽度反推成比例并**立即落盘**（跳过防抖），随后按稳态重算一次。
 *
 * 结算读的是外壳 authored 栅格而不是我们刚写出去的 CSS 变量：读自己的写值等于自证读数
 * （INV-4），一旦外壳当帧的几何与我们的写入不同步，落盘的比例就会悄悄偏掉。
 * @param {Document | null | undefined} doc
 * @returns {number | null} 落盘的比例；无可用 authored 第三轨时为 `null`
 */
export function settleConversationRatioFromAuthoredGeometry(doc) {
  const viewportW = readViewportWidthPx(doc)
  if (viewportW <= 0) return null
  const layout = computeChromeLayout(doc)
  const { rail, right } = readShellSplitPx(doc)
  const collapsed = layout.collapsed
  const railW = collapsed ? 0 : (rail ?? layout.leftRailW ?? 0)
  const chatWidth = authoredConversationWidthPx({
    viewportWidth: viewportW,
    railVisiblePx: railW,
    rightTrackPx: right,
    releasedRailPx: collapsed ? (lastGoodLeftRailW || 0) : 0,
  })
  if (chatWidth === null) return null
  const stage = conversationStageWidthPx({
    viewportWidth: viewportW,
    railVisiblePx: railW,
    railBaselinePx: lastGoodLeftRailW || CONVERSATION_RAIL_BASELINE_FALLBACK_PX,
    collapsed,
  })
  if (!(stage > 0)) return null
  const ratio = ratioFromConversationWidth(stage, chatWidth)
  persistChatRatioNow(ratio)
  // 结算即回到稳态：比例已等于拖拽结果，重算对可见宽度是恒等变换（无跳变）。
  try {
    applyTopbarToggleCssVars(doc)
  } catch {
    // 重算失败不吞掉已落盘的比例：下一帧的观察者同步会补上。
  }
  return ratio
}

/**
 * 测试专用：复位「迁移已结算」记忆，避免用例之间互相污染。
 */
export function resetConversationRatioAuthorityForTests() {
  ratioMigrationSettled = false
}

/**
 * The rail width the shell itself asked for, read from a source our own
 * stylesheet cannot rewrite.
 *
 * `conversation-box.js` pins the frame's first grid track to
 * `var(--omnimux-sidebar-width)` while the middle column is collapsed, so the
 * sidebar column's measured width is a function of the value we are about to
 * write — a poisoned reading would confirm itself every frame. The frame's
 * inline `grid-template-columns` is authored by the desktop shell and survives
 * our `!important` override (inline style is the declaration, not the computed
 * value), which makes it the authoritative rail width.
 * @param {Document | null | undefined} doc
 * @returns {number | null} rounded px, or null when the shell exposes none.
 */
export function readShellRailWidthPx(doc) {
  return readShellSplitPx(doc).rail
}

/**
 * Single chrome layout snapshot. Tab padding is the horizontal overlap
 * between the fixed toggle and the visible workbench panel — NOT a function
 * of the collapsed boolean alone (collapsed+split must not shove tabs right).
 * @param {Document | null | undefined} doc
 * @returns {{
 *   collapsed: boolean,
 *   leftRailW: number,
 *   toggleLeft: number,
 *   toggleEnd: number,
 *   newSessionLeft: number | null,
 *   panelLeft: number | null,
 *   tabPadLeft: number,
 * }}
 */
export function computeChromeLayout(doc) {
  const isDragging = isShellSplitDragging(doc)
  let collapsed = isLeftSidebarCollapsed(doc)
  if (explicitLeftCollapseIntent === true && (isDragging || !collapsed)) {
    collapsed = true
  } else if (explicitLeftCollapseIntent === false && (isDragging || collapsed)) {
    collapsed = false
  }
  let leftRailW = 0
  if (!collapsed) {
    const col = findSidebarColumn(doc)
    let measured = 0
    if (col) {
      try {
        measured = col.offsetWidth || Math.round(col.getBoundingClientRect().width) || 0
      } catch {
        measured = 0
      }
    }
    // Conversation-hidden and rightbar-closed CSS both consume our rail variable.
    // Use the shell's inline track under either override to avoid reading our own
    // width back; otherwise retain live measurements for divider dragging.
    const railWidthForced = doc?.documentElement?.hasAttribute?.(CONVERSATION_COLLAPSED_MARKER) === true ||
      Boolean(doc?.querySelector?.('.dshDesktopFrame[data-rightbar-collapsed="true"], [class*="frame"][data-rightbar-collapsed="true"]'))
    leftRailW = !railWidthForced && measured >= LEFT_RAIL_MIN_PX
      ? measured
      : (readShellRailWidthPx(doc) ?? (lastGoodLeftRailW || 0))
    if (leftRailW >= LEFT_RAIL_MIN_PX) lastGoodLeftRailW = leftRailW
  }
  const leftInset = doc?.body?.matches?.('[data-dsh-desktop-mode][data-dsh-desktop-platform="darwin"]')
    ? TOPBAR_MACOS_INSET_PX
    : TOPBAR_TOGGLE_LEFT_PX
  const toggleLeft = collapsed
    ? leftInset
    : Math.max(leftInset, Math.round(leftRailW - TOPBAR_TOGGLE_SIZE_PX - TOPBAR_TOGGLE_RIGHT_MARGIN_PX))
  // Cluster end clears toggle alone when expanded; when collapsed it also
  // clears the new-session control sitting to the toggle's right (same size + gap).
  const clusterExtra = collapsed ? TOPBAR_TOGGLE_SIZE_PX + TOPBAR_TOGGLE_GAP_PX : 0
  const newSessionLeft = collapsed
    ? toggleLeft + TOPBAR_TOGGLE_SIZE_PX + TOPBAR_TOGGLE_GAP_PX
    : null
  const toggleEnd = toggleLeft + TOPBAR_TOGGLE_SIZE_PX + TOPBAR_TOGGLE_GAP_PX + clusterExtra
  const panel = findVisibleWorkbenchPanel(doc)
  let panelLeft = null
  if (panel) {
    try {
      panelLeft = Math.round(panel.getBoundingClientRect().left)
    } catch {
      panelLeft = null
    }
  }
  const tabPadLeft = panelLeft == null ? 0 : Math.max(0, toggleEnd - panelLeft)
  const conversationWidth = deriveConversationWidthPx(doc, collapsed, leftRailW, lastGoodLeftRailW)
  return { collapsed, leftRailW, toggleLeft, toggleEnd, newSessionLeft, panelLeft, tabPadLeft, conversationWidth }
}

/**
 * Where the topbar toggle sits horizontally (CSS px). Collapsed rail → a small
 * top-left offset (over the full-width tab bar). Expanded rail → the sidebar's
 * top-right corner (measured sidebar width minus toggle size + margin).
 * @param {Document | null | undefined} doc
 * @returns {number}
 */
export function computeToggleLeftPx(doc) {
  return computeChromeLayout(doc).toggleLeft
}

/**
 * Left padding the open workbench tabBar needs so labels clear the fixed toggle.
 * Zero when the panel already starts to the right of toggleEnd (split / expanded).
 * @param {Document | null | undefined} doc
 * @returns {number}
 */
export function computeTabBarPadLeft(doc) {
  return computeChromeLayout(doc).tabPadLeft
}

/**
 * The official left sidebar column (the width we dock the toggle against).
 * @param {Document | null | undefined} doc
 * @returns {Element | null}
 */
export function findSidebarColumn(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  return doc.querySelector('[class*="sidebarCol"], [data-pane="sidebar"]')
    || doc.querySelector('.dshDesktopSidebarSurface, .dshDesktopUpstreamSidebar')
}

/**
 * Reserve only the part of each tab strip covered by the visible right controls.
 * @param {Document | null | undefined} doc
 */
export function syncTopbarTabClearance(doc) {
  const cluster = doc?.querySelector?.('[data-dsh-toggle-cluster], [class*="toggleCluster"]')
  const controls = cluster?.getBoundingClientRect?.()
  const panel = findVisibleWorkbenchPanel(doc)
  if (!panel) return
  for (const bar of panel.querySelectorAll('[class*="tabBar"]:not([class*="Plus"])')) {
    const box = bar.getBoundingClientRect()
    const pane = bar.parentElement.getBoundingClientRect()
    const overlaps = controls && controls.width > 0 && controls.height > 0
      && box.top < controls.bottom && box.bottom > controls.top
      && pane.left < controls.right && pane.right > controls.left
    const padding = overlaps
      ? Math.min(pane.width, Math.max(0, pane.right - controls.left) + TOPBAR_TOGGLE_GAP_PX)
      : 0
    const value = `${Math.ceil(padding)}px`
    if (bar.style.getPropertyValue('--omnimux-tabbar-pad-right') !== value) {
      bar.style.setProperty('--omnimux-tabbar-pad-right', value)
    }
  }
}

/**
 * Write geometry CSS variables used by tabBar padding and the fixed toggle.
 * @param {Document | null | undefined} doc
 * @param {{ left?: number, size?: number, gap?: number, top?: number }} [geom]
 */
export function applyTopbarToggleCssVars(doc, geom = {}) {
  const root = doc?.documentElement
  if (!root?.style?.setProperty) return
  const layout = computeChromeLayout(doc)
  const left = typeof geom.left === 'number' ? geom.left : layout.toggleLeft
  const size = typeof geom.size === 'number' ? geom.size : TOPBAR_TOGGLE_SIZE_PX
  const gap = typeof geom.gap === 'number' ? geom.gap : TOPBAR_TOGGLE_GAP_PX
  const top = typeof geom.top === 'number' ? geom.top : TOPBAR_TOGGLE_TOP_PX
  // Prefer layout.toggleEnd so collapsed cluster (toggle + new-session) is included.
  // Custom geom without end still expands by one control when collapsed.
  let end
  if (typeof geom.end === 'number') {
    end = geom.end
  } else if (typeof geom.left === 'number' || typeof geom.size === 'number' || typeof geom.gap === 'number') {
    const extra = layout.collapsed ? size + gap : 0
    end = left + size + gap + extra
  } else {
    end = layout.toggleEnd
  }
  const tabPad = typeof geom.tabPadLeft === 'number' ? geom.tabPadLeft : layout.tabPadLeft
  const newSessionLeft = typeof geom.newSessionLeft === 'number'
    ? geom.newSessionLeft
    : layout.newSessionLeft
  root.style.setProperty('--omnimux-topbar-toggle-left', `${left}px`)
  root.style.setProperty('--omnimux-topbar-toggle-size', `${size}px`)
  root.style.setProperty('--omnimux-topbar-toggle-gap', `${gap}px`)
  root.style.setProperty('--omnimux-topbar-toggle-top', `${top}px`)
  root.style.setProperty('--omnimux-topbar-toggle-end', `${end}px`)
  root.style.setProperty('--omnimux-tabbar-pad-left', `${Math.max(0, Math.round(tabPad))}px`)
  const nativeFrame = doc?.querySelector?.('.dshDesktopFrame:has([data-sidebar-right-panel]), [class*="frame"]:has([data-sidebar-right-panel])')
  // 收起意图优先于壳层读数：宿主收起后仍保留一条原生窄栏（真机 90px），照抄这条读数会让
  // 右侧栏收起规则 `grid-template-columns: var(--omnimux-sidebar-width) minmax(0px,1fr) 0px`
  // 把框架首列钉成 90px，屏左留下死带；全屏面板左缘与输入框投射也一并偏移 90px。
  // 本产品要求「收起即完全收起」，故 layout.collapsed 为真时一律镜像 0（Issue #2077）。
  const expandedRailWidth = (nativeFrame ? readShellRailWidthPx(doc) : null)
    ?? Math.max(0, layout.leftRailW || 280)
  const sidebarWidth = layout.collapsed ? 0 : expandedRailWidth
  root.style.setProperty('--omnimux-sidebar-width', `${sidebarWidth}px`)
  const convW = layout.conversationWidth ?? CONVERSATION_WIDTH_FALLBACK_PX
  // 幂等写：几何不变时跳过，避免与外壳 `style` 观察者形成自激回路（E-2 / 禁改清单 §5）。
  if (!isSamePxValue(root.style.getPropertyValue('--omnimux-conversation-width'), convW)) {
    root.style.setProperty('--omnimux-conversation-width', `${convW}px`)
  }
  syncTopbarTabClearance(doc)
  if (typeof newSessionLeft === 'number') {
    root.style.setProperty('--omnimux-topbar-new-session-left', `${newSessionLeft}px`)
  } else {
    try { root.style.removeProperty('--omnimux-topbar-new-session-left') } catch { /* ignore */ }
  }
}

/** @type {((doc: Document) => void) | null} 窗口缩放后的几何协调钩子（由装配层注入）。 */
let topbarGeometryHook = null

/**
 * 注册「窗口缩放后」的几何协调钩子。
 *
 * 顶栏模块只负责把中栏变量写到最新视口；右栏面板宽与分隔线把手由工作台侧协调
 * （方案 D7-S1′）。两者必须挂在同一次 resize 上，否则缩放后中栏按新比例、面板仍按旧宽度，
 * 把手与真实列边界当场错位。装配层注入、模块自身不反向依赖工作台几何。
 * @param {((doc: Document) => void) | null} hook
 */
export function setTopbarGeometryHook(hook) {
  topbarGeometryHook = typeof hook === 'function' ? hook : null
}

function runTopbarGeometryHook(doc) {
  if (!topbarGeometryHook) return
  try {
    topbarGeometryHook(doc)
  } catch {
    // 协调失败不得中断顶栏几何同步（面板宽最多滞后一帧）。
  }
}

/**
 * The better-sidebar workbench tab bar is the highest-stacking chrome in the
 * workspace; a fixed toggle child of it is guaranteed on top + clickable.
 * @param {Document | null | undefined} doc
 * @returns {Element | null}
 */
export function findTopbarAnchor(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  const anchor = doc.querySelector('[data-dsh-better-sidebar] [class*="tabBar"], [class*="tabBar"], [data-dsh-better-sidebar]')
  if (anchor) return anchor
  return doc.body || doc.documentElement || null
}

/**
 * Inject (idempotently) our own topbar toggle button into the better-sidebar
 * tab bar. Its click drives the official button's programmatic click.
 * @param {Document | null | undefined} doc
 * @returns {HTMLElement | null}
 */
export function injectTopbarToggleButton(doc) {
  const anchor = findTopbarAnchor(doc)
  if (!anchor) return null
  let btn = doc.querySelector(`[${SIDEBAR_TOGGLE_TOPBAR_ATTR}="1"]`)
  if (!btn) {
    btn = doc.createElement('button')
    btn.setAttribute('type', 'button')
    btn.setAttribute(SIDEBAR_TOGGLE_TOPBAR_ATTR, '1')
    btn.setAttribute('aria-label', '收起侧边栏')
    btn.innerHTML = COLLAPSE_ICON_SVG + EXPAND_ICON_SVG
    btn.addEventListener('click', (event) => {
      try { event.preventDefault() } catch { /* ignore */ }
      try { event.stopPropagation() } catch { /* ignore */ }
      const willCollapse = !isLeftSidebarCollapsed(doc)
      setExplicitLeftCollapseIntent(willCollapse)
      const official = findOfficialSidebarToggle(doc)
      if (official) triggerClick(official)
    })
    anchor.appendChild(btn)
  }
  applyButtonChrome(btn)
  return btn
}

/**
 * Inject (idempotently) the collapsed-only topbar new-session button.
 * @param {Document | null | undefined} doc
 * @param {boolean} collapsed
 * @returns {HTMLElement | null}
 */
export function injectTopbarNewSessionButton(doc, collapsed) {
  if (!doc) return null
  let btn = doc.querySelector(`[${TOPBAR_NEW_SESSION_ATTR}="1"]`)
  if (!collapsed) {
    if (btn instanceof HTMLElement) {
      try { btn.remove() } catch { /* ignore */ }
    }
    return null
  }
  const anchor = findTopbarAnchor(doc)
  if (!anchor) return null
  if (!btn) {
    btn = doc.createElement('button')
    btn.setAttribute('type', 'button')
    btn.setAttribute(TOPBAR_NEW_SESSION_ATTR, '1')
    btn.setAttribute('aria-label', '新建会话')
    btn.setAttribute('title', '新建会话')
    btn.innerHTML = NEW_SESSION_ICON_SVG
    btn.addEventListener('click', (event) => {
      try { event.preventDefault() } catch { /* ignore */ }
      try { event.stopPropagation() } catch { /* ignore */ }
      // Anchor the coordinator menu to THIS visible topbar control. Clicking the
      // official newSession button would open the menu at the hidden rail rect
      // (x≈0) and split it away from the icon.
      try {
        if (openCollapsedNewMenuAt(btn)) return
      } catch {
        // Fall through to official click if coordinator is not ready.
      }
      const official = findOfficialNewSessionButton(doc)
      if (official) triggerClick(official)
    })
    anchor.appendChild(btn)
  }
  applyButtonChrome(btn)
  return btn
}

/**
 * Defense in depth: inline no-drag + z-index + pointer-events (CSS also sets
 * these; Electron app-region needs no-drag + a high z-index to be clickable).
 * @param {HTMLElement} btn
 */
function applyButtonChrome(btn) {
  const inlineChrome = [
    `-webkit-app-region:no-drag`,
    `z-index:${TOPBAR_TOGGLE_Z_INDEX}`,
    'pointer-events:auto',
  ].join(';')
  try {
    btn.style.setProperty('-webkit-app-region', 'no-drag', 'important')
    btn.style.setProperty('z-index', String(TOPBAR_TOGGLE_Z_INDEX), 'important')
    btn.style.setProperty('pointer-events', 'auto', 'important')
  } catch {
    // ignore
  }
  try {
    const prev = btn.getAttribute('style') || ''
    if (!/-webkit-app-region\s*:\s*no-drag/i.test(prev)) {
      btn.setAttribute('style', `${prev};${inlineChrome}`.replace(/^;/, ''))
    }
  } catch {
    // ignore
  }
}

/**
 * Hide the official AppFrame toggle (it is only used as the programmatic
 * trigger). Also mark it so its own React onClick still fires on .click().
 * @param {Document | null | undefined} doc
 * @returns {HTMLElement | null}
 */
function hideOriginalToggle(doc) {
  const btn = findOfficialSidebarToggle(doc)
  if (!btn) return null
  btn.setAttribute(SIDEBAR_ORIGINAL_TOGGLE_ATTR, '1')
  try {
    btn.style.setProperty('display', 'none', 'important')
  } catch {
    // ignore
  }
  return btn
}

const RIGHTBAR_CHROME_STYLES_ID = 'omnimux-rightbar-chrome-styles'
const RIGHTBAR_CHROME_STYLES = `
/* 1. 修复创作画布等 Tab 标题文字被关闭按钮“x”遮挡及官方 mask-image 遮罩虚化截断 */
[data-dockkit-strip] [data-dockkit-tab-title],
[class*="_tabTitle_"] {
  width: auto !important;
  min-width: max-content !important;
  max-width: 200px !important;
  margin-right: 6px !important;
  padding-right: 0 !important;
  mask-image: none !important;
  -webkit-mask-image: none !important;
  overflow: visible !important;
  white-space: nowrap !important;
}

/* 2. 确保 Tab 容器留足右侧关闭按钮空间与最小呼吸留白 */
[data-dockkit-tab],
[class*="_tab_17p4l"] {
  min-width: max-content !important;
  padding-right: 28px !important;
  position: relative !important;
}

/* 3. 关闭按钮绝对定位居右并垂直居中，绝不压在标题字上 */
[data-dockkit-tab-close],
[class*="_tabClose_"] {
  position: absolute !important;
  right: 6px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  width: 18px !important;
  height: 18px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  z-index: 2 !important;
}

/* 4. 增强原生右上角按钮无拖拽穿透与交互 */
button[data-dockkit-split-button],
button[data-sidebar-right-mode],
button[data-sidebar-right-toggle],
button[data-sidebar-right-expand] {
  -webkit-app-region: no-drag !important;
}

/* 5. 修复右侧栏顶栏 strip 在 border-box 盒模型下高度塌陷（28px）导致 Tab 选项卡被下方内容页面遮挡：
   明确高度为 40px 并居中对齐，为选项卡胶囊提供上下各 6px 的正常呼吸间距，确保底部圆角完整展现且与内容保持优雅间距 */
[data-dockkit-strip],
[class*="_tabStrip_"] {
  height: 40px !important;
  box-sizing: border-box !important;
  padding: 6px 6px 6px 10px !important;
  align-items: center !important;
}

/* 只有全屏态需要视口右锚的 fixed 定位；分栏态（push）必须留在原生三列网格里。
   外壳把面板作为第三列的网格项渲染，拖拽分割线时按列宽实时定位。此前这条规则
   对分栏态也生效，面板被改成 fixed 元素后脱离网格不再跟随列宽 —— CDP 实测拖拽中
   面板左缘最多落后分割线 71px（黑缝），松手后才回弹；同时它给面板声明的 0.3s
   宽度过渡不在外壳 data-dragging 的中和范围内（那只覆盖帧与手柄），面板只能
   以 300ms 缓动追赶指针，跟手彻底丢失。分栏态的定位、宽度与过渡一律归还原生。 */
.dshDesktopFrame [data-sidebar-right-panel="fullscreen"][data-sidebar-right-open] {
  position: fixed !important;
  left: auto !important;
  right: 0 !important;
  box-sizing: border-box !important;
  transition: width var(--ds-transition-duration-slow) var(--ds-ease-in-out),
              transform var(--ds-transition-duration-slow) var(--ds-ease-in-out) !important;
}
@media (prefers-reduced-motion: reduce) {
  .dshDesktopFrame [data-sidebar-right-panel="fullscreen"][data-sidebar-right-open] {
    transition: none !important;
  }
}

/* 6. 右侧侧边栏全屏业务逻辑重构：工作区级铺满，与左侧侧边栏解耦联动 */
/* 5.1 默认全屏态（左侧侧边栏展开时）：只铺满右侧主区域，完整保留左侧侧边栏 */
[data-sidebar-right-panel="fullscreen"],
[class*="_panel"][data-sidebar-right-panel="fullscreen"] {
  position: fixed !important;
  top: 0 !important;
  bottom: 0 !important;
  right: 0 !important;
  left: var(--omnimux-sidebar-width, 280px) !important;
  width: calc(100vw - var(--omnimux-sidebar-width, 280px)) !important;
  box-sizing: border-box !important;
  z-index: 30 !important;
  border-left: 0.5px solid var(--dsw-alias-border-l4) !important;
  transition: left var(--ds-transition-duration-normal, 0.2s) ease,
              width var(--ds-transition-duration-normal, 0.2s) ease !important;
}

/* 5.2 真正的全屏态（左侧侧边栏折叠/隐藏时）：铺满整个 100vw 视口 */
html[data-omnimux-left-collapsed] [data-sidebar-right-panel="fullscreen"],
html[data-omnimux-left-collapsed] [class*="_panel"][data-sidebar-right-panel="fullscreen"],
.dshDesktopFrame[data-sidebar-collapsed] [data-sidebar-right-panel="fullscreen"],
.dshDesktopFrame[data-sidebar-collapsed] [class*="_panel"][data-sidebar-right-panel="fullscreen"] {
  left: auto !important;
  width: calc(100vw - var(--omnimux-sidebar-width, 0px)) !important;
  border-left: none !important;
}

/* 5.3 确保左侧侧边栏在层级上始终置顶并可完全交互 */
.dshDesktopSidebarSurface,
[class*="sidebarCol"],
[data-pane="sidebar"] {
  z-index: 35 !important;
  position: relative !important;
}

/* 5.4 桌面端在全屏且左侧收起时，给顶栏 strip 预留避让操作按钮组（自适应对接 --omnimux-topbar-toggle-end，macOS 下基准避让交通灯及两按钮共 164px） */
body[data-dsh-desktop-platform="darwin"] html[data-omnimux-left-collapsed] [data-sidebar-right-panel="fullscreen"] [data-dockkit-strip],
html[data-omnimux-left-collapsed] body[data-dsh-desktop-platform="darwin"] [data-sidebar-right-panel="fullscreen"] [data-dockkit-strip],
body[data-dsh-desktop-platform="darwin"] html[data-omnimux-left-collapsed] [data-sidebar-right-panel="fullscreen"] [class*="_tabStrip_"],
html[data-omnimux-left-collapsed] body[data-dsh-desktop-platform="darwin"] [data-sidebar-right-panel="fullscreen"] [class*="_tabStrip_"],
body[data-dsh-desktop-platform="darwin"] .dshDesktopFrame[data-sidebar-collapsed] [data-sidebar-right-panel="fullscreen"] [data-dockkit-strip],
body[data-dsh-desktop-platform="darwin"] .dshDesktopFrame[data-sidebar-collapsed] [data-sidebar-right-panel="fullscreen"] [class*="_tabStrip_"] {
  padding-left: var(--omnimux-topbar-toggle-end, 164px) !important;
}
html[data-omnimux-left-collapsed] [data-sidebar-right-panel="fullscreen"] [data-dockkit-strip],
html[data-omnimux-left-collapsed] [data-sidebar-right-panel="fullscreen"] [class*="_tabStrip_"],
.dshDesktopFrame[data-sidebar-collapsed] [data-sidebar-right-panel="fullscreen"] [data-dockkit-strip],
.dshDesktopFrame[data-sidebar-collapsed] [data-sidebar-right-panel="fullscreen"] [class*="_tabStrip_"] {
  padding-left: var(--omnimux-topbar-toggle-end, 88px) !important;
}
}
`

function ensureRightbarChromeStyles(doc) {
  if (!doc || doc.getElementById(RIGHTBAR_CHROME_STYLES_ID)) return
  const style = doc.createElement('style')
  style.id = RIGHTBAR_CHROME_STYLES_ID
  style.textContent = RIGHTBAR_CHROME_STYLES
  const target = doc.head || doc.documentElement
  if (target) target.appendChild(style)
}

/**
 * Removes plugin-owned duplicate buttons and applies shared chrome styles.
 * Native control placement and actions remain owned by SidebarRight.
 * @param {Document | null | undefined} doc
 */
export function syncNativeRightbarControls(doc) {
  if (!doc) return

  // 1. 移除我们自定义注入的重复按钮，彻底保留原生
  const injected = doc.querySelectorAll(`[${TOPBAR_RIGHT_EXPAND_ATTR}]`)
  injected.forEach((el) => {
    try { el.remove() } catch { /* ignore */ }
  })

  // 2. 注入全局样式补丁（修复 Tab 标题文字遮挡）
  ensureRightbarChromeStyles(doc)

  // SidebarRight owns expansion and mode, including its header-corner expand
  // seat. Keep React-managed controls in their native tree and let each click
  // reach the owner's handler exactly once. Conversation visibility is derived
  // from the committed panel state by split-compact-layout.
}

/**
 * Kept for backwards compatibility; now delegated to syncNativeRightbarControls.
 * @param {Document | null | undefined} doc
 * @returns {null}
 */
export function injectTopbarRightExpandButton(doc) {
  syncNativeRightbarControls(doc)
  return null
}

/**
 * Wire the topbar toggle + collapsed mirror. Returns the injected toggle button.
 * @param {Document | null | undefined} doc
 * @returns {HTMLElement | null}
 */
export function ensureSidebarToggleTopbar(doc) {
  if (!doc?.documentElement) return null
  const root = doc.documentElement
  root.setAttribute(SIDEBAR_TOGGLE_TOPBAR_HTML_ATTR, '')
  applyTopbarToggleCssVars(doc)
  const collapsed = syncLeftCollapsedHtmlAttr(doc)
  hideOriginalToggle(doc)
  const btn = injectTopbarToggleButton(doc)
  injectTopbarNewSessionButton(doc, collapsed)
  syncNativeRightbarControls(doc)
  // Guard against the observer's aria-label attribute filter: setting the same
  // value would still fire a MutationRecord and loop forever.
  if (btn) {
    const label = collapsed ? '打开侧边栏' : '收起侧边栏'
    if (btn.getAttribute('aria-label') !== label) btn.setAttribute('aria-label', label)
  }
  return btn
}

/**
 * Install MutationObserver to keep the injected toggle present and collapsed
 * attr mirrored. Uses targeted host observers and rAF/debouncing to prevent
 * microtask starvation and observer oscillations.
 * @param {Document | null | undefined} [doc]
 * @returns {() => void}
 */
export function installSidebarToggleTopbar(doc = typeof document !== 'undefined' ? document : undefined) {
  if (!doc) return () => {}
  ensureSidebarToggleTopbar(doc)

  /** @type {MutationObserver | null} */
  let collapsedObserver = null
  /** @type {MutationObserver | null} */
  let anchorObserver = null
  /** @type {MutationObserver | null} */
  let desktopObserver = null
  /** @type {MutationObserver | null} */
  let frameObserver = null
  /** @type {ResizeObserver | null} */
  let widthObserver = null
  /** @type {((this: Window, ev: UIEvent) => void) | null} */
  let resizeListener = null

  /** @type {number | any} */
  let pendingSchedule = null
  let isEnsuring = false

  // Track mounted controls and leaf panes so split dragging updates overlap.
  const syncGeometry = () => {
    try { applyTopbarToggleCssVars(doc) } catch { /* ignore */ }
    runTopbarGeometryHook(doc)
  }
  /** @type {Set<Element>} */
  let observedTargets = new Set()
  const ensureObserveTargets = () => {
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null)
    const ResizeObserverClass = win?.ResizeObserver || (typeof ResizeObserver !== 'undefined' ? ResizeObserver : undefined)
    if (!ResizeObserverClass) return
    // Writes must not happen inside the ResizeObserver delivery cycle: mutating
    // layout there re-arms the observer and yields the browser's
    // `ResizeObserver loop completed with undelivered notifications.` warning
    // (same rule split-compact-layout.js documents). `scheduleSync` coalesces
    // into one rAF pass.
    if (!widthObserver) widthObserver = new ResizeObserverClass(scheduleSync)
    const panel = findVisibleWorkbenchPanel(doc)
    const bars = panel?.querySelectorAll('[class*="tabBar"]:not([class*="Plus"])') || []
    /** @type {(Element | null)[]} */
    const candidates = [
      findSidebarColumn(doc), panel,
      doc.querySelector('[data-dsh-toggle-cluster], [class*="toggleCluster"]'),
      ...Array.from(bars, bar => bar.parentElement),
    ]
    /** @type {Set<Element>} */
    const targets = new Set(candidates.filter(target => target !== null))
    for (const target of observedTargets) if (!targets.has(target)) widthObserver.unobserve(target)
    for (const target of targets) if (!observedTargets.has(target)) widthObserver.observe(target)
    observedTargets = targets
  }

  const scheduleSync = () => {
    if (pendingSchedule !== null) return
    let isCancelled = false
    const runner = () => {
      if (isCancelled) return
      pendingSchedule = null
      if (isEnsuring) return
      isEnsuring = true
      try {
        ensureSidebarToggleTopbar(doc)
        ensureObserveTargets()
        rebindHostObservers()
      } finally {
        isEnsuring = false
      }
    }

    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null)
    if (win && typeof win.requestAnimationFrame === 'function') {
      const id = win.requestAnimationFrame(runner)
      pendingSchedule = () => {
        isCancelled = true
        try { win.cancelAnimationFrame(id) } catch { /* ignore */ }
      }
    } else if (typeof requestAnimationFrame === 'function') {
      const id = requestAnimationFrame(runner)
      pendingSchedule = () => {
        isCancelled = true
        try { cancelAnimationFrame(id) } catch { /* ignore */ }
      }
    } else if (typeof queueMicrotask === 'function') {
      pendingSchedule = () => { isCancelled = true }
      queueMicrotask(runner)
    } else {
      const timer = setTimeout(runner, 0)
      pendingSchedule = () => {
        isCancelled = true
        try { clearTimeout(timer) } catch { /* ignore */ }
      }
    }
  }

  const ObserverClass = doc.defaultView?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : undefined)

  let observedCollapsedHost = null
  const bindCollapsedObserver = () => {
    if (!ObserverClass) return
    const host = collapsedHostNode(doc)
    if (!host || host === observedCollapsedHost) return
    if (collapsedObserver) {
      try { collapsedObserver.disconnect() } catch { /* ignore */ }
      collapsedObserver = null
    }
    observedCollapsedHost = host
    collapsedObserver = new ObserverClass(() => {
      scheduleSync()
    })
    const isSlot = typeof host.matches === 'function' && host.matches('[data-slot="root"]')
    const subtree = Boolean(isSlot && !host.hasAttribute('data-sidebar-collapsed'))
    collapsedObserver.observe(host, {
      attributes: true,
      attributeFilter: ['data-sidebar-collapsed', 'data-rightbar-collapsed'],
      subtree,
    })
  }

  let observedAnchor = null
  const bindAnchorObserver = () => {
    if (!ObserverClass) return
    const anchor = findTopbarAnchor(doc) || doc.querySelector?.('[data-dsh-better-sidebar]')
    if (!anchor || anchor === observedAnchor) return
    if (anchorObserver) {
      try { anchorObserver.disconnect() } catch { /* ignore */ }
      anchorObserver = null
    }
    observedAnchor = anchor
    anchorObserver = new ObserverClass(() => {
      scheduleSync()
    })
    anchorObserver.observe(anchor, {
      childList: true,
      subtree: true,
    })
  }

  const bindDesktopObserver = () => {
    if (desktopObserver || !ObserverClass) return
    desktopObserver = new ObserverClass(() => {
      scheduleSync()
    })
    const filter = ['data-dsh-desktop-mode', 'data-dsh-desktop-platform']
    if (doc.documentElement) {
      desktopObserver.observe(doc.documentElement, {
        attributes: true,
        attributeFilter: filter,
        subtree: false,
      })
    }
    if (doc.body) {
      desktopObserver.observe(doc.body, {
        attributes: true,
        attributeFilter: filter,
        subtree: false,
      })
    }
  }

  let observedFrame = null
  /**
   * The shell rewrites its authored grid on every splitter frame. Without this
   * signal a collapsed-rail pin would freeze the drag itself: it holds the
   * workbench box constant, so no ResizeObserver fires and the derived width
   * would never follow the pointer (measured: zero writes during a whole drag).
   */
  const bindFrameObserver = () => {
    if (!ObserverClass) return
    const frame = readFrame(doc)
    if (!frame || frame === observedFrame) return
    if (frameObserver) {
      try { frameObserver.disconnect() } catch { /* ignore */ }
      frameObserver = null
    }
    observedFrame = frame
    frameObserver = new ObserverClass(() => {
      scheduleSync()
    })
    frameObserver.observe(frame, {
      attributes: true,
      attributeFilter: ['style'],
      subtree: false,
    })
  }

  const rebindHostObservers = () => {
    bindCollapsedObserver()
    bindAnchorObserver()
    bindDesktopObserver()
    bindFrameObserver()
  }

  rebindHostObservers()
  ensureObserveTargets()
  try {
    const win = doc.defaultView
    if (win?.addEventListener) {
      resizeListener = () => { syncGeometry() }
      win.addEventListener('resize', resizeListener)
    }
  } catch { /* ignore */ }

  return () => {
    if (typeof pendingSchedule === 'function') {
      try { pendingSchedule() } catch { /* ignore */ }
      pendingSchedule = null
    }
    if (collapsedObserver) {
      try { collapsedObserver.disconnect() } catch { /* ignore */ }
      collapsedObserver = null
    }
    if (anchorObserver) {
      try { anchorObserver.disconnect() } catch { /* ignore */ }
      anchorObserver = null
    }
    if (desktopObserver) {
      try { desktopObserver.disconnect() } catch { /* ignore */ }
      desktopObserver = null
    }
    if (frameObserver) {
      try { frameObserver.disconnect() } catch { /* ignore */ }
      frameObserver = null
    }
    observedCollapsedHost = null
    observedAnchor = null
    observedFrame = null
    if (widthObserver) {
      try { widthObserver.disconnect() } catch { /* ignore */ }
      widthObserver = null
    }
    if (resizeListener) {
      try { doc.defaultView?.removeEventListener?.('resize', resizeListener) } catch { /* ignore */ }
      resizeListener = null
    }
    setExplicitLeftCollapseIntent(null)
    const root = doc.documentElement
    if (root) {
      root.removeAttribute(SIDEBAR_TOGGLE_TOPBAR_HTML_ATTR)
      root.removeAttribute(LEFT_COLLAPSED_HTML_ATTR)
      for (const k of [
        '--omnimux-topbar-toggle-left',
        '--omnimux-topbar-toggle-size',
        '--omnimux-topbar-toggle-gap',
        '--omnimux-topbar-toggle-top',
        '--omnimux-topbar-toggle-end',
        '--omnimux-tabbar-pad-left',
        '--omnimux-topbar-new-session-left',
      ]) {
        try { root.style.removeProperty(k) } catch { /* ignore */ }
      }
    }
    for (const bar of doc.querySelectorAll('[data-dsh-better-sidebar] [class*="tabBar"]:not([class*="Plus"])')) {
      bar.style.removeProperty('--omnimux-tabbar-pad-right')
    }
    const injected = doc.querySelector?.(`[${SIDEBAR_TOGGLE_TOPBAR_ATTR}="1"]`)
    if (injected instanceof HTMLElement) {
      try { injected.remove() } catch { /* ignore */ }
    }
    const newSession = doc.querySelector?.(`[${TOPBAR_NEW_SESSION_ATTR}="1"]`)
    if (newSession instanceof HTMLElement) {
      try { newSession.remove() } catch { /* ignore */ }
    }
    const rightExpand = doc.querySelector?.(`[${TOPBAR_RIGHT_EXPAND_ATTR}="1"]`)
    if (rightExpand instanceof HTMLElement) {
      try { rightExpand.remove() } catch { /* ignore */ }
    }
    const official = doc.querySelector?.(`[${SIDEBAR_ORIGINAL_TOGGLE_ATTR}="1"]`)
    if (official instanceof HTMLElement) {
      official.removeAttribute(SIDEBAR_ORIGINAL_TOGGLE_ATTR)
      try { official.style.removeProperty('display') } catch { /* ignore */ }
    }
  }
}
