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
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  padding: 14px;
}

.omnimux-presets-blueprint-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #fff);
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
  background: var(--dsw-alias-bg-base, rgba(0, 0, 0, 0.2));
}

.omnimux-presets-slot-label {
  color: var(--dsw-alias-label-secondary, #999);
}

.omnimux-presets-slot-empty {
  color: var(--dsw-alias-label-tertiary, #666);
  font-style: italic;
}

.omnimux-presets-slot-value.is-active {
  color: var(--dsw-alias-accent, #a855f7);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.omnimux-presets-slot-del {
  background: transparent;
  border: none;
  color: var(--dsw-alias-label-secondary, #999);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}
.omnimux-presets-slot-del:hover {
  color: #ef4444;
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
  color: var(--dsw-alias-label-secondary, #aaa);
}

.omnimux-presets-textarea {
  width: 100%;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
  padding: 8px 10px;
  color: var(--dsw-alias-label-primary, #fff);
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  transition: border-color 150ms ease;
}
.omnimux-presets-textarea:focus {
  border-color: var(--dsw-alias-accent, #a855f7);
}

/* 实时 Prompt 预览区 */
.omnimux-presets-preview-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, #111);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
  overflow: hidden;
  min-height: 140px;
}

.omnimux-presets-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.03));
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08));
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, #888);
}

.omnimux-presets-copy-btn {
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15));
  border-radius: 6px;
  color: var(--dsw-alias-label-primary, #fff);
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
  transition: all 120ms ease;
}
.omnimux-presets-copy-btn:hover {
  background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.1));
}

.omnimux-presets-preview-code {
  flex: 1;
  margin: 0;
  padding: 10px 12px;
  overflow-y: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary, #ccc);
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
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08));
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
  color: var(--dsw-alias-label-secondary, #999);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
}
.omnimux-presets-tab:hover {
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.04));
  color: var(--dsw-alias-label-primary, #fff);
}
.omnimux-presets-tab.is-active {
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.08));
  border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15));
  color: var(--dsw-alias-label-primary, #fff);
  font-weight: 600;
}

.omnimux-presets-tab-badge {
  font-size: 11px;
  background: var(--dsw-alias-bg-base, rgba(0, 0, 0, 0.3));
  padding: 1px 6px;
  border-radius: 10px;
  color: var(--dsw-alias-label-tertiary, #888);
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
  color: var(--dsw-alias-label-tertiary, #666);
  pointer-events: none;
}
.omnimux-presets-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 28px 6px 30px;
  font-size: 12px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.1));
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.03));
  color: var(--dsw-alias-label-primary, #fff);
  outline: none;
}
.omnimux-presets-search-input:focus {
  border-color: var(--dsw-alias-accent, #a855f7);
}
.omnimux-presets-search-clear {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  color: var(--dsw-alias-label-tertiary, #888);
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
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08));
  background: transparent;
  color: var(--dsw-alias-label-secondary, #888);
  font-size: 11px;
  cursor: pointer;
  transition: all 120ms ease;
}
.omnimux-presets-subcat-btn:hover {
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.05));
  color: var(--dsw-alias-label-primary, #fff);
}
.omnimux-presets-subcat-btn.is-active {
  background: var(--dsw-alias-label-primary, #fff);
  color: var(--dsw-alias-bg-base, #000);
  border-color: var(--dsw-alias-label-primary, #fff);
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
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
}
.omnimux-preset-card:hover {
  transform: translateY(-2px);
  border-color: var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.25));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
.omnimux-preset-card.is-selected {
  border-color: var(--dsw-alias-accent, #a855f7);
  box-shadow: 0 0 0 1px var(--dsw-alias-accent, #a855f7), 0 6px 20px rgba(168, 85, 247, 0.25);
}

.omnimux-preset-media-box {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--dsw-alias-bg-base, #0a0a0a);
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
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(59, 130, 246, 0.15));
  color: var(--dsw-alias-label-secondary, #aaa);
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
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 500;
  color: #fff;
  pointer-events: none;
}

.omnimux-preset-check-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--dsw-alias-accent, #a855f7);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
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
  color: var(--dsw-alias-label-primary, #fff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.omnimux-preset-subtitle {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, #777);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.omnimux-preset-desc {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--dsw-alias-label-secondary, #aaa);
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
  color: var(--dsw-alias-label-tertiary, #666);
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
  color: var(--dsw-alias-label-secondary, #999);
  display: flex;
  align-items: center;
  gap: 10px;
}
.omnimux-presets-footer-summary strong {
  color: var(--dsw-alias-accent, #a855f7);
}

.omnimux-presets-reset-btn {
  background: transparent;
  border: none;
  color: var(--dsw-alias-label-secondary, #888);
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}
.omnimux-presets-reset-btn:hover {
  color: #ef4444;
}

.omnimux-presets-footer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.omnimux-presets-cancel-btn {
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15));
  border-radius: 10px;
  color: var(--dsw-alias-label-secondary, #999);
  padding: 0 16px;
  height: 40px;
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms ease;
}
.omnimux-presets-cancel-btn:hover {
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.05));
  color: var(--dsw-alias-label-primary, #fff);
}

.omnimux-presets-submit-btn {
  background: var(--dsw-alias-label-primary, #fff);
  color: var(--dsw-alias-bg-base, #000);
  border: none;
  border-radius: 10px;
  padding: 0 24px;
  height: 40px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 150ms ease, transform 120ms ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
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
