/**
 * Composer compact (screens 1-2): adapt the official conversation composer to a
 * narrowed session column. Overlay only — no fork, no second composer, no
 * conversation-slot replacement. Selectors deliberately rely on data attributes
 * and `[class*=...]` substring matches because official CSS modules are hashed.
 *
 * Three density levels are driven by the live width of the composer card:
 *   full  (>= 560px) — everything shown
 *   short (>= 460px) — effort hidden; model seat already collapses to a box glyph
 *   icon  (<  460px) — toolbar icons only; model seat stays the same box glyph
 *
 * Also owns the empty-state anchor (logo+tagline mid, input pinned to the
 * bottom, Codex-style) and the conversation-column min-width guard.
 */

import { listSessionMaterials, materialCandidates, parseMaterialMention } from './attachments/materialMentionSource.ts'

export const COMPOSER_COMPACT_STYLE_ID = 'omnimux-composer-compact-chrome'
export const COMPOSER_COMPACT_ATTR = 'data-omnimux-composer-density'
export const COMPOSER_COMPACT_DENSITY = Object.freeze({ full: 'full', short: 'short', icon: 'icon' })
export const COMPOSER_COMPACT_FULL_MIN_PX = 560
export const COMPOSER_COMPACT_SHORT_MIN_PX = 460
/** Keep in lockstep with WORKBENCH_CONVERSATION_MIN_PX. */
export const COMPOSER_COMPACT_CONVERSATION_MIN_PX = 360
/** Keep the workspace chip secondary to the adjacent Agent preset on narrow rows. */
export const COMPOSER_WORKSPACE_MAX_WIDTH_PX = 220

export const COMPOSER_COMPACT_CSS = `
/* (B4) conversation column keeps a minimum width — dragging the split anywhere
   below this is clamped by workbenchSplitMaxPanelPx; this guards the CSS side. */
html:not([data-omnimux-conversation-collapsed]) [class*="centerCol"]{
  min-width:${COMPOSER_COMPACT_CONVERSATION_MIN_PX}px!important;
}

/* Reserve equal scrollbar gutters so the content stays centered in the column. */
[data-conversation-scroll]{
  scrollbar-gutter:stable both-edges;
}
/* Overlay views reserve the same clearance as both chat scrollbar gutters. */
[data-conversation-scroll]:has([data-conversation-composer-overlay]) > [data-composer-seat]{
  left:var(--dsh-scrollbar-width);
}

/* 非全屏（分屏）模式下，迎宾区靠左上角独立图层对齐排布 */
html[data-omnimux-split-compact] .omnimux-welcome-header,
.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) .omnimux-welcome-header,
[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) .omnimux-welcome-header {
  position:absolute!important;
  top:28px!important;
  left:24px!important;
  right:24px!important;
  width:auto!important;
  max-width:calc(100% - 48px)!important;
  margin:0!important;
  padding:0!important;
  z-index:10!important;
  display:flex!important;
  align-items:center!important;
  gap:12px!important;
}
html[data-omnimux-split-compact] .omnimux-welcome-texts,
.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) .omnimux-welcome-texts,
[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) .omnimux-welcome-texts {
  width:auto!important;
  flex:1 1 auto!important;
  min-width:0!important;
}
html[data-omnimux-split-compact] .omnimux-welcome-title,
.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) .omnimux-welcome-title,
[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) .omnimux-welcome-title {
  font-size:18px!important;
  line-height:24px!important;
  font-weight:600!important;
  white-space:nowrap!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
}
html[data-omnimux-split-compact] .omnimux-welcome-subtitle,
.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) .omnimux-welcome-subtitle,
[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) .omnimux-welcome-subtitle {
  font-size:13px!important;
  line-height:18px!important;
  white-space:nowrap!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
}
/* 隐藏非全屏模式下输入框上方的空居中外壳，确保输入框紧凑贴底（使用语义级 display:none 杜绝零高度负溢出） */
html[data-omnimux-split-compact] [data-phase='hero'] [class*="composerHero"] > :first-child:not(.omnimux-welcome-header),
.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-phase='hero'] [class*="composerHero"] > :first-child:not(.omnimux-welcome-header),
[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-phase='hero'] [class*="composerHero"] > :first-child:not(.omnimux-welcome-header) {
  display:none!important;
}

/* 非全屏（分栏）模式下：输入框两侧紧凑收敛至12px，严格对齐工作区行左侧，消除底部悬空 */
html[data-omnimux-split-compact] [data-composer-seat],
.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-composer-seat],
[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-composer-seat] {
  padding-bottom:0!important;
  padding-top:0!important;
  --dsh-composer-side-clearance:12px!important;
}
html[data-omnimux-split-compact] [data-phase='hero'] [class*="composerHero"],
.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-phase='hero'] [class*="composerHero"],
[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-phase='hero'] [class*="composerHero"] {
  padding-bottom:0!important;
  width:100%!important;
  max-width:100%!important;
  margin-inline:0!important;
}
html[data-omnimux-split-compact] [data-phase='hero'] [class*="heroWorkspaceRow"],
.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-phase='hero'] [class*="heroWorkspaceRow"],
[class*="frame"]:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) [data-phase='hero'] [class*="heroWorkspaceRow"] {
  width:100%!important;
  max-width:100%!important;
  margin-inline:0!important;
  padding-left:var(--dsh-composer-side-clearance, 12px)!important;
  padding-right:var(--dsh-composer-side-clearance, 12px)!important;
  box-sizing:border-box!important;
}

/* 迎宾打招呼头部样式 */
.omnimux-welcome-header{
  display:flex;
  align-items:center;
  gap:12px;
  margin-bottom:16px;
  user-select:none;
}
.omnimux-welcome-logo{
  width:36px;
  height:36px;
  border-radius:10px;
  flex-shrink:0;
  overflow:hidden;
  display:flex;
  align-items:center;
  justify-content:center;
}
.omnimux-welcome-logo svg{
  width:100%;
  height:100%;
  display:block;
}
.omnimux-welcome-texts{
  display:flex;
  flex-direction:column;
  gap:2px;
}
.omnimux-welcome-title{
  font-size:20px;
  font-weight:600;
  line-height:26px;
  color:var(--dsw-alias-label-primary, currentColor);
  letter-spacing:-0.2px;
}
.omnimux-welcome-subtitle{
  font-size:13px;
  line-height:18px;
  color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));
}

/* (B1) hero (no session yet): the whole stack is what the official scrollBody
   justify-content:center used to center. Pin the input bar to the bottom and
   let the HeroShell (logo + tagline) float centered in the leftover space
   (Codex reference). No transform centering — it would become a containing
   block for position:fixed descendants of the hero. */
[data-phase='hero'] [data-conversation-scroll]{
  justify-content:flex-start!important;
}
[data-phase='hero'] [data-composer-seat]{
  flex:1 1 auto;
  min-height:100%;
  display:flex;
  flex-direction:column;
  justify-content:flex-end;
}
[data-phase='hero'] [class*="composerHero"]{
  flex:1 1 auto;
  width:100%;
  align-self:stretch;
  justify-content:flex-end;
  padding-bottom:8px;
}
/* First child of composerHero = HeroShell (logo + tagline): eat the leftover
   space and centre within it. */
[data-phase='hero'] [class*="composerHero"] > :first-child{
  margin-top:auto;
  margin-bottom:auto;
  height:auto!important;
  min-height:0;
}
/* A hidden preview badge must not leave an empty grid track beside the title. */
[data-phase='hero'] [class*="headline"]:has(> [class*="previewBadge"][data-omnimux-hide]){
  grid-template-columns:auto auto;
}

/* Collapse empty input-dock item in hero phase so it does not consume a flex gap. */
[data-phase='hero'] [data-slot="conversation.input.dock"] > div:empty{
  display:none!important;
}

/* Match the input bar's clearance even when a narrow column limits card width. */
[data-phase='hero'] [class*="heroWorkspaceRow"]{
  width:calc(100% - 2 * var(--dsh-composer-side-clearance,16px))!important;
  max-width:var(--dsh-chat-content-width)!important;
  min-width:0;
  margin-top:0!important;
  margin-bottom:-8px!important;
  margin-left:auto!important;
  margin-right:auto!important;
  padding-left:0!important;
  padding-right:0!important;
  box-sizing:border-box!important;
  flex-wrap:nowrap;
  overflow:hidden;
  position:relative!important;
  left:0!important;
}
/* Size the workspace trigger to its content, capped beside the Agent preset. */
[data-phase='hero'] [class*="heroWorkspaceRow"] > button[aria-label][aria-haspopup='menu'][aria-expanded]:first-child{
  flex:0 1 auto;
  min-width:0;
  max-width:min(100%,${COMPOSER_WORKSPACE_MAX_WIDTH_PX}px)!important;
  overflow:hidden;
}
[data-phase='hero'] [class*="heroWorkspaceRow"] > button[aria-label][aria-haspopup='menu'][aria-expanded]:first-child > span{
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

/* (B3) density: short — non-model triggers still truncate; model seat uses the
   shared glyph rule below (same as icon). */
html[data-omnimux-composer-density='short'] [data-composer-card] [class*="triggerLabel"]{
  max-width:88px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
html[data-omnimux-composer-density='short'] [data-composer-card] [class*="triggerEffort"],
html[data-omnimux-composer-density='icon'] [data-composer-card] [class*="triggerEffort"]{
  display:none;
}

/* Permission chip: keep its native triggerIcon, drop the text label (icon density). */
html[data-omnimux-composer-density='icon'] [data-composer-card] [class*="trigger"]:has([class*="triggerIcon"]) [class*="triggerLabel"]{
  display:none;
}
/*
 * Model seat (conversation.input.model): official ModelSelect has no triggerIcon —
 * only triggerLabel + optional triggerEffort + chevron. Keep a 28px glyph
 * (3-layer box) at every density so a long name never squeezes the row.
 * Selector is scoped to trailing + aria-haspopup=menu so the ContextMeter
 * (dialog) and left-side Permission/Plan chips stay untouched.
 * title/aria-label remain on the button for hover + a11y.
 */
/* Model seat (conversation.input.model) 3D 立体模型层图标数据源，声明于卡片根部以供所有子级继承；同时声明容器查询上下文（Issue #2302） */
[data-composer-card]{
  container-type:inline-size;
  container-name:composer-card;
  --omnimux-model-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M12.92 2.26L19.43 5.77C20.19 6.18 20.19 7.35 19.43 7.76L12.92 11.27C12.34 11.58 11.66 11.58 11.08 11.27L4.57 7.76C3.81 7.35 3.81 6.18 4.57 5.77L11.08 2.26C11.66 1.95 12.34 1.95 12.92 2.26Z' stroke='%23fff' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M3.61 10.13L9.66 13.16C10.41 13.54 10.89 14.31 10.89 15.15V20.87C10.89 21.7 10.02 22.23 9.28 21.86L3.23 18.83C2.48 18.45 2 17.68 2 16.84V11.12C2 10.29 2.87 9.76 3.61 10.13Z' stroke='%23fff' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M20.39 10.13L14.34 13.16C13.59 13.54 13.11 14.31 13.11 15.15V20.87C13.11 21.7 13.98 22.23 14.72 21.86L20.77 18.83C21.52 18.45 22 17.68 22 16.84V11.12C22 10.29 21.13 9.76 20.39 10.13Z' stroke='%23fff' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
}
/* 模型选择按钮默认无背景底块，hover 时提供柔和反馈；自适应缩短名称防止折行（Issue #2192） */
[data-composer-card] [class*="trailing"] button[aria-haspopup='menu']{
  background:transparent!important;
  border:none!important;
  box-shadow:none!important;
  min-width:28px!important;
  max-width:220px;
  flex-shrink:1!important;
}
[data-composer-card] [class*="trailing"] button[aria-haspopup='menu'] [class*="triggerLabel"]{
  max-width:120px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  display:inline-block;
  vertical-align:middle;
}
@media (max-width: 768px){
  [data-composer-card] [class*="trailing"] button[aria-haspopup='menu'] [class*="triggerLabel"]{
    max-width:88px;
  }
}
[data-composer-card] [class*="trailing"] button[aria-haspopup='menu']:hover:not(:disabled){
  background:var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08))!important;
}
[data-composer-card] [class*="trailing"] button[aria-haspopup='menu']:has([class*="triggerLabel"]){
  width:28px;
  height:28px;
  min-width:28px;
  max-width:28px;
  padding:0;
  justify-content:center;
  gap:0;
}
[data-composer-card] [class*="trailing"] button[aria-haspopup='menu']:has([class*="triggerLabel"]) [class*="triggerLabel"],
[data-composer-card] [class*="trailing"] button[aria-haspopup='menu']:has([class*="triggerLabel"]) [class*="triggerEffort"],
[data-composer-card] [class*="trailing"] button[aria-haspopup='menu']:has([class*="triggerLabel"]) [class*="chevron"]{
  display:none!important;
}
[data-composer-card] [class*="trailing"] button[aria-haspopup='menu']:has([class*="triggerLabel"])::before{
  content:'';
  display:block;
  width:14px;
  height:14px;
  flex:0 0 14px;
  background-color:currentColor;
  -webkit-mask-image:var(--omnimux-model-icon);
  mask-image:var(--omnimux-model-icon);
  -webkit-mask-size:contain;
  mask-size:contain;
  -webkit-mask-repeat:no-repeat;
  mask-repeat:no-repeat;
  -webkit-mask-position:center;
  mask-position:center;
}
/* 官方 triggerIcon (IconDataOutline16) 遮蔽其原有子路径并重载为 3D 立体模型层图标 */
[data-composer-card] [class*="trailing"] button[aria-haspopup='menu'] [class*="triggerIcon"]{
  display:inline-block!important;
  vertical-align:middle!important;
  width:14px!important;
  height:14px!important;
  flex:0 0 14px!important;
  background-color:currentColor!important;
  -webkit-mask-image:var(--omnimux-model-icon)!important;
  mask-image:var(--omnimux-model-icon)!important;
  -webkit-mask-size:contain!important;
  mask-size:contain!important;
  -webkit-mask-repeat:no-repeat!important;
  mask-repeat:no-repeat!important;
  -webkit-mask-position:center!important;
  mask-position:center!important;
}
[data-composer-card] [class*="trailing"] button[aria-haspopup='menu'] [class*="triggerIcon"] *{
  display:none!important;
}
/* 当模型选择按钮自身已有原生 triggerIcon 或模型图标时，禁止 ::before 伪元素生成图标，杜绝双图标并存 */
[data-composer-card] [class*="trailing"] button[aria-haspopup='menu']:has([class*="triggerIcon"])::before,
[data-composer-card] [class*="trailing"] button[aria-haspopup='menu']:has(> svg:not([class*="chevron"]))::before {
  display:none!important;
  content:none!important;
}
/* 原生 triggerIcon 在 28px 紧凑圆形/圆角按钮中居中居正 */
[data-composer-card] [class*="trailing"] button[aria-haspopup='menu']:has([class*="triggerLabel"]) [class*="triggerIcon"]{
  margin:0!important;
  flex-shrink:0!important;
}
/* Text-only toolbar buttons become icon-sized. Never touch the .add (plus)
   button — it is already an icon. */
html[data-omnimux-composer-density='icon'] [data-composer-card] [class*="tools"] > button:not([class*="add"]){
  font-size:0;
  width:28px;
  height:28px;
  min-width:28px;
  padding:0;
  justify-content:center;
}
html[data-omnimux-composer-density='icon'] [data-composer-card] [class*="tools"] > button:not([class*="add"]) svg{
  width:14px;
  height:14px;
}
/* Keep the toolbar single-row: the official .row wraps, which drops the
   trailing cluster onto a second line and deforms the card.
   Issue 517: scope to the card's direct-child toolbar only. A descendant
   [class*="row"] also matches the scrollport grow wrapper because "grow"
   contains "row", forcing white-space:nowrap and a horizontal scrollbar at
   360px. Direct child + :has(> [class*="tools"]) keeps the rule off grow
   and other card children. Never widen this back to a descendant selector. */
html[data-omnimux-composer-density='icon'] [data-composer-card] > [class*="row"]:has(> [class*="tools"]){
  flex-wrap:nowrap!important;
  white-space:nowrap;
}
/* Keep toolbar and trailing cluster single-row across all densities so model seat and tools never wrap onto two lines (Issue 2192). */
[data-composer-card] > [class*="row"]:has(> [class*="trailing"]){
  flex-wrap:nowrap!important;
}
[data-composer-card] [class*="tools"]{
  min-width:0;
  flex:1 1 auto;
}
[data-composer-card] [class*="tools"]{
  overflow:hidden;
}
[data-composer-card] [class*="tools"] [data-slot="conversation.input.left"]{
  min-width:0;
  display:inline-flex;
  align-items:center;
  flex-shrink:1;
}
[data-composer-card] [class*="trailing"]{
  flex-shrink:0;
  display:inline-flex;
  align-items:center;
}

/* @ 菜单默认钉在输入框上方。输入框靠近页面顶部时改从下方展开，避免被顶出屏幕。
   严格限定仅对 @ 引用菜单生效（通过识别 [data-omnimux-mention-menu] 或内含素材项），绝不影响斜杠/模型/加号等其他菜单。 */
[data-composer-card] [data-trigger-menu][data-omnimux-mention-menu],
[data-composer-card] [data-trigger-menu]:has([data-source="material"]),
[data-composer-card] [data-trigger-menu]:has([id^="dsh-slash-option-material-"]){
  bottom:auto!important;
  top:calc(100% + 4px)!important;
}
[data-composer-card][data-omnimux-mention-up] [data-trigger-menu][data-omnimux-mention-menu],
[data-composer-card][data-omnimux-mention-up] [data-trigger-menu]:has([data-source="material"]),
[data-composer-card][data-omnimux-mention-up] [data-trigger-menu]:has([id^="dsh-slash-option-material-"]){
  top:auto!important;
  bottom:calc(100% + 4px)!important;
}
/* 素材行开头的缩略图。地址写在行的 data-omnimux-thumb 上。 */
[data-trigger-menu] [role="option"][data-omnimux-thumb]::before{
  content:"";
  width:32px;
  height:32px;
  border-radius:6px;
  flex:none;
  background:var(--dsw-alias-bg-layer-3) center/cover no-repeat;
  background-image:var(--omnimux-thumb);
  display:inline-block;
}

/* 纯 CSS 容器查询自适应兜底：当卡片宽度变窄时原生即时收敛（Issue #2302） */
@container composer-card (max-width: 559px){
  [class*="trailing"] button[aria-haspopup='menu'] [class*="triggerLabel"]{
    max-width:88px;
  }
  [class*="trailing"] button[aria-haspopup='menu'] [class*="triggerEffort"]{
    display:none!important;
  }
}
@container composer-card (max-width: 459px){
  [class*="trailing"] button[aria-haspopup='menu']{
    width:28px!important;
    height:28px!important;
    min-width:28px!important;
    max-width:28px!important;
    padding:0!important;
    justify-content:center!important;
    gap:0!important;
  }
  [class*="trailing"] button[aria-haspopup='menu'] [class*="triggerLabel"],
  [class*="trailing"] button[aria-haspopup='menu'] [class*="triggerEffort"],
  [class*="trailing"] button[aria-haspopup='menu'] [class*="chevron"]{
    display:none!important;
  }
  [class*="tools"] .sh-picker-trigger{
    width:28px!important;
    min-width:28px!important;
    max-width:28px!important;
    padding:0!important;
    justify-content:center!important;
  }
  [class*="tools"] .sh-picker-trigger-label{
    display:none!important;
  }
}
`

function hostWindow() {
  return typeof globalThis.window !== 'undefined' ? globalThis.window : undefined
}

function hostDocument() {
  return typeof globalThis.document !== 'undefined' ? globalThis.document : hostWindow()?.document
}

/** @type {ResizeObserver | null} */
let composerResizeObserver = null
/** @type {(() => void) | null} */
let composerResizeListener = null
/** @type {MutationObserver | null} */
let composerMountObserver = null
/** @type {MutationObserver | null} */
const composerContentObservers = new Map()
let pendingInlineCards = new Set()
let pendingAllCards = false
/** @type {Element | null} */
let observedTarget = null
/** @type {Document | null} */
let observerDoc = null
/** 待执行的帧回调句柄（rAF id；退化为微任务时用 0 作哨兵，null 表示没有排队）。 */
let densityFrame = null
/** 安装代次：卸载/重建后让已排队的回调失效。 */
let densityFrameToken = 0

/**
 * Density from a live width (px). Pure, unit-testable.
 * @param {number} px
 * @returns {string} one of `full` | `short` | `icon`
 */
export function composerDensityForWidth(px) {
  const width = Number.isFinite(Number(px)) ? Number(px) : 0
  if (width >= COMPOSER_COMPACT_FULL_MIN_PX) return COMPOSER_COMPACT_DENSITY.full
  if (width >= COMPOSER_COMPACT_SHORT_MIN_PX) return COMPOSER_COMPACT_DENSITY.short
  return COMPOSER_COMPACT_DENSITY.icon
}

/**
 * Find the width probe for density: prefer the composer card, then the seat,
 * then the conversation column/scroll body.
 * @param {Document | undefined} doc
 * @returns {Element | null}
 */
function findComposerTarget(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  const card = doc.querySelector('[data-composer-card]')
  if (card) return card
  const seat = doc.querySelector('[data-composer-seat]')
  if (seat) return seat
  const conversation = doc.querySelector('[data-conversation-scroll], [class*="centerCol"]')
  return conversation || null
}

function measureWidth(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null
  const width = el.getBoundingClientRect().width
  return typeof width === 'number' && Number.isFinite(width) ? width : null
}

/**
 * Dock the hero seats row to the live composer-card box (fullscreen fix).
 * Writes CSS vars consumed by COMPOSER_COMPACT_CSS B5.
 * @param {Document | undefined} doc
 */
export function syncHeroWorkspaceRowToCard(doc = hostDocument()) {
  const root = doc?.documentElement
  if (!root?.style?.setProperty) return
  const card = doc?.querySelector?.('[data-composer-card]')
  const center = doc?.querySelector?.('[class*="centerCol"], [data-slot="conversation"]')
  if (!card || typeof card.getBoundingClientRect !== 'function') {
    try {
      root.style.removeProperty('--omnimux-composer-card-width')
      root.style.removeProperty('--omnimux-composer-card-offset')
    } catch { /* ignore */ }
    return
  }
  const cardBox = card.getBoundingClientRect()
  const centerBox = center && typeof center.getBoundingClientRect === 'function'
    ? center.getBoundingClientRect()
    : null
  const width = Math.round(cardBox.width)
  if (!(width > 0)) return
  // Offset of the card inside the conversation column (not the viewport).
  const offset = centerBox
    ? Math.max(0, Math.round(cardBox.left - centerBox.left))
    : Math.round(cardBox.left)
  root.style.setProperty('--omnimux-composer-card-width', `${width}px`)
  root.style.setProperty('--omnimux-composer-card-offset', `${offset}px`)
}

const inlineCardOverrides = new Map()
const inlineDensityCards = new Set()
const INLINE_DENSITY = 'data-omnimux-inline-density'
const INLINE_GEOMETRY_PROPERTIES = ['width', 'max-width', 'margin-left', 'margin-right', 'left']

function restoreInlineCard(card, saved) {
  for (const [name, value, priority] of saved) {
    if (value) card.style.setProperty(name, value, priority)
    else card.style.removeProperty(name)
  }
  card.removeAttribute(INLINE_DENSITY)
}

/** Intrinsic single-row demand excludes floating menus and hidden descendants. */
function inlineContentWidth(node, win) {
  const css = win.getComputedStyle(node)
  if (css.display === 'none' || css.position === 'absolute' || css.position === 'fixed') return 0
  const children = Array.from(node.children).filter((child) => {
    const style = win.getComputedStyle(child)
    return style.display !== 'none' && !['absolute', 'fixed'].includes(style.position)
  })
  const edge = (parseFloat(css.paddingLeft) || 0) + (parseFloat(css.paddingRight) || 0)
    + (parseFloat(css.borderLeftWidth) || 0) + (parseFloat(css.borderRightWidth) || 0)
  if (!children.length || node.matches('button, svg, input')) return Math.max(node.getBoundingClientRect().width, node.scrollWidth || 0)
  const widths = children.map((child) => inlineContentWidth(child, win))
  if (css.display.includes('flex') && css.flexDirection !== 'column') {
    return widths.reduce((sum, value) => sum + value, 0) + Math.max(0, children.length - 1) * (parseFloat(css.columnGap) || 0) + edge
  }
  return Math.max(0, ...widths) + edge
}

/** Release temporary inline geometry before the dock owner measures its card. */
export function releaseInlineComposerGeometry(card) {
  const saved = inlineCardOverrides.get(card)
  if (saved) {
    restoreInlineCard(card, saved)
    inlineCardOverrides.delete(card)
  }
}

/** Intrinsic full-label demand; the caller retains ownership of dock geometry. */
export function measureInlineComposerDemand(card) {
  const win = card?.ownerDocument?.defaultView
  const row = card?.querySelector(':scope > [class*="row"]:has(> [class*="tools"])')
  if (!win || !row || !card.querySelector('[data-omx-quick-shortcut-controls]') || !card.getBoundingClientRect().width) return 0
  const previous = card.getAttribute(INLINE_DENSITY)
  card.setAttribute(INLINE_DENSITY, 'full')
  try {
    const css = win.getComputedStyle(card)
    return Math.ceil(inlineContentWidth(row, win) + ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((sum, key) => sum + (parseFloat(css[key]) || 0), 0))
  } finally {
    if (previous === null) card.removeAttribute(INLINE_DENSITY)
    else card.setAttribute(INLINE_DENSITY, previous)
  }
}

/** Card-local temporary width; saved user preference and message width are untouched. */
export function syncInlineComposerWidths(doc = hostDocument(), changedCards = null) {
  const win = doc?.defaultView
  if (!win?.getComputedStyle || !doc?.querySelectorAll) return
  const includes = card => !changedCards || changedCards.has(card)
  for (const card of inlineDensityCards) {
    if (!card.isConnected || !card.querySelector('[data-omx-quick-shortcut-controls]')) {
      card.removeAttribute(INLINE_DENSITY)
      inlineDensityCards.delete(card)
    }
  }
  for (const [card, saved] of inlineCardOverrides) {
    if (!includes(card) && card.isConnected && card.querySelector('[data-omx-quick-shortcut-controls]')) continue
    restoreInlineCard(card, saved)
    if (!card.isConnected || !card.querySelector('[data-omx-quick-shortcut-controls]')) inlineCardOverrides.delete(card)
  }
  const cards = []
  for (const controls of doc.querySelectorAll('[data-omx-quick-shortcut-controls]')) {
    const card = controls.closest('[data-composer-card]')
    if (card?.isConnected && includes(card)) {
      inlineDensityCards.add(card)
      card.setAttribute(INLINE_DENSITY, 'full')
    }
  }
  for (const controls of doc.querySelectorAll('[data-omx-quick-shortcut-controls]')) {
    const card = controls.closest('[data-composer-card]')
    const row = card?.querySelector(':scope > [class*="row"]:has(> [class*="tools"])')
    const seat = card?.closest('[data-composer-seat]')
    if (!card || !includes(card) || !row || !seat || !card.getBoundingClientRect().width) continue
    const docked = Boolean(card.closest('[data-omnimux-starter-host][data-omnimux-dock-open]'))
    if (docked) releaseInlineComposerGeometry(card)
    else if (!inlineCardOverrides.has(card)) {
      inlineCardOverrides.set(card, INLINE_GEOMETRY_PROPERTIES.map((name) => [name, card.style.getPropertyValue(name), card.style.getPropertyPriority(name)]))
    }
    const original = card.getBoundingClientRect()
    const seatBox = seat.getBoundingClientRect()
    const column = card.closest('[data-conversation-scroll], [class*="centerCol"]')
    const columnBox = column?.getBoundingClientRect() || seatBox
    const css = win.getComputedStyle(card)
    const seatCss = win.getComputedStyle(seat)
    const clearance = parseFloat(css.getPropertyValue('--dsh-composer-side-clearance')) || 16
    const left = Math.max(seatBox.left + (parseFloat(seatCss.paddingLeft) || 0), columnBox.left) + clearance
    const right = Math.min(seatBox.right - (parseFloat(seatCss.paddingRight) || 0), columnBox.right) - clearance
    const available = Math.max(0, right - left)
    if (!available) continue
    const padding = (parseFloat(css.paddingLeft) || 0) + (parseFloat(css.paddingRight) || 0)
      + (parseFloat(css.borderLeftWidth) || 0) + (parseFloat(css.borderRightWidth) || 0)
    const needed = Math.ceil(inlineContentWidth(row, win) + padding)
    const target = docked ? original.width : Math.min(available, Math.max(original.width, needed))
    cards.push({ card, row, padding, needed, target, docked, position: css.position,
      originalLeft: parseFloat(css.left) || 0, centeredLeft: left + (available - target) / 2 })
  }
  // Commit widths together before reading their resulting auto-margin positions.
  for (const item of cards) {
    const { card, target, docked, needed } = item
    if (!docked) {
      card.style.setProperty('width', `${target}px`, 'important')
      card.style.setProperty('max-width', `${target}px`, 'important')
      card.style.setProperty('margin-left', 'auto', 'important')
      card.style.setProperty('margin-right', 'auto', 'important')
    }
    if (needed > target + 1) card.setAttribute(INLINE_DENSITY, 'short')
  }
  const updates = cards.map(item => ({ ...item,
    offset: !item.docked && item.position === 'relative'
      ? item.centeredLeft - item.card.getBoundingClientRect().left + item.originalLeft : item.centeredLeft,
    icon: item.needed > item.target + 1 && inlineContentWidth(item.row, win) + item.padding > item.target + 1,
  }))
  for (const { card, docked, position, offset, icon } of updates) {
    if (!docked && (position === 'fixed' || position === 'relative')) card.style.setProperty('left', `${offset}px`, 'important')
    if (icon) card.setAttribute(INLINE_DENSITY, 'icon')
  }
}

/**
 * Write the density attribute on `<html>` based on the current probe width.
 * Also keeps the hero seats row docked to the composer card.
 * @param {Document | undefined} [doc]
 */
export function applyComposerDensity(doc = hostDocument(), changedCards = null) {
  syncInlineComposerWidths(doc, changedCards)
  const root = doc?.documentElement
  if (!root || typeof root.setAttribute !== 'function') return
  const target = findComposerTarget(doc)
  const width = target ? measureWidth(target) : null
  if (width == null) {
    if (typeof root.removeAttribute === 'function') root.removeAttribute(COMPOSER_COMPACT_ATTR)
  } else {
    root.setAttribute(COMPOSER_COMPACT_ATTR, composerDensityForWidth(width))
  }
  syncHeroWorkspaceRowToCard(doc)
}

/**
 * Inject (idempotently) the composer-compact CSS `<style>`.
 * @param {Document | undefined} [doc]
 */
export function ensureComposerCompactChrome(doc = hostDocument()) {
  if (!doc?.head) return null
  let style = doc.getElementById(COMPOSER_COMPACT_STYLE_ID)
  if (!style) {
    style = doc.createElement('style')
    style.id = COMPOSER_COMPACT_STYLE_ID
    doc.head.append(style)
  }
  if (style.textContent !== COMPOSER_COMPACT_CSS) style.textContent = COMPOSER_COMPACT_CSS
  return style
}

function observeComposerToolbars(doc) {
  const cards = new Set(doc.querySelectorAll?.('[data-composer-card]') || [])
  for (const [card, entry] of composerContentObservers) {
    const row = card.querySelector?.(':scope > [class*="row"]:has(> [class*="tools"])')
    if (!cards.has(card) || !card.isConnected || row !== entry.row || card.closest?.('[data-composer-seat]') !== entry.seat) {
      entry.observer?.disconnect()
      entry.resize?.disconnect()
      composerContentObservers.delete(card)
      scheduleComposerDensity(doc, card)
    }
  }
  for (const card of cards) {
    if (composerContentObservers.has(card)) continue
    const row = card.querySelector?.(':scope > [class*="row"]:has(> [class*="tools"])')
    if (!row) continue
    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(() => scheduleComposerDensity(doc, card)) : null
    observer?.observe(row, { childList: true, characterData: true, subtree: true })
    const resize = typeof globalThis.ResizeObserver === 'function'
      ? new globalThis.ResizeObserver(() => scheduleComposerDensity(doc, card)) : null
    const seat = card.closest?.('[data-composer-seat]')
    if (seat) resize?.observe(seat)
    resize?.observe(card)
    composerContentObservers.set(card, { row, seat, observer, resize })
    scheduleComposerDensity(doc, card)
  }
}

function observeComposerTarget(doc, target) {
  if (observedTarget === target && composerResizeObserver) return
  if (composerResizeObserver) {
    try { composerResizeObserver.disconnect() } catch { /* ignore */ }
    composerResizeObserver = null
  }
  observedTarget = target
  const RO = globalThis.ResizeObserver
  if (typeof RO === 'function' && target) {
    composerResizeObserver = new RO(() => { scheduleComposerDensity(doc) })
    composerResizeObserver.observe(target)
    const seat = target.closest?.('[data-composer-seat]')
    if (seat) composerResizeObserver.observe(seat)
  }
}

/**
 * 把 ResizeObserver 回调里的密度写入推迟到下一帧。
 *
 * 密度档位本身就改写输入框卡片的布局：在 RO 交付周期内同步写 html 属性，会让被观测的
 * 卡片在同一周期里再次改变尺寸，触发宿主浏览器的
 * `ResizeObserver loop completed with undelivered notifications.` 告警。
 * 推迟一帧后尺寸变化落到下一个正常交付周期；同帧多次触发合并为一次，
 * 取不到 requestAnimationFrame 时退到微任务；resize 兜底复用同一调度。
 * @param {Document | undefined} doc
 */
function scheduleComposerDensity(doc, card = null) {
  if (card) pendingInlineCards.add(card)
  else pendingAllCards = true
  if (densityFrame !== null) return
  const token = densityFrameToken
  const run = () => {
    densityFrame = null
    if (token !== densityFrameToken || observerDoc !== doc) return
    const changedCards = pendingAllCards ? null : pendingInlineCards
    pendingInlineCards = new Set()
    pendingAllCards = false
    applyComposerDensity(doc, changedCards)
  }
  const win = hostWindow()
  if (typeof win?.requestAnimationFrame === 'function') {
    densityFrame = win.requestAnimationFrame(run)
    return
  }
  densityFrame = 0
  if (typeof queueMicrotask === 'function') queueMicrotask(run)
  else run()
}

/** 撤销尚未执行的帧回调，并让已排队的微任务失效（代次自增）。 */
function cancelScheduledComposerDensity() {
  if (densityFrame === null) return
  const handle = densityFrame
  densityFrame = null
  densityFrameToken += 1
  if (typeof handle === 'number' && handle > 0) {
    const win = hostWindow()
    if (typeof win?.cancelAnimationFrame === 'function') {
      try { win.cancelAnimationFrame(handle) } catch { /* ignore */ }
    }
  }
}

/**
 * Start observing the composer width and keep `data-omnimux-composer-density`
 * fresh. A continuous MutationObserver re-binds whenever the card mounts, unmounts,
 * or gets re-created by React (Issue #2302). Returns a disposer.
 * @param {Document | undefined} [doc]
 * @returns {() => void}
 */
export function installComposerCompactObserver(doc = hostDocument()) {
  if (!doc) return () => {}
  if (observerDoc === doc && (composerResizeObserver || composerResizeListener || composerMountObserver)) {
    return uninstallComposerCompactObserver
  }
  uninstallComposerCompactObserver()
  observerDoc = doc

  const target = findComposerTarget(doc)
  if (target) {
    observeComposerTarget(doc, target)
  }
  observeComposerToolbars(doc)

  // 持续监听挂载变动：无论切换会话还是 React 重新渲染 Card，保持自愈重新绑定（Issue #2302）
  if (typeof MutationObserver !== 'undefined') {
    composerMountObserver = new MutationObserver(() => {
      observeComposerToolbars(doc)
      const next = findComposerTarget(doc)
      schedulePlaceMentionMenu(doc)
      if (next && (next !== observedTarget || !observedTarget?.isConnected)) {
        observeComposerTarget(doc, next)
        scheduleComposerDensity(doc)
      } else if (!next && observedTarget) {
        observeComposerTarget(doc, null)
        scheduleComposerDensity(doc)
      }
    })
    const root = doc.body || doc.documentElement
    if (root) composerMountObserver.observe(root, { childList: true, subtree: true })
  }

  // 视口 resize 监听常驻作为兜底保障（包括无 RO 环境或视口跳变）
  if (!composerResizeListener) {
    composerResizeListener = () => { scheduleComposerDensity(doc); schedulePlaceMentionMenu(doc) }
    const win = hostWindow()
    if (win?.addEventListener) {
      win.addEventListener('resize', composerResizeListener)
    }
  }

  applyComposerDensity(doc)
  schedulePlaceMentionMenu(doc)
  return uninstallComposerCompactObserver
}

const MENTION_UP_ATTR = 'data-omnimux-mention-up'
const MENTION_MENU_HEIGHT = 320

let placeMentionMenuRaf = null

/**
 * rAF 防抖节流调度 placeMentionMenu，避免高频 MutationObserver 导致持续卡顿
 * @param {Document | undefined} doc
 */
export function schedulePlaceMentionMenu(doc = hostDocument()) {
  if (placeMentionMenuRaf != null) return
  const win = hostWindow()
  const raf = (win && typeof win.requestAnimationFrame === 'function')
    ? win.requestAnimationFrame.bind(win)
    : (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16))
  placeMentionMenuRaf = raf(() => {
    placeMentionMenuRaf = null
    placeMentionMenu(doc)
  })
}

/**
 * 取消已调度的 placeMentionMenu
 */
export function cancelScheduledPlaceMentionMenu() {
  if (placeMentionMenuRaf == null) return
  const win = hostWindow()
  const cancel = (win && typeof win.cancelAnimationFrame === 'function')
    ? win.cancelAnimationFrame.bind(win)
    : (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout)
  cancel(placeMentionMenuRaf)
  placeMentionMenuRaf = null
}

/**
 * 校验并清洗缩略图 URL：
 * 严格白名单限制为 http:, https:, blob: 或合法的相对/绝对路径，
 * 彻底过滤换行符、控制字符、引号、括号、反斜杠等危险字符，杜绝 CSS 属性注入。
 * @param {unknown} rawUrl
 * @returns {string} 安全的 URL 字符串，校验失败返回空字符串
 */
export function sanitizeThumbnailUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return ''
  const trimmed = rawUrl.trim()
  if (!trimmed || trimmed.length > 2048) return ''

  // 严禁包含控制字符、换行符、引号、括号或反斜杠（避免跳出 url("...")）
  if (/[\x00-\x1f\x7f\r\n"'\\()]/.test(trimmed)) {
    return ''
  }

  // 严格协议与路径格式白名单
  // 若包含冒号，只允许 http:, https:, blob: 协议；其余（如 data:, javascript:, file: 等）一律拒绝
  if (trimmed.includes(':')) {
    if (/^https?:\/\/[^\s"'()<>]+$/i.test(trimmed)) {
      return trimmed
    }
    if (/^blob:[^\s"'()<>]+$/i.test(trimmed)) {
      return trimmed
    }
    return ''
  }

  // 不含冒号时：
  // 1. 绝对路径（以单个 / 开头，禁止 // 开头）
  if (/^\/[^/\s"'()<>][^\s"'()<>]*$/.test(trimmed)) {
    return trimmed
  }
  // 2. 相对路径（以 ./ 或 ../ 或 普通名称/路径 开头）
  if (/^(?:\.\.?\/|[a-zA-Z0-9_-])[^\s"'()<>]*$/.test(trimmed)) {
    return trimmed
  }

  return ''
}

/**
 * 输入框靠近页面顶部时，菜单从下方展开；否则从上方展开。
 * 素材行的缩略图地址写到行上，样式用它画在名称前面。
 * 严禁全局影响斜杠/模型/加号等非 @ 引用菜单。
 * @param {Document | undefined} doc
 */
export function placeMentionMenu(doc = hostDocument()) {
  if (!doc?.querySelectorAll) return
  const menus = doc.querySelectorAll('[data-trigger-menu]')
  if (!menus || menus.length === 0) return

  const materials = listSessionMaterials('')

  menus.forEach((menu) => {
    const card = menu.closest?.('[data-composer-card]')
    if (!card) return

    // 1. 严格限定仅对 @ 引用/素材菜单生效：
    // 仅依据强结构化特征判定（data-source="material"、id 匹配、data-material-id、data-value 结构），
    // 移除自引用检查与弱文本标题匹配，杜绝假阳性并确保容器复用时能正常清理专有标记
    const optionRows = typeof menu.querySelectorAll === 'function' ? Array.from(menu.querySelectorAll('[role="option"]')) : []
    const hasMaterialItems = Boolean(
      menu.getAttribute?.('data-source') === 'material' ||
      menu.querySelector?.('[data-source="material"]') ||
      menu.querySelector?.('[id^="dsh-slash-option-material-"]') ||
      menu.querySelector?.('[data-material-id]') ||
      optionRows.some((r) => {
        if (r.id && /^dsh-slash-option-material-/.test(r.id)) return true
        if (r.getAttribute?.('data-source') === 'material') return true
        if (r.getAttribute?.('data-material-id')) return true
        const val = r.getAttribute?.('data-value') || ''
        if (val.startsWith('material:')) return true
        return false
      })
    )

    if (!hasMaterialItems) {
      // 非素材引用菜单，移除专有标记并跳过，绝不修改其位置或样式
      menu.removeAttribute?.('data-omnimux-mention-menu')
      return
    }

    // 标记为专有 @ 引用菜单
    menu.setAttribute?.('data-omnimux-mention-menu', 'true')

    // 2. 测量菜单实际高度与坐标，自适应上下翻转
    const rect = typeof card.getBoundingClientRect === 'function' ? card.getBoundingClientRect() : null
    const top = rect && typeof rect.top === 'number' ? rect.top : 9999
    const menuHeight = menu.offsetHeight || MENTION_MENU_HEIGHT
    if (top < menuHeight + 8) {
      card.removeAttribute(MENTION_UP_ATTR)
    } else {
      card.setAttribute(MENTION_UP_ATTR, 'true')
    }

    // 3. 构建全量与基于当前输入过滤的素材映射（复用外层已获取的 materials）
    const materialsById = new Map()
    const materialsByTitle = new Map()
    for (const item of materials) {
      if (item.id) materialsById.set(item.id, item)
      if (item.title) {
        if (!materialsByTitle.has(item.title)) {
          materialsByTitle.set(item.title, [])
        }
        materialsByTitle.get(item.title).push(item)
      }
    }

    // 尝试从卡片输入框探测当前的 mention 搜索词（例如 @xxx）
    let currentCandidates = null
    const inputEl = card.querySelector?.('textarea, [contenteditable]')
    if (inputEl) {
      const text = inputEl.value ?? inputEl.textContent ?? ''
      const match = /(?:^|\s)@([^\s@]*)$/.exec(text)
      if (match) {
        const query = match[1] || ''
        try {
          currentCandidates = materialCandidates('', query)
        } catch { /* ignore */ }
      }
    }

    // 4. 遍历菜单行，通过稳定映射绑定缩略图，防止搜索过滤错位
    menu.querySelectorAll('[role="option"]').forEach((row) => {
      let matchedItem = null

      // A. 优先从行 DOM 属性提取稳定标识 (data-material-id / data-id / data-entity-id / data-value)
      const explicitId = row.getAttribute?.('data-material-id') || row.getAttribute?.('data-id')
      if (explicitId && materialsById.has(explicitId)) {
        matchedItem = materialsById.get(explicitId)
      }

      if (!matchedItem) {
        const val = row.getAttribute?.('data-value') || ''
        const parsed = parseMaterialMention(val)
        if (parsed?.id && materialsById.has(parsed.id)) {
          matchedItem = materialsById.get(parsed.id)
        }
      }

      const itemName = (row.querySelector?.('[class*="itemName"]')?.textContent || row.textContent || '').trim()

      // B. 尝试从经过滤的 candidates 中根据索引精确匹配（废弃全局 RegExp.$1）
      const m = row.id ? /^dsh-slash-option-material-(\d+)$/.exec(row.id) : null
      const idx = m ? parseInt(m[1], 10) : -1

      if (!matchedItem && idx >= 0 && currentCandidates && currentCandidates[idx]) {
        const cand = currentCandidates[idx]
        if (!itemName || cand.name === itemName) {
          const parsed = parseMaterialMention(cand.value)
          if (parsed?.id && materialsById.has(parsed.id)) {
            matchedItem = materialsById.get(parsed.id)
          }
        }
      }

      // C. 从行内展示的素材标题稳定映射（同名歧义时不随意挑选首项，避免错配）
      let titleAmbiguous = false
      if (!matchedItem && itemName && materialsByTitle.has(itemName)) {
        const list = materialsByTitle.get(itemName)
        if (list.length === 1) {
          matchedItem = list[0]
        } else if (list.length > 1) {
          // 存在同名歧义：尝试结合行内可能携带的扩展名/文本辅助确认
          const rowText = (row.textContent || '').toLowerCase()
          const matchedByExt = list.filter((item) => {
            const ext = (item.extension || '').toLowerCase().replace(/^\./, '')
            return ext && rowText.includes(ext)
          })
          if (matchedByExt.length === 1) {
            matchedItem = matchedByExt[0]
          } else {
            // 无法确定唯一性时，不随意挑选第一项，避免错配
            matchedItem = null
            titleAmbiguous = true
          }
        }
      }

      // D. 无过滤时的索引回退兜底（仅在行名称与全量项一致且无同名歧义时才允许采用，杜绝错配）
      if (!matchedItem && !titleAmbiguous && idx >= 0 && materials[idx]) {
        if (!itemName || materials[idx].title === itemName) {
          const titleMatches = materialsByTitle.get(materials[idx].title)
          if (!titleMatches || titleMatches.length === 1) {
            matchedItem = materials[idx]
          }
        }
      }

      const rawSrc = matchedItem?.previewUrl || ''
      const safeSrc = sanitizeThumbnailUrl(rawSrc)
      if (!safeSrc) {
        row.removeAttribute('data-omnimux-thumb')
        row.style?.removeProperty?.('--omnimux-thumb')
        return
      }

      row.setAttribute('data-omnimux-thumb', 'true')
      row.style?.setProperty?.('--omnimux-thumb', `url("${safeSrc}")`)
    })
  })
}

/** Tear down the observer (RO, fallback resize listener, mount watcher). */
export function uninstallComposerCompactObserver() {
  for (const [card, saved] of inlineCardOverrides) restoreInlineCard(card, saved)
  inlineCardOverrides.clear()
  for (const card of inlineDensityCards) card.removeAttribute(INLINE_DENSITY)
  inlineDensityCards.clear()
  cancelScheduledComposerDensity()
  cancelScheduledPlaceMentionMenu()
  if (composerResizeObserver) {
    try { composerResizeObserver.disconnect() } catch { /* ignore */ }
    composerResizeObserver = null
  }
  if (composerResizeListener) {
    const win = hostWindow()
    if (win?.removeEventListener) win.removeEventListener('resize', composerResizeListener)
    composerResizeListener = null
  }
  if (composerMountObserver) {
    try { composerMountObserver.disconnect() } catch { /* ignore */ }
    composerMountObserver = null
  }
  for (const entry of composerContentObservers.values()) {
    entry.observer?.disconnect()
    entry.resize?.disconnect()
  }
  composerContentObservers.clear()
  pendingInlineCards.clear()
  pendingAllCards = false
  observedTarget = null
  observerDoc = null
}

/** Test-only: drop state, the style tag, and the `<html>` density attr. */
export function resetComposerCompactForTests() {
  uninstallComposerCompactObserver()
  cancelScheduledComposerDensity()
  cancelScheduledPlaceMentionMenu()
  const doc = hostDocument()
  const root = doc?.documentElement
  if (root && typeof root.removeAttribute === 'function') {
    root.removeAttribute(COMPOSER_COMPACT_ATTR)
  }
  if (root?.style?.removeProperty) {
    try {
      root.style.removeProperty('--omnimux-composer-card-width')
      root.style.removeProperty('--omnimux-composer-card-offset')
    } catch { /* ignore */ }
  }
  const style = doc?.getElementById?.(COMPOSER_COMPACT_STYLE_ID)
  if (style && typeof style.remove === 'function') style.remove()
}
