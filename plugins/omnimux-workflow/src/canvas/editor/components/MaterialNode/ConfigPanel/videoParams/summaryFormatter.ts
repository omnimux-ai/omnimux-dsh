/**
 * Video Summary Capsule Formatter Engine (Issue 467 / W2, Feed-Slot 阶段二 / T04)。
 *
 * 胶囊摘要严格四段式：[ 生成模式 · 比例 · 质量 · 时长 ]。
 *   - 生成模式：仅 showModeUi（effectiveOps ≥ 2）时出现，文案取 Catalog label；
 *   - 质量（分辨率）：模型无分辨率选项时整段缺席；
 *   - 声音开关只在 Popover 内部展示与控制，绝不进入 TriggerBar 胶囊文字；
 *   - 任何一段缺席都不留悬空分隔符。
 */

import type { EffectiveVideoParams } from './types.ts';

/**
 * 视频参数摘要结构化格式化结果（严格四段）。
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
  /** 由空格分隔的紧凑完整文本（a11y 用；视觉分隔由 CSS 竖线承担，废除中点 `·`） */
  fullText: string;
}

/**
 * 格式化画幅比例文案（将 adaptive / auto 映射为「自适应」）
 */
function normalizeRatio(ratio: string | undefined): string {
  if (!ratio) return '16:9';
  const trimmed = ratio.trim();
  if (trimmed === 'adaptive' || trimmed === 'auto') {
    return '自适应';
  }
  return trimmed;
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
 * 将生效的 EffectiveVideoParams 转换为胶囊展示用的四段式结构化摘要及拼接文本。
 * 声音（sound / hasSoundSupport）被刻意忽略：它只属于 Popover 内部。
 */
export function formatVideoSummary(params: EffectiveVideoParams): VideoSummaryFormatResult {
  const modeText = resolveModeText(params);
  const ratioText = normalizeRatio(params.aspectRatio);
  const resolutionText = normalizeResolution(params.resolution);
  const durationText = normalizeDuration(params.duration);

  const segments: string[] = [];
  if (modeText) segments.push(modeText);
  if (ratioText) segments.push(ratioText);
  if (resolutionText) segments.push(resolutionText);
  if (durationText) segments.push(durationText);

  const fullText = segments.join(' ');

  return {
    modeText,
    ratioText,
    resolutionText,
    durationText,
    fullText,
  };
}
