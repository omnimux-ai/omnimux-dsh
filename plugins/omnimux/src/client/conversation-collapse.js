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

/**
 * 原生输入框投射规则的前缀：图像画布身份 + 右侧栏全屏铺满。
 *
 * 会话列是否收起只表达布局意图，不能当作「当前是哪个画布」的判据：任一插件页
 * 全屏都会收起会话列，若以它为键，技能/专家、工作流画布等页面底部都会浮出输入框，
 * 而图像画布自身反而没有专属条件（Issue #1821）。身份标识由媒体查看器投影
 * （见 media-viewer/image-canvas-stage.js）。
 *
 * 不排除左栏收起态：真机实测（1708×974）左栏收起时全屏面板铺满 100vw、座席
 * 左基准由既有左栏规则归零，投射后卡片仍居中于画布。
 */
export const IMAGE_CANVAS_IDENTITY_SELECTOR = 'html:has([data-omnimux-image-canvas][data-visible="true"])'
export const IMAGE_CANVAS_PROJECTION_SELECTOR = `${IMAGE_CANVAS_IDENTITY_SELECTOR} .dshDesktopFrame[data-rightbar-fullscreen="true"]`

export const CONVERSATION_COLLAPSE_CSS = `
/* Middle conversation column — collapse layout width while projecting native composer fixed to canvas bottom.
   Excludes rightbar collapsed state so conversation remains fully visible when auxiliary panel is closed. */
html[${CONVERSATION_COLLAPSED_ATTR}] .dshDesktopFrame:not([data-rightbar-collapsed="true"]) [class*="centerCol"],
html[${CONVERSATION_COLLAPSED_ATTR}] .dshDesktopFrame:not([data-rightbar-collapsed="true"]) .dshDesktopConversationSurface,
html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])) [class*="centerCol"],
html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])) .dshDesktopConversationSurface{
  flex:0 0 0!important;
  width:0!important;
  min-width:0!important;
  max-width:0!important;
  overflow:visible!important;
  opacity:1!important;
  pointer-events:none!important;
}
html[${CONVERSATION_COLLAPSED_ATTR}] .dshDesktopFrame:not([data-rightbar-collapsed="true"]) .dshDesktopConversationSurface,
html[${CONVERSATION_COLLAPSED_ATTR}] .dshDesktopFrame:not([data-rightbar-collapsed="true"]) .dshDesktopConversationSurface > *,
html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])) .dshDesktopConversationSurface,
html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])) .dshDesktopConversationSurface > *,
html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])) [data-slot="conversation"],
html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])) [data-slot="conversation"] > *,
html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])) [data-phase="active"],
html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])) [data-conversation-scroll]{
  overflow:visible!important;
  pointer-events:none!important;
  visibility:visible!important;
  opacity:1!important;
}
/* Hide only the message transcript stream and header bar while rightbar is open, keep composerSeat mounted and visible */
html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])) [data-slot="conversation.session"],
html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])) [data-slot="conversation.session.header"],
html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])) [data-slot="conversation.header"],
html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])) [data-slot="conversation.view"],
html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])) header[class*="header"],
html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])) [class*="widthHandle"]{
  display:none!important;
}
/* Native DSH composer floating dock — 仅图像画布 + 右侧栏全屏时投射到画布底端（紧凑靠底停靠） */
${IMAGE_CANVAS_PROJECTION_SELECTOR} [data-composer-seat]{
  position:fixed!important;
  bottom:10px!important;
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
  background:transparent!important;
}
/* 左栏收起时全屏面板铺满 100vw（sidebar-toggle-topbar 的 5.2 规则），座席左基准归零。
   收起态由插件镜像到 html[data-omnimux-left-collapsed]；这里必须显式写完整选择器，
   不能把带 html 前缀的投射选择器再接在它后面——那会要求 html 是 html 的后代，
   整条规则永远不命中（聚合校验抓不到，只有真实浏览器会暴露）。 */
html[data-omnimux-left-collapsed]:has([data-omnimux-image-canvas][data-visible="true"]) .dshDesktopFrame[data-rightbar-fullscreen="true"] [data-composer-seat]{
  left:0!important;
}
${IMAGE_CANVAS_PROJECTION_SELECTOR} [data-composer-card]{
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
   的「中间空白占位」）。这里的面板是 absolute、定位祖先是右栏容器本身——左栏可见时
   容器已在 x=280，因此只能用容器相对坐标 left:0（换算成视口坐标正好是左栏右端）；
   写成视口偏移会把左侧导航宽度算两遍，面板右移一个侧栏宽。
   必须排除全屏态面板：它是 position:fixed（视口坐标由 sidebar-toggle-topbar 的
   fullscreen 规则负责），误套容器坐标会让它左移一个侧栏宽、压住左侧导航。 */
html[${CONVERSATION_COLLAPSED_ATTR}]:not([data-omnimux-left-collapsed]) .dshDesktopRightbarSurface [class*="_panel"]:not([data-sidebar-right-panel]):not([class*="bottom"]):not([class*="Hidden"]):not([data-sidebar-right-panel="fullscreen"]){
  left:0!important;
  right:0!important;
  width:auto!important;
  max-width:none!important;
}
html[${CONVERSATION_COLLAPSED_ATTR}][data-omnimux-left-collapsed] .dshDesktopRightbarSurface [class*="_panel"]:not([data-sidebar-right-panel]):not([class*="bottom"]):not([class*="Hidden"]){
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
