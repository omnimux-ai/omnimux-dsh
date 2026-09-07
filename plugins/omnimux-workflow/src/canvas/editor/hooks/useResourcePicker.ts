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
} from '../utils/resourcePickerPolicy.ts';
import { draftsFromPickedPaths } from '../utils/localFileDraft.ts';
import { buildImportedMediaData } from '../../../shared/localMedia.ts';
import type { MaterialType } from '../../../shared/graph/materialNode.ts';

export interface UseResourcePickerResult {
  open: boolean;
  initialTab: ResourcePickerTab;
  sessionId: number;
  openPicker: (tab?: ResourcePickerTab) => void;
  closePicker: () => void;
  importLocalFiles: () => Promise<boolean>;
  fillImportNode: () => Promise<boolean>;
  relinkLocalFile: (materialType: MaterialType) => Promise<boolean>;
  commit: (payload: {
    selectedCanvasNodeIds: string[];
    localFiles: LocalFileDraft[];
  }) => boolean;
}

export function useResourcePicker(nodeId: string, workspaceId?: string | null): UseResourcePickerResult {
  const [sessionId, setSessionId] = useState(0);
  const guard = useAsyncInstanceGuard(JSON.stringify([workspaceId, nodeId, sessionId]));
  const t = useT();
  const [open, setOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<ResourcePickerTab>('canvas');

  const openPicker = useCallback((tab: ResourcePickerTab = 'canvas') => {
    guard.deactivate();
    setSessionId((id) => id + 1);
    setInitialTab(tab);
    setOpen(true);
  }, [guard]);

  const closePicker = useCallback(() => {
    guard.deactivate();
    setSessionId((id) => id + 1);
    setOpen(false);
  }, [guard]);

  const commit = useCallback(
    (payload: { selectedCanvasNodeIds: string[]; localFiles: LocalFileDraft[] }) => {
      if (!guard.isCurrent(guard.capture())) return false;
      const state = useCanvasStore.getState();
      const plan = planResourcePickerCommit({
        nodes: state.nodes,
        edges: state.edges,
        targetNodeId: nodeId,
        selectedCanvasNodeIds: payload.selectedCanvasNodeIds,
        localFiles: payload.localFiles,
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
    [closePicker, guard, nodeId, t],
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
    openPicker,
    closePicker,
    importLocalFiles,
    fillImportNode,
    relinkLocalFile,
    commit,
  };
}
