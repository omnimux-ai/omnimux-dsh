import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageSquarePlus,
  Sparkles,
  Bookmark,
  Crosshair,
  ExternalLink,
  Folder,
  Copy,
  Files,
  ListTree,
  Edit2,
  Trash2,
} from 'lucide-react';
import { stopToolbarNativeEvent } from '../../toolbarPointerGuard';
import type { CanvasNodeItem } from '../types';

export interface CanvasContextMenuActionHandler {
  (action: string, item: CanvasNodeItem): void;
}

interface CanvasItemContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  item: CanvasNodeItem | null;
  onAction: CanvasContextMenuActionHandler;
  onClose: () => void;
}

export const CanvasItemContextMenu: React.FC<CanvasItemContextMenuProps> = ({
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

  // Boundary clamping to prevent viewport overflow
  const menuWidth = 220;
  const menuHeight = 440;
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
        <Crosshair size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">在创作画布中定位</span>
        <span className="wf-context-menu-shortcut">⌘⇧A</span>
      </div>

      <div className="wf-context-menu-item" onClick={() => handleItemClick('add-to-conversation')}>
        <MessageSquarePlus size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">添加到会话</span>
        <span className="wf-context-menu-shortcut">⌘⇧C</span>
      </div>

      <div className="wf-context-menu-item" onClick={() => handleItemClick('add-to-subjects')}>
        <Sparkles size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">添加到主体库</span>
      </div>

      <div className="wf-context-menu-item" onClick={() => handleItemClick('save-to-assets')}>
        <Bookmark size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">存到项目资产</span>
      </div>

      <div className="wf-context-menu-divider" />

      <div className="wf-context-menu-item" onClick={() => handleItemClick('focus-in-canvas')}>
        <Crosshair size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">在创作画布中定位</span>
      </div>

      <div className="wf-context-menu-item" onClick={() => handleItemClick('open-preview')}>
        <ExternalLink size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">打开</span>
        <span className="wf-context-menu-shortcut">⌘O</span>
      </div>

      <div className="wf-context-menu-item" onClick={() => handleItemClick('reveal-in-finder')}>
        <Folder size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">在访达中显示</span>
        <span className="wf-context-menu-shortcut">⌘⇧R</span>
      </div>

      <div className="wf-context-menu-item" onClick={() => handleItemClick('copy-path')}>
        <Copy size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">复制路径</span>
      </div>

      <div className="wf-context-menu-divider" />

      <div className="wf-context-menu-item" onClick={() => handleItemClick('copy-file')}>
        <Copy size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">复制文件</span>
        <span className="wf-context-menu-shortcut">⌘C</span>
      </div>

      <div className="wf-context-menu-item" onClick={() => handleItemClick('duplicate')}>
        <Files size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">复制副本</span>
        <span className="wf-context-menu-shortcut">⌘D</span>
      </div>

      <div className="wf-context-menu-item" onClick={() => handleItemClick('toggle-tree-view')}>
        <ListTree size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">切换到树形视图</span>
      </div>

      <div className="wf-context-menu-item" onClick={() => handleItemClick('rename')}>
        <Edit2 size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">重命名</span>
        <span className="wf-context-menu-shortcut">Enter</span>
      </div>

      <div className="wf-context-menu-divider" />

      <div className="wf-context-menu-item wf-context-menu-item--danger" onClick={() => handleItemClick('delete')}>
        <Trash2 size={14} className="wf-context-menu-icon" />
        <span className="wf-context-menu-label">删除</span>
        <span className="wf-context-menu-shortcut">Backspace</span>
      </div>
    </div>,
    document.body
  );
};
