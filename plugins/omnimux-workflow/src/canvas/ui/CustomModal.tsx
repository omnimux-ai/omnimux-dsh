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
    /**
     * Issue #3058 FE-02：Escape 在 window capture 阶段结算并 stopPropagation——
     * 先于画布 useKeyboardShortcuts 等 window 冒泡监听执行，使「弹窗打开时
     * 按 Escape」只关闭弹窗，不再顺带触发宿主节点失选（失选会卸载 trigger，
     * 导致焦点恢复目标消失）。
     * 菜单优先：本弹窗自己的 CustomSelect 下拉打开时（菜单 portal 在 body、
     * 焦点仍在弹窗内、事件冒泡会经过 overlay），让位给菜单自己的 Escape
     * capture 监听先关闭菜单，本弹窗不随之关闭；同一 Escape 不再关闭弹窗。
     */
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.wf-custom-select-dropdown')) return;
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="wf-modal-overlay wf-canvas-root nodrag nopan"
      onClick={onCancel}
      onKeyDown={(e) => {
        // 框内焦点的 Escape 经 React 合成事件到达这里；原生事件已由
        // window capture 监听结算（菜单打开时 capture 已让位并直接 return），
        // 这里阻止冒泡外泄即可，不再重复结算 onCancel。
        if (e.key === 'Escape') e.stopPropagation();
      }}
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
