/**
 * 当前会话右栏面板解析（rc.3 多会话挂载适配）。
 *
 * rc.3 会为访问过的每个 Session 保留右侧栏挂载：非活动会话外层
 * `[data-sidebar-right-session]` 带 `hidden` / `aria-hidden`，内部面板仍保留
 * `data-sidebar-right-panel` / `data-sidebar-right-open`。所有右栏状态读取必须
 * 绑定当前在屏会话，禁止 document.querySelector 取第一个匹配。
 */

import { hostWindow, mountedSessionId } from './host-adapter.js'

export const RIGHT_PANEL_ATTR = 'data-sidebar-right-panel'
export const RIGHT_PANEL_SELECTOR = `[${RIGHT_PANEL_ATTR}]`
export const RIGHT_PANEL_OPEN_ATTR = 'data-sidebar-right-open'
export const RIGHT_PANEL_MODE_ATTR = 'data-sidebar-right-panel'
export const RIGHT_PANEL_SESSION_ATTR = 'data-sidebar-right-session'

/** 面板自身或会话包装是否处于隐藏态。 */
export function isVisibleSidebarPanel(panel) {
  if (!panel) return false
  // 极简测试假 DOM 没有 closest；无隐藏证据时按可见处理。
  if (typeof panel.closest !== 'function') return true
  try {
    if (typeof panel.hasAttribute === 'function') {
      if (panel.hasAttribute('hidden')) return false
      if (panel.getAttribute?.('aria-hidden') === 'true') return false
    }
    const parent = panel.parentElement
    return !parent || parent.closest('[hidden], [aria-hidden="true"]') === null
  } catch {
    return true
  }
}

/** 面板所属会话：官方把 `data-sidebar-right-session` 写在面板或其会话包装上。 */
export function panelSessionId(panel) {
  if (!panel || typeof panel.getAttribute !== 'function') return undefined
  return panel.getAttribute(RIGHT_PANEL_SESSION_ATTR)
    || panel.closest?.(`[${RIGHT_PANEL_SESSION_ATTR}]`)?.getAttribute(RIGHT_PANEL_SESSION_ATTR)
    || undefined
}

function defaultDocument() {
  return typeof globalThis.document !== 'undefined' ? globalThis.document : hostWindow()?.document
}

/**
 * 当前在屏会话的右栏面板。
 *
 * 优先用官方 `ctx.sidebarRight.mounted` 匹配 `data-sidebar-right-session`；
 * 没有绑定/旧宿主无会话标记时退回「不在隐藏包装里的面板」。全部隐藏返回 null，
 * 绝不返回 panels[0] 的隐藏旧面板。
 *
 * @param {Document} [doc]
 * @returns {Element | null}
 */
export function currentRightbarPanel(doc = defaultDocument()) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  try {
    const panels = typeof doc.querySelectorAll === 'function'
      ? [...doc.querySelectorAll(RIGHT_PANEL_SELECTOR)]
      : [doc.querySelector(RIGHT_PANEL_SELECTOR)].filter(Boolean)
    if (panels.length === 0) return null
    const mounted = mountedSessionId()
    const hasSessionMarkers = panels.some((panel) => Boolean(panelSessionId(panel)))
    if (mounted && hasSessionMarkers) {
      const own = panels.find((panel) => panelSessionId(panel) === mounted)
      return own && isVisibleSidebarPanel(own) ? own : null
    }
    return panels.find(isVisibleSidebarPanel) || null
  } catch {
    return null
  }
}

/**
 * 当前会话右栏状态。
 * @param {Document} [doc]
 * @returns {{ panel: Element | null, open: boolean, fullscreen: boolean }}
 */
export function readCurrentRightbarState(doc = defaultDocument()) {
  const panel = currentRightbarPanel(doc)
  if (!panel) return { panel: null, open: false, fullscreen: false }
  const open = typeof panel.hasAttribute === 'function' && panel.hasAttribute(RIGHT_PANEL_OPEN_ATTR)
  const fullscreen = open && panel.getAttribute?.(RIGHT_PANEL_MODE_ATTR) === 'fullscreen'
  return { panel, open, fullscreen }
}
