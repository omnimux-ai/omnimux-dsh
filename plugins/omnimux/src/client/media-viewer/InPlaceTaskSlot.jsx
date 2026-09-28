import React, { useEffect, useState } from 'react';
import { OrganicShimmerOverlay } from './OrganicShimmerOverlay.jsx';

/**
 * 规范化比例输入为 9:16, 16:9 或 1:1 白名单
 * @param {string} [raw]
 * @returns {'9:16' | '16:9' | '1:1'}
 */
export function normalizeTaskRatio(raw) {
  if (!raw || typeof raw !== 'string') return '1:1';
  const trimmed = raw.trim();
  if (trimmed === '9:16' || trimmed === '9/16' || trimmed === 'vertical' || trimmed === 'portrait') return '9:16';
  if (trimmed === '16:9' || trimmed === '16/9' || trimmed === 'horizontal' || trimmed === 'landscape') return '16:9';
  if (trimmed === '1:1' || trimmed === '1/1' || trimmed === 'square') return '1:1';
  return '1:1';
}

/**
 * InPlaceTaskSlot
 * 原位任务卡片容器：
 * - 支持 ratio: '9:16' | '16:9' | '1:1'
 * - 在执行态 (pending / running) 挂载 OrganicShimmerOverlay 纯视觉有机流体折射动效
 * - 在完成态 (success) 就地平滑 Morph 展示生成的媒体
 * - 遵循产品经理许清楚铁律：卡片内绝对零文字、零按钮
 *
 * @param {{
 *   status?: 'pending' | 'running' | 'success' | 'failure' | 'cancelled',
 *   ratio?: '9:16' | '16:9' | '1:1' | string,
 *   media?: { url?: string, type?: 'image' | 'video', duration?: string, title?: string },
 *   controls?: boolean,
 *   muted?: boolean,
 *   onClick?: () => void,
 *   className?: string,
 *   style?: React.CSSProperties
 * }} props
 */
export function InPlaceTaskSlot({
  status = 'running',
  ratio = '1:1',
  media = null,
  controls = false,
  muted = true,
  onClick,
  className = '',
  style,
}) {
  const normalizedRatio = normalizeTaskRatio(ratio);
  const isRunning = status === 'pending' || status === 'running';
  const hasResult = (status === 'success' || !isRunning) && Boolean(media?.url);
  const isVideo = media?.type === 'video';
  const [prevUrl, setPrevUrl] = useState(media?.url);
  const [loadedUrl, setLoadedUrl] = useState(null);
  const [failedUrl, setFailedUrl] = useState(null);
  const [finishedUrl, setFinishedUrl] = useState(null);
  const [metadata, setMetadata] = useState(null);
  if (prevUrl !== media?.url) {
    setPrevUrl(media?.url);
    setLoadedUrl(null);
    setFailedUrl(null);
    setFinishedUrl(null);
  }
  const ready = hasResult && loadedUrl === media.url && failedUrl !== media.url;
  const abnormal = ['failure', 'cancelled', 'unresolved'].includes(status);
  const showShimmer = !abnormal && (isRunning || (hasResult && finishedUrl !== media.url && failedUrl !== media.url));
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setFinishedUrl(media.url), 300);
    return () => clearTimeout(timer);
  }, [ready, media?.url]);
  const loaded = (event) => {
    setLoadedUrl(media.url);
    if (isVideo) {
      const video = event.currentTarget;
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? `${Math.round(video.duration * 10) / 10}s` : null;
      const resolution = video.videoHeight > 0 ? `${video.videoHeight}P` : null;
      setMetadata({ url: media.url, text: [resolution, duration].filter(Boolean).join(' · ') });
    }
  };
  const badgeText = ready && isVideo && metadata?.url === media.url ? metadata.text : null;
  if (!isRunning && ((!hasResult && abnormal) || (hasResult && failedUrl === media.url))) return null;

  return (
    <div
      className={`omx-media-slot ${className}`}
      data-ratio={normalizedRatio}
      data-state={status}
      style={style}
      onClick={ready ? onClick : undefined}
      role={ready && onClick ? 'button' : undefined}
      tabIndex={ready && onClick ? 0 : undefined}
    >
      {showShimmer ? (
        <div className={`omx-media-slot__shimmer-wrap ${ready ? 'fade-out' : ''}`}>
          <OrganicShimmerOverlay playing={true} />
        </div>
      ) : null}

      {/* 完成态产物层：任务成功时渲染并淡入激活 */}
      {hasResult ? (
        <div className={`omx-media-result${ready ? ' active' : ''}`} aria-hidden={!ready}>

          {isVideo ? (
            <video
              className="omx-media-result__content"
              src={media.url}
              controls={ready && controls}
              onLoadedData={loaded}
              onError={() => setFailedUrl(media.url)}
              playsInline
              muted={muted}
              preload="metadata"
            />
          ) : (
            <img
              className="omx-media-result__content"
              src={media.url}
              alt=""
              onLoad={loaded}
              onError={() => setFailedUrl(media.url)}
            />
          )}
          {badgeText ? (
            <div className="result-badge">{badgeText}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default InPlaceTaskSlot;
