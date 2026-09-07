/**
/**
 * Video TriggerBar — 视频摘要触发条门面（Issue 467 / W2, 严格四段式 / T04）。
 *
 * 严格四段式：模式、比例、质量、时长。
 * 内部渲染通用 CfgSummaryBar（32px / 8px / ResizeObserver / 折叠协议），
 * 根类名双锁 wf-video-trigger-bar（DOM 与 CSS 双选择器别名一迭代）。
 * 声音开关不进入胶囊（只在 Popover 内控制）。
 */

import { ChevronDown, Clock } from 'lucide-react';
import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { AspectRatioIcon } from '../cfg/aspectRatioGeometry.ts';
import { CfgSummaryBar } from '../cfg/CfgSummaryBar.tsx';
import { estimateSummaryTextPx } from '../cfg/summaryCollapse.ts';
import type { CfgSummaryItem } from '../cfg/types.ts';
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

/** 图标槽位附加宽（14px 图标 + 4px gap），槽位自身 gap 6px */
const ICON_SLOT_PX = 18;
const SLOT_GAP_PX = 6;
const CHEVRON_SLOT_PX = 20;

/**
 * 单行紧凑摘要触发条（32px / 8px，值优先、类别降权）。
 */
export function VideoTriggerBar({
  params,
  isOpen,
  disabled = false,
  onToggle,
}: VideoTriggerBarProps): ReactElement {
  const summary = formatVideoSummary(params);
  const showMode = Boolean(summary.modeText && params.showModeUi);

  const items = useMemo((): CfgSummaryItem[] => {
    const list: CfgSummaryItem[] = [];
    const push = (
      id: CfgSummaryItem['id'],
      text: string,
      icon: CfgSummaryItem['icon'],
      dropPolicy: CfgSummaryItem['dropPolicy'],
      className: string,
      textClassName?: string,
    ): void => {
      list.push({
        id,
        text,
        icon,
        dropPolicy,
        estimatePx: estimateSummaryTextPx(text) + (icon ? ICON_SLOT_PX : 0) + SLOT_GAP_PX,
        className,
        ...(textClassName ? { textClassName } : {}),
        ...(dropPolicy === 'ellipsis'
          ? { ellipsisClassName: 'wf-video-trigger-bar__slot--ellipsis' }
          : {}),
      });
    };

    if (showMode) {
      push('mode', summary.modeText, undefined, 'hide', 'wf-video-trigger-bar__slot wf-video-trigger-bar__mode');
    }
    push(
      'ratio',
      summary.ratioText,
      <AspectRatioIcon ratio={params.aspectRatio} size={14} />,
      'icon-only',
      'wf-video-trigger-bar__slot wf-video-trigger-bar__ratio',
      'wf-video-trigger-bar__ratio-text',
    );
    if (summary.resolutionText) {
      push('resolution', summary.resolutionText, undefined, 'hide', 'wf-video-trigger-bar__slot wf-video-trigger-bar__resolution');
    }
    push(
      'duration',
      summary.durationText,
      <Clock size={14} strokeWidth={1.75} />,
      'ellipsis',
      'wf-video-trigger-bar__slot wf-video-trigger-bar__duration',
      'wf-video-trigger-bar__duration-text',
    );
    list.push({
      id: 'chevron',
      text: '',
      icon: <ChevronDown size={14} strokeWidth={1.75} />,
      dropPolicy: 'never',
      estimatePx: CHEVRON_SLOT_PX,
      className: 'wf-video-trigger-bar__chevron',
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.fullText, showMode, params.aspectRatio]);

  const className = [
    'wf-video-trigger-bar',
    isOpen ? 'wf-video-trigger-bar--open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <CfgSummaryBar
      items={items}
      fullText={summary.fullText}
      isOpen={isOpen}
      disabled={disabled}
      onToggle={onToggle}
      className={className}
      title={summary.fullText}
      aria-label={summary.fullText || '视频参数'}
      data-show-mode={showMode ? 'true' : 'false'}
    />
  );
}

export default VideoTriggerBar;
