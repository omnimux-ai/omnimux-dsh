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
} from '../../utils/resourcePickerPolicy.ts';
import CanvasResourcePane from './CanvasResourcePane';
import LocalUploadPane from './LocalUploadPane';

export interface ResourcePickerModalProps {
  open: boolean;
  nodeId: string;
  initialTab?: ResourcePickerTab;
  onCancel: () => void;
  onCommit: (payload: {
    selectedCanvasNodeIds: string[];
    localFiles: LocalFileDraft[];
  }) => boolean;
}

const ResourcePickerModal: React.FC<ResourcePickerModalProps> = ({
  open,
  nodeId,
  initialTab = 'canvas',
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

  const handleToggle = useCallback((id: string, alreadyConnected: boolean) => {
    if (alreadyConnected) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const handleAddFiles = useCallback((incoming: LocalFileDraft[]) => {
    setLocalFiles((prev) => [...prev, ...incoming]);
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    setLocalFiles((prev) => prev.filter((file) => file.id !== id));
  }, []);

  const usableCanvasCount = selectedIds.filter((id) => {
    const item = canvasItems.find((entry) => entry.nodeId === id);
    return item && !item.alreadyConnected;
  }).length;
  const selectedCount = usableCanvasCount + localFiles.length;

  const handleUse = useCallback(() => {
    if (selectedCount === 0) return;
    const ok = onCommit({
      selectedCanvasNodeIds: selectedIds,
      localFiles,
    });
    if (ok) {
      setLocalFiles([]);
      setSelectedIds([]);
    }
  }, [localFiles, onCommit, selectedCount, selectedIds]);

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
        {t('picker.use')} {selectedCount} {t('picker.items')}
      </button>
    </div>
  );

  return (
    <CustomModal
      open={open}
      onCancel={handleCancel}
      title={t('picker.title')}
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
          onToggle={handleToggle}
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
