import React, { useCallback, useEffect, useRef, useState } from 'react'
import { TrendingVideoCard } from './TrendingVideoCard.jsx'

const ICON_ARROW_LEFT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 18-6-6 6-6" />
  </svg>
)

const ICON_ARROW_RIGHT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
)

/**
 * 爆款对标视频横向轮播视图。
 *
 * 鼠标悬停在轮播区域时，浮现圆润毛玻璃左右切换按钮；
 * 点击按钮按视口步长平滑切换滑动；
 * 单张卡片依然支持鼠标悬停 150ms 自动静音播放预览。
 *
 * @param {{
 *   items: Array<object>,
 *   t: (key: string, fallback?: string) => string,
 *   activeId?: string,
 *   onRecreate?: (item: object) => void,
 * }} props
 */
export const TrendingCarousel = React.memo(function TrendingCarousel({ items = [], t, activeId = '', onRecreate }) {
  const trackRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const updateScrollState = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    // 留 2px 容差，防御高分屏与缩放小数像素截断
    setCanScrollLeft(scrollLeft > 2)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2)
  }, [])

  useEffect(() => {
    updateScrollState()
    const el = trackRef.current
    if (!el) return
    const handleScroll = () => updateScrollState()
    el.addEventListener('scroll', handleScroll, { passive: true })
    const handleResize = () => updateScrollState()
    window.addEventListener('resize', handleResize)
    return () => {
      el.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
    }
  }, [items, updateScrollState])

  const scrollByStep = (direction) => {
    const el = trackRef.current
    if (!el) return
    // 单次平移步长：可视宽度的 75%，确保滑动连贯且上下文不丢失
    const step = Math.max(220, Math.round(el.clientWidth * 0.75))
    el.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth',
    })
  }

  return (
    <div
      className="omnimux-trending-carousel-wrapper"
      role="region"
      aria-label={t?.('trending.layout.carousel') || '爆款视频轮播'}
    >
      <button /* exempt-ui01: session-guide 子树不引入 UI Kit，使用等效原生动作按钮 */
        type="button"
        className="omnimux-trending-carousel-nav is-prev"
        aria-label={t?.('trending.carousel.prev') || '向左滑动'}
        disabled={!canScrollLeft}
        onClick={() => scrollByStep('left')}
      >
        {ICON_ARROW_LEFT}
      </button>

      <div className="omnimux-trending-carousel-track" ref={trackRef}>
        {items.map((item) => (
          <div key={item.id} className="omnimux-trending-carousel-slide">
            <TrendingVideoCard
              item={item}
              t={t}
              active={activeId === item.id}
              onRecreate={onRecreate}
            />
          </div>
        ))}
      </div>

      <button /* exempt-ui01: session-guide 子树不引入 UI Kit，使用等效原生动作按钮 */
        type="button"
        className="omnimux-trending-carousel-nav is-next"
        aria-label={t?.('trending.carousel.next') || '向右滑动'}
        disabled={!canScrollRight}
        onClick={() => scrollByStep('right')}
      >
        {ICON_ARROW_RIGHT}
      </button>
    </div>
  )
})
