import React from 'react'

const ICON_LIGHTNING = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
)

/**
 * 精选技能卡片。
 * 点击触发预填并根据滚动位置吸底或留在行内。
 *
 * @param {{
 *   skill: object,
 *   t: (key: string, fallback?: string) => string,
 *   onSelect: (skill: object) => void,
 *   active?: boolean,
 *   categoryTitle?: string,
 * }} props
 */
export function SkillCard({ skill, t, onSelect, active = false, categoryTitle = '' }) {
  if (!skill) return null

  const title = String(skill.title || '').trim()
  const summary = String(skill.summary || '').trim()
  const displaySummary = summary.replace(/^用途[：:]\s*/, '')

  return (
    <article
      className={`omnimux-skill-card${active ? ' is-active' : ''}`}
      data-skill-id={skill.id}
      data-skill-active={active ? 'true' : 'false'}
      aria-label={title}
    >
      <div className="omnimux-skill-card-body">
        <div className="omnimux-skill-card-header">
          {categoryTitle ? (
            <span className="omnimux-skill-card-category">{categoryTitle}</span>
          ) : null}
          <h3 className="omnimux-skill-card-title" title={title}>{title}</h3>
        </div>
        <p className="omnimux-skill-card-summary" title={displaySummary}>{displaySummary}</p>
        <div className="omnimux-skill-card-footer">
          <button /* exempt-ui01: session-guide 原生卡片动作按钮 */
            type="button"
            className="omnimux-skill-card-btn"
            aria-label={`${t('skills.card.use')}：${title}`}
            aria-pressed={active ? 'true' : 'false'}
            onClick={() => onSelect?.(skill)}
          >
            <span className="omnimux-skill-card-btn-icon" aria-hidden="true">{ICON_LIGHTNING}</span>
            <span>{t('skills.card.use')}</span>
          </button>
        </div>
      </div>
    </article>
  )
}
