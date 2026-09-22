/**
 * 输入框下方四条快捷方式的样式。
 *
 * 与仓库既有做法一致：样式集中在本模块的样式表里，JSX 零内联业务样式
 * （design.md 的 UI02 硬门禁）；色彩一律取既有 design token，不新造色值。
 */

export const QUICK_SHORTCUTS_STYLE_ID = 'omnimux-quick-shortcuts-style';

export const QUICK_SHORTCUTS_CSS = `
.omx-quick-shortcuts {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: var(--dsh-composer-card-max-width, 952px);
  max-width: 100%;
  margin: 8px auto 0;
  padding: 0;
}

.omx-quick-shortcut-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border));
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-s-14, inherit);
  font-size: 13px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, transform 120ms cubic-bezier(0.16, 1, 0.3, 1);
}

.omx-quick-shortcut-btn:hover {
  border-color: var(--dsw-alias-border-l3, var(--dsw-alias-border-hover));
}

.omx-quick-shortcut-btn:active {
  transform: scale(0.97);
}

.omx-quick-shortcut-btn.is-active {
  border-color: var(--dsw-alias-brand-primary, var(--dsw-alias-border-hover));
  background: var(--dsw-alias-state-business-tertiary, var(--dsw-alias-interactive-bg-active));
  color: var(--dsw-alias-label-primary);
}

.omx-quick-shortcut-icon {
  display: inline-flex;
  flex: none;
  opacity: 0.75;
}

.omx-quick-shortcut-controls {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: 4px;
}
`;

/**
 * 幂等注入样式表。
 * @param {Document | null} [doc]
 * @returns {() => void} 卸载函数
 */
export function ensureQuickShortcutStyles(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || !doc.head) return () => {};
  if (doc.getElementById(QUICK_SHORTCUTS_STYLE_ID)) return () => {};
  const style = doc.createElement('style');
  style.id = QUICK_SHORTCUTS_STYLE_ID;
  style.textContent = QUICK_SHORTCUTS_CSS;
  doc.head.appendChild(style);
  return () => {
    try {
      doc.getElementById(QUICK_SHORTCUTS_STYLE_ID)?.remove();
    } catch {
      // 宿主已卸载时忽略
    }
  };
}
