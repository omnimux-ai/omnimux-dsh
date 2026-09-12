import { memo, useState } from 'react'

export interface SniffedMediaItem {
  id: string
  type: 'image' | 'video'
  src: string
  previewSrc: string
  alt?: string
}

export const MediaSnifferBar = memo(function MediaSnifferBar({
  items,
  locale = 'zh',
  onAttachMedia
}: {
  items: SniffedMediaItem[]
  locale?: 'zh' | 'en'
  onAttachMedia: (item: SniffedMediaItem) => void
}) {
  const isEn = locale === 'en'
  const [attachedIds, setAttachedIds] = useState<Set<string>>(new Set())

  if (!items || items.length === 0) return null

  const handleToggle = (item: SniffedMediaItem) => {
    const next = new Set(attachedIds)
    if (next.has(item.id)) {
      next.delete(item.id)
    } else {
      next.add(item.id)
      onAttachMedia(item)
    }
    setAttachedIds(next)
  }

  return (
    <div className="media-sniffer-bar">
      <div className="media-sniffer-title">
        <span className="sniffer-icon">🖼️</span>
        <span>{isEn ? `Page Media (${items.length})` : `页面媒体感知 (${items.length})`}</span>
      </div>
      <div className="media-sniffer-pills">
        {items.map((item) => {
          const isAttached = attachedIds.has(item.id)
          const tag = item.type === 'video' ? (isEn ? 'Video' : '视频') : (isEn ? 'Image' : '图片')
          const title = isAttached
            ? (isEn ? 'Attached to conversation' : '已作为附件附加到对话')
            : (isEn ? 'Click to attach image' : '点击将此图片作为多模态附件附加')
          return (
            <button
              key={item.id}
              type="button"
              className={`media-pill-btn ${isAttached ? 'active' : ''}`}
              onClick={() => handleToggle(item)}
              title={title}
            >
              <img src={item.previewSrc} alt="" className="media-pill-thumb" />
              <span className="media-pill-tag">{tag}</span>
              <span className="media-pill-check">{isAttached ? '✓' : '+'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
})
