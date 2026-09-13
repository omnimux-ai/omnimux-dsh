import { memo, useRef, useState, useEffect } from 'react'
import { CloseIcon, SaveIcon } from './icons.tsx'

export interface SniffedMediaItem {
  id: string
  type: 'image' | 'video'
  src: string
  previewSrc: string
  alt?: string
  width?: number
  height?: number
}

export const MediaSnifferBar = memo(function MediaSnifferBar({
  items,
  locale = 'zh',
  onActiveChange,
  onSaveToInspiration,
}: {
  items: SniffedMediaItem[]
  locale?: 'zh' | 'en'
  onActiveChange?: (activeItems: SniffedMediaItem[]) => void
  onSaveToInspiration?: (item: SniffedMediaItem) => void
}) {
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())
  const [previewItem, setPreviewItem] = useState<SniffedMediaItem | null>(null)
  const [previewLeft, setPreviewLeft] = useState<number>(0)
  const shelfRef = useRef<HTMLDivElement | null>(null)
  const chipRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null)

  const clearHoverTimer = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => clearHoverTimer()
  }, [])

  if (!items || items.length === 0) return null

  const updatePreviewPosition = (itemId: string) => {
    const el = chipRefs.current.get(itemId)
    if (!el || !shelfRef.current) return
    const shelfRect = shelfRef.current.getBoundingClientRect()
    const chipRect = el.getBoundingClientRect()
    // 计算 chip 水平中心点在 shelfRef 内的相对距离
    const chipCenterX = chipRect.left + chipRect.width / 2 - shelfRect.left
    const cardWidth = 206
    let targetLeft = chipCenterX - cardWidth / 2
    if (targetLeft < 0) {
      targetLeft = 0
    }
    const maxLeft = Math.max(0, shelfRect.width - cardWidth)
    if (shelfRect.width > cardWidth && targetLeft > maxLeft) {
      targetLeft = maxLeft
    }
    setPreviewLeft(Math.round(targetLeft))
  }

  const handleChipClick = (item: SniffedMediaItem) => {
    clearHoverTimer()
    const next = new Set(activeIds)
    if (next.has(item.id)) {
      next.delete(item.id)
      if (previewItem?.id === item.id) {
        setPreviewItem(null)
      }
    } else {
      next.add(item.id)
      setPreviewItem(item)
      updatePreviewPosition(item.id)
    }
    setActiveIds(next)
    const activeList = items.filter((it) => next.has(it.id))
    onActiveChange?.(activeList)
  }

  const handleChipHover = (item: SniffedMediaItem) => {
    clearHoverTimer()
    if (activeIds.has(item.id)) {
      setPreviewItem(item)
      updatePreviewPosition(item.id)
    }
  }

  const handleShelfLeave = () => {
    clearHoverTimer()
    hoverTimerRef.current = setTimeout(() => {
      setPreviewItem(null)
    }, 250)
  }

  return (
    <div
      ref={shelfRef}
      className="media-sniffer-shelf"
      onMouseLeave={handleShelfLeave}
      onMouseOut={handleShelfLeave}
    >
      {previewItem && (
        <div
          className="media-float-preview-card visible"
          style={{ left: `${previewLeft}px` }}
          onMouseEnter={clearHoverTimer}
          onMouseLeave={handleShelfLeave}
        >
          <div className="float-preview-header">
            <span className="float-preview-title" title={previewItem.alt || ''}>
              {previewItem.alt || (previewItem.type === 'video' ? '视频原片' : '图片素材')}
            </span>
            <button
              type="button"
              className="float-preview-close"
              onClick={() => setPreviewItem(null)}
              title={locale === 'en' ? 'Close' : '关闭预览'}
            >
              <CloseIcon size={10} />
            </button>
          </div>
          <div className="float-preview-thumb-box">
            <img src={previewItem.previewSrc} alt={previewItem.alt || ''} className="float-preview-thumb" />
          </div>
          <div className="float-preview-action-row">
            <button
              type="button"
              className="float-preview-save-btn"
              onClick={() => onSaveToInspiration?.(previewItem)}
            >
              <SaveIcon size={13} />
              <span>{locale === 'en' ? 'Save' : '保存到灵感库'}</span>
            </button>
          </div>
        </div>
      )}

      <div className="media-items-row">
        {items.map((item) => {
          const isActive = activeIds.has(item.id)
          const typeTag = item.type === 'video' ? 'MP4' : (item.src.toLowerCase().includes('.png') ? 'PNG' : 'JPG')
          return (
            <div
              key={item.id}
              ref={(el) => {
                if (el) chipRefs.current.set(item.id, el)
                else chipRefs.current.delete(item.id)
              }}
              className={`media-item-chip ${isActive ? 'active' : ''}`}
              data-tooltip={isActive ? (locale === 'en' ? 'Active' : '已点亮激活') : (locale === 'en' ? 'Activate' : '点亮激活')}
              onClick={() => handleChipClick(item)}
              onMouseEnter={() => handleChipHover(item)}
              onMouseOver={() => handleChipHover(item)}
            >
              <img src={item.previewSrc} alt={item.alt || ''} className="media-thumb" />
              <span className="media-type-badge">{typeTag}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
})
