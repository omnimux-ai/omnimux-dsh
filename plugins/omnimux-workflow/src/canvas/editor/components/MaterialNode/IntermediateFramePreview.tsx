/**
 * IntermediateFramePreview — 生成中的中间帧预览层（Issue #3625 工作流 3）。
 *
 * 职责边界（重要）：
 * - 本组件**只**在生成中渲染，且只在调用方拿到了**真实**中间帧地址时渲染。
 * - 没有真实帧地址时调用方必须渲染纯进度骨架（`GenerationStateContainer`
 *   的 OrganicShimmer 分支），**不得**用占位图或假进度调用本组件。
 * - 终态（完成/失败/取消）由调用方的状态闸门拦掉，本组件不参与「覆盖最终产物」
 *   的判定，因此也不需要在 CSS 里用 `display:none` 掩盖任何东西。
 *
 * 依据的通道事实：`node_progress` 的真实 payload 只有
 * `{executionId, nodeId, progress, message}`，网关 `awaitTask` 是终态一次性轮询，
 * 当前上游不产生增量帧；帧地址按前向兼容可选读取（见 `intermediateFrame.ts`）。
 */

import React, { memo, useCallback, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useT } from '../../../i18n';
import {
  resolveProgressLabel,
  resolveProgressPercentText,
  normalizeProgressValue,
} from '../intermediateFrame.ts';

export interface IntermediateFramePreviewProps {
  /** 真实中间帧地址。调用方保证非空且仅在生成中渲染。 */
  src: string;
  /** 真实进度百分比（0-100）。缺失时不渲染百分比与进度条。 */
  progress?: number;
  /** 真实状态文案（来自 `node_progress.message`）。 */
  message?: string;
  /** 无状态文案时的兜底 loading 文案（由调用方传入）。 */
  fallbackLabel: string;
  /** 图片加载失败时的说明（帧地址失效时明确降级，不静默留白）。 */
  onFrameError?: () => void;
  className?: string;
}

const IntermediateFramePreview: React.FC<IntermediateFramePreviewProps> = ({
  src,
  progress,
  message,
  fallbackLabel,
  onFrameError,
  className = '',
}) => {
  const t = useT();
  const [failed, setFailed] = useState(false);

  const handleError = useCallback(() => {
    setFailed(true);
    onFrameError?.();
  }, [onFrameError]);

  const percent = normalizeProgressValue(progress);
  const percentText = resolveProgressPercentText(progress);
  const label = resolveProgressLabel(message, fallbackLabel);
  // 帧地址失效时明确降级为进度文案，不留一张坏图。
  const showFrame = !failed;

  return (
    <div className={`wf-gif-frame ${className}`.trim()}>
      {showFrame ? (
        <img
          src={src}
          alt=""
          className="wf-gif-frame__image"
          draggable={false}
          onError={handleError}
        />
      ) : null}

      <div className="wf-gif-frame__status">
        <span className="wf-gif-frame__badge">
          <LoaderCircle size={12} className="wf-gif-frame__spinner" aria-hidden />
          <span>{t('node.generating')}</span>
        </span>
        <span className="wf-gif-frame__label" title={label}>{label}</span>
      </div>

      {percent !== undefined ? (
        <div
          className="wf-gif-frame__progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t('node.generating')}
          // 动态宽度只经 CSS 变量下发（design.md §1.1 允许的唯一内联形式），
          // 具体颜色/圆角/字阶全部落在 components.css 的 wf-gif-frame* 区块。
          style={{ '--wf-gif-progress': `${percent}%` } as React.CSSProperties}
        >
          <span className="wf-gif-frame__bar" />
          <span className="wf-gif-frame__percent">{percentText}</span>
        </div>
      ) : null}
    </div>
  );
};

export default memo(IntermediateFramePreview);
