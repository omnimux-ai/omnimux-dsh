/**
 * 页面级全屏与分栏视窗模式调和器（Tab Viewport Reconciler）。
 *
 * 核心机制：
 * 1. 消除原生 DSH 右栏全屏与 Tab 状态脱节的问题，为每个 Tab 提供独立的视窗模式记忆；
 * 2. 默认行为：页签默认以**分栏**（WORKBENCH_FOCUS.split）呈现。展开右侧栏是一次「并排」意图，
 *    自动播种的默认值不构成用户意图，因此绝不自动占满整屏；
 * 3. 用户在面板右上角手动切换全屏/分栏时，持久化记录当前 Tab 的选择并标记为显式意图（`explicit`）；
 * 4. 切换激活 Tab 时，自动调和原生面板的模式 —— **只对用户显式选过的页签恢复其偏好**：
 *    - 目标 Tab 偏好为 split 且面板处于 fullscreen -> 调用 exitHostRightSidebarFullscreen()
 *    - 目标 Tab 偏好为 gui 且面板处于 push -> 调用 enterHostRightSidebarFullscreen()
 *    面板由收起转为展开的那一次同步一律呈现分栏，显式全屏记录在此刻也不生效。
 * 5. 防护与高稳定性：切页判定优先，调和锁仅防误判手势，快速切换不丢状态。
 *    判定只依赖面板自身的模式键与页签身份，绝不读取左侧会话列表的渲染事实 —— 曾经用作
 *    兜底的 `[role="treeitem"][aria-selected="true"]` 会让右侧栏的呈现方式取决于左栏是否
 *    展开、列表是否有选中行，与用户意图无关（Issue #2056）。
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
  enterHostRightSidebarFullscreen,
  exitHostRightSidebarFullscreen,
  isHostRightSidebarFullscreen,
  HOST_RIGHT_PANEL_ATTR,
} from './host-fullscreen.js'

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
  const isFullscreen = deps.isFullscreen || (() => isHostRightSidebarFullscreen(getDoc()))
  const enterFullscreen = deps.enterFullscreen || (() => enterHostRightSidebarFullscreen(getDoc()))
  const exitFullscreen = deps.exitFullscreen || (() => exitHostRightSidebarFullscreen(getDoc()))

  let lastActiveTabId = null
  let lastMode = null
  /** 上一轮观测时面板是否展开；`null` 表示尚未观测过（首轮不视为「刚刚展开」）。 */
  let lastPanelOpen = null
  let isReconciling = false
  let unlockTimer = null

  function scheduleUnlock() {
    if (unlockTimer) clearTimeout(unlockTimer)
    unlockTimer = setTimeout(() => {
      isReconciling = false
      unlockTimer = null
    }, 40)
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

    // 收起 → 展开的那一次同步：展开是一次「并排」意图，本次一律呈现分栏，
    // 即便该页签留有显式全屏记录也不在此刻占满整屏。
    const justOpened = lastPanelOpen === false
    lastPanelOpen = true

    const currentMode = isFullscreen() ? 'fullscreen' : 'push'
    const currentTab = getTabId()
    const sessionId = getSessionId()

    // 1. 优先处理 Tab 切换：切 Tab 时无论调和锁如何，立即响应该 Tab 的独立视窗偏好
    if (currentTab && currentTab !== lastActiveTabId) {
      lastActiveTabId = currentTab
      lastMode = currentMode

      // 仅对工作台相关的 Tab 实施视窗偏好调和
      if (isWorkbenchTab(currentTab)) {
        // 用户当前工作流状态绝对优先（Issue #2212）：
        // 若当前面板处于分栏模式（currentMode === 'push'，三栏并排状态），用户在右栏切换 Tab 仅仅是在分栏内切换浏览内容，
        // 绝不因目标 Tab 的历史偏好而自动执行全屏拉伸覆盖中间会话。保持分栏并持续黄金宽度保底。
        if (currentMode === 'push') {
          ensureHealthySplitWidth(doc)
          return
        }

        const record = getFocusRecord(sessionId, currentTab)
        // 只有用户亲手选过视窗模式的页签才恢复其偏好。`focusRecordForTab` 会按
        // `resolveDefaultFocus` 自动播种（工作台页签为 gui），那不是用户意图 —— 按分栏处理。
        const targetMode = !justOpened && record?.explicit === true
          ? record.mode
          : WORKBENCH_FOCUS.split

        if (targetMode === WORKBENCH_FOCUS.split && currentMode === 'fullscreen') {
          isReconciling = true
          lastMode = 'push'
          try {
            exitFullscreen()
            if (doc?.documentElement) {
              doc.documentElement.removeAttribute('data-omnimux-conversation-collapsed')
              doc.documentElement.removeAttribute('data-omnimux-fullscreen-collapse-snapshot')
            }
            ensureHealthySplitWidth(doc)
          } finally {
            scheduleUnlock()
          }
          return
        }
      }
      return
    }

    // 2. 同一 Tab 下，如果正在自动化调和模式，不当作用户手势写入偏好
    if (isReconciling) {
      lastMode = currentMode
      return
    }

    // 3. 用户手势场景：在同一个 Tab 下，面板模式发生了改变
    if (currentTab && lastActiveTabId === currentTab && lastMode && currentMode !== lastMode) {
      lastMode = currentMode
      if (isWorkbenchTab(currentTab)) {
        const newMode = currentMode === 'fullscreen' ? WORKBENCH_FOCUS.gui : WORKBENCH_FOCUS.split
        // `explicit: true` 是「这次是用户亲手选的」凭据：后续切回该页签才恢复其偏好。
        persistFocus(sessionId, currentTab, { mode: newMode, explicit: true })
        if (newMode === WORKBENCH_FOCUS.split && doc?.documentElement) {
          doc.documentElement.removeAttribute('data-omnimux-conversation-collapsed')
          doc.documentElement.removeAttribute('data-omnimux-fullscreen-collapse-snapshot')
          ensureHealthySplitWidth(doc)
        }
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
    reconciler.reset()
  }
}
