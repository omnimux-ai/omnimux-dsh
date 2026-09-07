/**
 * CfgCompactToggle — 160px 两态紧凑开关（2026-09-07 全模态收敛 / T02）。
 *
 * 本质是 2-item Segment，宽锁 160px（禁止 width: 100%），
 * 用于有声/无声、纯音乐/带人声等两态布尔，可与其他控件同处一行 field-row，
 * 消除通栏 Segment 造成的空间浪费。
 */

import { type ReactElement, type ReactNode } from 'react';
import { CfgSegment } from './CfgSegment.tsx';

/** CfgCompactToggle 属性 */
export interface CfgCompactToggleProps {
  /** 当前布尔值 */
  value: boolean;
  /** 切换回调 */
  onChange: (v: boolean) => void;
  /** true 态短标签（如「有声」） */
  trueLabel: string;
  /** false 态短标签（如「无声」） */
  falseLabel: string;
  /** true 态可选前置图标 */
  trueIcon?: ReactNode;
  /** false 态可选前置图标 */
  falseIcon?: ReactNode;
  /** radiogroup 无障碍标签 */
  ariaLabel: string;
  /** 追加在容器上的类名（如视频门面的 wf-video-compact-toggle 双锁） */
  className?: string;
}

/** 160px 两态紧凑开关（复用 wf-cfg-seg 皮肤 + wf-cfg-compact-toggle 定宽） */
export function CfgCompactToggle({
  value,
  onChange,
  trueLabel,
  falseLabel,
  trueIcon,
  falseIcon,
  ariaLabel,
  className,
}: CfgCompactToggleProps): ReactElement {
  const containerClass = className
    ? `wf-cfg-compact-toggle ${className}`
    : 'wf-cfg-compact-toggle';
  return (
    <CfgSegment
      options={[
        { value: true, label: trueLabel, icon: trueIcon },
        { value: false, label: falseLabel, icon: falseIcon },
      ]}
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      className={containerClass}
    />
  );
}

export default CfgCompactToggle;
