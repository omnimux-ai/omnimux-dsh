/**
 * Hub facade: map OmniMux cloud analytics payloads onto the dashboard
 * view model frozen in omnimux-analytics
 * `docs/2026-08-25-frontend-data-contract.md`.
 *
 * Verticals must not import this file. The browser hits Host
 * `/omnimux/analytics/{overview,insights,followers,sync}`.
 */

export {
  SCHEMA_VERSION,
  SYNC_INTERVAL_MS,
  num,
  normalizeErRatio,
  normalizeErPercentPoints,
  cloudSundayToMonday,
  heatmapLevel,
  bestPostScore,
  ymd,
  parseLocalDate,
  startOfWeekMonday,
  dateLabel,
  publishedLabel,
  unwrap,
  buildCloudQuery,
  emptyDashboard,
  mapDailyMetrics,
  mapPosts,
  deriveKpi,
  mapHeatmap,
  mapCadence,
  mapDecay,
  mapFollowers,
  settleCloud,
  aggregateOverview,
  aggregateInsights,
  aggregateFollowers,
  aggregatePosts,
  aggregateSync,
} from './analytics/index.js'
