import React from 'react';
import { createPortal } from 'react-dom';

export interface DropOverlayProps {
  active: boolean;
  title: string;
  description?: string;
}

export const DropOverlay: React.FC<DropOverlayProps> = (props) => {
  const { active, title, description } = props;

  if (!active || typeof document === 'undefined' || !document.body) {
    return null;
  }

  return createPortal(
    <div className="omx-att-drop-mask" role="status" data-omnimux-drop-overlay="true">
      <div className="omx-att-drop-wrap">
        <div className="omx-att-drop-title">{title}</div>
        {description ? <div className="omx-att-drop-desc">{description}</div> : null}
      </div>
    </div>,
    document.body,
  );
};
