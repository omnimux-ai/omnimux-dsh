import { RIVAL_COLLECTION_MEDIA_RATIO, RIVAL_COLLECTION_TITLE_HEIGHT } from './rival-masonry.js'

const COLLECTION_STYLES_ID = 'omnimux-inspiration-collection-styles'

export const COLLECTION_CSS = `
.omnimux-inspiration-collection-surface { position: relative; }
/* 合集详情页头（Issue 3459）：吸附在一级工具栏（含二级筛选行）下方。
   z-index 低于 .omx-stage-sticky 的 20，滚动时内容从页头底下穿过。 */
.omnimux-inspiration-collection-navigation {
  position: sticky;
  top: var(--stage-sticky-offset, 44px);
  z-index: 19;
  padding: 12px 0;
  background: var(--dsw-alias-bg-base);
}
.omnimux-inspiration-collection-navigation,
.omnimux-inspiration-collection-selection {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
/* 页头标题与合并选择条的文案共用一个几何规则，但字阶各自独立：
   页头是 16/22 标题，选择条仍是 14/20 的正文（Issue 3459）。 */
.omnimux-inspiration-collection-heading,
.omnimux-inspiration-collection-selection > span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 20px;
}
.omnimux-inspiration-collection-heading {
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
}
.omnimux-inspiration-collection-navigation .omnimux-inspiration-collection-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  margin-left: auto;
}
.omnimux-inspiration-collection-selection {
  padding: 6px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.omnimux-inspiration-collection-menu {
  position: absolute;
  right: 5px;
  bottom: 5px;
  z-index: 8;
}
/* 媒体库卡片：菜单移到封面右上，避开标题与元信息行（Issue 3459 / 3477）。 */
.omnimux-inspiration-card-pure.is-library:not(.t-text) .omnimux-inspiration-collection-menu {
  top: 8px;
  right: 8px;
  bottom: auto;
}
.omnimux-inspiration-collection-menu > div { display: flex; }
.omnimux-inspiration-toast.has-action { pointer-events: auto; }
[data-collection-dragging="true"] { opacity: 0.4; }
[data-collection-drop] { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
[data-collection-drop]::after {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-mask-1);
  color: var(--dsw-specific-media-fg);
  pointer-events: none;
  border-radius: inherit;
  font-size: 13px;
  line-height: 18px;
}
[data-collection-drop="create"]::after { content: attr(data-collection-drop-label); }
[data-collection-drop="add"]::after { content: attr(data-collection-drop-label); }
.omnimux-inspiration-collection-drag-ghost {
  position: fixed;
  left: var(--collection-drag-x);
  top: var(--collection-drag-y);
  width: 104px;
  z-index: 110;
  pointer-events: none;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-elevated);
  color: var(--dsw-alias-label-primary);
}
.omnimux-inspiration-collection-drag-ghost img { width: 100%; height: 76px; object-fit: cover; display: block; }
.omnimux-inspiration-collection-drag-ghost span { display: block; padding: 6px 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 16px; }
.omnimux-rival-card.omnimux-inspiration-collection-card {
  box-sizing: border-box;
  min-height: 0;
}
.omnimux-inspiration-collection-card.is-preview {
  position: relative;
  left: auto;
  top: auto;
  width: 100%;
  cursor: default;
}
.omnimux-inspiration-collection-card .omnimux-inspiration-collection-cover {
  position: relative;
  display: flex;
  width: 100%;
  aspect-ratio: ${RIVAL_COLLECTION_MEDIA_RATIO};
  gap: 3px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
}
.omnimux-inspiration-collection-actions {
  position: absolute;
  inset: auto 0 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-sizing: border-box;
  padding: 28px 12px 8px;
  background: var(--dsw-specific-media-overlay);
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px);
  transition: opacity 140ms ease, transform 140ms ease;
}
.omnimux-inspiration-collection-card:hover .omnimux-inspiration-collection-actions,
.omnimux-inspiration-collection-card:focus-within .omnimux-inspiration-collection-actions {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
@media (hover: none) {
  .omnimux-inspiration-collection-card .omnimux-inspiration-collection-actions {
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .omnimux-inspiration-collection-actions {
    transition: none;
  }
}
/* 操作层与普通灵感卡的悬停 CTA 共用同一套按钮样式
   （.omnimux-inspiration-overlay-cta*：同高、同圆角、同图标尺寸、
   secondary/primary 表面）。这里只负责操作层的出现/隐藏与底部过渡，
   不再定义第二套按钮外观。按钮类名不得包含会被其它插件全局选择器命中的
   子串（例如 omnimux-market 的 button[class*="add"] 会把加号类按钮
   强制成透明窄条）。 */
.omnimux-inspiration-collection-card .omnimux-inspiration-collection-actions .omnimux-inspiration-overlay-cta {
  margin-bottom: 0;
  pointer-events: none;
}
.omnimux-inspiration-collection-card:hover .omnimux-inspiration-collection-actions .omnimux-inspiration-overlay-cta,
.omnimux-inspiration-collection-card:focus-within .omnimux-inspiration-collection-actions .omnimux-inspiration-overlay-cta {
  pointer-events: auto;
}
@media (hover: none) {
  .omnimux-inspiration-collection-card .omnimux-inspiration-collection-actions .omnimux-inspiration-overlay-cta {
    pointer-events: auto;
  }
}
/* 共享 CTA 的几何/字阶/等宽保持不变；合集操作层位于封面媒体之上，颜色
   继续走媒体暗房 token，保证浅色与深色主题、任意封面上文字对比度 ≥4.5:1
   （深色主题下与普通卡 CTA 观感一致；浅色主题下不会出现深字叠深封面）。 */
.omnimux-inspiration-collection-card .omnimux-inspiration-collection-actions .omnimux-inspiration-overlay-cta-btn.secondary {
  background: var(--dsw-specific-media-badge-bg-strong);
  border-color: var(--dsw-specific-media-border-strong);
  color: var(--dsw-specific-media-fg);
}
.omnimux-inspiration-collection-card .omnimux-inspiration-collection-actions .omnimux-inspiration-overlay-cta-btn.secondary:hover:not(:disabled) {
  background: var(--dsw-specific-media-pill-bg);
  border-color: var(--dsw-specific-media-fg-dimmed);
}
.omnimux-inspiration-collection-card .omnimux-inspiration-collection-actions .omnimux-inspiration-overlay-cta-btn.primary {
  background: var(--dsw-specific-media-fg);
  border-color: var(--dsw-specific-media-fg);
  color: var(--dsw-specific-media-ink);
}
.omnimux-inspiration-collection-card .omnimux-inspiration-collection-actions .omnimux-inspiration-overlay-cta-btn.primary:hover:not(:disabled) {
  background: var(--dsw-specific-media-fg-strong);
  border-color: var(--dsw-specific-media-fg-strong);
  color: var(--dsw-specific-media-ink);
}
.omnimux-inspiration-collection-column {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
}
.omnimux-inspiration-collection-column img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 35%;
}
.omnimux-inspiration-collection-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-bg-layer-2);
}
.omnimux-inspiration-collection-more-count {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-specific-media-fg);
  background: var(--dsw-specific-media-pill-bg);
  font-size: 24px;
  line-height: 28px;
  font-weight: 500;
}
.omnimux-inspiration-collection-title {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  min-width: 0;
  height: ${RIVAL_COLLECTION_TITLE_HEIGHT}px;
  padding: 0 42px 0 11px;
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.omnimux-inspiration-collection-title > svg {
  flex-shrink: 0;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-inspiration-collection-title > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.is-preview .omnimux-inspiration-collection-title {
  padding-right: 11px;
}
.omnimux-inspiration-collection-card .omnimux-inspiration-collection-menu {
  position: absolute;
  right: 5px;
  bottom: 5px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
}
.omnimux-inspiration-collection-dialog {
  border-radius: 16px;
}
.omnimux-inspiration-collection-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.omnimux-inspiration-collection-dialog-preview {
  width: 232px;
  max-width: 100%;
  margin: 0 auto;
}
.omnimux-inspiration-collection-name-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.omnimux-inspiration-collection-name-count {
  color: var(--dsw-alias-label-secondary);
  font-weight: 400;
}
.omnimux-inspiration-collection-dialog-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}
.omnimux-inspiration-collection-dialog-error {
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
}
`

export function injectCollectionStyles() {
  if (typeof document === 'undefined' || document.getElementById(COLLECTION_STYLES_ID)) return
  const node = document.createElement('style')
  node.id = COLLECTION_STYLES_ID
  node.textContent = COLLECTION_CSS
  document.head.appendChild(node)
}
