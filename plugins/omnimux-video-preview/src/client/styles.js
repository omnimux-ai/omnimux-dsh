/**
 * OmniMux Video Breakdown & Shots Analysis Styles
 * Fully compliant with design.md (v2.0) and docs/contracts/ui-design-guidelines.md
 * 100% consuming official DeepSeek Harness --dsw-alias-* tokens.
 */
export const VIDEO_BREAKDOWN_STYLES_ID = 'omnimux-video-breakdown-styles'

export const VIDEO_BREAKDOWN_CSS = `
.omnimux-video-breakdown-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background-color: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
  box-sizing: border-box;
  overflow: hidden;
}

.omnimux-video-breakdown-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  background: var(--dsw-alias-bg-base);
  height: 100%;
  box-sizing: border-box;
  text-align: center;
}

/* Header */
.omnimux-video-breakdown-header {
  height: 48px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: none;
  background: var(--dsw-alias-bg-base);
  flex-shrink: 0;
}

.omnimux-video-breakdown-header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.omnimux-video-breakdown-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Body Container */
.omnimux-video-breakdown-body {
  display: flex;
  flex: 1;
  height: calc(100% - 48px);
  overflow: hidden;
}

/* Left: Video Player Column */
.omnimux-video-breakdown-left {
  width: 360px;
  min-width: 300px;
  max-width: 400px;
  border-right: none;
  background: var(--dsw-alias-bg-base);
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow-y: auto;
  box-sizing: border-box;
}

.omnimux-video-breakdown-player-card {
  position: relative;
  width: 100%;
  aspect-ratio: 9 / 16;
  max-height: 540px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--dsw-alias-bg-base);
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-1);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: none;
}

.omnimux-video-breakdown-video-el {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Top Overlay on Player */
.omnimux-video-breakdown-overlay-top {
  position: relative;
  z-index: 2;
  padding: 12px;
  background: linear-gradient(180deg, var(--dsw-alias-bg-mask-1) 0%, transparent 100%);
  pointer-events: none;
}

.omnimux-video-breakdown-author-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.omnimux-video-breakdown-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--dsw-alias-border-l3);
  object-fit: cover;
}

.omnimux-video-breakdown-author-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.omnimux-video-breakdown-author-handle {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}

.omnimux-video-breakdown-overlay-caption {
  margin-top: 8px;
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
  line-height: 1.4;
  font-weight: 500;
}

/* Floating Stats Column on Video Card */
.omnimux-video-breakdown-stats-col {
  position: absolute;
  right: 10px;
  bottom: 54px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--dsw-alias-label-primary);
  font-size: 11px;
  font-weight: 600;
  pointer-events: none;
}

.omnimux-video-breakdown-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

/* Bottom Overlay on Player */
.omnimux-video-breakdown-overlay-bottom {
  position: relative;
  z-index: 2;
  padding: 12px 12px 8px;
  background: linear-gradient(0deg, var(--dsw-alias-bg-mask-1) 0%, transparent 100%);
  pointer-events: none;
}

.omnimux-video-breakdown-ai-label {
  display: inline-block;
  font-size: 10px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-mask-1);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--dsw-alias-border-l2);
  margin-bottom: 4px;
}

.omnimux-video-breakdown-timecode {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}

/* Details Section below player */
.omnimux-video-breakdown-details {
  margin-top: 12px;
}

.omnimux-video-breakdown-caption {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
  line-height: 1.5;
  margin-bottom: 8px;
}

.omnimux-video-breakdown-meta-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}

.omnimux-video-breakdown-meta-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.omnimux-video-breakdown-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.omnimux-video-breakdown-ext-link {
  color: var(--dsw-alias-label-tertiary);
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  transition: color 0.15s ease;
}

.omnimux-video-breakdown-ext-link:hover {
  color: var(--dsw-alias-label-primary);
}

/* Right: Analysis Column */
.omnimux-video-breakdown-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base);
  overflow: hidden;
  position: relative;
}

/* Tabs Bar (Segmented Control matching Image 1 & 2) */
.omnimux-video-breakdown-tabs-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 20px 6px;
  border-bottom: none;
  background: var(--dsw-alias-bg-base);
  flex-shrink: 0;
}

.omnimux-video-breakdown-tabs-container {
  display: flex;
  width: 100%;
  background: var(--dsw-alias-bg-layer-1);
  border: none;
  border-radius: 8px;
  padding: 3px;
  gap: 4px;
}

.omnimux-video-breakdown-tab-btn {
  flex: 1;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.omnimux-video-breakdown-tab-btn:hover {
  color: var(--dsw-alias-label-primary);
}

.omnimux-video-breakdown-tab-btn.is-active {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  box-shadow: 0 1px 3px var(--dsw-alias-border-focus);
}

/* Scroll Area */
.omnimux-video-breakdown-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px 24px;
  box-sizing: border-box;
}

/* Shots List (Image 1) */
.omnimux-video-breakdown-shots-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.omnimux-video-breakdown-shot-card {
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  padding: 16px 18px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.omnimux-video-breakdown-shot-card:hover {
  border-color: var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-2);
}

.omnimux-video-breakdown-shot-card.is-active {
  border-color: var(--dsw-alias-brand-accent);
  box-shadow: 0 0 0 1px var(--dsw-alias-brand-accent), 0 2px 12px var(--dsw-alias-bg-mask-1);
  background: var(--dsw-alias-bg-layer-2);
}

.omnimux-video-shot-playing-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-brand-accent);
  background: var(--dsw-alias-bg-layer-3);
  padding: 2px 8px;
  border-radius: 12px;
  margin-left: 4px;
}

.omnimux-video-shot-playing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-accent);
  box-shadow: 0 0 6px var(--dsw-alias-brand-accent);
  animation: omnimux-pulse 1.4s ease-in-out infinite alternate;
}

@keyframes omnimux-pulse {
  from { opacity: 0.4; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1.2); }
}

.omnimux-video-player-mode-bar {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
  width: 100%;
}

.omnimux-video-player-mode-switch {
  display: inline-flex;
  background: var(--dsw-alias-bg-layer-1);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}

.omnimux-video-player-mode-btn {
  height: 28px;
  padding: 0 12px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.omnimux-video-player-mode-btn:hover {
  color: var(--dsw-alias-label-primary);
}

.omnimux-video-player-mode-btn.is-active {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  box-shadow: 0 1px 3px var(--dsw-alias-border-focus);
}

.omnimux-video-breakdown-shot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.omnimux-video-breakdown-shot-title-box {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  display: flex;
  align-items: center;
  gap: 10px;
}

.omnimux-video-breakdown-shot-time {
  font-family: var(--dsw-font-mono, monospace);
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}

.omnimux-video-breakdown-shot-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.omnimux-video-breakdown-stage-pill {
  font-size: 12px;
  font-weight: 500;
  padding: 3px 12px;
  border-radius: 9999px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-state-warn-primary);
  border: 1px solid var(--dsw-alias-border-l2);
  white-space: nowrap;
}

.omnimux-video-breakdown-pills-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.omnimux-video-breakdown-pill {
  font-size: 12px;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1);
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.omnimux-video-tag-sym {
  font-size: 11px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  color: var(--dsw-alias-label-secondary);
}

.omnimux-video-breakdown-shot-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}

/* Structure Tab (Image 2) */
.omnimux-video-breakdown-structure-view {
  display: flex;
  flex-direction: column;
}

.omnimux-video-breakdown-structure-hint {
  font-size: 13px;
  color: var(--dsw-alias-label-tertiary);
  margin-bottom: 18px;
  line-height: 1.5;
}

.omnimux-video-breakdown-pipeline-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.omnimux-video-breakdown-pipeline-item {
  font-size: 12px;
  font-weight: 500;
  height: 28px;
  padding: 0 14px;
  border-radius: 9999px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-state-warn-primary);
  border: 1px solid var(--dsw-alias-border-l2);
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.omnimux-video-breakdown-pipeline-arrow {
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  display: flex;
  align-items: center;
  user-select: none;
}

.omnimux-video-breakdown-structure-cards {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.omnimux-video-breakdown-structure-card {
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  padding: 18px 20px;
  transition: all 0.15s ease;
}

.omnimux-video-breakdown-structure-card:hover {
  border-color: var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-2);
}

.omnimux-video-breakdown-structure-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  margin-bottom: 10px;
}

.omnimux-video-breakdown-structure-desc {
  font-size: 13px;
  line-height: 1.65;
  color: var(--dsw-alias-label-secondary);
}

.omnimux-video-breakdown-desc-line {
  margin-bottom: 6px;
}

.omnimux-video-breakdown-desc-line:last-child {
  margin-bottom: 0;
}

.omnimux-video-breakdown-desc-heading {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  margin-top: 12px;
  margin-bottom: 6px;
}

.omnimux-video-breakdown-desc-heading:first-child {
  margin-top: 0;
}

.omnimux-video-breakdown-desc-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 13px;
  line-height: 1.6;
}

.omnimux-video-breakdown-desc-label {
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  flex-shrink: 0;
}

.omnimux-video-breakdown-desc-value {
  color: var(--dsw-alias-label-secondary);
  word-break: break-word;
}

/* Bottom Footer Bar */
.omnimux-video-breakdown-footer,
.omnimux-video-breakdown-bottom-bar {
  flex-shrink: 0;
  height: 54px;
  background: var(--dsw-alias-bg-base);
  border-top: none;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0 20px;
  box-sizing: border-box;
  z-index: 10;
}

/* Native Local Player Styles */
.omnimux-video-player-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background: var(--dsw-alias-bg-surface-1, #0c0c0e);
  cursor: pointer;
  user-select: none;
}

.omnimux-video-player-wrapper.is-embed {
  cursor: default;
  background: var(--dsw-alias-bg-surface-1, #000000);
  overflow: hidden;
}

.omnimux-video-breakdown-embed-frame {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background: transparent;
}

.omnimux-video-play-center-btn {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: blur(8px);
  color: var(--dsw-alias-label-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  pointer-events: auto;
  transition: transform 0.15s ease, background 0.15s ease;
  border: 1px solid var(--dsw-alias-border-l3);
}

.omnimux-video-play-center-btn:hover {
  transform: translate(-50%, -50%) scale(1.08);
  background: var(--dsw-alias-bg-mask-2);
}

.omnimux-video-controls-bar {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(0deg, var(--dsw-alias-bg-mask-1) 0%, transparent 100%);
  color: var(--dsw-alias-label-primary);
}

.omnimux-video-time-display {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.omnimux-video-time-sep {
  opacity: 0.5;
}

.omnimux-video-progress-slider {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--dsw-alias-border-l2);
  accent-color: var(--dsw-alias-brand-accent);
  cursor: pointer;
  outline: none;
}

/* Left: Video Info Box (1:1 matching Reference Image 2) */
.omnimux-video-info-box {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.omnimux-video-info-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.omnimux-video-info-caption {
  font-size: 14px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  line-height: 1.45;
  word-break: break-word;
}

.omnimux-video-info-ext-link {
  color: var(--dsw-alias-label-secondary);
  display: inline-flex;
  align-items: center;
  margin-top: 2px;
  flex-shrink: 0;
  text-decoration: none;
  transition: color 0.15s ease;
}

.omnimux-video-info-ext-link:hover {
  color: var(--dsw-alias-label-primary);
}

.omnimux-video-info-meta-row {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
}

.omnimux-video-info-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.omnimux-video-info-scenes {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
  margin-top: 2px;
}

.omnimux-video-breakdown-shot-card.is-active {
  border-color: var(--dsw-alias-brand-accent);
  box-shadow: 0 0 0 1px var(--dsw-alias-brand-accent);
}

/* ==========================================================================
   Figure 3: Rich Social Media Video Link Card (Contract: spec-composer-video-link-token)
   ========================================================================== */
.omx-rich-video-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: 12px;
  padding: 10px 14px 10px 10px;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  overflow: hidden;
  margin-top: 10px;
  box-sizing: border-box;
  max-width: 620px;
}
.omx-rich-video-card:hover {
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.08));
  border-color: var(--omx-token-cyan-border, rgba(56, 189, 248, 0.42));
  transform: translateY(-1px);
  box-shadow: var(--dsw-alias-shadow-overlay, 0 6px 20px rgba(0, 0, 0, 0.3)); // exempt-ui03: 浮起阴影
}

.omx-rich-card-thumb {
  width: 72px;
  height: 72px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
  background: var(--dsw-alias-bg-layer-3, #1e293b); // exempt-ui03: 暗房视听缩略图底色
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
  display: flex;
  align-items: center;
  justify-content: center;
}
.omx-rich-card-thumb svg,
.omx-rich-card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.omx-rich-card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.omx-rich-card-platform {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, rgba(255, 255, 255, 0.72));
}

.omx-tiktok-badge-icon {
  width: 16px;
  height: 16px;
  background: var(--dsw-alias-bg-base, #000000); // exempt-ui03: TikTok 官方纯黑标志底色
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.omx-rich-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #ffffff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.1px;
}

.omx-rich-card-author {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.4));
}

.omx-rich-card-action-icon {
  color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.4));
  flex-shrink: 0;
  transition: color 0.15s ease;
}
.omx-rich-video-card:hover .omx-rich-card-action-icon {
  color: var(--dsw-alias-label-primary, #ffffff);
}
`

export function ensureBreakdownStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(VIDEO_BREAKDOWN_STYLES_ID)) return
  const style = document.createElement('style')
  style.id = VIDEO_BREAKDOWN_STYLES_ID
  style.textContent = VIDEO_BREAKDOWN_CSS
  document.head.appendChild(style)
}
