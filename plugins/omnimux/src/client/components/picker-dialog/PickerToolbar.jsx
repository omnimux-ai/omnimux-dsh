import React from 'react';

/**
 * 次级工具栏（左侧胶囊筛选 + 右侧紧凑搜索框）
 * @param {{
 *   children?: React.ReactNode,
 *   className?: string,
 * }} props
 */
export function PickerToolbar({ children, className = 'omx-picker-toolbar' }) {
  return <div className={className}>{children}</div>;
}
