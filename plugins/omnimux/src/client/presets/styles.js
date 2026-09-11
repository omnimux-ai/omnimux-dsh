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

/* 卡片单体 (1:1 对标图 2 纯净 3:4 竖屏短视频画幅) */
.omnimux-preset-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: transparent;
  border: none;
  border-radius: 16px;
  cursor: pointer;
  gap: 8px;
  user-select: none;
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.omnimux-preset-card:hover {
  transform: translateY(-2px);
}

.omnimux-preset-media-box {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 16px;
  overflow: hidden;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.omnimux-preset-card:hover .omnimux-preset-media-box {
  border-color: var(--dsw-alias-border-l3);
  box-shadow: var(--dsw-alias-shadow-md, none);
}

.omnimux-preset-card.is-selected .omnimux-preset-media-box {
  border-color: var(--dsw-alias-label-primary);
  box-shadow: 0 0 0 2px var(--dsw-alias-label-primary);
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
  font-size: 11px;
  font-weight: 500;
  opacity: 0.85;
}

.omnimux-preset-badge {
  display: none !important;
}

.omnimux-preset-check-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px var(--dsw-alias-bg-mask-1);
}

.omnimux-preset-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 2px;
}

.omnimux-preset-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.omnimux-preset-desc {
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
  margin: 0;
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
  max-width: 1180px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 20px;
  box-shadow: var(--dsw-alias-shadow-lg, none);
  overflow: hidden;
  position: relative;
}

.omnimux-dimension-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px 14px 28px;
  background: transparent;
}

.omnimux-dimension-header-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  color: var(--dsw-alias-label-primary);
  letter-spacing: -0.01em;
}

/* 沉浸式 Hero 渐变横幅 (1:1 对标图 2) */
.omnimux-dimension-hero-banner {
  margin: 0 28px 16px 28px;
  padding: 24px 30px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(121, 97, 242, 0.12) 0%, rgba(56, 189, 248, 0.06) 100%); /* exempt-ui03: 营销创意弹窗顶部Hero微光渐变横幅 */
  border: 1px solid var(--dsw-alias-border-l1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  overflow: hidden;
}

.omnimux-dimension-hero-text-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 1;
}

.omnimux-dimension-hero-heading {
  margin: 0;
  font-size: 24px;
  font-weight: 500;
  line-height: 32px;
  font-family: Georgia, -apple-system, sans-serif;
  color: var(--dsw-alias-label-primary);
  letter-spacing: -0.01em;
}

.omnimux-dimension-hero-subheading {
  margin: 0;
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}

.omnimux-dimension-hero-art {
  position: absolute;
  right: 28px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0.15;
  color: var(--dsw-alias-label-primary);
  pointer-events: none;
}

/* 分类 Tab 栏与胶囊搜索框同排并列 (1:1 对标图 2) */
.omnimux-dimension-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px 10px 28px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  gap: 16px;
}

.omnimux-dimension-tabs-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.omnimux-dimension-underline-tabs {
  display: flex;
  align-items: center;
  gap: 22px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}

.omnimux-dimension-underline-tabs::-webkit-scrollbar {
  display: none;
}

.omnimux-dimension-tab-item {
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 6px 2px;
  font-size: 14px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: color 140ms ease, border-color 140ms ease;
}

.omnimux-dimension-tab-item:hover {
  color: var(--dsw-alias-label-primary);
}

.omnimux-dimension-tab-item.is-active {
  color: var(--dsw-alias-label-primary);
  border-bottom-color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.omnimux-dimension-tab-scroll-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 140ms ease;
}

.omnimux-dimension-tab-scroll-btn:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}

/* 胶囊搜索框 (1:1 对标图 2) */
.omnimux-dimension-capsule-search {
  position: relative;
  display: flex;
  align-items: center;
  width: 260px;
  flex-shrink: 0;
}

.omnimux-dimension-capsule-input {
  width: 100%;
  height: 36px;
  padding: 0 30px 0 36px;
  border-radius: 9999px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 150ms ease;
}

.omnimux-dimension-capsule-input:focus {
  border-color: var(--dsw-alias-label-primary);
}

.omnimux-dimension-capsule-clear {
  position: absolute;
  right: 12px;
  background: transparent;
  border: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  cursor: pointer;
}

.omnimux-dimension-capsule-clear:hover {
  color: var(--dsw-alias-label-primary);
}

/* 卡片网格：4 列 3:4 竖屏短视频手机比例 */
.omnimux-dimension-grid-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 20px 28px;
  min-height: 420px;
}

.omnimux-dimension-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
}

.omnimux-dimension-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 280px;
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
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
}

.omnimux-dimension-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
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
   严格复用同位置工具栏 (.sh-picker-trigger) 交互样式规范
   ──────────────────────────────────────────────────────── */

.omnimux-composer-preset-trigger {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 4px !important;
  height: 28px !important;
  box-sizing: border-box !important;
  padding: 0 8px !important;
  border: 0 !important;
  box-shadow: none !important;
  border-radius: 24px !important;
  background: transparent !important;
  color: var(--dsw-alias-label-secondary, inherit) !important;
  font: inherit !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  line-height: 20px !important;
  cursor: pointer !important;
  outline: none !important;
  white-space: nowrap !important;
  user-select: none !important;
  transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease !important;
}

.omnimux-composer-preset-trigger:hover,
.omnimux-composer-preset-trigger.on {
  background: var(--dsw-alias-interactive-bg-hover) !important;
  color: var(--dsw-alias-label-primary, inherit) !important;
}

.omnimux-composer-preset-trigger:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3) !important;
  outline: none !important;
}

.omnimux-composer-preset-trigger svg {
  flex: none !important;
  width: 14px !important;
  height: 14px !important;
  min-width: 14px !important;
  min-height: 14px !important;
  display: block !important;
}

.omnimux-composer-preset-trigger.has-active {
  color: var(--dsw-alias-label-primary) !important;
  font-weight: 600 !important;
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
