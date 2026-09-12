import React from 'react'
import { TrendingSelect } from './TrendingSelect.jsx'
import {
  TRENDING_ENGAGEMENT_BUCKETS,
  TRENDING_RANGES,
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

/** 参与「是否已筛选」判定的维度键；这些维度在册才可能出现非空值。 */
const FILTER_KEYS = ['region', 'industry', 'views', 'engagement', 'range']

/**
 * 爆款对标筛选工具栏。
 *
 * **只渲染数据支持的维度**：`dimensions` 来自真实数据推导（灵感库行里没有
 * 类目就绝不出现类目下拉）。地区与类目的档位同样由数据推导——库里只有 US
 * 就不该能选到 GB。这样工具栏永远不会出现「控件能点、数据不变」的假控件。
 *
 * @param {{
 *   filters: object,
 *   t: (key: string, fallback?: string) => string,
 *   onChange: (patch: object) => void,
 *   onReset: () => void,
 *   dimensions: { region?: boolean, industry?: boolean, views?: boolean, engagement?: boolean, range?: boolean },
 *   regionOptions: Array<object>,
 *   industryOptions: Array<object>,
 *   viewOptions: Array<object>,
 * }} props
 */
export function TrendingFilterBar({
  filters,
  t,
  onChange,
  onReset,
  dimensions = {},
  regionOptions = [],
  industryOptions = [],
  viewOptions = [],
}) {
  const set = (key) => (value) => onChange?.({ [key]: value })

  const isFiltered = FILTER_KEYS.some((key) => Boolean(filters?.[key]))

  return (
    <div className="omnimux-trending-toolbar" role="group" aria-label={t('trending.filters.label')}>
      <div className="omnimux-trending-toolbar-left">
        {dimensions.region ? (
          <TrendingSelect
            value={filters.region}
            ariaLabel={t('trending.filter.region')}
            onChange={set('region')}
            className="omnimux-trending-select-field"
            placeholder={t('trending.region.all')}
            options={toOptions(regionOptions, t)}
          />
        ) : null}

        {dimensions.industry ? (
          <TrendingSelect
            value={filters.industry}
            ariaLabel={t('trending.filter.industry')}
            onChange={set('industry')}
            className="omnimux-trending-select-field"
            placeholder={t('trending.industry.all')}
            options={toOptions(industryOptions, t)}
          />
        ) : null}

        {dimensions.views ? (
          <TrendingSelect
            value={filters.views}
            ariaLabel={t('trending.filter.views')}
            onChange={set('views')}
            className="omnimux-trending-select-field"
            placeholder={t('trending.views.all')}
            options={toOptions(viewOptions, t)}
          />
        ) : null}

        {dimensions.engagement ? (
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
        ) : null}

        {dimensions.range ? (
          <span className="omnimux-trending-range">
            <span className="omnimux-trending-range-icon" aria-hidden="true">{ICON_CALENDAR}</span>
            <TrendingSelect
              value={filters.range}
              ariaLabel={t('trending.filter.range')}
              onChange={set('range')}
              className="omnimux-trending-select-field"
              options={toOptions(TRENDING_RANGES, t)}
            />
            <InfoMark label={t('trending.info.range')} />
          </span>
        ) : null}

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
