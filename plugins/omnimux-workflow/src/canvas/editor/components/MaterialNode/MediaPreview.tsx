/**
 * MediaPreview（W1 T1.7）— 真实媒体预览，替换 M1-M5 的文字占位。
 *
 * image → img；video → <video controls>；audio → 真实波形播放器。
 * 数据源：mediaAssets（SSE node_complete 写入，
 * useExecutionController.ts:147-152）取首个匹配类型的 asset，回退 mediaUrl。
 * 嵌入 GenerationStateContainer 的 completed 分支。
 *
 * Issue #3625 工作流 3 追加的**生成中**分支（两相预览）：
 * 生成中且有真实中间帧地址时，本组件渲染 `IntermediateFramePreview` 而不是最终产物。
 * 无真实帧时**不渲染帧层**，交回外层 `GenerationStateContainer` 的真实进度骨架。
 *
 * 「不覆盖最终产物」由两道真实保证承担，而不是靠 CSS 遮盖：
 * 1. 数据层：`progressClearPatch()` 在 `node_complete` 的同一次 patch 里清空
 *    `executionPreviewUrl`；
 * 2. 相位层：`GenerationStateContainer` 只在 completed/crossfading 渲染 children，
 *    中间帧层只挂在它的 loading 分支里，两者不会同时进入 DOM。
 * 因此本组件不做「生成中一律 return null」——`isGenerating` 含本地 `status`
 * 标志，完成后可能仍为 true，那样会把已完成产物打空（真回归）。
 */

import { memo, useMemo, useCallback } from 'react';
import AudioPreview from './AudioPreview';
import IntermediateFramePreview from './IntermediateFramePreview';
import type { MaterialType } from '../../../types/materialNode';
import { resolveMediaPreviewUrl, type MediaAssetLike } from '../../utils/mediaUrl';
import { shouldRenderIntermediateFrame } from '../intermediateFrame.ts';

export type { MediaAssetLike };
export { resolveMediaPreviewUrl };

export interface MediaPreviewProps {
  materialType: MaterialType;
  mediaAssets?: MediaAssetLike[];
  mediaUrl?: string;
  label?: string;
  workspaceId?: string;
  status?: string;
  isMissing?: boolean;
  onMediaSizeChange?: (width: number, height: number) => void;
  onDurationChange?: (durationSec: number) => void;
  onSaveAudio?: () => Promise<void>;
  onReplaceAudio?: () => void;
  /**
   * 是否处于生成中（来自节点 executionStatus → GenerationStatus 映射）。
   * 为 true 时本组件只渲染中间帧相，不渲染最终产物。
   */
  isGenerating?: boolean;
  /** 真实中间帧地址（可选；上游当前不下发，见 intermediateFrame.ts）。 */
  intermediateFrameUrl?: string;
  /** 真实进度百分比（0-100）。 */
  progress?: number;
  /** 真实状态文案（node_progress.message）。 */
  progressMessage?: string;
  /** 无状态文案时的兜底 loading 文案。 */
  loadingLabel?: string;
}

const MediaPreview: React.FC<MediaPreviewProps> = ({
  materialType,
  mediaAssets,
  mediaUrl,
  label,
  workspaceId,
  status,
  isMissing,
  onMediaSizeChange,
  onDurationChange,
  onSaveAudio,
  onReplaceAudio,
  isGenerating = false,
  intermediateFrameUrl,
  progress,
  progressMessage,
  loadingLabel,
}) => {
  const url = useMemo(
    () => resolveMediaPreviewUrl(materialType, mediaAssets, mediaUrl),
    [materialType, mediaAssets, mediaUrl],
  );

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        onMediaSizeChange?.(img.naturalWidth, img.naturalHeight);
      }
    },
    [onMediaSizeChange],
  );

  const handleVideoMetadata = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget;
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        onMediaSizeChange?.(v.videoWidth, v.videoHeight);
      }
      if (Number.isFinite(v.duration) && v.duration > 0) {
        onDurationChange?.(Math.round(v.duration * 100) / 100);
      }
    },
    [onMediaSizeChange, onDurationChange],
  );

  // 生成中且有**真实**中间帧：渲染中间帧相，绝不同时渲染最终产物。
  //
  // 注意这里**没有**「生成中一律 return null」的分支：`isGenerating` 由
  // `MaterialNode/index.tsx:252-257` 推导，含本地 `status === 'generating'`，
  // 而 `node_complete` 不回写本地 `status`（只写 `executionStatus`），所以完成后
  // 该标志可能仍是 true。若在此 return null，会把已完成的最终产物打空——那是
  // 真回归。相位权威是外层 `GenerationStateContainer`（只在 completed/crossfading
  // 渲染 children），中间帧与最终产物因此不会同时出现在 DOM 里。
  if (shouldRenderIntermediateFrame({ isLoading: isGenerating, hasFrame: Boolean(intermediateFrameUrl) })) {
    return (
      <IntermediateFramePreview
        src={intermediateFrameUrl as string}
        progress={progress}
        message={progressMessage}
        fallbackLabel={loadingLabel ?? ''}
      />
    );
  }

  if (status === 'offline' || isMissing) return null;
  if (!url) return null;

  switch (materialType) {
    case 'image':
      return (
        <img
          src={url}
          alt={label ?? ''}
          className="wf-media-preview__media wf-media-preview__media--image"
          onLoad={handleImageLoad}
        />
      );
    case 'video':
      return (
        <video
          src={url}
          controls
          preload="metadata"
          className="wf-media-preview__media wf-media-preview__media--video"
          onLoadedMetadata={handleVideoMetadata}
        />
      );
    case 'audio':
      return (
        <AudioPreview key={`${workspaceId ?? ''}:${url}`} source={url} workspaceId={workspaceId} label={label} onSave={onSaveAudio} onReplace={onReplaceAudio} />
      );
    default:
      return null;
  }
};

export default memo(MediaPreview);
