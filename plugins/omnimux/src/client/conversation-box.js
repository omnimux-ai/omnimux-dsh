/**
 * @param {unknown} node
 * @returns {{ top: number, left: number, width: number, height: number } | null}
 */
function sizableBox(node) {
  if (!node || typeof node.getBoundingClientRect !== 'function') return null
  const rect = node.getBoundingClientRect()
  if (rect.width >= 8 && rect.height >= 8) {
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
  }
  return null
}

export const PRODUCT_STAGE_EVENT = 'dsh-product-stage'
export const ACTIVE_STAGE_STORAGE_KEY = 'omnimux_active_product_stage'

/**
 * Known product-stage ID to root CSS class mapping for host-level defense in depth.
 */
export const STAGE_CSS_CLASS_MAP = {
  'omnimux-accounts': 'omnimux-accounts-stage',
  'omnimux-assets': 'omnimux-assets-stage',
  'omnimux-analytics': 'omnimux-analytics-stage',
  'omnimux-products': 'omnimux-products-stage',
  'omnimux-inspiration': 'omnimux-inspiration-stage',
  'omnimux-workflow': 'omnimux-workflow-stage',
  'omnimux-publish': 'omnimux-publish-stage',
  'omnimux-clip': 'omnimux-clip-stage',
  'omnimux-apps': 'omnimux-apps-stage',
}

const STAGE_MUTUAL_EXCLUSION_RULES = Object.entries(STAGE_CSS_CLASS_MAP).map(([stageId, className]) => {
  // First-level stage roots are direct children of the overlay seat. Scoping
  // this rule to those siblings avoids matching the active stage's own
  // header/body classes, which also contain the `-stage` fragment.
  return `html[data-dsh-product-stage="${stageId}"] [data-slot="shell.overlay"] > [class*="-stage"]:not(.${className}) { display: none !important; pointer-events: none !important; }`
}).join('\n')

/**
 * Open one first-level product page and tell the others to close.
 * @param {string} id
 */
export function claimProductStage(id) {
  try {
    if (id) window.localStorage.setItem(ACTIVE_STAGE_STORAGE_KEY, id)
  } catch {}
  window.dispatchEvent(new CustomEvent(PRODUCT_STAGE_EVENT, { detail: { id } }))
  document.documentElement.dataset.dshProductStage = id
  ensureProductStageChrome()
}

/**
 * Clear the product-stage mark when this page closes.
 * @param {string} id
 */
export function releaseProductStage(id) {
  if (document.documentElement.dataset.dshProductStage === id) {
    delete document.documentElement.dataset.dshProductStage
  }
  try {
    const current = window.localStorage.getItem(ACTIVE_STAGE_STORAGE_KEY)
    if (current === id) window.localStorage.removeItem(ACTIVE_STAGE_STORAGE_KEY)
  } catch {}
}

// First-level stage roots end in `-stage`. A `*=`-fragment match would also
// hide BEM internals and the vendored OpenReel studio classes (e.g.
// `bg-stage-bg`) whenever no product stage is active — the clip editor opened
// from the workflow canvas tab (#84).
// Idle hide MUST stay scoped to overlay direct children. Workbench Tab roots
// (e.g. `.omnimux-assets-stage` inside dsh-better-sidebar) also end in
// `-stage`; a document-wide idle rule blanks those panels (#344).
export const PRODUCT_STAGE_CHROME = `
[data-slot="shell.overlay"]{pointer-events:none!important;}
[data-slot="shell.overlay"] > *{pointer-events:auto!important;}
html:not([data-dsh-product-stage]) [data-slot="shell.overlay"] > [class$="-stage"]{display:none!important;pointer-events:none!important;}
${STAGE_MUTUAL_EXCLUSION_RULES}
html:not([data-dsh-product-stage]) [class*="toggleCluster"],
html:not([data-dsh-product-stage]) [class*="toggleCluster"] *{pointer-events:auto!important;z-index:300!important;}
/* Desktop compatibility/extended used to mark better-sidebar tabBar as drag; that
   strip sits under toggleCluster and Electron app-region swallows the clicks. */
body[data-dsh-desktop-mode] [class*="tabBar"],
body[data-dsh-desktop-mode] [class*="tabBar"] *{-webkit-app-region:no-drag!important;}
/* Desktop macOS sidebarCol::before drag strip overlays logoRow (Collapse sidebar
   toggle). Electron app-region hit-tests the overlay; button no-drag alone cannot
   punch through, so raise logoRow above the strip. */
body[data-dsh-desktop-platform="darwin"] [class*="sidebarCol"] [class*="logoRow"],
body[data-dsh-desktop-platform="darwin"] [class*="sidebarCol"] [class*="logoRow"] *{
  position:relative;z-index:11;-webkit-app-region:no-drag!important;pointer-events:auto!important;
}
html[data-dsh-product-stage] [data-dsh-better-sidebar],
html[data-dsh-product-stage] [data-dsh-better-sidebar] [class*="_panel"],
html[data-dsh-product-stage] [data-dsh-better-sidebar] [class*="_bottomPanel"],
html[data-dsh-product-stage] [data-dsh-panel-host],
html[data-dsh-product-stage] [class*="toggleCluster"],
html[data-dsh-product-stage] [data-slot="shell.sidebar.auxiliary"]{display:none!important;visibility:hidden!important;pointer-events:none!important;}
html[data-dsh-product-stage]{--dsh-sidebar-width:0px!important;--dsh-sidebar-height:0px!important;}
html[data-dsh-product-stage] #root{margin-right:0px!important;}
html[data-dsh-product-stage] #dsh-window-drag{-webkit-app-region:no-drag!important;pointer-events:none!important;}
html[data-dsh-product-stage] header{-webkit-app-region:drag!important;}
html[data-dsh-product-stage] header button,
html[data-dsh-product-stage] header input,
html[data-dsh-product-stage] header a,
html[data-dsh-product-stage] header select,
html[data-dsh-product-stage] header [role="button"],
html[data-dsh-product-stage] header [role="tab"],
html[data-dsh-product-stage] header [class*="controls"],
html[data-dsh-product-stage] header [class*="tabsContainer"]{-webkit-app-region:no-drag!important;}
html[data-dsh-product-stage] [data-slot="conversation.session.header"],
html[data-dsh-product-stage] [data-slot="conversation"] > header {display:none!important;}
html[data-dsh-product-stage] [role="treeitem"][aria-selected="true"]{background:transparent!important;}
html[data-dsh-product-stage] .dshDesktopConversationSurface > *:not([data-slot="shell.overlay"]),
html[data-dsh-product-stage] [data-slot="conversation.content"],
html[data-dsh-product-stage] [data-slot="input.trigger"] {visibility:hidden!important;}
/* Shared topbar geometry; native window gutters come from the host-aware layout. */
html[data-omnimux-sidebar-toggle-topbar]{
  --omnimux-topbar-toggle-left:8px;
  --omnimux-topbar-toggle-size:32px;
  --omnimux-topbar-toggle-gap:8px;
  --omnimux-topbar-toggle-top:4px;
  --omnimux-topbar-toggle-end:calc(var(--omnimux-topbar-toggle-left) + var(--omnimux-topbar-toggle-size) + var(--omnimux-topbar-toggle-gap));
  --omnimux-tabbar-pad-left:0px;
}
html[data-omnimux-sidebar-toggle-topbar] [data-omnimux-sidebar-toggle-topbar="1"],
html[data-omnimux-sidebar-toggle-topbar] [data-omnimux-topbar-new-session="1"]{
  position:fixed!important;
  top:var(--omnimux-topbar-toggle-top)!important;
  width:var(--omnimux-topbar-toggle-size)!important;
  height:var(--omnimux-topbar-toggle-size)!important;
  z-index:9999!important;
  -webkit-app-region:no-drag!important;
  pointer-events:auto!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  background:transparent!important;
  border:none!important;
  border-radius:8px!important;
  color:var(--dsw-alias-label-secondary)!important;
  cursor:pointer!important;
  box-sizing:border-box!important;
}
html[data-omnimux-sidebar-toggle-topbar] [data-omnimux-sidebar-toggle-topbar="1"]{
  left:var(--omnimux-topbar-toggle-left)!important;
}
/* Collapsed only: new-session sits immediately right of the expand toggle. */
html[data-omnimux-sidebar-toggle-topbar] [data-omnimux-topbar-new-session="1"]{
  left:var(--omnimux-topbar-new-session-left,calc(var(--omnimux-topbar-toggle-left) + var(--omnimux-topbar-toggle-size) + var(--omnimux-topbar-toggle-gap)))!important;
}
html[data-omnimux-sidebar-toggle-topbar] [data-omnimux-sidebar-toggle-topbar="1"]:hover,
html[data-omnimux-sidebar-toggle-topbar] [data-omnimux-topbar-new-session="1"]:hover{
  background:var(--dsw-alias-interactive-bg-hover)!important;
  color:var(--dsw-alias-label-primary)!important;
}
html[data-omnimux-sidebar-toggle-topbar] [data-omnimux-topbar-new-session="1"] svg{
  display:block;width:16px;height:16px;
}
html[data-omnimux-sidebar-toggle-topbar] [data-dsh-better-sidebar] [class*="toggleCluster"]{
  right:8px;
  gap:var(--omnimux-topbar-toggle-gap)!important;
  align-items:center;
}
html[data-omnimux-sidebar-toggle-topbar] body:is(:not([data-dsh-title-bar-compat]),[data-dsh-desktop-platform="darwin"]) [data-dsh-better-sidebar] [class*="toggleCluster"]{
  top:var(--omnimux-topbar-toggle-top)!important;
}
html[data-omnimux-sidebar-toggle-topbar] [data-dsh-better-sidebar] [class*="toggleCluster"] > button,
html[data-omnimux-sidebar-toggle-topbar] [data-dsh-better-sidebar] [data-dsh-panel-host] > [class*="_panel"]:not([class*="bottom"]):not([class*="Hidden"]) [class*="tabBarPlus"]{
  width:var(--omnimux-topbar-toggle-size)!important;
  height:var(--omnimux-topbar-toggle-size)!important;
  padding:0!important;
  flex-shrink:0;
  border-radius:8px!important;
}
html[data-omnimux-sidebar-toggle-topbar] [data-dsh-better-sidebar] [class*="toggleCluster"] > button svg,
html[data-omnimux-sidebar-toggle-topbar] [data-dsh-better-sidebar] [data-dsh-panel-host] > [class*="_panel"]:not([class*="bottom"]):not([class*="Hidden"]) [class*="tabBarPlus"] svg{
  width:16px;height:16px;
}
/* Icon swap: collapse glyph while expanded, expand glyph while collapsed. */
html[data-omnimux-sidebar-toggle-topbar] [data-omnimux-sidebar-toggle-topbar="1"] [data-omnimux-sidebar-toggle-icon]{display:none;}
html[data-omnimux-sidebar-toggle-topbar] [data-omnimux-sidebar-toggle-topbar="1"] [data-omnimux-sidebar-toggle-icon="collapse"]{display:block;width:16px;height:16px;}
html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] [data-omnimux-sidebar-toggle-topbar="1"] [data-omnimux-sidebar-toggle-icon="collapse"]{display:none;}
html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] [data-omnimux-sidebar-toggle-topbar="1"] [data-omnimux-sidebar-toggle-icon="expand"]{display:block;width:16px;height:16px;}
/* Official AppFrame toggle is now only a programmatic trigger — hide it. */
html[data-omnimux-sidebar-toggle-topbar] [data-omnimux-original-sidebar-toggle="1"]{display:none!important;}
/* Visual 0 rail when official left sidebar is collapsed (grid may still be 56).
   Zero both the sidebar column and the frame's first grid track so centerCol
   starts at x=0 with symmetric margins instead of leaving a 56px empty void.
   Key on both html[data-omnimux-left-collapsed] (user intent) and frame
   [data-sidebar-collapsed] so AppFrame's 1024px narrow auto-uncollapse flip
   during divider drags cannot momentarily pop the left sidebar open. */
html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] [class*="sidebarCol"],
html[data-omnimux-sidebar-toggle-topbar] [data-sidebar-collapsed] [class*="sidebarCol"]{
  width:0!important;
  min-width:0!important;
  max-width:0!important;
  overflow:hidden!important;
  border:none!important;
  padding:0!important;
}
html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] [class*="frame"],
html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] .dshDesktopFrame,
html[data-omnimux-sidebar-toggle-topbar] [class*="frame"][data-sidebar-collapsed],
html[data-omnimux-sidebar-toggle-topbar] .dshDesktopFrame[data-sidebar-collapsed]{
  grid-template-columns: 0px minmax(0px, 1fr) 0px !important;
}
html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] [class*="frame"]:not([data-details-collapsed="true"]),
html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] .dshDesktopFrame:not([data-details-collapsed="true"]),
html[data-omnimux-sidebar-toggle-topbar] [class*="frame"][data-sidebar-collapsed]:not([data-details-collapsed="true"]),
html[data-omnimux-sidebar-toggle-topbar] .dshDesktopFrame[data-sidebar-collapsed]:not([data-details-collapsed="true"]){
  grid-template-columns: 0px minmax(0px, 1fr) auto !important;
}
/* Tab labels dock by overlap: pad = max(0, toggleEnd − panel.left), written
   to --omnimux-tabbar-pad-left. Do NOT key this off left-collapsed: collapsed
   + split already starts the panel right of the toggle, so pad must stay 0.
   Selector is the OPEN right-panel tab strip only (never tabBarPlus / bottom).
   The semantic panel host wraps the panel; tabBar remains a deep descendant
   (panelBody > workbench > pane > tabBar). */
html[data-omnimux-sidebar-toggle-topbar] [data-dsh-better-sidebar] [data-dsh-panel-host] > [class*="_panel"]:not([class*="bottom"]):not([class*="Hidden"]) [class*="tabBar"]:not([class*="Plus"]){
  padding-left:var(--omnimux-tabbar-pad-left,0px)!important;
  padding-right:var(--omnimux-tabbar-pad-right,0px)!important;
  height:calc(var(--omnimux-topbar-toggle-size) + 2 * var(--omnimux-topbar-toggle-top) + 1px)!important;
  box-sizing:border-box;
}
/* Collapsed left rail: session title shares the top row with traffic lights +
   the fixed expand toggle. Official header still pads 20/12, so the crumb
   starts under the lights and through the toggle. The data-slot host is a
   wrapper DIV around the real <header> (ConversationSessionHeader), so pad
   the header descendant — not only the slot host. Match toggle top inset so
   title + toggle stay one 32px row. */
html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] [data-slot="conversation.session.header"] header,
html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] [data-slot="conversation.session.header"] > header,
html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] [data-slot="conversation"] > header{
  padding-left:var(--omnimux-topbar-toggle-end)!important;
  padding-top:var(--omnimux-topbar-toggle-top,4px)!important;
  box-sizing:border-box;
}
/* Blue dot on the injected toggle while left rail is collapsed. */
html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] [data-omnimux-sidebar-toggle-topbar="1"]::after{
  content:"";
  position:absolute;
  top:4px;
  right:4px;
  width:6px;
  height:6px;
  border-radius:50%;
  background:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary));
  pointer-events:none;
}
/* Settings shell mounts its fixed overlay under the left-rail foot, not as a
   body portal. Two traps then bury it under the right workbench:
   1) Desktop frames put transform/isolation on #root, so the overlay's own
      z-index:1000 only competes inside #root and loses to body-portaled
      better-sidebar panels (z-index:40) and our toggleCluster override (300).
   2) better-sidebar gui mode squeezes #root width to the left conversation
      column with overflow:hidden, so the fixed overlay is clipped to ~280px
      and looks like the right panel "ate" the settings window.
   While any true aria-modal dialog is open, expand #root to the viewport and
   raise it above the cluster (300) but below body-portaled gates (LoginGate /
   QuotaGate ~1200) and the desktop titlebar (max int). */
#root:has([role="dialog"][aria-modal="true"]){
  z-index:1100!important;
  width:100%!important;
  left:0!important;
  right:0!important;
  overflow:visible!important;
}
`

export function ensureProductStageChrome() {
  const existing = document.getElementById('dsh-product-stage-chrome')
  if (existing instanceof HTMLStyleElement) {
    if (existing.textContent !== PRODUCT_STAGE_CHROME) existing.textContent = PRODUCT_STAGE_CHROME
  } else {
    const style = document.createElement('style')
    style.id = 'dsh-product-stage-chrome'
    style.textContent = PRODUCT_STAGE_CHROME
    document.head.append(style)
  }
  watchSelectedSessionClick()
}

function leaveProductStage() {
  if (!document.documentElement.dataset.dshProductStage) return
  delete document.documentElement.dataset.dshProductStage
  try {
    window.localStorage.removeItem(ACTIVE_STAGE_STORAGE_KEY)
  } catch {}
  window.dispatchEvent(new CustomEvent(PRODUCT_STAGE_EVENT, { detail: { id: '' } }))
}

function sessionRowPlainClick(target) {
  const row = target.closest('[role="treeitem"]')
  if (!(row instanceof HTMLElement)) return false
  if (target.closest('button') !== null) return false
  return true
}

/** 工作区行加号：`在“x”中新建会话` / New session in x。行内 pin/删是别的按钮。 */
function workspaceNewSessionButton(target) {
  const button = target.closest('button')
  if (!(button instanceof HTMLElement)) return false
  if (!button.closest('[role="treeitem"]')) return false
  return /新建会话|New session/i.test(button.getAttribute('aria-label') || '')
}

function newSessionMenuPick(target) {
  const item = target.closest('#omnimux-sidebar-new-menu [role="menuitem"]')
  if (!(item instanceof HTMLElement)) return false
  return /新会话|新建会话|new session/i.test(item.textContent || '')
}

/**
 * 官方侧栏「新会话」和品牌快捷键。收起轨的加号由协调器拦截出菜单，
 * 必须等真正的 click 冒泡（用户点了菜单「新建会话」或展开态直点）才关页。
 */
function shellNewSessionControl(target) {
  const button = target.closest('button')
  if (!(button instanceof HTMLElement)) return false
  if (button.closest('#omnimux-sidebar-new-menu')) return false
  if (button.closest('[role="treeitem"]')) return false
  if (String(button.className).includes('newSession')) return true
  const aria = (button.getAttribute('aria-label') || '').trim()
  return /^(新建会话|新会话|New session)$/i.test(aria)
}

/**
 * Session / 新会话 intent means enter the conversation column.
 * If middle chat was sticky-collapsed (#372), restore split so the message is visible.
 */
function revealConversationIfCollapsed() {
  const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
  if (!api) return
  const collapsed = typeof api.getConversationCollapsed === 'function'
    ? api.getConversationCollapsed()
    : false
  if (!collapsed) return
  api.setFocus?.('split')
}

function handleSessionEnterIntent(target) {
  if (!(target instanceof Element)) return false
  return sessionRowPlainClick(target) || workspaceNewSessionButton(target) || newSessionMenuPick(target)
}

/**
 * 任意工作区会话行离开产品页；已选中行官方 no-op 也要关。
 * 「新会话」官方会复用空白会话（看起来像没点），一级页必须自己关 overlay。
 * 藏中后点会话行 / 新会话：同时重新展开中间对话栏（进入对话意图）。
 */
function watchSelectedSessionClick() {
  if (document.documentElement.dataset.dshSessionCloser === '1') return
  document.documentElement.dataset.dshSessionCloser = '1'
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!handleSessionEnterIntent(target)) return
    if (document.documentElement.dataset.dshProductStage) leaveProductStage()
    revealConversationIfCollapsed()
  }, true)
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (!shellNewSessionControl(target)) return
    if (document.documentElement.dataset.dshProductStage) leaveProductStage()
    revealConversationIfCollapsed()
  })
}

/**
 * Cover the whole conversation column (header + body + composer) and expand
 * to the full viewport width so right-side auxiliary sidebars cannot squeeze it.
 * First-level product pages are not session views.
 * @returns {{ top: number, left: number, width: number, height: number }}
 */
export function readConversationBox() {
  let node = document.querySelector('[data-slot="conversation"]')
  let found = null
  while (node) {
    const box = sizableBox(node)
    if (box) {
      found = box
      break
    }
    node = node.parentElement
  }
  if (!found) {
    found = sizableBox(document.querySelector('[data-conversation-scroll]'))
  }
  if (found) {
    const winWidth = typeof window !== 'undefined' && typeof window.innerWidth === 'number' ? window.innerWidth : 0
    const winHeight = typeof window !== 'undefined' && typeof window.innerHeight === 'number' ? window.innerHeight : 0
    const width = winWidth > found.left ? Math.max(found.width, winWidth - found.left) : found.width
    const height = winHeight > found.top ? Math.max(found.height, winHeight - found.top) : found.height
    return { top: found.top, left: found.left, width, height }
  }
  const left = 56
  const winWidth = typeof window !== 'undefined' && typeof window.innerWidth === 'number' ? window.innerWidth : 1024
  const winHeight = typeof window !== 'undefined' && typeof window.innerHeight === 'number' ? window.innerHeight : 768
  return { top: 0, left, width: Math.max(8, winWidth - left), height: Math.max(8, winHeight) }
}
