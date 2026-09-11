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
`

export function ensurePresetsStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(PRESETS_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = PRESETS_STYLE_ID
  style.textContent = PRESETS_CSS
  document.head.appendChild(style)
}
