/**
 * W3 (T3.4): connection release menu — ported from Gxgen
 * `apps/web/src/pages/CanvasEditor/hooks/useConnectionMenu.ts` (205 lines),
 * fused with the plugin's existing rejection-toast logic (plan pit #7:
 * the menu branch lives only in the blank-drop path).
 *
 * - onConnectStart records the source node (source handle drags only)
 * - onConnectEnd resolves three branches via useConnectionMenu.logic:
 *   isValid → nothing (onConnect handles it); dropped on a node but
 *   rejected → keep message.warning + rejected toast; blank drop with
 *   derivable output options → portal menu at the release point
 * - onMenuSelect → createMaterialNode + applyCanvasInputMutation
 *   ({ addNodes, addEdges }) so the undo/redo chain stays intact
 *
 * Options derive from the plugin connection matrix
 * (getOutputOptionSpecs over MATERIAL_OUTPUT_OPTIONS); label/desc are
 * resolved through the island i18n dictionary.
 */

import { useCallback, useRef, useState } from 'react';
import { useReactFlow, type OnConnectEnd, type OnConnectStart } from '@xyflow/react';
import { useCanvasStore } from '../../store/canvasStore';
import { useT } from '../../i18n';
import { toast } from '../../ui';
import type { MaterialType } from '../../types/materialNode';
import { validateConnectionDetailed, rejectReasonKey } from '../utils/connectionValidator';
import { createMaterialNode } from '../utils/nodeFactory';
import { getOutputOptionSpecs, parseOutputOptionKey } from '../utils/connectionMenuOptions';
import type { CanvasNodeActionMenuOption } from '../components/CanvasNodeActionMenu';
import { resolveConnectionEndOutcome } from './useConnectionMenu.logic';

export interface ConnectionMenuState {
  visible: boolean;
  x: number;
  y: number;
  options: CanvasNodeActionMenuOption[];
}

interface ConnectionStartInfo {
  nodeId: string;
  materialType: MaterialType;
}

const INITIAL_MENU_STATE: ConnectionMenuState = {
  visible: false,
  x: 0,
  y: 0,
  options: [],
};

export function useConnectionMenu(options?: {
  /** 拒绝提示旁路（T05：CanvasEditor 的画板级 structure_reject 通知）。 */
  onReject?: (reason: string) => void;
}) {
  const t = useT();
  const { screenToFlowPosition } = useReactFlow();
  const applyCanvasInputMutation = useCanvasStore((state) => state.applyCanvasInputMutation);
  const onRejectRef = useRef(options?.onReject);
  onRejectRef.current = options?.onReject;

  const [menuState, setMenuState] = useState<ConnectionMenuState>(INITIAL_MENU_STATE);
  const connectionStartRef = useRef<ConnectionStartInfo | null>(null);
  const dropPositionRef = useRef<{ x: number; y: number } | null>(null);

  const onConnectStart: OnConnectStart = useCallback((_event, params) => {
    if (!params.nodeId || params.handleType !== 'source') {
      connectionStartRef.current = null;
      return;
    }
    const node = useCanvasStore.getState().nodes.find((n) => n.id === params.nodeId);
    const materialType = node?.data?.materialType as MaterialType | undefined;
    if (!node || !materialType) {
      connectionStartRef.current = null;
      return;
    }
    connectionStartRef.current = { nodeId: params.nodeId, materialType };
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      const fromId = connectionState.fromNode?.id ?? null;
      const toId = connectionState.toNode?.id ?? null;
      const start = connectionStartRef.current;
      const specs = start ? getOutputOptionSpecs(start.materialType) : [];

      // 落在已有节点上时被拒：还原现有 validateConnectionDetailed 提示链
      let rejectReason: string | null = null;
      if (!connectionState.isValid && fromId && toId) {
        const state = useCanvasStore.getState();
        const detail = validateConnectionDetailed(
          { source: fromId, target: toId, sourceHandle: null, targetHandle: null },
          state.nodes,
          state.edges,
          state.catalogRuntime,
        );
        rejectReason = !detail.valid ? t(rejectReasonKey(detail.reasonCode)) : null;
      }

      const outcome = resolveConnectionEndOutcome({
        isValid: connectionState.isValid ?? null,
        fromNodeId: fromId,
        toNodeId: toId,
        startedFromSource: !!start,
        hasOptions: specs.length > 0,
        rejectReason,
      });

      if (outcome.type === 'reject') {
        onRejectRef.current?.(outcome.reason);
        toast.warning(outcome.reason);
        connectionStartRef.current = null;
        return;
      }

      if (outcome.type === 'menu' && start) {
        const releasePoint = 'changedTouches' in event ? event.changedTouches[0] : event;
        if (!releasePoint) {
          connectionStartRef.current = null;
          return;
        }
        const { clientX, clientY } = releasePoint;
        dropPositionRef.current = screenToFlowPosition({ x: clientX, y: clientY });
        setMenuState({
          visible: true,
          x: clientX,
          y: clientY,
          options: specs.map((spec) => ({
            key: spec.key,
            label: t(spec.labelKey),
            description: t(spec.descKey),
            icon: spec.icon,
          })),
        });
        // connectionStartRef 保留到 onMenuSelect / onMenuClose 清理
        return;
      }

      connectionStartRef.current = null;
    },
    [screenToFlowPosition, t],
  );

  const onMenuSelect = useCallback(
    (key: string) => {
      const start = connectionStartRef.current;
      const position = dropPositionRef.current;
      const parsed = parseOutputOptionKey(key);
      if (start && position && parsed) {
        const result = createMaterialNode(parsed.targetMaterialType, position);
        const newNode = result.nodes[0];
        if (newNode) {
          applyCanvasInputMutation({
            addNodes: result.nodes,
            addEdges: [
              {
                source: start.nodeId,
                sourceHandle: 'out',
                target: newNode.id,
                targetHandle: 'in',
              },
            ],
          });
        }
      }
      setMenuState((prev) => ({ ...prev, visible: false }));
      connectionStartRef.current = null;
      dropPositionRef.current = null;
    },
    [applyCanvasInputMutation],
  );

  const onMenuClose = useCallback(() => {
    setMenuState((prev) => ({ ...prev, visible: false }));
    connectionStartRef.current = null;
    dropPositionRef.current = null;
  }, []);

  return { menuState, onConnectStart, onConnectEnd, onMenuSelect, onMenuClose };
}
