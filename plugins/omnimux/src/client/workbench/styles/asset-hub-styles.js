/**
 * Asset Hub CSS Styles Runtime Injector.
 * 100% 消费官方 --dsw-alias-* Token，严格遵循 32px 控件高度基准、8px 圆角体系。
 * 适配 6 大主库 Tab 单行弹性排布与共享 Tab 样式体系。
 */

export const ASSET_HUB_STYLE_ID = 'omnimux-asset-hub-styles'

export const ASSET_HUB_CSS = `
.omx-hub-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  box-sizing: border-box;
  overflow: hidden;
}

/* 顶栏 Header (高度 48px) */
.omx-hub-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  flex: 0 0 48px;
  padding: 0 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  box-sizing: border-box;
  gap: 8px;
}

.omx-hub-header__tabs {
  display: flex;
  align-items: center;
  height: 100%;
  min-width: 0;
  flex: 1 1 auto;
  overflow-x: auto;
  scrollbar-width: none;
}

.omx-hub-header__tabs::-webkit-scrollbar {
  display: none;
}

/* 共享一级主导航 Tabs */
.omx-shared-primary-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 100%;
  flex-wrap: nowrap;
}

.omx-shared-primary-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
  transition: color 0.15s ease, background 0.15s ease;
  user-select: none;
}

.omx-shared-primary-tab__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
}

.omx-shared-primary-tab:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

.omx-shared-primary-tab.is-active {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-active);
  font-weight: 600;
}

/* 兼容旧 Tab 类名 */
.omx-hub-header__tab {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.omx-hub-header__tab:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

.omx-hub-header__tab.is-active {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-active);
  font-weight: 600;
}

.omx-hub-header__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
}

.omx-hub-header__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.omx-hub-header__btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.omx-hub-header__btn:active {
  background: var(--dsw-alias-interactive-bg-active);
  transform: scale(0.96);
}

/* 筛选栏 Toolbar (高度 48px，单行不折行) */
.omx-hub-toolbar {
  display: flex;
  align-items: center;
  height: 48px;
  flex: 0 0 48px;
  padding: 0 12px;
  gap: 10px;
  flex-wrap: nowrap;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  box-sizing: border-box;
}

.omx-hub-toolbar__search {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  flex: 1 1 140px;
  max-width: 220px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-tertiary);
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}

.omx-hub-toolbar__search:focus-within {
  border-color: var(--dsw-alias-border-l4);
  color: var(--dsw-alias-label-primary);
}

.omx-hub-toolbar__input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  outline: none;
}

.omx-hub-toolbar__input::placeholder {
  color: var(--dsw-alias-label-tertiary);
}

.omx-hub-toolbar__filters {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  flex: 1 1 auto;
  min-width: 0;
}

.omx-hub-toolbar__filters::-webkit-scrollbar {
  display: none;
}

/* 共享二级分类 Tabs (pill 胶囊与 underline 下划线) */
.omx-shared-sub-tabs {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
}

.omx-shared-sub-tab--pill {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 9999px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.omx-shared-sub-tab--pill:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.omx-shared-sub-tab--pill.is-active {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
  border-color: var(--dsw-alias-label-primary);
  font-weight: 500;
}

.omx-shared-sub-tab--underline {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
  white-space: nowrap;
  transition: color 0.15s ease;
  flex-shrink: 0;
}

.omx-shared-sub-tab--underline:hover {
  color: var(--dsw-alias-label-primary);
}

.omx-shared-sub-tab--underline.is-active {
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.omx-shared-sub-tab--underline.is-active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--dsw-alias-label-primary);
  border-radius: 2px;
}

/* 兼容旧 pill 类名 */
.omx-hub-toolbar__pill {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 9999px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.omx-hub-toolbar__pill:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.omx-hub-toolbar__pill.is-active {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
  border-color: var(--dsw-alias-label-primary);
  font-weight: 500;
}

.omx-hub-toolbar__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  margin-left: auto;
  flex-shrink: 0;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.omx-hub-toolbar__action:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  border-color: var(--dsw-alias-border-l3);
}

.omx-hub-toolbar__action:active {
  transform: scale(0.97);
}

/* 内容卡片区 */
.omx-hub-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  box-sizing: border-box;
}

.omx-hub-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  align-items: start;
}

/* 素材卡片 */
.omx-asset-card {
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  user-select: none;
}

.omx-asset-card:hover {
  border-color: var(--dsw-alias-border-l3);
  transform: translateY(-2px);
}

.omx-asset-card:active {
  transform: scale(0.98);
}

.omx-asset-card.is-selected {
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary);
}

.omx-asset-card__cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.omx-asset-card__img,
.omx-asset-card__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.omx-asset-card__fallback {
  color: var(--dsw-alias-label-tertiary);
}

.omx-asset-card__badge {
  position: absolute;
  right: 6px;
  bottom: 6px;
  height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-mask-1);
  color: var(--dsw-static-neutral-00);
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  display: inline-flex;
  align-items: center;
  line-height: 1;
}

.omx-asset-card__check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: 9999px;
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-label-primary-inverted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px var(--dsw-alias-border-l2);
}

.omx-asset-card__meta {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.omx-asset-card__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.omx-asset-card__sub {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 状态机呈现 (空态 / 报错 / 搜索无结果) */
.omx-hub-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary);
  gap: 16px;
}

.omx-hub-state__msg {
  margin: 0;
  font-size: 14px;
  color: var(--dsw-alias-label-secondary);
}

.omx-hub-state__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.omx-hub-state__btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  border-color: var(--dsw-alias-border-l3);
}

/* 骨架屏 */
.omx-hub-skeleton-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-radius: 10px;
  padding: 8px;
  background: var(--dsw-alias-bg-layer-1);
}

.omx-hub-skeleton-cover {
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  animation: omx-skeleton-pulse 1.4s ease-in-out infinite;
}

.omx-hub-skeleton-line {
  height: 14px;
  width: 70%;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  animation: omx-skeleton-pulse 1.4s ease-in-out infinite;
}

.omx-hub-skeleton-sub {
  height: 10px;
  width: 40%;
  border-radius: 3px;
  background: var(--dsw-alias-bg-layer-2);
  animation: omx-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes omx-skeleton-pulse {
  0% { opacity: 0.5; }
  50% { opacity: 1; }
  100% { opacity: 0.5; }
}

.omx-hub-notice-toast {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  padding: 8px 16px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-layer-2, #24252a)); /* exempt-ui03: toast background fallback */
  color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: 0 4px 16px var(--dsw-alias-bg-mask-2);
  font-size: 13px;
  font-weight: 500;
  pointer-events: none;
}
`

export function installAssetHubStyles(doc) {
  if (!doc?.head) return () => {}
  let style = doc.getElementById(ASSET_HUB_STYLE_ID)
  if (!style) {
    style = doc.createElement('style')
    style.id = ASSET_HUB_STYLE_ID
    doc.head.appendChild(style)
  }
  if (style.textContent !== ASSET_HUB_CSS) {
    style.textContent = ASSET_HUB_CSS
  }
  return () => {
    style?.remove()
  }
}
