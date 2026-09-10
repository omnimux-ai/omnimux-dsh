/**
 * GenerationStateContainer — 移植自 Gxgen
 * apps/web/src/pages/CanvasEditor/components/GenerationStateContainer.tsx(328)
 * + 同名 .css(115)。
 *
 * 状态机 + 交叉淡入逻辑原样保留（transitionPhase/skeletonOpacity/
 * contentOpacity）；差异仅在消费方式：
 * - react-i18next → 本 island i18n 骨架 useT()（计划 §7）；
 * - AppIcon → lucide-react 直接引用（计划 §A）；
 * - Tailwind/red 系 → theme CSS 的 wf-gsc* BEM 块（.dark →
 *   body[data-ds-dark-theme] .wf-canvas-root，red → --wb-danger*）。
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useT } from '../../i18n';
import type { GenerationStatus } from '../utils/nodeVisualMath';
import { OrganicShimmerOverlay } from './OrganicShimmer';

export type { GenerationStatus };

/** 过渡阶段 */
type TransitionPhase = 'idle' | 'crossfading' | 'complete';

export interface GenerationStateContainerProps {
  /** 当前状态 */
  status: GenerationStatus;
  /** 加载态宽高比，默认 square (1:1)，统一所有生成节点的加载卡片大小 */
  loadingAspectRatio?: 'square' | 'video' | 'audio' | 'auto';
  /** 错误消息 */
  errorMessage?: string;
  /** 任务 ID（失败时显示，截断前 8 位） */
  taskId?: string;
  /** 重试回调（接 MaterialNode handleGenerate） */
  onRetry?: (e?: React.MouseEvent) => void;
  /** completed 状态时显示的内容 */
  children: React.ReactNode;
  /** 额外的 CSS 类名 */
  className?: string;
  /** 过渡动画时长（毫秒），默认 400ms */
  transitionDuration?: number;
}

/** 供应商错误串 → 用户可读文案（Gxgen getUserFacingErrorMessage 原样逻辑） */
function useUserFacingErrorMessage(errorMessage: string | undefined): string | undefined {
  const t = useT();
  if (!errorMessage) return undefined;

  // 1. 从复合包装报错中提取最内层业务错误信息（兼容未转义的嵌套 JSON）
  let cleanMsg = errorMessage;
  const allMessages = [...errorMessage.matchAll(/"message"\s*:\s*"([^"]+)"/g)];
  if (allMessages.length > 0) {
    const lastMsg = allMessages[allMessages.length - 1];
    if (lastMsg && typeof lastMsg[1] === 'string') {
      cleanMsg = lastMsg[1];
    }
  } else {
    const jsonMatch = /\{[\s\S]*"error"[\s\S]*\}/.exec(errorMessage);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed?.error?.message === 'string' && parsed.error.message.trim()) {
          cleanMsg = parsed.error.message.trim();
        }
      } catch {}
    }
  }

  const normalized = cleanMsg.toLowerCase();

  // 2. 识别素材链接不合规错误（如云端 API 拒绝本地虚拟路径）
  if (
    normalized.includes('invalid format for image_urls') ||
    normalized.includes('invalid format for video_urls') ||
    normalized.includes('invalid format for audio_urls') ||
    normalized.includes('invalid format for image_with_roles') ||
    normalized.includes('input_video_probe_failed') ||
    (normalized.includes('only http/https') && (normalized.includes('supported') || normalized.includes('url')))
  ) {
    return t('error.assetUrlMustBeHttp');
  }

  // 3. 真正的渠道不可用（hub channel-classifier 归一为 CHANNEL_UNAVAILABLE，或网关明确提示无可用渠道/分发器失败）
  // 注意：绝不能无脑匹配 adapter openai-compatible，否则会导致参数格式错误被全部遮罩为通道维护！
  if (
    normalized.includes('channel_unavailable') ||
    cleanMsg.includes('无可用渠道') ||
    cleanMsg.includes('可用渠道不存在') ||
    normalized.includes('get_channel_failed') ||
    cleanMsg.includes('(distributor)')
  ) {
    return t('error.channelUnavailable');
  }

  if (
    normalized.includes('content_policy_violation') ||
    normalized.includes('inappropriate content') ||
    normalized.includes('suggestive or explicit material')
  ) {
    return t('error.contentPolicyViolation');
  }
  if (
    normalized.includes('[image-routing] all channels failed') ||
    normalized.includes('all channels failed')
  ) {
    return t('error.generationProviderFailed');
  }

  // 4. 清理底层技术前缀
  if (cleanMsg.startsWith('[omnimux:ADAPTER_FAILED]')) {
    cleanMsg = cleanMsg.replace(/^\[omnimux:ADAPTER_FAILED\]\s*(Adapter\s+[a-z0-9_-]+\s+failed:\s*)?/i, '').trim();
  }

  return cleanMsg;
}

const GenerationStateContainer: React.FC<GenerationStateContainerProps> = ({
  status,
  loadingAspectRatio = 'square',
  errorMessage,
  taskId,
  onRetry,
  children,
  className = '',
  transitionDuration = 400,
}) => {
  const t = useT();
  const prevStatusRef = useRef<GenerationStatus>(status);

  // 过渡状态管理（与 Gxgen 原样）
  const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>(
    status === 'completed' ? 'complete' : 'idle',
  );
  const [skeletonOpacity, setSkeletonOpacity] = useState(1);
  const [contentOpacity, setContentOpacity] = useState(status === 'completed' ? 1 : 0);
  const [showSkeleton, setShowSkeleton] = useState(status === 'pending' || status === 'generating');

  // 状态变化时触发过渡动画（与 Gxgen 原样）
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;

    // 从加载状态 -> 完成状态：触发交叉淡入淡出
    if ((prevStatus === 'pending' || prevStatus === 'generating') && status === 'completed') {
      setTransitionPhase('crossfading');
      setShowSkeleton(true);

      // 延迟一帧后开始动画（确保 DOM 更新）
      requestAnimationFrame(() => {
        setSkeletonOpacity(0);
        setContentOpacity(1);
      });

      const timer = setTimeout(() => {
        setTransitionPhase('complete');
        setShowSkeleton(false);
      }, transitionDuration + 50);

      return () => clearTimeout(timer);
    }

    // 从完成状态 -> 加载状态（重新生成）
    if (prevStatus === 'completed' && (status === 'pending' || status === 'generating')) {
      setTransitionPhase('idle');
      setShowSkeleton(true);
      setSkeletonOpacity(1);
      setContentOpacity(0);
    }

    // 直接进入加载状态（初始或从失败重试）
    if (status === 'pending' || status === 'generating') {
      setShowSkeleton(true);
      setSkeletonOpacity(1);
      setContentOpacity(0);
      setTransitionPhase('idle');
    }

    // 失败状态
    if (status === 'failed') {
      setShowSkeleton(false);
      setTransitionPhase('idle');
    }

    // 初始挂载时就是 completed
    if (prevStatus === status && status === 'completed') {
      setTransitionPhase('complete');
      setContentOpacity(1);
      setShowSkeleton(false);
    }
  }, [status, transitionDuration]);

  const isLoading = status === 'pending' || status === 'generating';
  const isFailed = status === 'failed';
  const isCompleted = status === 'completed';
  const defaultLoadingText = status === 'pending' ? t('node.preparing') : t('node.generating');
  const resolvedErrorMessage = useUserFacingErrorMessage(errorMessage);

  useEffect(() => {
    if (!isFailed || !errorMessage) return;
    const normalized = errorMessage.toLowerCase();
    const isQuota = normalized.includes('quota-exceeded')
      || normalized.includes('insufficient_user_quota')
      || errorMessage.includes('预扣费额度失败')
      || normalized.includes('[omnimux:quota-exceeded]');
    if (!isQuota) return;
    const quota = typeof window !== 'undefined' ? window.__omnimuxQuota : undefined;
    quota?.notify?.({ message: errorMessage, code: 'quota-exceeded' }, {
      capability: 'canvas',
      correlationId: taskId || errorMessage,
    });
  }, [isFailed, errorMessage, taskId]);

  const transitionStyle = useCallback(
    () => ({ transition: `opacity ${transitionDuration}ms ease-out` }),
    [transitionDuration],
  );

  const aspectClass = `wf-gsc__box--${loadingAspectRatio}`;

  // 加载骨架屏（升级为 OrganicShimmerOverlay 有机流体微光动效 + 进度文字呼吸）
  const renderSkeleton = () => (
    <div className="wf-gsc__skeleton" style={{ ...transitionStyle(), opacity: skeletonOpacity }}>
      <div className={`wf-gsc__box wf-gsc__skeleton-card ${aspectClass}`}>
        <OrganicShimmerOverlay borderRadius="inherit">
          <div className="wf-gsc__skeleton-body">
            <span className="wf-gsc__progress-text">{defaultLoadingText}</span>
          </div>
        </OrganicShimmerOverlay>
      </div>
    </div>
  );

  // 失败状态（与骨架同尺寸，红色系全走 --wb-danger* token）
  const renderFailed = () => (
    <div className={`wf-gsc__box wf-gsc__failed ${aspectClass} ${className}`}>
      <div className="wf-gsc__failed-icon">
        <X size={24} />
      </div>
      <span className="wf-gsc__failed-label">{t('node.generationFailed')}</span>
      {resolvedErrorMessage ? (
        <span className="wf-gsc__failed-message">{resolvedErrorMessage}</span>
      ) : null}
      {taskId ? (
        <span className="wf-gsc__failed-task">
          {t('node.taskIdLabel')} {taskId.slice(0, 8)}...
        </span>
      ) : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} className="wf-gsc__retry">
          <RefreshCw size={14} />
          {t('node.regenerate')}
        </button>
      ) : null}
    </div>
  );

  // 完成状态（带淡入动画；crossfading 期间模糊，同 Gxgen generating-image）
  const renderCompleted = (blur: boolean) => (
    <div
      className={`${className} ${blur ? 'wf-gsc__content--blur' : ''}`}
      style={{ ...transitionStyle(), opacity: contentOpacity }}
    >
      {children}
    </div>
  );

  return (
    // 加载态下骨架层是绝对定位，根容器需借 aspect class 获得固有高度，
    // 否则 square/video 骨架塌成 0 高（audio 靠 padding 撑高所以无恙）。
    <div className={`wf-gsc ${isLoading ? aspectClass : ''} ${className}`}>
      {(isLoading || showSkeleton) && renderSkeleton()}
      {isFailed && renderFailed()}
      {(isCompleted || transitionPhase === 'crossfading') &&
        renderCompleted(transitionPhase === 'crossfading')}
    </div>
  );
};

export default GenerationStateContainer;
