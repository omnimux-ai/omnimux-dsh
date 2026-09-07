/**
 * Choice Tile Grid — 长标签互斥枚举选择块（2026-09-07 配置面板 UI 收敛 / T03）。
 *
 * 使用条件：长标签（>4 汉字）或基数 ≥4 且单行 Segment 溢出。
 * 2 列等高网格，单块高 36px，文字居中 nowrap + word-break: keep-all，
 * 杜绝「首尾帧生视\n频」式中文断词撕裂。选中态 brand-primary 描边。
 */

import { type ReactElement } from 'react';

/** ChoiceTile 属性 */
export interface ChoiceTileProps<T extends string | number> {
  /** 选项列表（仅传入有效项；不支持项不得进 DOM） */
  options: Array<{ value: T; label: string }>;
  /** 当前选中值 */
  value: T | undefined;
  /** 选择回调 */
  onChange: (v: T) => void;
  /** radiogroup 无障碍标签 */
  ariaLabel: string;
}

/** 2×N 等高 nowrap 选择块网格 */
export function ChoiceTile<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: ChoiceTileProps<T>): ReactElement {
  return (
    <div className="wf-video-choice-tile-grid" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        const cls = isActive
          ? 'wf-video-choice-tile wf-video-choice-tile--active'
          : 'wf-video-choice-tile';
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={cls}
            data-operation-id={typeof opt.value === 'string' ? opt.value : undefined}
            onClick={() => onChange(opt.value)}
          >
            <span className="wf-video-choice-tile__label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ChoiceTile;
