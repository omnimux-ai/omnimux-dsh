/**
 * Canvas context menu — M2 base version with Add Node drill-down panel.
 * Ported in shape from Gxgen components/ContextMenu.tsx + hooks/useCanvasMenu.ts.
 *
 * Rendered through a portal on document.body; its own token block mirrors
 * the island --wb-* layer so it follows the host theme outside the island
 * subtree.
 *
 * 「添加节点」钻取面板直接挂载 <AddNodeMenu scope="context" />，数据源与 Dock 共用。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronRight,
  Plus,
  UploadCloud,
} from 'lucide-react';
import { useT } from '../../i18n';
import AddNodeMenu from './AddNodeMenu';
import type { CanvasAddNodeType } from './addNodePalette';

export type { CanvasAddNodeType };

export type ContextMenuAction =
  | 'import-asset'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'undo'
  | 'redo'
  | 'select-all'
  | 'execute-selection'
  | 'execute-node';

export type ContextMenuContext =
  | { type: 'pane' }
  | { type: 'node'; nodeId: string }
  | { type: 'selection' };

interface ContextMenuProps {
  x: number;
  y: number;
  visible: boolean;
  context: ContextMenuContext;
  onClose: () => void;
  onAction: (action: ContextMenuAction, context: ContextMenuContext) => void;
  onAddNode?: (type: CanvasAddNodeType) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** Whether the in-island clipboard holds nodes (gates paste). */
  hasClipboard?: boolean;
  hasSelection?: boolean;
}

const MENU_WIDTH = 210;
const ADD_MENU_WIDTH = 230;
const MENU_HEIGHT_ESTIMATE = 260;

interface MenuItemSpec {
  action: ContextMenuAction | 'open-add-node';
  label: string;
  shortcut?: string;
  disabled?: boolean;
  icon?: ReactNode;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  visible,
  context,
  onClose,
  onAction,
  onAddNode,
  canUndo = false,
  canRedo = false,
  hasClipboard = false,
  hasSelection = false,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'main' | 'add-node'>('main');
  const t = useT();

  // Reset view to 'main' whenever menu visibility toggles
  useEffect(() => {
    if (visible) {
      setView('main');
    }
  }, [visible]);

  // Close on outside mousedown and on Escape.
  useEffect(() => {
    if (!visible) return undefined;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, onClose]);

  const items = useMemo((): MenuItemSpec[] => {
    if (context.type === 'node') {
      return [
        { action: 'execute-node', label: t('panel.runHint') },
        { action: 'copy', label: t('menu.copy'), shortcut: '⌘C' },
        { action: 'duplicate', label: t('menu.duplicate'), shortcut: '⌘D' },
        { action: 'paste', label: t('menu.paste'), shortcut: '⌘V', disabled: !hasClipboard },
        { action: 'delete', label: t('menu.delete'), shortcut: 'Del' },
      ];
    }
    if (context.type === 'selection') {
      return [
        { action: 'execute-selection', label: t('menu.executeSelection') },
        { action: 'copy', label: t('menu.copy'), shortcut: '⌘C', disabled: !hasSelection },
        { action: 'duplicate', label: t('menu.duplicate'), shortcut: '⌘D', disabled: !hasSelection },
        { action: 'paste', label: t('menu.paste'), shortcut: '⌘V', disabled: !hasClipboard },
        { action: 'delete', label: t('menu.delete'), shortcut: 'Del' },
      ];
    }
    // pane: 允许快速「素材导入」与「添加节点」展开面板 + 常规编辑动作
    return [
      { action: 'import-asset', label: t('toolbar.add.import_asset'), icon: <UploadCloud size={15} /> },
      { action: 'open-add-node', label: t('menu.addNode'), icon: <Plus size={15} /> },
      { action: 'undo', label: t('toolbar.undo'), shortcut: '⌘Z', disabled: !canUndo },
      { action: 'redo', label: t('toolbar.redo'), shortcut: '⇧⌘Z', disabled: !canRedo },
      { action: 'paste', label: t('menu.paste'), shortcut: '⌘V', disabled: !hasClipboard },
      { action: 'select-all', label: t('menu.selectAll'), shortcut: '⌘A' },
    ];
  }, [context, canUndo, canRedo, hasClipboard, hasSelection, t]);

  if (!visible) return null;

  const currentWidth = view === 'add-node' ? ADD_MENU_WIDTH : MENU_WIDTH;
  const left = Math.min(x, window.innerWidth - currentWidth - 8);
  const top = Math.min(y, window.innerHeight - MENU_HEIGHT_ESTIMATE - 8);

  return createPortal(
    <div
      ref={menuRef}
      className={`wf-context-menu ${view === 'add-node' ? 'wf-node-menu-host' : ''}`}
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {view === 'main' ? (
        items.map((item) => (
          <React.Fragment key={item.action}>
            {context.type === 'pane' && item.action === 'undo' ? (
              <div className="wf-context-menu__separator" />
            ) : null}
            {context.type !== 'pane' && item.action === 'paste' ? (
              <div className="wf-context-menu__separator" />
            ) : null}
            <button
              type="button"
              className={`wf-context-menu__item${item.disabled ? ' wf-context-menu__item--disabled' : ''}`}
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (item.action === 'open-add-node') {
                  setView('add-node');
                } else {
                  onAction(item.action as ContextMenuAction, context);
                }
              }}
            >
              {item.icon ? (
                <span className="wf-context-menu__icon">{item.icon}</span>
              ) : null}
              <span className="wf-context-menu__label">{item.label}</span>
              {item.action === 'open-add-node' ? (
                <ChevronRight size={14} className="wf-node-menu__arrow" />
              ) : item.shortcut ? (
                <span className="wf-context-menu__shortcut">{item.shortcut}</span>
              ) : null}
            </button>
          </React.Fragment>
        ))
      ) : (
        <AddNodeMenu
          scope="context"
          onSelect={(type) => {
            onAddNode?.(type);
            onClose();
          }}
          onBack={() => setView('main')}
        />
      )}
    </div>,
    document.body,
  );
};

export default ContextMenu;
