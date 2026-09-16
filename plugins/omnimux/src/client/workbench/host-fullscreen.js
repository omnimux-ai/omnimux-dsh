/**
 * 宿主右侧侧栏全屏态的判定与确定性退出（#rail-active-state-convergence / P3）。
 *
 * 为什么需要独立模块：宿主全屏是**官方自己的**状态键（`surface.layout.mode === 'fullscreen'`），
 * 与插件侧的 `conversationCollapsed` 完全无关。插件清掉折叠键，面板仍以
 * `position:fixed; width:100%` 盖住中间栏，表现为「点了会话记录没反应」。
 *
 * 判定真源（优先级从高到低）：
 *   1. 官方面板自身属性 `[data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]`；
 *   2. 壳层镜像 `[data-rightbar-fullscreen="true"]`（面板未挂载时兜底，且面板未声明 `push` 才采信）。
 *
 * 退出动作：官方 `ISidebarRight` 公开写面没有 `setMode` / `exitFullscreen`
 * （只有 openResource / openTab / close / toggleExpanded / focus / split / float / dock），
 * `setMode` 是内部 store action，唯一外部可达路径是面板右上角那颗模式按钮。
 * 因此退出 = 点击 `button[data-sidebar-right-mode="push"]`；按钮缺失时降级到
 * `setFocus('split')`（清插件折叠键）并保持可观测的返回值。
 */

import { hostWindow } from './host-adapter.js'

/** 官方面板在真实界面上处于全屏：模式键 + 展开键同时命中。 */
export const HOST_FULLSCREEN_PANEL_SELECTOR = '[data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]'
/** 壳层外框镜像全屏键（由官方外框写，插件只读）。 */
export const HOST_FULLSCREEN_MIRROR_SELECTOR = '[data-rightbar-fullscreen="true"]'
/** 面板模式属性（官方为其标注了稳定取值 `fullscreen` / `push`）。 */
export const HOST_RIGHT_PANEL_ATTR = 'data-sidebar-right-panel'
/** 面板模式按钮属性：命中即官方为可达性标注过的稳定控件。 */
export const HOST_FULLSCREEN_MODE_BUTTON_ATTR = 'data-sidebar-right-mode'

/**
 * 退出全屏按钮候选：面板作用域内优先，其次是官方稳定的文档级 push 按钮。
 * 只认「切到非全屏」的目标模式（`push` / `split`）与显式退出全屏的无障碍标签，
 * 绝不点击会把面板推进全屏的按钮。
 */
export const HOST_FULLSCREEN_EXIT_SELECTORS = Object.freeze([
  `button[${HOST_FULLSCREEN_MODE_BUTTON_ATTR}="push"]`,
  `button[${HOST_FULLSCREEN_MODE_BUTTON_ATTR}="split"]`,
  'button[aria-label="退出全屏"]',
  'button[aria-label="Exit fullscreen"]',
  'button[aria-label="分栏"]:not([data-dockkit-split-button])',
  'button[aria-label="Split"]:not([data-dockkit-split-button])',
])

/** 无法在面板作用域内定位按钮时，仍可采信的官方稳定控件。 */
const DOCUMENT_WIDE_EXIT_SELECTORS = Object.freeze([
  `button[${HOST_FULLSCREEN_MODE_BUTTON_ATTR}="push"]`,
])

/**
 * 进入全屏按钮候选：面板作用域内优先，其次是官方稳定的文档级 fullscreen 按钮。
 */
export const HOST_FULLSCREEN_ENTER_SELECTORS = Object.freeze([
  `button[${HOST_FULLSCREEN_MODE_BUTTON_ATTR}="fullscreen"]`,
  'button[aria-label="全屏"]',
  'button[aria-label="全屏铺满"]',
  'button[aria-label="To fullscreen"]',
  'button[aria-label="Fullscreen"]',
])

/** 无法在面板作用域内定位按钮时，仍可采信的官方稳定控件。 */
const DOCUMENT_WIDE_ENTER_SELECTORS = Object.freeze([
  `button[${HOST_FULLSCREEN_MODE_BUTTON_ATTR}="fullscreen"]`,
])

/** 官方面板根节点（无论全屏与否都会渲染）。 */
export function findHostRightPanel(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  try {
    return doc.querySelector(`[${HOST_RIGHT_PANEL_ATTR}]`)
  } catch {
    return null
  }
}

/**
 * 宿主右侧侧栏是否正处于全屏呈现。
 * @param {Document} [doc]
 * @returns {boolean}
 */
export function isHostRightSidebarFullscreen(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return false
  try {
    if (doc.querySelector(HOST_FULLSCREEN_PANEL_SELECTOR)) return true
  } catch {
    // 选择器不被支持时退回镜像判定。
  }
  let mirror = null
  try {
    mirror = doc.querySelector(HOST_FULLSCREEN_MIRROR_SELECTOR)
  } catch {
    mirror = null
  }
  if (!mirror) return false
  // 镜像键由壳层写；只要面板自己已声明非全屏模式，就不采信镜像。
  const panel = findHostRightPanel(doc)
  const mode = panel && typeof panel.getAttribute === 'function'
    ? panel.getAttribute(HOST_RIGHT_PANEL_ATTR)
    : null
  return mode !== 'push'
}

/**
 * 定位退出全屏的官方控件：先在全屏面板作用域内找，再退回文档级稳定控件。
 * @param {Document} [doc]
 * @returns {Element | null}
 */
export function findHostFullscreenExitButton(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  let panel = null
  try {
    panel = doc.querySelector(HOST_FULLSCREEN_PANEL_SELECTOR) || doc.querySelector(`[${HOST_RIGHT_PANEL_ATTR}]`)
  } catch {
    panel = null
  }
  if (panel && typeof panel.querySelector === 'function') {
    for (const selector of HOST_FULLSCREEN_EXIT_SELECTORS) {
      const found = panel.querySelector(selector)
      if (found && typeof found.click === 'function') return found
    }
  }
  for (const selector of DOCUMENT_WIDE_EXIT_SELECTORS) {
    const found = doc.querySelector(selector)
    if (found && typeof found.click === 'function') return found
  }
  return null
}

/** 插件全局上的 `setFocus`，仅在官方控件缺失时作为降级动作。 */
function resolveHostSetFocus() {
  const win = hostWindow()
  const api = win && win.__omnimuxWorkbench
  return api && typeof api.setFocus === 'function' ? api.setFocus.bind(api) : null
}

/**
 * 退出宿主右侧侧栏全屏。非全屏时是纯 no-op（返回 `false`，不产生点击）。
 *
 * @param {Document} [doc]
 * @param {{ setFocus?: (mode: string) => unknown }} [deps] 测试注入点：降级动作。
 * @returns {boolean} 是否实际执行了一次退出动作
 */
export function exitHostRightSidebarFullscreen(doc, deps = {}) {
  if (!isHostRightSidebarFullscreen(doc)) return false

  const button = findHostFullscreenExitButton(doc)
  if (button) {
    try {
      button.click()
      return true
    } catch {
      // 点击抛错时走下面的降级动作。
    }
  }

  const setFocus = typeof deps.setFocus === 'function' ? deps.setFocus : resolveHostSetFocus()
  if (typeof setFocus === 'function') {
    try {
      setFocus('split')
      return true
    } catch {
      return false
    }
  }
  return false
}

/**
 * 定位进入全屏的官方控件：先在已展开面板作用域内找，再退回文档级稳定控件。
 * @param {Document} [doc]
 * @returns {Element | null}
 */
export function findHostFullscreenEnterButton(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  let panel = null
  try {
    panel = doc.querySelector(`[${HOST_RIGHT_PANEL_ATTR}][data-sidebar-right-open]`)
  } catch {
    panel = null
  }
  if (panel && typeof panel.querySelector === 'function') {
    for (const selector of HOST_FULLSCREEN_ENTER_SELECTORS) {
      const found = panel.querySelector(selector)
      if (found && typeof found.click === 'function') return found
    }
  }
  for (const selector of DOCUMENT_WIDE_ENTER_SELECTORS) {
    const found = doc.querySelector(selector)
    if (found && typeof found.click === 'function') return found
  }
  return null
}

/**
 * 进入宿主右侧侧栏全屏。已经是全屏时是纯 no-op（返回 `false`，不产生点击）。
 *
 * @param {Document} [doc]
 * @param {{ setFocus?: (mode: string) => unknown }} [deps] 测试注入点：降级动作。
 * @returns {boolean} 是否实际执行了一次进入全屏动作
 */
export function enterHostRightSidebarFullscreen(doc, deps = {}) {
  if (isHostRightSidebarFullscreen(doc)) return false

  const button = findHostFullscreenEnterButton(doc)
  if (button) {
    try {
      button.click()
      return true
    } catch {
      // 点击抛错时走下面的降级动作。
    }
  }

  const setFocus = typeof deps.setFocus === 'function' ? deps.setFocus : resolveHostSetFocus()
  if (typeof setFocus === 'function') {
    try {
      setFocus('gui')
      return true
    } catch {
      return false
    }
  }
  return false
}

