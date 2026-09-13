export const STYLES_ID = 'omnimux-products-styles'

export const PRODUCTS_CSS = `

/* Link import bar: one quiet row above the product name. */
.omnimux-products-url-import {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-module-platform);
  transition: border-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.omnimux-products-url-import:focus-within {
  border-color: var(--dsw-alias-border-l4);
}
.omnimux-products-url-import[data-phase="success"] {
  border-color: var(--dsw-alias-state-success-primary);
}
.omnimux-products-url-import[data-phase="error"] {
  border-color: var(--dsw-alias-state-error-secondary, var(--dsw-alias-state-error-primary));
}
.omnimux-products-url-import-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-products-url-import-icon {
  display: inline-flex;
  align-items: center;
  color: var(--dsw-alias-label-tertiary);
}
/* The bar above already draws the only visible frame: every state of the inner
   field flattens its own border/outline/shadow so no second box can appear
   inside the rounded bar, whatever global input styling the host injects. */
.omnimux-products-url-import-input,
.omnimux-products-url-import-input:focus,
.omnimux-products-url-import-input:focus-visible,
.omnimux-products-url-import-input:active {
  flex: 1;
  min-width: 0;
  height: 26px;
  border: 0 !important;
  border-width: 0 !important;
  border-style: none !important;
  border-color: transparent !important;
  outline: 0 !important;
  outline-style: none !important;
  box-shadow: none !important;
  -webkit-box-shadow: none !important;
  -webkit-appearance: none !important;
  appearance: none !important;
  background: transparent !important;
  background-color: transparent !important;
  color: inherit;
  font: inherit;
  font-size: 13px;
  padding: 0 4px;
}
.omnimux-products-url-import-input::placeholder {
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-products-url-import-input:disabled {
  opacity: 0.6;
}
.omnimux-products-url-import-status {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
  animation: omnimux-products-fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.omnimux-products-url-import[data-phase="success"] .omnimux-products-url-import-status {
  color: var(--dsw-alias-state-success-primary);
}
.omnimux-products-url-import[data-phase="error"] .omnimux-products-url-import-status {
  color: var(--dsw-alias-state-error-primary);
}

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
/* Layer 2: Action Row */
.omnimux-products-action-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px 12px;
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
.omnimux-products-form { display: flex; flex-direction: column; gap: 12px; }
.omnimux-products-name-row { display: flex; align-items: center; gap: 8px; }
.omnimux-products-at { color: var(--dsw-alias-label-tertiary); font-size: 18px; }
.omnimux-products-name-field { flex: 1; min-width: 0; }
.omnimux-products-dirty {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 18px;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.omnimux-products-dirty-text { flex: 1; min-width: 160px; }
.omnimux-products-kind-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.omnimux-products-kind-label {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-products-kind-chip[aria-pressed="true"] {
  background: var(--dsw-alias-bg-module-platform);
}
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
.omnimux-products-filelist-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-products-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.omnimux-products-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.omnimux-products-section { display: flex; flex-direction: column; gap: 8px; }
.omnimux-products-section-title { font-size: 13px; font-weight: 500; }
.omnimux-products-section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.omnimux-products-angle-row,
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

/* Self-drawn product form modal (outside-corner close, kit controls only) */
.omnimux-products-modal-backdrop,
.omnimux-products-modal-backdrop * {
  box-sizing: border-box;
}
.omnimux-products-modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.70));
  backdrop-filter: blur(16px);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: omnimux-products-fade-in 120ms ease;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}
@keyframes omnimux-products-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.omnimux-products-modal-wrapper {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  width: 100%;
  max-width: 720px;
  animation: omnimux-products-fade-in 120ms ease;
}
.omnimux-products-modal-container {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 85vh;
  border-radius: 16px;
  overflow: hidden;
  background: var(--dsw-alias-bg-module-platform, #131313);
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  box-shadow: 0 12px 36px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.60));
}
.omnimux-products-modal-close {
  position: absolute;
  top: -10px;
  right: -48px;
  width: 36px !important;
  height: 36px !important;
  min-width: 36px;
  padding: 0 !important;
  border-radius: 50%;
  border: 1px solid var(--dsw-alias-border-hover, rgba(255, 255, 255, 0.22));
  background: var(--dsw-alias-bg-elevated, rgba(24, 24, 24, 0.88));
  backdrop-filter: blur(12px);
  color: var(--dsw-alias-label-primary, #ffffff);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  box-shadow: 0 4px 16px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.55));
  transition: all 120ms ease;
  flex-shrink: 0;
  align-self: flex-start;
}
.omnimux-products-modal-close:hover {
  border-color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45));
  background: var(--dsw-alias-bg-layer-2, rgba(45, 45, 45, 0.95));
  transform: scale(1.08);
}
@media (max-width: 1160px) {
  .omnimux-products-modal-close {
    top: -44px;
    right: 4px;
  }
}
.omnimux-products-modal-header {
  flex: none;
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #242424);
}
.omnimux-products-modal-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 24px;
  color: var(--dsw-alias-label-primary, inherit);
}
.omnimux-products-modal-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 20px;
}
.omnimux-products-modal-footer {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--dsw-alias-border-l2, #242424);
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
