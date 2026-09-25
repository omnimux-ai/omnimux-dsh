import React, { useRef, useState, useEffect } from 'react'

/**
 * 纯矢量 SVG 勾选标识（符合 UI04 门禁，严禁 Emoji / Unicode 字符）
 */
function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
    </svg>
  )
}

/**
 * 纯矢量媒体占位图标
 */
function FilePlaceholderIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

/**
 * 极简素材卡片（AssetCard）
 * - 纯客观元数据与文件名，单行截断
 * - 微按压反馈（scale: 0.98）
 * - 悬停超过 200ms 静音循环播放预览视频
 * - 右上角选中勾选圈与 AttachmentStore 响应式同步
 */
export function AssetHubCard({
  item,
  isSelected = false,
  onAttach,
}) {
  const [isHovered, setIsHovered] = useState(false)
  const hoverTimerRef = useRef(null)
  const videoRef = useRef(null)

  const handleMouseEnter = () => {
    hoverTimerRef.current = setTimeout(() => {
      setIsHovered(true)
    }, 200)
  }

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setIsHovered(false)
  }

  // 修复悬停预览视频播放时序：使用 useEffect 监听 isHovered，在 DOM 挂载完成后再触发 play()
  useEffect(() => {
    if (isHovered && videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    } else if (!isHovered && videoRef.current) {
      videoRef.current.pause()
    }
  }, [isHovered])

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current)
      }
    }
  }, [])

  // 补齐 onKeyDown 键盘事件处理（Enter 与 Space 键）
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onAttach?.(item)
    }
  }

  const badgeText = item.durationText || item.formatText || ''

  return (
    <div
      className={`omx-asset-card${isSelected ? ' is-selected' : ''}`}
      onClick={() => onAttach?.(item)}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={item.title}
    >
      {/* 封面与媒体预览区 */}
      <div className="omx-asset-card__cover">
        {item.previewVideoUrl && isHovered ? (
          <video
            ref={videoRef}
            src={item.previewVideoUrl}
            className="omx-asset-card__video"
            muted
            loop
            playsInline
          />
        ) : item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt={item.title}
            className="omx-asset-card__img"
            loading="lazy"
          />
        ) : (
          <div className="omx-asset-card__fallback">
            <FilePlaceholderIcon />
          </div>
        )}

        {/* 右下角客观标记（时长或格式） */}
        {badgeText && (
          <span className="omx-asset-card__badge" aria-hidden="true">
            {badgeText}
          </span>
        )}

        {/* 右上角选中状态标识 */}
        {isSelected && (
          <div className="omx-asset-card__check" aria-hidden="true">
            <CheckIcon />
          </div>
        )}
      </div>

      {/* 文本元数据区 */}
      <div className="omx-asset-card__meta">
        <div className="omx-asset-card__title" title={item.title}>
          {item.title}
        </div>
        {item.dimensionsOrSize ? (
          <div className="omx-asset-card__sub">
            {item.dimensionsOrSize}
          </div>
        ) : null}
      </div>
    </div>
  )
}
