import React from 'react';
import { createPortal } from 'react-dom';

export interface DropOverlayProps {
  active: boolean;
  title: string;
  description?: string;
  /** 宿主报告 canAcceptDrop:false 时进入禁用态：不描述投放，只提示不可添加。 */
  disabled?: boolean;
}

export const DropOverlay: React.FC<DropOverlayProps> = (props) => {
  const { active, title, description, disabled } = props;

  if (!active || typeof document === 'undefined' || !document.body) {
    return null;
  }

  return createPortal(
    <div
      className={`omx-att-drop-mask${disabled ? ' omx-att-drop-mask--blocked' : ''}`}
      role="status"
      data-omnimux-drop-overlay="true"
      data-omnimux-drop-disabled={disabled ? 'true' : 'false'}
    >
      <div className="omx-att-drop-wrap">
        <div className="omx-att-drop-title">{title}</div>
        {!disabled && description ? <div className="omx-att-drop-desc">{description}</div> : null}
      </div>
    </div>,
    document.body,
  );
};
