import React, { useState } from 'react'
import { accentIndex } from './trending-data.js'

/**
 * 爆款对标视频封面（矢量自载）。
 *
 * 参考实现使用远端 CDN 的真实视频封面；此处以自绘矢量场景保证零外链、
 * 零首屏阻塞，并为后续接入真实封面保留 `item.cover` 直通分支。
 *
 * 六个构图原型覆盖样本库全部品类：
 * figure / comparison / macro / before-after / product-hero / unboxing
 */

const ARCHETYPE_SET = new Set([
  'figure',
  'comparison',
  'macro',
  'before-after',
  'product-hero',
  'unboxing',
])

function FigureScene() {
  return (
    <>
      <rect x="0" y="0" width="90" height="160" className="omnimux-trending-cover-base" />
      <rect x="18" y="0" width="6" height="160" className="omnimux-trending-cover-slat" />
      <rect x="34" y="0" width="6" height="160" className="omnimux-trending-cover-slat" />
      <rect x="50" y="0" width="6" height="160" className="omnimux-trending-cover-slat" />
      <rect x="66" y="0" width="6" height="160" className="omnimux-trending-cover-slat" />
      <circle cx="45" cy="34" r="13" className="omnimux-trending-cover-skin" />
      <path d="M24 52 Q45 44 66 52 L70 160 L20 160 Z" className="omnimux-trending-cover-garment" />
      <path d="M45 52 L45 160" className="omnimux-trending-cover-seam" />
      <circle cx="45" cy="34" r="13" className="omnimux-trending-cover-outline" />
    </>
  )
}

function ComparisonScene() {
  return (
    <>
      <rect x="0" y="0" width="90" height="160" className="omnimux-trending-cover-base" />
      <rect x="6" y="86" width="78" height="30" rx="5" className="omnimux-trending-cover-layer-1" />
      <rect x="6" y="112" width="78" height="30" rx="5" className="omnimux-trending-cover-layer-2" />
      <rect x="6" y="60" width="78" height="30" rx="5" className="omnimux-trending-cover-layer-3" />
      <rect x="6" y="18" width="78" height="18" rx="4" className="omnimux-trending-cover-tagline" />
      <path d="M14 32 H76" className="omnimux-trending-cover-scale" />
      <path d="M26 32 V42 M64 32 V42" className="omnimux-trending-cover-scale" />
    </>
  )
}

function MacroScene() {
  return (
    <>
      <rect x="0" y="0" width="90" height="160" className="omnimux-trending-cover-base" />
      <circle cx="45" cy="72" r="34" className="omnimux-trending-cover-ring-outer" />
      <circle cx="45" cy="72" r="22" className="omnimux-trending-cover-ring-inner" />
      <circle cx="45" cy="72" r="9" className="omnimux-trending-cover-core" />
      <path d="M45 12 V132" className="omnimux-trending-cover-axis" />
      <path d="M20 22 V50 M70 22 V50 M20 96 V124 M70 96 V124" className="omnimux-trending-cover-teeth" />
    </>
  )
}

function BeforeAfterScene() {
  return (
    <>
      <rect x="0" y="0" width="90" height="160" className="omnimux-trending-cover-base" />
      <path d="M0 160 L90 26 L90 160 Z" className="omnimux-trending-cover-after" />
      <path d="M0 0 L0 160 L44 160 Z" className="omnimux-trending-cover-before" />
      <path d="M0 160 L90 26" className="omnimux-trending-cover-divider" />
      <circle cx="45" cy="82" r="8" className="omnimux-trending-cover-handle" />
      <path d="M41 79 L44 82 L41 85 M49 79 L46 82 L49 85" className="omnimux-trending-cover-handle-arrow" />
    </>
  )
}

function ProductHeroScene() {
  return (
    <>
      <rect x="0" y="0" width="90" height="160" className="omnimux-trending-cover-base" />
      <circle cx="45" cy="72" r="30" className="omnimux-trending-cover-halo" />
      <rect x="33" y="46" width="24" height="56" rx="8" className="omnimux-trending-cover-product" />
      <rect x="38" y="38" width="14" height="10" rx="3" className="omnimux-trending-cover-product-cap" />
      <rect x="36" y="72" width="18" height="16" rx="3" className="omnimux-trending-cover-label" />
      <ellipse cx="45" cy="122" rx="26" ry="4" className="omnimux-trending-cover-shadow" />
    </>
  )
}

function UnboxingScene() {
  return (
    <>
      <rect x="0" y="0" width="90" height="160" className="omnimux-trending-cover-base" />
      <path d="M20 74 L45 60 L70 74 L70 124 L20 124 Z" className="omnimux-trending-cover-box" />
      <path d="M20 74 L45 88 L70 74" className="omnimux-trending-cover-box-fold" />
      <path d="M45 88 V124" className="omnimux-trending-cover-box-fold" />
      <circle cx="31" cy="46" r="7" className="omnimux-trending-cover-item-1" />
      <circle cx="45" cy="38" r="8" className="omnimux-trending-cover-item-2" />
      <circle cx="59" cy="46" r="7" className="omnimux-trending-cover-item-3" />
    </>
  )
}

const SCENE_MAP = {
  figure: FigureScene,
  comparison: ComparisonScene,
  macro: MacroScene,
  'before-after': BeforeAfterScene,
  'product-hero': ProductHeroScene,
  unboxing: UnboxingScene,
}

const ICON_CAROUSEL_PREV = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 18-6-6 6-6" />
  </svg>
)

const ICON_CAROUSEL_NEXT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
)

/**
 * @param {{
 *   item: { id: string, title?: string, archetype?: string, cover?: string, images?: string[], videoUrl?: string },
 *   isHovered?: boolean,
 *   onPlaybackChange?: (playing: boolean) => void,
 *   t?: (key: string, fallback?: string) => string,
 * }} props
 */
export const TrendingCover = React.memo(function TrendingCover({ item, isHovered = false, onPlaybackChange, t }) {
  const [coverLoaded, setCoverLoaded] = useState(false)
  const [failedImages, setFailedImages] = useState([])
  const [videoFailed, setVideoFailed] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [imageIndex, setImageIndex] = useState(0)
  const videoRef = React.useRef(null)

  const rawImages = Array.isArray(item?.images)
    ? item.images.filter((src) => typeof src === 'string' && src.trim() !== '')
    : []
  // 加载失败的图从图集里摘掉，而不是让卡片留一个破图位
  const images = rawImages.filter((src) => !failedImages.includes(src))
  const isCarousel = images.length > 1
  const rawCover = typeof item?.cover === 'string' ? item.cover.trim() : ''
  // 多图卡片一律以图集为准：封面字段只可能指向其中一张，拿它当基准会和翻图错位
  const cover = isCarousel ? images[0] : (rawCover || images[0] || '')
  const coverBroken = Boolean(cover) && failedImages.includes(cover) && !isCarousel
  const videoUrl = typeof item?.videoUrl === 'string' ? item.videoUrl.trim() : ''

  const activeIndex = isCarousel ? ((imageIndex % images.length) + images.length) % images.length : 0

  // 换卡片时把翻图游标与加载态复位：否则下一张卡会承接上一张的图位
  React.useEffect(() => {
    setImageIndex(0)
    setCoverLoaded(false)
    setVideoFailed(false)
  }, [item?.id])

  // 多图卡片「翻图优先」：同一张卡上翻图与播片互斥，避免两种动作抢同一块画面
  const canPlayVideo = Boolean(videoUrl && !isCarousel && !videoFailed && isHovered)

  React.useEffect(() => {
    if (!canPlayVideo) {
      if (isPlaying) {
        setIsPlaying(false)
        onPlaybackChange?.(false)
      }
      if (videoRef.current) {
        try {
          videoRef.current.pause()
          videoRef.current.currentTime = 0
        } catch {}
      }
      return
    }

    const videoEl = videoRef.current
    if (videoEl) {
      try {
        videoEl.currentTime = 0
        const playPromise = videoEl.play()
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            // 安全捕获：在测试环境或特定浏览器静音播放策略异常时平滑降级
          })
        }
      } catch {}
    }
  }, [canPlayVideo, isPlaying, onPlaybackChange])

  const handleVideoPlaying = () => {
    setIsPlaying(true)
    onPlaybackChange?.(true)
  }

  const handleVideoError = () => {
    setVideoFailed(true)
    setIsPlaying(false)
    onPlaybackChange?.(false)
  }

  const handleImageError = (src) => {
    if (!src) return
    setFailedImages((prev) => (prev.includes(src) ? prev : [...prev, src]))
  }

  const goPrev = () => setImageIndex((index) => (isCarousel ? (index - 1 + images.length) % images.length : 0))
  const goNext = () => setImageIndex((index) => (isCarousel ? (index + 1) % images.length : 0))

  /** 卡内翻图按钮绝不能连带触发卡片自身的点击/选择语义。 */
  const isolateControl = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const renderBackground = () => {
    // 多图卡片：整组图叠放，靠透明度切换。旧图在新图未绘出前仍然可见，
    // 因此翻图是平滑交叉淡入，不会先黑一下再出图。
    if (isCarousel) {
      return images.map((src, index) => (
        <img
          key={`${src}#${index}`}
          className={`omnimux-trending-cover-img is-carousel-layer${index === activeIndex ? ' is-loaded' : ''}`}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          aria-hidden="true"
          onError={() => handleImageError(src)}
        />
      ))
    }

    if (cover && !coverBroken) {
      return (
        <img
          className={`omnimux-trending-cover-img${coverLoaded ? ' is-loaded' : ''}`}
          src={cover}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          aria-hidden="true"
          onLoad={() => setCoverLoaded(true)}
          onError={() => handleImageError(cover)}
        />
      )
    }

    const archetype = ARCHETYPE_SET.has(item?.archetype) ? item.archetype : 'product-hero'
    const Scene = SCENE_MAP[archetype]
    return (
      <svg
        className="omnimux-trending-cover-svg"
        data-archetype={archetype}
        data-accent={accentIndex(item?.id)}
        viewBox="0 0 90 160"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        <Scene />
      </svg>
    )
  }

  return (
    <>
      {renderBackground()}
      {canPlayVideo ? (
        <video
          ref={videoRef}
          className={`omnimux-trending-cover-video${isPlaying ? ' is-playing' : ''}`}
          src={videoUrl}
          muted
          playsInline
          loop
          autoPlay
          preload="metadata"
          onPlaying={handleVideoPlaying}
          onError={handleVideoError}
          aria-hidden="true"
          data-testid="trending-card-video"
        />
      ) : null}

      {isCarousel ? (
        <>
          <button /* exempt-ui01: session-guide 子树不引入 UI Kit，使用等效原生卡片动作按钮 */
            type="button"
            className="omnimux-trending-card-carousel-nav is-prev"
            aria-label={t?.('trending.carousel.prev') || '上一张'}
            onClick={(e) => {
              isolateControl(e)
              goPrev()
            }}
            onMouseDown={isolateControl}
            onPointerDown={isolateControl}
          >
            {ICON_CAROUSEL_PREV}
          </button>

          <button /* exempt-ui01: session-guide 子树不引入 UI Kit，使用等效原生卡片动作按钮 */
            type="button"
            className="omnimux-trending-card-carousel-nav is-next"
            aria-label={t?.('trending.carousel.next') || '下一张'}
            onClick={(e) => {
              isolateControl(e)
              goNext()
            }}
            onMouseDown={isolateControl}
            onPointerDown={isolateControl}
          >
            {ICON_CAROUSEL_NEXT}
          </button>

          <span className="omnimux-trending-card-carousel-dots" aria-hidden="true">
            {images.map((src, index) => (
              <span
                key={`dot-${src}#${index}`}
                className={`omnimux-trending-carousel-dot${index === activeIndex ? ' is-active' : ''}`}
              />
            ))}
          </span>
        </>
      ) : null}
    </>
  )
})
