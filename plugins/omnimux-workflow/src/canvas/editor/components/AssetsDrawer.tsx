import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowUp } from 'lucide-react';
import { stopToolbarNativeEvent } from './toolbarPointerGuard';
import { toast } from '../../ui';
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
import {
  useDrawerResize,
  executeCanvasImport,
  executeAssetsImport,
  executeCreateFolder,
  AssetsDrawerHeader,
  createConversationItem,
  dispatchAddToSubjects,
  dispatchSaveToAssets,
  dispatchCanvasUtilityAction,
  executeAssetMenuAction,
  executeFolderMenuAction,
  instantiateSubjectToProject,
  createNewSubject,
  type AssetRecord,
} from './assets/drawer';
import { useProjectAssets } from '../hooks/useProjectAssets';
import { useAsyncInstanceGuard } from '../hooks/useAsyncInstanceGuard.ts';
import { useAddToConversation } from '../../hooks/useAddToConversation';
import { useSubjectLibrary } from '../hooks/useSubjectLibrary';

export type { AssetRecord };

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

function isInvalidLocalPath(filePath?: string): boolean {
  if (!filePath) return true;
  return filePath.startsWith('blob:');
}

function clearHoverTimer(ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>): void {
  if (!ref.current) return;
  clearTimeout(ref.current);
  ref.current = null;
}

interface CanvasTabWrapProps {
  nodes: CanvasNodeItem[];
  viewMode: ViewMode;
  onFocusNode: (nodeId: string) => void;
  onContextMenu: (e: React.MouseEvent, item: CanvasNodeItem) => void;
  onHoverItem: (item: AssetItem | CanvasNodeItem | null, e?: React.MouseEvent) => void;
  onViewModeChange: React.Dispatch<React.SetStateAction<ViewMode>>;
  onImport: () => void;
}

const CanvasTabWrap: React.FC<CanvasTabWrapProps> = ({
  nodes,
  viewMode,
  onFocusNode,
  onContextMenu,
  onHoverItem,
  onViewModeChange,
  onImport,
}) => (
  <div className="wf-drawer-tab-canvas-wrap">
    <CanvasOutlineView
      nodes={nodes}
      onFocusNode={onFocusNode}
      onContextMenu={onContextMenu}
      onHoverItem={onHoverItem}
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
      onRefresh={() => toast.success('已刷新画布素材')}
    />
    <div className="wf-assets-bottom-bar-compact">
      <button
        type="button"
        className="wf-assets-action-primary-btn-compact"
        style={{ width: '100%' }}
        onClick={onImport}
      >
        <ArrowUp size={13} />
        <span>导入文件</span>
      </button>
    </div>
  </div>
);

export function executeCanvasMenuAction(
  action: string,
  item: CanvasNodeItem,
  options: {
    handleFocusNode: (id: string) => void;
    addToConversation: (item: any) => void;
    subjectLibrary: any;
    projectAssets: any;
    setCanvasViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
    canvasViewMode: ViewMode;
    guard: any;
    ticket: any;
  },
): void {
  const {
    handleFocusNode,
    addToConversation,
    subjectLibrary,
    projectAssets,
    setCanvasViewMode,
    canvasViewMode,
    guard,
    ticket,
  } = options;

  switch (action) {
    case 'add-to-canvas':
    case 'focus-in-canvas':
      handleFocusNode(item.id);
      toast.info('已在画布中定位');
      break;
    case 'add-to-dialog':
    case 'add-to-chat':
    case 'add-to-conversation':
      addToConversation(createConversationItem(item, 'canvas'));
      break;
    case 'add-to-subjects':
      if (isInvalidLocalPath(item.real_path)) {
        toast.warning('无法索引此文件（无本地路径）');
        break;
      }
      void dispatchAddToSubjects({ real_path: item.real_path, name: item.name }, subjectLibrary, guard, ticket);
      break;
    case 'save-to-assets':
      if (isInvalidLocalPath(item.real_path)) {
        toast.warning('无法索引此文件（无本地路径）');
        break;
      }
      void dispatchSaveToAssets({ real_path: item.real_path, name: item.name }, projectAssets, guard, ticket);
      break;
    default:
      dispatchCanvasUtilityAction(action, item, setCanvasViewMode, canvasViewMode);
      break;
  }
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

  const { drawerWidth, isResizing, startResize } = useDrawerResize();
  const { addToConversation } = useAddToConversation();

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
    return () => clearHoverTimer(hoverTimerRef);
  }, []);

  const handleFocusNode = (nodeId: string) => {
    if (propOnFocusNode) {
      propOnFocusNode(nodeId);
      return;
    }
    const el = document.getElementById(nodeId) || document.querySelector(`[data-id="${nodeId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight-pulse');
    setTimeout(() => el.classList.remove('highlight-pulse'), 1800);
  };

  const handleHoverItem = (item: AssetItem | CanvasNodeItem | null, e?: React.MouseEvent) => {
    clearHoverTimer(hoverTimerRef);

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

  const handleCanvasMenuAction = (action: string, item: CanvasNodeItem) => {
    const ticket = guard.capture();
    executeCanvasMenuAction(action, item, {
      handleFocusNode,
      addToConversation,
      subjectLibrary,
      projectAssets,
      setCanvasViewMode,
      canvasViewMode,
      guard,
      ticket,
    });
  };

  const handleAssetMenuAction = (action: string, item: AssetItem) => {
    const ticket = guard.capture();
    void executeAssetMenuAction(action, item, {
      guard,
      ticket,
      onInsertAsset,
      insertToConversation: (it, kind) => addToConversation(createConversationItem(it, kind)),
      projectAssets,
    });
  };

  const handleFolderMenuAction = (action: string, item: AssetItem) => {
    const ticket = guard.capture();
    void executeFolderMenuAction(action, item, {
      guard,
      ticket,
      projectAssets,
    });
  };

  const handleSelectSubject = (subject: { id: string; name: string }) => {
    const ticket = guard.capture();
    void instantiateSubjectToProject(subject, projectAssets, guard, ticket, () => {
      setViewState('normal');
      setActiveTab('assets');
    });
  };

  const handleCreateSubject = () => {
    const ticket = guard.capture();
    void createNewSubject(subjectLibrary, guard, ticket);
  };

  const handleCanvasImport = () => void executeCanvasImport({ guard, onInsertAsset });
  const handleAssetsImport = () => void executeAssetsImport({ guard, projectAssets });
  const handleCreateFolder = () => void executeCreateFolder({ guard, projectAssets });

  const handleRefreshAssets = () => {
    const ticket = guard.capture();
    void projectAssets.refresh().then(() => {
      if (guard.isCurrent(ticket)) toast.success('已刷新项目资产');
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

      <AssetsDrawerHeader
        activeTab={activeTab}
        viewState={viewState}
        onSelectCanvas={() => {
          setActiveTab('canvas');
          setViewState('normal');
        }}
        onSelectAssets={() => {
          setActiveTab('assets');
        }}
        onClose={() => {
          guard.invalidate();
          onClose();
        }}
      />

      <div className="wf-drawer-body">
        {viewState === 'subject-library' && (
          <SubjectLibraryView
            subjects={subjectLibrary.subjects}
            error={subjectLibrary.error}
            onBack={() => setViewState('normal')}
            onSelectSubject={handleSelectSubject}
            onCreateSubject={handleCreateSubject}
          />
        )}
        {viewState === 'normal' && activeTab === 'canvas' && (
          <CanvasTabWrap
            nodes={canvasNodes}
            viewMode={canvasViewMode}
            onFocusNode={handleFocusNode}
            onContextMenu={handleCanvasContextMenu}
            onHoverItem={handleHoverItem}
            onViewModeChange={setCanvasViewMode}
            onImport={handleCanvasImport}
          />
        )}
        {viewState === 'normal' && activeTab === 'assets' && (
          <ProjectAssetsView
            assets={projectAssets.assets}
            onOpenSubjects={() => setViewState('subject-library')}
            onContextMenu={handleAssetContextMenu}
            onHoverItem={handleHoverItem}
            onImportFiles={handleAssetsImport}
            onCreateFolder={handleCreateFolder}
            onInsertToCanvas={(item) => onInsertAsset?.(item)}
            onRefresh={handleRefreshAssets}
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
