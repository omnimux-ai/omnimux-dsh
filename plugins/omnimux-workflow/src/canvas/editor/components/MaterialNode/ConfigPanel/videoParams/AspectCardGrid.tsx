/**
 * Video Aspect Ratio Card Grid
 *
 * 画幅比例卡片网格：
 * - 网格容器 `wf-video-aspect-grid`：4 列，grid-template-columns: repeat(4, 1fr); gap: 8px;
 *   末行不满时保持格子宽度（诚实空列，不拉宽变形）；
 * - 每张卡片 `<button>` `wf-video-aspect-card`，选中追加 `--active`，高 56px；
 *   选中态 = interactive-bg-active + brand-primary 描边（叠加 inset 1px），高对比可辨；
 * - 上部消费 AspectRatioIcon（24x24 矢量线框），下部为 12px 比例 label（废除 11px）。
 */

import { type ReactElement } from 'react';
import { AspectRatioIcon } from './aspectRatioGeometry.ts';

/** AspectCardGrid 属性 */
export interface AspectCardGridProps {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}

/** 画幅比例卡片网格 */
export function AspectCardGrid({ value, options, onChange }: AspectCardGridProps): ReactElement {
  return (
    <div className="wf-video-aspect-grid" role="radiogroup" aria-label="画幅比例">
      {options.map((opt) => {
        const isActive = opt.value === value;
        const cls = isActive
          ? 'wf-video-aspect-card wf-video-aspect-card--active'
          : 'wf-video-aspect-card';
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={cls}
            onClick={() => onChange(opt.value)}
          >
            <span className="wf-video-aspect-card__icon">
              <AspectRatioIcon ratio={opt.value} size={24} />
            </span>
            <span className="wf-video-aspect-card__label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
