/**
 * 精选技能纯函数层：分类过滤、中英文双语适配、Prompt 组装。
 */

/**
 * 判断当前是否处于英文语言环境（跟随 DSH 运行时语言配置）。
 * @param {Function} [t]
 * @returns {boolean}
 */
export function isLocaleEn(t) {
  if (typeof t === 'function') {
    const loc = t('skills.locale') || t('locale') || t('guide.locale')
    if (loc === 'en') return true
    if (loc === 'zh') return false
    if (t('skills.card.use') === 'Use Skill' || t('skills.category.all') === 'Featured') return true
    if (t('skills.card.use') === '使用 Skill' || t('skills.category.all') === '精选') return false
  }
  if (typeof document !== 'undefined' && document.documentElement?.lang) {
    return document.documentElement.lang.toLowerCase().startsWith('en')
  }
  return false
}

/**
 * 解析技能显示名称，跟随 DSH 配置自适应中英文双语。
 * @param {object} skill
 * @param {Function} [t]
 * @returns {string}
 */
export function resolveSkillTitle(skill, t) {
  if (!skill || typeof skill !== 'object') return ''
  const slug = skill.skill || skill.slug || skill.id || ''
  if (typeof t === 'function') {
    const key = `skill.name.${slug}`
    const tr = t(key)
    if (tr && tr !== key) return String(tr).trim()
    if (skill.id) {
      const keyById = `skill.name.${skill.id}`
      const trById = t(keyById)
      if (trById && trById !== keyById) return String(trById).trim()
    }
  }

  const en = isLocaleEn(t)
  if (en) {
    return String(skill.titleEn || skill.nameEn || skill.title || slug).trim()
  }
  return String(skill.titleZh || skill.nameZh || skill.title || slug).trim()
}

/**
 * 解析技能描述，跟随 DSH 配置自适应中英文双语。
 * @param {object} skill
 * @param {Function} [t]
 * @returns {string}
 */
export function resolveSkillSummary(skill, t) {
  if (!skill || typeof skill !== 'object') return ''
  const slug = skill.skill || skill.slug || skill.id || ''
  if (typeof t === 'function') {
    const key = `skill.desc.${slug}`
    const tr = t(key)
    if (tr && tr !== key) return String(tr).trim()
    if (skill.id) {
      const keyById = `skill.desc.${skill.id}`
      const trById = t(keyById)
      if (trById && trById !== keyById) return String(trById).trim()
    }
  }

  const en = isLocaleEn(t)
  if (en) {
    return String(skill.summaryEn || skill.descriptionEn || skill.summary || '').trim()
  }
  return String(skill.summaryZh || skill.descriptionZh || skill.summary || '').trim()
}

/**
 * 按分类过滤技能。空字符串表示全部分类（精选）。
 * @param {Array<object>} skills
 * @param {string} categoryId
 * @returns {Array<object>}
 */
export function filterSkillsByCategory(skills, categoryId) {
  if (!Array.isArray(skills)) return []
  const cat = String(categoryId || '').trim()
  if (!cat || cat === 'all') return skills
  return skills.filter((item) => item && item.category === cat)
}

/**
 * 组装技能调用预填 Prompt。
 * 契约：只预填进原生输入框，绝不自动代发。
 * @param {object} skill
 * @param {Function} [t]
 * @returns {string}
 */
export function buildSkillPrompt(skill, t) {
  if (!skill || typeof skill !== 'object') return ''
  const en = isLocaleEn(t)
  const title = resolveSkillTitle(skill, t)
  const summary = resolveSkillSummary(skill, t)
  const displaySummary = summary.replace(/^用途[：:]\s*|^Purpose[：:]\s*/i, '')
  const lines = []

  if (en) {
    if (title) lines.push(`Use skill "${title}"`)
    if (displaySummary) lines.push(`Purpose: ${displaySummary}`)
    if (lines.length > 0) lines.push('')
    lines.push('Please follow the guidelines and steps of this skill to help me complete the following task:')
  } else {
    if (title) lines.push(`使用技能「${title}」`)
    if (displaySummary) lines.push(`用途：${displaySummary}`)
    if (lines.length > 0) lines.push('')
    lines.push('请按照该技能的规范和步骤，帮我完成以下任务：')
  }

  return lines.join('\n')
}
