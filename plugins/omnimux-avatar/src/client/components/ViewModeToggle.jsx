// 历史画廊的浏览方式切换：时间线 / 网格。
// 与源工作台 view-mode-toggle.tsx 1:1。

import { useMemo } from 'react'
import { SegmentedToggle } from './SegmentedToggle.jsx'

/** 时间线：矢量三行图标。 */
function RowsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M2 3.5h10M2 7h10M2 10.5h10"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** 网格：矢量田字图标。 */
function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="4.2" height="4.2" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="7.8" y="2" width="4.2" height="4.2" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2" y="7.8" width="4.2" height="4.2" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="7.8" y="7.8" width="4.2" height="4.2" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/**
 * @param {{
 *   value: 'timeline'|'grid',
 *   onChange: (value: 'timeline'|'grid') => void,
 *   className?: string,
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 * }} props
 */
export function ViewModeToggle(props) {
  const { value, onChange, className, t } = props
  const options = useMemo(
    () => [
      { value: 'timeline', label: t('viewMode.timeline'), icon: <RowsIcon /> },
      { value: 'grid', label: t('viewMode.grid'), icon: <GridIcon /> },
    ],
    [t]
  )
  return (
    <SegmentedToggle
      value={value}
      onChange={onChange}
      options={options}
      ariaLabel={t('viewMode.title')}
      className={className}
    />
  )
}
