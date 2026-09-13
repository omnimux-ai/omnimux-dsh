/**
 * Styles of the 账号监控 tab.
 *
 * Its own style node rather than an append to `styles.js`: the two modules'
 * selectors never overlap, and a separate id keeps the injected sheet ordering
 * independent of which panel mounted first. Every colour is a `--dsw-*` token
 * and every size is on the UI10 whitelist.
 *
 * The two-column workbench styles are gone with the workbench: the account
 * dimension is a 32px trigger plus a frosted panel now, and the works render in
 * the library's own 9:16 grid, whose rules stay in `styles.js` and are shared
 * rather than copied here.
 */

export const RIVAL_STYLES_ID = 'omnimux-rival-accounts-styles'

export const RIVAL_CSS = `
.omnimux-rival-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-height: 0;
}
.omnimux-rival-root[data-active="false"] {
  display: none;
}

/* 「正在浏览：…」+「显示 N 个作品」 */
.omnimux-rival-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 4px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-rival-summary-count {
  flex: none;
  color: var(--dsw-alias-label-secondary);
}

/* ── 账号筛选（多选） ───────────────────────────────────────────────── */
.omnimux-rival-filter {
  position: relative;
  flex: none;
}
.omnimux-rival-filter-trigger {
  height: 32px;
  min-height: 32px;
  padding: 0 10px 0 12px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 500;
  gap: 8px;
}
.omnimux-rival-filter-trigger:hover {
  border-color: var(--dsw-alias-border-l3);
  background: var(--dsw-alias-interactive-bg-hover);
}
.omnimux-rival-filter-trigger.is-open {
  border-color: var(--dsw-alias-border-l4);
  background: var(--dsw-alias-bg-layer-2);
}
.omnimux-rival-filter-trigger-label {
  white-space: nowrap;
}
.omnimux-rival-filter-panel {
  position: absolute;
  top: 38px;
  right: 0;
  width: 290px;
  z-index: 100;
  padding: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-elevated);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 12px 32px var(--dsw-alias-bg-mask-1), 0 2px 8px var(--dsw-alias-bg-mask-1);
  animation: omni-rival-pop 120ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes omni-rival-pop {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.omnimux-rival-filter-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px 8px;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.omnimux-rival-filter-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-rival-filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.omnimux-rival-filter-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  overflow-y: auto;
}
.omnimux-rival-filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 120ms ease;
}
.omnimux-rival-filter-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.omnimux-rival-filter-row:focus-visible {
  outline: 2px solid var(--dsw-alias-border-l3);
  outline-offset: -2px;
}
.omnimux-rival-filter-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  flex: none;
  border: 1.5px solid var(--dsw-alias-border-l3);
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-primary-foreground);
  transition: background 120ms ease, border-color 120ms ease;
}
.omnimux-rival-filter-row[data-checked="true"] .omnimux-rival-filter-check {
  border-color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-label-primary);
}
.omnimux-rival-filter-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: none;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 13px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  font-size: 11px;
  font-weight: 600;
  overflow: hidden;
}
.omnimux-rival-filter-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.omnimux-rival-filter-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}
.omnimux-rival-filter-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.omnimux-rival-filter-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-rival-filter-jump {
  width: 18px;
  min-width: 18px;
  height: 18px;
  min-height: 18px;
  flex: none;
  opacity: 0;
  pointer-events: none;
  transform: scale(0.9);
  color: var(--dsw-alias-label-tertiary);
  transition: opacity 150ms ease, transform 150ms ease, background 120ms ease, color 120ms ease;
}
.omnimux-rival-filter-row:hover .omnimux-rival-filter-jump,
.omnimux-rival-filter-row:focus-within .omnimux-rival-filter-jump {
  opacity: 1;
  pointer-events: auto;
  transform: scale(1);
}
.omnimux-rival-filter-jump:hover {
  border-color: var(--dsw-alias-border-l3);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omnimux-rival-filter-id {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  min-width: 0;
}
.omnimux-rival-platform-mark {
  flex: none;
}
.omnimux-rival-filter-handle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-rival-filter-count {
  flex: none;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}

/* ── 空态与提示 ─────────────────────────────────────────────────────── */
.omnimux-rival-empty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px;
  align-items: center;
  text-align: center;
}
.omnimux-rival-empty-title {
  margin: 0;
  font-size: 14px;
  color: var(--dsw-alias-label-primary);
}
.omnimux-rival-empty-text {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-rival-empty-cta {
  margin-top: 4px;
}
.omnimux-rival-notice {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-tertiary);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
}
.omnimux-rival-notice p {
  margin: 0;
}
.omnimux-rival-notice.is-error {
  color: var(--dsw-alias-state-error-text);
}

/* ── 详情弹窗 ───────────────────────────────────────────────────────── */
.omnimux-rival-detail {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 16px;
}
.omnimux-rival-detail-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 9 / 16;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-module-platform);
  overflow: hidden;
}
.omnimux-rival-detail-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.omnimux-rival-detail-duration {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-mask-1);
  color: var(--dsw-alias-label-primary);
  font-size: 11px;
}
.omnimux-rival-detail-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.omnimux-rival-detail-title {
  margin: 0;
  font-size: 14px;
  color: var(--dsw-alias-label-primary);
}
.omnimux-rival-detail-author {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-rival-detail-handle {
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-rival-detail-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-rival-detail-stat {
  display: inline-flex;
  gap: 4px;
}
.omnimux-rival-detail-stat-value {
  color: var(--dsw-alias-label-primary);
}
.omnimux-rival-detail-time {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}

/* ── 导入弹窗 ───────────────────────────────────────────────────────── */
.omnimux-rival-import-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.omnimux-rival-import-echo {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-tertiary);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
}

@media (max-width: 720px) {
  .omnimux-rival-detail {
    grid-template-columns: minmax(0, 1fr);
  }
}
`

/** Inject the rival stylesheet once. */
export function injectRivalStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(RIVAL_STYLES_ID)) return
  const node = document.createElement('style')
  node.id = RIVAL_STYLES_ID
  node.textContent = RIVAL_CSS
  document.head.appendChild(node)
}
