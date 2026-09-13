import React from 'react';

/**
 * 筛选胶囊标签组
 * @param {{
 *   pills: Array<{ id: string, label: string }>,
 *   activePill: string,
 *   onPillChange: (id: string) => void,
 *   ariaLabel?: string,
 *   className?: string,
 *   pillClassName?: string,
 * }} props
 */
export function PickerFilterPills({
  pills,
  activePill,
  onPillChange,
  ariaLabel = '分类筛选',
  className = 'omx-picker-filter-pills',
  pillClassName = 'omx-picker-pill',
}) {
  return (
    <div className={className} role="radiogroup" aria-label={ariaLabel}>
      {pills.map((pill) => {
        const isActive = activePill === pill.id;
        return (
          <button /* exempt-ui01: 筛选胶囊按钮 */
            key={pill.id}
            type="button"
            className={pillClassName}
            data-active={isActive ? 'true' : 'false'}
            onClick={() => onPillChange(isActive && pill.id !== 'all' ? 'all' : pill.id)}
            title={pill.label}
          >
            {pill.label}
          </button>
        );
      })}
    </div>
  );
}
