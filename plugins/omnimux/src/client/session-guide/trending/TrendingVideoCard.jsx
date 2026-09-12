import React from 'react'
import { TrendingCover } from './TrendingCover.jsx'
import { formatCompactCurrency, formatCompactNumber } from './trending-data.js'

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
 *   营收/播放量双指标 → 两行文案 → Hover 上移并浮出 Recreate。
 *
 * @param {{
 *   item: object,
 *   t: (key: string, fallback?: string) => string,
 *   onRecreate: (item: object) => void,
 *   busy?: boolean,
 * }} props
 */
export function TrendingVideoCard({ item, t, onRecreate, busy = false }) {
  if (!item) return null

  const region = String(item.region || '').toUpperCase()
  const title = String(item.title || '')

  return (
    <article
      className="omx-trending-card"
      data-trending-id={item.id}
      aria-label={title}
    >
      <div className="omx-trending-card-media">
        <TrendingCover item={item} />
      </div>

      <div className="omx-trending-card-topshade" aria-hidden="true" />

      {region ? (
        <span className="omx-trending-card-region">{region}</span>
      ) : null}

      <div className="omx-trending-card-shade" aria-hidden="true" />

      <div className="omx-trending-card-body">
        <div className="omx-trending-card-metrics">
          <div className="omx-trending-card-metric">
            <p className="omx-trending-card-metric-value">{formatCompactCurrency(item.revenue)}</p>
            <span className="omx-trending-card-metric-label">{t('trending.metric.revenue')}</span>
          </div>
          <div className="omx-trending-card-metric is-divider">
            <p className="omx-trending-card-metric-value">{formatCompactNumber(item.views)}</p>
            <span className="omx-trending-card-metric-label">{t('trending.metric.views')}</span>
          </div>
        </div>
        <p className="omx-trending-card-title">{title}</p>

        <div className="omx-trending-card-action">
          <button /* exempt-ui01: session-guide 子树不引入 UI Kit，使用等效原生卡片动作按钮 */
            type="button"
            className="omx-trending-recreate-btn"
            aria-label={t('trending.card.recreate')}
            disabled={busy}
            onClick={() => onRecreate?.(item)}
          >
            <span className="omx-trending-recreate-icon" aria-hidden="true">{ICON_REPLICATE}</span>
            <span>{t('trending.card.recreate')}</span>
          </button>
        </div>
      </div>
    </article>
  )
}
