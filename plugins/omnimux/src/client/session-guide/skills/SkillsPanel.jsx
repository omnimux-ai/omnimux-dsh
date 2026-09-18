import React, { useCallback, useMemo, useState } from 'react'
import snapshot from './featured-skills.json'
import { SkillCard } from './SkillCard.jsx'
import { filterSkillsByCategory } from './featured-skills-data.js'

// 分类矢量图标
function CategoryTabIcon({ id }) {
  const cat = String(id || '').toLowerCase()
  if (cat.includes('ugc')) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    )
  }
  if (cat.includes('story') || cat.includes('script')) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    )
  }
  if (cat.includes('image') || cat.includes('static')) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    )
  }
  if (cat.includes('video')) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    )
  }
  if (cat.includes('product')) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    )
  }
  if (cat.includes('meme')) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    )
  }
  return null
}

/**
 * Skill 面板：分类胶囊导航 + 热门精选置顶 + 新品上市置顶 + 探索更多卡片网格。
 * 1:1 对标 Creatify 官方首页结构。
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

  const isAllCategory = !category || category === '' || category === 'all'

  // 分组数据：热门精选 (isHot)、新品上市 (isNew)、探索更多 (其余)
  const { hotPicks, newArrivals, exploreMore, filteredSkills } = useMemo(() => {
    if (isAllCategory) {
      return {
        hotPicks: allSkills.filter(s => s.isHot),
        newArrivals: allSkills.filter(s => s.isNew),
        exploreMore: allSkills.filter(s => !s.isHot && !s.isNew),
        filteredSkills: allSkills
      }
    }
    const filtered = filterSkillsByCategory(allSkills, category)
    return {
      hotPicks: [],
      newArrivals: [],
      exploreMore: [],
      filteredSkills: filtered
    }
  }, [allSkills, category, isAllCategory])

  const chipsBar = (
    <div className="omnimux-skills-chips-bar" role="group" aria-label={t('skills.chips.label')}>
      <button /* exempt-ui01: 全部胶囊 */
        type="button"
        className={`omnimux-skills-chip${isAllCategory ? ' is-active' : ''}`}
        aria-pressed={isAllCategory}
        onClick={() => selectCategory('')}
      >
        {t('skills.category.all', '全部')}
      </button>
      {categories.map((cat) => (
        <button /* exempt-ui01: 细分类胶囊 */
          key={cat.id}
          type="button"
          className={`omnimux-skills-chip${category === cat.id ? ' is-active' : ''}`}
          aria-pressed={category === cat.id}
          onClick={() => selectCategory(cat.id)}
        >
          <CategoryTabIcon id={cat.id} />
          <span>{t(`skills.category.${cat.id}`, cat.title)}</span>
        </button>
      ))}
    </div>
  )

  if (chipsOnly) return chipsBar

  return (
    <div className="omnimux-skills-panel" data-omnimux-skills-panel="">
      {hideChips ? null : chipsBar}

      {isAllCategory ? (
        <div className="omnimux-creatify-sections-wrap">
          {/* 1. 热门精选 (置顶首屏) */}
          {hotPicks.length > 0 ? (
            <section className="omnimux-creatify-section" aria-label="热门精选">
              <div className="omnimux-creatify-section-header">
                <span className="omnimux-creatify-section-title">
                  {t('skills.section.hotPicks', '热门精选')}
                </span>
              </div>
              <div className="omnimux-skills-grid">
                {hotPicks.map((skill, idx) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    index={idx}
                    categoryTitle={categoryMap.get(skill.category) || ''}
                    t={t}
                    active={activeSkillId === skill.id}
                    onSelect={onSelectSkill}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* 2. 新品上市 (置顶次屏) */}
          {newArrivals.length > 0 ? (
            <section className="omnimux-creatify-section" aria-label="新品上市">
              <div className="omnimux-creatify-section-header">
                <span className="omnimux-creatify-section-title">
                  {t('skills.section.newArrivals', '新品上市')}
                </span>
                <button /* exempt-ui01: 查看全部 */
                  type="button"
                  className="omnimux-creatify-see-all-btn"
                  onClick={() => selectCategory('')}
                >
                  <span>{t('skills.section.seeAll', '查看全部')}</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
              <div className="omnimux-skills-grid">
                {newArrivals.map((skill, idx) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    index={idx + 3}
                    categoryTitle={categoryMap.get(skill.category) || ''}
                    t={t}
                    active={activeSkillId === skill.id}
                    onSelect={onSelectSkill}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* 3. 探索更多 */}
          {exploreMore.length > 0 ? (
            <section className="omnimux-creatify-section" aria-label="探索更多">
              <div className="omnimux-creatify-section-header">
                <span className="omnimux-creatify-section-title">
                  {t('skills.section.exploreMore', '探索更多')} ({exploreMore.length})
                </span>
              </div>
              <div className="omnimux-skills-grid">
                {exploreMore.map((skill, idx) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    index={idx + 9}
                    categoryTitle={categoryMap.get(skill.category) || ''}
                    t={t}
                    active={activeSkillId === skill.id}
                    onSelect={onSelectSkill}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        /* 单一分类网格 */
        filteredSkills.length > 0 ? (
          <div className="omnimux-skills-grid" style={{ marginTop: '16px' }}>
            {filteredSkills.map((skill, idx) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                index={idx}
                categoryTitle={categoryMap.get(skill.category) || ''}
                t={t}
                active={activeSkillId === skill.id}
                onSelect={onSelectSkill}
              />
            ))}
          </div>
        ) : (
          <div className="omnimux-trending-empty">
            <p>{t('skills.empty', '当前分类下暂无技能。')}</p>
          </div>
        )
      )}
    </div>
  )
}
