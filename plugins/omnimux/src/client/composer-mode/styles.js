/**
 * @file styles.js
 * 输入框创作模式切换栏（Agent / 营销 / 短剧）样式表
 * 严格遵循 100% --dsw-* 设计令牌规范
 */

export const COMPOSER_MODE_STYLES_ID = 'omnimux-composer-mode-styles'

export const COMPOSER_MODE_CSS = `
/* 外层居中包装器 */
.omnimux-composer-mode-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  margin: 0 auto 10px auto;
  pointer-events: auto;
  user-select: none;
  z-index: 2;
}

/* 胶囊分段选择器壳体 (1:1 像素级复刻参考图) */
.omnimux-composer-mode-pill {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 9999px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: var(--dsw-alias-shadow-sm);
  box-sizing: border-box;
}

/* 单个模式 Tab 按钮 */
.omnimux-composer-mode-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 16px;
  border-radius: 9999px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-text-secondary);
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  font-family: inherit;
  letter-spacing: 0.2px;
  cursor: pointer;
  transition: background 0.18s cubic-bezier(0.4, 0, 0.2, 1),
              color 0.18s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
  white-space: nowrap;
}

.omnimux-composer-mode-tab:hover:not(.active) {
  color: var(--dsw-alias-text-strong);
  background: var(--dsw-alias-interactive-bg-hover);
}

/* 激活态 Tab (1:1 对标参考图高亮胶囊) */
.omnimux-composer-mode-tab.active {
  background: var(--dsw-alias-bg-layer-4);
  color: var(--dsw-alias-text-strong);
  font-weight: 600;
  box-shadow: var(--dsw-alias-shadow-sm);
  cursor: default;
}

.omnimux-composer-mode-tab:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
`

export function ensureComposerModeStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(COMPOSER_MODE_STYLES_ID)) return

  const style = document.createElement('style')
  style.id = COMPOSER_MODE_STYLES_ID
  style.textContent = COMPOSER_MODE_CSS
  document.head.appendChild(style)
}
