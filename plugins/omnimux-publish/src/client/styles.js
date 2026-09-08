/** Stage CSS: layout + semantic tokens only. Injected once into <head>. */

const CSS_ID = 'omnimux-publish-styles'

const CSS = `
.omnimux-publish-stage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #0f172a);
  overflow: auto;
  pointer-events: auto;
}
.omnimux-publish-stage[data-visible="false"] {
  display: none !important;
  pointer-events: none;
}

/* Layer 2: Action Row (8px 20px 12px) */
.omnimux-publish-action-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px 12px;
  background: var(--dsw-alias-bg-base, #ffffff);
}

/* Layer 3: Control Bar (Single FilterBar, 44px, 0 20px 12px) */
.omnimux-publish-control-bar {
  flex: none;
  padding: 0 20px 12px;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.omnimux-publish-tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  margin-left: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, #64748b);
  background: var(--dsw-alias-bg-layer-2, #f8fafc);
  border-radius: 9999px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
}
.omnimux-publish-tab-badge.retry {
  color: var(--dsw-alias-state-error, #ef4444);
}

/* Layer 4: Content Viewport (padding: 16px; gap: 16px) */
.omnimux-publish-viewport {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
  overflow: auto;
}

/* Batch Action Bar */
.omnimux-publish-batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--dsw-alias-brand-subtle, rgba(15, 23, 42, 0.06));
  border: 1px solid var(--dsw-alias-brand-border, rgba(15, 23, 42, 0.15));
  border-radius: 8px;
  font-size: 13px;
}
.omnimux-publish-batch-actions { display: flex; gap: 8px; }
.omnimux-publish-view-switcher { display: flex; gap: 2px; }

/* Composer and detail stay inside the workbench stage. */
.omnimux-publish-subscreen {
  position: absolute;
  inset: 0;
  z-index: 300;
  background: var(--dsw-alias-bg-base, #ffffff);
  display: flex;
  flex-direction: column;
}

/* 14-Column Table View */
.omnimux-publish-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.omnimux-publish-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;
}
.omnimux-publish-table th {
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  background: var(--dsw-alias-bg-layer-2, #f8fafc);
  white-space: nowrap;
  user-select: none;
}
.omnimux-publish-th-metric {
  width: 56px;
  text-align: center;
  padding: 8px 4px;
}
.omnimux-publish-th-metric-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 11px;
}
.omnimux-publish-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  color: var(--dsw-alias-label-secondary, #64748b);
  vertical-align: middle;
}
.omnimux-publish-row {
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.omnimux-publish-row:hover td {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04));
}
.omnimux-publish-row.selected td {
  background: var(--dsw-alias-brand-subtle, rgba(15, 23, 42, 0.06));
}
/* Column layout classes (UI02: no business inline styles in table JSX) */
.omnimux-publish-col-check { width: 32px; text-align: center; }
.omnimux-publish-col-content { min-width: 240px; text-align: left; }
.omnimux-publish-col-platforms { min-width: 100px; text-align: left; }
.omnimux-publish-col-date { width: 140px; text-align: left; cursor: pointer; }
.omnimux-publish-col-status { width: 100px; text-align: left; cursor: pointer; }
.omnimux-publish-col-menu { width: 40px; text-align: center; }
.omnimux-publish-col-sort:hover { color: var(--dsw-alias-label-secondary, #64748b); }
th[style*="--pub-min-w"] { min-width: var(--pub-min-w); }
.omnimux-publish-td-center { text-align: center; }
.omnimux-publish-td-datetime { white-space: nowrap; font-size: 12px; }
.omnimux-publish-td-metric {
  text-align: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  width: 56px;
}
.omnimux-publish-td-content {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 240px;
}
.omnimux-publish-td-thumb {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: var(--dsw-alias-thumb-bg, #475569);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
  color: var(--dsw-alias-label-primary, #ffffff);
}
.omnimux-publish-td-title-wrap {
  flex: 1;
  min-width: 0;
}
.omnimux-publish-td-title {
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #0f172a);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.omnimux-publish-table-empty {
  text-align: center;
  padding: 48px 0;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}

/* Status Pills */
.omnimux-publish-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.omnimux-publish-status-pill.draft {
  background: var(--dsw-alias-state-draft-subtle, rgba(100, 116, 139, 0.12));
  color: var(--dsw-alias-label-secondary, #64748b);
}
.omnimux-publish-status-pill.publishing {
  background: var(--dsw-alias-state-publishing-subtle, rgba(37, 99, 235, 0.12));
  color: var(--dsw-alias-state-publishing, #2563eb);
}
.omnimux-publish-status-pill.reviewing {
  background: var(--dsw-alias-state-warn-subtle, rgba(245, 158, 11, 0.12));
  color: var(--dsw-alias-state-warn-text, #d97706);
}
.omnimux-publish-status-pill.published {
  background: var(--dsw-alias-state-success-subtle, rgba(16, 185, 129, 0.12));
  color: var(--dsw-alias-state-success-text, #059669);
}
.omnimux-publish-status-pill.partial_failed {
  background: var(--dsw-alias-state-partial-subtle, rgba(234, 88, 12, 0.12));
  color: var(--dsw-alias-state-partial-text, #c2410c);
}
.omnimux-publish-status-pill.failed {
  background: var(--dsw-alias-state-error-subtle, rgba(239, 68, 68, 0.12));
  color: var(--dsw-alias-state-error-text, #dc2626);
}

/* Platform Cluster & Tags */
.omnimux-publish-platforms-cluster {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.omnimux-publish-plat-tag {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary, #ffffff);
}
.omnimux-publish-plat-tag.tiktok { background: var(--dsw-alias-platform-tiktok, #000000); }
.omnimux-publish-plat-tag.xiaohongshu, .omnimux-publish-plat-tag.xhs { background: var(--dsw-alias-platform-xhs, #ff2442); }
.omnimux-publish-plat-tag.wechat_channels, .omnimux-publish-plat-tag.sph { background: var(--dsw-alias-platform-sph, #fa9d3b); }
.omnimux-publish-plat-tag.draft { background: var(--dsw-alias-thumb-bg, #475569); }

.omnimux-publish-plat-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid var(--dsw-alias-bg-base, #ffffff);
}
.omnimux-publish-plat-dot.published { background: var(--dsw-alias-state-success, #10b981); }
.omnimux-publish-plat-dot.failed { background: var(--dsw-alias-state-error, #ef4444); }
.omnimux-publish-plat-dot.reviewing { background: var(--dsw-alias-state-warn, #f59e0b); }
.omnimux-publish-plat-dot.publishing { background: var(--dsw-alias-state-publishing, #2563eb); }

/* Grid View & 112px AssetCard */
.omnimux-publish-grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.omnimux-publish-asset-card {
  background: var(--dsw-alias-bg-base, #ffffff);
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.omnimux-publish-asset-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--dsw-shadow-lv2, 0 4px 6px rgba(0,0,0,0.08));
  border-color: var(--dsw-alias-border-l2, #cbd5e1);
}
.omnimux-publish-card-cover {
  width: 100%;
  height: 112px;
  background: var(--dsw-alias-thumb-bg, #475569);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-primary, #ffffff);
}
.omnimux-publish-card-thumb-icon {
  font-size: 14px;
  font-weight: 500;
  opacity: 0.9;
}
.omnimux-publish-card-type-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  background: var(--dsw-alias-backdrop-bg, rgba(0,0,0,0.65));
  color: var(--dsw-alias-label-primary, #ffffff);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}
.omnimux-publish-card-checkbox {
  position: absolute;
  top: 6px;
  left: 6px;
}
.omnimux-publish-card-body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  justify-content: space-between;
}
.omnimux-publish-card-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}
.omnimux-publish-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f172a);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.omnimux-publish-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}
.omnimux-publish-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
}

/* Calendar View */
.omnimux-publish-cal-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.omnimux-publish-cal-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.omnimux-publish-cal-month-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f172a);
}
.omnimux-publish-week-btn-group {
  display: flex;
  gap: 4px;
}
.omnimux-publish-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-top: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  border-left: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  background: var(--dsw-alias-bg-base, #ffffff);
  border-radius: 8px;
  overflow: hidden;
}
.omnimux-publish-cal-head-cell {
  padding: 8px 0;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  border-right: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  background: var(--dsw-alias-bg-layer-2, #f8fafc);
}
.omnimux-publish-cal-cell {
  min-height: 96px;
  padding: 6px;
  border-right: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.omnimux-publish-cal-cell.other-month {
  background: var(--dsw-alias-bg-layer-2, #f8fafc);
  opacity: 0.5;
}
.omnimux-publish-cal-date-num {
  font-size: 11px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, #64748b);
  align-self: flex-end;
}
.omnimux-publish-cal-tasks {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.omnimux-publish-cal-pill {
  padding: 3px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2, #f8fafc);
  border-left: 3px solid var(--dsw-alias-state-publishing, #2563eb);
  font-size: 11px;
  cursor: pointer;
  box-shadow: var(--dsw-shadow-lv1, 0 1px 2px rgba(0,0,0,0.05));
}
.omnimux-publish-cal-pill.published { border-left-color: var(--dsw-alias-state-success, #10b981); }
.omnimux-publish-cal-pill.failed { border-left-color: var(--dsw-alias-state-error, #ef4444); }
.omnimux-publish-cal-pill.reviewing { border-left-color: var(--dsw-alias-state-warn, #f59e0b); }
.omnimux-publish-cal-pill-title {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}
.omnimux-publish-cal-more {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}

.omnimux-publish-muted { padding: 24px 0; color: var(--dsw-alias-label-tertiary); text-align: center; }
.omnimux-publish-alert {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 12px;
}
.omnimux-publish-alert.error {
  background: var(--dsw-alias-state-error-subtle, rgba(239, 68, 68, 0.12));
  color: var(--dsw-alias-state-error-text, #dc2626);
  border: 1px solid var(--dsw-alias-state-error, #ef4444);
}
.omnimux-publish-alert.warn {
  background: var(--dsw-alias-state-warn-subtle, rgba(245, 158, 11, 0.12));
  color: var(--dsw-alias-state-warn-text, #b45309);
  border: 1px solid var(--dsw-alias-state-warn, #f59e0b);
}
.omnimux-publish-alert.ok {
  background: var(--dsw-alias-state-success-subtle, rgba(16, 185, 129, 0.12));
  color: var(--dsw-alias-state-success-text, #047857);
  border: 1px solid var(--dsw-alias-state-success, #10b981);
}
.omnimux-publish-alert.banner {
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.04));
  color: var(--dsw-alias-label-secondary, #64748b);
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
}

/* ---- Composer: type pick (new draft entry) ---- */
.omnimux-publish-type-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 12px 20px 24px;
  box-sizing: border-box;
}
.omnimux-publish-type-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  min-height: 32px;
  margin-bottom: 8px;
}
.omnimux-publish-type-pick {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 16px;
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
  padding: 24px 0 48px;
  box-sizing: border-box;
}
.omnimux-publish-type-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  color: var(--dsw-alias-label-primary, #0f172a);
}
.omnimux-publish-type-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  width: 100%;
}
.omnimux-publish-type-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  min-height: 120px;
  height: auto;
  padding: 16px;
  margin: 0;
  box-sizing: border-box;
  text-align: left;
  cursor: pointer;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.04));
  color: var(--dsw-alias-label-primary, #0f172a);
  font: inherit;
  appearance: none;
  -webkit-appearance: none;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.omnimux-publish-type-card:hover {
  border-color: var(--dsw-alias-border-l2, #cbd5e1);
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.06));
  box-shadow: var(--dsw-shadow-lv1, 0 1px 2px rgba(0, 0, 0, 0.05));
}
.omnimux-publish-type-card:focus-visible {
  outline: 2px solid var(--dsw-alias-brand, #2563eb);
  outline-offset: 2px;
}
.omnimux-publish-type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 10px;
  color: var(--dsw-alias-label-primary, #0f172a);
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
}
.omnimux-publish-type-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: var(--dsw-alias-label-primary, #0f172a);
}
.omnimux-publish-type-hint {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #64748b);
  white-space: normal;
  overflow-wrap: anywhere;
}

/* ---- Composer: form + account panel ---- */
.omnimux-publish-composer {
  display: flex;
  flex: 1;
  min-height: 0;
  height: 100%;
  gap: 0;
  overflow: hidden;
}
.omnimux-publish-accounts {
  flex: none;
  width: 260px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  box-sizing: border-box;
  border-right: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  background: var(--dsw-alias-bg-base, #ffffff);
  overflow: auto;
}
.omnimux-publish-accounts-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f172a);
}
.omnimux-publish-accounts-muted {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}
.omnimux-publish-accounts-alert {
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--dsw-alias-state-error-text, #dc2626);
  background: var(--dsw-alias-state-error-subtle, rgba(239, 68, 68, 0.12));
  border: 1px solid var(--dsw-alias-state-error, #ef4444);
}
.omnimux-publish-accounts-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, #64748b);
}
.omnimux-publish-accounts-groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.omnimux-publish-accounts-group-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f172a);
}
.omnimux-publish-accounts-platform { flex: 1; min-width: 0; }
.omnimux-publish-accounts-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 4px;
}
.omnimux-publish-accounts-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, #0f172a);
}
.omnimux-publish-accounts-row:hover {
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.04));
}
.omnimux-publish-accounts-row.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.omnimux-publish-accounts-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-publish-accounts-unavail {
  flex: none;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}
.omnimux-publish-accounts-foot {
  flex: none;
  padding-top: 8px;
  border-top: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #64748b);
}

.omnimux-publish-form {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 20px 24px;
  overflow: auto;
  box-sizing: border-box;
}
.omnimux-publish-lock {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}
.omnimux-publish-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.omnimux-publish-field.dim { opacity: 0.55; }
.omnimux-publish-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #0f172a);
}
.omnimux-publish-textarea {
  width: 100%;
  min-height: 96px;
  padding: 10px 12px;
  box-sizing: border-box;
  resize: vertical;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.04));
  color: var(--dsw-alias-label-primary, #0f172a);
  font: inherit;
  line-height: 1.5;
}
.omnimux-publish-textarea:focus {
  outline: none;
  border-color: var(--dsw-alias-brand, #2563eb);
  box-shadow: 0 0 0 2px var(--dsw-alias-brand-subtle, rgba(37, 99, 235, 0.18));
}
.omnimux-publish-media {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: stretch;
}
.omnimux-publish-media-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 120px;
}
.omnimux-publish-media-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.omnimux-publish-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  background: var(--dsw-alias-thumb-bg, #475569);
  color: var(--dsw-alias-label-inverse, #ffffff);
  overflow: hidden;
}
.omnimux-publish-thumb.sm {
  width: 48px;
  height: 48px;
}
.omnimux-publish-add-media {
  min-width: 120px;
  min-height: 120px;
  height: auto !important;
  align-self: stretch;
}
.omnimux-publish-cover-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.omnimux-publish-cover-note {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #64748b);
}
.omnimux-publish-hint {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}
.omnimux-publish-hint.warn {
  color: var(--dsw-alias-state-warn-text, #b45309);
}

/* ---- Record detail ---- */
.omnimux-publish-detail-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
}
.omnimux-publish-detail-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary, #0f172a);
}
.omnimux-publish-section {
  padding: 16px 20px 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f172a);
}
.omnimux-publish-tasks {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 20px 24px;
}
.omnimux-publish-task {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.04));
}
.omnimux-publish-task-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, #0f172a);
}
.omnimux-publish-dot {
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}
.omnimux-publish-task-status {
  font-weight: 600;
}
.omnimux-publish-task-status[data-status="published"] { color: var(--dsw-alias-state-success, #10b981); }
.omnimux-publish-task-status[data-status="failed"] { color: var(--dsw-alias-state-error, #ef4444); }
.omnimux-publish-task-status[data-status="reviewing"] { color: var(--dsw-alias-state-warn, #f59e0b); }
.omnimux-publish-task-status[data-status="publishing"],
.omnimux-publish-task-status[data-status="submitted"] { color: var(--dsw-alias-state-publishing, #2563eb); }
.omnimux-publish-task-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #64748b);
}
.omnimux-publish-task-err {
  margin-top: 6px;
  font-size: 12px;
  color: var(--dsw-alias-state-error-text, #dc2626);
}

/* ---- Stage 顶层视图切换（发布 / 账号） ---- */
.omnimux-publish-stage-switch {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 20px 8px;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.omnimux-publish-stage-switch-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #64748b);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.omnimux-publish-stage-switch-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #0f172a);
}
.omnimux-publish-stage-switch-btn.active {
  background: var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, 0.09));
  color: var(--dsw-alias-label-primary, #0f172a);
  font-weight: 600;
}
.omnimux-publish-stage-switch-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #2563eb);
  outline-offset: 2px;
}

/* ---- 账号侧栏视图（omnimux-publish-accounts-view 体系） ---- */
.omnimux-publish-accounts-view {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.omnimux-publish-accounts-sidebar {
  flex: none;
  width: 336px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  box-sizing: border-box;
  border-right: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.04));
  overflow: auto;
}
.omnimux-publish-accounts-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.omnimux-publish-accounts-head-title {
  font-size: 16px;
  font-weight: 700;
  line-height: 24px;
  color: var(--dsw-alias-label-primary, #0f172a);
}
.omnimux-publish-accounts-add { width: 100%; }

.omnimux-publish-accounts-search {
  position: relative;
  display: flex;
  align-items: center;
}
.omnimux-publish-accounts-search-icon {
  position: absolute;
  left: 10px;
  display: inline-flex;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  pointer-events: none;
}
.omnimux-publish-accounts-search-input {
  width: 100%;
  height: 32px;
  padding: 0 10px 0 32px;
  box-sizing: border-box;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #0f172a);
  font: inherit;
  font-size: 13px;
}
.omnimux-publish-accounts-search-input::placeholder {
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}
.omnimux-publish-accounts-search-input:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary, #2563eb);
  box-shadow: 0 0 0 2px var(--dsw-alias-state-business-tertiary, rgba(37, 99, 235, 0.18));
}

.omnimux-publish-accounts-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.omnimux-publish-accounts-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
}
.omnimux-publish-accounts-item:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.omnimux-publish-accounts-avatar {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--dsw-alias-platform-tiktok, #2C2C2A);
  color: var(--dsw-alias-label-inverse, #ffffff);
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
}
.omnimux-publish-accounts-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.omnimux-publish-accounts-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.omnimux-publish-accounts-item-name {
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  color: var(--dsw-alias-label-primary, #0f172a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-publish-accounts-item-handle {
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-publish-accounts-item-status {
  flex: none;
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.omnimux-publish-accounts-item-status.success {
  background: var(--dsw-alias-state-success-subtle, rgba(16, 185, 129, 0.12));
  color: var(--dsw-alias-state-success-text, #059669);
}
.omnimux-publish-accounts-item-status.warn {
  background: var(--dsw-alias-state-warn-subtle, rgba(245, 158, 11, 0.12));
  color: var(--dsw-alias-state-warn-text, #d97706);
}
.omnimux-publish-accounts-item-status.error {
  background: var(--dsw-alias-state-error-subtle, rgba(239, 68, 68, 0.12));
  color: var(--dsw-alias-state-error-text, #dc2626);
}
.omnimux-publish-accounts-item-status.muted {
  background: var(--dsw-alias-state-draft-subtle, rgba(100, 116, 139, 0.12));
  color: var(--dsw-alias-label-secondary, #64748b);
}
.omnimux-publish-accounts-item-menu {
  flex: none;
  display: inline-flex;
  align-items: center;
  margin-left: -4px;
}
.omnimux-publish-accounts-item-menu button {
  width: 28px;
  height: 28px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-publish-accounts-item-menu button:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}

.omnimux-publish-accounts-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 16px;
  text-align: center;
}
.omnimux-publish-accounts-empty-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, #64748b);
}
.omnimux-publish-accounts-note {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}
.omnimux-publish-accounts-error {
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--dsw-alias-state-error-text, #dc2626);
  background: var(--dsw-alias-state-error-subtle, rgba(239, 68, 68, 0.12));
  border: 1px solid var(--dsw-alias-state-error, #ef4444);
}

.omnimux-publish-accounts-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  text-align: center;
}
.omnimux-publish-accounts-panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f172a);
}
.omnimux-publish-accounts-panel-body {
  max-width: 420px;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}

/* ---- 授权确认弹窗（警示横幅 + 等待态） ---- */
.omnimux-publish-accounts-warn {
  border: 1px solid var(--dsw-alias-state-warn, #f59e0b);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.04));
  overflow: hidden;
}
.omnimux-publish-accounts-warn-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  box-sizing: border-box;
  border: none;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}
.omnimux-publish-accounts-warn-icon {
  flex: none;
  display: inline-flex;
  color: var(--dsw-alias-state-warn, #f59e0b);
}
.omnimux-publish-accounts-warn-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f172a);
}
.omnimux-publish-accounts-warn-chevron {
  flex: none;
  display: inline-flex;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  transition: transform 0.15s ease;
}
.omnimux-publish-accounts-warn-detail {
  padding: 0 12px 12px 36px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #64748b);
}
.omnimux-publish-accounts-modal-note {
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary, #0f172a);
}
.omnimux-publish-accounts-modal-hint {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}
.omnimux-publish-accounts-modal-error {
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover-danger);
  border: 1px solid var(--dsw-alias-state-error-primary);
}
`

export function ensureCss() {
  if (typeof document === 'undefined') return
  if (document.getElementById(CSS_ID)) return
  const style = document.createElement('style')
  style.id = CSS_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

/** Stage-contract alias: PublishStage must call inject*Styles() at top level
 *  (scripts/verify-stage-contracts.mjs rule 4). Same injection as ensureCss. */
export function injectPublishStyles() {
  ensureCss()
}
