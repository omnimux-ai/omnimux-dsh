/**
 * CustomModal — Native Dark-Glass Modal Dialog.
 * Replaces antd `Modal` with a modern, blurred frosted-glass modal.
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface CustomModalProps {
  open: boolean;
  onCancel: () => void;
  title?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number | string;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export const CustomModal: React.FC<CustomModalProps> = ({
  open,
  onCancel,
  title,
  footer,
  width = 640,
  className,
  bodyClassName,
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="wf-modal-overlay wf-canvas-root nodrag nopan"
      onClick={onCancel}
      onWheel={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className={['wf-modal-card nodrag nopan', className].filter(Boolean).join(' ')}
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="wf-modal-header">
          <div className="wf-modal-title">{title}</div>
          <button
            type="button"
            className="wf-modal-close"
            onClick={onCancel}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className={['wf-modal-body', bodyClassName].filter(Boolean).join(' ')}>{children}</div>

        {footer ? <div className="wf-modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
};

export default CustomModal;
