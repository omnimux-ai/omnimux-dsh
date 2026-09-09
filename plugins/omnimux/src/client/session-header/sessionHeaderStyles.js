export const SESSION_HEADER_CSS = `
.omnimux-session-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  vertical-align: middle;
}

.omnimux-header-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  padding: 0;
  transition: all 0.15s ease;
  position: relative;
}

.omnimux-header-action-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l1);
}

.omnimux-header-action-btn:active {
  background: var(--dsw-alias-interactive-bg-active);
}

.omnimux-header-action-btn svg {
  width: 14px;
  height: 14px;
  display: block;
}

.omnimux-session-toast {
  position: fixed;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--dsw-alias-bg-elevated);
  color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  z-index: 10000;
  box-shadow: 0 4px 16px var(--dsw-alias-bg-mask-1);
  pointer-events: none;
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.omnimux-snapshot-popover {
  position: fixed;
  background: var(--dsw-alias-bg-elevated);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  width: 280px;
  max-height: 380px;
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-1);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: omnimux-popover-in 0.15s ease-out;
}

@keyframes omnimux-popover-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.omnimux-snapshot-popover-header {
  padding: 10px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.omnimux-snapshot-popover-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.omnimux-snapshot-popover-count {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}

.omnimux-snapshot-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.omnimux-snapshot-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.omnimux-snapshot-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s ease;
}

.omnimux-snapshot-item:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.omnimux-snapshot-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.omnimux-snapshot-item-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 170px;
}

.omnimux-snapshot-item-time {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary);
}

.omnimux-snapshot-item-excerpt {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;

export function injectSessionHeaderStyles(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return;
  const id = 'omnimux-session-header-styles';
  if (doc.getElementById(id)) return;
  const style = doc.createElement('style');
  style.id = id;
  style.textContent = SESSION_HEADER_CSS;
  doc.head.appendChild(style);
}
