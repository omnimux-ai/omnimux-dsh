export const STYLES_ID = 'omnimux-clip-stage-styles'

export const CLIP_CSS = `
.omnimux-clip-stage {
  position: fixed;
  z-index: 250;
  top: var(--stage-top, 0px);
  left: var(--stage-left, 56px);
  width: var(--stage-width, calc(100vw - 56px));
  height: var(--stage-height, 100vh);
  min-width: 320px;
  min-height: 240px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, #111113);
  color: var(--dsw-alias-label-primary, #ffffff);
  overflow: hidden;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  isolation: isolate;
  contain: layout paint;
}
.omnimux-clip-stage[data-visible="false"] {
  display: none !important;
  pointer-events: none !important;
}
.omnimux-clip-stage[data-clip-mode="canvas"] {
  position: absolute;
  inset: 0;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  z-index: 20;
}
.omnimux-clip-stage[data-clip-mode="canvas"][data-visible="true"] {
  display: flex !important;
  pointer-events: auto !important;
}
html:not([data-dsh-product-stage]) .omnimux-clip-stage[data-clip-mode="canvas"][data-visible="true"] {
  display: flex !important;
  pointer-events: auto !important;
}
/* exempt-ui08: embedded editor return row, not a first-level page header.
   Keep it outside OpenReel's header: Electron marks that underlying header as
   a native drag region, which can swallow clicks on an overlapping sibling. */
.omnimux-clip-stage[data-clip-mode="canvas"] .omnimux-clip-stage-heading { /* exempt-ui08: 画布内浮层操作区标题，非页面标题栏 */
  display: none !important;
}
.omnimux-clip-stage[data-clip-mode="canvas"] [data-toolbar-section="left"],
.omnimux-clip-stage[data-clip-mode="canvas"] .openreel-toolbar-left {
  display: none !important;
}
.omnimux-clip-stage[data-clip-mode="canvas"] [data-toolbar-section="center"],
.omnimux-clip-stage[data-clip-mode="canvas"] .openreel-toolbar-center {
  display: none !important;
}
.omnimux-clip-stage[data-clip-mode="canvas"] [data-toolbar-section="right"],
.omnimux-clip-stage[data-clip-mode="canvas"] .openreel-toolbar-right {
  margin-left: auto !important;
}
/* canvas 模式下隐藏媒体素材卡片上的生成 (KieAI/Sparkles) 图标按钮 */
.omnimux-clip-stage[data-clip-mode="canvas"] [data-action="kieai"],
.omnimux-clip-stage[data-clip-mode="canvas"] .openreel-media-kieai-btn {
  display: none !important;
}
.omnimux-clip-stage[data-clip-mode="standalone"] [data-toolbar-section="left"]:where(:not([data-toolbar-responsive="true"])),
.omnimux-clip-stage[data-clip-mode="standalone"] .openreel-toolbar-left:where(:not([data-toolbar-responsive="true"])) {
  display: flex !important;
}
.omnimux-clip-stage[data-clip-mode="standalone"] [data-toolbar-section="center"]:where(:not([data-toolbar-responsive="true"])),
.omnimux-clip-stage[data-clip-mode="standalone"] .openreel-toolbar-center:where(:not([data-toolbar-responsive="true"])) {
  display: flex !important;
}
.omnimux-clip-stage[data-clip-mode="standalone"] [data-toolbar-section="right"]:where(:not([data-toolbar-responsive="true"])),
.omnimux-clip-stage[data-clip-mode="standalone"] .openreel-toolbar-right:where(:not([data-toolbar-responsive="true"])) {
  display: flex !important;
}
@media (min-width: 1024px) {
  .omnimux-clip-stage[data-clip-mode="standalone"] [data-toolbar-section="center"][data-toolbar-responsive="true"],
  .omnimux-clip-stage[data-clip-mode="standalone"] .openreel-toolbar-center[data-toolbar-responsive="true"] {
    display: flex !important;
  }
}
.omnimux-clip-stage-header, /* exempt-ui08: 画布内浮层操作区，非页面标题栏 */
.omnimux-clip-stage[data-clip-mode="standalone"] .omnimux-clip-stage-header, /* exempt-ui08: 同上 */
.omnimux-clip-stage[data-clip-mode="canvas"] .omnimux-clip-stage-header { /* exempt-ui08: 同上 */
  position: relative;
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  z-index: 40;
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  border: none;
  background: transparent;
  pointer-events: none;
  -webkit-app-region: no-drag;
}
.omnimux-clip-stage-heading, /* exempt-ui08: 画布内浮层操作区标题，非页面标题栏 */
.omnimux-clip-stage-icon-btn,
.omnimux-clip-stage-save-btn,
.omnimux-clip-stage-save-status,
.omnimux-clip-stage[data-clip-mode="standalone"] .omnimux-clip-stage-heading, /* exempt-ui08: 同上 */
.omnimux-clip-stage[data-clip-mode="standalone"] .omnimux-clip-stage-icon-btn,
.omnimux-clip-stage[data-clip-mode="standalone"] .omnimux-clip-stage-save-btn,
.omnimux-clip-stage[data-clip-mode="standalone"] .omnimux-clip-stage-save-status {
  display: none !important;
}
.omnimux-clip-stage-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.omnimux-clip-stage-actions,
.omnimux-clip-stage[data-clip-mode="standalone"] .omnimux-clip-stage-actions {
  pointer-events: auto;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
}
.omnimux-clip-stage-close-btn,
.omnimux-clip-stage[data-clip-mode="standalone"] .omnimux-clip-stage-close-btn {
  min-width: 32px;
  height: 32px;
  padding: 0 12px;
  gap: 6px;
  white-space: nowrap;
  font-size: 13px;
  -webkit-app-region: no-drag;
  border-radius: 8px;
  background: var(--dsw-alias-bg-elevated, rgba(22, 22, 24, 0.92));
  border: 1px solid var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.16));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.7));
  cursor: pointer;
  transition: color 150ms ease, background-color 150ms ease, border-color 150ms ease;
}
.omnimux-clip-stage-close-btn:hover,
.omnimux-clip-stage[data-clip-mode="standalone"] .omnimux-clip-stage-close-btn:hover {
  color: var(--dsw-alias-label-primary, #ffffff);
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.1));
  border-color: var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.25));
}
.omnimux-clip-stage-save-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  box-sizing: border-box;
  cursor: pointer;
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
  color: var(--dsw-alias-label-primary, #ffffff);
  transition: background-color 150ms ease, border-color 150ms ease, opacity 150ms ease;
  user-select: none;
}
.omnimux-clip-stage-save-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.1));
  border-color: var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.22));
}
.omnimux-clip-stage-save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.omnimux-clip-stage-close-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.65));
  cursor: pointer;
  transition: color 150ms ease, background-color 150ms ease;
}
.omnimux-clip-stage-close-btn:hover {
  color: var(--dsw-alias-label-primary, #ffffff);
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
}
`

export function injectClipStyles() {
  if (typeof document === 'undefined') return
  let style = document.getElementById(STYLES_ID)
  if (!(style instanceof HTMLStyleElement)) {
    style = document.createElement('style')
    style.id = STYLES_ID
    document.head.appendChild(style)
  }
  style.textContent = CLIP_CSS
}
