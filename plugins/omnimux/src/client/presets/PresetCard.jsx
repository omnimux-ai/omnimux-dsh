import React, { useEffect, useRef, useState } from 'react'
import { resolveMediaUrl, hasVideoPreview, hasPosterPreview } from './media-resolver.js'

/**
 * 单个创意预设卡片组件
 * 实现三级渐进加载：海报封面 -> 300ms 悬停即播视频 -> 离线骨架降级
 */
export function PresetCard({
  item,
  type = 'hook', // 'hook' | 'style' | 'format'
  isSelected = false,
  onSelect,
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [shouldPlayVideo, setShouldPlayVideo] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const hoverTimer = useRef(null)

  const videoUrl = resolveMediaUrl(item.videoPath)
  const posterUrl = resolveMediaUrl(item.posterPath)
  const canPlayVideo = hasVideoPreview(item) && videoUrl && !videoError

  function handleMouseEnter() {
    setIsHovered(true)
    if (canPlayVideo) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = setTimeout(() => {
        setShouldPlayVideo(true)
      }, 300) // 300ms 防抖
    }
  }

  function handleMouseLeave() {
    setIsHovered(false)
    clearTimeout(hoverTimer.current)
    setShouldPlayVideo(false)
  }

  useEffect(() => {
    return () => {
      clearTimeout(hoverTimer.current)
    }
  }, [])

  const title = item.titleZh || item.title
  const subTitle = item.titleZh ? item.title : ''
  const category = item.categoryNameZh || item.categoryName

  return (
    <div
      className={`omnimux-preset-card ${isSelected ? 'is-selected' : ''}`}
      onClick={() => onSelect?.(item)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect?.(item)
        }
      }}
    >
      {/* 媒体展示区 */}
      <div className="omnimux-preset-media-box">
        {shouldPlayVideo ? (
          <video
            src={videoUrl}
            className="omnimux-preset-video"
            autoPlay
            muted
            loop
            playsInline
            onError={() => setVideoError(true)}
          />
        ) : posterUrl && !imgError ? (
          <img
            src={posterUrl}
            alt={title}
            className="omnimux-preset-poster"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          /* Level 3 优雅降级占位背景 */
          <div className="omnimux-preset-fallback">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              {type === 'hook' && <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />}
              {type === 'style' && <circle cx="12" cy="12" r="10" />}
              {type === 'format' && <rect x="2" y="4" width="20" height="16" rx="2" />}
            </svg>
            <span className="omnimux-preset-fallback-tag">{category}</span>
          </div>
        )}

        {/* 选中勾选角标 */}
        {isSelected && (
          <div className="omnimux-preset-check-badge" aria-label="Selected">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
      </div>

      {/* 文本信息区 (1:1 对标图 2 纯净排版) */}
      <div className="omnimux-preset-info">
        <h4 className="omnimux-preset-title" title={title}>
          {title}
        </h4>
        {item.description && (
          <p className="omnimux-preset-desc" title={item.description}>
            {item.description}
          </p>
        )}
      </div>
    </div>
  )
}
