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

/** 画布身份片段：媒体查看器正在展示单张大图且该舞台在前台（见 media-viewer/image-canvas-stage.js）。 */
const IMAGE_CANVAS_VISIBLE = '[data-omnimux-image-canvas][data-visible="true"]'

/**
 * 原生输入框投射规则的前缀：**图像画布身份 ∧ 会话列此刻真的不可见**。
 *
 * 判据既不是「当前是哪个画布」，也不是焦点模式：焦点模式在折叠键为真时直接报 `gui`
 * （focus-state.js:139-141），是派生值，拿它反推会话列可见性会构成循环依赖。
 *
 * 会话列不可见只有两种成因，投射选择器因此是两支的并集：
 *   1. 右栏全屏面板遮挡（壳层镜像键，只读接缝）；
 *   2. 布局折叠且右栏未确证收起 —— 右栏收起时会话列被强制占满（conversation-box.js），
 *      此时折叠键仍为真但会话列可见，必须排除，否则同屏会出现两个输入框。
 *
 * 身份片段不可省：任一插件页收起会话列都会命中成因 2，没有身份键时技能/专家、
 * 工作流画布等页面底部也会浮出输入框（Issue #1821 的教训）。
 *
 * 保留成因 1 而不是只留成因 2：进入全屏由 fullscreen-collapse-sync 经 MutationObserver
 * 异步置位折叠键，只留成因 2 会让输入框在过渡帧内闪没。
 *
 * 不排除左栏收起态：真机实测（1708×974）左栏收起时全屏面板铺满 100vw、座席
 * 左基准由既有左栏规则归零，投射后卡片仍居中于画布。
 */
export const IMAGE_CANVAS_IDENTITY_SELECTOR = `html:has(${IMAGE_CANVAS_VISIBLE})`
/** 会话列不可见 · 成因一：右栏全屏面板遮挡。 */
export const IMAGE_CANVAS_FULLSCREEN_SELECTOR = `${IMAGE_CANVAS_IDENTITY_SELECTOR} .dshDesktopFrame[data-rightbar-fullscreen="true"]`
/** 会话列不可见 · 成因二：布局折叠且右栏未确证收起。 */
export const CONVERSATION_COLUMN_HIDDEN_SELECTOR = `html[${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])):has(${IMAGE_CANVAS_VISIBLE})`
/**
 * 投射规则的前缀。**必须用 `:is()` 包裹**：这个常量会被当作前缀拼上 `[data-composer-seat]`，
 * 若直接写成逗号并集，展开后是 `A, B [data-composer-seat]`——第一条分支会丢掉座席后代，
 * 变成「把 `position:fixed` 打在画布外框上」，全屏路径静默失效（实机预演抓到的真实缺陷）。
 */
export const IMAGE_CANVAS_PROJECTION_SELECTOR = `:is(${IMAGE_CANVAS_FULLSCREEN_SELECTOR}, ${CONVERSATION_COLUMN_HIDDEN_SELECTOR})`

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
  overflow:hidden!important;
  opacity:0!important;
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
  overflow:hidden!important;
  pointer-events:none!important;
  visibility:hidden!important;
  opacity:0!important;
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
/* Native DSH composer floating dock — 图像画布 + 会话列不可见（右栏全屏，或会话栏折叠且右栏未收起）
   时投射到画布底端（紧凑靠底停靠）。展开会话栏即撤销投射：输入框本就在会话列里，
   投射会在同屏造出第二个输入框。 */
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
html[data-omnimux-left-collapsed]:has([data-omnimux-image-canvas][data-visible="true"]) .dshDesktopFrame[data-rightbar-fullscreen="true"] [data-composer-seat],
html[data-omnimux-left-collapsed][${CONVERSATION_COLLAPSED_ATTR}]:not(:has([data-rightbar-collapsed="true"])):has([data-omnimux-image-canvas][data-visible="true"]) [data-composer-seat]{
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
