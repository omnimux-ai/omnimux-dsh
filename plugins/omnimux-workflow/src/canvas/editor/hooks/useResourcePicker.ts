/**
 * ResourcePicker 弹窗状态 + 提交。
 * 画布资源走 applyCanvasInputMutation 加边；本地文件在左侧创建导入型上游并连线。
 */

import { useCallback, useState } from 'react';
import { useAsyncInstanceGuard } from './useAsyncInstanceGuard.ts';
import { useCanvasStore } from '../../store/canvasStore';
import { toast } from '../../ui';
import { useT } from '../../i18n';
import { pickLocalFiles } from '../../bridge/apiClient.ts';
import {
  planImportNodeFill,
  planResourcePickerCommit,
  type LocalFileDraft,
  type ResourcePickerTab,
  type ResourcePickerMode,
} from '../utils/resourcePickerPolicy.ts';
import { draftsFromPickedPaths } from '../utils/localFileDraft.ts';
import { buildImportedMediaData } from '../../../shared/localMedia.ts';
import type { MaterialType } from '../../../shared/graph/materialNode.ts';
import type { NodeSlotEngineState } from '../../../shared/graph/slotContractTypes.ts';

export interface ResourcePickerSlotTarget {
  /** 目标 slot 名（内核 SlotSpec.slot）。 */
  slot: string;
  /** 该 slot 接受的素材类型。 */
  acceptedTypes: string[];
  /** 槽位上限；null 表示官方未公布上限。 */
  max: number | null;
}

export interface UseResourcePickerResult {
  open: boolean;
  initialTab: ResourcePickerTab;
  sessionId: number;
  slotTarget: ResourcePickerSlotTarget | null;
  mode: ResourcePickerMode;
  targetSlotIndex?: number;
  openPicker: (
    tab?: ResourcePickerTab,
    target?: ResourcePickerSlotTarget | null | ResourcePickerMode,
    slotIdx?: number,
  ) => void;
  closePicker: () => void;
  importLocalFiles: () => Promise<boolean>;
  fillImportNode: () => Promise<boolean>;
  relinkLocalFile: (materialType: MaterialType) => Promise<boolean>;
  commit: (payload: {
    selectedCanvasNodeIds: string[];
    localFiles: LocalFileDraft[];
    mode?: ResourcePickerMode;
    targetSlotIndex?: number;
  }) => boolean;
}

export function useResourcePicker(nodeId: string, workspaceId?: string | null): UseResourcePickerResult {
  const [sessionId, setSessionId] = useState(0);
  const guard = useAsyncInstanceGuard(JSON.stringify([workspaceId, nodeId, sessionId]));
  const t = useT();
  const [open, setOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<ResourcePickerTab>('canvas');
  const [slotTarget, setSlotTarget] = useState<ResourcePickerSlotTarget | null>(null);
  const [mode, setMode] = useState<ResourcePickerMode>('add');
  const [targetSlotIndex, setTargetSlotIndex] = useState<number | undefined>(undefined);

  const openPicker = useCallback(
    (
      tab: ResourcePickerTab = 'canvas',
      target: ResourcePickerSlotTarget | null | ResourcePickerMode = null,
      slotIdx?: number,
    ) => {
      guard.deactivate();
      setSessionId((id) => id + 1);
      setInitialTab(tab);
      if (typeof target === 'string') {
        setMode(target as ResourcePickerMode);
        setSlotTarget(null);
        setTargetSlotIndex(slotIdx);
      } else {
        setMode('add');
        setSlotTarget(target);
        setTargetSlotIndex(slotIdx);
      }
      setOpen(true);
    },
    [guard],
  );

  const closePicker = useCallback(() => {
    guard.deactivate();
    setSessionId((id) => id + 1);
    setSlotTarget(null);
    setOpen(false);
    setMode('add');
    setTargetSlotIndex(undefined);
  }, [guard]);

  const commit = useCallback(
    (payload: {
      selectedCanvasNodeIds: string[];
      localFiles: LocalFileDraft[];
      mode?: ResourcePickerMode;
      targetSlotIndex?: number;
    }) => {
      if (!guard.isCurrent(guard.capture())) return false;
      const state = useCanvasStore.getState();
      const commitMode = payload.mode ?? mode;
      const commitSlotIndex = payload.targetSlotIndex ?? targetSlotIndex;
      const targetNode = state.nodes.find((n) => n.id === nodeId);
      const slotState = targetNode?.data?.slotState as NodeSlotEngineState | undefined;

      const plan = planResourcePickerCommit({
        nodes: state.nodes,
        edges: state.edges,
        targetNodeId: nodeId,
        selectedCanvasNodeIds: payload.selectedCanvasNodeIds,
        localFiles: payload.localFiles,
        ...(slotTarget ? {
          targetSlot: slotTarget.slot,
          acceptedTypes: slotTarget.acceptedTypes,
          slotMax: slotTarget.max,
        } : {}),
        mode: commitMode,
        targetSlotIndex: commitSlotIndex,
        slotState,
      });

      if (!plan.hasWork) {
        toast.warning(t('picker.commitEmpty'));
        return false;
      }

      const result = state.applyCanvasInputMutation({
        addNodes: plan.addNodes,
        addEdges: plan.addEdges,
        nodePatches: plan.nodePatches,
      });

      if (result.status !== 'allowed') {
        toast.error(t('picker.commitFailed'));
        return false;
      }

      if (plan.rejected.length > 0) {
        toast.warning(t('picker.commitPartial'));
      } else {
        toast.success(t('picker.commitOk'));
      }
      closePicker();
      return true;
    },
    [closePicker, guard, mode, nodeId, slotTarget, t, targetSlotIndex],
  );

  const fillImportNode = useCallback(async () => {
    const ticket = guard.capture();
    if (!guard.isCurrent(ticket)) return false;
    const result = await pickLocalFiles().catch(() => null);
    if (!guard.isCurrent(ticket)) return false;
    if (!result || !result.ok) {
      if (result?.body.error === 'picker-unsupported') {
        toast.warning(t('picker.needPath'));
      } else {
        toast.error(t('picker.pickFailed'));
      }
      return false;
    }
    const paths = result.body.paths ?? [];
    if (paths.length === 0) return false;
    const drafts = draftsFromPickedPaths(paths);
    if (drafts.length === 0) {
      toast.warning(t('picker.unsupported'));
      return false;
    }
    const state = useCanvasStore.getState();
    const plan = planImportNodeFill({
      nodes: state.nodes,
      targetNodeId: nodeId,
      files: drafts,
    });
    if (!plan.hasWork) {
      toast.warning(t('picker.unsupported'));
      return false;
    }
    const applied = state.applyCanvasInputMutation({
      addNodes: plan.addNodes,
      nodePatches: plan.nodePatches,
    });
    if (applied.status !== 'allowed') {
      toast.error(t('picker.commitFailed'));
      return false;
    }
    toast.success(t('picker.importOk'));
    return true;
  }, [guard, nodeId, t]);

  const importLocalFiles = useCallback(async () => {
    const ticket = guard.capture();
    if (!guard.isCurrent(ticket)) return false;
    const result = await pickLocalFiles().catch(() => null);
    if (!guard.isCurrent(ticket)) return false;
    if (!result || !result.ok) {
      if (result?.body.error === 'picker-unsupported') {
        toast.warning(t('picker.needPath'));
      } else {
        toast.error(t('picker.pickFailed'));
      }
      return false;
    }
    const paths = result.body.paths ?? [];
    if (paths.length === 0) return false;
    const drafts = draftsFromPickedPaths(paths);
    if (drafts.length === 0) {
      toast.warning(t('picker.unsupported'));
      return false;
    }
    return commit({ selectedCanvasNodeIds: [], localFiles: drafts });
  }, [commit, guard, t]);

  const relinkLocalFile = useCallback(async (materialType: MaterialType) => {
    const ticket = guard.capture();
    if (!guard.isCurrent(ticket)) return false;
    const result = await pickLocalFiles().catch(() => null);
    if (!guard.isCurrent(ticket)) return false;
    if (!result || !result.ok) {
      toast.error(t('picker.pickFailed'));
      return false;
    }
    const path = result.body.path;
    if (!path) return false;
    const drafts = draftsFromPickedPaths([path]);
    const draft = drafts[0];
    if (!draft || draft.materialType !== materialType) {
      toast.warning(t('picker.unsupported'));
      return false;
    }
    const patch = buildImportedMediaData({
      realPath: draft.realPath,
      name: draft.name,
      materialType: draft.materialType,
      mime: draft.mime,
      size: draft.size,
    });
    const applied = useCanvasStore.getState().applyCanvasInputMutation({
      nodePatches: [{ nodeId, data: patch }],
    });
    if (applied.status !== 'allowed') {
      toast.error(t('picker.commitFailed'));
      return false;
    }
    toast.success(t('node.relinkOk'));
    return true;
  }, [guard, nodeId, t]);

  return {
    open,
    initialTab,
    sessionId,
    slotTarget,
    mode,
    targetSlotIndex,
    openPicker,
    closePicker,
    importLocalFiles,
    fillImportNode,
    relinkLocalFile,
    commit,
  };
}
