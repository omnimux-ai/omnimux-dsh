/**
 * 右栏全屏 ⇄ 中间会话栏折叠 的同步器。
 *
 * 为什么需要独立模块：官方全屏是**宿主自己的**状态键
 * （`[data-sidebar-right-panel="fullscreen"]`），而插件侧折叠键
 * `data-omnimux-conversation-collapsed` 此前只在焦点模式切到 `gui`（工作台独占）时才写。
 * 用户点面板右上角原生全屏按钮时走的是宿主全屏这条路径，不经过 `setFocus('gui')`，
 * 折叠键因此一直没写 —— 实测面板已全屏、会话列仍占 670px。
 *
 * 判定真源复用 `isHostRightSidebarFullscreen`（宿主面板属性优先，壳层镜像兜底），
 * 写入复用 `applyConversationCollapsedAttr`，不新造第二套状态。
 *
 * 退出全屏时**还原进入前的值**而不是无条件清掉：折叠键本身是用户偏好
 * （`setConversationCollapsed` 会持久化），无条件清会把用户故意收起的会话栏顶开。
 */

import { hostDocument } from './host-adapter.js'
import { isHostRightSidebarFullscreen } from './host-fullscreen.js'
import {
  applyConversationCollapsedAttr,
  readConversationCollapsedFromDom,
} from '../conversation-collapse.js'

/** 同步器持有的进入前快照：`null` 表示当前不在「由全屏驱动的折叠」中。 */
export const FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR = 'data-omnimux-fullscreen-collapse-snapshot'

/**
 * 纯函数：根据「宿主是否全屏」与「进入前快照」算出本次应写入的折叠值。
 * 便于单测覆盖全部状态迁移，不依赖 DOM。
 * @param {boolean} fullscreen 宿主右栏是否处于全屏。
 * @param {boolean | null} snapshot 进入全屏前的折叠值；`null` 表示不在全屏驱动中。
 * @param {boolean} currentDomValue 当前 DOM 上的折叠值。
 * @returns {{ collapsed: boolean, snapshot: boolean | null }}
 */
export function resolveFullscreenCollapse(fullscreen, snapshot, currentDomValue) {
  if (fullscreen) {
    // 已在全屏驱动中：保持快照，折叠态恒为收起。
    if (snapshot !== null) return { collapsed: true, snapshot }
    return { collapsed: true, snapshot: currentDomValue }
  }
  // 退出全屏：有快照就还原，没有就维持现状（不是本模块造成的折叠，不碰）。
  if (snapshot === null) return { collapsed: currentDomValue, snapshot: null }
  return { collapsed: snapshot, snapshot: null }
}

/**
 * 安装全屏 ⇄ 折叠同步。
 *
 * 观察宿主面板的模式属性与壳层外框的全屏镜像键；任一处变化都重算一次。
 * 面板由宿主在需要时才挂载，所以观察的是 document 子树而不是面板本身。
 * @param {Document | undefined} [doc]
 * @returns {() => void} 取消函数
 */
export function installFullscreenCollapseSync(doc = hostDocument()) {
  if (!doc?.documentElement) return () => {}
  const root = doc.documentElement
  let snapshot = root.hasAttribute(FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR)
    ? root.getAttribute(FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR) === 'true'
    : null

  const sync = () => {
    const fullscreen = isHostRightSidebarFullscreen(doc)

    // 若进入会话等外部手势清除了快照属性且已不在全屏中，强制同步清空内存快照
    if (!root.hasAttribute(FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR) && !fullscreen) {
      snapshot = null
    }

    const next = resolveFullscreenCollapse(fullscreen, snapshot, readConversationCollapsedFromDom(doc))
    if (next.snapshot !== snapshot) {
      snapshot = next.snapshot
      if (snapshot === null) root.removeAttribute(FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR)
      else root.setAttribute(FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR, String(snapshot))
    }
    if (readConversationCollapsedFromDom(doc) !== next.collapsed) {
      applyConversationCollapsedAttr(next.collapsed, doc)
    }
  }

  sync()

  const Observer = doc.defaultView?.MutationObserver
  if (typeof Observer !== 'function') return () => {}

  const observer = new Observer(sync)
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'data-sidebar-right-panel',
      'data-sidebar-right-open',
      'data-rightbar-fullscreen',
      FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR,
    ],
  })

  return () => {
    observer.disconnect()
    root.removeAttribute(FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR)
  }
}
