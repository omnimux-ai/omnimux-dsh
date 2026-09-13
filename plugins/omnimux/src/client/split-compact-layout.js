/**
 * 分栏（中间栏）布局感知：会话是否正被右侧辅助侧栏挤成窄列。
 *
 * 三条信号满足任一条即判定为分栏/中间栏：
 *   1. 宿主右侧侧栏在真实界面上展开（DOM 实测，不看内存状态）；
 *   2. 输入框已降到紧凑档（html[data-omnimux-composer-density] = short | icon）；
 *   3. 会话列实际宽度低于 SPLIT_COMPACT_MAX_COLUMN_PX。
 *
 * 为什么不看内存里的 workbench.panelOpen：点「新会话」时 closePanel() 已经把状态
 * 写成 panelOpen:false，真实侧栏却仍展开着（实测侧栏 1028px、中间栏只剩 680px），
 * 空白会话因此在分栏里错误地渲染出完整引导卡片。DOM 才是唯一真源。
 *
 * 判定值同时镜像到 html[data-omnimux-split-compact]，供 CSS 兜底；
 * 监听覆盖右侧侧栏折叠/展开、分栏拖拽、窗口缩放与输入框密度切换。
 *
 * @see ./session-guide/SessionGuide.jsx 消费方：分栏时必须返回 null
 * @see ./conversation-box.js 消费方：进入新会话不得破坏真实侧栏展开状态
 */
import { COMPOSER_COMPACT_ATTR } from './composer-compact.js'

/** 判定结果镜像属性：CSS 侧的分栏兜底选择器。 */
export const SPLIT_COMPACT_ATTR = 'data-omnimux-split-compact'
/** 会话列窄于此宽度即视为分栏中间栏（全宽会话列远大于此值）。 */
export const SPLIT_COMPACT_MAX_COLUMN_PX = 860
/** 右侧侧栏可见宽度下限：低于它按收起处理（收起时格轨为 0px）。 */
export const RIGHT_SIDEBAR_MIN_VISIBLE_PX = 50

/**
 * 右侧侧栏候选根节点。官方外框用 `[data-rightbar-col]` / `.dshDesktopRightbarSurface`，
 * 末位选择器是宿主 Tab 面板的兜底（哈希类名无法枚举，只作最后手段）。
 *
 * 官方 `button[data-sidebar-right-toggle="true"]` 刻意不作候选：按钮本身只有 32px，
 * 撑不到宽度下限，而收起时它会被挪到 body 下，量到的会是整个视口宽度。
 */
export const RIGHT_SIDEBAR_SELECTORS = Object.freeze([
  '[data-rightbar-col]',
  '[class*="rightbarCol"]',
  '.dshDesktopRightbarSurface',
  '[class*="rightbarSurface"]',
  '[data-dockkit-strip-chrome="true"]',
  '[class*="stripChrome"]',
  '[class*="_panel_"]',
])

/** 会话列候选根节点：先官方中列，再会话槽位。 */
export const CONVERSATION_COLUMN_SELECTORS = Object.freeze([
  '[class*="centerCol"]',
  '.dshDesktopConversationSurface',
  '[data-slot="conversation"]',
])

/** 左侧/底部停靠区：这些位置的侧栏面板永远不是「右侧侧栏」。 */
const NON_RIGHT_DOCK_SELECTOR = [
  '[class*="sidebarCol"]',
  '[class*="bottomPanel"]',
  '[class*="BottomPanel"]',
  '[class*="bottomDock"]',
  '[class*="BottomDock"]',
  '[data-dsh-bottom-dock]',
  '[data-dsh-bottom-toggle]',
].join(', ')

/** 外框上会改变分栏几何的属性。 */
const FRAME_ATTRIBUTE_FILTER = Object.freeze([
  'data-rightbar-collapsed',
  'data-rightbar-fullscreen',
  'data-rightbar-instant',
  'data-sidebar-collapsed',
  'data-dragging',
  'style',
])

/** html 根上会改变分栏/紧凑判定的属性。 */
const ROOT_ATTRIBUTE_FILTER = Object.freeze([
  COMPOSER_COMPACT_ATTR,
  SPLIT_COMPACT_ATTR,
  'data-omnimux-conversation-collapsed',
  'data-omnimux-left-collapsed',
  'style',
])

/** @returns {Document | undefined} */
function hostDocument() {
  return typeof document !== 'undefined' ? document : undefined
}

/**
 * 实测元素宽度：优先取包围盒，退化到 offsetWidth；无布局信息时返回 0。
 * @param {Element | null | undefined} node
 * @returns {number}
 */
export function elementWidth(node) {
  if (!node) return 0
  if (typeof node.getBoundingClientRect === 'function') {
    const width = Number(node.getBoundingClientRect()?.width)
    if (Number.isFinite(width) && width > 0) return width
  }
  const offsetWidth = Number(node.offsetWidth)
  return Number.isFinite(offsetWidth) && offsetWidth > 0 ? offsetWidth : 0
}

/**
 * 左侧/底部停靠区内的面板，或已隐藏的面板，都不是右侧侧栏。
 * @param {Element} node
 * @returns {boolean}
 */
function isNonRightDock(node) {
  if (typeof node.closest === 'function' && node.closest(NON_RIGHT_DOCK_SELECTOR)) return true
  const className = typeof node.className === 'string' ? node.className : ''
  return /Hidden/.test(className)
}

/**
 * 找出真实占用宽度的右侧侧栏根节点。
 *
 * 按选择器优先级分组扫描：官方右栏列一旦可见就立即采用，只有官方列缺席或零宽时
 * 才退到哈希类名兜底 —— 否则宽大的底部停靠面板会把判定带偏。
 * @param {Document | undefined} [doc]
 * @returns {Element | null}
 */
export function findRightSidebarRoot(doc = hostDocument()) {
  if (!doc?.querySelectorAll) return null
  let fallback = null
  let fallbackWidth = 0
  for (const selector of RIGHT_SIDEBAR_SELECTORS) {
    for (const node of doc.querySelectorAll(selector)) {
      if (isNonRightDock(node)) continue
      const width = elementWidth(node)
      if (width > RIGHT_SIDEBAR_MIN_VISIBLE_PX) return node
      if (width > fallbackWidth) {
        fallback = node
        fallbackWidth = width
      }
    }
  }
  return fallback
}

/**
 * 宿主右侧侧栏是否在真实界面上展开：外框没有收起标记，且根节点实测宽于 50px。
 * @param {Document | undefined} [doc]
 * @returns {boolean}
 */
export function isRightSidebarExpanded(doc = hostDocument()) {
  if (!doc?.querySelector) return false
  if (doc.querySelector('[data-rightbar-collapsed="true"]')) return false
  const root = findRightSidebarRoot(doc)
  return elementWidth(root) > RIGHT_SIDEBAR_MIN_VISIBLE_PX
}

/**
 * 会话列根节点（取第一个存在的候选），用于挂 ResizeObserver。
 * @param {Document | undefined} [doc]
 * @returns {Element | null}
 */
export function findConversationColumn(doc = hostDocument()) {
  if (!doc?.querySelector) return null
  for (const selector of CONVERSATION_COLUMN_SELECTORS) {
    const node = doc.querySelector(selector)
    if (node) return node
  }
  return null
}

/**
 * 会话列实测宽度；量不到（首次布局前 / 无宿主中列）时返回 0。
 * @param {Document | undefined} [doc]
 * @returns {number}
 */
export function readConversationColumnWidth(doc = hostDocument()) {
  if (!doc?.querySelector) return 0
  for (const selector of CONVERSATION_COLUMN_SELECTORS) {
    const width = elementWidth(doc.querySelector(selector))
    if (width > 0) return width
  }
  return 0
}

/**
 * 分栏/中间栏信号明细，便于调用方与测试定位是哪一条命中。
 * @param {Document | undefined} [doc]
 * @returns {{ sidebarExpanded: boolean, compactDensity: boolean, columnWidth: number, narrowColumn: boolean, splitCompact: boolean }}
 */
export function readSplitCompactSignals(doc = hostDocument()) {
  const density = doc?.documentElement?.getAttribute?.(COMPOSER_COMPACT_ATTR)
  const compactDensity = density === 'short' || density === 'icon'
  const sidebarExpanded = isRightSidebarExpanded(doc)
  const columnWidth = readConversationColumnWidth(doc)
  const narrowColumn = columnWidth > 0 && columnWidth < SPLIT_COMPACT_MAX_COLUMN_PX
  return {
    sidebarExpanded,
    compactDensity,
    columnWidth,
    narrowColumn,
    splitCompact: sidebarExpanded || compactDensity || narrowColumn,
  }
}

/**
 * @param {Document | undefined} [doc]
 * @returns {boolean} 是否处于分栏/中间栏（应展示简洁对话模式）
 */
export function isSplitOrCompactLayout(doc = hostDocument()) {
  if (!doc?.documentElement) return false
  return readSplitCompactSignals(doc).splitCompact
}

// ── 订阅：右侧侧栏折叠/展开、分栏拖拽、窗口缩放、输入框密度切换即时生效 ──

let activeDoc = null
let teardown = null
let listeners = new Set()
let snapshot = false
let measured = false
let trackedTargets = new Set()
let layoutResizeObserver = null

/**
 * 把判定结果镜像到 html，供 CSS 兜底；只在值真变化时写，避免自触发循环。
 * @param {Document | undefined} doc
 * @param {boolean} value
 */
function syncRootAttribute(doc, value) {
  const root = doc?.documentElement
  if (!root?.getAttribute) return
  if (value) {
    if (root.getAttribute(SPLIT_COMPACT_ATTR) !== 'true') root.setAttribute(SPLIT_COMPACT_ATTR, 'true')
  } else if (typeof root.hasAttribute === 'function' && root.hasAttribute(SPLIT_COMPACT_ATTR)) {
    root.removeAttribute(SPLIT_COMPACT_ATTR)
  }
}

/**
 * 重新测量并（可选）通知订阅者。
 * @param {Document | undefined} doc
 * @param {boolean} notify
 * @returns {boolean}
 */
function measure(doc, notify) {
  const next = isSplitOrCompactLayout(doc)
  const changed = !measured || next !== snapshot
  snapshot = next
  measured = true
  syncRootAttribute(doc, next)
  if (changed && notify) {
    for (const listener of [...listeners]) listener()
  }
  return next
}

/** 观测目标掉线（会话切换重建列）或首次出现时重新绑定。 */
function syncResizeTargets(doc) {
  const targets = new Set()
  const rightbar = findRightSidebarRoot(doc)
  if (rightbar) targets.add(rightbar)
  const column = findConversationColumn(doc)
  if (column) targets.add(column)
  const unchanged = targets.size === trackedTargets.size
    && [...targets].every((node) => trackedTargets.has(node))
  if (unchanged) return
  for (const node of trackedTargets) {
    try { layoutResizeObserver?.unobserve(node) } catch { /* ignore */ }
  }
  trackedTargets = targets
  for (const node of targets) {
    try { layoutResizeObserver?.observe(node) } catch { /* ignore */ }
  }
}

/**
 * 安装监听：ResizeObserver（右栏与会话列宽度）+ MutationObserver（外框与根属性）
 * + window resize 兜底。无 ResizeObserver 的环境（jsdom）退化为属性/缩放监听。
 * @param {Document} doc
 * @returns {() => void}
 */
function installWatchers(doc) {
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : undefined)
  const ObserverClass = win?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : undefined)
  const ResizeObserverClass = win?.ResizeObserver || (typeof ResizeObserver !== 'undefined' ? ResizeObserver : undefined)
  const disposers = []

  const refresh = () => measure(doc, true)

  if (ResizeObserverClass) {
    layoutResizeObserver = new ResizeObserverClass(() => {
      syncResizeTargets(doc)
      refresh()
    })
    disposers.push(() => {
      try { layoutResizeObserver?.disconnect() } catch { /* ignore */ }
      layoutResizeObserver = null
    })
  }

  if (ObserverClass && doc.documentElement) {
    const rootObserver = new ObserverClass(refresh)
    rootObserver.observe(doc.documentElement, { attributes: true, attributeFilter: [...ROOT_ATTRIBUTE_FILTER] })
    disposers.push(() => rootObserver.disconnect())
  }

  const frame = findFrameHost(doc)
  if (ObserverClass && frame) {
    const frameObserver = new ObserverClass(() => {
      syncResizeTargets(doc)
      refresh()
    })
    frameObserver.observe(frame, { attributes: true, attributeFilter: [...FRAME_ATTRIBUTE_FILTER] })
    disposers.push(() => frameObserver.disconnect())
  }

  if (win?.addEventListener) {
    const onResize = () => {
      syncResizeTargets(doc)
      refresh()
    }
    win.addEventListener('resize', onResize)
    disposers.push(() => win.removeEventListener('resize', onResize))
  }

  syncResizeTargets(doc)
  return () => {
    for (const dispose of disposers) {
      try { dispose() } catch { /* ignore */ }
    }
    trackedTargets = new Set()
  }
}

/**
 * 承载分栏几何的外框：优先右侧侧栏的父节点，退化到桌面外框。
 * @param {Document | undefined} doc
 * @returns {Element | null}
 */
function findFrameHost(doc) {
  const rightbar = findRightSidebarRoot(doc)
  if (rightbar?.parentElement) return rightbar.parentElement
  return doc?.querySelector?.('.dshDesktopFrame') || null
}

/** @param {Document | undefined} doc */
function ensureInstalled(doc) {
  if (!doc) return
  if (activeDoc === doc && teardown) return
  disposeInstall()
  activeDoc = doc
  measured = false
  teardown = installWatchers(doc)
}

function disposeInstall() {
  if (teardown) {
    try { teardown() } catch { /* ignore */ }
  }
  teardown = null
  activeDoc = null
  measured = false
  // 没有订阅者时镜像属性必须撤掉，别留下一条无主的 CSS 兜底规则。
  syncRootAttribute(hostDocument(), false)
}

/**
 * React `useSyncExternalStore` 取数：首次渲染直接实测，避免首帧闪出完整卡片；
 * 之后每次渲染复用实时结果，观测目标被替换也能自愈。
 * @returns {boolean}
 */
export function getSplitCompactSnapshot() {
  const doc = hostDocument()
  if (!doc) return false
  if (activeDoc !== doc) {
    snapshot = isSplitOrCompactLayout(doc)
    measured = true
    syncRootAttribute(doc, snapshot)
    return snapshot
  }
  return measure(doc, false)
}

/**
 * React `useSyncExternalStore` 订阅：返回退订函数；最后一个订阅者离开时释放监听。
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribeSplitCompactLayout(listener) {
  listeners.add(listener)
  const doc = hostDocument()
  if (doc) {
    ensureInstalled(doc)
    measure(doc, true)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) disposeInstall()
  }
}

/** 测试专用：拆除监听、清空订阅者与镜像属性。 */
export function resetSplitCompactLayoutForTests() {
  disposeInstall()
  listeners = new Set()
  snapshot = false
  measured = false
  trackedTargets = new Set()
  if (layoutResizeObserver) {
    try { layoutResizeObserver.disconnect() } catch { /* ignore */ }
    layoutResizeObserver = null
  }
  const root = hostDocument()?.documentElement
  if (root && typeof root.removeAttribute === 'function') root.removeAttribute(SPLIT_COMPACT_ATTR)
}
