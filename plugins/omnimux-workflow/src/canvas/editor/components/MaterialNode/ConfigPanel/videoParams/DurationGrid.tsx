/**
 * Video Duration Pill Grid
 *
 * 时长胶囊网格：
 * - 网格容器 `wf-video-duration-grid`：grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 6px;
 * - 单个胶囊 `<button>` `wf-video-duration-pill`，选中追加 `--active`，
 *   高 32px / 圆角 8px（废除 28px / 999px），显示 label（如 5s）；
 *   选中态 brand-primary 描边高对比反馈。
 */

import { type ReactElement } from 'react';

/** DurationGrid 属性 */
export interface DurationGridProps {
  value: number;
  options: Array<{ value: number; label: string }>;
  onChange: (v: number) => void;
}

/** 时长胶囊网格 */
export function DurationGrid({ value, options, onChange }: DurationGridProps): ReactElement {
  return (
    <div className="wf-video-duration-grid" role="radiogroup" aria-label="时长">
      {options.map((opt) => {
        const isActive = opt.value === value;
        const cls = isActive
          ? 'wf-video-duration-pill wf-video-duration-pill--active'
          : 'wf-video-duration-pill';
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={cls}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
