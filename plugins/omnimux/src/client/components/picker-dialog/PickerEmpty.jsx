import React from 'react';
import { Button } from 'dsh-ui-kit';

/**
 * 选择器内容空态与加载态容器
 * @param {{
 *   loading?: boolean,
 *   loadingText?: string,
 *   emptyText?: string,
 *   action?: { label: string, onClick: () => void },
 *   className?: string,
 * }} props
 */
export function PickerEmpty({
  loading = false,
  loadingText = '正在加载…',
  emptyText = '暂无内容',
  action,
  className = 'omx-picker-empty',
}) {
  return (
    <div className={className}>
      <p>{loading ? loadingText : emptyText}</p>
      {!loading && action ? (
        <Button variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
