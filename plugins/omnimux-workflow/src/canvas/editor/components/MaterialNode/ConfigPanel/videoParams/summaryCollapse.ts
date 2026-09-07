/**
 * videoParams/summaryCollapse — re-export（2026-09-07 全模态收敛 / T01）。
 * 实现已升格至 ../cfg/summaryCollapse.ts（order 参数化，两参调用 ≡ 旧视频序），
 * 本文件仅保持既有引用路径。
 */

export {
  AUDIO_COLLAPSE_ORDER,
  COLLAPSE_ORDER,
  DEFAULT_COLLAPSE_ORDER,
  IMAGE_COLLAPSE_ORDER,
  collapseSummary,
  estimateSummaryTextPx,
} from '../cfg/summaryCollapse.ts';
