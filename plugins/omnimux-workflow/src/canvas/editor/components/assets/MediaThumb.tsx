import React from 'react';
import { resolveThumbMode } from './mediaThumbMode.ts';

export interface MediaThumbProps {
  /** 素材声明类型；缺省或容器类型时由地址扩展名兜底判定。 */
  kind?: string | null;
  /** 预览地址；空值直接走 fallback。 */
  url?: string | null;
  alt?: string;
  className?: string;
  /** 非图片/视频素材的呈现（调用方的类型图标）。 */
  fallback?: React.ReactNode;
  /** 媒体自然尺寸就绪时回调（图片 onLoad / 视频 onLoadedMetadata）。 */
  onNaturalSize?: (width: number, height: number) => void;
}

/**
 * 资产抽屉统一的缩略图渲染：图片走 `<img>`，视频走 `<video>` 首帧，
 * 其余类型交给调用方的类型图标，避免视频/音频字节落进 `<img>` 变成破图。
 */
export const MediaThumb: React.FC<MediaThumbProps> = ({
  kind,
  url,
  alt,
  className,
  fallback = null,
  onNaturalSize,
}) => {
  const href = typeof url === 'string' ? url.trim() : '';
  const mode = resolveThumbMode(kind, href);

  if (mode === 'none') return <>{fallback}</>;

  if (mode === 'video') {
    return (
      <video
        className={className}
        src={href}
        muted
        playsInline
        preload="metadata"
        aria-label={alt}
        onLoadedMetadata={(event) => {
          const el = event.currentTarget;
          if (el.readyState >= 1 && el.currentTime <= 0.05) el.currentTime = 0.1;
          if (el.videoWidth > 0 && el.videoHeight > 0) {
            onNaturalSize?.(el.videoWidth, el.videoHeight);
          }
        }}
      />
    );
  }

  return (
    <img
      className={className}
      src={href}
      alt={alt}
      onLoad={(event) => {
        const el = event.currentTarget;
        if (el.naturalWidth > 0 && el.naturalHeight > 0) {
          onNaturalSize?.(el.naturalWidth, el.naturalHeight);
        }
      }}
    />
  );
};
