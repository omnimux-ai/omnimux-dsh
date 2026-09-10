/**
 * Dark theme styles for OmniMux inspiration tab (x.ai Minimalist Hairline Architecture)
 * Fully compliant with docs/contracts/design-tokens.md + Stage standards
 */
export const INSPIRATION_STYLES_ID = 'omnimux-inspiration-styles'

export const INSPIRATION_CSS = `
.omnimux-inspiration-stage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary, inherit);
  overflow: hidden;
  box-sizing: border-box;
  pointer-events: auto;
}
.omnimux-inspiration-stage[data-visible="false"] {
  display: none !important;
  pointer-events: none;
}
.omnimux-inspiration-stage-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

/* 根容器与微光扫光关键帧 */
.omnimux-inspiration-root,
.omnimux-inspiration-root *,
.omnimux-inspiration-modal-backdrop,
.omnimux-inspiration-modal-backdrop * {
  box-sizing: border-box;
}

.omnimux-inspiration-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0 20px 24px;
  gap: 12px;
  background: var(--dsw-alias-bg-primary, var(--dsw-bg));
  color: var(--dsw-alias-label-primary, inherit);
  font-family: inherit;
}

/* Layer 2: Action Row */
.omnimux-inspiration-action-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 8px;
}

@keyframes omni-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* 顶部导航与操作栏 */
.omnimux-inspiration-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  max-width: 100%;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #222222);
}

.omnimux-inspiration-tabs {
  display: inline-flex;
  background: var(--dsw-alias-bg-module-platform, #141414);
  padding: 3px;
  border-radius: 9999px;
  border: 1px solid var(--dsw-alias-border-l2, #242424);
}

.omnimux-inspiration-tab {
  height: 28px;
  padding: 0 14px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #888888);
  font: 500 13px/16px inherit;
  cursor: pointer;
  transition: color 120ms ease,
              background 120ms ease;
}

.omnimux-inspiration-tab:hover {
  color: var(--dsw-alias-label-primary-dimmed, #ebebeb);
}

.omnimux-inspiration-tab.active {
  background: var(--dsw-alias-bg-layer-1, #242424);
  color: var(--dsw-alias-label-primary, #ffffff);
  box-shadow: 0 1px 3px var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.4));
}

.omnimux-inspiration-btn-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 16px;
  border-radius: 9999px;
  border: 1px solid var(--dsw-alias-border, rgba(255, 255, 255, 0.15));
  background: var(--dsw-alias-button-primary-fill, #ffffff);
  color: var(--dsw-alias-label-primary-foreground, #000000);
  font: 550 13px/16px inherit;
  cursor: pointer;
  box-shadow: 0 1px 4px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.2));
  transition: all 120ms cubic-bezier(0.16, 1, 0.3, 1);
}
.omnimux-inspiration-btn-add:hover {
  background: var(--dsw-alias-button-primary-hover, #ebebeb);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.35));
}
.omnimux-inspiration-btn-add:active {
  transform: translateY(0);
}

/* 极简发丝线工具栏 */
.omnimux-inspiration-toolbar {
  width: 100%;
  max-width: 100%;
  padding: 0;
}

.omnimux-inspiration-search-box {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 200px;
  min-width: 160px;
  max-width: 360px;
}

.omnimux-inspiration-search-icon {
  position: absolute;
  left: 12px;
  pointer-events: none;
  color: var(--dsw-alias-label-tertiary, #7c7c7c);
  display: flex;
  align-items: center;
  justify-content: center;
}

.omnimux-inspiration-search {
  width: 100%;
  height: 32px;
  background: var(--dsw-alias-bg-module-platform, #141414);
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  border-radius: 9999px;
  padding: 0 14px 0 34px;
  color: var(--dsw-alias-label-primary, #ffffff);
  font: 400 13px/18px inherit;
  outline: none;
  transition: border-color 120ms ease,
              background-color 120ms ease;
}
.omnimux-inspiration-search:focus {
  border-color: var(--dsw-alias-border-hover, rgba(255, 255, 255, 0.4));
  background: var(--dsw-alias-bg-layer-1, #1a1a1a);
}

.omnimux-inspiration-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: auto;
}

.omnimux-inspiration-select {
  height: 32px;
  background: var(--dsw-alias-bg-module-platform, #141414);
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  border-radius: 9999px;
  padding: 0 12px;
  color: var(--dsw-alias-label-primary-dimmed, #ebebeb);
  font: 500 12px/16px inherit;
  cursor: pointer;
  outline: none;
  transition: border-color 120ms ease,
              background-color 120ms ease;
}
.omnimux-inspiration-select:hover {
  border-color: var(--dsw-alias-border-l4, #3d3d3d);
  background: var(--dsw-alias-bg-layer-1, #1a1a1a);
}
.omnimux-inspiration-select:focus {
  border-color: var(--dsw-alias-border-hover, rgba(255, 255, 255, 0.4));
}

/* 紧凑型筛选器下拉按钮 (缩短宽度) */
.omnimux-inspiration-filter-select .dshUk-DropdownSelect-trigger,
.omnimux-inspiration-filter-select > button {
  min-width: 74px !important;
  width: auto;
  padding: 0 10px;
  gap: 6px;
}
.omnimux-inspiration-filter-select .dshUk-DropdownSelect-label {
  font-size: 13px;
}

/* 二级复合筛选行 */
.omnimux-inspiration-subfilter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 0 12px 0;
  width: 100%;
}

.omnimux-inspiration-subfilter-select .dshUk-DropdownSelect-trigger,
.omnimux-inspiration-subfilter-select > button {
  min-width: 90px !important;
  height: 32px;
  background: var(--dsw-alias-bg-module-platform, #141414);
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #ffffff);
  transition: all 120ms ease;
}

.omnimux-inspiration-subfilter-select .dshUk-DropdownSelect-trigger:hover,
.omnimux-inspiration-subfilter-select > button:hover {
  border-color: var(--dsw-alias-border-hover, rgba(255, 255, 255, 0.4));
  background: var(--dsw-alias-bg-layer-1, #1a1a1a);
}

.omnimux-inspiration-subfilter-select .dshUk-DropdownSelect-label {
  font-size: 13px;
}

/* 9:16 原子化扫光骨架屏矩阵 */
.omnimux-inspiration-skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
  width: 100%;
  max-width: 100%;
}
@media (min-width: 1600px) {
  .omnimux-inspiration-skeleton {
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 18px;
  }
}
.omnimux-inspiration-skel {
  position: relative;
  width: 100%;
  aspect-ratio: 9 / 16;
  border-radius: 10px;
  background: var(--dsw-alias-bg-module-platform, #141414);
  border: 1px solid var(--dsw-alias-border-l2, #222222);
  overflow: hidden;
}
.omnimux-inspiration-skel::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, var(--dsw-alias-bg-secondary, rgba(255, 255, 255, 0.04)) 50%, transparent 100%);
  animation: omni-shimmer 1.4s infinite;
}

/* 统一卡片网格 */
.omnimux-inspiration-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
  width: 100%;
  max-width: 100%;
  animation: omni-fade-in 160ms ease;
}
@media (min-width: 1600px) {
  .omnimux-inspiration-grid {
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 18px;
  }
}
@media (max-width: 640px) {
  .omnimux-inspiration-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
}

/* 批量多选操作栏 */
.omnimux-inspiration-selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  max-width: 100%;
  padding: 8px 14px;
  background: var(--dsw-alias-bg-layer-1, #181818);
  border: 1px solid var(--dsw-alias-border-l4, #333333);
  border-radius: 12px;
  animation: omni-fade-in 140ms ease;
  box-shadow: 0 4px 16px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.4));
}
.omnimux-inspiration-selection-count {
  font: 500 13px/18px inherit;
  color: var(--dsw-alias-label-primary, #ffffff);
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-inspiration-selection-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.omnimux-inspiration-btn-ghost {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #8e8e8e);
  cursor: pointer;
  font: 500 13px/18px inherit;
  padding: 4px 10px;
  border-radius: 9999px;
  transition: color 120ms ease;
}
.omnimux-inspiration-btn-ghost:hover {
  color: var(--dsw-alias-label-primary, #ffffff);
  background: var(--dsw-alias-bg-secondary, rgba(255, 255, 255, 0.06));
}
.omnimux-inspiration-btn-danger {
  border: none;
  background: var(--dsw-alias-state-error-primary, #ef4444);
  color: var(--dsw-alias-label-primary, #ffffff);
  border-radius: 9999px;
  padding: 5px 14px;
  cursor: pointer;
  font: 600 13px/18px inherit;
  transition: all 120ms ease;
}
.omnimux-inspiration-btn-danger:hover {
  background: var(--dsw-alias-state-error-primary, #dc2626);
  transform: translateY(-1px);
}

.omnimux-inspiration-card-pure {
  position: relative;
  width: 100%;
  aspect-ratio: 9 / 16;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background: var(--dsw-alias-bg-module-platform, #131313);
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  transition: transform 180ms cubic-bezier(.2,.4,.6,1),
              border-color 180ms cubic-bezier(.2,.4,.6,1),
              box-shadow 180ms ease;
}
.omnimux-inspiration-card-pure > [class*="body"] {
  display: none;
}
.omnimux-inspiration-card-pure[aria-selected="true"] {
  border-color: var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.7));
  box-shadow: 0 0 0 1px var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.7)), 0 8px 24px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.5));
}
.omnimux-inspiration-card-pure:hover {
  transform: translateY(-3px);
  border-color: var(--dsw-alias-border-l4, #4a4a4a);
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.45));
}

/* 卡片左上角复选框 Checkbox */
.omnimux-inspiration-stage .omnimux-inspiration-card-pure .omnimux-inspiration-card-check,
.omnimux-inspiration-stage .omnimux-inspiration-card-pure .omnimux-inspiration-card-check:hover,
.omnimux-inspiration-stage .omnimux-inspiration-card-pure .omnimux-inspiration-card-check:active {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 22px;
  min-width: 22px;
  height: 22px;
  min-height: 22px;
  border-radius: 6px;
  border: 1.5px solid var(--dsw-alias-border-hover, rgba(255, 255, 255, 0.4));
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.5));
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 5;
  color: var(--dsw-alias-bg-base, #000000);
  opacity: 0;
  transform: scale(0.9);
  transition: opacity 120ms ease,
              transform 120ms ease,
              background-color 120ms ease,
              border-color 120ms ease;
}
.omnimux-inspiration-stage .omnimux-inspiration-card-pure:hover .omnimux-inspiration-card-check,
.omnimux-inspiration-stage .omnimux-inspiration-card-pure .omnimux-inspiration-card-check[data-selected="true"],
.omnimux-inspiration-stage .omnimux-inspiration-grid.selecting .omnimux-inspiration-card-check {
  opacity: 1;
  transform: scale(1);
}
.omnimux-inspiration-stage .omnimux-inspiration-card-pure .omnimux-inspiration-card-check[data-selected="true"] {
  background: var(--dsw-alias-label-primary, #ffffff);
  border-color: var(--dsw-alias-label-primary, #ffffff);
}
.omnimux-inspiration-stage .omnimux-inspiration-card-pure .omnimux-inspiration-card-check:hover {
  border-color: var(--dsw-alias-label-primary, rgba(255, 255, 255, 0.85));
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.7));
}
.omnimux-inspiration-stage .omnimux-inspiration-card-pure .omnimux-inspiration-card-check[data-selected="true"]:hover {
  background: var(--dsw-alias-button-primary-hover, #ebebeb);
  border-color: var(--dsw-alias-button-primary-hover, #ebebeb);
}
.omnimux-inspiration-cover-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--dsw-alias-bg-layer-1, #181818);
}

/* Fallback 占位卡片 */
.omnimux-inspiration-cover-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  aspect-ratio: 9 / 16;
  background: radial-gradient(circle at 50% 30%, var(--dsw-alias-bg-layer-2, #202020) 0%, var(--dsw-alias-bg-base, #111111) 100%);
  padding: 16px;
  gap: 12px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary, #7c7c7c);
}
.omnimux-inspiration-fallback-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-secondary, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-primary-dimmed, #ebebeb);
}
.omnimux-inspiration-fallback-title {
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #888888);
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
}

/* 卡片角标 Badge (置于右上角) */
.omnimux-inspiration-badge-platform {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 4;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  font-family: monospace;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.65));
  backdrop-filter: blur(8px);
  border: 1px solid var(--dsw-alias-border, rgba(255, 255, 255, 0.15));
  color: var(--dsw-alias-label-primary, #ffffff);
  letter-spacing: 0.5px;
}
.omnimux-inspiration-badge-platform.local {
  border-color: var(--dsw-alias-state-success-primary, #10b981);
  color: var(--dsw-alias-state-success-primary, #10b981);
  background: var(--dsw-alias-state-success-tertiary, rgba(16, 185, 129, 0.2));
}

/* Hover 浮层 */
.omnimux-inspiration-card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.3)) 0%, var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.1)) 40%, var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.75)) 100%);
  opacity: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 12px;
  transition: opacity 120ms ease;
  pointer-events: none;
}
.omnimux-inspiration-card-pure:hover .omnimux-inspiration-card-overlay {
  opacity: 1;
}
.omnimux-inspiration-overlay-play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.9);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--dsw-alias-button-primary-fill, #ffffff);
  color: var(--dsw-alias-label-primary-foreground, #0a0a0a);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 120ms ease;
  box-shadow: 0 4px 16px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.45));
}
.omnimux-inspiration-card-pure:hover .omnimux-inspiration-overlay-play {
  transform: translate(-50%, -50%) scale(1);
}
.omnimux-inspiration-overlay-play svg {
  width: 20px;
  height: 20px;
  margin-left: 2px;
}
.omnimux-inspiration-overlay-cta {
  position: relative;
  z-index: 6;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: stretch;
  gap: 6px;
  width: 100%;
  margin-bottom: 8px;
  padding: 0 2px;
  box-sizing: border-box;
  pointer-events: auto;
}
.omnimux-inspiration-grid.selecting .omnimux-inspiration-overlay-cta {
  display: none;
}
.omnimux-inspiration-overlay-cta-btn {
  display: inline-flex;
  flex: 1 1 0;
  min-width: 0;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  min-height: 28px;
  max-height: 28px;
  padding: 0 6px;
  border-radius: 9999px;
  border: 1px solid transparent;
  font: 550 12px/16px inherit;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}
.omnimux-inspiration-overlay-cta-btn svg {
  width: 14px;
  height: 14px;
  flex: none;
}
.omnimux-inspiration-overlay-cta-btn.secondary {
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: blur(8px);
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l3);
}
.omnimux-inspiration-overlay-cta-btn.secondary:hover {
  background: var(--dsw-alias-bg-mask-2, var(--dsw-alias-bg-mask-1));
}
.omnimux-inspiration-overlay-cta-btn.primary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
  border-color: transparent;
}
.omnimux-inspiration-overlay-cta-btn.primary:hover {
  background: var(--dsw-alias-button-primary-hover);
}
.omnimux-inspiration-overlay-cta-btn:disabled,
.omnimux-inspiration-overlay-cta-btn[aria-disabled="true"] {
  opacity: 0.55;
  cursor: not-allowed;
}
.omnimux-inspiration-overlay-footer {
  font-size: 11px;
  color: var(--dsw-alias-label-primary, rgba(255, 255, 255, 0.85));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 2px var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.8));
  position: relative;
  z-index: 1;
}
.omnimux-inspiration-cta-status {
  min-height: 18px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}

/* 详情弹窗 Modal */
.omnimux-inspiration-modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,.75));
  backdrop-filter: none;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overscroll-behavior: contain;
  animation: omni-fade-in 120ms ease;
}
@keyframes omni-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.omnimux-inspiration-modal-wrapper {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  width: 100%;
  max-width: 1040px;
  animation: omni-fade-in 120ms ease;
}
.omnimux-inspiration-modal-container {
  position: relative;
  display: flex;
  width: 100%;
  height: 85vh;
  max-height: 720px;
  border-radius: 16px;
  overflow: hidden;
  background: var(--dsw-alias-bg-module-platform, #131313);
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  box-shadow: 0 12px 36px var(--dsw-alias-bg-mask-1, rgba(0,0,0,.60));
}
.omnimux-inspiration-modal-close {
  position: absolute;
  top: -10px;
  right: -48px;
  width: 36px !important;
  height: 36px !important;
  min-width: 36px;
  padding: 0 !important;
  border-radius: 50%;
  border: 1px solid var(--dsw-alias-border-hover, rgba(255, 255, 255, 0.22));
  background: var(--dsw-alias-bg-elevated, #181818);
  backdrop-filter: none;
  color: var(--dsw-alias-label-primary, #ffffff);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  box-shadow: 0 4px 16px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.55));
  transition: all 120ms ease;
  flex-shrink: 0;
  align-self: flex-start;
}
.omnimux-inspiration-modal-close:hover {
  border-color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.45));
  background: var(--dsw-alias-bg-layer-2, rgba(45, 45, 45, 0.95));
  transform: scale(1.08);
}
@media (max-width: 1160px) {
  .omnimux-inspiration-modal-close {
    top: -44px;
    right: 4px;
  }
}

/* 弹窗左列：视频播放 / 内容拆解 切换大画幅区域 */
.omnimux-inspiration-modal-left {
  flex: 1 1 58%;
  min-width: 320px;
  background: var(--dsw-alias-bg-base, #000000);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

/* 左侧顶部模式切换开关 Segmented Controls
 * 32px 轨道 + 28px 内钮（紧凑变体）。必须 overflow:hidden，且选择器
 * 盖过 dsh-ui-kit Button 的 height/radius，避免选中态顶破胶囊。 */
.omnimux-inspiration-preview-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--dsw-alias-bg-elevated, rgba(18, 18, 18, 0.85));
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--dsw-alias-border-l2, #242424);
  z-index: 10;
}
.omnimux-inspiration-switch-group {
  display: inline-flex;
  align-items: stretch;
  height: 32px;
  padding: 1px;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--dsw-alias-bg-base, #0a0a0a);
  border-radius: 9999px;
  border: 1px solid var(--dsw-alias-border-l2, #242424);
}
.omnimux-inspiration-switch-group > .omnimux-inspiration-switch-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  min-height: 28px;
  max-height: 28px;
  padding: 0 12px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #7c7c7c);
  font: 500 12px/16px inherit;
  cursor: pointer;
  flex: 0 0 auto;
  box-shadow: none;
  transform: none;
  outline: none;
  transition: color 120ms ease, background-color 120ms ease;
}
.omnimux-inspiration-switch-group > .omnimux-inspiration-switch-btn svg {
  display: block;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  overflow: visible;
}
.omnimux-inspiration-switch-group > .omnimux-inspiration-switch-btn:hover {
  color: var(--dsw-alias-label-primary-dimmed, #ebebeb);
  background: transparent;
}
.omnimux-inspiration-switch-group > .omnimux-inspiration-switch-btn.active,
.omnimux-inspiration-switch-group > .omnimux-inspiration-switch-btn[aria-selected="true"] {
  background: var(--dsw-alias-bg-layer-1, #242424);
  color: var(--dsw-alias-label-primary, #ffffff);
  box-shadow: none;
}
.omnimux-inspiration-switch-group > .omnimux-inspiration-switch-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.omnimux-inspiration-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-family: monospace;
  font-weight: 500;
  background: var(--dsw-alias-bg-secondary, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--dsw-alias-border, rgba(255, 255, 255, 0.1));
  color: var(--dsw-alias-label-primary-dimmed, #ebebeb);
}
.omnimux-inspiration-status-badge.done {
  border-color: var(--dsw-alias-state-success-tertiary, rgba(16, 185, 129, 0.4));
  background: var(--dsw-alias-state-success-tertiary, rgba(16, 185, 129, 0.12));
  color: var(--dsw-alias-state-success-primary, #10b981);
}
.omnimux-inspiration-status-badge.pending {
  border-color: var(--dsw-alias-state-warning-tertiary, rgba(245, 158, 11, 0.4));
  background: var(--dsw-alias-state-warning-tertiary, rgba(245, 158, 11, 0.12));
  color: var(--dsw-alias-state-warning-primary, #f59e0b);
}

/* 播放器容器 */
.omnimux-inspiration-preview-player {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  padding: 12px;
}
.omnimux-inspiration-player-frame {
  width: 100%;
  height: 100%;
  border: none;
  background: var(--dsw-alias-bg-base, #000000);
}
.omnimux-inspiration-modal-cover-bg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* AI 内容拆解大视窗 (5 维度沉浸式查看) */
.omnimux-inspiration-deconstruct-view {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, #0d0d0d);
  overflow: hidden;
}
.omnimux-inspiration-dim-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  overflow-x: auto;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #222222);
  background: var(--dsw-alias-bg-base, #111111);
}
.omnimux-inspiration-dim-tabs::-webkit-scrollbar {
  height: 3px;
}
.omnimux-inspiration-dim-tab {
  white-space: nowrap;
  padding: 5px 10px;
  border-radius: 9999px;
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  background: var(--dsw-alias-bg-layer-1, #161616);
  color: var(--dsw-alias-label-tertiary, #888888);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 120ms ease;
}
.omnimux-inspiration-dim-tab:hover {
  color: var(--dsw-alias-label-primary, #ffffff);
  border-color: var(--dsw-alias-border-l3, #383838);
}
.omnimux-inspiration-dim-tab.active {
  background: var(--dsw-alias-bg-layer-2, #282828);
  border-color: var(--dsw-alias-border-l4, #555555);
  color: var(--dsw-alias-label-primary, #ffffff);
}

.omnimux-inspiration-dim-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.omnimux-inspiration-dim-card {
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, #141414);
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.omnimux-inspiration-dim-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.omnimux-inspiration-dim-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #ffffff);
  display: flex;
  align-items: center;
  gap: 6px;
}
.omnimux-inspiration-dim-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--dsw-alias-label-primary-dimmed, #d1d1d1);
  white-space: pre-wrap;
  word-break: break-word;
}
.omnimux-inspiration-dim-code {
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
  background: var(--dsw-alias-bg-base, #0a0a0a);
  border: 1px solid var(--dsw-alias-border-l2, #222222);
  border-radius: 6px;
  padding: 12px;
  color: var(--dsw-alias-state-success-primary, #a3e635);
  white-space: pre-wrap;
  overflow-x: auto;
}

/* 拆解为空或进行中态 */
.omnimux-inspiration-deconstruct-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 30px;
  text-align: center;
}
.omnimux-inspiration-trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: 9999px;
  background: var(--dsw-alias-label-primary, #ffffff);
  color: var(--dsw-alias-bg-base, #0a0a0a);
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.18));
  transition: all 120ms ease;
}
.omnimux-inspiration-trigger-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  background: var(--dsw-alias-button-primary-hover, #eaeaea);
}
.omnimux-inspiration-trigger-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 弹窗右列：极简发丝线详情信息区 (标题与描述在下方) */
.omnimux-inspiration-modal-right {
  flex: 0 0 380px;
  width: 380px;
  background: var(--dsw-alias-bg-base, #0a0a0a);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 20px 24px;
  gap: 16px;
  border-left: 1px solid var(--dsw-alias-border-l2, #242424);
}

/* 创作者信息与平台 Badge */
.omnimux-inspiration-creator-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #202020);
}
.omnimux-inspiration-creator-left {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  border-radius: 8px;
  transition: all 120ms ease;
}
.omnimux-inspiration-creator-link {
  padding: 4px 6px;
  margin: -4px -6px;
  cursor: pointer;
}
.omnimux-inspiration-creator-link:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.06));
}
.omnimux-inspiration-creator-link:hover .omnimux-inspiration-modal-handle {
  color: var(--dsw-alias-brand-primary, #ffffff);
}
.omnimux-inspiration-creator-link:hover .omnimux-inspiration-ext-icon {
  opacity: 0.8;
  transform: translate(0, 0);
}
.omnimux-inspiration-creator-link:hover .omnimux-inspiration-creator-handle {
  color: var(--dsw-alias-label-primary-dimmed, #cccccc);
}
.omnimux-inspiration-creator-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.omnimux-inspiration-modal-avatar {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-1, #1c1c1c);
  border: 1px solid var(--dsw-alias-border-l2, #2a2a2a);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: monospace;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #ffffff);
  flex-shrink: 0;
  overflow: hidden;
}
.omnimux-inspiration-avatar-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}
.omnimux-inspiration-modal-handle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #ffffff);
  transition: color 120ms ease;
}
.omnimux-inspiration-ext-icon {
  opacity: 0;
  transition: opacity 120ms ease, transform 120ms ease;
  transform: translate(-1px, 1px);
  color: var(--dsw-alias-label-tertiary, #888888);
}
.omnimux-inspiration-creator-handle {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #808080);
  transition: color 120ms ease;
}

.omnimux-inspiration-modal-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary-dimmed, #d1d1d1);
  text-decoration: none;
  padding: 4px 10px;
  border-radius: 9999px;
  border: 1px solid var(--dsw-alias-border-l2, #262626);
  background: var(--dsw-alias-bg-module-platform, #141414);
  transition: all 120ms ease;
}
.omnimux-inspiration-modal-link:hover {
  border-color: var(--dsw-alias-border-l3, #444444);
  color: var(--dsw-alias-label-primary, #ffffff);
}

/* 标签 Tags */
.omnimux-inspiration-modal-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.omnimux-inspiration-modal-tag {
  padding: 2px 8px;
  border-radius: 9999px;
  font-family: monospace;
  font-size: 11px;
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  background: var(--dsw-alias-bg-module-platform, #141414);
  color: var(--dsw-alias-label-tertiary, #888888);
}

/* 视频互动数据 Stats 矩阵 */
.omnimux-inspiration-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-base, #111111);
  border: 1px solid var(--dsw-alias-border-l2, #222222);
}
.omnimux-inspiration-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
}
.omnimux-inspiration-stat-label {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary, #7c7c7c);
  font-family: monospace;
}
.omnimux-inspiration-stat-val {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #ffffff);
}

/* 标题和原贴描述区块（置于右侧面板） */
.omnimux-inspiration-caption-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, #141414);
  border: 1px solid var(--dsw-alias-border-l2, #242424);
}
.omnimux-inspiration-modal-title-text {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--dsw-alias-label-primary, #ffffff);
  word-break: break-word;
}
.omnimux-inspiration-caption-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.omnimux-inspiration-caption-label {
  font-size: 11px;
  font-weight: 600;
  font-family: monospace;
  color: var(--dsw-alias-label-tertiary, #888888);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.omnimux-inspiration-caption-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--dsw-alias-label-primary-dimmed, #d4d4d4);
  word-break: break-word;
  white-space: pre-wrap;
}
.omnimux-inspiration-summary-text {
  margin: 0;
  font-size: 12.5px; /* exempt-ui10: 密集信息卡辅助文本微调 */
  line-height: 1.55;
  color: var(--dsw-alias-label-tertiary, #a3a3a3);
  word-break: break-word;
  white-space: pre-wrap;
}

/* 导入模态框 Import Dialog */
.omnimux-inspiration-import-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  border-radius: 16px;
  background: var(--dsw-alias-bg-module-platform, #131313);
  border: 1px solid var(--dsw-alias-border-l2, #242424);
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-1, rgba(0,0,0,.48));
  overflow: hidden;
}
.omnimux-inspiration-import-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #242424);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.omnimux-inspiration-import-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.omnimux-inspiration-import-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.omnimux-inspiration-import-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--dsw-alias-border-l2, #242424);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* 空态与错误提示 */
.omnimux-inspiration-empty, .omnimux-inspiration-gate, .omnimux-inspiration-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 240px;
  text-align: center;
  padding: 24px;
}
.omnimux-inspiration-empty-title {
  margin: 0;
  font: 600 18px/28px inherit;
  color: var(--dsw-alias-label-primary, #ffffff);
}
.omnimux-inspiration-empty-text {
  margin: 0;
  font: 400 14px/20px inherit;
  color: var(--dsw-alias-label-tertiary, #7c7c7c);
}
.omnimux-inspiration-spinner--sm { width: 10px; height: 10px; }
.omnimux-inspiration-empty-cta { margin-top: 12px; }
.omnimux-inspiration-error-text {
  color: var(--dsw-alias-state-error-primary);
  font-size: 13px;
}
.omnimux-inspiration-success-text {
  color: var(--dsw-alias-state-success-primary);
  font-size: 13px;
}
.omnimux-inspiration-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}
.omnimux-inspiration-import-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.omnimux-inspiration-tags-collapse {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.omnimux-inspiration-tags-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  min-height: 32px;
  padding: 0 2px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: 500 13px/20px inherit;
  cursor: pointer;
}
.omnimux-inspiration-tags-toggle:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
}
.omnimux-inspiration-tags-toggle:disabled {
  opacity: 0.5;
  cursor: default;
}
.omnimux-inspiration-tags-toggle-label {
  color: inherit;
}
.omnimux-inspiration-tags-toggle-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 12px;
  line-height: 1;
  transform: rotate(-90deg);
  transition: transform 0.15s ease;
}
.omnimux-inspiration-tags-toggle-chevron.is-open {
  transform: rotate(0deg);
}
.omnimux-inspiration-switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}
.omnimux-inspiration-switch,
.omnimux-inspiration-switch:hover,
.omnimux-inspiration-switch:active {
  position: relative;
  width: 36px;
  min-width: 36px;
  height: 20px;
  min-height: 20px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.30));
  cursor: pointer;
  transform: none;
  transition: background 0.15s ease;
  overflow: visible;
}
.omnimux-inspiration-switch[aria-checked="true"],
.omnimux-inspiration-switch[aria-checked="true"]:hover {
  background: var(--dsw-alias-state-success-primary, #4caf7d);
}
.omnimux-inspiration-switch:disabled {
  cursor: default;
  opacity: 0.5;
}
.omnimux-inspiration-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--dsw-alias-label-primary-foreground, var(--dsw-alias-label-primary-inverted, #ffffff));
  transition: transform 0.15s ease;
  pointer-events: none;
}
.omnimux-inspiration-switch[aria-checked="true"] .omnimux-inspiration-switch-knob {
  transform: translateX(16px);
}
.omnimux-inspiration-switch-label {
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-inspiration-fallback-icon--lg { width: 56px; height: 56px; }
.omnimux-inspiration-empty-breakdown-title {
  margin: 0 0 6px 0;
  font-size: 15px;
  color: var(--dsw-alias-label-primary);
}
.omnimux-inspiration-empty-breakdown-desc {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-inspiration-creator-handle {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-inspiration-detail-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.omnimux-inspiration-detail-media,
.omnimux-inspiration-detail-cover {
  width: 100%;
  max-height: 320px;
  border-radius: 8px;
  object-fit: contain;
  background: var(--dsw-alias-bg-module-platform);
}
.omnimux-inspiration-hook-card {
  background: var(--dsw-alias-bg-module-platform);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 12px;
}
.omnimux-inspiration-hook-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--dsw-alias-brand-primary);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.omnimux-inspiration-hook-body { font-size: 13px; line-height: 1.5; }
.omnimux-inspiration-field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.omnimux-inspiration-field-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-inspiration-content-box {
  font-size: 13px;
  line-height: 1.5;
  background: var(--dsw-alias-bg-module-platform);
  padding: 10px;
  border-radius: 6px;
}
.omnimux-inspiration-meta-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-inspiration-source-link { color: var(--dsw-alias-brand-primary); }
.omnimux-inspiration-platform-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-brand-primary);
}
.omnimux-inspiration-btn {
  height: 34px;
  padding: 0 16px;
  border: none;
  border-radius: 9999px;
  background: var(--dsw-alias-button-primary-fill, #ffffff);
  color: var(--dsw-alias-label-primary-foreground, #0a0a0a);
  font: 500 13px/16px inherit;
  cursor: pointer;
}

/* 触底滚动加载器 */
.omnimux-inspiration-scroll-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #7c7c7c);
}
.omnimux-inspiration-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--dsw-alias-border, rgba(255,255,255,0.15));
  border-top-color: var(--dsw-alias-label-primary, #ffffff);
  border-radius: 50%;
  animation: omni-spin 0.6s linear infinite;
}
@keyframes omni-spin {
  to { transform: rotate(360deg); }
}

/* Triptych preview modal — overrides legacy dual-pane rules later in cascade */
.omnimux-inspiration-modal-wrapper {
  max-width: 1180px;
  align-items: stretch;
}
.omnimux-inspiration-modal-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: min(86vh, 760px);
  max-height: none;
  min-height: 420px;
  overflow: hidden;
  overscroll-behavior: contain;
  background: var(--dsw-alias-bg-module-platform, #121212);
  border-radius: 16px;
}
.omnimux-inspiration-modal-header {
  height: 60px;
  min-height: 60px;
  flex: 0 0 60px;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  padding: 0 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.omnimux-inspiration-modal-heading {
  min-width: 0;
  max-width: min(520px, calc(100% - 40px));
  flex: 0 1 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.omnimux-inspiration-modal-heading h2 {
  min-width: 0;
  flex: 0 1 auto;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
  color: var(--dsw-alias-label-primary);
}
.omnimux-inspiration-modal-heading .omnimux-inspiration-modal-copy {
  flex-shrink: 0;
}
.omnimux-inspiration-modal-copy {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.omnimux-inspiration-modal-copy:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omnimux-inspiration-modal-copy.is-icon-only {
  width: 32px;
  padding: 0;
  justify-content: center;
  flex: 0 0 32px;
}
.omnimux-inspiration-modal-close {
  position: static !important;
  top: auto !important;
  right: auto !important;
  width: 32px !important;
  height: 32px !important;
  min-width: 32px;
  margin-left: auto;
  flex: 0 0 32px;
  border-radius: 8px !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  align-self: center;
}
.omnimux-inspiration-modal-body {
  min-height: 0;
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: minmax(300px, 1.1fr) minmax(320px, 1.15fr) minmax(300px, 1.1fr);
  overflow: hidden;
}
.omnimux-inspiration-modal-panel {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  -webkit-overflow-scrolling: touch;
  padding: 16px;
  border-right: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base, #111111);
}
.omnimux-inspiration-modal-panel:last-child { border-right: 0; }
.omnimux-inspiration-modal-video-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px;
  height: 100%;
}
.omnimux-inspiration-modal-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.omnimux-inspiration-modal-panel-heading h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.omnimux-inspiration-modal-player-box {
  position: relative;
  width: 100%;
  height: 100%;
  max-height: 100%;
  aspect-ratio: 9 / 16;
  margin: 0;
  border-radius: 8px;
  overflow: hidden;
  background: var(--dsw-alias-bg-base);
  display: flex;
  align-items: center;
  justify-content: center;
}
.omnimux-inspiration-player-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}
.omnimux-inspiration-modal-player-box:hover .omnimux-inspiration-player-actions,
.omnimux-inspiration-modal-player-box:focus-within .omnimux-inspiration-player-actions {
  opacity: 1;
  pointer-events: auto;
}
.omnimux-inspiration-player-actions .omnimux-inspiration-modal-copy {
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.85));
  backdrop-filter: none;
  border: 1px solid var(--dsw-alias-border, rgba(255, 255, 255, 0.18));
  border-radius: 6px;
  color: var(--dsw-alias-label-primary, #ffffff);
  width: 32px;
  height: 32px;
}
.omnimux-inspiration-player-actions .omnimux-inspiration-modal-copy:hover {
  background: var(--dsw-alias-bg-mask-2, var(--dsw-alias-bg-mask-1));
  color: var(--dsw-alias-label-primary, #ffffff);
}
.omnimux-inspiration-player-frame,
.omnimux-inspiration-modal-cover-bg {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.omnimux-inspiration-modal-script-content,
.omnimux-inspiration-modal-dimensions p,
.omnimux-inspiration-modal-dimensions pre {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.65;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-inspiration-modal-script-content.is-card {
  padding: 12px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.omnimux-inspiration-modal-script-hint {
  margin-top: 8px;
  padding: 12px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}
.omnimux-inspiration-modal-panel-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.omnimux-inspiration-modal-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  min-width: 0;
}
.omnimux-inspiration-modal-link,
.omnimux-inspiration-creator-link {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-inspiration-modal-link svg {
  display: inline-block;
  margin-left: 4px;
  vertical-align: -2px;
  flex: 0 0 auto;
}
.omnimux-inspiration-modal-meta-row .omnimux-inspiration-modal-copy {
  flex: 0 0 32px;
}
.omnimux-inspiration-modal-script-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.omnimux-inspiration-modal-script-list li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: start;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
}
.omnimux-inspiration-modal-script-list.has-timecode li {
  grid-template-columns: 52px 1fr auto;
}
.omnimux-inspiration-modal-script-list li.is-active,
.omnimux-inspiration-modal-dimensions article.is-active {
  background: var(--dsw-alias-interactive-bg-hover);
}
.omnimux-inspiration-modal-timecode {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-inspiration-modal-script-line {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-inspiration-modal-dimensions article {
  padding: 10px;
  margin-bottom: 8px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.omnimux-inspiration-modal-deconstruction-panel {
  display: flex;
  flex-direction: column;
  padding: 0 !important;
  overflow: hidden !important;
  background: var(--dsw-alias-bg-base, #111111);
}
.omnimux-inspiration-deconstruct-heading {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  margin: 0 !important;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #262626);
  background: var(--dsw-alias-bg-base, #111111);
  z-index: 5;
}
.omnimux-inspiration-modal-deconstruction-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  -webkit-overflow-scrolling: touch;
  transform: translateZ(0);
}
.omnimux-inspiration-deconstruct-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--dsw-alias-label-primary, #ffffff);
}
.omnimux-inspiration-deconstruct-title svg {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
  color: var(--dsw-alias-label-secondary, #a1a1aa);
}
.omnimux-inspiration-deconstruct-title h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #ffffff);
}
.omnimux-inspiration-modal-panel-actions .omnimux-inspiration-modal-copy,
.omnimux-inspiration-deconstruct-heading .omnimux-inspiration-modal-copy {
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.04));
  border-radius: 6px;
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #d4d4d8);
}
.omnimux-inspiration-modal-panel-actions .omnimux-inspiration-modal-copy:hover,
.omnimux-inspiration-deconstruct-heading .omnimux-inspiration-modal-copy:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-primary, #ffffff);
  border-color: var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.22));
}
.omnimux-inspiration-modal-dimensions.is-doc-style {
  display: flex;
  flex-direction: column;
}
.omnimux-inspiration-doc-section,
.omnimux-inspiration-modal-dimensions.is-doc-style article {
  padding: 20px 20px !important;
  margin: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #262626);
  cursor: default;
  transition: background-color 120ms ease;
}
.omnimux-inspiration-doc-section.is-active {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.03)) !important;
}
.omnimux-inspiration-doc-title,
.omnimux-inspiration-modal-dimensions.is-doc-style h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #ffffff);
  text-align: left;
  line-height: 1.4;
}
.omnimux-inspiration-doc-quote,
.omnimux-inspiration-modal-dimensions.is-doc-style blockquote {
  margin: 0 0 14px 0;
  padding: 2px 0 2px 12px;
  border-left: 2px solid var(--dsw-alias-border-l3, #3f3f46);
  color: var(--dsw-alias-label-tertiary, #a1a1aa);
  font-style: italic;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.omnimux-inspiration-doc-analysis {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.omnimux-inspiration-doc-bullet {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--dsw-alias-label-secondary, #d4d4d8);
}
.omnimux-inspiration-bullet-dot {
  color: var(--dsw-alias-label-tertiary, #a1a1aa);
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
}
.omnimux-inspiration-modal-dimensions.is-doc-style .omnimux-inspiration-modal-raw {
  padding: 16px 20px;
}
.omnimux-inspiration-modal-fold {
  display: flex;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: inherit;
  text-align: left;
}
.omnimux-inspiration-modal-dimensions blockquote {
  margin: 0 0 8px;
  padding: 0 0 0 10px;
  border-left: 2px solid var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-tertiary);
  font-style: italic;
  overflow-wrap: anywhere;
}
.omnimux-inspiration-modal-raw {
  margin-top: 8px;
}
.omnimux-inspiration-modal-dimensions h4 {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
}
.omnimux-inspiration-modal-dimensions p {
  margin: 0;
  line-height: 1.55;
}
.omnimux-inspiration-modal-chevron {
  display: inline-flex;
  transition: transform 120ms ease;
}
.omnimux-inspiration-modal-chevron.is-collapsed { transform: rotate(-90deg); }
.omnimux-inspiration-modal-dimensions pre {
  margin: 0;
  font-family: ui-monospace, monospace;
}
.omnimux-inspiration-modal-empty {
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary);
}
.omnimux-inspiration-modal-meta-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.omnimux-inspiration-modal-mobile-tabs { display: none; }
.omnimux-inspiration-modal-footer {
  flex: 0 0 56px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 16px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.omnimux-inspiration-modal-footer .omnimux-inspiration-modal-replicate {
  width: auto;
  min-width: 112px;
  height: 32px;
  min-height: 32px;
  max-height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  white-space: nowrap;
  flex: 0 0 auto;
}
.omnimux-inspiration-modal-footer .omnimux-inspiration-modal-replicate .dshUk-Button-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
  white-space: nowrap;
}
.omnimux-inspiration-modal-footer .omnimux-inspiration-modal-replicate svg {
  flex: 0 0 14px;
}
@media (max-width: 860px) {
  .omnimux-inspiration-modal-backdrop { padding: 12px; }
  .omnimux-inspiration-modal-container { height: min(92vh, 760px); }
  .omnimux-inspiration-modal-header { gap: 8px; padding: 0 12px; }
  .omnimux-inspiration-modal-heading { max-width: calc(100% - 40px); }
  .omnimux-inspiration-modal-mobile-tabs {
    display: flex;
    flex: 0 0 44px;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--dsw-alias-border-l2);
  }
  .omnimux-inspiration-modal-mobile-tabs button {
    height: 32px;
    flex: 1;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--dsw-alias-label-secondary);
    cursor: pointer;
  }
  .omnimux-inspiration-modal-mobile-tabs button.active {
    background: var(--dsw-alias-interactive-bg-active);
    color: var(--dsw-alias-label-primary);
  }
  .omnimux-inspiration-modal-body {
    display: block;
    overflow: hidden;
  }
  .omnimux-inspiration-modal-panel {
    display: none;
    height: 100%;
    border-right: 0;
  }
  .omnimux-inspiration-modal-panel.is-active { display: block; }
  .omnimux-inspiration-modal-deconstruction-panel.is-active {
    display: flex;
    flex-direction: column;
  }
}
`

/**
 * Inject inspiration CSS styles into document.head safely.
 */
export function injectInspirationStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(INSPIRATION_STYLES_ID)) return
  const styleNode = document.createElement('style')
  styleNode.id = INSPIRATION_STYLES_ID
  styleNode.textContent = INSPIRATION_CSS
  document.head.appendChild(styleNode)
}
