/**
 * CfgDurationGrid — 时长快捷胶囊网格（2026-09-07 全模态收敛 / T02）。
 *
 * - 网格容器 `wf-cfg-duration-grid`：grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 6px;
 * - 单个胶囊 `<button>` `wf-cfg-duration-pill`，选中追加 `--active`，
 *   高 32px / 圆角 8px（废除 28px / 999px），显示 label（如 5s）；
 *   选中态 brand-primary 描边高对比反馈。
 * 仅消费 schema.duration.options；连续区间由门面改渲染 Slider，本组件不假装连续。
 */

import { type ReactElement } from 'react';

/** CfgDurationGrid 属性 */
export interface CfgDurationGridProps {
  value: number;
  options: Array<{ value: number; label: string }>;
  onChange: (v: number) => void;
  /** radiogroup 无障碍标签，缺省「时长」 */
  ariaLabel?: string;
}

/** 时长胶囊网格 */
export function CfgDurationGrid({
  value,
  options,
  onChange,
  ariaLabel = '时长',
}: CfgDurationGridProps): ReactElement {
  return (
    <div className="wf-cfg-duration-grid" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        const cls = isActive
          ? 'wf-cfg-duration-pill wf-cfg-duration-pill--active'
          : 'wf-cfg-duration-pill';
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

export default CfgDurationGrid;
