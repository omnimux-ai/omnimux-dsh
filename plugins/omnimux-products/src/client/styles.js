export const STYLES_ID = 'omnimux-products-styles'

export const PRODUCTS_CSS = `

/* ── 一级视图（列表）：常驻挂载，关页与切子屏都保活滚动与筛选 ───────────── */
.omnimux-products-stage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  color: var(--dsw-alias-label-primary, inherit);
  overflow: hidden;
  pointer-events: auto;
}
.omnimux-products-stage[data-visible="false"] {
  display: none !important;
  pointer-events: none;
}
.omnimux-products-list-view {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Link import bar: one quiet row above the product name.
   The row reuses the kit's InputField / Button as-is — the bar owns only the
   row layout and the status line, so the field frame (32px / 8px radius /
   bg-layer-1 / border-l2 / focus ring) is identical to every other field. */
.omnimux-products-url-import-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.omnimux-products-url-import-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-products-url-import-field {
  flex: 1;
  min-width: 0;
}
.omnimux-products-url-import-status {
  margin: 0;
  padding-left: 2px;
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
  animation: omnimux-products-fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.omnimux-products-url-import-status-success {
  color: var(--dsw-alias-state-success-primary);
}
.omnimux-products-url-import-status-error {
  color: var(--dsw-alias-state-error-primary);
}

/* Layer 2: Action Row */
.omnimux-products-action-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px 12px;
}

/* 新建分流菜单：触发器与浮层同属一个容器，指针从按钮挪进浮层不会触发收起。
   浮层的抬升只靠描边与层级底色表达，不引入任何自造阴影或颜色。 */
.omnimux-products-create-menu {
  position: relative;
  display: inline-flex;
  flex: none;
}
.omnimux-products-menu-card {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 40;
  min-width: 320px;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  animation: omnimux-products-fade-in 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.omnimux-products-menu-item {
  width: 100%;
  height: auto;
  padding: 8px 10px;
  justify-content: flex-start;
  gap: 10px;
  border-radius: 8px;
  text-align: left;
  white-space: normal;
}
.omnimux-products-menu-item > span {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.omnimux-products-menu-item-icon {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}
.omnimux-products-menu-item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.omnimux-products-menu-item-title {
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.omnimux-products-menu-item-desc {
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  white-space: normal;
}
.omnimux-products-stage-toolbar {
  flex: none;
  padding: 0 20px 12px;
  height: 44px;
}
.omnimux-products-selection {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.omnimux-products-selection-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  align-items: center;
}
.omnimux-products-error {
  margin: 0;
  padding: 6px 20px;
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary);
}
.omnimux-products-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}
.omnimux-products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.omnimux-products-empty {
  border: 1px dashed var(--dsw-alias-border-l4);
  border-radius: 12px;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
}
.omnimux-products-empty p { margin: 0; }
.omnimux-products-card {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  display: flex;
  flex-direction: column;
}
.omnimux-products-card[aria-selected="true"] {
  border-color: var(--dsw-alias-label-primary);
}
.omnimux-products-card-thumb {
  height: 112px;
  background: var(--dsw-alias-bg-module-platform);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
}
.omnimux-products-card-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
  position: absolute;
  inset: 0;
}
.omnimux-products-card-media[data-broken="true"] { display: none; }
.omnimux-products-glyph {
  font-size: 28px;
  font-weight: 600;
  line-height: 1;
}
.omnimux-products-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 11px;
  line-height: 16px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  z-index: 1;
}
.omnimux-products-card-body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.omnimux-products-card-title {
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-products-card-desc {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-products-stage .omnimux-products-card-thumb .omnimux-products-check,
.omnimux-products-stage .omnimux-products-card-thumb .omnimux-products-check:hover,
.omnimux-products-stage .omnimux-products-card-thumb .omnimux-products-check:active {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 22px;
  min-width: 22px;
  height: 22px;
  min-height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  z-index: 1;
  opacity: 0;
  transform: none;
  transition: opacity 0.15s ease;
  border: 1px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  color: inherit;
}
.omnimux-products-stage .omnimux-products-card-thumb .omnimux-products-check[data-selected="true"],
.omnimux-products-stage .omnimux-products-card-thumb .omnimux-products-check[data-selected="true"]:hover {
  opacity: 1;
  border: none;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.omnimux-products-icon {
  flex: none;
  display: inline-block;
  vertical-align: middle;
}
.omnimux-products-focusable:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
  border-radius: 8px;
}
.omnimux-products-focusable:hover { border-color: var(--dsw-alias-border-l4); }
.omnimux-products-focusable:hover .omnimux-products-check,
.omnimux-products-focusable:focus-within .omnimux-products-check { opacity: 1; }

/* ── 二级全屏子屏：同 Tab 内覆盖列表，无模态遮罩 ─────────────────────────── */
.omnimux-products-subscreen {
  position: absolute;
  inset: 0;
  z-index: 300;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  color: var(--dsw-alias-label-primary, inherit);
  pointer-events: auto;
  -webkit-app-region: no-drag;
  animation: omnimux-products-fade-in 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.omnimux-products-form-view {
  overflow: hidden;
}
.omnimux-products-form-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px;
}
.omnimux-products-back-path {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.omnimux-products-back-sep {
  color: var(--dsw-alias-label-dimmed);
  font-size: 12px;
}
.omnimux-products-back-current {
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 26ch;
}
.omnimux-products-dirty-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary, var(--dsw-alias-button-primary-fill));
  flex: none;
  align-self: center;
}

/* 双栏：容器查询折叠成单栏，两栏常驻 React 树、不重挂载 */
/* 容器查询的容器必须是「被查询元素的祖先」：把它放在表单根上，双栏这一层才是
   可折叠的查询目标。同一元素既做容器又做查询目标永远不会命中。 */
.omnimux-products-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  container-type: inline-size;
}
.omnimux-products-form-columns {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.omnimux-products-form-col-left,
.omnimux-products-form-col-right {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}
@container (min-width: 900px) {
  .omnimux-products-form-columns {
    flex-direction: row;
    align-items: flex-start;
  }
  .omnimux-products-form-col-left { flex: 1.15; }
  .omnimux-products-form-col-right { flex: 1; max-width: 520px; }
}

/* 常驻底部动作条：内容区滚动到任何位置都可见 */
.omnimux-products-form-footer {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
}
.omnimux-products-form-footer-hint {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-products-form-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-products-unsaved-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}

/* 表单分区 */
.omnimux-products-form-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.omnimux-products-form-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.omnimux-products-form-section-heading { min-width: 0; }
.omnimux-products-form-section-title {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.omnimux-products-form-section-desc {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-products-form-section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-products-form-section-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

/* 双端首屏截图卡片 */
.omnimux-products-shot-grid { width: 100%; }
.omnimux-products-shot-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.omnimux-products-shot-cell.is-missing {
  justify-content: center;
  border: 1px dashed var(--dsw-alias-border-l4);
  border-radius: 8px;
  padding: 12px;
  min-height: 120px;
}
.omnimux-products-shot-card { cursor: pointer; }
.omnimux-products-shot-hint {
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}

.omnimux-products-name-row { display: flex; align-items: center; gap: 8px; }
.omnimux-products-at { color: var(--dsw-alias-label-tertiary); font-size: 18px; }
.omnimux-products-name-field { flex: 1; min-width: 0; }
.omnimux-products-grid-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.omnimux-products-span2 { grid-column: 1 / -1; }
.omnimux-products-textarea {
  width: 100%;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  color: inherit;
  background: transparent;
  box-sizing: border-box;
  resize: vertical;
  font: inherit;
}
.omnimux-products-strategy {
  border-top: 1px solid var(--dsw-alias-border-l2);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.omnimux-products-strategy-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.omnimux-products-strategy-title { font-size: 13px; font-weight: 500; }
.omnimux-products-strategy-hint {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  margin-top: 2px;
}
.omnimux-products-drop {
  width: 100%;
  min-height: 96px;
  border: 1px dashed var(--dsw-alias-border-l4);
  border-radius: 12px;
  color: var(--dsw-alias-label-tertiary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 13px;
  padding: 16px;
  box-sizing: border-box;
}
.omnimux-products-filelist {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.omnimux-products-filelist li {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  align-items: center;
}
/* The row currently serving as the cover: a left rule plus a surface tint. */
.omnimux-products-filelist-row {
  padding: 2px 4px;
  border-radius: 6px;
  border-left: 2px solid transparent;
}
.omnimux-products-filelist-row.is-cover {
  background: var(--dsw-alias-bg-module-platform);
  border-left-color: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary);
}
.omnimux-products-cover-badge {
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.omnimux-products-media-thumb {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--dsw-alias-bg-module-platform);
}
.omnimux-products-filelist-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-products-categories { display: flex; flex-direction: column; gap: 8px; }
.omnimux-products-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.omnimux-products-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.omnimux-products-tag-remove { flex: none; }
.omnimux-products-section { display: flex; flex-direction: column; gap: 8px; }
.omnimux-products-section-title { font-size: 13px; font-weight: 500; }
.omnimux-products-section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.omnimux-products-seg-row {
  display: grid;
  grid-template-columns: 1fr 96px 28px;
  gap: 6px;
}
.omnimux-products-comp-row {
  display: grid;
  grid-template-columns: 1fr 1fr 28px;
  gap: 6px;
}
.omnimux-products-label {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  margin: 0;
}

/* Strategy fields: one persistent label per control.
   The metrics mirror the kit InputField label (12px / 16px / 500 /
   label-secondary) so a kit field and a plugin textarea read identically. */
.omnimux-products-field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.omnimux-products-field-control {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.omnimux-products-field-label {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-products-field-label-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
/* The inline "one per line" hint, e.g. 产品供给 · 每行一项. The separator is
   decoration, so it stays out of the text a screen reader announces. */
.omnimux-products-field-tag {
  flex: none;
  font-size: 12px;
  line-height: 16px;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-products-field-tag::before {
  content: '·';
  margin-right: 4px;
  color: var(--dsw-alias-label-dimmed);
}

/* One angle, one card: a bounded surface with its own header, so the angle
   boundaries stay readable at a glance. */
.omnimux-products-angle-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.omnimux-products-angle-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.omnimux-products-angle-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-products-angle-index {
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-products-angle-priority {
  flex: none;
}
.omnimux-products-angle-remove {
  margin-left: auto;
}

@keyframes omnimux-products-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
`

export function injectProductsStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLES_ID)) return
  const styleNode = document.createElement('style')
  styleNode.id = STYLES_ID
  styleNode.textContent = PRODUCTS_CSS
  document.head.appendChild(styleNode)
}
