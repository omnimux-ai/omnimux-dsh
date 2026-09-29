import React from 'react'
import { TrendingCover } from './TrendingCover.jsx'
import { TrendingDetailModal } from './TrendingDetailModal.jsx'
import { formatCompactNumber, formatEngagementPercent } from './trending-data.js'

const ICON_PLAY = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="#000000" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const ICON_EYE = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const ICON_REPLICATE = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)

/**
 * 爆款对标视频卡片。
 *
 * 交互升级（复刻灵感社区对标卡片）：
 * 1. 默认状态（图 1）：
 *    9:16 卡片、真实封面、顶部左侧地区胶囊、底部渐变遮罩 + 互动率/播放量双指标 + 标题。
 * 2. 悬停/激活交互（图 2）：
 *    - 居中浮现半透明白色圆形播放按钮（黑色三角播放图标）；
 *    - 右上角显示平台标签 Badge（如 TikTok 等）；
 *    - 底部浮现操作悬浮栏（Overlay）：
 *      - 左侧次要按钮：“详情”（眼睛图标 + 文字“详情”，深色半透明毛玻璃胶囊形态）；
 *      - 右侧主要按钮：“复刻”（复刻图标 + 文字“复刻”，白色高反差实心高亮反色胶囊形态）；
 *      - 最底部单行标题截断（白色字，带暗色渐变遮罩防止穿透）；
 * 3. 动作流转：
 *    - 点击“详情”（或点击卡片非“复刻”区域/居中播放按钮）：打开视频详情弹窗（TrendingDetailModal）；
 *    - 点击“复刻”：直接调用 onRecreate(item)，加入当前输入框。
 *
 * @param {{
 *   item: object,
 *   t: (key: string, fallback?: string) => string,
 *   onRecreate: (item: object) => void,
 *   active?: boolean,
 * }} props
 */
export const TrendingVideoCard = React.memo(function TrendingVideoCard({ item, t, onRecreate, active = false }) {
  if (!item) return null

  const [isHovered, setIsHovered] = React.useState(false)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [showDetail, setShowDetail] = React.useState(false)
  const hoverTimerRef = React.useRef(null)
  const cardRef = React.useRef(null)

  const region = String(item.region || '').toUpperCase()
  const platform = String(item.platform || item.source_platform || 'TikTok')
  const title = String(item.title || '')
  // 读数缺失显示 `—`，不显示 0：未知和「真的是 0」必须能分辨
  const views = typeof item.views === 'number' && Number.isFinite(item.views) ? item.views : null
  const engagement = typeof item.engagement === 'number' && Number.isFinite(item.engagement) ? item.engagement : null
  const UNKNOWN = '—'

  React.useEffect(() => {
    const el = cardRef.current
    if (!el) return

    const handleEnter = () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = setTimeout(() => {
        setIsHovered(true)
      }, 150)
    }

    const handleLeave = () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
      }
      setIsHovered(false)
      setIsPlaying(false)
    }

    el.addEventListener('pointerenter', handleEnter)
    el.addEventListener('pointerleave', handleLeave)
    el.addEventListener('mouseenter', handleEnter)
    el.addEventListener('mouseleave', handleLeave)

    return () => {
      el.removeEventListener('pointerenter', handleEnter)
      el.removeEventListener('pointerleave', handleLeave)
      el.removeEventListener('mouseenter', handleEnter)
      el.removeEventListener('mouseleave', handleLeave)
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    }
  }, [])

  const handleOpenDetail = (e) => {
    e?.stopPropagation?.()
    setShowDetail(true)
  }

  const handleCardClick = (e) => {
    // 若点击源来自“复刻”按钮本身，则不展开详情
    if (e.target.closest?.('.omnimux-trending-recreate-btn')) {
      return
    }
    // 其它任何区域点击展开详情弹窗
    handleOpenDetail(e)
  }

  return (
    <>
      <article
        ref={cardRef}
        className={`omnimux-trending-card${active ? ' is-active' : ''}${isPlaying ? ' is-playing' : ''}`}
        data-trending-id={item.id}
        data-trending-active={active ? 'true' : 'false'}
        data-trending-hover={isHovered ? 'true' : 'false'}
        data-trending-playing={isPlaying ? 'true' : 'false'}
        aria-label={title}
        onClick={handleCardClick}
      >
        <div className="omnimux-trending-card-media">
          <TrendingCover item={item} isHovered={isHovered} onPlaybackChange={setIsPlaying} t={t} />
        </div>

        <div className="omnimux-trending-card-topshade" aria-hidden="true" />

        {region ? (
          <span className="omnimux-trending-card-region">{region}</span>
        ) : null}

        {/* 悬停态展示右上角平台标签 Badge */}
        <span className="omnimux-trending-card-platform-badge" aria-label={`Platform: ${platform}`}>
          {platform}
        </span>

        {isPlaying ? (
          <span className="omnimux-trending-card-playing-indicator" aria-hidden="true" title="正在播放预览">
            <span className="omnimux-trending-playing-bar" />
            <span className="omnimux-trending-playing-bar is-tall" />
            <span className="omnimux-trending-playing-bar" />
          </span>
        ) : null}

        {/* 悬停态居中半透明白色圆形播放按钮（黑色三角播放图标） */}
        <button /* exempt-ui01: session-guide 子树卡片特化居中播放按钮 */
          type="button"
          className="omnimux-trending-card-center-play"
          aria-label={t('trending.card.play', '播放详情')}
          onClick={handleOpenDetail}
        >
          <span className="omnimux-trending-center-play-icon" aria-hidden="true">
            {ICON_PLAY}
          </span>
        </button>

        <div className="omnimux-trending-card-shade" aria-hidden="true" />

        {/* 默认底栏：双指标 + 标题 */}
        <div className="omnimux-trending-card-body">
          <div className="omnimux-trending-card-metrics">
            <div className="omnimux-trending-card-metric">
              <p className="omnimux-trending-card-metric-value">
                {engagement === null ? UNKNOWN : formatEngagementPercent(engagement)}
              </p>
              <span className="omnimux-trending-card-metric-label">{t('trending.metric.engagement')}</span>
            </div>
            <div className="omnimux-trending-card-metric is-divider">
              <p className="omnimux-trending-card-metric-value">
                {views === null || views <= 0 ? UNKNOWN : formatCompactNumber(views)}
              </p>
              <span className="omnimux-trending-card-metric-label">{t('trending.metric.views')}</span>
            </div>
          </div>
          <p className="omnimux-trending-card-title">{title}</p>
        </div>

        {/* 悬停操作浮层（Overlay）：左侧详情 + 右侧复刻 + 底部单行截断标题 */}
        <div className="omnimux-trending-card-overlay">
          <div className="omnimux-trending-card-overlay-actions">
            <button /* exempt-ui01: session-guide 子树卡片浮层详情次级按钮 */
              type="button"
              className="omnimux-trending-overlay-btn is-secondary omnimux-trending-detail-btn"
              aria-label={`${t('trending.card.detail', '详情')}：${title}`}
              onClick={handleOpenDetail}
            >
              <span className="omnimux-trending-btn-icon" aria-hidden="true">{ICON_EYE}</span>
              <span className="omnimux-trending-btn-label">{t('trending.card.detail', '详情')}</span>
            </button>
            <button /* exempt-ui01: session-guide 子树卡片浮层复刻主按钮 */
              type="button"
              className="omnimux-trending-overlay-btn is-primary omnimux-trending-recreate-btn"
              aria-label={`${t('trending.card.recreateNow', '复刻')}：${title}`}
              aria-pressed={active ? 'true' : 'false'}
              onClick={(e) => {
                e.stopPropagation()
                onRecreate?.(item)
              }}
            >
              <span className="omnimux-trending-btn-icon" aria-hidden="true">{ICON_REPLICATE}</span>
              <span className="omnimux-trending-btn-label">{t('trending.card.recreateNow', '复刻')}</span>
            </button>
          </div>
          <p className="omnimux-trending-card-overlay-title" title={title}>{title}</p>
        </div>
      </article>

      {/* 详情弹窗 */}
      <TrendingDetailModal
        item={item}
        open={showDetail}
        t={t}
        onClose={() => setShowDetail(false)}
        onRecreate={onRecreate}
      />
    </>
  )
})
