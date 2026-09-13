import React from 'react'
import { TrendingCover } from './TrendingCover.jsx'
import { formatCompactNumber, formatEngagementPercent } from './trending-data.js'

const ICON_REPLICATE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)

/**
 * 爆款对标视频卡片。
 *
 * 1:1 对齐 TopView 实测结构：
 *   9:16 深色底 → 顶部地区胶囊 → 底部 48% 渐变遮罩 →
 *   互动率/播放量双指标 → 两行文案 → Hover 上移并浮出 Recreate。
 *
 * 封面用灵感库真实封面图（在 TrendingCover 内渲染），图缺失或加载失败才退回矢量兜底，
 * 不让卡片出现破图。
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

  const region = String(item.region || '').toUpperCase()
  const title = String(item.title || '')
  // 读数缺失显示 `—`，不显示 0：未知和「真的是 0」必须能分辨
  const views = typeof item.views === 'number' && Number.isFinite(item.views) ? item.views : null
  const engagement = typeof item.engagement === 'number' && Number.isFinite(item.engagement) ? item.engagement : null
  const UNKNOWN = '—'

  return (
    <article
      className={`omnimux-trending-card${active ? ' is-active' : ''}`}
      data-trending-id={item.id}
      data-trending-active={active ? 'true' : 'false'}
      aria-label={title}
    >
      <div className="omnimux-trending-card-media">
        <TrendingCover item={item} />
      </div>

      <div className="omnimux-trending-card-topshade" aria-hidden="true" />

      {region ? (
        <span className="omnimux-trending-card-region">{region}</span>
      ) : null}

      <div className="omnimux-trending-card-shade" aria-hidden="true" />

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

        <div className="omnimux-trending-card-action">
          <button /* exempt-ui01: session-guide 子树不引入 UI Kit，使用等效原生卡片动作按钮 */
            type="button"
            className="omnimux-trending-recreate-btn"
            aria-label={`${t('trending.card.recreate')}：${title}`}
            aria-pressed={active ? 'true' : 'false'}
            onClick={() => onRecreate?.(item)}
          >
            <span className="omnimux-trending-recreate-icon" aria-hidden="true">{ICON_REPLICATE}</span>
            <span>{t('trending.card.recreate')}</span>
          </button>
        </div>
      </div>
    </article>
  )
})
