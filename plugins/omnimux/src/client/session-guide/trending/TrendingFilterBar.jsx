import React from 'react'
import { TrendingSelect } from './TrendingSelect.jsx'
import {
  TRENDING_ENGAGEMENT_BUCKETS,
  TRENDING_INDUSTRIES,
  TRENDING_RANGES,
  TRENDING_REGIONS,
  TRENDING_SORTS,
  TRENDING_VIEW_BUCKETS,
} from './trending-data.js'

const ICON_CALENDAR = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
)

const ICON_INFO = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-5M12 8h.01" />
  </svg>
)

/**
 * 档位条目 → 选择器选项。
 * @param {Array<{value: string, label?: string, labelKey?: string}>} buckets
 * @param {(key: string) => string} t
 */
function toOptions(buckets, t) {
  return buckets.map((bucket) => ({
    value: bucket.value,
    label: bucket.labelKey ? t(bucket.labelKey) : bucket.label,
  }))
}

function InfoMark({ label }) {
  return (
    <span className="omnimux-trending-info-mark" title={label} aria-label={label} role="img">
      {ICON_INFO}
    </span>
  )
}

/**
 * 爆款对标筛选工具栏。
 *
 * 对齐 TopView 实测的工具栏结构与右对齐排序，但只保留有数据源的维度：
 * 地区 / 行业 / 播放量 / 互动率 / 时间窗 + Sort（预估营收与 ROAS 已随 v2 下线）。
 *
 * @param {{
 *   filters: object,
 *   t: (key: string, fallback?: string) => string,
 *   onChange: (patch: object) => void,
 *   onReset: () => void,
 * }} props
 */
export function TrendingFilterBar({ filters, t, onChange, onReset }) {
  const set = (key) => (value) => onChange?.({ [key]: value })

  const isFiltered = Boolean(
    filters.region
    || filters.industry
    || filters.views
    || filters.engagement
  )

  return (
    <div className="omnimux-trending-toolbar" role="group" aria-label={t('trending.filters.label')}>
      <div className="omnimux-trending-toolbar-left">
        <TrendingSelect
          value={filters.region}
          ariaLabel={t('trending.filter.region')}
          onChange={set('region')}
          className="omnimux-trending-select-field"
          placeholder={t('trending.region.all')}
          options={toOptions(TRENDING_REGIONS, t)}
        />

        <TrendingSelect
          value={filters.industry}
          ariaLabel={t('trending.filter.industry')}
          onChange={set('industry')}
          className="omnimux-trending-select-field"
          placeholder={t('trending.industry.all')}
          options={toOptions(TRENDING_INDUSTRIES, t)}
        />

        <TrendingSelect
          value={filters.views}
          ariaLabel={t('trending.filter.views')}
          onChange={set('views')}
          className="omnimux-trending-select-field"
          placeholder={t('trending.views.all')}
          options={toOptions(TRENDING_VIEW_BUCKETS, t)}
        />

        <span className="omnimux-trending-select-with-info">
          <TrendingSelect
            value={filters.engagement}
            ariaLabel={t('trending.filter.engagement')}
            onChange={set('engagement')}
            className="omnimux-trending-select-field"
            placeholder={t('trending.engagement.all')}
            options={toOptions(TRENDING_ENGAGEMENT_BUCKETS, t)}
          />
          <InfoMark label={t('trending.info.engagement')} />
        </span>

        <span className="omnimux-trending-range">
          <span className="omnimux-trending-range-icon" aria-hidden="true">{ICON_CALENDAR}</span>
          <TrendingSelect
            value={filters.range}
            ariaLabel={t('trending.filter.range')}
            onChange={set('range')}
            className="omnimux-trending-select-field"
            options={toOptions(TRENDING_RANGES, t)}
          />
        </span>

        {isFiltered ? (
          <button /* exempt-ui01: 筛选复位属于轻量文本动作，非标准控件位 */
            type="button"
            className="omnimux-trending-reset"
            onClick={onReset}
          >
            {t('trending.filter.reset')}
          </button>
        ) : null}
      </div>

      <div className="omnimux-trending-toolbar-right">
        <TrendingSelect
          value={filters.sort}
          ariaLabel={t('trending.filter.sort')}
          onChange={set('sort')}
          align="end"
          className="omnimux-trending-select-field"
          options={toOptions(TRENDING_SORTS, t)}
        />
      </div>
    </div>
  )
}
