// 左栏设定面板：档位块 + 每个分类一个可折叠块。
// 与源工作台 builder-panel.tsx 1:1：分类顺序按 category_priority（未登记 → 99），
// 当前档位下没有可见选项的分类整块不渲染。

import { OptionCard } from './OptionCard.jsx'

/** 档位 id → 词条键；未登记档位直接显示 id 原文。 */
const TIER_KEYS = {
  normal: 'tier.normal',
  freak: 'tier.freak',
  total: 'tier.total',
}

/** 折叠箭头：矢量 SVG，不用 ▾ 字符。 */
function ChevronIcon() {
  return (
    <svg
      className="omx-avatar-chev"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** @param {string} tier @param {(k: string) => string} t */
function tierLabel(tier, t) {
  const key = TIER_KEYS[tier]
  return key ? t(key) : tier
}

/**
 * @param {{
 *   taxonomy: object,
 *   tier: string,
 *   selection: Record<string, string[]>,
 *   openGroups: Set<string>,
 *   onTier: (tier: string) => void,
 *   onPick: (categoryId: string, optionId: string) => void,
 *   onToggleGroup: (categoryId: string) => void,
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 *   visOpts: (category: object, tier: string) => object[],
 * }} props
 */
export function BuilderPanel(props) {
  const { taxonomy, tier, selection, openGroups, onTier, onPick, onToggleGroup, t } = props
  const visOpts = props.visOpts
  const priority = Array.isArray(taxonomy?.category_priority)
    ? taxonomy.category_priority
    : []
  const ordered = [...(taxonomy?.categories ?? [])].sort((a, b) => {
    const pa = priority.indexOf(a.id)
    const pb = priority.indexOf(b.id)
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb)
  })

  return (
    <div className="omx-avatar-builder">
      {/* 1. 档位块 */}
      <div className="omx-avatar-block">
        <div className="omx-avatar-block-head">
          <span className="omx-avatar-block-title">{t('tier.title')}</span>
          <span className="omx-avatar-block-meta">{tierLabel(tier, t)}</span>
        </div>
        <div className="omx-avatar-block-body">
          <div className="omx-avatar-grid">
            {(taxonomy?.tier_group?.options ?? []).map((option) => (
              <OptionCard
                key={option.id}
                kind="media"
                option={option}
                selected={tier === option.id}
                onClick={() => onTier(option.id)}
                t={t}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 2. 各分类块 */}
      {ordered.map((category) => {
        const options = visOpts(category, tier)
        if (!options.length) return null
        const picked = (selection?.[category.id] ?? []).length
        const open = openGroups?.has(category.id) === true
        return (
          <div key={category.id} className="omx-avatar-block">
            <button type="button" /* exempt-ui01: 折叠标题是自定义行控件，非 kit 组件语义 */
              className="omx-avatar-group-head"
              aria-expanded={open}
              onClick={() => onToggleGroup(category.id)}
            >
              <span className="omx-avatar-block-title">{t(category.label_en)}</span>
              <span className="omx-avatar-block-meta">
                {t(category.label_en)} · {options.length}
                {picked > 0 ? ` · ${picked}` : ''}
              </span>
              <ChevronIcon />
            </button>
            {open ? (
              <div className="omx-avatar-block-body">
                <div className="omx-avatar-grid">
                  {options.map((option) => (
                    <OptionCard
                      key={option.id}
                      categoryId={category.id}
                      kind={category.kind}
                      option={option}
                      selected={(selection?.[category.id] ?? []).includes(option.id)}
                      onClick={() => onPick(category.id, option.id)}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
