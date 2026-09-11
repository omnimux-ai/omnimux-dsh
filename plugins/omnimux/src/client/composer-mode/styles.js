/**
 * @file styles.js
 * 输入框创作模式切换栏（Agent / 营销 / 短剧）样式表
 * 1:1 像素级复刻参考图微光 Rim Light 光影质感与通透暗底
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

/* Hero 阶段大标题正下方专属锚点 */
#omnimux-composer-mode-anchor {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 14px;
  margin-bottom: 6px;
  pointer-events: auto;
  z-index: 2;
}

#omnimux-composer-mode-anchor .omnimux-composer-mode-wrap {
  margin: 0;
}

/* 胶囊分段选择器壳体 (1:1 像素级复刻参考图通透暗色外壳) */
.omnimux-composer-mode-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 4px;
  border-radius: 9999px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: var(--dsw-alias-shadow-sm);
  box-sizing: border-box;
}

/* 单个模式 Tab 按钮基础态 (未激活状态: 纯透明底、无边框、次级灰白字) */
.omnimux-composer-mode-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 16px;
  border-radius: 9999px;
  border: 1px solid transparent;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-text-secondary);
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  font-family: inherit;
  letter-spacing: 0.2px;
  cursor: pointer;
  transition: color 0.18s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.18s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
  white-space: nowrap;
}

.omnimux-composer-mode-tab:hover:not(.active) {
  color: var(--dsw-alias-text-strong);
  background: transparent;
}

/* 激活态 Tab (1:1 复刻参考图：空白通透底色 + 精致拟物微光边框 Rim Light) */
.omnimux-composer-mode-tab.active {
  background: transparent;
  color: var(--dsw-alias-text-strong);
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.16); /* exempt-ui03 1:1复刻胶囊拟物玻璃态轮廓 */
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28), /* exempt-ui03 胶囊顶部内高光微反光 */
              0 2px 6px rgba(0, 0, 0, 0.4);            /* exempt-ui03 胶囊外环境微阴影 */
  cursor: default;
}

/* 激活态胶囊底部的弧形漫反射月牙微光 (1:1 像素级复刻参考图底部下发光) */
.omnimux-composer-mode-tab.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 18%;
  right: 18%;
  height: 1px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.65) 50%, rgba(255, 255, 255, 0) 100%); /* exempt-ui03 胶囊底部微白漫反射月牙弧光 */
  filter: blur(0.5px);
  pointer-events: none;
}

.omnimux-composer-mode-tab:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

/* 全屏专属展示规则：仅在全屏宽屏模式 (full 密度) 下呈现；分屏/窄屏紧凑状态下自动隐藏 */
html[data-omnimux-composer-density='short'] .omnimux-composer-mode-wrap,
html[data-omnimux-composer-density='icon'] .omnimux-composer-mode-wrap {
  display: none !important;
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
