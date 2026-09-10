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
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-elevated);
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
  border-right: 1px solid var(--dsw-alias-border-l1);
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
  border: 1px solid var(--dsw-alias-border-l1);
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

/* Tabs Bar */
.omnimux-video-breakdown-tabs-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-elevated);
  flex-shrink: 0;
}

/* Scroll Area */
.omnimux-video-breakdown-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px 68px;
  box-sizing: border-box;
}

/* Shots List */
.omnimux-video-breakdown-shots-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.omnimux-video-breakdown-shot-card {
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.omnimux-video-breakdown-shot-card:hover {
  border-color: var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-2);
}

.omnimux-video-breakdown-shot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.omnimux-video-breakdown-shot-title-box {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.omnimux-video-breakdown-pills-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
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
  gap: 4px;
}

.omnimux-video-breakdown-shot-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}

/* Structure Tab */
.omnimux-video-breakdown-structure-hint {
  font-size: 13px;
  color: var(--dsw-alias-label-tertiary);
  margin-bottom: 18px;
}

.omnimux-video-breakdown-pipeline-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.omnimux-video-breakdown-pipeline-item {
  font-size: 12px;
  font-weight: 600;
  height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-state-warn-primary);
  border: 1px solid var(--dsw-alias-border-l2);
  display: inline-flex;
  align-items: center;
}

.omnimux-video-breakdown-pipeline-arrow {
  color: var(--dsw-alias-label-tertiary);
  display: flex;
  align-items: center;
}

.omnimux-video-breakdown-structure-card {
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  padding: 16px 18px;
  margin-bottom: 12px;
}

.omnimux-video-breakdown-structure-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  margin-bottom: 8px;
}

.omnimux-video-breakdown-structure-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}

/* Bottom Bar */
.omnimux-video-breakdown-bottom-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 52px;
  background: var(--dsw-alias-bg-elevated);
  border-top: 1px solid var(--dsw-alias-border-l1);
  display: flex;
  align-items: center;
  padding: 0 20px;
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

.omnimux-video-breakdown-meta-card {
  margin-top: 14px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.omnimux-video-author-info-box {
  flex: 1;
  min-width: 0;
}

.omnimux-video-metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 8px 6px;
  text-align: center;
}

.omnimux-video-metric-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.omnimux-video-metric-val {
  font-size: 13px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary);
}

.omnimux-video-metric-lbl {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary);
  display: flex;
  align-items: center;
  gap: 3px;
}

.omnimux-video-cache-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--dsw-alias-success);
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  padding: 6px 10px;
  border-radius: 6px;
}

.omnimux-video-cache-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-success);
}

.omnimux-video-breakdown-shot-card.is-active {
  border-color: var(--dsw-alias-brand-accent);
  box-shadow: 0 0 0 1px var(--dsw-alias-brand-accent);
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
