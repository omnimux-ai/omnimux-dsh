/**
 * Context-menu state + action dispatch extracted from CanvasEditor.
 * Behavior is the original M2/M4 right-click set (add / copy / paste /
 * duplicate / delete / undo / redo / select-all / execute).
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
  } = deps;

  const [menu, setMenu] = useState<MenuState>({
    x: 0,
    y: 0,
    visible: false,
    context: { type: 'pane' },
  });

  const openContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent, node?: Node) => {
      event.preventDefault();
      let context: ContextMenuContext = { type: 'pane' };
      if (node) {
        context = { type: 'node', nodeId: node.id };
      } else {
        const selectedNodes = useCanvasStore.getState().nodes.filter((n) => n.selected);
        if (selectedNodes.length === 1 && selectedNodes[0]) {
          context = { type: 'node', nodeId: selectedNodes[0].id };
        } else if (selectedNodes.length > 1) {
          context = { type: 'selection' };
        }
      }
      setMenu({ visible: true, x: event.clientX, y: event.clientY, context });
    },
    [],
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      openContextMenu(event, node);
    },
    [openContextMenu],
  );

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      openContextMenu(event);
    },
    [openContextMenu],
  );

  const handleSelectionContextMenu = useCallback(
    (event: React.MouseEvent) => {
      openContextMenu(event);
    },
    [openContextMenu],
  );

  const closeMenu = useCallback(() => {
    setMenu((prev) => ({ ...prev, visible: false }));
  }, []);

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
