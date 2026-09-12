import React, { useState } from 'react'
import { resolveSkillTitle, resolveSkillSummary } from './featured-skills-data.js'

const ICON_SPARKLES = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="13" height="13">
    <path d="M12 2l2.4 5.4 5.6.8-4 4 1 5.8-5-2.8-5 2.8 1-5.8-4-4 5.6-.8L12 2z" />
  </svg>
)

const ICON_VERIFIED = (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" width="12" height="12" className="omnimux-skill-verified-icon">
    <path fillRule="evenodd" d="M8 0c4.418 0 8 3.582 8 8s-3.582 8-8 8-8-3.582-8-8 3.582-8 8-8zm3.707 5.293a1 1 0 00-1.414 0L7 8.586 5.707 7.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4a1 1 0 000-1.414z" clipRule="evenodd" />
  </svg>
)

function resolveSkillCover(cover) {
  if (!cover || typeof cover !== 'string') return ''
  const trimmed = cover.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed
  }
  return `/omnimux-market/icon?url=${encodeURIComponent(trimmed)}`
}

/**
 * 精选技能卡片（对标图 4 高质感设计）：
 * 16:9 画幅封面、左上角紫色渐变角标、hover「使用 Skill」胶囊按钮、加粗标题、两行描述与官方认证署名底行。
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
  const [imgBroken, setImgBroken] = useState(false)
  if (!skill) return null

  const title = resolveSkillTitle(skill, t)
  const summary = resolveSkillSummary(skill, t)
  const displaySummary = summary.replace(/^用途[：:]\s*|^Purpose[：:]\s*/i, '')
  const coverUrl = resolveSkillCover(skill.cover)
  const badge = skill.badge || 'H3'
  const attribution = skill.attribution || '@MiniMax Design官方'

  return (
    <article
      className={`omnimux-skill-card${active ? ' is-active' : ''}`}
      data-skill-id={skill.id}
      data-skill-active={active ? 'true' : 'false'}
      aria-label={title}
      onClick={() => onSelect?.(skill)}
    >
      <div className="omnimux-skill-card-cover-wrapper">
        {coverUrl && !imgBroken ? (
          <img
            src={coverUrl}
            alt={title}
            className="omnimux-skill-card-cover-img"
            loading="lazy"
            onError={() => setImgBroken(true)}
          />
        ) : (
          <div className="omnimux-skill-card-cover-fallback">
            <span>{title.slice(0, 2) || 'SK'}</span>
          </div>
        )}

        {badge ? (
          <span className="omnimux-skill-card-badge" aria-label={badge}>
            {badge}
          </span>
        ) : null}

        <div className="omnimux-skill-card-cover-hover">
          <button /* exempt-ui01: session-guide 原生卡片动作按钮 */
            type="button"
            className="omnimux-skill-card-btn"
            aria-label={`${t('skills.card.use', '使用 Skill')}：${title}`}
            aria-pressed={active ? 'true' : 'false'}
            onClick={(e) => {
              e.stopPropagation()
              onSelect?.(skill)
            }}
          >
            <span className="omnimux-skill-card-btn-icon" aria-hidden="true">{ICON_SPARKLES}</span>
            <span>{t('skills.card.use', '使用 Skill')}</span>
          </button>
        </div>
      </div>

      <div className="omnimux-skill-card-content">
        <div className="omnimux-skill-card-header">
          <h3 className="omnimux-skill-card-title" title={title}>{title}</h3>
        </div>
        <p className="omnimux-skill-card-summary" title={displaySummary}>{displaySummary}</p>
        <div className="omnimux-skill-card-attribution">
          <span className="omnimux-skill-card-author">{attribution}</span>
          {ICON_VERIFIED}
        </div>
      </div>
    </article>
  )
}
