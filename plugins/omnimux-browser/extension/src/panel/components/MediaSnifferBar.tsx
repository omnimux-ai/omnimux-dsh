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
  onAttachMedia
}: {
  items: SniffedMediaItem[]
  onAttachMedia: (item: SniffedMediaItem) => void
}) {
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
        <span>页面媒体感知 ({items.length})</span>
      </div>
      <div className="media-sniffer-pills">
        {items.map((item) => {
          const isAttached = attachedIds.has(item.id)
          return (
            <button
              key={item.id}
              type="button"
              className={`media-pill-btn ${isAttached ? 'active' : ''}`}
              onClick={() => handleToggle(item)}
              title={isAttached ? '已作为附件附加到对话' : '点击将此图片作为多模态附件附加'}
            >
              <img src={item.previewSrc} alt="" className="media-pill-thumb" />
              <span className="media-pill-tag">{item.type === 'video' ? '视频' : '图片'}</span>
              <span className="media-pill-check">{isAttached ? '✓' : '+'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
})
