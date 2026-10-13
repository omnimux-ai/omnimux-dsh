const KEY = 'omnimux-avatar:builder-draft:v2'

/** Session-only feature choices, not account media or model credentials. */
export function readBuilderDraft(taxonomy) {
  try {
    const row = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
    if (!row || !taxonomy?.tier_group.options.some(option => option.id === row.tier)) return null
    const clean = selection => Object.fromEntries(taxonomy.categories.flatMap(category => {
      const picks = Array.isArray(selection?.[category.id]) ? selection[category.id].filter(id => category.options.some(option => option.id === id && option.visibleIn.includes(row.tier))).slice(0, category.max || 1) : []
      return picks.length ? [[category.id, picks]] : []
    }))
    return { tier: row.tier, selection: clean(row.selection), manualSelection: clean(row.manualSelection) }
  } catch { return null }
}

export function writeBuilderDraft(tier, selection, manualSelection) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ tier, selection, manualSelection })) }
  catch { /* Session persistence is optional, current choices remain usable. */ }
}
