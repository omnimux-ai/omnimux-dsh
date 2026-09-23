export const STYLES_ID = 'omnimux-workflow-styles'

export const WORKFLOW_CSS = `
.omnimux-workflow-stage,
.omnimux-workflow-library-page {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  color: var(--dsw-alias-label-primary, inherit);
  overflow: hidden;
  pointer-events: auto;
}
.omnimux-workflow-library-page .dshUk-PageHeader-pageHeader,
.omnimux-workflow-library-page .dshUk-PageHeader-heading,
.omnimux-workflow-library-page .dshUk-PageHeader-controls {
  min-width: 0;
  max-width: 100%;
}
.omnimux-workflow-stage[data-visible="false"],
.omnimux-workflow-library-page[data-visible="false"] {
  display: none !important;
  pointer-events: none;
}
.omnimux-workflow-action-row,
.omnimux-workflow-library-action-row {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px 20px 12px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.omnimux-workflow-library-filter {
  flex: none;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 0 20px 12px;
}
.omnimux-workflow-library-filter .dshUk-SearchField-root,
.omnimux-workflow-library-filter .dshUk-SearchField-stretch {
  width: 100%;
  max-width: min(260px, 100%);
  min-width: 0;
}
.omnimux-workflow-stage-toolbar {
  flex: none;
  padding: 0 20px 12px;
  height: 44px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.omnimux-workflow-tools-cluster {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.omnimux-workflow-search-wrap {
  width: min(260px, 100%);
  max-width: 100%;
  min-width: 0;
}
.omnimux-workflow-chip {
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  padding: 4px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-active);
  flex-shrink: 0;
}
.omnimux-workflow-muted {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  flex-shrink: 0;
  white-space: nowrap;
}
.omnimux-workflow-error,
.omnimux-workflow-library-error {
  margin: 0;
  padding: 6px 20px;
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-error));
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
}
.omnimux-workflow-body,
.omnimux-workflow-library-body {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: 16px 20px 20px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
}
.omnimux-workflow-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
  gap: 12px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.omnimux-workflow-empty,
.omnimux-workflow-library-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-height: 200px;
  padding: 24px 16px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  text-align: center;
  border: 1px dashed var(--dsw-alias-border-l4, var(--dsw-alias-border));
  border-radius: 12px;
}
.omnimux-workflow-empty p,
.omnimux-workflow-library-empty-title,
.omnimux-workflow-library-empty-sub { margin: 0; }
.omnimux-workflow-library-empty-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: var(--dsw-alias-label-primary, inherit);
}
.omnimux-workflow-library-empty-sub {
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-workflow-card {
  border: 1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border));
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  background: var(--dsw-alias-bg-base, var(--dsw-bg));
  min-height: 96px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
}
.omnimux-workflow-card:hover {
  border-color: var(--dsw-alias-border-l4, var(--dsw-alias-border));
}
.omnimux-workflow-card:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}
.omnimux-workflow-card-main,
.omnimux-workflow-card-head {
  flex: 1;
  min-width: 0;
}
.omnimux-workflow-card-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-workflow-card-meta {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  margin-top: 4px;
}
.omnimux-workflow-card-desc {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.omnimux-workflow-card-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  align-items: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}
.omnimux-workflow-card:hover .omnimux-workflow-card-actions,
.omnimux-workflow-card:focus-within .omnimux-workflow-card-actions {
  opacity: 1;
  pointer-events: auto;
}
@media (max-width: 720px) {
  .omnimux-workflow-action-row,
  .omnimux-workflow-library-action-row,
  .omnimux-workflow-library-filter,
  .omnimux-workflow-body,
  .omnimux-workflow-library-body {
    padding-left: 12px;
    padding-right: 12px;
  }
  .omnimux-workflow-grid {
    grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr));
    gap: 10px;
  }
}
.omnimux-workflow-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.omnimux-workflow-form-error {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-error));
}
.omnimux-workflow-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}
.omnimux-new-project-name {
  display: flex;
  align-items: stretch;
  height: 40px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.omnimux-new-project-name:focus-within {
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 2px var(--dsw-alias-state-business-tertiary);
}
.omnimux-new-project-name label {
  display: flex;
  flex: 1;
  min-width: 0;
  height: 100%;
  margin: 0;
}
.omnimux-new-project-name label > span {
  flex: 1;
  display: flex;
  align-items: stretch;
  min-width: 0;
  height: 100%;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
}
.omnimux-new-project-name-prefix {
  width: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-secondary);
  border-right: 1px solid var(--dsw-alias-border-l1);
  flex: none;
}
.omnimux-new-project-name .omnimux-new-project-name-field,
.omnimux-new-project-name input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  border-radius: 0 !important;
}
.omnimux-new-project-source-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
  gap: 8px;
}
.omnimux-new-project-source-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-new-project-device {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-new-project-drop {
  appearance: none;
  width: 100%;
  min-height: 132px;
  height: auto !important;
  padding: 20px 16px !important;
  border: 1px solid var(--dsw-alias-border-l2) !important;
  border-radius: 12px !important;
  background: transparent !important;
  color: var(--dsw-alias-label-primary) !important;
  display: flex !important;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  box-sizing: border-box;
  cursor: pointer;
  font: inherit;
}
.omnimux-new-project-drop:hover:not(:disabled) {
  border-color: var(--dsw-alias-border-hover) !important;
  background: var(--dsw-alias-interactive-bg-hover) !important;
}
.omnimux-new-project-drop:disabled {
  opacity: 0.4;
  cursor: default !important;
}
.omnimux-new-project-drop:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.omnimux-new-project-drop-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
}
.omnimux-new-project-add-pill {
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.omnimux-new-project-picked {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 6px 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  gap: 8px;
}
.omnimux-new-project-picked-icon {
  color: var(--dsw-alias-label-secondary);
  display: inline-flex;
  flex: none;
}
.omnimux-new-project-picked-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-new-project-browse {
  display: flex;
  flex-direction: column;
  min-height: 220px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-1);
}
.omnimux-new-project-browse-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 6px 0 4px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.omnimux-new-project-browse-path {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-new-project-browse-list {
  flex: 1;
  max-height: 220px;
  overflow: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.omnimux-new-project-folder-row {
  width: 100% !important;
  height: 36px !important;
  justify-content: flex-start !important;
  gap: 8px !important;
  padding: 0 8px !important;
  border: none !important;
  background: transparent !important;
  color: var(--dsw-alias-label-primary) !important;
  border-radius: 8px !important;
}
.omnimux-new-project-folder-row:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover) !important;
}
.omnimux-new-project-folder-row:disabled {
  opacity: 0.4;
  cursor: default !important;
}
.omnimux-new-project-folder-row:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.omnimux-new-project-browse-empty {
  margin: 0;
  padding: 16px 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  text-align: center;
}
.omnimux-new-project-browse-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.omnimux-workflow-canvas-host {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.omnimux-workflow-canvas-root {
  width: 100%;
  height: 100%;
}
.omnimux-workflow-canvas-status {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-workflow-canvas-body {
  flex: 1;
  min-height: 0;
  position: relative;
}
.omnimux-workflow-canvas-tab {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.omnimux-workflow-canvas-tab[data-visible="false"] {
  visibility: hidden;
}
.omnimux-workflow-canvas-unprojected {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  text-align: center;
}
.omnimux-workflow-unprojected-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  margin-bottom: 8px;
}
.omnimux-workflow-unprojected-sub {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
  max-width: 380px;
  line-height: 1.5;
  margin-bottom: 20px;
}
/* OmniMux AI App Tab Styles */
.omx-apptab-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  font-family: inherit;
}
.omx-apptab-empty {
  padding: 32px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.omx-apptab-empty-icon {
  font-size: 28px;
  margin-bottom: 12px;
}
.omx-apptab-empty-title {
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  margin-bottom: 6px;
}
.omx-apptab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  flex-shrink: 0;
  gap: 16px;
}
.omx-apptab-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}
.omx-apptab-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  flex-shrink: 0;
}
.omx-apptab-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1);
  flex-shrink: 0;
}
.omx-apptab-version {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  flex-shrink: 0;
}
.omx-apptab-desc {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  margin-left: 6px;
  max-width: 520px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omx-apptab-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.omx-apptab-edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.omx-apptab-edit-btn:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-3);
  border-color: var(--dsw-alias-border-l1);
}
.omx-apptab-edit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.omx-apptab-edit-icon {
  width: 13px;
  height: 13px;
  stroke: currentColor;
}
.omx-apptab-notice {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  line-height: 1;
}
.omx-apptab-notice--info {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-brand-primary);
  border: 1px solid var(--dsw-alias-border-l2);
}
.omx-apptab-notice--success {
  background: var(--dsw-alias-state-success-tertiary);
  color: var(--dsw-alias-state-success-primary);
  border: 1px solid var(--dsw-alias-border-l1);
}
.omx-apptab-notice--error {
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
  border: 1px solid var(--dsw-alias-border-l1);
}
.omx-apptab-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.omx-apptab-form-panel {
  width: 448px;
  min-width: 448px;
  max-width: 448px;
  box-sizing: border-box;
  padding: 20px 24px 24px;
  border-right: 1px solid var(--dsw-alias-border-l2);
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-layer-1);
  overflow-y: auto;
}
.omx-apptab-form {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.omx-apptab-form-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.omx-apptab-field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 398px;
}
.omx-apptab-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.omx-apptab-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  display: flex;
  align-items: center;
  gap: 4px;
}
.omx-apptab-required {
  color: var(--dsw-alias-state-error-primary);
}
.omx-apptab-hint {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.omx-apptab-input,
.omx-apptab-select {
  height: 40px;
  width: 398px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  padding: 0 12px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}
.omx-apptab-input.is-error,
.omx-apptab-select.is-error,
.omx-apptab-textarea.is-error {
  border-color: var(--dsw-alias-state-error-primary);
}
.omx-apptab-select option {
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
}
.omx-apptab-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  height: 40px;
  color: var(--dsw-alias-label-secondary);
}
.omx-apptab-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--dsw-alias-brand-primary);
}
.omx-apptab-textarea {
  height: 80px;
  width: 398px;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  padding: 8px 12px;
  font-size: 13px;
  resize: none;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}
.omx-apptab-error-text {
  font-size: 11px;
  color: var(--dsw-alias-state-error-primary);
  display: flex;
  align-items: center;
  gap: 4px;
}
/* 比例卡片网格与卡片 */
.omx-apptab-ratio-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 8px;
  width: 398px;
  box-sizing: border-box;
}
.omx-apptab-ratio-card {
  height: 40px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: all 0.15s ease;
}
.omx-apptab-ratio-card:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.omx-apptab-ratio-card.is-active {
  background: var(--dsw-alias-interactive-bg-active);
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
}
/* 单选定制下拉菜单 */
.omx-apptab-select-single {
  position: relative;
  width: 398px;
  box-sizing: border-box;
}
.omx-apptab-select-trigger {
  width: 398px;
  height: 40px;
  border-radius: 8px;
  box-sizing: border-box;
  padding: 0 12px;
  font-size: 13px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s ease;
}
.omx-apptab-select-trigger:hover {
  border-color: var(--dsw-alias-border-l3);
}
.omx-apptab-select-trigger.is-open {
  border-color: var(--dsw-alias-brand-primary);
}
.omx-apptab-select-trigger.is-error {
  border-color: var(--dsw-alias-state-error-primary);
}
.omx-apptab-select-options {
  position: absolute;
  top: 44px;
  left: 0;
  width: 398px;
  max-height: 200px;
  overflow-y: auto;
  border-radius: 8px;
  box-sizing: border-box;
  background: var(--dsw-alias-surface-raised);
  border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-1);
  z-index: 50;
}
.omx-apptab-select-option {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.omx-apptab-select-option:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.omx-apptab-select-option.is-selected {
  color: var(--dsw-alias-brand-primary);
  font-weight: 500;
}
/* 分段选项卡 */
.omx-apptab-seg-tabs {
  display: flex;
  height: 40px;
  width: 398px;
  box-sizing: border-box;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  padding: 3px;
  gap: 4px;
}
.omx-apptab-seg-tab {
  flex: 1;
  height: 100%;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.omx-apptab-seg-tab:hover {
  color: var(--dsw-alias-label-primary);
}
.omx-apptab-seg-tab.is-on {
  background: var(--dsw-alias-surface-raised);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  box-shadow: 0 1px 4px var(--dsw-alias-bg-mask-1);
}
/* 多选胶囊 */
.omx-apptab-multi-box {
  width: 398px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.omx-apptab-multi-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.omx-apptab-mtag {
  height: 30px;
  border-radius: 6px;
  padding: 0 10px;
  font-size: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.omx-apptab-mtag:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omx-apptab-mtag.is-on {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-brand-primary);
  font-weight: 500;
}
.omx-apptab-mtag.is-locked {
  opacity: 0.4;
  cursor: not-allowed;
}
.omx-apptab-multi-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.omx-apptab-multi-limit {
  color: var(--dsw-alias-state-warning-primary);
}
/* 选定回填展示卡片 */
.omx-apptab-picked {
  width: 398px;
  height: 48px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 8px;
  box-sizing: border-box;
}
.omx-apptab-picked-thumb {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  flex-shrink: 0;
}
.omx-apptab-picked-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.omx-apptab-picked-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.omx-apptab-picked-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omx-apptab-picked-sub {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omx-apptab-picked-clear {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.omx-apptab-picked-clear:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
/* 资产库触发按钮 */
.omx-apptab-library-trigger {
  width: 398px;
  height: 40px;
  border-radius: 8px;
  border: 1px dashed var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: 13px;
  cursor: pointer;
  box-sizing: border-box;
  transition: all 0.15s ease;
}
.omx-apptab-library-trigger:hover {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-label-primary);
}
/* 提取器与复合输入 */
.omx-apptab-extractor {
  display: flex;
  gap: 6px;
  width: 398px;
  box-sizing: border-box;
  align-items: center;
}
.omx-apptab-extractor-input {
  flex: 1;
  height: 40px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  padding: 0 10px;
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
}
.omx-apptab-extractor-input:focus {
  border-color: var(--dsw-alias-brand-primary);
}
.omx-apptab-extractor-btn {
  height: 36px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.omx-apptab-extractor-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.omx-apptab-extractor-icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.omx-apptab-extractor-icon-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
/* 上传器 */
.omx-apptab-uploader {
  width: 398px;
  height: 64px;
  border-radius: 8px;
  border: 1px dashed var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-2);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  box-sizing: border-box;
  transition: all 0.15s ease;
}
.omx-apptab-uploader:hover {
  border-color: var(--dsw-alias-brand-primary);
}
.omx-apptab-uploader-icon {
  color: var(--dsw-alias-label-tertiary);
}
.omx-apptab-uploader-hint {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.omx-apptab-cta-wrap {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
/* Ink CTA：填充取 label-primary、文字取 label-primary-foreground，
   深色主题为浅底深字、浅色主题为深底浅字，随宿主主题级联自适应。 */
.omx-apptab-cta-btn {
  height: 44px;
  width: 398px;
  border-radius: 8px;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary-foreground);
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background-color 150ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 120ms cubic-bezier(0.16, 1, 0.3, 1);
}
.omx-apptab-cta-btn:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover);
}
.omx-apptab-cta-btn:active:not(:disabled) {
  transform: scale(0.96);
}
.omx-apptab-cta-btn:disabled {
  background: var(--dsw-alias-button-primary-dimmed);
  color: var(--dsw-alias-label-tertiary);
  cursor: not-allowed;
}
.omx-apptab-output-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--dsw-alias-bg-base);
  overflow: hidden;
}
.omx-apptab-right-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  flex-shrink: 0;
}
.omx-apptab-tab-pill {
  height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.omx-apptab-tab-pill.is-active {
  font-weight: 600;
  border-color: var(--dsw-alias-border-l2);
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
}
.omx-apptab-output-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
.omx-apptab-tasks-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 70%;
  color: var(--dsw-alias-label-secondary);
  text-align: center;
}
.omx-apptab-tasks-empty-icon {
  font-size: 32px;
  margin-bottom: 12px;
}
.omx-apptab-tasks-empty-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--dsw-alias-label-primary);
  margin-bottom: 6px;
}
.omx-apptab-tasks-empty-desc {
  font-size: 13px;
  max-width: 320px;
}
.omx-apptab-tasks-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.omx-apptab-task-card {
  padding: 16px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.omx-apptab-task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.omx-apptab-task-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.omx-apptab-status-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-brand-primary);
}
.omx-apptab-status-badge.is-completed {
  background: var(--dsw-alias-state-success-tertiary);
  color: var(--dsw-alias-state-success-primary);
}
/* 宿主未提供 error 层浅色底，danger 只存在半透明叠加色，故失败态与错误框共用该色。 */
.omx-apptab-status-badge.is-failed {
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
}
.omx-apptab-task-time {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omx-apptab-task-id {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  font-family: monospace;
}
.omx-apptab-media-box {
  border-radius: 8px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
}
.omx-apptab-media-video {
  width: 100%;
  max-height: 360px;
  border-radius: 6px;
}
.omx-apptab-media-audio {
  width: 100%;
  padding: 16px 8px;
  box-sizing: border-box;
}
.omx-apptab-media-img {
  max-width: 100%;
  max-height: 360px;
  border-radius: 6px;
  object-fit: contain;
}
.omx-apptab-error-box {
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover-danger);
  border: 1px solid var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
}
.omx-apptab-inputs-summary {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-base);
  padding: 8px 12px;
  border-radius: 6px;
}
.omx-apptab-inputs-summary span {
  margin-right: 12px;
}
.omx-apptab-showcase-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.omx-apptab-showcase-empty {
  color: var(--dsw-alias-label-secondary);
  text-align: center;
  padding: 40px;
}
.omx-apptab-showcase-card {
  padding: 16px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.omx-apptab-showcase-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.omx-apptab-showcase-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--dsw-alias-label-primary);
}
.omx-apptab-showcase-btn {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.omx-apptab-showcase-media {
  border-radius: 8px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
  display: flex;
  justify-content: center;
}

/* ==================== 项目工程中心 / 文件夹视图 / 创作页 / 资产浏览器 ==================== */

.omnimux-project-breadcrumb-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 28px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
  box-sizing: border-box;
  min-height: 52px;
}

.omnimux-project-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  line-height: 20px;
}

.omnimux-project-crumb-link {
  color: var(--dsw-alias-label-secondary, #8e8e93);
  cursor: pointer;
  font-weight: 500;
  transition: color 0.15s ease;
}

.omnimux-project-crumb-link:hover {
  color: var(--dsw-alias-label-primary, #ffffff);
}

.omnimux-project-crumb-sep {
  color: var(--dsw-alias-label-tertiary, #636366);
  font-size: 14px;
  user-select: none;
}

.omnimux-project-crumb-current {
  color: var(--dsw-alias-label-primary, #ffffff);
  font-weight: 600;
}

.omnimux-project-detail-tabs-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 0 28px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
  min-height: 48px;
  box-sizing: border-box;
}

.omnimux-tab-label-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.omnimux-tab-info-icon {
  font-size: 13px;
  color: var(--dsw-alias-label-tertiary);
  opacity: 0.8;
  cursor: help;
  display: inline-flex;
  align-items: center;
  user-select: none;
  transition: opacity 120ms ease, color 120ms ease;
}
.omnimux-tab-info-icon:hover {
  opacity: 1;
  color: var(--dsw-alias-label-secondary);
}

.omnimux-create-page-btn {
  height: 32px;
  margin-bottom: 6px;
  border-radius: 8px;
}

.omnimux-pages-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 260px));
  gap: 24px;
  padding: 24px 28px;
}

.omnimux-page-card {
  position: relative;
  background: var(--dsw-alias-bg-layer-1, #18181b);
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
  border-radius: 16px;
  padding: 10px 10px 14px 10px;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.omnimux-page-card:hover {
  border-color: var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.2));
  transform: translateY(-2px);
  box-shadow: 0 6px 20px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.35));
}

.omnimux-page-card--active {
  border-color: var(--dsw-alias-brand-primary, #6366f1);
}

.omnimux-page-card-cover {
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: 10px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2, #232326);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.omnimux-page-card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 10px;
}

.omnimux-page-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--dsw-alias-bg-layer-2, #222226) 0%, var(--dsw-alias-bg-layer-1, #1a1a1d) 100%);
  color: var(--dsw-alias-label-tertiary, #636366);
}

.omnimux-page-cover-icon {
  width: 38px;
  height: 38px;
  opacity: 0.65;
}

.omnimux-page-card-info {
  padding: 12px 4px 2px 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.omnimux-page-card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #ffffff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 20px;
}

.omnimux-page-card-meta {
  font-size: 13px;
  color: var(--dsw-alias-label-tertiary, #8e8e93);
  display: flex;
  align-items: center;
  justify-content: space-between;
  line-height: 18px;
  min-height: 24px;
}

.omnimux-page-card-date {
  font-size: 13px;
  color: var(--dsw-alias-label-tertiary, #8e8e93);
}

/* 顶层文件夹卡片 */
.omnimux-project-folder-card {
  position: relative;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  flex-direction: column;
  min-height: 180px;
}

.omnimux-project-folder-card:hover {
  border-color: var(--dsw-alias-border-l3);
  transform: translateY(-2px);
  box-shadow: 0 6px 18px var(--dsw-alias-bg-mask-1);
}

.omnimux-project-folder-cover {
  position: relative;
  height: 110px;
  background: var(--dsw-alias-bg-layer-2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.omnimux-folder-tab-shape {
  position: absolute;
  top: 10px;
  left: 12px;
  right: 12px;
  bottom: 0;
  background: var(--dsw-alias-bg-base);
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-bottom: none;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.omnimux-folder-waveform-svg {
  width: 80%;
  height: 36px;
  opacity: 0.85;
}

.omnimux-workflow-card-actions--visible {
  opacity: 1 !important;
  pointer-events: auto !important;
}

.omnimux-project-folder-info {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--dsw-alias-bg-base);
}

.omnimux-project-folder-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.omnimux-project-folder-meta {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 项目资产浏览器 (必须收敛至 .omnimux-assets-tab 容器下，严禁污染主资产库) */
.omnimux-assets-tab .omnimux-assets-action-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 16px 20px;
}

.omnimux-assets-tab .omnimux-assets-action-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.omnimux-assets-tab .omnimux-assets-action-card:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  border-color: var(--dsw-alias-border-l2);
}

.omnimux-assets-tab .omnimux-assets-card-icon-box {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-primary);
  flex-shrink: 0;
}

.omnimux-assets-tab .omnimux-assets-card-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.omnimux-assets-tab .omnimux-assets-card-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}

.omnimux-assets-tab .omnimux-assets-card-subtitle {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}

.omnimux-assets-tab .omnimux-assets-browser {
  padding: 0 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.omnimux-assets-tab .omnimux-assets-filter-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.omnimux-assets-tab .omnimux-assets-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.omnimux-assets-tab .omnimux-assets-table th {
  text-align: left;
  padding: 8px 12px;
  color: var(--dsw-alias-label-tertiary);
  font-weight: 400;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.omnimux-assets-tab .omnimux-assets-table td {
  padding: 10px 12px;
  color: var(--dsw-alias-label-primary);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  vertical-align: middle;
}

.omnimux-assets-tab .omnimux-assets-table tr:hover td {
  background: var(--dsw-alias-interactive-bg-hover);
}

.omnimux-assets-tab .omnimux-file-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.omnimux-assets-tab .omnimux-file-icon-folder {
  color: var(--dsw-alias-brand-primary, #8b5cf6);
  flex-shrink: 0;
}

.omnimux-assets-tab .omnimux-file-icon-media {
  color: var(--dsw-alias-label-secondary);
  flex-shrink: 0;
}

.omnimux-assets-tab .omnimux-assets-search-cluster {
  display: flex;
  align-items: center;
  gap: 8px;
}

.omnimux-assets-tab .omnimux-col-name {
  width: 55%;
}

.omnimux-assets-tab .omnimux-col-size {
  width: 20%;
}

.omnimux-assets-tab .omnimux-col-time {
  width: 20%;
}

.omnimux-assets-tab .omnimux-col-action {
  width: 5%;
}

.omnimux-assets-tab .omnimux-file-folder-name {
  font-weight: 500;
}

.omnimux-assets-tab .omnimux-file-more-btn {
  opacity: 0.5;
  cursor: pointer;
}

.omnimux-assets-tab .omnimux-assets-empty-cell {
  text-align: center;
  padding: 32px 0;
  color: var(--dsw-alias-label-tertiary);
}
`

export function injectWorkflowStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLES_ID)) return
  const styleNode = document.createElement('style')
  styleNode.id = STYLES_ID
  styleNode.textContent = WORKFLOW_CSS
  document.head.appendChild(styleNode)
}
