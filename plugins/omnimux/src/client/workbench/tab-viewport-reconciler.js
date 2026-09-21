/**
 * 页面级全屏与分栏视窗模式调和器（Tab Viewport Reconciler）。
 *
 * Issue #2516 一级入口按意图全屏：
 * 1. 左侧打开右侧页面默认全屏。调和器不得把未标记 explicit 的全屏拆回三栏（图 1 真凶）。
 * 2. 同会话内部换页签锁当前布局，不按目标页默认弹全屏。
 * 3. 用户点官方全屏/分栏按钮才写入页面钥匙 + 会话钥匙。
 * 4. 切换会话时按目标会话钥匙恢复三栏或会话全屏，不把 A 的布局带到 B。
 * 5. 判定只依赖面板模式键与页签身份，不读左侧会话列表渲染事实。
 */

import {
  hostDocument,
  liveSnapshot,
  activeTabId,
  currentSessionId,
  getWorkbenchSidebarRight,
  getWorkbenchLayout,
} from './host-adapter.js'
import {
  focusRecordForTab,
  persistSessionFocus,
  WORKBENCH_FOCUS,
  isWorkbenchTab,
  WORKBENCH_TAB_TITLE_FALLBACKS,
} from './focus-state.js'
import {
  isHostRightSidebarFullscreen,
  HOST_RIGHT_PANEL_ATTR,
} from './host-fullscreen.js'
import {
  applyConversationCollapsedAttr,
  persistConversationCollapsed,
  persistSessionThreeColumn,
  loadSessionThreeColumn,
} from '../conversation-collapse.js'
const PROGRAMMATIC_LOCK_MS = 80

const TITLE_TO_TAB_ID = new Map(
  Object.entries(WORKBENCH_TAB_TITLE_FALLBACKS).map(([tabId, title]) => [title, tabId])
)

/**
 * 确保分栏状态下右侧工作台处于健康舒适的黄金比例宽度（≥450px，大屏约为视口的 45%），
 * 防止桌面端 layout 曾经被误拖拽至 300px 极端窄缝，导致中间会话栏被强行拉扯出 500px 黑色空洞。
 * @param {Document} [doc]
 */
export function ensureHealthySplitWidth(doc = hostDocument()) {
  if (!doc) return
  const win = doc.defaultView || globalThis.window
  const viewport = win?.innerWidth || 1728
  const targetHealthyWidth = Math.max(500, Math.round(viewport * 0.45))

  const layout = getWorkbenchLayout()
  if (layout && typeof layout.setRightbar === 'function') {
    try {
      const snap = layout.getSnapshot?.()
      if (snap && typeof snap.rightbar === 'number' && snap.rightbar < 450) {
        layout.setRightbar(targetHealthyWidth, viewport)
        return
      }
    } catch {}
  }

  // DOM React Fiber 兜底探测
  try {
    const frame = doc.querySelector?.('.dshDesktopFrame')
    if (frame) {
      const key = Object.keys(frame).find((k) => k.startsWith('__reactFiber'))
      let p = key ? frame[key] : null
      while (p) {
        if (p.memoizedProps?.layout && typeof p.memoizedProps.layout.setRightbar === 'function') {
          const l = p.memoizedProps.layout
          const snap = l.getSnapshot?.()
          if (snap && typeof snap.rightbar === 'number' && snap.rightbar < 450) {
            l.setRightbar(targetHealthyWidth, viewport)
          }
          break
        }
        p = p.return
      }
    }
  } catch {}
}

/**
 * 解析当前激活的 Tab 标识符。
 * 优先级：官方公开读面 ctx.sidebarRight.active() > better-sidebar 状态 snapshot.activeTabId > DOM 活跃 tab 标题反查。
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
  if (typeof fromSnap === 'string' && fromSnap && isWorkbenchTab(fromSnap)) return fromSnap

  // DOM 查找：检查 better-sidebar 活跃 Tab 或 dockkit tab
  if (doc && typeof doc.querySelector === 'function') {
    try {
      const activeTabEl = doc.querySelector('[data-dsh-better-sidebar] [class*="tabActive"], [class*="tabActive"]')
      const title = activeTabEl?.getAttribute?.('title') || activeTabEl?.textContent?.trim()
      if (title && TITLE_TO_TAB_ID.has(title)) {
        return TITLE_TO_TAB_ID.get(title)
      }
      const dockkitTab = activeTabEl?.getAttribute?.('data-dockkit-tab')
      if (dockkitTab) return dockkitTab
    } catch {}
  }

  // 顶层通用兜底：查找 [role="tab"][aria-selected="true"] 上的标识
  if (doc && typeof doc.querySelector === 'function') {
    try {
      const activeTabEl = doc.querySelector('[role="tab"][aria-selected="true"]')
      const tabId = activeTabEl?.getAttribute?.('data-dockkit-tab')
      if (tabId) return tabId
    } catch {}
  }

  return fromSnap || undefined
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
  const persistThreeColumn = deps.persistSessionThreeColumn || persistSessionThreeColumn
  const loadThreeColumn = deps.loadSessionThreeColumn || loadSessionThreeColumn
  const isFullscreen = deps.isFullscreen || (() => isHostRightSidebarFullscreen(getDoc()))
  const persistCollapsed = deps.persistConversationCollapsed || persistConversationCollapsed
  const applyCollapsedAttr = deps.applyConversationCollapsedAttr || applyConversationCollapsedAttr
  const closePanel = deps.closePanel || (() => {
    try { getDoc()?.defaultView?.__omnimuxWorkbench?.closePanel?.() } catch {}
  })
  const setFocus = deps.setFocus || ((mode) => {
    try { getDoc()?.defaultView?.__omnimuxWorkbench?.setFocus?.(mode, undefined, {}, undefined, { persistUserIntent: false }) } catch {}
  })

  let lastActiveTabId = null
  let lastMode = null
  let lastSessionId = null
  /** 上一轮观测时面板是否展开；`null` 表示尚未观测过。 */
  let lastPanelOpen = null
  let isReconciling = false
  let unlockTimer = null

  function scheduleUnlock() {
    if (unlockTimer) clearTimeout(unlockTimer)
    unlockTimer = setTimeout(() => {
      isReconciling = false
      unlockTimer = null
    }, PROGRAMMATIC_LOCK_MS)
  }

  function sync() {
    const doc = getDoc()
    if (!doc) return

    // 检查面板是否展开展示
    const panel = doc.querySelector?.(`[${HOST_RIGHT_PANEL_ATTR}][data-sidebar-right-open]`)
    if (!panel) {
      lastActiveTabId = null
      lastMode = null
      lastPanelOpen = false
      return
    }

    lastPanelOpen = true

    const currentMode = isFullscreen() ? 'fullscreen' : 'push'
    const currentTab = getTabId()
    const sessionId = getSessionId()

    // 1. 会话切换：首次只记身份。之后按目标会话钥匙恢复，不得把右侧全屏带过来。
    if (sessionId && sessionId !== lastSessionId) {
      const isFirstSight = lastSessionId == null
      lastSessionId = sessionId
      lastActiveTabId = currentTab
      lastMode = currentMode
      if (isFirstSight) return
      const threeColumn = loadThreeColumn(sessionId)
      isReconciling = true
      try {
        if (threeColumn) {
          lastMode = 'push'
          if (currentMode === 'fullscreen') {
            try { setFocus('split') } catch {}
            applyCollapsedAttr(false, doc)
            if (doc?.documentElement) {
              doc.documentElement.removeAttribute('data-omnimux-fullscreen-collapse-snapshot')
            }
          }
        } else {
          lastMode = 'push'
          try { closePanel() } catch {}
          try { setFocus('chat') } catch {}
          applyCollapsedAttr(false, doc)
        }
      } finally {
        scheduleUnlock()
      }
      return
    }

    // 2. 同会话内部换页签：锁当前布局，不按目标页默认弹全屏。
    if (currentTab && currentTab !== lastActiveTabId) {
      lastActiveTabId = currentTab
      lastMode = currentMode
      if (currentMode === 'push') {
        ensureHealthySplitWidth(doc)
      }
      return
    }

    // 3. 正在自动化调和模式，不当作用户手势写入偏好
    if (isReconciling) {
      lastMode = currentMode
      return
    }

    // 4. 用户手势：同一会话内点官方全屏/分栏。默认全屏不得走这里被拆掉。
    if (lastMode && currentMode !== lastMode) {
      lastMode = currentMode
      const isFs = currentMode === 'fullscreen'
      if (sessionId) {
        persistCollapsed(isFs, sessionId)
        persistThreeColumn(!isFs, sessionId)
        if (currentTab && isWorkbenchTab(currentTab)) {
          persistFocus(sessionId, currentTab, {
            mode: isFs ? WORKBENCH_FOCUS.gui : WORKBENCH_FOCUS.split,
            explicit: true,
          })
        }
      }
      if (isFs) {
        applyCollapsedAttr(true, doc)
      } else {
        applyCollapsedAttr(false, doc)
        if (doc?.documentElement) {
          doc.documentElement.removeAttribute('data-omnimux-fullscreen-collapse-snapshot')
        }
        ensureHealthySplitWidth(doc)
      }
      return
    }

    lastActiveTabId = currentTab
    lastMode = currentMode
  }

  return {
    sync,
    beginProgrammatic() {
      isReconciling = true
      if (unlockTimer) {
        clearTimeout(unlockTimer)
        unlockTimer = null
      }
    },
    endProgrammatic() {
      lastMode = isFullscreen() ? 'fullscreen' : 'push'
      lastActiveTabId = getTabId()
      isReconciling = true
      scheduleUnlock()
    },
    reset() {
      lastActiveTabId = null
      lastMode = null
      lastSessionId = null
      lastPanelOpen = null
      isReconciling = false
      if (unlockTimer) {
        clearTimeout(unlockTimer)
        unlockTimer = null
      }
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
  try {
    const win = doc.defaultView
    if (win) win.__omnimuxTabViewport = reconciler
  } catch {}

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
    attributeFilter: ['data-sidebar-right-panel', 'data-sidebar-right-open', 'data-dockkit-tab', 'aria-selected', 'class'],
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
    try {
      const win = doc.defaultView
      if (win && win.__omnimuxTabViewport === reconciler) delete win.__omnimuxTabViewport
    } catch {}
    reconciler.reset()
  }
}
