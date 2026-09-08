/**
 * Stage chrome for the analytics first-level page. CSS-in-JS string injection
 * (same pattern as accounts / products) because esbuild has no CSS output path.
 * All class names are prefixed `.omnimux-analytics-`; colors go through
 * `var(--dsw-alias-*, fallback)`. Dynamic geometry uses `--stage-*` custom properties.
 */

export const STYLES_ID = 'omnimux-analytics-styles'

export const ANALYTICS_CSS = `
.omnimux-analytics-stage {
  --omnimux-analytics-metric-likes: var(--dsw-alias-state-error-primary, #ef4444);
  --omnimux-analytics-metric-comments: var(--dsw-alias-brand-primary, #3b82f6);
  --omnimux-analytics-metric-shares: var(--dsw-alias-label-success, #10b981);
  --omnimux-analytics-metric-saves: var(--dsw-alias-state-warn-primary, #f59e0b);
  --omnimux-analytics-metric-views: var(--dsw-alias-brand-secondary, #8b5cf6);
  --omnimux-analytics-metric-impressions: var(--dsw-alias-brand-tertiary, #06b6d4);
  --omnimux-analytics-metric-reach: var(--dsw-alias-label-tertiary, #64748b);
  --omnimux-analytics-metric-clicks: var(--dsw-alias-brand-pink, #ec4899);
  --omnimux-analytics-metric-er: var(--dsw-alias-label-success, #22c55e);
  --omnimux-analytics-heat-0: var(--dsw-alias-bg-module-platform, #ebedf0);
  --omnimux-analytics-heat-1: var(--dsw-alias-chart-heat-1, #9be9a8);
  --omnimux-analytics-heat-2: var(--dsw-alias-chart-heat-2, #40c463);
  --omnimux-analytics-heat-3: var(--dsw-alias-chart-heat-3, #30a14e);
  --omnimux-analytics-heat-4: var(--dsw-alias-chart-heat-4, #216e39);
  --omnimux-analytics-platform-tiktok: var(--dsw-alias-label-primary, #0a0a0a);
  --omnimux-analytics-platform-twitter: var(--dsw-alias-brand-twitter, #1d9bf0);
  --omnimux-analytics-platform-youtube: var(--dsw-alias-brand-youtube, #ff0000);
  --omnimux-analytics-platform-instagram: var(--dsw-alias-brand-instagram, #e1306c);
  --omnimux-analytics-cadence: var(--dsw-alias-brand-primary, #0ea5e9);
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, var(--dsw-bg, #0d0d0d));
  color: var(--dsw-alias-label-primary, inherit);
  overflow: hidden;
  pointer-events: auto;
  box-sizing: border-box;
}
.omnimux-analytics-stage *,
.omnimux-analytics-stage *::before,
.omnimux-analytics-stage *::after { box-sizing: border-box; }
.omnimux-analytics-stage[data-visible="false"] {
  display: none !important;
  pointer-events: none;
}

/* Layer 2 */
.omnimux-analytics-stage-action-row {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 20px 12px;
  flex-wrap: nowrap;
}
.omnimux-analytics-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.18));
  background: var(--dsw-alias-bg-module-platform, rgba(128,128,128,.08));
}
.omnimux-analytics-sync {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  margin-left: auto;
}
.omnimux-analytics-sync-caption {
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.55));
  white-space: nowrap;
}

/* Layer 3 */
.omnimux-analytics-stage-filter {
  flex: none;
  padding: 0 20px;
  height: 44px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.16));
}
.omnimux-analytics-filterbar {
  width: 100%;
  padding: 0 !important;
  height: 44px !important;
}
.omnimux-analytics-search {
  width: 220px;
  flex: 0 0 220px;
  min-width: 220px;
  max-width: 220px;
}

/* Layer 4 */
.omnimux-analytics-stage-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: auto;
  padding: 20px 20px 32px;
}

.omnimux-analytics-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.18));
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,.06));
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, inherit);
}
.omnimux-analytics-banner[data-code="auth_expired"],
.omnimux-analytics-banner[data-code="network_error"] {
  border-color: var(--dsw-alias-state-warn-primary, #b45309);
}
.omnimux-analytics-banner-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.omnimux-analytics-banner-detail {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.7));
}

.omnimux-analytics-kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}
.omnimux-analytics-kpi {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  min-height: 98px;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.16));
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,.04));
}
.omnimux-analytics-kpi-title {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary, rgba(128,128,128,.72));
}
.omnimux-analytics-kpi-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.omnimux-analytics-kpi-value {
  margin: 0;
  font-size: 26px; /* exempt-ui10: KPI 大数字特化，非标题 */
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 32px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary, inherit);
}
.omnimux-analytics-kpi-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  line-height: 14px;
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.55));
  background: var(--dsw-alias-bg-module-platform, rgba(128,128,128,.08));
  white-space: nowrap;
}
.omnimux-analytics-kpi-badge.is-up {
  color: var(--dsw-alias-label-success, #15803d);
  background: var(--dsw-alias-state-success-soft, rgba(21, 128, 61, 0.1));
}
.omnimux-analytics-best {
  display: flex;
  align-items: center;
  gap: 12px;
}
.omnimux-analytics-best-cover {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 10px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary-inverted, #fff);
  background: var(--dsw-alias-brand-primary, #6366f1);
}
.omnimux-analytics-best-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.omnimux-analytics-best-views {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.omnimux-analytics-best-views span {
  font-size: 12px;
  font-weight: 400;
  color: var(--dsw-alias-label-secondary, rgba(128,128,128,.72));
}
.omnimux-analytics-best-link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-top: 2px;
  font-size: 12px;
  color: var(--dsw-alias-brand-primary, #3b82f6);
  text-decoration: none;
}
.omnimux-analytics-best-link.is-disabled {
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.45));
  pointer-events: none;
}

.omnimux-analytics-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.omnimux-analytics-panel {
  display: flex;
  flex-direction: column;
  padding: 20px;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.16));
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,.04));
  min-width: 0;
}
.omnimux-analytics-panel-wide { grid-column: 1 / -1; }
.omnimux-analytics-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.omnimux-analytics-panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: var(--dsw-alias-label-primary, inherit);
}
.omnimux-analytics-panel-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.55));
}
.omnimux-analytics-panel-meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.omnimux-analytics-panel-meta span {
  font-size: 11px;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.55));
}
.omnimux-analytics-chartbox {
  width: 100%;
  height: 220px;
}
.omnimux-analytics-panel-wide .omnimux-analytics-chartbox { height: 260px; }
.omnimux-analytics-svg { width: 100%; height: 100%; display: block; overflow: visible; }
.omnimux-analytics-gridline {
  stroke: var(--dsw-alias-border-l1, rgba(128,128,128,.14));
  stroke-width: 1;
}
.omnimux-analytics-tick {
  fill: var(--dsw-alias-label-tertiary, rgba(128,128,128,.55));
  font-size: 10px;
}
.omnimux-analytics-tick-y { text-anchor: end; }
.omnimux-analytics-tick-y1 { text-anchor: start; }
.omnimux-analytics-tick-x { text-anchor: middle; }
.omnimux-analytics-bar { fill: var(--dsw-alias-label-primary, #18181b); }
.omnimux-analytics-line {
  fill: none;
  stroke: var(--series-color, currentColor);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.omnimux-analytics-line-dash { stroke-dasharray: 4 4; }
.omnimux-analytics-area {
  fill: var(--series-color, currentColor);
  opacity: 0.12;
}
.omnimux-analytics-dot { fill: var(--series-color, currentColor); }

.omnimux-analytics-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.12));
}
.omnimux-analytics-pill {
  display: inline-flex !important;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px !important;
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary, rgba(128,128,128,.72));
  cursor: pointer;
  user-select: none;
}
.omnimux-analytics-pill.is-on { color: var(--dsw-alias-label-primary, inherit); }
.omnimux-analytics-pill-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pill-color, currentColor);
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(128,128,128,.2));
}
.omnimux-analytics-pill:not(.is-on) .omnimux-analytics-pill-dot { opacity: 0.35; }
.omnimux-analytics-pill strong {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.omnimux-analytics-pill-delta {
  font-size: 10px;
  color: var(--dsw-alias-label-success, #10b981);
  font-variant-numeric: tabular-nums;
}

.omnimux-analytics-heatmap {
  display: grid;
  grid-template-columns: 44px repeat(24, minmax(0, 1fr));
  gap: 3px;
  position: relative;
}
.omnimux-analytics-heatmap-row { display: contents; }
.omnimux-analytics-heatmap-label {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.55));
  display: flex;
  align-items: center;
  height: 14px;
}
.omnimux-analytics-heatcell {
  height: 14px;
  border-radius: 2px;
  background: var(--omnimux-analytics-heat-0);
  cursor: pointer;
}
.omnimux-analytics-heatcell[data-level="1"] { background: var(--omnimux-analytics-heat-1); }
.omnimux-analytics-heatcell[data-level="2"] { background: var(--omnimux-analytics-heat-2); }
.omnimux-analytics-heatcell[data-level="3"] { background: var(--omnimux-analytics-heat-3); }
.omnimux-analytics-heatcell[data-level="4"] { background: var(--omnimux-analytics-heat-4); }
.omnimux-analytics-heatcell:hover {
  outline: 2px solid var(--dsw-alias-label-primary, currentColor);
  outline-offset: 1px;
}
.omnimux-analytics-heatmap-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.55));
}
.omnimux-analytics-heatmap-legend .omnimux-analytics-heatcell {
  width: 10px;
  height: 10px;
  cursor: default;
}
.omnimux-analytics-heatmap-tip {
  grid-column: 1 / -1;
  margin-top: 4px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, rgba(128,128,128,.72));
}

.omnimux-analytics-chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  font-size: 12px;
}
.omnimux-analytics-chips-label {
  color: var(--dsw-alias-label-secondary, rgba(128,128,128,.72));
  font-weight: 500;
}
.omnimux-analytics-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.18));
  background: var(--dsw-alias-bg-module-platform, rgba(128,128,128,.08));
  font-size: 11px;
  font-weight: 500;
}
.omnimux-analytics-chip.is-highlight {
  color: var(--dsw-alias-label-success, #15803d);
  background: var(--dsw-alias-state-success-soft, rgba(33, 110, 57, 0.12));
  border-color: var(--dsw-alias-label-success, rgba(33, 110, 57, 0.25));
}

.omnimux-analytics-platform {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}
.omnimux-analytics-platform-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--omnimux-analytics-platform-tiktok);
  flex: none;
}
.omnimux-analytics-platform-dot[data-platform="twitter"] { background: var(--omnimux-analytics-platform-twitter); }
.omnimux-analytics-platform-dot[data-platform="youtube"] { background: var(--omnimux-analytics-platform-youtube); }
.omnimux-analytics-platform-dot[data-platform="instagram"] { background: var(--omnimux-analytics-platform-instagram); }

.omnimux-analytics-tablewrap {
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.16));
  background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,.04));
  overflow: hidden;
}
.omnimux-analytics-table-head {
  padding: 16px 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.12));
}
.omnimux-analytics-tablescroll { overflow-x: auto; }
.omnimux-analytics-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;
}
.omnimux-analytics-table th {
  background: var(--dsw-alias-bg-module-platform, rgba(128,128,128,.06));
  color: var(--dsw-alias-label-secondary, rgba(128,128,128,.72));
  font-weight: 500;
  font-size: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.16));
  white-space: nowrap;
}
.omnimux-analytics-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.1));
  color: var(--dsw-alias-label-primary, inherit);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.omnimux-analytics-table td.is-num { text-align: right; }
.omnimux-analytics-table tbody tr:hover td {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.06));
}
.omnimux-analytics-er {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--dsw-alias-state-success-soft, rgba(34, 197, 94, 0.1));
  color: var(--dsw-alias-label-success, #16a34a);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.omnimux-analytics-postcell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 220px;
}
.omnimux-analytics-thumb {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  object-fit: cover;
  flex: none;
  background: var(--dsw-alias-bg-module-platform, rgba(128,128,128,.12));
}
.omnimux-analytics-thumb.is-fallback {
  background: var(--dsw-alias-brand-primary, #6366f1);
}
.omnimux-analytics-posttitle {
  font-weight: 600;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.omnimux-analytics-postmeta {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.55));
}

.omnimux-analytics-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 280px;
  text-align: center;
  padding: 48px 24px;
}
.omnimux-analytics-empty-icon {
  color: var(--dsw-alias-label-tertiary, rgba(128,128,128,.45));
}
.omnimux-analytics-empty-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.omnimux-analytics-empty-text {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, rgba(128,128,128,.72));
  max-width: 420px;
}
.omnimux-analytics-inbox {
  align-items: center;
  text-align: center;
  padding: 48px 24px;
  gap: 12px;
}

@media (max-width: 1200px) {
  .omnimux-analytics-kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .omnimux-analytics-grid-2 { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .omnimux-analytics-kpi-grid { grid-template-columns: 1fr; }
}
`

export function injectAnalyticsStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLES_ID)) return
  const styleNode = document.createElement('style')
  styleNode.id = STYLES_ID
  styleNode.textContent = ANALYTICS_CSS
  document.head.appendChild(styleNode)
}
