/**
 * Context-menu state + action dispatch for CanvasEditor.
 * Refactored to enforce target-centric affinity:
 * - Right-click on node: selects that node exclusively (or preserves multi-selection if part of it) and opens node/selection menu.
 * - Right-click on pane (canvas background): clears selection atomically and opens pane menu.
 * - Right-click on selection box: opens multi-selection menu.
 */
import { useCallback, useState } from 'react';
import type { Node } from '@xyflow/react';
import { useCanvasStore } from '../../store/canvasStore';
import type { ContextMenuAction, ContextMenuContext } from '../components/ContextMenu';
import type { CanvasAddNodeType } from '../components/addNodePalette';

export interface MenuState {
  x: number;
  y: number;
  visible: boolean;
  context: ContextMenuContext;
}

export interface CanvasContextMenuDeps {
  screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number };
  setNodes: (updater: (current: ReturnType<typeof useCanvasStore.getState>['nodes']) => ReturnType<typeof useCanvasStore.getState>['nodes']) => void;
  copySelectedNodes: () => void;
  pasteNodes: (targetPosition?: { x: number; y: number }) => void;
  duplicateSelectedNodes: () => void;
  deleteSelectedNodes: () => void;
  selectAllNodes: () => void;
  clearSelection: () => void;
  undo: () => void;
  redo: () => void;
  onExecuteNodeIds?: (nodeIds: string[]) => void;
  onAddNode?: (type: CanvasAddNodeType, position?: { x: number; y: number }) => void;
  onCreateWorkflow?: (position: { x: number; y: number }) => void;
  setSelectedElement?: (type: 'none' | 'node', id: string | null) => void;
}

export function useCanvasContextMenu(deps: CanvasContextMenuDeps) {
  const {
    screenToFlowPosition,
    setNodes,
    copySelectedNodes,
    pasteNodes,
    duplicateSelectedNodes,
    deleteSelectedNodes,
    selectAllNodes,
    clearSelection,
    undo,
    redo,
    onExecuteNodeIds,
    onAddNode,
    onCreateWorkflow,
    setSelectedElement,
  } = deps;

  const [menu, setMenu] = useState<MenuState>({
    x: 0,
    y: 0,
    visible: false,
    context: { type: 'pane' },
  });

  const closeMenu = useCallback(() => {
    setMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  /**
   * 右键点击单个节点卡片：
   * 1. 若当前节点已属于多选集合中的一员，则维持多选上下文并打开批量菜单；
   * 2. 否则，原子化将焦点转移并锁定为该节点（成为唯一选中节点），打开该节点的专属菜单。
   */
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      const state = useCanvasStore.getState();
      const selectedNodes = state.nodes.filter((n) => n.selected);
      const isAlreadySelected = selectedNodes.some((n) => n.id === node.id);

      if (isAlreadySelected && selectedNodes.length > 1) {
        setMenu({
          visible: true,
          x: event.clientX,
          y: event.clientY,
          context: { type: 'selection' },
        });
        return;
      }

      // 切换为唯一选中该节点
      if (!isAlreadySelected || selectedNodes.length !== 1) {
        setNodes((current) =>
          current.map((n) => ({
            ...n,
            selected: n.id === node.id,
          })),
        );
        setSelectedElement?.('node', node.id);
      }

      setMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        context: { type: 'node', nodeId: node.id },
      });
    },
    [setNodes, setSelectedElement],
  );

  /**
   * 右键点击画布空白背景：
   * 原子化取消所有选中的节点与元素，唤起纯净的画布背景菜单。
   */
  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      clearSelection();
      setMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        context: { type: 'pane' },
      });
    },
    [clearSelection],
  );

  /**
   * 右键点击框选区（多选集合）：
   * 保持当前多选态，唤起批量操作菜单。
   */
  const handleSelectionContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        context: { type: 'selection' },
      });
    },
    [],
  );

  const handleMenuAction = useCallback(
    (action: ContextMenuAction, context: ContextMenuContext) => {
      const flowPosition = screenToFlowPosition({ x: menu.x, y: menu.y });
      switch (action) {
        case 'import-asset':
          void onAddNode?.('import_asset', flowPosition);
          break;
        case 'copy': {
          if (context.type === 'node') {
            const state = useCanvasStore.getState();
            const target = state.nodes.find((node) => node.id === context.nodeId);
            if (target && !target.selected) {
              clearSelection();
              setNodes((current) =>
                current.map((node) =>
                  node.id === context.nodeId ? { ...node, selected: true } : node,
                ),
              );
            }
          }
          copySelectedNodes();
          break;
        }
        case 'paste':
          pasteNodes(flowPosition);
          break;
        case 'duplicate':
          duplicateSelectedNodes();
          break;
        case 'delete': {
          if (context.type === 'node') {
            const state = useCanvasStore.getState();
            const target = state.nodes.find((node) => node.id === context.nodeId);
            if (target?.selected) {
              deleteSelectedNodes();
            } else {
              state.applyCanvasInputMutation({ removeNodeIds: [context.nodeId] });
            }
          } else {
            deleteSelectedNodes();
          }
          break;
        }
        case 'undo':
          undo();
          break;
        case 'redo':
          redo();
          break;
        case 'select-all':
          selectAllNodes();
          break;
        case 'execute-selection': {
          const ids = useCanvasStore
            .getState()
            .nodes.filter((node) => node.selected)
            .map((node) => node.id);
          if (ids.length > 0) onExecuteNodeIds?.(ids);
          break;
        }
        case 'execute-node': {
          if (context.type === 'node') onExecuteNodeIds?.([context.nodeId]);
          break;
        }
        case 'create-workflow': {
          onCreateWorkflow?.(flowPosition);
          break;
        }
      }
      closeMenu();
    },
    [
      menu.x,
      menu.y,
      screenToFlowPosition,
      clearSelection,
      setNodes,
      copySelectedNodes,
      pasteNodes,
      duplicateSelectedNodes,
      deleteSelectedNodes,
      undo,
      redo,
      selectAllNodes,
      closeMenu,
      onExecuteNodeIds,
      onAddNode,
      onCreateWorkflow,
    ],
  );

  const handleAddNodeFromMenu = useCallback(
    (type: CanvasAddNodeType) => {
      const flowPosition = screenToFlowPosition({ x: menu.x, y: menu.y });
      onAddNode?.(type, flowPosition);
      closeMenu();
    },
    [menu.x, menu.y, screenToFlowPosition, onAddNode, closeMenu],
  );

  return {
    menu,
    handleNodeContextMenu,
    handlePaneContextMenu,
    handleSelectionContextMenu,
    closeMenu,
    handleMenuAction,
    handleAddNodeFromMenu,
  };
}
