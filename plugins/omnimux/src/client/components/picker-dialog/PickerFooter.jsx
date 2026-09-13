import React from 'react';
import { Button } from 'dsh-ui-kit';

/**
 * 统一选择器弹窗页脚（左侧选择提示/元信息，右侧取消/确认操作按钮）
 * @param {{
 *   meta?: React.ReactNode,
 *   cancelLabel?: string,
 *   confirmLabel?: string,
 *   onCancel: () => void,
 *   onConfirm: () => void,
 *   confirmDisabled?: boolean,
 *   busy?: boolean,
 *   className?: string,
 *   metaClassName?: string,
 *   actionsClassName?: string,
 * }} props
 */
export function PickerFooter({
  meta,
  cancelLabel = '取消',
  confirmLabel = '确认',
  onCancel,
  onConfirm,
  confirmDisabled = false,
  busy = false,
  className = 'omx-picker-footer',
  metaClassName = 'omx-picker-meta',
  actionsClassName = 'omx-picker-actions',
}) {
  return (
    <div className={className}>
      {meta ? <div className={metaClassName}>{meta}</div> : null}
      <div className={actionsClassName}>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant="primary"
          disabled={confirmDisabled || busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
