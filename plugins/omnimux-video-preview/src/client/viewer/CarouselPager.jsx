import React, { useMemo, useState } from 'react'
import { pickAspectBucket } from './breakdownDataUtils.js'

/**
 * 图文轮播翻页器：左侧大图 + 页码计数 + 前后翻。
 * pages: [{ index, image_url, local_path, stream_url }]
 */
export function CarouselPager({ pages = [], pageIndex = 0, onPageChange, isZh = true }) {
  const [measuredRatio, setMeasuredRatio] = useState(null)
  const total = pages.length
  const clamped = Math.min(Math.max(pageIndex, 0), Math.max(total - 1, 0))
  const page = total > 0 ? pages[clamped] : null
  const src = page ? page.stream_url || page.image_url : ''

  const aspectStyle = useMemo(
    () => ({ '--omnimux-player-aspect': pickAspectBucket(measuredRatio) }),
    [measuredRatio]
  )

  const go = (delta) => {
    const next = clamped + delta
    if (next < 0 || next > total - 1) return
    setMeasuredRatio(null)
    if (typeof onPageChange === 'function') onPageChange(next)
  }

  return (
    <div className="omnimux-video-breakdown-player-card is-carousel" style={aspectStyle}>
      {src ? (
        <img
          className="omnimux-video-breakdown-video-el"
          src={src}
          alt={isZh ? `第 ${clamped + 1} 页` : `Page ${clamped + 1}`}
          onLoad={(e) => {
            const el = e.target
            if (el.naturalWidth > 0 && el.naturalHeight > 0) {
              setMeasuredRatio(el.naturalWidth / el.naturalHeight)
            }
          }}
        />
      ) : (
        <div className="omnimux-carousel-page-empty">
          {isZh ? '该页图片不可用' : 'Image unavailable'}
        </div>
      )}

      {total > 0 ? (
        <div className="omnimux-carousel-pager-bar">
          <button
            type="button"
            className="omnimux-carousel-pager-btn"
            disabled={clamped <= 0}
            onClick={(e) => { e.stopPropagation(); go(-1) }}
            aria-label={isZh ? '上一页' : 'Previous page'}
          >
            ‹
          </button>
          <span className="omnimux-carousel-pager-count">
            {isZh ? `第 ${clamped + 1} / ${total} 页` : `${clamped + 1} / ${total}`}
          </span>
          <button
            type="button"
            className="omnimux-carousel-pager-btn"
            disabled={clamped >= total - 1}
            onClick={(e) => { e.stopPropagation(); go(1) }}
            aria-label={isZh ? '下一页' : 'Next page'}
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  )
}
