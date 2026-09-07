/**
 * Video TriggerBar — 单行紧凑摘要触发条 (Issue 467 / W2, 2026-09-07 UI 收敛 / T02).
 *
 * 几何铁律：高 32px / 圆角 8px / max-width 100%（废除 28px / 999px / 260px）。
 * 段间分隔用语义化 CSS 竖线（::before 伪元素），废除行内中点字符节点。
 * 折叠协议：ResizeObserver 测量可用宽度 → collapseSummary 纯函数 5 步丢弃
 * （mode → sound 文字 → ratio 文字 → resolution → duration ellipsis），
 * Chevron 永不丢。图标统一 14px / stroke 1.75。
 * Styles consume only `wf-video-trigger-bar*` classes (no raw hex / banned token island).
 */

import { ChevronDown, Clock, Volume2 } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { AspectRatioIcon } from './aspectRatioGeometry.ts';
import { collapseSummary, estimateSummaryTextPx } from './summaryCollapse.ts';
import { formatVideoSummary } from './summaryFormatter.ts';
import type { CfgSummarySlot, CfgSummarySlotId, CfgSummaryVisibleState, EffectiveVideoParams } from './types.ts';

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

/** 由摘要构建折叠协议输入槽位（顺序 = 视觉顺序） */
function buildSummarySlots(
  summary: ReturnType<typeof formatVideoSummary>,
  showMode: boolean,
): CfgSummarySlot[] {
  const slots: CfgSummarySlot[] = [];
  const push = (
    id: CfgSummarySlotId,
    text: string,
    hasIcon: boolean,
    dropPolicy: CfgSummarySlot['dropPolicy'],
  ): void => {
    slots.push({
      id,
      text,
      hasIcon,
      dropPolicy,
      estimatePx: estimateSummaryTextPx(text) + (hasIcon ? ICON_SLOT_PX : 0) + SLOT_GAP_PX,
    });
  };

  if (showMode) {
    push('mode', summary.modeText, false, 'hide');
  }
  push('ratio', summary.ratioText, true, 'icon-only');
  if (summary.resolutionText) {
    push('resolution', summary.resolutionText, false, 'hide');
  }
  push('duration', summary.durationText, true, 'ellipsis');
  if (summary.soundText) {
    push('sound', summary.soundText, true, 'icon-only');
  }
  slots.push({
    id: 'chevron',
    text: '',
    hasIcon: true,
    dropPolicy: 'never',
    estimatePx: CHEVRON_SLOT_PX,
  });
  return slots;
}

/** 初始可见态：全部可见（挂载后由测量修正） */
const FULLY_VISIBLE: CfgSummaryVisibleState = {
  hidden: new Set<CfgSummarySlotId>(),
  iconOnly: new Set<CfgSummarySlotId>(),
  ellipsis: new Set<CfgSummarySlotId>(),
};

/**
 * 单行紧凑摘要触发条（32px / 8px，值优先、类别降权）。
 */
export function VideoTriggerBar({
  params,
  isOpen,
  disabled = false,
  onToggle,
}: VideoTriggerBarProps): ReactElement {
  const rootRef = useRef<HTMLButtonElement>(null);
  const summary = formatVideoSummary(params);
  const showMode = Boolean(summary.modeText && params.showModeUi);

  const slots = useMemo(
    () => buildSummarySlots(summary, showMode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summary.fullText, showMode],
  );

  const [visible, setVisible] = useState<CfgSummaryVisibleState>(FULLY_VISIBLE);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) {
      return;
    }
    const apply = (): void => {
      // 内容区可用宽 ≈ clientWidth − 左右 padding（10 + 8）
      const available = Math.max(0, el.clientWidth - 18);
      setVisible(collapseSummary(slots, available));
    };
    apply();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [slots]);

  const className = [
    'wf-video-trigger-bar',
    isOpen ? 'wf-video-trigger-bar--open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const durationSlotCls = visible.ellipsis.has('duration')
    ? 'wf-video-trigger-bar__slot wf-video-trigger-bar__duration wf-video-trigger-bar__slot--ellipsis'
    : 'wf-video-trigger-bar__slot wf-video-trigger-bar__duration';

  return (
    <button
      type="button"
      ref={rootRef}
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
      {showMode && !visible.hidden.has('mode') ? (
        <span className="wf-video-trigger-bar__slot wf-video-trigger-bar__mode" data-testid="wf-trigger-mode">
          {summary.modeText}
        </span>
      ) : null}
      <span className="wf-video-trigger-bar__slot wf-video-trigger-bar__ratio">
        <AspectRatioIcon ratio={params.aspectRatio} size={14} />
        {visible.iconOnly.has('ratio') ? null : (
          <span className="wf-video-trigger-bar__ratio-text">{summary.ratioText}</span>
        )}
      </span>
      {summary.resolutionText && !visible.hidden.has('resolution') ? (
        <span className="wf-video-trigger-bar__slot wf-video-trigger-bar__resolution">
          {summary.resolutionText}
        </span>
      ) : null}
      <span className={durationSlotCls}>
        <Clock size={14} strokeWidth={1.75} />
        <span className="wf-video-trigger-bar__duration-text">{summary.durationText}</span>
      </span>
      {summary.soundText && !visible.hidden.has('sound') ? (
        <span className="wf-video-trigger-bar__slot wf-video-trigger-bar__sound">
          <Volume2 size={14} strokeWidth={1.75} />
          {visible.iconOnly.has('sound') ? null : (
            <span className="wf-video-trigger-bar__sound-text">{summary.soundText}</span>
          )}
        </span>
      ) : null}
      <ChevronDown size={14} strokeWidth={1.75} className="wf-video-trigger-bar__chevron" />
    </button>
  );
}

export default VideoTriggerBar;
