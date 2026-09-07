/**
 * Audio TriggerBar — 音频（非 ASR）摘要触发条门面（2026-09-07 全模态收敛 / T05）。
 *
 * 内部渲染通用 CfgSummaryBar（32px / 8px / ResizeObserver / 折叠协议）。
 * 槽位（mode → format → duration → chevron）与估算宽为音频门面职责；
 * 折叠顺序 AUDIO_COLLAPSE_ORDER：mode 整段 → format 整段，
 * duration 不进 hide 序、最后走数值 ellipsis（尽量保留时长），Chevron 永不丢。
 * 废除底栏孤立齿轮与内联抽屉。ASR 由宿主不挂载本组件。
 */

import { ChevronDown, Clock } from 'lucide-react';
import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { CfgSummaryBar } from '../cfg/CfgSummaryBar.tsx';
import { AUDIO_COLLAPSE_ORDER, estimateSummaryTextPx } from '../cfg/summaryCollapse.ts';
import type { CfgSummaryItem } from '../cfg/types.ts';
import { formatAudioSummary } from './audioParamAdapter.ts';
import type { AudioTriggerBarProps } from './types.ts';

/** 图标槽位附加宽（14px 图标 + 4px gap），槽位自身 gap 6px */
const ICON_SLOT_PX = 18;
const SLOT_GAP_PX = 6;
const CHEVRON_SLOT_PX = 20;

/**
 * 单行紧凑摘要触发条（32px / 8px，值优先、类别降权）。
 */
export function AudioTriggerBar({
  params,
  isOpen,
  disabled = false,
  onToggle,
}: AudioTriggerBarProps): ReactElement {
  const summary = formatAudioSummary(params);
  const showMode = Boolean(summary.modeText && params.showModeUi);

  const items = useMemo((): CfgSummaryItem[] => {
    const list: CfgSummaryItem[] = [];
    const push = (
      id: CfgSummaryItem['id'],
      text: string,
      icon: CfgSummaryItem['icon'],
      dropPolicy: CfgSummaryItem['dropPolicy'],
    ): void => {
      list.push({
        id,
        text,
        icon,
        dropPolicy,
        estimatePx: estimateSummaryTextPx(text) + (icon ? ICON_SLOT_PX : 0) + SLOT_GAP_PX,
      });
    };

    if (showMode) {
      push('mode', summary.modeText, undefined, 'hide');
    }
    if (summary.formatText) {
      push('format', summary.formatText, undefined, 'hide');
    }
    push('duration', summary.durationText, <Clock size={14} strokeWidth={1.75} />, 'ellipsis');
    list.push({
      id: 'chevron',
      text: '',
      icon: <ChevronDown size={14} strokeWidth={1.75} />,
      dropPolicy: 'never',
      estimatePx: CHEVRON_SLOT_PX,
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.fullText, showMode]);

  return (
    <CfgSummaryBar
      items={items}
      collapseOrder={AUDIO_COLLAPSE_ORDER}
      fullText={summary.fullText}
      isOpen={isOpen}
      disabled={disabled}
      onToggle={onToggle}
      title={summary.fullText}
      aria-label={summary.fullText || '音频参数'}
      data-show-mode={showMode ? 'true' : 'false'}
    />
  );
}

export default AudioTriggerBar;
