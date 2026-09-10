/**
 * Ported (narrowed) from Gxgen `CanvasEditor.tsx` (validated by the
 * extraction spike). nodeTypes now generate from the node registry;
 * ReactFlow interaction flags carry over verbatim.
 *
 * M2 additions: undo/redo history (canvasStore History slice), the
 * keyboard-shortcut base set (copy/paste/delete/select-all), the basic
 * context menu (add/delete/copy) and clipboard support — all ported in
 * shape from Gxgen useCanvasHistory / useKeyboardShortcuts / useCanvasMenu.
 *
 * Clipboard and context-menu mechanics live in dedicated hooks so this
 * file stays the ReactFlow wiring shell.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  PanOnScrollMode,
  SelectionMode,
  useReactFlow,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react';
// NOTE: '@xyflow/react/dist/style.css' is injected by src/canvas/index.tsx
// (esbuild text-loader turns CSS imports into strings — they need manual
// <style> injection; see the island entry for the shared injector).
import { toast } from '../ui';
import { useCanvasStore, useGraphStore, useCanUndo, useCanRedo } from '../store/canvasStore';
import type { MaterialType } from '../types/materialNode';
import AnimatedEdge from './components/AnimatedEdge';
import Toolbar, { type CanvasPointerMode } from './components/Toolbar';
import HeaderControls from './components/HeaderControls';
import { CanvasPageHeader } from './components/CanvasPageHeader';
import AssetsDrawer, { type AssetRecord } from './components/AssetsDrawer';
import ShortcutsModal from './components/ShortcutsModal';
import PublishWizardModal from './components/publish/PublishWizardModal.tsx';
import CanvasNodeActionMenu from './components/CanvasNodeActionMenu';
import ContextMenu from './components/ContextMenu';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useConnectionMenu } from './hooks/useConnectionMenu';
import { useCanvasClipboard } from './hooks/useCanvasClipboard';
import { useCanvasContextMenu } from './hooks/useCanvasContextMenu';
import { useT } from '../i18n';
import { CANVAS_ZOOM_CONFIG } from './utils/nodeSizeConfig';
import { validateConnection, rejectReasonKey } from './utils/connectionValidator';
import { DEFAULT_CANVAS_EDGE_OPTIONS } from './utils/canvasConnectionUtils';
import { applyFocusCanvasNode } from './utils/focusCanvasNode';
import { createMaterialNode, appendWithSelectionReset } from './utils/nodeFactory';
import { pickLocalFiles } from '../bridge/apiClient.ts';
import { useAsyncInstanceGuard } from './hooks/useAsyncInstanceGuard.ts';
import { draftsFromPickedPaths } from './utils/localFileDraft.ts';
import { classifyAssetImport } from './utils/assetImportAdapter.ts';
import { planStandaloneImportNodes } from './utils/resourcePickerPolicy.ts';
import { buildNodeTypes, createNode, registerNodeDefinition } from '../nodes/registry';
import { materialNodeDefinition } from '../nodes/definitions/material';
import { tableNodeDefinition } from '../nodes/definitions/table';
import { videoCompositionNodeDefinition } from '../nodes/definitions/videoComposition';
import { groupNodeDefinition } from '../nodes/definitions/group';
import { FloatingSelectionToolbar } from './components/FloatingSelectionToolbar';
import { BatchCreateAssetModal, type MediaAssetItem } from './components/BatchCreateAssetModal';
import { CreateWorkflowModal } from './components/CreateWorkflowModal';
import { calculateGroupBounds, childIdsOfGroup, planAlignLayout } from './utils/nodeVisualMath';
import { createTemplate, getTemplate, listTemplates } from '../bridge/templateApi';
import { sanitizeEdges, sanitizeNodes } from '../bridge/persistSanitize';
import { planInstantiateTemplate } from './utils/planInstantiateTemplate';
import { SpreadsheetStage } from '../components/table-node/stage/SpreadsheetStage';
import { TextStage } from '../components/text-stage/TextStage';
import { CanvasNoticeHost } from './notices/CanvasNoticeHost';
import { canvasNoticeService } from './notices/canvasNoticeService.ts';
import { useTextStageStore } from '../store/textStageStore';
import { registerTableCanvasSyncHandler, registerTableCanvasRowCountQuery } from '../store/tableStore';
import { formatTablePreviewRows } from '../../shared/types/htable.ts';
import type { CapabilityCatalog } from '../../shared/api';

// 抽屉独立隔离保护器：确保抽屉内部发生任何未捕获错误时，画布绝不崩溃或黑屏
class DrawerErrorBoundary extends React.Component<
  { children: React.ReactNode; onClose: () => void },
  { hasError: boolean; errorMsg: string }
> {
  constructor(props: { children: React.ReactNode; onClose: () => void }) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error.message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AssetsDrawer ErrorBoundary] 捕获到抽屉渲染错误:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="wf-assets-drawer-root nodrag nopan"
          style={{ width: '320px', padding: '16px', color: '#fff', background: '#18181b' }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#ef4444', marginBottom: '8px' }}>
            资产抽屉加载异常
          </div>
          <div style={{ fontSize: '11px', color: '#a1a1aa', marginBottom: '12px' }}>
            {this.state.errorMsg || '组件渲染发生未知错误'}
          </div>
          <button
            type="button"
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={() => {
              this.setState({ hasError: false, errorMsg: '' });
              this.props.onClose();
            }}
          >
            重置并关闭
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Register node definitions once at module load (extension point ①).
// nodeTypes built outside the component to prevent re-creation (Gxgen rule).
registerNodeDefinition(materialNodeDefinition);
registerNodeDefinition(tableNodeDefinition);
registerNodeDefinition(videoCompositionNodeDefinition);
registerNodeDefinition(groupNodeDefinition);

const nodeTypes = buildNodeTypes();

const edgeTypes = {
  default: AnimatedEdge,
  animated: AnimatedEdge,
};

const FIT_VIEW_OPTIONS = { maxZoom: 1 } as const;
const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 } as const;
const PAN_ON_DRAG: number[] = [1, 2];
const CONNECTION_RADIUS = 96;

interface CanvasEditorProps {
  catalog: CapabilityCatalog | null;
  workspaceId?: string | null;
  /**
   * M4 组/子集执行入口：右键「执行选中节点 / 执行此节点」回调
   * （subset 模式：nodeIds + 传递上游闭包，由 host 解析）。
   */
  onExecuteNodeIds?: (nodeIds: string[]) => void;
  onStartExecution?: () => void;
  onPauseExecution?: () => void;
  onResumeExecution?: () => void;
  onCancelExecution?: () => void;
  onResetExecution?: () => void;
  onSwitchWorkspaceId?: (newWorkspaceId: string) => void;
}

const CanvasEditorContent: React.FC<CanvasEditorProps> = ({
  catalog,
  workspaceId,
  onExecuteNodeIds,
  onStartExecution,
  onPauseExecution,
  onResumeExecution,
  onCancelExecution,
  onResetExecution,
  onSwitchWorkspaceId,
}) => {
  const t = useT();
  const importGuard = useAsyncInstanceGuard(workspaceId);
  const { screenToFlowPosition, fitView, zoomTo, setCenter } = useReactFlow();
  const reactFlowInstance = useReactFlow();
  const { nodes, edges, onNodesChange, onEdgesChange } = useGraphStore();
  const applyCanvasInputMutation = useCanvasStore((state) => state.applyCanvasInputMutation);
  const setNodes = useCanvasStore((state) => state.setNodes);
  const setSelectedElement = useCanvasStore((state) => state.setSelectedElement);
  const groupNodes = useCanvasStore((state) => state.groupNodes);
  const ungroup = useCanvasStore((state) => state.ungroup);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  // T05：结构硬拒绝（自连/成环等）→ 画板级 Toast（3s 自动淡出，相同文案防堆叠）。
  const publishStructureReject = useCallback((message: string) => {
    canvasNoticeService.publish({ kind: 'structure_reject', message });
  }, []);
  const [isMinimapOpen, setIsMinimapOpen] = useState(false);
  const [isAssetsOpen, setIsAssetsOpen] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [assetsCategoryIndex, setAssetsCategoryIndex] = useState<number | undefined>(undefined);
  const [pointerMode, setPointerMode] = useState<CanvasPointerMode>('select');
  const [batchAssetModalOpen, setBatchAssetModalOpen] = useState(false);
  const [batchAssetItems, setBatchAssetItems] = useState<MediaAssetItem[]>([]);
  const [createWorkflowModalOpen, setCreateWorkflowModalOpen] = useState(false);
  const [targetGroupForWorkflow, setTargetGroupForWorkflow] = useState<{ id: string; title: string; nodeCount: number } | null>(null);
  const [workflowTemplates, setWorkflowTemplates] = useState<Array<{ id: string; name: string; nodeCount: number }>>([]);
  const nodeCreateCounter = useRef(0);

  const hasSelection = useMemo(() => nodes.some((node) => node.selected), [nodes]);

  const selectedRegularNodes = useMemo(
    () => nodes.filter((node) => node.selected && node.type !== 'group'),
    [nodes],
  );

  const multiSelectToolbarPosition = useMemo(() => {
    if (selectedRegularNodes.length < 2) return { x: 0, y: 0 };
    const bounds = calculateGroupBounds(selectedRegularNodes, 0);
    const flowCenterX = bounds.x + bounds.width / 2;
    const flowTopY = bounds.y;
    const vp = typeof reactFlowInstance?.getViewport === 'function' ? reactFlowInstance.getViewport() : { x: 0, y: 0, zoom: 1 };
    const zoom = typeof vp?.zoom === 'number' && Number.isFinite(vp.zoom) && vp.zoom > 0 ? vp.zoom : 1;
    const vpx = typeof vp?.x === 'number' && Number.isFinite(vp.x) ? vp.x : 0;
    const vpy = typeof vp?.y === 'number' && Number.isFinite(vp.y) ? vp.y : 0;
    return {
      x: Math.round(vpx + flowCenterX * zoom),
      y: Math.round(vpy + flowTopY * zoom),
    };
  }, [selectedRegularNodes, reactFlowInstance]);

  const refreshWorkflowTemplates = useCallback(async () => {
    const result = await listTemplates();
    if (!result.ok) return;
    setWorkflowTemplates((result.body.templates || []).map((template) => ({
      id: template.id,
      name: template.name,
      nodeCount: template.nodeCount,
    })));
  }, []);

  useEffect(() => {
    void refreshWorkflowTemplates();
  }, [refreshWorkflowTemplates]);

  // 全屏 TextStage 提交同步器
  useEffect(() => {
    const unregister = useTextStageStore.getState().registerCommitHandler((nodeId, payload) => {
      setNodes((currentNodes) =>
        currentNodes.map((n) => {
          if (n.id !== nodeId) return n;
          const isText = (n.data as any)?.materialType === 'text';
          const trimmed = payload.content.trim();
          return {
            ...n,
            data: {
              ...(n.data || {}),
              label: payload.title,
              content: payload.content,
              versions: payload.versions,
              wordCount: payload.wordCount,
              charCount: payload.charCount,
              status: trimmed ? 'ready' : 'empty',
              ...(isText ? {
                nodeKind: trimmed ? 'import' : 'generate',
                ...(trimmed ? { selectedTool: 'text-editor', prompt: undefined } : {}),
              } : {}),
              generatedContent: undefined,
            },
          };
        }),
      );
    });
    return unregister;
  }, [setNodes]);

  // 全表 TableStage / TableNode 提交同步器与状态查询器
  useEffect(() => {
    const unregisterSync = registerTableCanvasSyncHandler((tableId, doc) => {
      setNodes((currentNodes) =>
        currentNodes.map((n) => {
          if (n.id !== tableId && (n.data as any)?.tableId !== tableId) return n;
          const previewRows = formatTablePreviewRows(doc, 3);
          return {
            ...n,
            data: {
              ...(n.data || {}),
              label: doc.title || (n.data as any)?.label || '表格',
              title: doc.title || (n.data as any)?.title || '表格',
              tableId,
              tablePath: `.omnimux/tables/${tableId}.htable`,
              rowCount: doc.rows.length,
              columnCount: doc.columns.length,
              previewRows,
              status: doc.rows.length > 0 ? 'ready' : 'empty',
            },
          };
        }),
      );
    });

    const unregisterQuery = registerTableCanvasRowCountQuery((tableId) => {
      const node = useCanvasStore.getState().nodes.find(
        (n) => n.id === tableId || (n.data as any)?.tableId === tableId,
      );
      return typeof (node?.data as any)?.rowCount === 'number' ? (node?.data as any)?.rowCount : 0;
    });

    return () => {
      unregisterSync();
      unregisterQuery();
    };
  }, [setNodes]);

  const handleInsertTemplate = useCallback(async (templateId: string) => {
    const result = await getTemplate(templateId);
    if (!result.ok || !result.body.template) {
      toast.error(result.body.message || result.body.error || t('template.toast.loadFailed'));
      return;
    }
    const origin = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const instantiated = planInstantiateTemplate(result.body.template, origin);
    applyCanvasInputMutation({
      addNodes: instantiated.nodes,
      addEdges: instantiated.edges,
    });
    toast.success(t('template.toast.inserted').replace('{name}', result.body.template.name));
  }, [applyCanvasInputMutation, screenToFlowPosition, t]);

  const handleGroupSelected = useCallback(() => {
    const topLevelNodes = selectedRegularNodes.filter((n) => !n.parentId);
    if (topLevelNodes.length < 2) {
      const hasGroupedNode = selectedRegularNodes.some((n) => Boolean(n.parentId));
      if (hasGroupedNode) {
        toast.warning(t('group.toast.alreadyInGroup'));
      } else {
        toast.warning(t('group.toast.cannotGroup'));
      }
      return;
    }

    const groupId = groupNodes(topLevelNodes.map((n) => n.id), t('group.defaultTitle'));
    if (groupId) {
      toast.success(t('group.toast.grouped'));
    } else {
      toast.error(t('group.toast.failed'));
    }
  }, [selectedRegularNodes, groupNodes, t]);

  const handleAlignLayout = useCallback(
    (layoutType: 'horizontal' | 'vertical' | 'grid', targetNodes = selectedRegularNodes) => {
      if (targetNodes.length < 2) return;
      const updatedNodes = planAlignLayout(targetNodes, layoutType, { gap: 40 });
      const updatedMap = new Map(updatedNodes.map((n) => [n.id, n]));

      const firstParentId = targetNodes[0]?.parentId;
      const isSameGroup = Boolean(firstParentId && targetNodes.every((n) => n.parentId === firstParentId));

      setNodes((current) => {
        const nextNodes = current.map((n) => updatedMap.get(n.id) || n);
        if (isSameGroup && firstParentId) {
          const groupChildren = nextNodes.filter((n) => n.parentId === firstParentId && n.type !== 'group');
          if (groupChildren.length > 0) {
            const bounds = calculateGroupBounds(groupChildren, 32);
            return nextNodes.map((n) => {
              if (n.id === firstParentId && n.type === 'group') {
                return {
                  ...n,
                  width: bounds.width,
                  height: bounds.height,
                  style: {
                    ...(n.style || {}),
                    width: bounds.width,
                    height: bounds.height,
                  },
                  data: {
                    ...(n.data || {}),
                    minWidth: bounds.minWidth,
                    minHeight: bounds.minHeight,
                  },
                };
              }
              return n;
            });
          }
        }
        return nextNodes;
      });
      toast.success(t('group.toast.layout'));
    },
    [selectedRegularNodes, setNodes, t],
  );

  // 监听组事件 (整组执行 / 创建工作流 / 组内布局)
  useEffect(() => {
    const handleExecuteGroupEvent = (e: Event) => {
      const customEvt = e as CustomEvent<{ groupId: string; nodeIds?: string[] }>;
      const liveIds = customEvt.detail?.groupId
        ? childIdsOfGroup(nodes, customEvt.detail.groupId)
        : [];
      const nodeIds = liveIds.length > 0 ? liveIds : (customEvt.detail?.nodeIds || []);
      if (nodeIds.length > 0 && onExecuteNodeIds) {
        onExecuteNodeIds(nodeIds);
        toast.success(t('group.toast.execute'));
      }
    };

    const handleLayoutGroupEvent = (e: Event) => {
      const customEvt = e as CustomEvent<{ groupId: string; layoutType: 'horizontal' | 'vertical' | 'grid' }>;
      const { groupId, layoutType } = customEvt.detail;
      const groupChildren = nodes.filter((n) => n.parentId === groupId);
      if (groupChildren.length >= 2) {
        handleAlignLayout(layoutType, groupChildren);
      }
    };

    const handleBatchAssetEvent = (e: Event) => {
      const customEvt = e as CustomEvent<{ nodeIds: string[] }>;
      const targetIds = customEvt.detail?.nodeIds || [];
      const targetNodes = nodes.filter((n) => targetIds.includes(n.id));
      const items: MediaAssetItem[] = targetNodes.map((n) => {
        const d = (n.data || {}) as Record<string, unknown>;
        return {
          id: n.id,
          nodeId: n.id,
          nodeTitle: (d.label as string) || (d.title as string) || (d.name as string) || n.id,
          type: (d.materialType as any) || (n.type as any) || 'image',
          previewUrl: d.previewUrl as string | undefined,
          content: d.content as string | undefined,
          realPath: d.realPath as string | undefined,
        };
      });
      setBatchAssetItems(items);
      setBatchAssetModalOpen(true);
    };

    const handleCreateSubworkflowEvent = (e: Event) => {
      const customEvt = e as CustomEvent<{ groupId: string; groupTitle: string; nodeIds: string[] }>;
      const { groupId, groupTitle } = customEvt.detail;
      const groupChildren = nodes.filter((n) => n.parentId === groupId);
      setTargetGroupForWorkflow({
        id: groupId,
        title: groupTitle || t('template.modal.defaultName'),
        nodeCount: groupChildren.length,
      });
      setCreateWorkflowModalOpen(true);
    };

    window.addEventListener('omnimux:workflow:execute-group', handleExecuteGroupEvent);
    window.addEventListener('omnimux:workflow:layout-group', handleLayoutGroupEvent);
    window.addEventListener('omnimux:workflow:batch-create-asset', handleBatchAssetEvent);
    window.addEventListener('omnimux:workflow:create-subworkflow', handleCreateSubworkflowEvent);

    return () => {
      window.removeEventListener('omnimux:workflow:execute-group', handleExecuteGroupEvent);
      window.removeEventListener('omnimux:workflow:layout-group', handleLayoutGroupEvent);
      window.removeEventListener('omnimux:workflow:batch-create-asset', handleBatchAssetEvent);
      window.removeEventListener('omnimux:workflow:create-subworkflow', handleCreateSubworkflowEvent);
    };
  }, [nodes, onExecuteNodeIds, handleAlignLayout, t]);

  const clipboard = useCanvasClipboard(setNodes, setSelectedElement);

  // W3 T3.2: beam activation moved into AnimatedEdge (downstream-target
  // subscription); the old upstream flowEdges mapping was removed — edges
  // pass through unchanged.
  // W3 T3.4: release menu + rejection toast three-branch split.
  const connectionMenuTitle = t('menu.generateFromNode');
  const {
    menuState: connectionMenuState,
    onConnectStart: handleConnectStart,
    onConnectEnd: handleConnectEnd,
    onMenuSelect: handleConnectionMenuSelect,
    onMenuClose: handleConnectionMenuClose,
  } = useConnectionMenu({ onReject: publishStructureReject });

  // History recording: every nodes/edges change offers a snapshot; the
  // store debounces + dedupes internally (Gxgen useCanvasHistory port).
  useEffect(() => {
    pushHistory();
  }, [nodes, edges, pushHistory]);

  // Nodes carry the capability catalog down to node components via data
  // injection (plain object; island-internal, never persisted — stripped
  // before save by the persistence layer).
  // M5 perf: memoized — without this every editor re-render rebuilt all
  // node/data objects, defeating React Flow's internal node memoization and
  // re-rendering every (memo'd) MaterialNode on each keystroke/selection.
  const flowNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: { ...node.data, __catalog: catalog, __workspaceId: workspaceId },
      })),
    [nodes, catalog, workspaceId],
  );

  // 连线入口：store.onConnect 内部经 mutation gateway 校验
  const handleConnect = useCallback(
    (connection: Connection) => {
      const plan = applyCanvasInputMutation({ addEdges: [connection] });
      if (plan.status === 'rejected') {
        publishStructureReject(t(rejectReasonKey(plan.reasonCode)));
      }
    },
    [applyCanvasInputMutation, publishStructureReject, t],
  );

  // 拖线过程中的实时校验（同 Gxgen isValidConnection 接线）
  // Issue #466：与 mutation gateway 使用同一 evaluator + 同一 catalog 注入。
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const state = useCanvasStore.getState();
      return validateConnection(connection, state.nodes, state.edges, state.catalogRuntime);
    },
    [],
  );

  // 工具栏添加节点（错位网格摆放，避免节点互相遮挡 Handle —— spike 坑 #2）；
  // 右键菜单可传入显式落点。
  // 「导入素材」：先弹系统选文件器，确认后再按文件落导入节点；取消则不建空节点。
  const handleAddNode = useCallback(
    async (type: MaterialType | 'table' | 'video_composition' | 'import_asset', position?: { x: number; y: number }) => {
      const index = nodeCreateCounter.current;
      const targetPosition = position ?? {
        x: 120 + (index % 3) * 420,
        y: 120 + Math.floor(index / 3) * 360,
      };

      if (type === 'import_asset') {
        const ticket = importGuard.capture();
        if (!importGuard.isCurrent(ticket)) return;
        const picked = await pickLocalFiles().catch(() => null);
        if (!importGuard.isCurrent(ticket)) return;
        if (!picked || !picked.ok) {
          if (picked?.body.error === 'picker-unsupported') {
            toast.warning(t('picker.needPath'));
          } else {
            toast.error(t('picker.pickFailed'));
          }
          return;
        }
        const paths = picked.body.paths ?? [];
        if (paths.length === 0) return;
        const drafts = draftsFromPickedPaths(paths);
        if (drafts.length === 0) {
          toast.warning(t('picker.unsupported'));
          return;
        }
        const plan = planStandaloneImportNodes({ files: drafts, origin: targetPosition });
        if (!plan.hasWork || !plan.addNodes?.length) return;
        const applied = applyCanvasInputMutation({ addNodes: plan.addNodes });
        if (applied.status !== 'allowed') {
          toast.error(t('picker.commitFailed'));
          return;
        }
        const importedIds = new Set(plan.addNodes.map((node) => node.id));
        setNodes((current) => current.map((node) => {
          if (importedIds.has(node.id)) return node;
          return node.selected ? { ...node, selected: false } : node;
        }));
        nodeCreateCounter.current += plan.addNodes.length;
        toast.success(t('picker.importOk'));
        return;
      }

      if (type === 'table' || type === 'video_composition') {
        const created = createNode(type, targetPosition, `node_${type}_${Date.now()}`);
        if (!created) return;
        nodeCreateCounter.current += 1;
        setNodes((current) => appendWithSelectionReset(current, [{ ...created, selected: true } as never]));
        return;
      }

      const result = createMaterialNode(type as MaterialType, targetPosition);
      if (result.nodes.length === 0) return;
      const addedNodes = result.nodes.map((node) => ({ ...node, selected: true }));
      const applied = applyCanvasInputMutation({
        addNodes: addedNodes,
        nodePatches: nodes
          .filter((node) => node.selected)
          .map((node) => ({ nodeId: node.id, data: {}, node: { selected: false } })),
      });
      if (applied.status !== 'allowed') return;
      nodeCreateCounter.current += 1;
    },
    [nodes, setNodes, applyCanvasInputMutation, importGuard, t],
  );

  // 删除键：级联删除（经 mutation gateway，自动清 dangling edges）
  const handleDelete = useCallback(
    (deletedElements: { nodes: Node[]; edges: Edge[] }) => {
      const nodeIds = deletedElements.nodes.map((n) => n.id);
      const edgeIds = deletedElements.edges.map((e) => e.id);
      if (nodeIds.length === 0 && edgeIds.length === 0) return;
      applyCanvasInputMutation({ removeNodeIds: nodeIds, removeEdgeIds: edgeIds });
    },
    [applyCanvasInputMutation],
  );

  const {
    menu,
    handleNodeContextMenu,
    handlePaneContextMenu,
    handleSelectionContextMenu,
    closeMenu,
    handleMenuAction,
    handleAddNodeFromMenu,
  } = useCanvasContextMenu({
    screenToFlowPosition,
    setNodes,
    copySelectedNodes: clipboard.copySelectedNodes,
    pasteNodes: clipboard.pasteNodes,
    duplicateSelectedNodes: clipboard.duplicateSelectedNodes,
    deleteSelectedNodes: clipboard.deleteSelectedNodes,
    selectAllNodes: clipboard.selectAllNodes,
    clearSelection: clipboard.clearSelection,
    undo,
    redo,
    onExecuteNodeIds,
    onAddNode: handleAddNode,
  });

  // 项目资产按所属工作区解析相对路径；原生导入仍使用绝对路径。
  const mountImportFromAsset = useCallback(
    (asset: AssetRecord | Record<string, unknown>, position: { x: number; y: number }) => {
      const classified = classifyAssetImport(asset, workspaceId);
      if (!classified.ok) {
        toast.warning(t(classified.reason === 'unsupported' ? 'picker.unsupported' : 'picker.needPath'));
        return false;
      }
      const plan = planStandaloneImportNodes({ files: [classified.draft], origin: position });
      if (!plan.hasWork || !plan.addNodes?.length) {
        toast.warning(t('picker.unsupported'));
        return false;
      }
      const applied = applyCanvasInputMutation({ addNodes: plan.addNodes });
      if (applied.status !== 'allowed') {
        toast.error(t('picker.commitFailed'));
        return false;
      }
      const importedIds = new Set(plan.addNodes.map((node) => node.id));
      setNodes((current) => current.map((node) => {
        if (importedIds.has(node.id)) return node;
        return node.selected ? { ...node, selected: false } : node;
      }));
      nodeCreateCounter.current += plan.addNodes.length;
      const first = plan.addNodes[0];
      if (first) setSelectedElement('node', first.id);
      toast.success(t('picker.importOk'));
      return true;
    },
    [applyCanvasInputMutation, setNodes, setSelectedElement, t, workspaceId],
  );

  const handleInsertAsset = useCallback(
    (asset: AssetRecord) => {
      const count = nodeCreateCounter.current;
      const position = {
        x: 200 + (count % 4) * 50,
        y: 200 + (count % 4) * 40,
      };
      mountImportFromAsset(asset, position);
    },
    [mountImportFromAsset],
  );

  // 键盘快捷键全集
  useKeyboardShortcuts({
    onCopy: clipboard.copySelectedNodes,
    onPaste: () => clipboard.pasteNodes(),
    onSelectAll: clipboard.selectAllNodes,
    onDeleteSelected: clipboard.deleteSelectedNodes,
    onClearSelection: clipboard.clearSelection,
    onDuplicate: clipboard.duplicateSelectedNodes,
    onGroupSelected: handleGroupSelected,
    onUngroupSelected: () => {
      const selectedGroup = nodes.find((n) => n.selected && n.type === 'group');
      if (selectedGroup) {
        ungroup(selectedGroup.id);
        toast.success(t('group.toast.ungrouped'));
      }
    },
    onUndo: undo,
    onRedo: redo,
    hasSelection,
    onToggleAssets: () => setIsAssetsOpen((prev) => !prev),
    onToggleShortcuts: () => setIsShortcutsOpen((prev) => !prev),
    onToggleMinimap: () => setIsMinimapOpen((prev) => !prev),
    onToggleAddMenu: () => setIsAddMenuOpen((prev) => !prev),
    onSetPointerMode: (mode) => setPointerMode(mode),
    onFitView: () => fitView(FIT_VIEW_OPTIONS),
    onResetZoom: () => zoomTo(1),
    onCategoryKey: (catIdx) => {
      setIsAssetsOpen(true);
      setAssetsCategoryIndex(catIdx);
    },
  });

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedElement('node', node.id);
    },
    [setSelectedElement],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedElement('none', null);
    closeMenu();
  }, [setSelectedElement, closeMenu]);

  // 整理对齐节点
  const handleAlignGrid = useCallback(() => {
    setNodes((current) =>
      current.map((node, i) => ({
        ...node,
        position: {
          x: 120 + (i % 3) * 440,
          y: 120 + Math.floor(i / 3) * 360,
        },
      })),
    );
  }, [setNodes]);

  // 资产从抽屉拖拽释放到画布 (Drag-to-Mount)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      try {
        const raw = e.dataTransfer.getData('application/json');
        if (!raw) return;
        const payload = JSON.parse(raw);
        if (payload?.type === 'omnimux-canvas-node' && typeof payload.nodeId === 'string') {
          applyFocusCanvasNode({
            nodes,
            nodeId: payload.nodeId,
            setCenter,
            setNodes,
          });
          return;
        }
        if (payload?.type === 'omnimux-asset' && payload.asset) {
          const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          mountImportFromAsset(payload.asset, pos);
        }
      } catch (err) {
        console.error('Failed to parse dropped asset', err);
      }
    },
    [screenToFlowPosition, mountImportFromAsset, nodes, setCenter, setNodes],
  );

  return (
    <div className="wf-canvas-editor" style={{ position: 'relative', height: '100%' }}>
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneContextMenu={handlePaneContextMenu}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onSelectionContextMenu={handleSelectionContextMenu}
        onDelete={handleDelete}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        defaultViewport={DEFAULT_VIEWPORT}
        minZoom={CANVAS_ZOOM_CONFIG.minZoom}
        maxZoom={CANVAS_ZOOM_CONFIG.maxZoom}
        selectionKeyCode={null}
        multiSelectionKeyCode="Meta"
        panOnDrag={pointerMode === 'pan' ? true : PAN_ON_DRAG}
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnScroll
        zoomOnPinch
        selectionOnDrag={pointerMode === 'select'}
        selectionMode={SelectionMode.Partial}
        defaultEdgeOptions={DEFAULT_CANVAS_EDGE_OPTIONS}
        connectOnClick={false}
        connectionRadius={CONNECTION_RADIUS}
        // M5 perf baseline: viewport culling for the 200+ node scenario.
        // Off-screen nodes unmount — node state lives in canvasStore, so a
        // scrolled-away node restores fully when it re-enters the viewport.
        onlyRenderVisibleElements
      >
        <Background color="var(--wb-grid-dot, #C9CBD6)" gap={48} size={3.5} variant={BackgroundVariant.Dots} />
      </ReactFlow>

      {/* 顶部左侧创作页切换与管理胶囊 */}
      <CanvasPageHeader
        workspaceId={workspaceId ?? null}
        onSwitchWorkspaceId={onSwitchWorkspaceId}
      />

      {/* 顶部右侧控制栏胶囊 */}
      <HeaderControls
        isMinimapOpen={isMinimapOpen}
        onToggleMinimap={() => setIsMinimapOpen((prev) => !prev)}
        onAlignGrid={handleAlignGrid}
        onStartExecution={onStartExecution}
        onPauseExecution={onPauseExecution}
        onResumeExecution={onResumeExecution}
        onCancelExecution={onCancelExecution}
        onResetExecution={onResetExecution}
        onOpenPublish={() => setIsPublishModalOpen(true)}
      />

      {/* 浮动小地图 Popover */}
      {isMinimapOpen && (
        <div className="wf-minimap-popover nodrag nopan">
          <MiniMap pannable zoomable />
        </div>
      )}

      {/* 底部悬浮控制坞 */}
      <Toolbar
        onAddNode={handleAddNode}
        pointerMode={pointerMode}
        onPointerModeChange={setPointerMode}
        onOpenAssets={() => setIsAssetsOpen((prev) => !prev)}
        onOpenHelp={() => setIsShortcutsOpen((prev) => !prev)}
        isAssetsOpen={isAssetsOpen}
        isAddMenuOpen={isAddMenuOpen}
        onToggleAddMenu={() => setIsAddMenuOpen((prev) => !prev)}
        templates={workflowTemplates}
        onInsertTemplate={(id) => { void handleInsertTemplate(id); }}
      />

      {/* 项目资产抽屉 (带防护隔离，保证画布永远不黑屏) */}
      {isAssetsOpen && (
        <DrawerErrorBoundary onClose={() => setIsAssetsOpen(false)}>
          <AssetsDrawer
            isOpen={isAssetsOpen}
            onClose={() => setIsAssetsOpen(false)}
            onInsertAsset={handleInsertAsset}
            workspaceId={workspaceId}
            nodes={flowNodes}
            onFocusNode={(nodeId) => {
              applyFocusCanvasNode({
                nodes: flowNodes,
                nodeId,
                setCenter,
                setNodes,
              });
            }}
          />
        </DrawerErrorBoundary>
      )}

      {/* 快捷键帮助浮窗 */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* 发布为 AI 应用向导弹窗 */}
      <PublishWizardModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        nodes={nodes}
        edges={edges}
        catalog={catalog}
        workspaceId={workspaceId}
      />

      {/* 多选浮动工具栏 */}
      <FloatingSelectionToolbar
        visible={selectedRegularNodes.length >= 2}
        selectedCount={selectedRegularNodes.length}
        position={multiSelectToolbarPosition}
        onGroup={handleGroupSelected}
        onCreateAsset={() => {
          window.dispatchEvent(
            new CustomEvent('omnimux:workflow:batch-create-asset', {
              detail: { nodeIds: selectedRegularNodes.map((n) => n.id) },
            }),
          );
        }}
        onLayout={(type) => handleAlignLayout(type)}
      />

      <ContextMenu
        x={menu.x}
        y={menu.y}
        visible={menu.visible}
        context={menu.context}
        onClose={closeMenu}
        onAction={handleMenuAction}
        onAddNode={handleAddNodeFromMenu}
        canUndo={canUndo}
        canRedo={canRedo}
        hasClipboard={clipboard.hasClipboard}
        hasSelection={hasSelection}
      />

      <CanvasNodeActionMenu
        visible={connectionMenuState.visible}
        x={connectionMenuState.x}
        y={connectionMenuState.y}
        title={connectionMenuTitle}
        options={connectionMenuState.options}
        onSelect={handleConnectionMenuSelect}
        onClose={handleConnectionMenuClose}
      />

      {/* 全屏独立电子表格舞台 */}
      <SpreadsheetStage />

      {/* 全屏独立文本/剧本编辑器舞台 */}
      <TextStage />

      {/* 批量保存资产弹窗 */}
      <BatchCreateAssetModal
        isOpen={batchAssetModalOpen}
        onClose={() => setBatchAssetModalOpen(false)}
        items={batchAssetItems}
      />

      {/* 创建可复用工作流弹窗 */}
      <CreateWorkflowModal
        isOpen={createWorkflowModalOpen}
        onClose={() => {
          setCreateWorkflowModalOpen(false);
          setTargetGroupForWorkflow(null);
        }}
        groupId={targetGroupForWorkflow?.id}
        defaultTitle={targetGroupForWorkflow?.title}
        nodeCount={targetGroupForWorkflow?.nodeCount}
        onConfirm={async (payload) => {
          const groupId = targetGroupForWorkflow?.id;
          if (!groupId) throw new Error(t('template.missingGroup'));
          const childIds = new Set(childIdsOfGroup(nodes, groupId));
          const childNodes = nodes.filter((n) => childIds.has(n.id));
          const childEdges = edges.filter((edge) => childIds.has(edge.source) && childIds.has(edge.target));
          const result = await createTemplate({
            name: payload.name,
            description: payload.description,
            tags: payload.tags,
            nodes: sanitizeNodes(childNodes),
            edges: sanitizeEdges(childEdges),
          });
          if (!result.ok || !result.body.template) {
            throw new Error(result.body.message || result.body.error || t('template.modal.failed'));
          }
          await refreshWorkflowTemplates();
        }}
      />

      {/* 画板级通知宿主（T05：Toast / Banner 自动淡出，替代节点内静态错误条） */}
      <CanvasNoticeHost />
    </div>
  );
};

const CanvasEditor: React.FC<CanvasEditorProps> = (props) => {
  return (
    <ReactFlowProvider>
      <CanvasEditorContent {...props} />
    </ReactFlowProvider>
  );
};

export default CanvasEditor;
