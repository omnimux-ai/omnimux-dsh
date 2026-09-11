/**
 * MediaCardBody — 多模态媒体卡片主体（图片/视频/音频）渲染组件
 */

import React from 'react';
import type { MaterialNodeData, MaterialType } from '../../../../types/materialNode';
import type { GenerationStatus } from '../../../utils/nodeVisualMath';
import GenerationStateContainer from '../../GenerationStateContainer';
import MediaPreview, { type MediaAssetLike } from '../MediaPreview';
import NodeEmptyState from '../NodeEmptyState';
import { OfflineCardBody } from './OfflineCardBody';

export interface MediaCardBodyProps {
  materialType: MaterialType;
  nodeData: MaterialNodeData;
  isOffline: boolean;
  generationStatus: GenerationStatus | null;
  loadingAspectRatio: 'video' | 'audio' | 'auto' | 'square';
  executionError?: string;
  errorMessage?: string;
  previewUrl?: string;
  mediaAssets?: MediaAssetLike[];
  mediaUrl?: string;
  label?: string;
  status?: string;
  audioWorkspaceId?: string;
  isMultiSelected: boolean;
  isGenerating: boolean;
  kind: string;
  onMediaSizeChange: (naturalWidth: number, naturalHeight: number) => void;
  onDurationChange: (duration: number) => void;
  onSaveAudio?: () => Promise<void>;
  onRetry: () => void;
  onApplyPreset: (presetKey: string) => void;
  onReplaceAudio?: () => void;
  onImport?: () => void;
  onRelink: (materialType: MaterialType) => void;
}

export const MediaCardBody: React.FC<MediaCardBodyProps> = ({
  materialType,
  nodeData,
  isOffline,
  generationStatus,
  loadingAspectRatio,
  executionError,
  errorMessage,
  previewUrl,
  mediaAssets,
  mediaUrl,
  label,
  status,
  audioWorkspaceId,
  isMultiSelected,
  isGenerating,
  kind,
  onMediaSizeChange,
  onDurationChange,
  onSaveAudio,
  onRetry,
  onApplyPreset,
  onReplaceAudio,
  onImport,
  onRelink,
}) => {
  if (isOffline) {
    return <OfflineCardBody materialType={materialType} onRelink={onRelink} />;
  }

  const emptyState = (
    <NodeEmptyState
      materialType={materialType}
      nodeKind={nodeData.nodeKind ?? (nodeData.selectedTool === 'import' ? 'import' : 'generate')}
      onApplyPreset={onApplyPreset}
      onImport={onImport}
    />
  );

  if (!generationStatus) {
    return <div className="wf-material-node__media">{emptyState}</div>;
  }

  return (
    <div className="wf-material-node__media">
      <GenerationStateContainer
        status={generationStatus}
        loadingAspectRatio={loadingAspectRatio}
        errorMessage={executionError ?? errorMessage}
        taskId={nodeData.taskId}
        onRetry={onRetry}
      >
        {previewUrl ? (
          <MediaPreview
            materialType={materialType}
            mediaAssets={mediaAssets}
            mediaUrl={mediaUrl}
            workspaceId={typeof nodeData.__workspaceId === 'string' ? nodeData.__workspaceId : undefined}
            label={label}
            status={status}
            isMissing={nodeData.isMissing === true}
            onMediaSizeChange={onMediaSizeChange}
            onDurationChange={onDurationChange}
            onSaveAudio={audioWorkspaceId ? onSaveAudio : undefined}
            onReplaceAudio={onReplaceAudio}
          />
        ) : (
          emptyState
        )}
      </GenerationStateContainer>
    </div>
  );
};
