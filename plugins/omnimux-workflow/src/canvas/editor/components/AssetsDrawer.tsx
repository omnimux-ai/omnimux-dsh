import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X,
  ArrowUp,
} from 'lucide-react';
import { stopToolbarNativeEvent } from './toolbarPointerGuard';
import { toast } from '../../ui';
import { pickLocalFiles } from '../../bridge/apiClient';
import { createAssetsLibraryClient } from '../../bridge/assetsLibraryClient';
import { interpretPickResponse } from '../../bridge/assetsLibraryMapper';
import {
  CanvasOutlineView,
  ProjectAssetsView,
  SubjectLibraryView,
  HoverInspector,
  CanvasItemContextMenu,
  AssetItemContextMenu,
  FolderContextMenu,
  extractCanvasAssets,
} from './assets';
import type { FlowNodeLike } from './assets/extractCanvasAssets';
import type {
  ActiveTab,
  AssetItem,
  CanvasNodeItem,
  ContextMenuState,
  HoverInspectorState,
  ViewMode,
} from './assets/types';
import { useProjectAssets } from '../hooks/useProjectAssets';
import { useAsyncInstanceGuard } from '../hooks/useAsyncInstanceGuard.ts';
import { useAddToConversation } from '../../hooks/useAddToConversation';
import { useSubjectLibrary } from '../hooks/useSubjectLibrary';

export interface AssetRecord {
  id: string;
  name: string;
  type: string;
  description?: string;
  real_path?: string;
  previewUrl?: string;
  files?: Array<{ id: string; name: string; path: string }>;
  tags?: string[];
  updatedAt?: number;
}

interface AssetsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertAsset?: (asset: AssetRecord) => void;
  activeCategory?: string;
  onCategoryChange?: (category: string) => void;
  nodes?: FlowNodeLike[] | null;
  onFocusNode?: (nodeId: string) => void;
  workspaceId?: string | null;
}

const assetsPickClient = createAssetsLibraryClient();

function basenameOf(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '');
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function typeFromName(name: string): AssetItem['type'] {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus'].includes(ext)) return 'audio';
  return 'doc';
}

function reportPickFailure(interpretation: { kind: string; message?: string }): void {
  if (interpretation.kind === 'cancel') return;
  if (interpretation.kind === 'unsupported') {
    toast.warning('当前环境不支持原生文件选择器');
    return;
  }
  toast.error(interpretation.kind === 'error' ? (interpretation.message || '选择文件失败') : '选择文件失败');
}

export const AssetsDrawer: React.FC<AssetsDrawerProps> = ({
  isOpen,
  onClose,
  onInsertAsset,
  nodes: propNodes,
  onFocusNode: propOnFocusNode,
  workspaceId,
}) => {
  const guard = useAsyncInstanceGuard(JSON.stringify([workspaceId, isOpen]));
  const [activeTab, setActiveTab] = useState<ActiveTab>('canvas');
  const [viewState, setViewState] = useState<'normal' | 'subject-library'>('normal');
  const [canvasViewMode, setCanvasViewMode] = useState<ViewMode>('tree');
  const [drawerWidth, setDrawerWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);

  const canvasNodes = useMemo(() => extractCanvasAssets(propNodes), [propNodes]);
  const projectAssets = useProjectAssets(workspaceId ?? null);
  const subjectLibrary = useSubjectLibrary(isOpen && viewState === 'subject-library');

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    targetType: 'canvas-item',
  });

  const [hoverInspector, setHoverInspector] = useState<HoverInspectorState>({
    visible: false,
    x: 0,
    y: 0,
  });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };
  }, []);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = drawerWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(260, Math.min(500, startWidth - (moveEvent.clientX - startX)));
      setDrawerWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [drawerWidth]);

  const handleFocusNode = (nodeId: string) => {
    if (propOnFocusNode) {
      propOnFocusNode(nodeId);
    } else {
      const el = document.getElementById(nodeId) || document.querySelector(`[data-id="${nodeId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlight-pulse');
        setTimeout(() => el.classList.remove('highlight-pulse'), 1800);
      }
    }
  };

  const handleHoverItem = (item: AssetItem | CanvasNodeItem | null, e?: React.MouseEvent) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }

    if (!item || !e) {
      setHoverInspector({ visible: false, x: 0, y: 0, anchorRect: null, item: null });
      return;
    }

    const currentTarget = e.currentTarget as HTMLElement | null;
    const rect = currentTarget?.getBoundingClientRect();
    const anchorRect = rect
      ? {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        }
      : null;
    const drawerRect = drawerRef.current?.getBoundingClientRect();
    const drawerLeft = drawerRect ? drawerRect.left : undefined;

    const { clientX, clientY } = e;
    hoverTimerRef.current = setTimeout(() => {
      setHoverInspector({
        visible: true,
        x: clientX,
        y: clientY,
        anchorRect,
        drawerLeft,
        item,
      });
    }, 200);
  };

  const handleCanvasContextMenu = (e: React.MouseEvent, item: CanvasNodeItem) => {
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      targetType: 'canvas-item',
      targetItem: item,
    });
  };

  const handleAssetContextMenu = (e: React.MouseEvent, item: AssetItem, isFolder: boolean) => {
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      targetType: isFolder ? 'asset-folder' : 'asset-item',
      targetItem: item,
    });
  };

  const itemPath = (item: { name: string; real_path?: string }) =>
    item.real_path || item.name;

  const { addToConversation } = useAddToConversation();

  const insertToConversation = (item: { id?: string; name: string; previewUrl?: string; real_path?: string; type?: string }, kind: 'canvas' | 'asset') => {
    const ext = item.name.match(/\.([a-zA-Z0-9_-]+)$/)?.[1]?.toUpperCase() || 'FILE';
    addToConversation({
      sourcePlugin: kind === 'canvas' ? 'omnimux-workflow' : 'omnimux-assets',
      kind: 'asset',
      entityId: item.id || item.name,
      title: item.name,
      extension: ext,
      relativePath: item.real_path || item.name,
      previewUrl: item.previewUrl,
    });
  };

  const revealInFinder = (item: { name: string; real_path?: string }) => {
    const path = itemPath(item);
    navigator.clipboard?.writeText(path);
    window.dispatchEvent(
      new CustomEvent('omnimux:reveal-in-finder', { detail: { path, name: item.name } }),
    );
    toast.success(`已复制路径，可在访达中定位：${path}`);
  };

  const handleCanvasMenuAction = (action: string, item: CanvasNodeItem) => {
    const ticket = guard.capture();
    switch (action) {
      case 'add-to-canvas':
      case 'focus-in-canvas':
        handleFocusNode(item.id);
        toast.info('已在画布中定位');
        break;
      case 'add-to-dialog':
      case 'add-to-chat':
      case 'add-to-conversation':
        insertToConversation(item, 'canvas');
        break;
      case 'add-to-subjects': {
        if (!item.real_path || item.real_path.startsWith('blob:')) {
          toast.warning('无法索引此文件（无本地路径）');
          break;
        }
        const name = item.name.replace(/\.[^/.]+$/, '') || item.name;
        void subjectLibrary.createSubject(name, [{
          real_path: item.real_path,
          original_name: item.name,
        }]).then((created) => {
          if (!guard.isCurrent(ticket)) return;
          if (created) toast.success(`已添加到主体库：${created.name}`);
          else toast.warning('主体库暂不可用');
        });
        break;
      }
      case 'save-to-assets': {
        if (!item.real_path || item.real_path.startsWith('blob:')) {
          toast.warning('无法索引此文件（无本地路径）');
          break;
        }
        void projectAssets.indexPaths([item.real_path]).then((ok) => {
          if (!guard.isCurrent(ticket)) return;
          if (ok) toast.success(`已存到项目资产：${item.name}`);
          else toast.error('写入项目资产失败');
        });
        break;
      }
      case 'open-preview':
        if (item.previewUrl) {
          window.open(item.previewUrl, '_blank', 'noopener,noreferrer');
          toast.success('已打开预览');
        } else {
          toast.warning('当前素材暂无预览');
        }
        break;
      case 'reveal-in-finder':
        revealInFinder(item);
        break;
      case 'copy-path':
        navigator.clipboard?.writeText(itemPath(item));
        toast.success(`已复制路径：${itemPath(item)}`);
        break;
      case 'copy-file':
        navigator.clipboard?.writeText(item.name);
        toast.success(`已复制文件名：${item.name}`);
        break;
      case 'duplicate':
        toast.info('请在画布上复制节点');
        break;
      case 'toggle-tree-view':
        setCanvasViewMode((prev) => (prev === 'tree' ? 'grid' : 'tree'));
        toast.success(canvasViewMode === 'tree' ? '已切换到网格视图' : '已切换到树形视图');
        break;
      case 'rename':
        toast.info('请在画布上重命名节点');
        break;
      case 'delete':
        toast.info('请在画布上删除节点');
        break;
      default:
        toast.warning(`未识别的菜单动作：${action}`);
        break;
    }
  };

  const handleAssetMenuAction = (action: string, item: AssetItem) => {
    const ticket = guard.capture();
    switch (action) {
      case 'add-to-canvas':
        onInsertAsset?.(item);
        toast.success(`已添加到画布：${item.name}`);
        break;
      case 'add-to-agent':
      case 'add-to-chat':
      case 'add-to-conversation':
        insertToConversation(item, 'asset');
        break;
      case 'reveal-in-finder':
        revealInFinder(item);
        break;
      case 'move-to': {
        const folders = projectAssets.assets.filter((row) => row.type === 'folder' && row.id !== item.id);
        const names = folders.map((folder) => folder.name).join(' / ') || '根目录';
        const target = prompt(`移动至目标文件夹（${names}）：`, folders[0]?.name || '');
        if (target && target.trim()) {
          const folder = folders.find((row) => row.name === target.trim());
          void projectAssets.moveNode(item.id, folder?.id ?? null).then((ok) => {
            if (!guard.isCurrent(ticket)) return;
            if (ok) toast.success(`已移动到：${target.trim()}`);
            else toast.error('移动失败');
          });
        }
        break;
      }
      case 'delete':
        void projectAssets.deleteNode(item.id).then((ok) => {
          if (!guard.isCurrent(ticket)) return;
          if (ok) toast.success(`已删除：${item.name}`);
          else toast.error('删除失败');
        });
        break;
      default:
        toast.warning(`未识别的菜单动作：${action}`);
        break;
    }
  };

  const handleFolderMenuAction = (action: string, item: AssetItem) => {
    const ticket = guard.capture();
    switch (action) {
      case 'reveal-in-finder':
        revealInFinder(item);
        break;
      case 'rename': {
        const newName = prompt('重命名文件夹：', item.name);
        if (newName && newName.trim()) {
          void projectAssets.renameFolder(item.id, newName.trim()).then((ok) => {
            if (!guard.isCurrent(ticket)) return;
            if (ok) toast.success('文件夹已重命名');
            else toast.error('重命名失败');
          });
        }
        break;
      }
      case 'move-to': {
        const folders = projectAssets.assets.filter((row) => row.type === 'folder' && row.id !== item.id);
        const names = folders.map((folder) => folder.name).join(' / ') || '根目录';
        const target = prompt(`移动至目标文件夹（${names}）：`, folders[0]?.name || '');
        if (target && target.trim()) {
          const folder = folders.find((row) => row.name === target.trim());
          void projectAssets.moveNode(item.id, folder?.id ?? null).then((ok) => {
            if (!guard.isCurrent(ticket)) return;
            if (ok) toast.success(`文件夹已移动到：${target.trim()}`);
            else toast.error('移动失败');
          });
        }
        break;
      }
      case 'delete':
        void projectAssets.deleteNode(item.id).then((ok) => {
          if (!guard.isCurrent(ticket)) return;
          if (ok) toast.success(`已删除文件夹：${item.name}`);
          else toast.error('删除失败');
        });
        break;
      default:
        toast.warning(`未识别的菜单动作：${action}`);
        break;
    }
  };

  /** Canvas Tab: #122 workflow pick. Never falls back to hidden <input type=file>. */
  const handleCanvasImport = async () => {
    const ticket = guard.capture();
    if (!guard.isCurrent(ticket)) return;
    const result = await pickLocalFiles().catch(() => null);
    if (!guard.isCurrent(ticket)) return;
    if (!result) {
      toast.error('选择文件失败');
      return;
    }
    const interpretation = interpretPickResponse(result);
    if (interpretation.kind !== 'ok') {
      reportPickFailure(interpretation);
      return;
    }
    for (const path of interpretation.paths) {
      const name = basenameOf(path);
      onInsertAsset?.({
        id: path,
        name,
        type: typeFromName(name),
        real_path: path,
      });
    }
    toast.success(`已导入 ${String(interpretation.paths.length)} 个文件到画布`);
  };

  /** Assets Tab: POST /omnimux/assets/pick. Cancel = no toast.error, no write. */
  const handleAssetsImport = async () => {
    const ticket = guard.capture();
    if (!guard.isCurrent(ticket)) return;
    const result = await assetsPickClient.pickAssets('file');
    if (!guard.isCurrent(ticket)) return;
    const interpretation = result.interpretation;
    if (interpretation.kind !== 'ok') {
      reportPickFailure(interpretation);
      return;
    }
    const ok = await projectAssets.indexPaths(interpretation.paths);
    if (!guard.isCurrent(ticket)) return;
    if (ok) toast.success(`已导入 ${String(interpretation.paths.length)} 个文件`);
    else toast.error(projectAssets.error || '写入项目资产失败');
  };

  const handleCreateFolder = () => {
    const ticket = guard.capture();
    const name = prompt('请输入新文件夹名称：', '新建素材文件夹');
    if (!name || !name.trim()) return;
    void projectAssets.mkdir(name.trim()).then((ok) => {
      if (!guard.isCurrent(ticket)) return;
      if (ok) toast.success(`已新建文件夹：${name.trim()}`);
      else toast.error(projectAssets.error || '新建文件夹失败');
    });
  };

  if (!isOpen) return null;

  return (
    <div
      ref={drawerRef}
      className="wf-assets-drawer-root nodrag nopan"
      style={{ width: `${drawerWidth}px` }}
      onPointerDown={stopToolbarNativeEvent}
      onMouseDown={stopToolbarNativeEvent}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`wf-drawer-resize-handle ${isResizing ? 'resizing' : ''}`} onMouseDown={startResize} />

      <div className="wf-drawer-header-compact">
        <div className="wf-segmented-switch-compact">
          <button
            type="button"
            className={`wf-segmented-tab-compact ${activeTab === 'canvas' && viewState === 'normal' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('canvas');
              setViewState('normal');
            }}
          >
            画布
          </button>

          <button
            type="button"
            className={`wf-segmented-tab-compact ${activeTab === 'assets' || viewState === 'subject-library' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('assets');
            }}
          >
            资产
          </button>
        </div>

        <button
          type="button"
          className="wf-drawer-close-btn-compact"
          onClick={() => { guard.invalidate(); onClose(); }}
          title="关闭抽屉 (Esc / A)"
        >
          <X size={14} />
        </button>
      </div>

      <div className="wf-drawer-body">
        {viewState === 'subject-library' ? (
          <SubjectLibraryView
            subjects={subjectLibrary.subjects}
            error={subjectLibrary.error}
            onBack={() => setViewState('normal')}
            onSelectSubject={(subject) => {
              const ticket = guard.capture();
              void projectAssets.instantiateSubject(subject.id).then((ok) => {
                if (!guard.isCurrent(ticket)) return;
                if (ok) {
                  toast.success(`已实例化到项目：${subject.name}`);
                  setViewState('normal');
                  setActiveTab('assets');
                } else {
                  toast.error(projectAssets.error || '实例化失败');
                }
              });
            }}
            onCreateSubject={() => {
              const ticket = guard.capture();
              const name = prompt('请输入新主体名称：', '新主体');
              if (!name || !name.trim()) return;
              void subjectLibrary.createSubject(name.trim()).then((created) => {
                if (!guard.isCurrent(ticket)) return;
                if (created) toast.success(`已新建主体：${created.name}`);
                else toast.warning('主体库暂不可用，未能创建');
              });
            }}
          />
        ) : activeTab === 'canvas' ? (
          <div className="wf-drawer-tab-canvas-wrap">
            <CanvasOutlineView
              nodes={canvasNodes}
              onFocusNode={handleFocusNode}
              onContextMenu={handleCanvasContextMenu}
              onHoverItem={handleHoverItem}
              viewMode={canvasViewMode}
              onViewModeChange={setCanvasViewMode}
              onRefresh={() => {
                toast.success('已刷新画布素材');
              }}
            />

            <div className="wf-assets-bottom-bar-compact">
              <button
                type="button"
                className="wf-assets-action-primary-btn-compact"
                style={{ width: '100%' }}
                onClick={() => void handleCanvasImport()}
              >
                <ArrowUp size={13} />
                <span>导入文件</span>
              </button>
            </div>
          </div>
        ) : (
          <ProjectAssetsView
            assets={projectAssets.assets}
            onOpenSubjects={() => setViewState('subject-library')}
            onContextMenu={handleAssetContextMenu}
            onHoverItem={handleHoverItem}
            onImportFiles={() => void handleAssetsImport()}
            onCreateFolder={handleCreateFolder}
            onInsertToCanvas={(item) => onInsertAsset?.(item)}
            onRefresh={() => {
              const ticket = guard.capture();
              void projectAssets.refresh().then(() => {
                if (guard.isCurrent(ticket)) toast.success('已刷新项目资产');
              });
            }}
          />
        )}
      </div>

      <HoverInspector
        isOpen={hoverInspector.visible}
        x={hoverInspector.x}
        y={hoverInspector.y}
        anchorRect={hoverInspector.anchorRect}
        drawerLeft={hoverInspector.drawerLeft}
        item={hoverInspector.item || null}
      />

      <CanvasItemContextMenu
        isOpen={contextMenu.visible && contextMenu.targetType === 'canvas-item'}
        x={contextMenu.x}
        y={contextMenu.y}
        item={(contextMenu.targetItem as CanvasNodeItem) || null}
        onAction={handleCanvasMenuAction}
        onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
      />

      <AssetItemContextMenu
        isOpen={contextMenu.visible && contextMenu.targetType === 'asset-item'}
        x={contextMenu.x}
        y={contextMenu.y}
        item={(contextMenu.targetItem as AssetItem) || null}
        onAction={handleAssetMenuAction}
        onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
      />

      <FolderContextMenu
        isOpen={contextMenu.visible && contextMenu.targetType === 'asset-folder'}
        x={contextMenu.x}
        y={contextMenu.y}
        item={(contextMenu.targetItem as AssetItem) || null}
        onAction={handleFolderMenuAction}
        onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
      />
    </div>
  );
};

export default AssetsDrawer;
