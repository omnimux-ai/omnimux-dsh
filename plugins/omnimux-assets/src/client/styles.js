export const STYLES_ID = 'omnimux-assets-styles'

export const ASSETS_CSS = `
.omnimux-assets-stage {
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
.omnimux-assets-stage[data-visible="false"] {
  display: none !important;
  pointer-events: none;
}
.omnimux-assets-action-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 24px 12px;
}
.omnimux-assets-stage-toolbar {
  flex: none;
  padding: 0 24px;
  height: 48px;
}
.omnimux-assets-tools-cluster {
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-assets-search-wrap {
  width: 220px;
}
.omnimux-assets-sort-wrap {
  width: 120px;
}
.omnimux-assets-view-toggle {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
  background: var(--dsw-alias-bg-layer-1, transparent);
}
.omnimux-assets-list-wrap {
  width: 100%;
  overflow-x: auto;
}
.omnimux-assets-list-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.omnimux-assets-list-table th {
  text-align: left;
  padding: 8px 12px;
  color: var(--dsw-alias-label-tertiary);
  font-weight: 500;
  font-size: 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.omnimux-assets-th-check, .omnimux-assets-td-check { width: 40px; text-align: center; }
.omnimux-assets-th-name { min-width: 160px; }
.omnimux-assets-th-type, .omnimux-assets-td-type { width: 100px; }
.omnimux-assets-th-desc { min-width: 200px; }
.omnimux-assets-th-files, .omnimux-assets-td-files { width: 120px; }
.omnimux-assets-th-actions, .omnimux-assets-td-actions { width: 160px; text-align: right; }
.omnimux-assets-list-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.omnimux-assets-list-badge { position: static !important; }
.omnimux-assets-list-missing { position: static !important; margin-left: 6px; }
.omnimux-assets-td-desc {
  color: var(--dsw-alias-label-secondary);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-list-row {
  cursor: pointer;
  transition: background-color 0.12s ease;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.omnimux-assets-list-row:hover {
  background-color: var(--dsw-alias-interactive-bg-hover);
}
.omnimux-assets-list-row[aria-selected="true"] {
  background-color: var(--dsw-alias-bg-module-platform);
}
.omnimux-assets-list-row td {
  padding: 10px 12px;
  vertical-align: middle;
}
.omnimux-assets-list-cell-name {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
}
.omnimux-assets-selection {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 24px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.omnimux-assets-selection-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  align-items: center;
}
.omnimux-assets-error {
  margin: 0;
  padding: 6px 24px;
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary);
}
.omnimux-assets-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.omnimux-assets-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 16px 24px;
}
.omnimux-assets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.omnimux-assets-empty {
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
.omnimux-assets-empty p { margin: 0; }
.omnimux-assets-card {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  display: flex;
  flex-direction: column;
}
.omnimux-assets-card[aria-selected="true"] {
  border-color: var(--dsw-alias-label-primary);
}
.omnimux-assets-card-thumb {
  height: 136px;
  background: var(--dsw-alias-bg-module-platform);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
}
.omnimux-assets-card-thumb--tall { height: 148px; }
.omnimux-assets-card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, var(--dsw-alias-bg-mask-1) 0%, var(--dsw-alias-bg-mask-2) 100%);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  opacity: 0;
  display: flex;
  align-items: flex-end;
  padding: 10px;
  box-sizing: border-box;
  transition: opacity 0.2s ease;
  pointer-events: none;
  z-index: 2;
}
.omnimux-assets-card:hover .omnimux-assets-card-overlay,
.omnimux-assets-card:focus-within .omnimux-assets-card-overlay {
  opacity: 1;
  pointer-events: auto;
}
.omnimux-assets-card-overlay-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}
.omnimux-assets-overlay-btn {
  display: inline-flex;
  flex: 1 1 0;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 32px;
  padding: 0 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  box-sizing: border-box;
  outline: none;
  transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
  -webkit-app-region: no-drag;
}
.omnimux-assets-overlay-btn span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-overlay-btn svg {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
}
.omnimux-assets-overlay-btn--secondary {
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
}
.omnimux-assets-overlay-btn--secondary:hover {
  background: var(--dsw-alias-bg-mask-2);
}
.omnimux-assets-overlay-btn--primary {
  background: var(--dsw-alias-button-primary-fill);
  border: 1px solid transparent;
  color: var(--dsw-alias-label-primary-foreground);
}
.omnimux-assets-overlay-btn--primary:hover {
  background: var(--dsw-alias-button-primary-hover);
}
.omnimux-assets-overlay-btn:disabled,
.omnimux-assets-overlay-btn[aria-disabled="true"] {
  opacity: 0.85;
  cursor: default;
}
.omnimux-assets-card-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.omnimux-assets-card-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: var(--dsw-alias-bg-module-platform);
}
.omnimux-assets-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 11px;
  line-height: 16px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  border: 1px solid var(--dsw-alias-border-l2);
  z-index: 1;
}
.omnimux-assets-missing {
  position: absolute;
  bottom: 8px;
  left: 8px;
  font-size: 11px;
  color: var(--dsw-alias-state-warn-primary);
}
.omnimux-assets-card-body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 48px;
}
.omnimux-assets-card-title {
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-card-desc {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
.omnimux-assets-stage .omnimux-assets-card-thumb .omnimux-assets-check,
.omnimux-assets-stage .omnimux-assets-card-thumb .omnimux-assets-check:hover,
.omnimux-assets-stage .omnimux-assets-card-thumb .omnimux-assets-check:active {
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
  z-index: 3;
  opacity: 0;
  transform: none;
  transition: opacity 0.15s ease;
  border: 1px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  color: inherit;
}
.omnimux-assets-stage .omnimux-assets-card-thumb .omnimux-assets-check[data-selected="true"],
.omnimux-assets-stage .omnimux-assets-card-thumb .omnimux-assets-check[data-selected="true"]:hover {
  opacity: 1;
  border: none;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.omnimux-assets-focusable:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
  border-radius: 8px;
}
.omnimux-assets-focusable:hover { border-color: var(--dsw-alias-border-l4); }
.omnimux-assets-focusable:hover .omnimux-assets-check,
.omnimux-assets-focusable:focus-within .omnimux-assets-check { opacity: 1; }
.omnimux-assets-browse { display: flex; flex-direction: column; gap: 12px; min-height: 100%; }
.omnimux-assets-crumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  font-size: 13px;
}
.omnimux-assets-crumb {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.omnimux-assets-crumb-sep { color: var(--dsw-alias-label-tertiary); }
.omnimux-assets-muted {
  margin: 0;
  font-size: 13px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-assets-detail {
  flex: none;
  width: 320px;
  overflow: auto;
  border-left: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  display: flex;
  flex-direction: column;
}
.omnimux-assets-detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.omnimux-assets-detail-title {
  margin: 0;
  flex: 1;
  font-size: 13px;
  font-weight: 600;
}
.omnimux-assets-detail-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 13px;
}
.omnimux-assets-textarea {
  width: 100%;
  min-height: 96px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 6px 8px;
  resize: vertical;
  color: inherit;
  background: inherit;
  font: inherit;
  box-sizing: border-box;
}
.omnimux-assets-cite { font-size: 12px; }
.omnimux-assets-drop {
  width: 100%;
  min-height: 128px;
  border: 1px dashed var(--dsw-alias-border-l4);
  border-radius: 12px;
  background: transparent;
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
.omnimux-assets-drop-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.omnimux-assets-filelist {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.omnimux-assets-filelist li {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  align-items: center;
}
.omnimux-assets-filelist-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-folder-badge {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-assets-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.omnimux-assets-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.omnimux-assets-form { display: flex; flex-direction: column; gap: 12px; }
.omnimux-assets-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-assets-at {
  color: var(--dsw-alias-label-tertiary);
  font-size: 18px;
}
.omnimux-assets-name-field { flex: 1; min-width: 0; }
.omnimux-assets-type-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-assets-type-sep { color: var(--dsw-alias-border-l2); }
.omnimux-assets-desc-field { flex: 1; min-width: 0; }
/* ── 表单输入「双重边框」防御 ──
   dsh-ui-kit 的 InputField 由外层 .dshUk-InputField-control 绘制圆角边框，并用
   :focus-within 绘制聚焦环；内部原生 <input> 自身不应再出现任何边框或轮廓。
   AddAssetDialog 打开时用 useEffect 立即 focus 名称输入框，命中全局
   :focus-visible（带 !important），其权重高于 Kit 的 .input{outline:none}，
   于是外层圆角框内又多出一个直角 outline，形成「两个框」。
   此处用同等 !important + 更高选择器权重（.omnimux-assets-form input:focus-visible
   = 0,2,1 > :focus-visible = 0,1,0）做防御性重置，确保全局样式与浏览器默认样式都无法再叠加。 */
.omnimux-assets-form input:focus,
.omnimux-assets-form input:focus-visible,
.omnimux-assets-form textarea:focus,
.omnimux-assets-form textarea:focus-visible,
.omnimux-assets-form select:focus,
.omnimux-assets-form select:focus-visible {
  outline: none !important;
  outline-offset: 0 !important;
  box-shadow: none !important;
}
.omnimux-assets-form [class*="InputField-control"] input,
.omnimux-assets-form [class*="SearchField-root"] input {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}
.omnimux-assets-icon {
  flex: none;
  display: inline-block;
  vertical-align: middle;
}
.omnimux-assets-modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: omnimux-assets-fade-in 140ms ease;
}
@keyframes omnimux-assets-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes omnimux-assets-zoom-in {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
.omnimux-assets-modal-container {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 860px;
  max-height: 85vh;
  border-radius: 16px;
  overflow: hidden;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: 0 16px 48px var(--dsw-alias-bg-mask-1);
  animation: omnimux-assets-zoom-in 140ms ease;
}
.omnimux-assets-modal-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-base));
}
.omnimux-assets-modal-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.omnimux-assets-modal-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-modal-badge {
  font-size: 11px;
  line-height: 16px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base));
  border: 1px solid var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-secondary);
  font-weight: 500;
}
.omnimux-assets-modal-close {
  flex: none;
  width: 32px !important;
  height: 32px !important;
  border-radius: 50% !important;
  background: var(--dsw-alias-bg-layer-2) !important;
  border: 1px solid var(--dsw-alias-border-l1) !important;
  color: var(--dsw-alias-label-secondary) !important;
  display: flex !important;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, transform 120ms ease, border-color 140ms ease !important;
  box-shadow: 0 2px 8px var(--dsw-alias-bg-base);
}
.omnimux-assets-modal-close:hover {
  background: var(--dsw-alias-bg-layer-3) !important;
  color: var(--dsw-alias-label-primary) !important;
  border-color: var(--dsw-alias-border-l2) !important;
  transform: scale(1.08) !important;
}
.omnimux-assets-modal-close:active {
  transform: scale(0.96) !important;
}
.omnimux-assets-modal-body {
  flex: 1;
  min-height: 240px;
  max-height: calc(85vh - 120px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base));
  overflow: hidden;
  position: relative;
}
.omnimux-assets-modal-media-wrap {
  width: 100%;
  height: 100%;
  max-height: calc(85vh - 120px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}
.omnimux-assets-modal-image {
  max-width: 100%;
  max-height: calc(85vh - 152px);
  object-fit: contain;
  border-radius: 8px;
  display: block;
}
.omnimux-assets-modal-video {
  max-width: 100%;
  max-height: calc(85vh - 152px);
  border-radius: 8px;
  background: var(--dsw-alias-bg-module-platform);
  display: block;
}
/* A voice has no picture to zoom, so the preview gives it the widest player the
   dialog can hold without stretching the transport controls. */
.omnimux-assets-modal-audio {
  width: min(420px, 100%);
  border-radius: 8px;
  background: var(--dsw-alias-bg-module-platform);
}
/* A text asset is read, not zoomed: the body scrolls instead of the dialog. */
.omnimux-assets-modal-text-wrap {
  width: 100%;
  height: 100%;
  max-height: calc(85vh - 120px);
  overflow-y: auto;
  padding: 4px 20px 20px;
  box-sizing: border-box;
}
.omnimux-assets-modal-text {
  margin: 0;
  font-size: 13px;
  line-height: 21px;
  color: var(--dsw-alias-label-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}
.omnimux-assets-modal-unsupported {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 24px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-assets-modal-unsupported-icon {
  color: var(--dsw-alias-label-secondary);
}
.omnimux-assets-modal-unsupported-text {
  margin: 0;
  font-size: 14px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-assets-modal-unsupported-filename {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-assets-modal-footer {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 18px;
  border-top: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-base));
}
.omnimux-assets-modal-path {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-modal-path-label {
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-assets-modal-path-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-modal-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
/* The modal's half of the cloud -> local bridge. The scoped selector is what
   outranks the kit's own outline-button rule; 已收藏 then reads as a filled
   plate, so a reopened preview still shows the row as done. */
.omnimux-assets-modal-actions .omnimux-assets-modal-save[aria-pressed="true"] {
  background: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary-foreground);
}
.omnimux-assets-file-table, .omnimux-assets-artifact-table {
  width: 100%;
}
.omnimux-assets-th-file-name {
  width: 40%;
}
.omnimux-assets-th-artifact-name {
  width: 34%;
}
.omnimux-assets-clickable-row {
  cursor: pointer;
}
.omnimux-assets-cell-file-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
}
.omnimux-assets-cell-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-assets-cell-dir-arrow {
  display: inline-flex;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-assets-mapping-invalid {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-state-warn-primary);
}

/* ---- cloud assets -------------------------------------------------------
   The cloud tab reuses the local card. What it adds is the two-level
   navigation, a fixed tile ratio that stops the grid from reflowing as covers
   load, the scroll container, and the top-right control that mounts a card into
   the conversation. Colour stays neutral end to end: the selected chip is inked
   with the label colour — a white pill with black text on the dark theme, the
   reverse on the light one — never with a brand accent. */

.omnimux-assets-cloud {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  gap: 10px;
}
.omnimux-assets-cloud-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 0 0 auto;
}
.omnimux-assets-cloud-nav-row,
.omnimux-assets-cloud-subnav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.omnimux-assets-cloud-subnav {
  padding-inline-start: 10px;
  border-left: 2px solid var(--dsw-alias-border-l2);
}
/* Category chips, both levels. The nav wrappers are part of the selectors
   because the kit's own rules for this control reach (0,2,0) unselected and
   (0,4,0) on hover, so a bare class would lose to them. */
.omnimux-assets-cloud-nav .omnimux-assets-cloud-nav-row .omnimux-assets-cloud-chip,
.omnimux-assets-cloud-nav .omnimux-assets-cloud-subnav .omnimux-assets-cloud-chip {
  border-radius: 999px;
  padding: 0 12px;
}
/* Selected: a filled pill in the label colour, with the label inverted on top
   of it. No accent hue is involved, in either theme. */
.omnimux-assets-cloud-nav .omnimux-assets-cloud-nav-row .omnimux-assets-cloud-chip[aria-pressed="true"],
.omnimux-assets-cloud-nav .omnimux-assets-cloud-subnav .omnimux-assets-cloud-chip[aria-pressed="true"],
.omnimux-assets-cloud-nav .omnimux-assets-cloud-nav-row .omnimux-assets-cloud-chip[aria-pressed="true"]:hover:not(:disabled):not([aria-disabled="true"]),
.omnimux-assets-cloud-nav .omnimux-assets-cloud-subnav .omnimux-assets-cloud-chip[aria-pressed="true"]:hover:not(:disabled):not([aria-disabled="true"]),
.omnimux-assets-cloud-nav .omnimux-assets-cloud-nav-row .omnimux-assets-cloud-chip[aria-pressed="true"]:active:not(:disabled):not([aria-disabled="true"]),
.omnimux-assets-cloud-nav .omnimux-assets-cloud-subnav .omnimux-assets-cloud-chip[aria-pressed="true"]:active:not(:disabled):not([aria-disabled="true"]) {
  background: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-primary);
  box-shadow: none;
  color: var(--dsw-alias-label-primary-foreground);
}
/* On a filled chip the count has to invert with the label, or it lands as
   tertiary grey on white. */
.omnimux-assets-cloud-chip[aria-pressed="true"] .omnimux-assets-cloud-count {
  color: inherit;
  opacity: 0.55;
}
.omnimux-assets-cloud-count {
  margin-left: 6px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-assets-cloud-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
}
.omnimux-assets-cloud-grid {
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}
/* Fixed ratio per media type: the tile reserves its box before the image
   arrives, so paging never shifts the grid under the pointer. */
/* Every part of the card opens the preview, so the pointer says so. A voice
   card overrides this on its own thumbnail, which plays instead. */
.omnimux-assets-cloud-card {
  position: relative;
  cursor: pointer;
}
.omnimux-assets-cloud-card .omnimux-assets-cloud-thumb--action {
  cursor: pointer;
}
.omnimux-assets-cloud-thumb {
  height: auto;
}
.omnimux-assets-cloud-card[data-media-type="video"] .omnimux-assets-cloud-thumb,
.omnimux-assets-cloud-card[data-media-type="audio"] .omnimux-assets-cloud-thumb {
  aspect-ratio: 16 / 9;
}
.omnimux-assets-cloud-card[data-media-type="image"] .omnimux-assets-cloud-thumb,
.omnimux-assets-cloud-card[data-media-type="document"] .omnimux-assets-cloud-thumb,
.omnimux-assets-cloud-card[data-media-type="other"] .omnimux-assets-cloud-thumb {
  aspect-ratio: 4 / 3;
}
.omnimux-assets-cloud-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.18s ease;
  pointer-events: none;
}
.omnimux-assets-cloud-card:hover .omnimux-assets-cloud-preview,
.omnimux-assets-cloud-card:focus-within .omnimux-assets-cloud-preview {
  opacity: 1;
}
/* The play control is decoration: the whole thumbnail is the button, so the
   glyph inside it never takes a click of its own. */
.omnimux-assets-cloud-play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary-foreground);
  pointer-events: none;
}
/* Top-right hover controls: one mounts the asset into the conversation, the
   other copies it into the local library. Both are neutral plates that invert
   to ink under the pointer; neither carries a hue of its own. */
.omnimux-assets-cloud-card .omnimux-assets-cloud-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
}
.omnimux-assets-cloud-card .omnimux-assets-cloud-chat,
.omnimux-assets-cloud-card .omnimux-assets-cloud-save {
  border-radius: 8px;
  background: var(--dsw-alias-bg-elevated);
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
  opacity: 0;
}
.omnimux-assets-cloud-card:hover .omnimux-assets-cloud-chat,
.omnimux-assets-cloud-card:focus-within .omnimux-assets-cloud-chat,
.omnimux-assets-cloud-card:hover .omnimux-assets-cloud-save,
.omnimux-assets-cloud-card:focus-within .omnimux-assets-cloud-save {
  opacity: 1;
}
.omnimux-assets-cloud-card .omnimux-assets-cloud-chat:hover:not(:disabled):not([aria-disabled="true"]),
.omnimux-assets-cloud-card .omnimux-assets-cloud-save:hover:not(:disabled):not([aria-disabled="true"]) {
  background: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary-foreground);
}
/* Saved is a state, not a hover: the inked plate and its check stay on screen
   after the pointer leaves, so the card still reports 已收藏 at rest. */
.omnimux-assets-cloud-card .omnimux-assets-cloud-save[aria-pressed="true"] {
  opacity: 1;
  background: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary-foreground);
}
.omnimux-assets-cloud-desc {
  margin: 0;
  font-size: 12px;
  line-height: 17px;
  color: var(--dsw-alias-label-tertiary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.omnimux-assets-cloud-sentinel {
  height: 1px;
}
.omnimux-assets-cloud-more {
  display: flex;
  justify-content: center;
  padding: 14px 0 4px;
}
.omnimux-assets-cloud-end {
  margin: 0;
  padding: 14px 0 6px;
  text-align: center;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-assets-cloud-notice {
  margin: 0;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}

`

export function injectAssetsStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLES_ID)) return
  const styleNode = document.createElement('style')
  styleNode.id = STYLES_ID
  styleNode.textContent = ASSETS_CSS
  document.head.appendChild(styleNode)
}
