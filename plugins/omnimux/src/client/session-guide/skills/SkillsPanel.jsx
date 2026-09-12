import React, { useState, useMemo } from 'react'
import snapshot from './featured-skills.json'
import { SkillCard } from './SkillCard.jsx'
import { filterSkillsByCategory } from './featured-skills-data.js'

/**
 * Skill 面板：分类胶囊导航 + 精选技能卡片网格。
 *
 * @param {{
 *   t: (key: string, fallback?: string) => string,
 *   onSelectSkill: (skill: object) => void,
 *   activeSkillId?: string | null,
 * }} props
 */
export function SkillsPanel({ t, onSelectSkill, activeSkillId = null }) {
  const [selectedCategory, setSelectedCategory] = useState('')

  const categories = snapshot.categories || []
  const allSkills = snapshot.skills || []

  const categoryMap = useMemo(() => {
    const map = new Map()
    for (const c of categories) {
      map.set(c.id, t(`skills.category.${c.id}`, c.title))
    }
    return map
  }, [categories, t])

  const filteredSkills = useMemo(() => {
    return filterSkillsByCategory(allSkills, selectedCategory)
  }, [allSkills, selectedCategory])

  return (
    <div className="omnimux-skills-panel" data-omnimux-skills-panel="">
      {/* 分类胶囊栏（对齐图 1 样式） */}
      <div className="omnimux-skills-chips-bar" role="group" aria-label={t('skills.chips.label')}>
        <button /* exempt-ui01: session-guide 胶囊分类切换按钮 */
          type="button"
          className={`omnimux-skills-chip${selectedCategory === '' ? ' is-active' : ''}`}
          aria-pressed={selectedCategory === ''}
          onClick={() => setSelectedCategory('')}
        >
          {t('skills.category.all')}
        </button>
        {categories.map((cat) => (
          <button /* exempt-ui01: session-guide 胶囊分类切换按钮 */
            key={cat.id}
            type="button"
            className={`omnimux-skills-chip${selectedCategory === cat.id ? ' is-active' : ''}`}
            aria-pressed={selectedCategory === cat.id}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {t(`skills.category.${cat.id}`, cat.title)}
          </button>
        ))}
      </div>

      {filteredSkills.length > 0 ? (
        <div className="omnimux-skills-grid">
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              categoryTitle={categoryMap.get(skill.category) || ''}
              t={t}
              active={activeSkillId === skill.id}
              onSelect={onSelectSkill}
            />
          ))}
        </div>
      ) : (
        <div className="omnimux-trending-empty">
          <p>{t('skills.empty')}</p>
        </div>
      )}
    </div>
  )
}
