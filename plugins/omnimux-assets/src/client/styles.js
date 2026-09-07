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
  padding: 8px 20px 12px;
}
.omnimux-assets-stage-toolbar {
  flex: none;
  padding: 0 20px 12px;
  height: 44px;
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
  padding: 8px 20px;
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
  padding: 6px 20px;
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
  padding: 16px;
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
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.7) 100%);
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
  background: rgba(20, 20, 20, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #ffffff;
}
.omnimux-assets-overlay-btn--secondary:hover {
  background: rgba(40, 40, 40, 0.85);
  border-color: rgba(255, 255, 255, 0.3);
}
.omnimux-assets-overlay-btn--primary {
  background: var(--dsw-accent-primary, #7c3aed);
  border: 1px solid transparent;
  color: #ffffff;
}
.omnimux-assets-overlay-btn--primary:hover {
  background: #6d28d9;
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
.omnimux-assets-icon {
  flex: none;
  display: inline-block;
  vertical-align: middle;
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
