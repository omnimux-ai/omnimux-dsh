/**
 * Independent middle-pane collapse (#372).
 *
 * Official AppFrame cannot unmount `conversation`. "Hide chat" used to mean
 * stretching the right panel to viewport−leftRail, which re-coupled middle
 * visibility to left-rail width (collapse left → middle flashes back).
 *
 * This module owns a sticky boolean + CSS that collapses the center column
 * without unloading the slot. Left/right/bottom toggles must not clear it.
 */

export const CONVERSATION_COLLAPSED_ATTR = 'data-omnimux-conversation-collapsed'
export const CONVERSATION_COLLAPSE_STYLE_ID = 'omnimux-conversation-collapse-chrome'
export const CONVERSATION_COLLAPSE_STORAGE_PREFIX = 'omnimux-conversation-collapsed:v1:'

export const CONVERSATION_COLLAPSE_CSS = `
/* Middle conversation column — collapse layout width while projecting native composer fixed to canvas bottom */
html[${CONVERSATION_COLLAPSED_ATTR}] [class*="centerCol"],
html[${CONVERSATION_COLLAPSED_ATTR}] .dshDesktopConversationSurface{
  flex:0 0 0!important;
  width:0!important;
  min-width:0!important;
  max-width:0!important;
  overflow:visible!important;
  opacity:1!important;
  pointer-events:none!important;
}
html[${CONVERSATION_COLLAPSED_ATTR}] [data-slot="conversation"]{
  visibility:visible!important;
  pointer-events:none!important;
}
html[${CONVERSATION_COLLAPSED_ATTR}] [data-conversation-scroll],
html[${CONVERSATION_COLLAPSED_ATTR}] [data-slot="conversation.header"],
html[${CONVERSATION_COLLAPSED_ATTR}] header[class*="header"]{
  display:none!important;
}
/* Native DSH Composer floating dock at the bottom of the canvas */
html[${CONVERSATION_COLLAPSED_ATTR}] [data-composer-seat]{
  position:fixed!important;
  bottom:24px!important;
  left:var(--omnimux-sidebar-width, 280px)!important;
  right:0!important;
  width:auto!important;
  display:flex!important;
  justify-content:center!important;
  align-items:center!important;
  z-index:100!important;
  pointer-events:auto!important;
  visibility:visible!important;
  opacity:1!important;
}
html[${CONVERSATION_COLLAPSED_ATTR}][data-omnimux-left-collapsed] [data-composer-seat]{
  left:0!important;
}
html[${CONVERSATION_COLLAPSED_ATTR}] [data-composer-card]{
  width:640px!important;
  max-width:min(640px, calc(100vw - var(--omnimux-sidebar-width, 280px) - 64px))!important;
  margin:0 auto!important;
  box-shadow:0 20px 48px var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.4))!important;
  border-radius:18px!important;
  pointer-events:auto!important;
  visibility:visible!important;
  opacity:1!important;
}
/* 收起后网格第三列会吃掉全部剩余宽度，而外壳的右栏面板是固定宽度 + 右对齐
   （left = 容器宽 − 面板宽）。不补这一条，面板左侧就会留下等宽黑空（实测 670px
   的「中间空白占位」）。必须让面板左端紧贴左侧导航栏右端，不可穿透覆盖左侧栏。 */
html[${CONVERSATION_COLLAPSED_ATTR}]:not([data-omnimux-left-collapsed]) .dshDesktopRightbarSurface [class*="_panel"]:not([class*="bottom"]):not([class*="Hidden"]){
  left:var(--omnimux-sidebar-width, 280px)!important;
  right:0!important;
  width:calc(100vw - var(--omnimux-sidebar-width, 280px))!important;
  max-width:none!important;
}
html[${CONVERSATION_COLLAPSED_ATTR}][data-omnimux-left-collapsed] .dshDesktopRightbarSurface [class*="_panel"]:not([class*="bottom"]):not([class*="Hidden"]){
  left:0!important;
  right:0!important;
  width:100vw!important;
  max-width:none!important;
}
`

function hostWindow() {
  return typeof globalThis.window !== 'undefined' ? globalThis.window : undefined
}

function hostDocument() {
  return typeof globalThis.document !== 'undefined' ? globalThis.document : hostWindow()?.document
}

function currentSessionId() {
  try {
    const snap = hostWindow()?.__omnimuxWorkbench?.getSnapshot?.()
    if (snap?.sessionId) return String(snap.sessionId)
  } catch { /* ignore */ }
  return '__none__'
}

/** @type {boolean | null} */
let memoryCollapsed = null

export function ensureConversationCollapseChrome(doc = hostDocument()) {
  if (!doc?.head) return null
  let style = doc.getElementById(CONVERSATION_COLLAPSE_STYLE_ID)
  if (!style) {
    style = doc.createElement('style')
    style.id = CONVERSATION_COLLAPSE_STYLE_ID
    doc.head.append(style)
  }
  if (style.textContent !== CONVERSATION_COLLAPSE_CSS) style.textContent = CONVERSATION_COLLAPSE_CSS
  return style
}

export function applyConversationCollapsedAttr(collapsed, doc = hostDocument()) {
  const root = doc?.documentElement
  if (!root || typeof root.setAttribute !== 'function' || typeof root.removeAttribute !== 'function') return
  ensureConversationCollapseChrome(doc)
  if (collapsed) root.setAttribute(CONVERSATION_COLLAPSED_ATTR, '')
  else root.removeAttribute(CONVERSATION_COLLAPSED_ATTR)
}

export function readConversationCollapsedFromDom(doc = hostDocument()) {
  return Boolean(doc?.documentElement?.hasAttribute?.(CONVERSATION_COLLAPSED_ATTR))
}

export function loadConversationCollapsed(sessionId = currentSessionId()) {
  if (memoryCollapsed != null && sessionId === currentSessionId()) return memoryCollapsed
  try {
    const raw = hostWindow()?.localStorage?.getItem?.(CONVERSATION_COLLAPSE_STORAGE_PREFIX + sessionId)
    if (raw === '1') return true
    if (raw === '0') return false
  } catch { /* ignore */ }
  return false
}

export function persistConversationCollapsed(collapsed, sessionId = currentSessionId()) {
  memoryCollapsed = Boolean(collapsed)
  try {
    hostWindow()?.localStorage?.setItem?.(
      CONVERSATION_COLLAPSE_STORAGE_PREFIX + sessionId,
      collapsed ? '1' : '0',
    )
  } catch { /* ignore */ }
}

/**
 * @param {boolean} collapsed
 * @param {{ sessionId?: string, persist?: boolean, doc?: Document }} [opts]
 */
export function setConversationCollapsed(collapsed, opts = {}) {
  const next = Boolean(collapsed)
  const sessionId = opts.sessionId || currentSessionId()
  const doc = opts.doc || hostDocument()
  applyConversationCollapsedAttr(next, doc)
  if (opts.persist !== false) persistConversationCollapsed(next, sessionId)
  memoryCollapsed = next
  return next
}

export function getConversationCollapsed(opts = {}) {
  if (memoryCollapsed != null) return memoryCollapsed
  const doc = opts.doc || hostDocument()
  if (readConversationCollapsedFromDom(doc)) return true
  return loadConversationCollapsed(opts.sessionId || currentSessionId())
}

/** Hydrate DOM from storage (call on chrome install / session attach). */
export function hydrateConversationCollapsed(sessionId = currentSessionId(), doc = hostDocument()) {
  const collapsed = loadConversationCollapsed(sessionId)
  applyConversationCollapsedAttr(collapsed, doc)
  memoryCollapsed = collapsed
  return collapsed
}

export function resetConversationCollapseForTests() {
  memoryCollapsed = null
  const doc = hostDocument()
  const root = doc?.documentElement
  if (root && typeof root.removeAttribute === 'function') {
    root.removeAttribute(CONVERSATION_COLLAPSED_ATTR)
  }
  const style = doc?.getElementById?.(CONVERSATION_COLLAPSE_STYLE_ID)
  if (style && typeof style.remove === 'function') style.remove()
}
