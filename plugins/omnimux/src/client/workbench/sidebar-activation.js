/**
 * 左侧栏激活位唯一仲裁器（#rail-active-state-convergence）。
 *
 * 左侧栏任意时刻只有一个激活位。插件行、动态应用行、官方会话行共享同一个标量；
 * 每行的高亮谓词不再自算，而是读这里的裁决投影。
 *
 * 裁决顺序固定且互斥（PRD 原则 3 / 架构决策 2）：
 *   1. 中间会话栏可见且存在选中的会话行 → `session`（所有插件行必为 false）；
 *   2. 否则官方右侧面板已展开且其聚焦页签能映射到左栏行 → 该 tabId；
 *   3. 其余情况（含「聚焦页签在左栏没有对应行」）→ 无激活项。
 *
 * 真源优先级：宿主（官方 DOM 属性 / `ctx.sidebarRight`）> 插件内存态。
 * 本模块只读、只算、只广播，不写 DOM（写回由行自己的 store 投影完成），
 * 因此不会与既有写入方形成 observer 回环。
 *
 * @see docs/contracts/sidebar-extra-entries.md 「Left-rail single activation slot」
 * @see ../../../../docs/contracts/workbench-split.md
 */

import { getConversationCollapsed, readConversationCollapsedFromDom } from '../conversation-collapse.js'
import { readConversationColumnWidth } from '../split-compact-layout.js'
import { notifyWorkbenchChange } from './event-bus.js'
import { WORKBENCH_TAB_TITLE_FALLBACKS } from './focus-state.js'
import { findOfficialSidebarColumn } from './geometry.js'
import { hostDocument, hostWindow, getWorkbenchSidebarRight } from './host-adapter.js'
import { isHostRightSidebarFullscreen } from './host-fullscreen.js'

/** 官方会话行的选中真源：`role` + `aria-selected` 双键（类名是 CSS-module 哈希，不可用）。 */
export const SESSION_ROW_SELECTOR = '[role="treeitem"][aria-selected="true"]'
/** 搜索结果的树行也带 `role="treeitem"` + `aria-selected`，必须排除在会话判定之外。 */
export const SEARCH_SCOPE_SELECTORS = Object.freeze([
  '[data-omnimux-search-surface]',
  '[data-slot*="search"]',
  '[class*="searchResult"]',
  '[class*="searchPanel"]',
  '[class*="searchPopup"]',
  '[class*="searchSurface"]',
])
/** 左轨收起键：只作记录，不参与裁决。 */
export const LEFT_RAIL_COLLAPSED_ATTR = 'data-omnimux-left-collapsed'
/** 参与重算的根属性（不含任何 `data-active`，避免与写入方形成回环）。 */
export const ROOT_SIGNAL_ATTRS = Object.freeze([
  'data-sidebar-right-panel',
  'data-sidebar-right-open',
  'data-sidebar-right-mode',
  'data-rightbar-fullscreen',
  'data-rightbar-collapsed',
  'data-omnimux-conversation-collapsed',
  LEFT_RAIL_COLLAPSED_ATTR,
  'data-dsh-product-stage',
])

/** 左栏有对应行的 Tab 身份表（也是裁决的唯一合法取值域）。 */
export const RAIL_TAB_IDS = Object.freeze(Object.keys(WORKBENCH_TAB_TITLE_FALLBACKS))
const RAIL_TAB_BY_TITLE = new Map(
  Object.entries(WORKBENCH_TAB_TITLE_FALLBACKS).map(([tabId, title]) => [String(title).toLowerCase(), tabId]),
)

/** @type {Readonly<{ winner: 'none', reason: 'idle' }>} */
export const IDLE_VERDICT = Object.freeze({ winner: 'none', reason: 'idle' })

/**
 * 宿主信号快照。
 * @typedef {{
 *   selectedSessionRows: number,
 *   conversationVisible: boolean,
 *   panelExpanded: boolean,
 *   activeTabKey?: string,
 *   fullscreen: boolean,
 *   leftRailCollapsed: boolean,
 *   collapsed: boolean,
 *   columnWidth: number,
 *   panelSource: 'native' | 'dom',
 * }} HostSignals
 */

/**
 * 左侧栏激活裁决。
 * @typedef {{ winner: 'session' | 'row' | 'none', tabId?: string, reason: string, detail?: string }} RailVerdict
 */

/**
 * 官方页签身份 → 左栏 tabId 的三级容错映射（架构 §2.5）。
 * ① 精确等于左栏 tabId；② 等于左栏行的中文标题；③ 都不中 → 无激活项（宁可无高亮，不可错高亮）。
 * @param {unknown} key
 * @returns {string | undefined}
 */
export function mapNativeTabKeyToRailTab(key) {
  const raw = typeof key === 'string' ? key.trim() : ''
  if (!raw) return undefined
  if (RAIL_TAB_IDS.includes(raw)) return raw
  return RAIL_TAB_BY_TITLE.get(raw.toLowerCase())
}

/**
 * 纯裁决函数：唯一真源，无副作用、无 IO。
 * @param {Partial<HostSignals>} [context]
 * @returns {RailVerdict}
 */
export function resolveSidebarActiveTarget(context = {}) {
  const signals = context && typeof context === 'object' ? context : {}
  const selectedCount = Number(signals.selectedSessionRows)
  const selected = Number.isFinite(selectedCount) && selectedCount > 0 ? selectedCount : 0

  // 规则 1 · 会话记录优先
  if (selected >= 1 && signals.conversationVisible === true) {
    return selected > 1
      ? { winner: 'session', reason: 'session-wins', detail: 'multiple-selected-rows' }
      : { winner: 'session', reason: 'session-wins' }
  }

  // 规则 2 · 官方右侧面板的聚焦页签
  if (signals.panelExpanded === true && signals.activeTabKey) {
    const tabId = mapNativeTabKeyToRailTab(signals.activeTabKey)
    if (tabId) return { winner: 'row', tabId, reason: 'focused-tab' }
    return { winner: 'none', reason: 'tab-has-no-rail-row' }
  }

  // 规则 3 · 兜底
  return IDLE_VERDICT
}

/**
 * 裁决是否为某行命中（互斥由构造保证：至多一个 tabId 命中）。
 * @param {RailVerdict | null | undefined} verdict
 * @param {unknown} tabId
 * @returns {boolean}
 */
export function isRailVerdictRow(verdict, tabId) {
  return Boolean(verdict) && verdict.winner === 'row' && verdict.tabId === tabId && Boolean(tabId)
}

function rowIsInSearchScope(row) {
  if (!row || typeof row.closest !== 'function') return false
  for (const selector of SEARCH_SCOPE_SELECTORS) {
    try {
      if (row.closest(selector)) return true
    } catch {
      // 该宿主不支持该选择器：跳过。
    }
  }
  return false
}

/**
 * 读取官方左栏列内被选中的会话行。作用域限定官方左栏列，并剔除搜索结果的树行。
 * @param {Document | undefined} [doc]
 * @returns {{ count: number, row: Element | null, scoped: boolean }}
 */
export function readSelectedSessionRows(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return { count: 0, row: null, scoped: false }
  const column = findOfficialSidebarColumn(doc)
  const scope = column || doc.documentElement
  if (!scope || typeof scope.querySelectorAll !== 'function') return { count: 0, row: null, scoped: false }
  let rows = []
  try {
    rows = Array.from(scope.querySelectorAll(SESSION_ROW_SELECTOR))
  } catch {
    rows = []
  }
  const sessions = rows.filter((row) => !rowIsInSearchScope(row))
  return { count: sessions.length, row: sessions[0] || null, scoped: Boolean(column) }
}

/** 折叠键以 DOM 为准；没有文档可用时才退回插件内存态。 */
function readConversationCollapsed(doc) {
  if (doc && doc.documentElement && typeof doc.documentElement.hasAttribute === 'function') {
    return readConversationCollapsedFromDom(doc)
  }
  return Boolean(getConversationCollapsed())
}

function readNativePanel(sidebarRight) {
  const available = Boolean(
    sidebarRight
    && typeof sidebarRight.isExpanded === 'function'
    && typeof sidebarRight.active === 'function',
  )
  if (!available) return { available: false, expanded: false, activeTabKey: undefined }
  let expanded = false
  let active = null
  try {
    expanded = Boolean(sidebarRight.isExpanded())
  } catch {
    expanded = false
  }
  try {
    active = sidebarRight.active() || null
  } catch {
    active = null
  }
  const key = active && (active.kind || active.type || active.id)
  return {
    available: true,
    expanded,
    activeTabKey: typeof key === 'string' && key ? key : undefined,
  }
}

/**
 * 官方面板在 DOM 上只声明「展开与否」，不声明聚焦页签身份
 * （页签身份的唯一公开读面是 `ctx.sidebarRight.active()`）。
 * 因此这里的 `activeTabKey` 恒为空：拿不到身份时判「无激活项」，
 * 宁可无高亮，也不猜一个 tabId 出来错高亮。
 */
function readDomPanel(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return { expanded: false, activeTabKey: undefined }
  let panel = null
  try {
    panel = doc.querySelector('[data-sidebar-right-panel]')
  } catch {
    panel = null
  }
  if (!panel || typeof panel.hasAttribute !== 'function') return { expanded: false, activeTabKey: undefined }
  return { expanded: panel.hasAttribute('data-sidebar-right-open'), activeTabKey: undefined }
}

function readColumnWidth(doc, deps) {
  if (typeof deps.readConversationColumnWidth === 'function') {
    const injected = Number(deps.readConversationColumnWidth(doc))
    return Number.isFinite(injected) && injected > 0 ? injected : 0
  }
  const measured = Number(readConversationColumnWidth(doc))
  return Number.isFinite(measured) && measured > 0 ? measured : 0
}

/**
 * 采集一次宿主信号。全部输入来自宿主真源，插件内存态只在无文档时兜底。
 *
 * @param {Document | undefined} [doc]
 * @param {{
 *   sidebarRight?: object | null,
 *   readConversationColumnWidth?: (doc?: Document) => number,
 *   isFullscreen?: (doc?: Document) => boolean,
 *   readSelectedSessionRows?: (doc?: Document) => { count: number },
 * }} [deps] 测试注入点
 * @returns {HostSignals}
 */
export function readSidebarActivationSignals(doc = hostDocument(), deps = {}) {
  const options = deps && typeof deps === 'object' ? deps : {}
  const sidebarRight = options.sidebarRight !== undefined ? options.sidebarRight : getWorkbenchSidebarRight()
  const native = readNativePanel(sidebarRight)
  const dom = readDomPanel(doc)
  const panel = native.available ? native : dom

  const fullscreen = typeof options.isFullscreen === 'function'
    ? Boolean(options.isFullscreen(doc))
    : isHostRightSidebarFullscreen(doc)
  const rows = typeof options.readSelectedSessionRows === 'function'
    ? options.readSelectedSessionRows(doc)
    : readSelectedSessionRows(doc)
  const selectedSessionRows = Number.isFinite(Number(rows?.count)) && Number(rows?.count) > 0
    ? Number(rows.count)
    : 0
  const collapsed = readConversationCollapsed(doc)
  const columnWidth = readColumnWidth(doc, options)

  return {
    selectedSessionRows,
    // 「中间栏可见」= 语义键 ∧ 几何键 ∧ 非宿主全屏（三者合取）。
    conversationVisible: !collapsed && columnWidth > 0 && !fullscreen,
    panelExpanded: panel.expanded === true,
    activeTabKey: panel.activeTabKey,
    fullscreen,
    leftRailCollapsed: Boolean(doc?.documentElement?.hasAttribute?.(LEFT_RAIL_COLLAPSED_ATTR)),
    collapsed,
    columnWidth,
    panelSource: native.available ? 'native' : 'dom',
  }
}

function verdictKey(verdict) {
  if (!verdict) return 'none'
  return `${verdict.winner}|${verdict.tabId || ''}`
}

/**
 * 激活仲裁器：持有信号读取、裁决缓存、观察者与广播。
 *
 * 单向数据流：宿主信号 → 裁决 → 行 store → DOM。仲裁器自身不写 DOM。
 */
export class SidebarActivationArbiter {
  /**
   * @param {{ document?: Document, deps?: object, notify?: () => void }} [options]
   */
  constructor(options = {}) {
    /** @type {Document | undefined} */
    this.doc = options.document || undefined
    /** @type {object} */
    this.deps = options.deps && typeof options.deps === 'object' ? { ...options.deps } : {}
    /** @type {() => void} */
    this.notify = typeof options.notify === 'function' ? options.notify : notifyWorkbenchChange
    /** @type {Set<(verdict: RailVerdict) => void>} */
    this.listeners = new Set()
    /** @type {RailVerdict} */
    this.verdict = IDLE_VERDICT
    /** @type {HostSignals | null} */
    this.signals = null
    this.dirty = true
    /** @type {number | null} */
    this.frame = null
    /** @type {MutationObserver[]} */
    this.observers = []
    /** @type {Element | null} */
    this.railRoot = null
    this.installed = false
  }

  /** 安装观察者并做一次初始裁决。幂等。 */
  install() {
    if (this.installed) return this
    this.installed = true
    this.observe()
    this.refreshNow()
    return this
  }

  /** 当前裁决（脏则先重算）。行 store 的 `getSnapshot()` 读这里。 */
  getVerdict() {
    if (this.dirty || !this.verdict) this.recompute()
    return this.verdict
  }

  /** 本次裁决所依据的信号，供诊断与测试。 */
  getSignals() {
    if (this.dirty || !this.signals) this.recompute()
    return this.signals
  }

  /** 某左栏行此刻是否高亮。 */
  isRowActive(tabId) {
    return isRailVerdictRow(this.getVerdict(), tabId)
  }

  /**
   * 同帧合并的刷新请求：观察者回调与外部同步都走这里，
   * 避免在同一渲染周期内反复读取宿主。
   */
  requestRefresh() {
    this.dirty = true
    if (this.frame != null) return false
    const raf = this.resolveRaf()
    if (!raf) return this.refreshNow()
    this.frame = raf(() => {
      this.frame = null
      this.refreshNow()
    })
    return true
  }

  /** 立即重算并广播（裁决键变化时才通知）。 */
  refreshNow() {
    const changed = this.recompute()
    if (changed) this.publish()
    return changed
  }

  /**
   * 重算裁决。
   * @returns {boolean} 裁决键是否变化
   */
  recompute() {
    const previous = verdictKey(this.verdict)
    const signals = readSidebarActivationSignals(this.doc, this.deps)
    const verdict = resolveSidebarActiveTarget(signals)
    this.signals = signals
    this.verdict = verdict
    this.dirty = false
    return previous !== verdictKey(verdict)
  }

  /**
   * @param {(verdict: RailVerdict) => void} listener
   * @returns {() => void}
   */
  subscribe(listener) {
    if (typeof listener !== 'function') return () => {}
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  publish() {
    const verdict = this.verdict
    for (const listener of this.listeners) {
      try {
        listener(verdict)
      } catch (err) {
        console.error('[omnimux-workbench] rail activation listener error:', err)
      }
    }
    // 行的高亮来自既有总线：不新增第二条订阅通道。
    if (typeof this.notify === 'function') this.notify()
  }

  resolveRaf() {
    const win = this.doc?.defaultView || hostWindow()
    if (win && typeof win.requestAnimationFrame === 'function') {
      return (fn) => win.requestAnimationFrame(fn)
    }
    if (typeof requestAnimationFrame === 'function') {
      return (fn) => requestAnimationFrame(fn)
    }
    return null
  }

  observe() {
    const doc = this.doc
    const MutationObserverCtor = doc?.defaultView?.MutationObserver || globalThis.MutationObserver
    if (!doc || typeof MutationObserverCtor !== 'function') return
    const onChange = () => {
      this.requestRefresh()
    }
    // 会话行：观察官方左栏列；列尚未挂载时退化到 documentElement，并在重算时重定向。
    const railRoot = findOfficialSidebarColumn(doc) || doc.documentElement || null
    if (railRoot && typeof railRoot.nodeType === 'number') {
      const railObserver = new MutationObserverCtor(onChange)
      railObserver.observe(railRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-selected'],
      })
      this.observers.push(railObserver)
      this.railRoot = railRoot
    }
    // 根属性：右栏模式/展开、中间栏折叠键、左轨收起。刻意不观察 `data-active`。
    if (doc.documentElement) {
      const rootObserver = new MutationObserverCtor(onChange)
      rootObserver.observe(doc.documentElement, {
        attributes: true,
        subtree: true,
        attributeFilter: [...ROOT_SIGNAL_ATTRS],
      })
      this.observers.push(rootObserver)
    }
  }

  /** 左栏列挂载晚于安装时，把会话行观察者重定向到真正的列。 */
  retargetRailObserver() {
    const doc = this.doc
    if (!doc) return
    const column = findOfficialSidebarColumn(doc)
    if (!column || column === this.railRoot) return
    const MutationObserverCtor = doc.defaultView?.MutationObserver || globalThis.MutationObserver
    if (typeof MutationObserverCtor !== 'function') return
    for (const observer of this.observers) {
      try {
        observer.disconnect()
      } catch {
        // ignore
      }
    }
    this.observers = []
    this.railRoot = null
    this.observe()
  }

  dispose() {
    if (this.frame != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.frame)
    }
    this.frame = null
    for (const observer of this.observers) {
      try {
        observer.disconnect()
      } catch {
        // ignore
      }
    }
    this.observers = []
    this.railRoot = null
    this.listeners.clear()
    this.installed = false
  }
}

/** @type {SidebarActivationArbiter | null} */
let arbiter = null

/**
 * 安装（或替换）全局仲裁器。返回卸载句柄。
 * @param {{ document?: Document, deps?: object, notify?: () => void }} [options]
 * @returns {() => void}
 */
export function installSidebarActivation(options = {}) {
  uninstallSidebarActivation()
  const instance = new SidebarActivationArbiter({
    document: options.document || hostDocument(),
    deps: options.deps,
    notify: options.notify,
  })
  if (!instance.doc) return () => {}
  arbiter = instance
  instance.install()
  return () => {
    if (arbiter !== instance) return
    instance.dispose()
    arbiter = null
  }
}

export function uninstallSidebarActivation() {
  if (!arbiter) return
  arbiter.dispose()
  arbiter = null
}

/**
 * 取现有仲裁器；未安装且已有文档时按需安装（首帧读取与浏览器外测试都走这条路径）。
 * @param {Document} [doc]
 * @returns {SidebarActivationArbiter | null}
 */
export function getSidebarActivationArbiter(doc = hostDocument()) {
  if (arbiter) return arbiter
  if (!doc) return null
  installSidebarActivation({ document: doc })
  return arbiter
}

/**
 * 当前完整裁决（诊断与测试用）。
 * @param {Document} [doc]
 * @returns {RailVerdict}
 */
export function getRailVerdict(doc) {
  const instance = getSidebarActivationArbiter(doc)
  return instance ? instance.getVerdict() : IDLE_VERDICT
}

/**
 * 某左栏行此刻是否高亮 —— 所有插件行的唯一读数口。
 * @param {unknown} tabId
 * @param {Document} [doc]
 * @returns {boolean}
 */
export function isRailRowActive(tabId, doc) {
  if (!tabId) return false
  const instance = getSidebarActivationArbiter(doc)
  return instance ? instance.isRowActive(tabId) : false
}

/**
 * 立即重算并广播一次。进入对话意图等外部手势在改完宿主状态后调用。
 * @returns {boolean} 裁决键是否变化
 */
export function requestRailActivationSync() {
  const instance = getSidebarActivationArbiter()
  if (!instance) return false
  instance.retargetRailObserver()
  return instance.refreshNow()
}

/** 测试专用：清空单例。 */
export function resetSidebarActivationForTests() {
  uninstallSidebarActivation()
}
