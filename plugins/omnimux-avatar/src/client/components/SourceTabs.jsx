// 右栏数据源切换：灵感库 / 历史记录。
// 与源工作台 source-tabs.tsx 1:1；灵感库在前，因为它是首次到访的默认落点。

import { useMemo } from 'react'
import { SegmentedToggle } from './SegmentedToggle.jsx'

/** 灵感库：矢量火花图标。 */
function SparklesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M7 1.5 8.2 5 11.7 6.2 8.2 7.4 7 10.9 5.8 7.4 2.3 6.2 5.8 5ZM11 9.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 历史记录：矢量时钟图标。 */
function HistoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <circle cx="7" cy="7" r="5.2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M7 4.2V7l1.9 1.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * @param {{
 *   value: 'explore'|'history',
 *   onChange: (value: 'explore'|'history') => void,
 *   className?: string,
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 * }} props
 */
export function SourceTabs(props) {
  const { value, onChange, className, t } = props
  const options = useMemo(
    () => [
      { value: 'explore', label: t('source.explore'), icon: <SparklesIcon /> },
      { value: 'history', label: t('source.history'), icon: <HistoryIcon /> },
    ],
    [t]
  )
  return (
    <SegmentedToggle
      value={value}
      onChange={onChange}
      options={options}
      ariaLabel={t('source.view')}
      className={className}
    />
  )
}
