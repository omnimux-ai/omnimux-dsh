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
  const panel = findWorkbenchPanelElement(doc)
  if (panel && typeof panel.setAttribute === 'function' && !panel.hasAttribute?.(WORKBENCH_PANEL_ATTR)) {
    try {
      panel.setAttribute(WORKBENCH_PANEL_ATTR, '')
    } catch {
      // ignore
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

function onSplitPointerSample() {
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
  onSplitPointerSample()
  scheduleNextFrame(clampStoreOnPointerUp)
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

function updateFocusRecord(mode, sessionId, effectiveTabId) {
  const record = focusRecordForTab(sessionId, effectiveTabId)
  if (mode !== WORKBENCH_FOCUS.chat && sessionId && effectiveTabId) {
    record.mode = mode
    persistSessionFocus(sessionId, effectiveTabId, { mode })
  }
  return record
}

/**
 * Switch focus by writing better-sidebar geometry. Never unmounts conversation.
 * @param {'split' | 'gui' | 'chat'} mode
 * @param {object} [store]
 * @param {object} [env]
 * @param {string} [targetTabId]
 * @returns {boolean}
 */
export function setWorkbenchFocus(mode, store = getAttachedStore(), env = {}, targetTabId = undefined) {
  if (mode !== WORKBENCH_FOCUS.split && mode !== WORKBENCH_FOCUS.gui && mode !== WORKBENCH_FOCUS.chat) {
    return false
  }

  const snapshot = liveSnapshot(store)
  const state = snapshot?.state
  const sessionId = snapshot?.sessionId
  const prevTabId = activeTabId(state)
  const prevRecord = focusRecordForTab(sessionId, prevTabId)
  persistClampedSplitWidth({ state, record: prevRecord, sessionId, tabId: prevTabId, env })

  const effectiveTabId = targetTabId || prevTabId
  const record = updateFocusRecord(mode, sessionId, effectiveTabId)
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
