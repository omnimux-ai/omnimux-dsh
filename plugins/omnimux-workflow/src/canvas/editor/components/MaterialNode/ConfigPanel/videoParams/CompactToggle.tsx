/**
 * Compact Toggle — 160px 两态紧凑开关（2026-09-07 配置面板 UI 收敛 / T03）。
 *
 * 本质是 2-item Segment，宽锁 160px（禁止 width: 100%），
 * 用于有声/无声等两态布尔，与清晰度同处一行 field-row，
 * 消除通栏 Segment 造成的空间浪费。
 */

import { type ReactElement, type ReactNode } from 'react';

/** CompactToggle 属性 */
export interface CompactToggleProps {
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
}

/** 160px 两态紧凑开关（复用 wf-video-seg 皮肤 + wf-video-compact-toggle 定宽） */
export function CompactToggle({
  value,
  onChange,
  trueLabel,
  falseLabel,
  trueIcon,
  falseIcon,
  ariaLabel,
}: CompactToggleProps): ReactElement {
  const options: Array<{ value: boolean; label: string; icon?: ReactNode }> = [
    { value: true, label: trueLabel, icon: trueIcon },
    { value: false, label: falseLabel, icon: falseIcon },
  ];

  return (
    <div className="wf-video-seg wf-video-compact-toggle" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        const cls = isActive ? 'wf-video-seg__item wf-video-seg__item--active' : 'wf-video-seg__item';
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={cls}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon}
            <span className="wf-video-seg__label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default CompactToggle;
