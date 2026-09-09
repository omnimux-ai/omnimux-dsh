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
  background: var(--dsw-alias-surface-raised);
  flex-shrink: 0;
}
.omx-apptab-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.omx-apptab-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.omx-apptab-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  background: var(--dsw-alias-interactive-bg);
  color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1);
}
.omx-apptab-version {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omx-apptab-desc {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  background: var(--dsw-alias-surface-raised);
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


/* ==================== 项目工程中心 / 文件夹视图 / 创作页 / 资产浏览器 ==================== */

.omnimux-project-breadcrumb-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  min-height: 52px;
  box-sizing: border-box;
}

.omnimux-project-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.omnimux-project-crumb-link {
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-weight: 500;
  transition: color 0.15s ease;
}

.omnimux-project-crumb-link:hover {
  color: var(--dsw-alias-label-primary);
}

.omnimux-project-crumb-sep {
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
}

.omnimux-project-crumb-current {
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.omnimux-project-detail-tabs-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

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

.omnimux-pages-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  padding: 20px;
}

.omnimux-page-card {
  position: relative;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  flex-direction: column;
  height: 230px;
}

.omnimux-page-card:hover {
  border-color: var(--dsw-alias-border-l3);
  transform: translateY(-2px);
  box-shadow: 0 6px 18px var(--dsw-alias-bg-mask-1);
}

.omnimux-page-card-cover {
  flex: 1;
  min-height: 0;
  background: var(--dsw-alias-bg-layer-2);
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  position: relative;
  overflow: hidden;
}

.omnimux-page-card-info {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--dsw-alias-bg-base);
}

.omnimux-page-card-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.omnimux-page-card-meta {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);  display: flex;
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
  color: var(--dsw-alias-status-danger);
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
  background: var(--dsw-alias-interactive-bg);
  color: var(--dsw-alias-label-primary);
  padding: 0 12px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}
.omx-apptab-input.is-error,
.omx-apptab-select.is-error,
.omx-apptab-textarea.is-error {
  border-color: var(--dsw-alias-status-danger);
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
  background: var(--dsw-alias-interactive-bg);
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
  color: var(--dsw-alias-status-danger);
  display: flex;
  align-items: center;
  gap: 4px;
}
.omx-apptab-cta-wrap {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.omx-apptab-cta-btn {
  height: 44px;
  width: 398px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-primary);
  color: var(--dsw-alias-label-inverse);
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: opacity 0.2s;
  box-shadow: 0 2px 8px var(--dsw-alias-bg-mask-1);
}
.omx-apptab-cta-btn:disabled {
  background: var(--dsw-alias-interactive-bg-disabled);
  color: var(--dsw-alias-label-disabled);
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
  background: var(--dsw-alias-surface-raised);
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
  background: var(--dsw-alias-surface-raised);
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


.omnimux-assets-action-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 16px 20px;
}

.omnimux-assets-action-card {
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

.omnimux-assets-action-card:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  border-color: var(--dsw-alias-border-l2);
}

.omnimux-assets-card-icon-box {
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

.omnimux-assets-card-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.omnimux-assets-card-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}

.omnimux-assets-card-subtitle {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}

.omnimux-assets-browser {
  padding: 0 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.omnimux-assets-filter-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.omnimux-assets-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.omnimux-assets-table th {
  text-align: left;
  padding: 8px 12px;
  color: var(--dsw-alias-label-tertiary);
  font-weight: 400;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.omnimux-assets-table td {
  padding: 10px 12px;
  color: var(--dsw-alias-label-primary);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  vertical-align: middle;
}

.omnimux-assets-table tr:hover td {
  background: var(--dsw-alias-interactive-bg-hover);
}

.omnimux-file-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.omnimux-file-icon-folder {
  color: var(--dsw-alias-brand-primary, #8b5cf6);
  flex-shrink: 0;
}

.omnimux-file-icon-media {
  color: var(--dsw-alias-label-secondary);
  flex-shrink: 0;
}

.omnimux-assets-search-cluster {  display: flex;
  align-items: center;
  gap: 8px;
}
.omx-apptab-status-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg);
  color: var(--dsw-alias-brand-primary);
}
.omx-apptab-status-badge.is-completed {
  background: var(--dsw-alias-status-success-bg, var(--dsw-alias-interactive-bg));
  color: var(--dsw-alias-status-success);
}
.omx-apptab-status-badge.is-failed {
  background: var(--dsw-alias-status-danger-bg, var(--dsw-alias-interactive-bg));
  color: var(--dsw-alias-status-danger);
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
  background: var(--dsw-alias-bg-surface, var(--dsw-alias-bg-elevated));
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
  background: var(--dsw-alias-status-danger-bg, var(--dsw-alias-interactive-bg));
  border: 1px solid var(--dsw-alias-border-danger, var(--dsw-alias-border-l2));
  color: var(--dsw-alias-status-danger);
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
  background: var(--dsw-alias-surface-raised);
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
  background: var(--dsw-alias-interactive-bg);
  border: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.omx-apptab-showcase-media {
  border-radius: 8px;
  overflow: hidden;
  background: var(--dsw-alias-bg-surface, var(--dsw-alias-bg-elevated));
  display: flex;
  justify-content: center;


.omnimux-col-name {
  width: 55%;
}

.omnimux-col-size {
  width: 20%;
}

.omnimux-col-time {
  width: 20%;
}

.omnimux-col-action {
  width: 5%;
}

.omnimux-file-folder-name {
  font-weight: 500;
}

.omnimux-file-more-btn {
  opacity: 0.5;
  cursor: pointer;
}

.omnimux-assets-empty-cell {
  text-align: center;
  padding: 32px 0;
  color: var(--dsw-alias-label-tertiary);}
`

export function injectWorkflowStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLES_ID)) return
  const styleNode = document.createElement('style')
  styleNode.id = STYLES_ID
  styleNode.textContent = WORKFLOW_CSS
  document.head.appendChild(styleNode)
}
