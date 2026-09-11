/**
 * 营销视频创意预设模块样式 (CSS Tokens & Components)
 */

export const PRESETS_STYLE_ID = 'omnimux-creative-presets-style'

export const PRESETS_CSS = `
/* 创意预设模态框整体微调 */
.omnimux-creative-presets-modal .omnimux-split-modal-inner {
  max-width: 1200px;
}

/* 左侧装配面板 */
.omnimux-presets-left-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.omnimux-presets-blueprint-card {
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  padding: 14px;
}

.omnimux-presets-blueprint-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.omnimux-presets-blueprint-slots {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.omnimux-presets-slot-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
}

.omnimux-presets-slot-label {
  color: var(--dsw-alias-label-secondary);
}

.omnimux-presets-slot-empty {
  color: var(--dsw-alias-label-tertiary);
  font-style: italic;
}

.omnimux-presets-slot-value.is-active {
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.omnimux-presets-slot-del {
  background: transparent;
  border: none;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}
.omnimux-presets-slot-del:hover {
  color: var(--dsw-alias-state-error-primary);
}

/* 用户输入文本域 */
.omnimux-presets-user-input-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.omnimux-presets-input-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}

.omnimux-presets-textarea {
  width: 100%;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 8px 10px;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  transition: border-color 150ms ease;
}
.omnimux-presets-textarea:focus {
  border-color: var(--dsw-alias-brand-primary);
}

/* 实时 Prompt 预览区 */
.omnimux-presets-preview-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  overflow: hidden;
  min-height: 140px;
}

.omnimux-presets-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--dsw-alias-bg-layer-2);
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
}

.omnimux-presets-copy-btn {
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  color: var(--dsw-alias-label-primary);
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
  transition: background-color 120ms ease;
}
.omnimux-presets-copy-btn:hover {
  background: var(--dsw-alias-bg-layer-3);
}

.omnimux-presets-preview-code {
  flex: 1;
  margin: 0;
  padding: 10px 12px;
  overflow-y: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 右侧内容流 */
.omnimux-presets-right-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

/* 一级选项卡 */
.omnimux-presets-tabs-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  padding-bottom: 10px;
}

.omnimux-presets-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
}
.omnimux-presets-tab:hover {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}
.omnimux-presets-tab.is-active {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.omnimux-presets-tab-badge {
  font-size: 11px;
  background: var(--dsw-alias-bg-base);
  padding: 1px 6px;
  border-radius: 10px;
  color: var(--dsw-alias-label-tertiary);
}

/* 过滤与搜索行 */
.omnimux-presets-filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.omnimux-presets-search-box {
  position: relative;
  display: flex;
  align-items: center;
  width: 240px;
}
.omnimux-presets-search-box svg {
  position: absolute;
  left: 10px;
  color: var(--dsw-alias-label-tertiary);
  pointer-events: none;
}
.omnimux-presets-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 28px 6px 30px;
  font-size: 12px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  outline: none;
}
.omnimux-presets-search-input:focus {
  border-color: var(--dsw-alias-brand-primary);
}
.omnimux-presets-search-clear {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 14px;
  cursor: pointer;
}

.omnimux-presets-subcats {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.omnimux-presets-subcat-btn {
  padding: 4px 10px;
  border-radius: 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}
.omnimux-presets-subcat-btn:hover {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}
.omnimux-presets-subcat-btn.is-active {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
  border-color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

/* 卡片网格 */
.omnimux-presets-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 14px;
  overflow-y: auto;
  padding-right: 4px;
  min-height: 380px;
  align-content: start;
}

/* 卡片单体 */
.omnimux-preset-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
}
.omnimux-preset-card:hover {
  transform: translateY(-2px);
  border-color: var(--dsw-alias-border-l3);
  box-shadow: var(--dsw-alias-shadow-md, none);
}
.omnimux-preset-card.is-selected {
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary);
}

.omnimux-preset-media-box {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--dsw-alias-bg-base);
  overflow: hidden;
}

.omnimux-preset-poster,
.omnimux-preset-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.omnimux-preset-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
}
.omnimux-preset-fallback-tag {
  font-size: 10px;
  font-weight: 500;
  opacity: 0.8;
}

.omnimux-preset-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  background: var(--dsw-alias-bg-base);
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  pointer-events: none;
}

.omnimux-preset-check-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--dsw-alias-shadow-sm, none);
}

.omnimux-preset-info {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.omnimux-preset-title-row {
  display: flex;
  flex-direction: column;
}

.omnimux-preset-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.omnimux-preset-subtitle {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.omnimux-preset-desc {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--dsw-alias-label-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.omnimux-presets-empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  gap: 6px;
}

/* 底部固定操作栏 */
.omnimux-presets-footer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.omnimux-presets-footer-summary {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  display: flex;
  align-items: center;
  gap: 10px;
}
.omnimux-presets-footer-summary strong {
  color: var(--dsw-alias-brand-primary);
}

.omnimux-presets-reset-btn {
  background: transparent;
  border: none;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}
.omnimux-presets-reset-btn:hover {
  color: var(--dsw-alias-state-error-primary);
}

.omnimux-presets-footer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.omnimux-presets-cancel-btn {
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  color: var(--dsw-alias-label-secondary);
  padding: 0 16px;
  height: 40px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}
.omnimux-presets-cancel-btn:hover {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}

.omnimux-presets-submit-btn {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
  border: none;
  border-radius: 10px;
  padding: 0 24px;
  height: 40px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 150ms ease, transform 120ms ease;
  box-shadow: var(--dsw-alias-shadow-md, none);
}
.omnimux-presets-submit-btn:hover {
  opacity: 0.92;
  transform: translateY(-1px);
}

/* ────────────────────────────────────────────────────────
   三大创意维度专属独立弹窗 (CreativeDimensionModal)
   ──────────────────────────────────────────────────────── */

.omnimux-dimension-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 99990;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: blur(4px);
  padding: 24px;
  animation: omnimux-dimension-fade-in 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes omnimux-dimension-fade-in {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}

.omnimux-dimension-modal-container {
  width: 100%;
  max-width: 1060px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 16px;
  box-shadow: var(--dsw-alias-shadow-lg, none);
  overflow: hidden;
}

.omnimux-dimension-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
}

.omnimux-dimension-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.omnimux-dimension-header-icon {
  font-size: 20px;
  line-height: 1;
}

.omnimux-dimension-header-titles {
  display: flex;
  align-items: center;
  gap: 8px;
}

.omnimux-dimension-header-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.omnimux-dimension-header-badge {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l1);
}

.omnimux-dimension-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.omnimux-dimension-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 280px;
}

.omnimux-dimension-search-icon {
  position: absolute;
  left: 10px;
  font-size: 12px;
  pointer-events: none;
  opacity: 0.6;
}

.omnimux-dimension-search-input {
  width: 100%;
  height: 32px;
  padding: 0 28px 0 30px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  outline: none;
  transition: border-color 150ms ease;
}

.omnimux-dimension-search-input:focus {
  border-color: var(--dsw-alias-brand-primary);
}

.omnimux-dimension-search-clear {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  cursor: pointer;
  padding: 0 4px;
}

.omnimux-dimension-search-clear:hover {
  color: var(--dsw-alias-label-primary);
}

.omnimux-dimension-modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms ease;
}

.omnimux-dimension-modal-close:hover {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
}

.omnimux-dimension-subcats-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  overflow-x: auto;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}

.omnimux-dimension-subcat-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border-radius: 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 120ms ease;
}

.omnimux-dimension-subcat-chip:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}

.omnimux-dimension-subcat-chip.is-active {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
  border-color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.omnimux-dimension-subcat-count {
  font-size: 10px;
  opacity: 0.75;
}

.omnimux-dimension-grid-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  min-height: 380px;
}

.omnimux-dimension-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 14px;
}

.omnimux-dimension-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 260px;
  gap: 12px;
  color: var(--dsw-alias-label-tertiary);
}

.omnimux-dimension-empty-icon {
  font-size: 32px;
}

.omnimux-dimension-empty-text {
  font-size: 13px;
  margin: 0;
}

.omnimux-dimension-empty-reset {
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-brand-primary);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.omnimux-dimension-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
}

.omnimux-dimension-footer-info {
  font-size: 13px;
}

.omnimux-dimension-footer-selected {
  display: flex;
  align-items: center;
  gap: 6px;
}

.omnimux-dimension-footer-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary);
}

.omnimux-dimension-footer-label {
  color: var(--dsw-alias-label-secondary);
}

.omnimux-dimension-footer-name {
  color: var(--dsw-alias-label-primary);
}

.omnimux-dimension-footer-clear-btn {
  background: transparent;
  border: none;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  cursor: pointer;
  padding: 0 4px;
}

.omnimux-dimension-footer-hint {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.omnimux-dimension-footer-btns {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ────────────────────────────────────────────────────────
   Composer 底部 3 独立触发按钮与已选 Chips 胶囊栏
   ──────────────────────────────────────────────────────── */

.omnimux-composer-presets-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.omnimux-composer-preset-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  transition: all 120ms ease;
}

.omnimux-composer-preset-trigger:hover {
  background: var(--dsw-alias-interactive-bg-hover-solid, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l3);
}

.omnimux-composer-preset-trigger.has-active {
  color: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-bg-layer-1);
  font-weight: 600;
}

.omnimux-composer-preset-trigger-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary);
}

/* 已选 Chips 浮动标签容器 */
.omnimux-composer-chips-dock {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 4px 12px 6px 12px;
  box-sizing: border-box;
}

.omnimux-composer-preset-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-size: 11px;
  transition: all 120ms ease;
  user-select: none;
}

.omnimux-composer-preset-chip:hover {
  border-color: var(--dsw-alias-brand-primary);
}

.omnimux-composer-chip-tag {
  color: var(--dsw-alias-label-secondary);
  font-weight: 500;
}

.omnimux-composer-chip-val {
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.omnimux-composer-chip-val:hover {
  text-decoration: underline;
}

.omnimux-composer-chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.omnimux-composer-chip-remove:hover {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-state-error-primary);
}
`

export function ensurePresetsStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(PRESETS_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = PRESETS_STYLE_ID
  style.textContent = PRESETS_CSS
  document.head.appendChild(style)
}
