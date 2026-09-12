/**
 * 精选技能纯函数层：分类过滤、Prompt 组装。
 */

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
 * @returns {string}
 */
export function buildSkillPrompt(skill) {
  if (!skill || typeof skill !== 'object') return ''
  const title = String(skill.title || '').trim()
  const summary = String(skill.summary || '').trim()
  const displaySummary = summary.replace(/^用途[：:]\s*/, '')
  const lines = []
  if (title) lines.push(`使用技能「${title}」`)
  if (displaySummary) lines.push(`用途：${displaySummary}`)
  if (lines.length > 0) lines.push('')
  lines.push('请按照该技能的规范和步骤，帮我完成以下任务：')
  return lines.join('\n')
}
