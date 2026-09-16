/**
 * 页面级全屏与分栏视窗模式调和器（Tab Viewport Reconciler）。
 *
 * 核心机制：
 * 1. 消除原生 DSH 右栏全屏与 Tab 状态脱节的问题，为每个 Tab 提供独立的视窗模式记忆；
 * 2. 默认行为：Tab 默认以全屏（WORKBENCH_FOCUS.gui）模式呈现；
 * 3. 用户在面板右上角手动切换全屏/分栏时，持久化记录当前 Tab 的选择；
 * 4. 切换激活 Tab 时，自动调和原生面板的模式：
 *    - 目标 Tab 偏好为 split 且面板处于 fullscreen -> 调用 exitHostRightSidebarFullscreen()
 *    - 目标 Tab 偏好为 gui 且面板处于 push -> 调用 enterHostRightSidebarFullscreen()
 * 5. 防护：调和执行期间置位 isReconciling 锁，杜绝程序切换触发的 DOM 变更被误判为用户手势。
 */

import {
  hostDocument,
  liveSnapshot,
  activeTabId,
  currentSessionId,
  getWorkbenchSidebarRight,
} from './host-adapter.js'
import {
  focusRecordForTab,
  persistSessionFocus,
  WORKBENCH_FOCUS,
  isWorkbenchTab,
} from './focus-state.js'
import {
  enterHostRightSidebarFullscreen,
  exitHostRightSidebarFullscreen,
  isHostRightSidebarFullscreen,
  HOST_RIGHT_PANEL_ATTR,
} from './host-fullscreen.js'

/**
 * 解析当前激活的 Tab 标识符。
 * 优先级：官方公开读面 ctx.sidebarRight.active() > better-sidebar 状态 snapshot.activeTabId > DOM 活跃 tab 节点属性。
 * @param {Document} [doc]
 * @param {object} [sidebarRight]
 * @returns {string | undefined}
 */
export function resolveCurrentTabId(doc = hostDocument(), sidebarRight = getWorkbenchSidebarRight()) {
  if (sidebarRight && typeof sidebarRight.active === 'function') {
    try {
      const active = sidebarRight.active()
      const key = active && (active.kind || active.type || active.id)
      if (typeof key === 'string' && key) return key
    } catch {}
  }
  const snap = liveSnapshot()
  const fromSnap = activeTabId(snap?.state)
  if (typeof fromSnap === 'string' && fromSnap) return fromSnap

  // DOM 兜底：查找 [role="tab"][aria-selected="true"] 上的标识
  if (doc && typeof doc.querySelector === 'function') {
    try {
      const activeTabEl = doc.querySelector('[role="tab"][aria-selected="true"]')
      const tabId = activeTabEl?.getAttribute?.('data-dockkit-tab')
      if (typeof tabId === 'string' && tabId) return tabId
    } catch {}
  }

  return undefined
}

/**
 * 创建调和控制器实例（无侵入、高内聚、易测试）。
 * @param {object} [deps]
 * @returns {{ sync: () => void, reset: () => void }}
 */
export function createTabViewportReconciler(deps = {}) {
  const getDoc = deps.getDoc || hostDocument
  const getSessionId = deps.getSessionId || currentSessionId
  const getTabId = deps.getTabId || (() => resolveCurrentTabId(getDoc()))
  const getFocusRecord = deps.getFocusRecord || focusRecordForTab
  const persistFocus = deps.persistFocus || persistSessionFocus
  const isFullscreen = deps.isFullscreen || (() => isHostRightSidebarFullscreen(getDoc()))
  const enterFullscreen = deps.enterFullscreen || (() => enterHostRightSidebarFullscreen(getDoc()))
  const exitFullscreen = deps.exitFullscreen || (() => exitHostRightSidebarFullscreen(getDoc()))

  let lastActiveTabId = null
  let lastMode = null
  let isReconciling = false

  function sync() {
    const doc = getDoc()
    if (!doc) return

    // 检查面板是否展开展示
    const panel = doc.querySelector?.(`[${HOST_RIGHT_PANEL_ATTR}][data-sidebar-right-open]`)
    if (!panel) {
      lastActiveTabId = null
      lastMode = null
      return
    }

    const currentMode = isFullscreen() ? 'fullscreen' : 'push'
    const currentTab = getTabId()
    const sessionId = getSessionId()

    // 1. 如果正在执行自动化模式调和，只更新快照记录，不当作用户手势写入偏好
    if (isReconciling) {
      lastMode = currentMode
      lastActiveTabId = currentTab
      return
    }

    // 2. Tab 切换场景：当前激活 Tab 与上一次不同
    if (currentTab && currentTab !== lastActiveTabId) {
      lastActiveTabId = currentTab
      lastMode = currentMode

      // 仅对工作台相关的 Tab 实施视窗偏好调和
      if (isWorkbenchTab(currentTab)) {
        const record = getFocusRecord(sessionId, currentTab)
        const targetMode = record?.mode || WORKBENCH_FOCUS.gui

        if (targetMode === WORKBENCH_FOCUS.gui && currentMode === 'push') {
          isReconciling = true
          lastMode = 'fullscreen'
          try {
            enterFullscreen()
          } finally {
            setTimeout(() => { isReconciling = false }, 50)
          }
          return
        } else if (targetMode === WORKBENCH_FOCUS.split && currentMode === 'fullscreen') {
          isReconciling = true
          lastMode = 'push'
          try {
            exitFullscreen()
          } finally {
            setTimeout(() => { isReconciling = false }, 50)
          }
          return
        }
      }
      return
    }

    // 3. 用户手势场景：在同一个 Tab 下，面板模式发生了改变
    if (currentTab && lastActiveTabId === currentTab && lastMode && currentMode !== lastMode) {
      lastMode = currentMode
      if (isWorkbenchTab(currentTab)) {
        const newMode = currentMode === 'fullscreen' ? WORKBENCH_FOCUS.gui : WORKBENCH_FOCUS.split
        persistFocus(sessionId, currentTab, { mode: newMode })
      }
      return
    }

    lastActiveTabId = currentTab
    lastMode = currentMode
  }

  return {
    sync,
    reset() {
      lastActiveTabId = null
      lastMode = null
      isReconciling = false
    },
  }
}

/**
 * 安装页面级视窗模式调和器。
 * @param {Document} [doc]
 * @returns {() => void} 卸载清理函数
 */
export function installTabViewportReconciler(doc = hostDocument()) {
  if (!doc?.documentElement) return () => {}

  const reconciler = createTabViewportReconciler({ getDoc: () => doc })
  reconciler.sync()

  const Observer = doc.defaultView?.MutationObserver
  if (typeof Observer !== 'function') return () => {}

  const observer = new Observer(() => {
    reconciler.sync()
  })

  // 观察属性变化与子树变化（覆盖面板模式属性与 tab 切换）
  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-sidebar-right-panel', 'data-sidebar-right-open', 'data-dockkit-tab', 'aria-selected'],
  })

  // 监听点击事件辅助触发（确保用户点击 Tabbar 或模式按钮时立即触发调和）
  const handleClick = () => {
    setTimeout(() => {
      reconciler.sync()
    }, 0)
  }
  doc.addEventListener('click', handleClick, { capture: true, passive: true })

  return () => {
    observer.disconnect()
    doc.removeEventListener('click', handleClick, { capture: true })
    reconciler.reset()
  }
}
