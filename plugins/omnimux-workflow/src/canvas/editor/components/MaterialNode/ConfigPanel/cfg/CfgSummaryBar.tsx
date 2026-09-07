/**
 * CfgSummaryBar — 全模态通用摘要触发条（2026-09-07 全模态收敛 / T02）。
 *
 * 几何铁律：高 32px / 圆角 8px / max-width 100%（废除 28px / 999px / 260px）。
 * 段间分隔用语义化 CSS 竖线（::before 伪元素），废除行内中点字符节点。
 * 折叠协议：ResizeObserver 测量可用宽度 → collapseSummary 纯函数按注入
 * collapseOrder 逐步丢弃，Chevron 永不丢。图标统一 14px。
 *
 * 本组件无材质语义：槽位（mode/ratio/duration/voice…）由门面以 items 传入；
 * 视频门面通过 className / item.className 追加 wf-video-trigger-bar* 双锁类名。
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { collapseSummary } from './summaryCollapse.ts';
import type {
  CfgSummaryItem,
  CfgSummarySlot,
  CfgSummarySlotId,
  CfgSummaryVisibleState,
} from './types.ts';

/** CfgSummaryBar 属性 */
export interface CfgSummaryBarProps {
  /** 摘要槽位（视觉顺序；chevron 必须最后且 dropPolicy='never'） */
  items: CfgSummaryItem[];
  /** 折叠优先级，缺省为视频序 DEFAULT_COLLAPSE_ORDER */
  collapseOrder?: readonly CfgSummarySlotId[];
  /** 空格拼接的完整摘要文本（title / aria-label；禁止中点 `·`） */
  fullText: string;
  /** 浮层是否打开（open 态样式与 aria-expanded） */
  isOpen: boolean;
  /** 禁用态：disabled + aria-disabled */
  disabled?: boolean;
  /** 点击切换浮层开合 */
  onToggle: () => void;
  /** 追加在根按钮上的类名（默认 wf-cfg-summary-bar 始终存在） */
  className?: string;
  /** 缺省取 fullText */
  title?: string;
  'aria-label'?: string;
  'data-show-mode'?: string;
}

/** 初始可见态：全部可见（挂载后由测量修正） */
const FULLY_VISIBLE: CfgSummaryVisibleState = {
  hidden: new Set<CfgSummarySlotId>(),
  iconOnly: new Set<CfgSummarySlotId>(),
  ellipsis: new Set<CfgSummarySlotId>(),
};

/** 由 items 推导折叠协议输入（hasIcon 由 icon 是否存在决定） */
function toSlots(items: readonly CfgSummaryItem[]): CfgSummarySlot[] {
  return items.map((item) => ({
    id: item.id,
    text: item.text,
    hasIcon: Boolean(item.icon),
    dropPolicy: item.dropPolicy,
    estimatePx: item.estimatePx,
  }));
}

/**
 * 单行紧凑摘要触发条（32px / 8px，值优先、类别降权）。
 */
export function CfgSummaryBar({
  items,
  collapseOrder,
  fullText,
  isOpen,
  disabled = false,
  onToggle,
  className,
  title,
  'aria-label': ariaLabel,
  'data-show-mode': dataShowMode,
}: CfgSummaryBarProps): ReactElement {
  const rootRef = useRef<HTMLButtonElement>(null);

  const slots = useMemo(
    () => toSlots(items),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
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
      setVisible(collapseSummary(slots, available, collapseOrder));
    };
    apply();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [slots, collapseOrder]);

  const rootClass = [
    'wf-cfg-summary-bar',
    isOpen ? 'wf-cfg-summary-bar--open' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      ref={rootRef}
      className={rootClass}
      disabled={disabled}
      aria-disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-label={ariaLabel ?? (fullText || '参数配置')}
      title={title ?? fullText}
      data-show-mode={dataShowMode}
      onClick={onToggle}
    >
      {items.map((item) => {
        if (visible.hidden.has(item.id)) {
          return null;
        }
        // chevron 槽：裸图标，不参与竖线分隔，永不丢弃
        if (item.id === 'chevron') {
          return (
            <span
              key="chevron"
              className={`wf-cfg-summary-bar__chevron${item.className ? ` ${item.className}` : ''}`}
            >
              {item.icon}
            </span>
          );
        }
        const isEllipsis = visible.ellipsis.has(item.id);
        const slotClass = [
          'wf-cfg-summary-bar__slot',
          `wf-cfg-summary-bar__slot--${item.id}`,
          isEllipsis ? 'wf-cfg-summary-bar__slot--ellipsis' : '',
          item.className ?? '',
          isEllipsis ? (item.ellipsisClassName ?? '') : '',
        ]
          .filter(Boolean)
          .join(' ');
        const hideText = visible.iconOnly.has(item.id) || !item.text;
        return (
          <span key={item.id} className={slotClass}>
            {item.icon}
            {hideText ? null : (
              <span className={`wf-cfg-summary-bar__text${item.textClassName ? ` ${item.textClassName}` : ''}`}>
                {item.text}
              </span>
            )}
          </span>
        );
      })}
    </button>
  );
}

export default CfgSummaryBar;
