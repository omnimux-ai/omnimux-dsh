import React, { useCallback, useMemo, useState } from 'react'
import snapshot from './featured-skills.json'
import { SkillCard } from './SkillCard.jsx'
import { filterSkillsByCategory } from './featured-skills-data.js'

/**
 * Skill 面板：分类胶囊导航 + 精选技能卡片网格。
 *
 * 胶囊栏与卡片网格**可以分别挂载**（`chipsOnly` / `hideChips`）。板块把胶囊栏
 * 搬进吸顶栏、网格留在流内时，两边仍是同一个控件，因此分类选中态必须**受控**：
 * 一边自己存一份 state，就会出现「点了胶囊栏、下面网格不动」的哑控件。
 *
 * @param {{
 *   t: (key: string, fallback?: string) => string,
 *   onSelectSkill: (skill: object) => void,
 *   activeSkillId?: string | null,
 *   selectedCategory?: string,
 *   onSelectCategory?: (categoryId: string) => void,
 *   chipsOnly?: boolean,
 *   hideChips?: boolean,
 * }} props
 */
export function SkillsPanel({
  t,
  onSelectSkill,
  activeSkillId = null,
  selectedCategory,
  onSelectCategory,
  chipsOnly = false,
  hideChips = false,
}) {
  // 非受控回退：单独使用本面板时沿用内部 state，调用方不必被迫接管分类状态
  const [internalCategory, setInternalCategory] = useState('')
  const isControlled = typeof selectedCategory === 'string'
  const category = isControlled ? selectedCategory : internalCategory

  const selectCategory = useCallback((next) => {
    if (!isControlled) setInternalCategory(next)
    onSelectCategory?.(next)
  }, [isControlled, onSelectCategory])

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
    return filterSkillsByCategory(allSkills, category)
  }, [allSkills, category])

  const chipsBar = (
    <div className="omnimux-skills-chips-bar" role="group" aria-label={t('skills.chips.label')}>
      <button /* exempt-ui01: session-guide 胶囊分类切换按钮 */
        type="button"
        className={`omnimux-skills-chip${category === '' ? ' is-active' : ''}`}
        aria-pressed={category === ''}
        onClick={() => selectCategory('')}
      >
        {t('skills.category.all')}
      </button>
      {categories.map((cat) => (
        <button /* exempt-ui01: session-guide 胶囊分类切换按钮 */
          key={cat.id}
          type="button"
          className={`omnimux-skills-chip${category === cat.id ? ' is-active' : ''}`}
          aria-pressed={category === cat.id}
          onClick={() => selectCategory(cat.id)}
        >
          {t(`skills.category.${cat.id}`, cat.title)}
        </button>
      ))}
    </div>
  )

  // 只挂胶囊栏的形态：吸顶栏里只有一行控件，不重复渲染卡片网格
  if (chipsOnly) return chipsBar

  return (
    <div className="omnimux-skills-panel" data-omnimux-skills-panel="">
      {hideChips ? null : chipsBar}

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
