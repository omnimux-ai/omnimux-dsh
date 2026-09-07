/**
 * Video TriggerBar — 单行紧凑摘要胶囊触发器 (Issue 467 / W2, T04)。
 *
 * 严格四段式：[ 生成模式 · 比例 · 质量 · 时长 ]。When effectiveOps ≤ 1,
 * mode text and its leading separator are omitted entirely (no dangling "·").
 * 声音开关不进入胶囊（只在 Popover 内控制）。Styles consume only
 * `wf-video-trigger-bar*` classes (no raw hex / banned token island).
 */

import { ChevronDown, Clock } from 'lucide-react';
import type { ReactElement } from 'react';
import { AspectRatioIcon } from './aspectRatioGeometry.ts';
import { formatVideoSummary } from './summaryFormatter.ts';
import type { EffectiveVideoParams } from './types.ts';

/** VideoTriggerBar 属性 */
export interface VideoTriggerBarProps {
  /** 当前生效的视频参数（已清洗校验） */
  params: EffectiveVideoParams;
  /** 浮层是否打开（用于 open 态样式与 aria-expanded） */
  isOpen: boolean;
  /** 禁用态：置 disabled + aria-disabled，样式 opacity 0.35 */
  disabled?: boolean;
  /** 点击触发器切换浮层开合的回调 */
  onToggle: () => void;
}

/**
 * 单行紧凑摘要胶囊触发器。
 */
export function VideoTriggerBar({
  params,
  isOpen,
  disabled = false,
  onToggle,
}: VideoTriggerBarProps): ReactElement {
  const summary = formatVideoSummary(params);
  const showMode = Boolean(summary.modeText && params.showModeUi);

  const className = [
    'wf-video-trigger-bar',
    isOpen ? 'wf-video-trigger-bar--open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      aria-disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-label={summary.fullText || '视频参数'}
      title={summary.fullText}
      data-show-mode={showMode ? 'true' : 'false'}
      onClick={onToggle}
    >
      {showMode ? (
        <>
          <span className="wf-video-trigger-bar__mode" data-testid="wf-trigger-mode">
            {summary.modeText}
          </span>
          <span className="wf-video-trigger-bar__dot" aria-hidden="true">·</span>
        </>
      ) : null}
      <span className="wf-video-trigger-bar__ratio">
        <AspectRatioIcon ratio={params.aspectRatio} size={12} />
        <span className="wf-video-trigger-bar__ratio-text">{summary.ratioText}</span>
      </span>
      {summary.resolutionText ? (
        <>
          <span className="wf-video-trigger-bar__dot" aria-hidden="true">·</span>
          <span className="wf-video-trigger-bar__resolution">{summary.resolutionText}</span>
        </>
      ) : null}
      <span className="wf-video-trigger-bar__dot" aria-hidden="true">·</span>
      <span className="wf-video-trigger-bar__duration">
        <Clock size={11} />
        <span className="wf-video-trigger-bar__duration-text">{summary.durationText}</span>
      </span>
      <ChevronDown size={11} className="wf-video-trigger-bar__chevron" />
    </button>
  );
}

export default VideoTriggerBar;
