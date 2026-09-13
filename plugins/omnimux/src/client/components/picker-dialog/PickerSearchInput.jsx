import React from 'react';

/**
 * 紧凑搜索框（带图标与一键清空）
 * @param {{
 *   value: string,
 *   onChange: (val: string) => void,
 *   onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void,
 *   placeholder?: string,
 *   ariaLabel?: string,
 *   className?: string,
 *   inputClassName?: string,
 *   iconClassName?: string,
 *   clearClassName?: string,
 * }} props
 */
export function PickerSearchInput({
  value,
  onChange,
  onKeyDown,
  placeholder = '搜索…',
  ariaLabel = '搜索',
  className = 'omx-picker-search-wrap',
  inputClassName = 'omx-picker-search-input',
  iconClassName = 'omx-picker-search-icon',
  clearClassName = 'omx-picker-search-clear',
}) {
  return (
    <div className={className}>
      <span className={iconClassName} aria-hidden="true">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
      <input
        type="text"
        className={inputClassName}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label={ariaLabel}
      />
      {value ? (
        <button /* exempt-ui01: 搜索清空按钮 */
          type="button"
          className={clearClassName}
          onClick={() => onChange('')}
          aria-label="清空搜索"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
