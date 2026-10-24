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
  Boxes,
  ChevronRight,
  Plus,
  UploadCloud,
} from 'lucide-react';
import { useT } from '../../i18n';
import AddNodeMenu, { type AddNodeComfyProps } from './AddNodeMenu';
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
  | 'execute-node'
  | 'create-workflow';

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
  /** 钻取面板底部 ComfyUI 工作流入口需要的数据与动作；缺省时不渲染该入口。 */
  comfy?: AddNodeComfyProps;
  canUndo?: boolean;
  canRedo?: boolean;
  /** Whether the in-island clipboard holds nodes (gates paste). */
  hasClipboard?: boolean;
  hasSelection?: boolean;
}

const MENU_WIDTH = 210;
const ADD_MENU_WIDTH = 230;
const MENU_HEIGHT_ESTIMATE = 260;
/**
 * 「添加节点」钻取面板的高度估算（锚点偏低时按它夹取 `top`，避免溢出视口）。
 *
 * Issue 3651 去掉搜索框与分割线后实测自然高度 429px（1728×883、7 个条目 + 平铺入口行），
 * 取 440 留余量：估算偏大只会让面板略微上移，偏小则要等 `maxHeight` 兜底。
 */
const ADD_MENU_HEIGHT_ESTIMATE = 440;
/**
 * 钻取面板自身的盒模型开销：上下 padding 6+6、border 1+1。
 * `maxHeight` 只扣视口边距时，这 14px 会把底部入口卡挤出视口 1px（900×560 实测）。
 */
const ADD_MENU_BOX_OVERHEAD = 14;
/**
 * 底部悬浮控制坞（`.wf-canvas-toolbar`）占用的高度，`maxHeight` 必须把它一起扣掉。
 *
 * 控制坞 `bottom: 24px`、内容约 44px（1728×883 实测 y813–859），z-index 高于面板；
 * 只扣视口边距时，面板最后一行会钻到控制坞下面（Issue 3681 加第 9 个条目后实测
 * 末行只剩顶部约 7px 可点）。留 72px = 24 偏移 + 44 高度 + 间隙。
 */
const ADD_MENU_DOCK_RESERVED = 72;

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
  comfy,
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
        { action: 'create-workflow', label: t('menu.createWorkflow'), shortcut: '⌘G', icon: <Boxes size={15} /> },
        { action: 'paste', label: t('menu.paste'), shortcut: '⌘V', disabled: !hasClipboard },
        { action: 'delete', label: t('menu.delete'), shortcut: 'Del' },
      ];
    }
    // pane: 允许快速「素材导入」与「添加节点」展开面板 + 常规编辑动作
    const paneItems: MenuItemSpec[] = [
      { action: 'import-asset', label: t('toolbar.add.import_asset'), icon: <UploadCloud size={15} /> },
      { action: 'open-add-node', label: t('menu.addNode'), icon: <Plus size={15} /> },
      { action: 'undo', label: t('toolbar.undo'), shortcut: '⌘Z', disabled: !canUndo },
      { action: 'redo', label: t('toolbar.redo'), shortcut: '⇧⌘Z', disabled: !canRedo },
      { action: 'create-workflow', label: t('menu.createWorkflow'), icon: <Boxes size={15} /> },
      { action: 'paste', label: t('menu.paste'), shortcut: '⌘V', disabled: !hasClipboard },
      { action: 'select-all', label: t('menu.selectAll'), shortcut: '⌘A' },
    ];
    if (hasSelection) {
      paneItems.push({ action: 'delete', label: t('menu.delete'), shortcut: 'Del' });
    }
    return paneItems;
  }, [context, canUndo, canRedo, hasClipboard, hasSelection, t]);

  if (!visible) return null;

  const currentWidth = view === 'add-node' ? ADD_MENU_WIDTH : MENU_WIDTH;
  const currentHeightEstimate = view === 'add-node' ? ADD_MENU_HEIGHT_ESTIMATE : MENU_HEIGHT_ESTIMATE;
  const left = Math.min(x, window.innerWidth - currentWidth - 8);
  const top = Math.min(y, Math.max(8, window.innerHeight - currentHeightEstimate - 8));
  // 小视口兜底：面板可压缩，列表内滚动，底部入口卡始终留在视口内。
  // 减数含面板自身 padding/border（ADD_MENU_BOX_OVERHEAD），否则底部卡片会被裁掉几个像素。
  const maxHeight =
    view === 'add-node'
      ? Math.max(200, window.innerHeight - top - 8 - ADD_MENU_BOX_OVERHEAD - ADD_MENU_DOCK_RESERVED)
      : undefined;

  return createPortal(
    <div
      ref={menuRef}
      className={`wf-context-menu ${view === 'add-node' ? 'wf-node-menu-host' : ''}`}
      style={{ left, top, ...(maxHeight ? { maxHeight } : {}) }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {view === 'main' ? (
        items.map((item) => (
          <React.Fragment key={item.action}>
            {context.type === 'pane' && item.action === 'undo' ? (
              <div className="wf-context-menu__separator" />
            ) : null}
            {context.type === 'pane' && item.action === 'create-workflow' ? (
              <div className="wf-context-menu__separator" />
            ) : null}
            {context.type === 'pane' && item.action === 'delete' ? (
              <div className="wf-context-menu__separator" />
            ) : null}
            {context.type !== 'pane' && item.action === 'create-workflow' ? (
              <div className="wf-context-menu__separator" />
            ) : null}
            {context.type !== 'pane' && item.action === 'delete' ? (
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
          comfy={comfy ? {
            recents: comfy.recents,
            onImport: () => {
              comfy.onImport();
              onClose();
            },
            onApplyRecent: (name) => {
              comfy.onApplyRecent(name);
              onClose();
            },
          } : undefined}
        />
      )}
    </div>,
    document.body,
  );
};

export default ContextMenu;
