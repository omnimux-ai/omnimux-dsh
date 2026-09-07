/**
 * Image TriggerBar — 图像摘要触发条门面（2026-09-07 全模态收敛 / T04）。
 *
 * 内部渲染通用 CfgSummaryBar（32px / 8px / ResizeObserver / 折叠协议）。
 * 槽位（mode → ratio → resolution → chevron）与估算宽为图像门面职责；
 * 折叠顺序 IMAGE_COLLAPSE_ORDER：mode 整段 → ratio 文字 → resolution 整段，
 * Chevron 永不丢。废除底栏幽灵 Select 与前置 `|`。
 */

import { ChevronDown } from 'lucide-react';
import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { AspectRatioIcon } from '../cfg/aspectRatioGeometry.ts';
import { CfgSummaryBar } from '../cfg/CfgSummaryBar.tsx';
import { IMAGE_COLLAPSE_ORDER, estimateSummaryTextPx } from '../cfg/summaryCollapse.ts';
import type { CfgSummaryItem } from '../cfg/types.ts';
import { formatImageSummary } from './imageParamAdapter.ts';
import type { ImageTriggerBarProps } from './types.ts';

/** 图标槽位附加宽（14px 图标 + 4px gap），槽位自身 gap 6px */
const ICON_SLOT_PX = 18;
const SLOT_GAP_PX = 6;
const CHEVRON_SLOT_PX = 20;

/**
 * 单行紧凑摘要触发条（32px / 8px，值优先、类别降权）。
 */
export function ImageTriggerBar({
  params,
  isOpen,
  disabled = false,
  onToggle,
}: ImageTriggerBarProps): ReactElement {
  const summary = formatImageSummary(params);
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
    push('ratio', summary.ratioText, <AspectRatioIcon ratio={params.aspectRatio} size={14} />, 'icon-only');
    if (summary.resolutionText) {
      push('resolution', summary.resolutionText, undefined, 'hide');
    }
    list.push({
      id: 'chevron',
      text: '',
      icon: <ChevronDown size={14} strokeWidth={1.75} />,
      dropPolicy: 'never',
      estimatePx: CHEVRON_SLOT_PX,
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.fullText, showMode, params.aspectRatio]);

  return (
    <CfgSummaryBar
      items={items}
      collapseOrder={IMAGE_COLLAPSE_ORDER}
      fullText={summary.fullText}
      isOpen={isOpen}
      disabled={disabled}
      onToggle={onToggle}
      title={summary.fullText}
      aria-label={summary.fullText || '图像参数'}
      data-show-mode={showMode ? 'true' : 'false'}
    />
  );
}

export default ImageTriggerBar;
