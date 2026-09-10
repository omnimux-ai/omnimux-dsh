/**
 * 选择资源弹窗：CustomModal + 画布资源 / 本地导入双 Tab。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CustomModal } from '../../../ui';
import { useT } from '../../../i18n';
import { useCanvasStore } from '../../../store/canvasStore';
import {
  listCanvasResources,
  type LocalFileDraft,
  type ResourcePickerTab,
  type ResourcePickerMode,
} from '../../utils/resourcePickerPolicy.ts';
import type { ResourcePickerSlotTarget } from '../../hooks/useResourcePicker.ts';
import type { NodeSlotEngineState } from '../../../../shared/graph/slotContractTypes.ts';
import CanvasResourcePane from './CanvasResourcePane';
import LocalUploadPane from './LocalUploadPane';

export interface ResourcePickerModalProps {
  open: boolean;
  nodeId: string;
  title?: string;
  initialTab?: ResourcePickerTab;
  /** T03：卡槽装填会话——预过滤素材类型、允许选中已连入供给、提交时 pinned 进 slot。 */
  slotTarget?: ResourcePickerSlotTarget | null;
  mode?: ResourcePickerMode;
  targetSlotIndex?: number;
  slotState?: NodeSlotEngineState;
  onCancel: () => void;
  onCommit: (payload: {
    selectedCanvasNodeIds: string[];
    localFiles: LocalFileDraft[];
    mode?: ResourcePickerMode;
    targetSlotIndex?: number;
  }) => boolean;
}

const ResourcePickerModal: React.FC<ResourcePickerModalProps> = ({
  open,
  nodeId,
  initialTab = 'canvas',
  slotTarget = null,
  mode = 'add',
  targetSlotIndex,
  slotState,
  onCancel,
  onCommit,
}) => {
  const t = useT();
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);

  const [tab, setTab] = useState<ResourcePickerTab>(initialTab);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [localFiles, setLocalFiles] = useState<LocalFileDraft[]>([]);

  const canvasItems = useMemo(
    () => listCanvasResources(nodes, edges, nodeId),
    [nodes, edges, nodeId],
  );

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setSelectedIds([]);
    setLocalFiles([]);
  }, [open, initialTab]);

  const handleCancel = useCallback(() => {
    setLocalFiles([]);
    onCancel();
  }, [onCancel]);

  const handleToggle = useCallback(
    (id: string, alreadyConnected: boolean, disabled?: boolean) => {
      if (disabled) return;
      if (mode === 'replace') {
        setSelectedIds((prev) => (prev.includes(id) ? [] : [id]));
        setLocalFiles([]);
        return;
      }
      if (alreadyConnected && !slotTarget) return;
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    },
    [mode, slotTarget],
  );

  const handleAddFiles = useCallback(
    (incoming: LocalFileDraft[]) => {
      if (mode === 'replace') {
        if (incoming.length > 0) {
          setLocalFiles([incoming[incoming.length - 1]!]);
          setSelectedIds([]);
        }
        return;
      }
      setLocalFiles((prev) => [...prev, ...incoming]);
    },
    [mode],
  );

  const handleRemoveFile = useCallback((id: string) => {
    setLocalFiles((prev) => prev.filter((file) => file.id !== id));
  }, []);

  const usableCanvasCount = selectedIds.filter((id) => {
    const item = canvasItems.find((entry) => entry.nodeId === id);
    if (mode === 'replace') return Boolean(item);
    return item && (!item.alreadyConnected || Boolean(slotTarget));
  }).length;
  const selectedCount = usableCanvasCount + localFiles.length;

  const handleUse = useCallback(() => {
    if (selectedCount === 0) return;
    const ok = onCommit({
      selectedCanvasNodeIds: selectedIds,
      localFiles,
      mode,
      targetSlotIndex,
    });
    if (ok) {
      setLocalFiles([]);
      setSelectedIds([]);
    }
  }, [localFiles, mode, onCommit, selectedCount, selectedIds, targetSlotIndex]);

  const useButtonLabel =
    mode === 'replace'
      ? t('picker.replace') || '替换素材'
      : `${t('picker.use')} ${selectedCount} ${t('picker.items')}`;

  const footer = (
    <div className="wf-picker-footer">
      <button type="button" className="wf-picker-btn wf-picker-btn--ghost" onClick={handleCancel}>
        {t('picker.cancel')}
      </button>
      <button
        type="button"
        className="wf-picker-btn wf-picker-btn--primary"
        disabled={selectedCount === 0}
        onClick={handleUse}
      >
        {useButtonLabel}
      </button>
    </div>
  );

  const modalTitle =
    title ||
    (mode === 'replace'
      ? t('picker.replaceTitle') || '替换素材'
      : t('picker.title'));

  return (
    <CustomModal
      open={open}
      onCancel={handleCancel}
      title={modalTitle}
      width={720}
      className="wf-picker-modal"
      bodyClassName="wf-picker-modal__body"
      footer={footer}
    >
      <div className="wf-picker-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'canvas'}
          className={`wf-picker-tab ${tab === 'canvas' ? 'wf-picker-tab--active' : ''}`}
          onClick={() => setTab('canvas')}
        >
          {t('picker.tab.canvas')} ({canvasItems.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'local'}
          className={`wf-picker-tab ${tab === 'local' ? 'wf-picker-tab--active' : ''}`}
          onClick={() => setTab('local')}
        >
          {t('picker.tab.local')}
        </button>
      </div>

      {tab === 'canvas' ? (
        <CanvasResourcePane
          items={canvasItems}
          selectedIds={selectedIds}
          mode={mode}
          targetSlotIndex={targetSlotIndex}
          slotState={slotState}
          onToggle={handleToggle}
          acceptedTypes={slotTarget?.acceptedTypes}
          allowConnectedSelection={Boolean(slotTarget)}
        />
      ) : (
        <LocalUploadPane
          active={open}
          files={localFiles}
          onAddFiles={handleAddFiles}
          onRemove={handleRemoveFile}
        />
      )}
    </CustomModal>
  );
};

export default ResourcePickerModal;
