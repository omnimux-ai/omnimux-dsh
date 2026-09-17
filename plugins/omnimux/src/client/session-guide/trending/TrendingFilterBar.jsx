import React from 'react'
import { TrendingSelect } from './TrendingSelect.jsx'
import {
  TRENDING_ENGAGEMENT_BUCKETS,
  TRENDING_RANGES,
  TRENDING_SORTS,
  TRENDING_VIEW_BUCKETS,
} from './trending-data.js'
import { formatRegionLabel, formatIndustryLabel } from './trending-i18n.js'

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

const ICON_VIEW_GRID = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </svg>
)

const ICON_VIEW_CAROUSEL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="7" y="3" width="10" height="18" rx="2" />
    <path d="M3 6v12" />
    <path d="M21 6v12" />
  </svg>
)

/**
 * 档位条目 → 选择器选项。
 * @param {Array<{value: string, label?: string, labelKey?: string}>} buckets
 * @param {(key: string) => string} t
 * @param {'region' | 'industry' | 'views' | 'engagement' | 'range' | 'sort'} [dimension]
 */
function toOptions(buckets, t, dimension) {
  return buckets.map((bucket) => {
    let label = bucket.labelKey ? t(bucket.labelKey) : bucket.label
    if (dimension === 'region' && bucket.value) {
      label = formatRegionLabel(bucket.value, t)
    } else if (dimension === 'industry' && bucket.value) {
      label = formatIndustryLabel(bucket.value, t)
    }
    return {
      value: bucket.value,
      label,
    }
  })
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
export const TrendingFilterBar = React.memo(function TrendingFilterBar({
  filters,
  t,
  onChange,
  onReset,
  dimensions = {},
  regionOptions = [],
  industryOptions = [],
  viewOptions = [],
  layoutMode = 'grid',
  onLayoutModeChange,
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
            placeholder={t('trending.filter.region')}
            options={toOptions(regionOptions, t, 'region')}
          />
        ) : null}

        {dimensions.industry ? (
          <TrendingSelect
            value={filters.industry}
            ariaLabel={t('trending.filter.industry')}
            onChange={set('industry')}
            className="omnimux-trending-select-field"
            placeholder={t('trending.filter.industry')}
            options={toOptions(industryOptions, t, 'industry')}
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

        <div className="omnimux-trending-view-switch" role="group" aria-label={t('trending.layout.switch') || '浏览格式'}>
          <button /* exempt-ui01: session-guide 子树不引入 UI Kit，使用等效原生卡片动作按钮 */
            type="button"
            className={`omnimux-trending-view-btn${layoutMode === 'grid' ? ' is-active' : ''}`}
            aria-label={t('trending.layout.grid') || '网格视图'}
            title={t('trending.layout.grid') || '网格视图'}
            aria-pressed={layoutMode === 'grid' ? 'true' : 'false'}
            onClick={() => onLayoutModeChange?.('grid')}
          >
            {ICON_VIEW_GRID}
          </button>
          <button /* exempt-ui01: session-guide 子树不引入 UI Kit，使用等效原生卡片动作按钮 */
            type="button"
            className={`omnimux-trending-view-btn${layoutMode === 'carousel' ? ' is-active' : ''}`}
            aria-label={t('trending.layout.carousel') || '轮播视图'}
            title={t('trending.layout.carousel') || '轮播视图'}
            aria-pressed={layoutMode === 'carousel' ? 'true' : 'false'}
            onClick={() => onLayoutModeChange?.('carousel')}
          >
            {ICON_VIEW_CAROUSEL}
          </button>
        </div>
      </div>
    </div>
  )
})
