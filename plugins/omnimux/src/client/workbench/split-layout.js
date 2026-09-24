/**
 * Workbench Split Layout Management.
 * Manages split pane clamping, style injection, store reduce wrapping,
 * split pointer tracking, default width application, and focus mode state.
 */

import {
  CONVERSATION_COLLAPSED_ATTR,
  setConversationCollapsed,
} from '../conversation-collapse.js'
import {
  activeTabId,
  getAttachedStore,
  hostDocument,
  hostWindow,
  liveSnapshot,
  resolveWorkbenchLayoutHandle,
} from './host-adapter.js'
import {
  WORKBENCH_FOCUS,
  focusRecordForTab,
  persistSessionFocus,
} from './focus-state.js'
import {
  WORKBENCH_PANEL_ATTR,
  WORKBENCH_SPLIT_MAX_CSS_VAR,
  clampSplitPanelWidth,
  findWorkbenchPanelElement,
  isWorkbenchPanelDragging,
  nearPx,
  splitConversationMinApplies,
  workbenchDefaultWidthPx,
  workbenchGuiWidthPx,
  workbenchSplitMaxPanelPx,
} from './geometry.js'
import { notifyWorkbenchChange } from './event-bus.js'
import { isHostRightSidebarFullscreen } from './host-fullscreen.js'
import {
  getShellSplitDragObservationCount,
  isShellSplitDragging,
  notePluginPanelWidthWrite,
  noteShellSplitDragObserved,
  settleConversationRatioFromAuthoredGeometry,
  readFrameWidthPx,
  readFrame,
} from '../sidebar-toggle-topbar.js'

export const WORKBENCH_SPLIT_MIN_STYLE_ID = 'omnimux-split-conversation-min-chrome'

export const WORKBENCH_SPLIT_MIN_CSS = `
html:not([${CONVERSATION_COLLAPSED_ATTR}]) [${WORKBENCH_PANEL_ATTR}]{
  max-width:min(100vw,var(${WORKBENCH_SPLIT_MAX_CSS_VAR},100vw))!important;
}
`

const wrappedStores = new WeakSet()
const appliedWidthSessions = new Set()
let splitMinDoc = null
let splitMinUnsub = null
let splitResizeHandler = null

/**
 * Stamp WORKBENCH_PANEL_ATTR on the resolved panel (idempotent) so
 * the split-min CSS max-width binds to the real right panel permanently.
 * @param {Document} [doc]
 * @returns {Element | null} the resolved panel
 */
export function tagWorkbenchPanel(doc = hostDocument()) {
  // 清理可能被误标的外层 AppFrame 节点，保证桌面外框永远不被 max-width 误截断
  try {
    doc?.querySelector?.('.dshDesktopFrame[' + WORKBENCH_PANEL_ATTR + '], [class*="frame"][' + WORKBENCH_PANEL_ATTR + ']')?.removeAttribute?.(WORKBENCH_PANEL_ATTR)
  } catch {}
  const panel = findWorkbenchPanelElement(doc)
  if (panel && typeof panel.setAttribute === 'function' && !panel.hasAttribute?.(WORKBENCH_PANEL_ATTR)) {
    if (!panel.classList?.contains('dshDesktopFrame') && (typeof panel.matches !== 'function' || !panel.matches('.dshDesktopFrame, [class*="frame"]'))) {
      try {
        panel.setAttribute(WORKBENCH_PANEL_ATTR, '')
      } catch {
        // ignore
      }
    }
  }
  return panel
}

/**
 * Ensure split-min CSS stylesheet exists in document head.
 * @param {Document} [doc]
 * @returns {HTMLStyleElement | null}
 */
export function ensureSplitMinChrome(doc = hostDocument()) {
  if (!doc?.head) return null
  let style = typeof doc.getElementById === 'function' ? doc.getElementById(WORKBENCH_SPLIT_MIN_STYLE_ID) : null
  if (!style) {
    style = doc.createElement('style')
    style.id = WORKBENCH_SPLIT_MIN_STYLE_ID
    doc.head.append(style)
  }
  if (style.textContent !== WORKBENCH_SPLIT_MIN_CSS) {
    style.textContent = WORKBENCH_SPLIT_MIN_CSS
  }
  return style
}

/**
 * Sync the split maximum CSS variable on documentElement.
 * @param {object} [state]
 * @param {object} [env]
 * @returns {boolean}
 */
export function syncSplitMaxCssVar(state = liveSnapshot()?.state, env = {}) {
  const root = hostDocument()?.documentElement
  if (!root?.style?.setProperty) return false
  ensureSplitMinChrome()
  if (!splitConversationMinApplies(state, env)) {
    try {
      root.style.removeProperty(WORKBENCH_SPLIT_MAX_CSS_VAR)
    } catch {
      // ignore
    }
    return false
  }
  tagWorkbenchPanel(hostDocument())
  root.style.setProperty(WORKBENCH_SPLIT_MAX_CSS_VAR, `${workbenchSplitMaxPanelPx(state, env)}px`)
  return true
}

function clampStyleWidth(style, prop, max) {
  if (!style) return
  let raw = ''
  if (prop && typeof style.getPropertyValue === 'function') {
    raw = style.getPropertyValue(prop)
  } else {
    raw = style.width
  }
  const current = Number.parseFloat(raw)
  if (Number.isFinite(current) && current > max) {
    if (prop && typeof style.setProperty === 'function') {
      style.setProperty(prop, `${max}px`)
    } else {
      style.width = `${max}px`
    }
  }
}

/**
 * Clamp live DOM split widths to maximum ceiling.
 * @param {object} [state]
 * @param {object} [env]
 */
export function clampLiveSplitDom(state = liveSnapshot()?.state, env = {}) {
  syncSplitMaxCssVar(state, env)
  if (!splitConversationMinApplies(state, env)) return
  const doc = hostDocument()
  const panel = findWorkbenchPanelElement(doc)
  if (isWorkbenchPanelDragging(doc, panel)) return
  const max = workbenchSplitMaxPanelPx(state, env)
  clampStyleWidth(doc?.documentElement?.style, '--dsh-sidebar-width', max)
  clampStyleWidth(panel?.style, '', max)
}

let lastReconciledHandle = null
let lastReconciledTarget = null
let lastReconciledViewport = null

export function resetSplitReconciliationForTests() {
  lastReconciledHandle = null
  lastReconciledTarget = null
  lastReconciledViewport = null
}

/**
 * 把「可见舞台 − 比例中栏宽」写回外壳消费的面板宽通道（方案 D7-S1′）。
 *
 * 外壳的 `panels.rightbar` 同时决定三件事：① authored 第三轨；② 拖拽起点 `rightbarBase`
 * （`setRightbar(base − dx)` 是 delta 模型）；③ 右分隔把手位置 `left = viewport − rightbar`。
 * 因此只要 `panels.rightbar ≡ 可见舞台 − 中栏`，把手就贴在真实列边界上，缩放后立刻拖拽也
 * 不会出现首帧跳变。写通道复用 `tab-viewport-reconciler` 已持有的 `layout.setRightbar()`。
 *
 * 三条硬规则：
 * - **拖拽期绝不写**：那时外壳 authored 几何是权威，代写面板宽会与指针抢同一根轨道；
 * - **只在三栏分栏态写**：中栏收起 / 右栏收起 / gui 单栏态不比例化（D6）；
 * - **口径与外壳一致**：外壳 `viewport` 取 frame 实测宽，这里用 {@link readFrameWidthPx}
 *   同一个口径，否则外壳的夹紧结果与把手位置会各算一套。
 * @param {object} [state] better-sidebar 快照状态
 * @param {{ doc?: Document, sessionId?: string, viewportWidth?: number, chatRatio?: number }} [env]
 * @returns {'written' | 'consistent' | 'skipped'} 写入 / 已一致 / 不适用
 */
export function reconcileRightbarFromRatio(state, env = {}) {
  const resolvedState = state === undefined ? readAttachedStateSafely() : state
  const doc = env.doc || hostDocument()
  if (!doc) return 'skipped'
  // 拖拽期判据必须与外壳同源（INV-16）。`isWorkbenchPanelDragging` 只看**已解析的工作台面板**
  // 上的 `[data-dragging]`，而外壳右分隔线拖拽把标记打在 frame / 手柄上——只用它会漏判，
  // 于是在指针拖拽进行中写 `panels.rightbar`，与指针抢同一根轨道（H-2）。
  // 两者取并集：任一为真即不写（保守方向是「不写」，代价只是下一帧再协调）。
  if (isWorkbenchPanelDragging(doc) || isShellSplitDragging(doc)) return 'skipped'
  if (!splitConversationMinApplies(resolvedState, env)) return 'skipped'
  const handle = resolveWorkbenchLayoutHandle(doc)
  if (!handle || typeof handle.setRightbar !== 'function') return 'skipped'
  const snapshot = handle.getSnapshot?.()
  const frame = readFrame(doc) || doc.querySelector?.('.dshDesktopFrame, [class*="frame"]')
  if (!frame) return 'skipped'
  // 三栏分栏状态真实判据（H-1）：frame 包含 rightbar 面板且未收起，非全屏
  if (frame.getAttribute?.('data-rightbar-collapsed') === 'true'
    || doc.querySelector?.('.dshDesktopFrame[data-rightbar-collapsed="true"], [class*="frame"][data-rightbar-collapsed="true"]')) {
    return 'skipped'
  }
  if (isHostRightSidebarFullscreen(doc)
    || frame.getAttribute?.('data-rightbar-fullscreen') === 'true'
    || snapshot?.rightbarFullscreen === true) {
    return 'skipped'
  }
  if (snapshot?.rightbarShown === false) {
    return 'skipped'
  }
  const frameViewport = readFrameWidthPx(doc)
  if (!(frameViewport > 0)) return 'skipped'
  const target = workbenchDefaultWidthPx(resolvedState, { ...env, doc, viewportWidth: frameViewport })
  if (typeof snapshot?.rightbar === 'number' && Math.abs(snapshot.rightbar - target) < 1) return 'consistent'
  if (lastReconciledHandle === handle && lastReconciledTarget === target && lastReconciledViewport === frameViewport) {
    return 'consistent'
  }
  handle.setRightbar(target, frameViewport)
  lastReconciledHandle = handle
  lastReconciledTarget = target
  lastReconciledViewport = frameViewport
  // 登记「本插件写了面板宽」：写出去的数字下一帧会被读回来，不登记就会被老用户迁移探针
  // 当成「用户亲手定过的版式」反推（H-1 的自证读数）。
  notePluginPanelWidthWrite()
  return 'written'
}

/** 宿主快照可能尚未就绪或自身抛错：协调写必须降级为「不适用」，不得冒泡。 */
function readAttachedStateSafely() {
  try {
    return liveSnapshot()?.state
  } catch {
    return undefined
  }
}

function resolveStoreSessionId(store) {
  if (typeof store?.getSnapshot === 'function') {
    return store.getSnapshot()?.sessionId
  }
  return undefined
}

function clampReducedState(current, next, store) {
  if (!next || next === current) return next
  if (typeof next.width !== 'number' || !Number.isFinite(next.width)) return next
  const sessionId = resolveStoreSessionId(store)
  const clamped = clampSplitPanelWidth(next.width, next, { sessionId })
  if (clamped === next.width) return next
  return { ...next, width: clamped }
}

/**
 * Wrap store.reduce to intercept and clamp any oversized panel width.
 * @param {object} store
 * @returns {object} wrapped store
 */
export function wrapStoreReduce(store) {
  if (!store || typeof store.reduce !== 'function' || wrappedStores.has(store)) return store
  const original = store.reduce.bind(store)
  store.reduce = (reducer) => original((current) => {
    const next = typeof reducer === 'function' ? reducer(current) : current
    return clampReducedState(current, next, store)
  })
  wrappedStores.add(store)
  return store
}

function isStateWidthValid(state) {
  if (!state || state.panelOpen === false) return false
  return typeof state.width === 'number' && Number.isFinite(state.width)
}

function saveSessionFocusWidth(sessionId, tabId, width) {
  if (sessionId && tabId) {
    persistSessionFocus(sessionId, tabId, { splitWidth: width })
  }
}

/**
 * Persist clamped split width into session focus record.
 * @param {{ state?: object, record?: object, sessionId?: string, tabId?: string, env?: object }} opts
 */
export function persistClampedSplitWidth(opts = {}) {
  const record = opts.record
  if (!record || record.mode === WORKBENCH_FOCUS.gui) return
  const state = opts.state
  if (!isStateWidthValid(state)) return

  const env = opts.env || {}
  const width = clampSplitPanelWidth(state.width, state, env)
  if (nearPx(width, workbenchGuiWidthPx(state, env))) return

  record.splitWidth = width
  saveSessionFocusWidth(opts.sessionId, opts.tabId, width)
}

function scheduleNextFrame(callback) {
  const win = hostWindow()
  if (win?.requestAnimationFrame) {
    win.requestAnimationFrame(callback)
  } else {
    callback()
  }
}

/**
 * 本次指针释放是否要结算比例。
 *
 * `document` 级的 `pointerup` 会在**任意**点击 / 任意拖拽结束时触发；无状态守卫地结算
 * 会反推一个与用户版式无关的比例并**落盘**，覆盖用户既有比例（H-5）。因此只有
 * 「本次释放确实结束了一次外壳分隔线拖拽」才置位，且释放即消费、不留给下一次指针事件。
 */
let pendingShellSplitSettle = false

/** 最近一次观察到外壳拖拽的时间戳，用于防止待结算状态泄漏至远期无关点击（M-7）。 */
let lastShellSplitDragObservedTime = 0

/**
 * 已被结算消费掉的拖拽观察计数。
 *
 * 拖拽观察有两条来源：本模块的指针采样，以及顶栏模块的几何同步（每帧命中拖拽标记）。
 * 只有两条都算，才不会在「外壳先摘标记、后派发 pointerup」的帧序下漏掉结算。
 * 消费发生在**真正结算成功**之后，而不是在 pointerup 上：一次发生在拖拽中途的指针释放
 * 不该把待结算状态吃掉，否则拖拽结束那一次就不会再结算。
 */
let consumedShellSplitDragObservations = 0

/**
 * 观察外壳分隔线拖拽标记：命中则登记「用户亲手拖过」（迁移判据）并置本次待结算。
 * @returns {boolean} 当前是否处于外壳拖拽态
 */
function noteShellSplitDragFromDom() {
  if (!isShellSplitDragging(hostDocument())) return false
  pendingShellSplitSettle = true
  lastShellSplitDragObservedTime = Date.now()
  noteShellSplitDragObserved()
  return true
}

/** 是否还有未被消费的拖拽观察（= 上一次真实拖拽还没结算）。 */
function hasUnconsumedShellSplitDrag() {
  if (getShellSplitDragObservationCount() <= consumedShellSplitDragObservations) {
    return false
  }
  // 超过 1000ms 未检测到拖拽，视为已终止的陈旧拖拽，避免后续无关点击触发误结算（M-7）
  if (lastShellSplitDragObservedTime > 0 && Date.now() - lastShellSplitDragObservedTime > 1000) {
    consumedShellSplitDragObservations = getShellSplitDragObservationCount()
    return false
  }
  return true
}

function onSplitPointerSample() {
  noteShellSplitDragFromDom()
  try {
    tagWorkbenchPanel(hostDocument())
  } catch {
    // ignore
  }
  scheduleNextFrame(clampLiveSplitDom)
}

function clampStoreReducer(current, sessionId) {
  if (typeof current?.width !== 'number') return current
  const next = clampSplitPanelWidth(current.width, current, { sessionId })
  if (next === current.width) return current
  return { ...current, width: next }
}

export function clampStoreOnPointerUp() {
  const store = getAttachedStore()
  const snapshot = liveSnapshot(store)
  const state = snapshot?.state
  if (!store || typeof store.reduce !== 'function' || !splitConversationMinApplies(state)) return
  const max = workbenchSplitMaxPanelPx(state)
  if (typeof state?.width !== 'number' || state.width <= max) return
  store.reduce((current) => clampStoreReducer(current, snapshot?.sessionId))
}

function onMovePointerSample() {
  onSplitPointerSample()
}

function onUpPointerSample() {
  // 判据必须在重置之前取：本处理器是 document 捕获阶段，早于外壳自己的 pointerup 处理器，
  // 此刻 `[data-dragging]` 可能仍在（真实分隔线拖拽）也可能从未出现（任意点击）。
  const endsShellSplitDrag = noteShellSplitDragFromDom()
    || pendingShellSplitSettle
    || hasUnconsumedShellSplitDrag()
  onSplitPointerSample()
  // 释放即消费：`onSplitPointerSample` 可能因标记尚未清除而再次置位，这里统一清掉，
  // 绝不把「本次拖拽」的待结算留给下一次任意指针释放（H-5）。
  pendingShellSplitSettle = false
  scheduleNextFrame(clampStoreOnPointerUp)
  if (endsShellSplitDrag) scheduleNextFrame(settleConversationRatioAfterDrag)
}

/**
 * 拖拽结算（方案 §4.4 / D3 的 `settling` 态）。
 *
 * 松手后必须**立刻**把终态宽度反推成比例落盘（跳过 250ms 防抖），否则用户拖到某个比例
 * 就切会话 / 关窗口时，最后一次拖拽会被防抖窗口吃掉（AC-7）。随后按稳态重算一次，
 * 由于稳态值就是 `round(舞台 × 该比例)`，重算对可见宽度是恒等变换，不会跳变。
 *
 * 两个状态守卫（H-5）：拖拽仍在进行时等真正结束；单栏态（中栏收起 / 右栏收起 / gui）
 * 不结算——那时中栏列宽不代表可见版式，落盘会覆盖用户既有比例。
 * @returns {number | null} 落盘的比例
 */
export function settleConversationRatioAfterDrag() {
  const doc = hostDocument()
  if (!doc) return null
  if (isShellSplitDragging(doc)) return null
  // 拖拽确已结束 → 观察计数一律消费（即使随后被单栏态守卫拒掉）：否则一次在单栏态下被拒的
  // 拖拽会把待结算状态留到下一次任意指针释放，在恢复三栏态后反推一个陈旧比例（H-5）。
  consumedShellSplitDragObservations = getShellSplitDragObservationCount()
  if (!splitConversationMinApplies(liveSnapshot()?.state)) return null
  const ratio = settleConversationRatioFromAuthoredGeometry(doc)
  if (ratio === null) return null
  reconcileRightbarFromRatio()
  return ratio
}

function addPointerListeners(doc) {
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('pointermove', onMovePointerSample, true)
    doc.addEventListener('pointerup', onUpPointerSample, true)
    doc.addEventListener('pointercancel', onUpPointerSample, true)
  }
}

function removePointerListeners(doc) {
  if (doc && typeof doc.removeEventListener === 'function') {
    doc.removeEventListener('pointermove', onMovePointerSample, true)
    doc.removeEventListener('pointerup', onUpPointerSample, true)
    doc.removeEventListener('pointercancel', onUpPointerSample, true)
  }
}

export function setSplitResizeHandler(handler) {
  splitResizeHandler = handler
}

/**
 * Install pointer listeners to monitor and clamp split divider dragging.
 * @param {Document} [doc]
 * @returns {() => void} uninstaller
 */
export function installSplitConversationMin(doc = hostDocument()) {
  if (!doc) return () => {}
  if (splitMinDoc === doc && splitMinUnsub) return splitMinUnsub
  uninstallSplitConversationMin()
  splitMinDoc = doc
  // 新订阅从「没有待结算拖拽」开始：历史观察计数一律视为已消费，否则安装前的任何一次
  // 拖拽观察都会让安装后的第一次任意指针释放触发结算（H-5）。
  pendingShellSplitSettle = false
  consumedShellSplitDragObservations = getShellSplitDragObservationCount()
  lastShellSplitDragObservedTime = 0
  ensureSplitMinChrome(doc)
  syncSplitMaxCssVar()
  tagWorkbenchPanel(doc)

  addPointerListeners(doc)

  const win = hostWindow()
  const onResize = () => {
    if (typeof splitResizeHandler === 'function') {
      splitResizeHandler()
    }
  }
  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('resize', onResize)
  }

  splitMinUnsub = () => {
    removePointerListeners(doc)
    if (win && typeof win.removeEventListener === 'function') {
      win.removeEventListener('resize', onResize)
    }
    if (splitMinDoc === doc) {
      splitMinDoc = null
      splitMinUnsub = null
    }
  }
  return splitMinUnsub
}

export function uninstallSplitConversationMin() {
  if (typeof splitMinUnsub === 'function') {
    splitMinUnsub()
  }
  splitMinUnsub = null
  splitMinDoc = null
  resetSplitReconciliationForTests()
}

function computeFocusWidth(current, options) {
  const mode = options.mode
  const record = options.record
  const env = options.env
  const sessionId = options.sessionId

  if (mode === WORKBENCH_FOCUS.gui) {
    return workbenchGuiWidthPx(current, env)
  }
  let width = typeof record?.splitWidth === 'number'
    ? record.splitWidth
    : workbenchDefaultWidthPx(current, env)
  if (mode === WORKBENCH_FOCUS.split) {
    width = clampSplitPanelWidth(width, { ...current, panelOpen: true }, { ...env, sessionId })
  }
  return width
}

function resolveNextFocusState(current, options) {
  if (options.mode === WORKBENCH_FOCUS.chat) {
    if (current?.panelOpen === false) return current
    return { ...current, panelOpen: false }
  }
  const nextWidth = computeFocusWidth(current, options)
  const isIdentical = current?.panelOpen === true
    && typeof current.width === 'number'
    && Math.abs(current.width - nextWidth) < 1
  if (isIdentical) return current
  return {
    ...current,
    panelOpen: true,
    width: nextWidth,
  }
}

function syncConversationCollapsedForFocus(mode, sessionId) {
  if (mode === WORKBENCH_FOCUS.gui) {
    setConversationCollapsed(true, { sessionId })
  } else {
    setConversationCollapsed(false, { sessionId })
  }
}

function updateFocusRecord(mode, sessionId, effectiveTabId, persistUserIntent) {
  const record = focusRecordForTab(sessionId, effectiveTabId)
  if (mode !== WORKBENCH_FOCUS.chat && sessionId && effectiveTabId) {
    if (persistUserIntent) {
      record.mode = mode
      record.explicit = true
      persistSessionFocus(sessionId, effectiveTabId, { mode, explicit: true })
    } else if (record.explicit === true) {
      persistSessionFocus(sessionId, effectiveTabId, { mode: record.mode, explicit: true })
    } else {
      record.mode = mode
      persistSessionFocus(sessionId, effectiveTabId, { mode, explicit: false })
    }
  }
  return record
}

/**
 * Switch focus by writing better-sidebar geometry. Never unmounts conversation.
 * @param {'split' | 'gui' | 'chat'} mode
 * @param {object} [store]
 * @param {object} [env]
 * @param {string} [targetTabId]
 * @param {{ persistUserIntent?: boolean }} [opts] 默认打开 / 智能体打开不得写成用户选择。
 * @returns {boolean}
 */
export function setWorkbenchFocus(mode, store = getAttachedStore(), env = {}, targetTabId = undefined, opts = {}) {
  if (mode !== WORKBENCH_FOCUS.split && mode !== WORKBENCH_FOCUS.gui && mode !== WORKBENCH_FOCUS.chat) {
    return false
  }

  const persistUserIntent = opts.persistUserIntent !== false
  const snapshot = liveSnapshot(store)
  const state = snapshot?.state
  const sessionId = snapshot?.sessionId
  const prevTabId = activeTabId(state)
  const prevRecord = focusRecordForTab(sessionId, prevTabId)
  persistClampedSplitWidth({ state, record: prevRecord, sessionId, tabId: prevTabId, env })

  const effectiveTabId = targetTabId || prevTabId
  const record = updateFocusRecord(mode, sessionId, effectiveTabId, persistUserIntent)
  syncConversationCollapsedForFocus(mode, sessionId)

  if (!store || typeof store.reduce !== 'function') {
    notifyWorkbenchChange()
    return false
  }
  const options = { mode, record, env, sessionId }
  store.reduce((current) => resolveNextFocusState(current, options))
  notifyWorkbenchChange()
  syncSplitMaxCssVar(liveSnapshot(store)?.state, env)
  return true
}

export function resetWorkbenchWidthMemory() {
  appliedWidthSessions.clear()
}

function computeNextDefaultWidth(state, env) {
  const splitMax = workbenchSplitMaxPanelPx(state, env)
  let nextWidth = workbenchDefaultWidthPx(state, env)
  if (nextWidth > splitMax) {
    nextWidth = splitMax
  }
  return nextWidth
}

function resolveSnapshot(service, store) {
  if (typeof store?.getSnapshot === 'function') {
    return store.getSnapshot()
  }
  if (typeof service?.getSnapshot === 'function') {
    return service.getSnapshot()
  }
  return null
}

function shouldSkipDefaultWidth(sessionKey, sessionId, force) {
  if (!sessionId) return true
  if (!force && appliedWidthSessions.has(sessionKey)) return true
  return false
}

function resolveSplitRecord(sessionId, state, targetTabId, force) {
  const tabId = targetTabId || activeTabId(state)
  const record = focusRecordForTab(sessionId, tabId)
  if (!force && record.mode !== WORKBENCH_FOCUS.split) {
    return null
  }
  return record
}

function updateStoreWithDefaultWidth(store, nextWidth) {
  store.reduce((currentState) => {
    if (typeof currentState?.width === 'number' && Math.abs(currentState.width - nextWidth) < 1) {
      return currentState
    }
    let panelOpen = currentState?.panelOpen
    if (panelOpen === false) {
      panelOpen = true
    }
    return { ...currentState, width: nextWidth, panelOpen }
  })
}

function canReduceSnapshot(snapshot, store, sessionId) {
  if (!snapshot || snapshot.sessionId !== sessionId) return false
  return typeof store?.reduce === 'function'
}

function isWidthMatching(currentWidth, targetWidth) {
  if (typeof currentWidth !== 'number') return false
  return Math.abs(currentWidth - targetWidth) < 1
}

function commitDefaultWidth(store, sessionKey, nextWidth) {
  updateStoreWithDefaultWidth(store, nextWidth)
  appliedWidthSessions.add(sessionKey)
  notifyWorkbenchChange()
  return nextWidth
}

/**
 * Write the default GUI width through the tab store.
 * @returns {number | null | undefined} number = applied; null = skip; undefined = wait
 */
export function applyDefaultWidth(service, sessionId, store = getAttachedStore(), env = {}, force = false, targetTabId = undefined) {
  const tabSuffix = targetTabId || ''
  const sessionKey = `${sessionId}:${tabSuffix}`
  if (shouldSkipDefaultWidth(sessionKey, sessionId, force)) return null

  const snapshot = resolveSnapshot(service, store)
  const state = snapshot?.state
  if (!state) return undefined

  const record = resolveSplitRecord(sessionId, state, targetTabId, force)
  if (!record) return null

  if (!canReduceSnapshot(snapshot, store, sessionId)) return undefined

  const nextWidth = computeNextDefaultWidth(state, env)
  if (isWidthMatching(state.width, nextWidth)) {
    appliedWidthSessions.add(sessionKey)
    return nextWidth
  }

  return commitDefaultWidth(store, sessionKey, nextWidth)
}
