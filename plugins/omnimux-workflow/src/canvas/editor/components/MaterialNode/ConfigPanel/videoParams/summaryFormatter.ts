/**
 * Video Summary Capsule Formatter Engine (Issue 467 / W2).
 *
 * Mode text is omitted when `showModeUi` is false (effectiveOps 0/1) so the
 * TriggerBar never shows a lone "全能参考" / mode name or a dangling separator.
 * When ≥2 effective ops, mode text comes from the Catalog operation label.
 */

import type { EffectiveVideoParams } from './types.ts';

/**
 * 视频参数摘要结构化格式化结果
 */
export interface VideoSummaryFormatResult {
  /**
   * 生成模式文案。effectiveOps < 2 时为空串（TriggerBar 不渲染 mode 段）。
   */
  modeText: string;
  /** 画幅比例文案，如 '16:9'、'9:16' */
  ratioText: string;
  /** 清晰度文案，如 '2K'、'1080P'，若模型无分辨率选项则为 null */
  resolutionText: string | null;
  /** 时长文案，如 '8s'、'5s' */
  durationText: string;
  /** 音效状态文案，若支持且开启则为 '有声'，否则为 null */
  soundText: string | null;
  /** 由空格分隔的紧凑完整文本（a11y 用；视觉分隔由 CSS 竖线承担，废除中点 `·`） */
  fullText: string;
}

/**
 * 格式化分辨率标签（如将 1080p 转为 1080P，4k 转为 4K）
 */
function normalizeResolution(resolution: string | undefined): string | null {
  if (!resolution) {
    return null;
  }
  const trimmed = resolution.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toUpperCase();
}

/**
 * 格式化时长标签（如 5 -> '5s'，'8s' -> '8s'）
 */
function normalizeDuration(duration: number | string | undefined): string {
  if (duration === -1) return '自动';
  if (duration === undefined || duration === null) {
    return '5s';
  }
  const str = String(duration).trim();
  if (!str) {
    return '5s';
  }
  if (str.endsWith('s') || str.endsWith('S')) {
    return `${str.slice(0, -1)}s`;
  }
  return `${str}s`;
}

/**
 * Resolve mode text from EffectiveVideoParams.
 * Only non-empty when showModeUi === true (effectiveOps ≥ 2).
 */
function resolveModeText(params: EffectiveVideoParams): string {
  if (!params.showModeUi) return '';
  if (params.operationLabel && params.operationLabel.trim()) {
    return params.operationLabel.trim();
  }
  if (params.operation && params.operation.trim()) {
    return params.operation.trim();
  }
  return '';
}

/**
 * 将生效的 EffectiveVideoParams 转换为胶囊展示用的结构化摘要及拼接文本
 */
export function formatVideoSummary(params: EffectiveVideoParams): VideoSummaryFormatResult {
  const modeText = resolveModeText(params);
  const ratioText = (params.aspectRatio && params.aspectRatio.trim()) || '16:9';
  const resolutionText = normalizeResolution(params.resolution);
  const durationText = normalizeDuration(params.duration);
  const soundText = params.hasSoundSupport && params.sound ? '有声' : null;

  const segments: string[] = [];
  if (modeText) segments.push(modeText);
  if (ratioText) segments.push(ratioText);
  if (resolutionText) segments.push(resolutionText);
  if (durationText) segments.push(durationText);
  if (soundText) segments.push(soundText);

  const fullText = segments.join(' ');

  return {
    modeText,
    ratioText,
    resolutionText,
    durationText,
    soundText,
    fullText,
  };
}
