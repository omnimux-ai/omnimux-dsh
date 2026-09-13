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
  const byBrand = doc.querySelector(`button.x-Wl6W_brand${notInjected}, button.x-Wl6W_newSession${notInjected}`)
  if (byBrand instanceof HTMLElement) return byBrand
  const byClass = doc.querySelector(
    `[class*="sidebarCol"] button[class*="newSession"]${notInjected}, [class*="sidebarCol"] [class*="newSession"]${notInjected}`,
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
  const isDragging = Boolean(
    doc?.body?.hasAttribute?.('data-dsh-sidebar-dragging') ||
    doc?.querySelector?.('[data-dragging]')
  )
  let collapsed = isLeftSidebarCollapsed(doc)
  if (explicitLeftCollapseIntent === true && (isDragging || !collapsed)) {
    collapsed = true
  } else if (explicitLeftCollapseIntent === false && (isDragging || collapsed)) {
    collapsed = false
  }
  let leftRailW = 0
  if (!collapsed) {
    const col = findSidebarColumn(doc)
    if (col) {
      try {
        leftRailW = col.offsetWidth || Math.round(col.getBoundingClientRect().width) || 0
      } catch {
        leftRailW = 0
      }
    }
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
  return { collapsed, leftRailW, toggleLeft, toggleEnd, newSessionLeft, panelLeft, tabPadLeft }
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
  return doc.querySelector(
    '[class*="sidebarCol"], [data-pane="sidebar"], .dshDesktopSidebarSurface, .dshDesktopUpstreamSidebar, [class*="UpstreamSidebar"]'
  )
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
  syncTopbarTabClearance(doc)
  if (typeof newSessionLeft === 'number') {
    root.style.setProperty('--omnimux-topbar-new-session-left', `${newSessionLeft}px`)
  } else {
    try { root.style.removeProperty('--omnimux-topbar-new-session-left') } catch { /* ignore */ }
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
/* 1. 修复创作画布等 Tab 标题文字被官方右侧 mask-image 渐变遮罩虚化截断（“创作画布”变“创作画x”） */
[data-dockkit-strip] [data-dockkit-tab-title],
[class*="_tabTitle_"] {
  width: auto !important;
  min-width: max-content !important;
  max-width: 220px !important;
  mask-image: none !important;
  -webkit-mask-image: none !important;
  overflow: visible !important;
  white-space: nowrap !important;
}

/* 2. 确保 Tab 按钮内留出合理宽度展示图标、文字与关闭 x */
[data-dockkit-tab],
[class*="_tab_17p4l"] {
  min-width: 120px !important;
  max-width: 220px !important;
  padding-right: 8px !important;
}

/* 3. 增强原生右上角按钮无拖拽穿透与交互 */
button[data-dockkit-split-button],
button[data-sidebar-right-mode],
button[data-sidebar-right-toggle],
button[data-sidebar-right-expand] {
  -webkit-app-region: no-drag !important;
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
 * Native right sidebar controls orchestrator:
 * 1. Remove duplicate/injected custom right buttons to prevent icon collision.
 * 2. Reorder controls so Fullscreen precedes Split: [Fullscreen | Split | Sidebar].
 * 3. Keep the native rightbar toggle button accessible when rightbar is collapsed.
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

  // 3. 全屏按钮迁移到左侧，顺序变为：全屏 ｜ 分栏 ｜ 侧边栏
  const splitBtn = doc.querySelector('button[data-dockkit-split-button], button[aria-label="分栏"]')
  const fsBtn = doc.querySelector('button[data-sidebar-right-mode="fullscreen"], button[aria-label="全屏"]')
  if (splitBtn && fsBtn && splitBtn.parentElement) {
    if (splitBtn.compareDocumentPosition(fsBtn) & Node.DOCUMENT_POSITION_FOLLOWING) {
      try {
        splitBtn.before(fsBtn)
      } catch {
        // ignore
      }
    }
  }

  // 4. 原生侧边栏按钮在关闭时也显示，以便点击激活展开
  const isRightCollapsed = Boolean(
    doc.querySelector('[data-rightbar-collapsed="true"]') ||
    doc.querySelector('.dshDesktopFrame[data-rightbar-collapsed="true"]')
  )
  const toggleBtn = doc.querySelector('button[data-sidebar-right-toggle="true"], button[data-sidebar-right-expand="true"]')
  const chrome = doc.querySelector('[data-dockkit-strip-chrome="true"], [class*="stripChrome"]')

  if (toggleBtn instanceof HTMLElement) {
    if (isRightCollapsed) {
      // 在关闭时，将其挂到 body 上并设置 fixed 显式展示在右上角
      if (toggleBtn.parentElement !== doc.body) {
        toggleBtn.dataset.originalParent = '_stripChrome'
        doc.body.appendChild(toggleBtn)
      }
      toggleBtn.style.setProperty('position', 'fixed', 'important')
      toggleBtn.style.setProperty('right', '8px', 'important')
      toggleBtn.style.setProperty('top', '5px', 'important')
      toggleBtn.style.setProperty('z-index', '9999', 'important')
      toggleBtn.style.setProperty('display', 'flex', 'important')
      toggleBtn.style.setProperty('visibility', 'visible', 'important')
      toggleBtn.style.setProperty('cursor', 'pointer', 'important')
      toggleBtn.style.setProperty('pointer-events', 'auto', 'important')

      if (!toggleBtn.__omnimuxClickBound) {
        toggleBtn.__omnimuxClickBound = true
        toggleBtn.addEventListener('click', () => {
          const frame = doc.querySelector('.dshDesktopFrame')
          if (frame?.hasAttribute('data-rightbar-collapsed')) {
            try {
              const propKey = Object.keys(toggleBtn).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'))
              if (propKey && typeof toggleBtn[propKey]?.onClick === 'function') {
                toggleBtn[propKey].onClick({ preventDefault: () => {}, stopPropagation: () => {} })
                return
              }
            } catch { /* ignore */ }
            const win = doc.defaultView || (typeof window !== 'undefined' ? window : null)
            win?.__omnimuxWorkbench?.open?.()
          }
        })
      }
    } else {
      // 展开状态下，归位到原生的 stripChrome 容器中
      if (chrome && toggleBtn.parentElement !== chrome) {
        chrome.appendChild(toggleBtn)
      }
      toggleBtn.style.removeProperty('position')
      toggleBtn.style.removeProperty('right')
      toggleBtn.style.removeProperty('top')
      toggleBtn.style.removeProperty('z-index')
      toggleBtn.style.removeProperty('display')
      toggleBtn.style.removeProperty('visibility')
    }
  }
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
  }
  /** @type {Set<Element>} */
  let observedTargets = new Set()
  const ensureObserveTargets = () => {
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null)
    const ResizeObserverClass = win?.ResizeObserver || (typeof ResizeObserver !== 'undefined' ? ResizeObserver : undefined)
    if (!ResizeObserverClass) return
    if (!widthObserver) widthObserver = new ResizeObserverClass(syncGeometry)
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

  const rebindHostObservers = () => {
    bindCollapsedObserver()
    bindAnchorObserver()
    bindDesktopObserver()
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
    observedCollapsedHost = null
    observedAnchor = null
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
