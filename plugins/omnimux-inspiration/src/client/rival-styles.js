/**
 * Styles of the rival workbench.
 *
 * Its own style node rather than an append to `styles.js`: the two module's
 * selectors never overlap, and a separate id keeps the injected sheet ordering
 * independent of which panel mounted first. Every colour is a `--dsw-*` token
 * and every size is on the UI10 whitelist.
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
.omnimux-rival-columns {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 16px;
  min-height: 0;
  align-items: start;
}
.omnimux-rival-left,
.omnimux-rival-right {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.omnimux-rival-toolbar,
.omnimux-rival-filters,
.omnimux-rival-post-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.omnimux-rival-account-list,
.omnimux-rival-post-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.omnimux-rival-account-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.omnimux-rival-account-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-secondary);
  border-radius: 8px;
  background: var(--dsw-alias-bg-secondary);
  cursor: pointer;
  text-align: left;
}
.omnimux-rival-account-card.is-active {
  border-color: var(--dsw-alias-interactive-border-active);
  background: var(--dsw-alias-interactive-bg-active);
}
.omnimux-rival-account-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.omnimux-rival-account-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 14px;
  background: var(--dsw-alias-bg-tertiary);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  flex: none;
}
.omnimux-rival-account-titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.omnimux-rival-account-name {
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.omnimux-rival-account-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-rival-platform-mark {
  flex: none;
}
.omnimux-rival-account-stats,
.omnimux-rival-account-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-rival-account-state[data-state="running"],
.omnimux-rival-account-state[data-state="queued"] {
  color: var(--dsw-alias-label-primary);
}
.omnimux-rival-account-state[data-state="error"],
.omnimux-rival-account-state[data-state="paused"] {
  color: var(--dsw-alias-state-error-text);
}
.omnimux-rival-account-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.omnimux-rival-tag {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-tertiary);
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
}
.omnimux-rival-account-hint,
.omnimux-rival-account-error {
  margin: 0;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-rival-account-error {
  color: var(--dsw-alias-state-error-text);
}
.omnimux-rival-post-card {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-secondary);
  border-radius: 8px;
  background: var(--dsw-alias-bg-secondary);
}
.omnimux-rival-post-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  overflow: hidden;
  background: var(--dsw-alias-bg-tertiary);
}
.omnimux-rival-post-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.omnimux-rival-post-placeholder {
  display: block;
  width: 100%;
  height: 100%;
}
.omnimux-rival-post-duration,
.omnimux-rival-post-badge {
  position: absolute;
  bottom: 4px;
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-inverse);
  color: var(--dsw-alias-label-inverse);
  font-size: 10px;
}
.omnimux-rival-post-duration { right: 4px; }
.omnimux-rival-post-badge { left: 4px; }
.omnimux-rival-post-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.omnimux-rival-post-title {
  margin: 0;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.omnimux-rival-post-meta,
.omnimux-rival-post-stats,
.omnimux-rival-post-rules {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-rival-post-stat {
  display: inline-flex;
  gap: 4px;
}
.omnimux-rival-post-stat-value {
  color: var(--dsw-alias-label-primary);
}
.omnimux-rival-rule {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-tertiary);
  font-size: 10px;
}
.omnimux-rival-post-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.omnimux-rival-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
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
.omnimux-rival-notice,
.omnimux-rival-banner {
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
.omnimux-rival-carryover {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
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
.omnimux-rival-post-skeleton {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 10px;
}
.omnimux-rival-post-skel {
  grid-column: 1 / -1;
  height: 92px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-tertiary);
}
@media (max-width: 900px) {
  .omnimux-rival-columns {
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
