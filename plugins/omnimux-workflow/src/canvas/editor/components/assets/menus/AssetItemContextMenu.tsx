import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Image, MessageSquarePlus, Folder, FolderInput, Trash2 } from 'lucide-react';
import { stopToolbarNativeEvent } from '../../toolbarPointerGuard';
import type { AssetItem } from '../types';

export interface AssetContextMenuActionHandler {
  (action: string, item: AssetItem): void;
}

interface AssetItemContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  item: AssetItem | null;
  onAction: AssetContextMenuActionHandler;
  onClose: () => void;
}

export const AssetItemContextMenu: React.FC<AssetItemContextMenuProps> = ({
  isOpen,
  x,
  y,
  item,
  onAction,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const menuWidth = 190;
  const menuHeight = 220;
  const left = Math.min(x, window.innerWidth - menuWidth - 10);
  const top = Math.min(y, window.innerHeight - menuHeight - 10);

  const handleItemClick = (action: string) => {
    onAction(action, item);
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      className="wf-context-menu-portal nodrag nopan"
      style={{
        position: 'fixed',
        top: `${Math.max(10, top)}px`,
        left: `${Math.max(10, left)}px`,
        width: `${menuWidth}px`,
        zIndex: 10000,
      }}
      onMouseDown={stopToolbarNativeEvent}
      onPointerDown={stopToolbarNativeEvent}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="wf-context-menu-item" onClick={() => handleItemClick('add-to-canvas')}>
        <Image size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">添加到创作画布</span>
      </div>

      <div className="wf-context-menu-item" onClick={() => handleItemClick('add-to-conversation')}>
        <MessageSquarePlus size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">添加到会话</span>
      </div>

      <div className="wf-context-menu-item" onClick={() => handleItemClick('reveal-in-finder')}>
        <Folder size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">在 Finder 中打开</span>
      </div>

      <div className="wf-context-menu-item" onClick={() => handleItemClick('move-to')}>
        <FolderInput size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">移动到...</span>
      </div>

      <div className="wf-context-menu-divider" />

      <div className="wf-context-menu-item wf-context-menu-item--danger" onClick={() => handleItemClick('delete')}>
        <Trash2 size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">删除</span>
      </div>
    </div>,
    document.body
  );
};
