/** Pure helpers for the Composer Skill picker. Importable by tests; the UI fragment inlines the same rules. */
import catalog from '../../catalog/index.json' with { type: 'json' }

import recommendations from '../../catalog/skill-recommendations.json' with { type: 'json' }
import presetSkillsMap from '../../catalog/preset-skills.json' with { type: 'json' }

/**
 * Agent 预设与 Skill 绑定表（Agent 模式决定 skill 范围）。
 */
export const AGENT_PRESET_SKILL_BINDINGS = Object.freeze(presetSkillsMap)

export function normalizePresetId(presetId) {
  return String(presetId || '').trim().toLowerCase().replace(/_/g, '-')
}

export function getPresetSkillBinding(presetId) {
  if (!presetId) return null
  const norm = normalizePresetId(presetId)
  const entry = AGENT_PRESET_SKILL_BINDINGS[presetId] ||
    AGENT_PRESET_SKILL_BINDINGS[norm] ||
    (norm === 'tiktok-agent' || norm === 'tiktokagent' || norm === 'tiktok'
      ? AGENT_PRESET_SKILL_BINDINGS['tiktok-agent']
      : null)
  if (!entry) return null
  const categories = entry.categories || []
  const tabs = [
    { id: 'all', kind: 'all', labelKey: 'picker.tab.all', name: '全部' },
    ...categories.map((c) => ({ id: c.id, kind: 'preset-category', name: c.name })),
  ]
  return {
    presetId: entry.presetId || presetId,
    name: entry.name || presetId,
    categories,
    tabs,
    skills: entry.skills || [],
  }
}

export function hasPresetSkillBinding(presetId) {
  return getPresetSkillBinding(presetId) !== null
}

export function resolveActivePreset({ props, sessions } = {}) {
  if (props && typeof props.agentPreset === 'string' && props.agentPreset) {
    return props.agentPreset
  }
  try {
    const snap = sessions?.list?.getSnapshot?.()
    const targetId = (props && props.sessionId) || snap?.current
    if (targetId && snap?.byId?.[targetId]) {
      const p = snap.byId[targetId]?.projectionValues?.agentPreset
      if (typeof p === 'string' && p) return p
    }
  } catch {}
  if (typeof window !== 'undefined' && window.__omnimuxActivePreset) {
    return window.__omnimuxActivePreset
  }
  return undefined
}

export function filterPresetSkills(skills = [], tabId = 'all', query = '') {
  const list = Array.isArray(skills) ? skills : []
  const q = String(query || '').trim().toLowerCase()
  return list.filter((item) => {
    if (!item) return false
    if (tabId && tabId !== 'all') {
      const cat = String(item.category || item.categoryLabel || '').trim()
      const tags = Array.isArray(item.tags) ? item.tags.map(String) : []
      if (cat !== tabId && !tags.includes(tabId)) return false
    }
    if (q) {
      const hay = [
        item.name,
        item.title,
        item.slug,
        item.skill,
        item.description,
        item.summary,
        item.category,
      ].map((v) => String(v || '')).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/** Validate editorial IDs separately from resilient rendering; shipped configuration is tested. */
export function validateSkillRecommendations(config = recommendations, entries = catalog.items) {
  const errors = []
  const byId = new Map(entries.map(item => [item.id, item]))
  for (const field of ['featuredSkills', 'homeRecommendations']) {
    if (!Array.isArray(config[field])) {
      errors.push(`${field}: expected an ordered ID array`)
      continue
    }
    const seen = new Set()
    for (const id of config[field]) {
      const item = byId.get(id)
      if (seen.has(id)) errors.push(`${field}: duplicate ${id}`)
      seen.add(id)
      if (!item || item.kind !== 'skill' || item.recommended !== true) errors.push(`${field}: not a recommended Skill: ${id}`)
      if (field === 'homeRecommendations' && !config.featuredSkills?.includes(id)) errors.push(`${field}: not in featuredSkills: ${id}`)
    }
  }
  for (const item of entries) {
    if (item.kind === 'skill' && item.recommended === true && !config.featuredSkills?.includes(item.id)) errors.push(`featuredSkills: missing ${item.id}`)
  }
  return errors
}

/** Resolve from the complete bundled catalog, never a paginated search response. */
export function resolveSkillRecommendations(ids = [], entries = catalog.items) {
  const byId = new Map(entries.map(item => [item.id, item]))
  return [...new Set(ids)].flatMap(id => {
    const item = byId.get(id)
    if (!item || item.kind !== 'skill' || item.recommended !== true) return []
    return [{ ...item, catalogId: item.id, slug: item.skill, name: item.title,
      description: item.summary, installBackend: 'catalog', installed: false }]
  })
}

/** Split only displayed recommendations out of discovery; full-library search stays independent. */
export function plazaDiscoverySections(items = [], { category = '', query = '', uninstalledOnly = false,
  installedItems = [], config = recommendations, entries = catalog.items, presetBinding = null } = {}) {
  const key = item => item.slug || item.skill || item.catalogId || item.id
  const matches = item => {
    if (!category || category === 'featured') return true
    if (presetBinding && Array.isArray(presetBinding.skills)) {
      const cat = String(item.category || item.categoryLabel || '').trim()
      const tags = Array.isArray(item.tags) ? item.tags.map(String) : []
      return cat === category || tags.includes(category)
    }
    return matchesDomainTag(item, category)
  }
  const available = item => !uninstalledOnly || !item.installed
  const unique = list => [...new Map(list.map(item => [key(item), item])).values()]
  const installed = new Map(installedItems.map(item => [key(item), item]))
  const live = new Map(items.map(item => [item.catalogId || item.id, item]))
  const hasQuery = Boolean(String(query).trim())
  const ids = category ? config.featuredSkills : config.homeRecommendations
  const featured = hasQuery ? [] : resolveSkillRecommendations(ids || [], entries)
    .filter(item => category || config.featuredSkills?.includes(item.id))
    .map(item => {
      const current = live.get(item.id)
      const local = installed.get(key(item))
      return { ...item, ...(!category && item.homeCover ? { cover: item.homeCover } : {}),
        ...(current ? { rating: current.rating, installed: current.installed, enabled: current.enabled } : {}),
        ...(local ? { installed: true, enabled: local.enabled !== false } : {}) }
    }).filter(matches).filter(available)
  const featuredKeys = new Set(featured.map(key))
  const catalogFeatured = new Set(entries.filter(item => item.kind === 'skill' && item.recommended === true).map(item => item.skill))
  const localCards = hasQuery ? [] : entries.filter(item => item.kind === 'skill').map(item => ({
    ...item, catalogId: item.id, slug: item.skill, name: item.title, description: item.summary,
    installBackend: 'catalog', installed: installed.has(item.skill),
  }))
  const presetCards = presetBinding && Array.isArray(presetBinding.skills)
    ? filterPresetSkills(presetBinding.skills, category, query)
    : []
  const regular = unique([...presetCards, ...localCards, ...items]).map(item => installed.has(key(item))
    ? { ...item, installed: true, enabled: installed.get(key(item)).enabled !== false } : item).filter(matches).filter(available)
    .filter(item => !featuredKeys.has(key(item)))
    .filter(item => category !== 'featured' || (hasQuery && catalogFeatured.has(key(item))))
  return { featured, regular }
}

const recommendedSkillSlugs = new Set(catalog.items
  .filter(item => item.kind === 'skill' && item.recommended === true && item.skill)
  .map(item => item.skill))

/** Installed listings omit catalog metadata; only authoritative catalog identities qualify. */
export function isRecommendedInstalledSkill(item) {
  return recommendedSkillSlugs.has(skillToken(item))
}

export const PLAZA_INTENT_KEY = 'omnimux-market:plaza-intent'
/** 暂时隐藏的广场 Tab（Issue #502）：恢复时清空数组并在 plaza-shell.js 还原守卫。 */
export const PLAZA_HIDDEN_TABS = Object.freeze(['connectors'])
/** 广场可见 Tab（隐藏 Tab 不再是合法 intent 目标）。 */
export const PLAZA_TABS = Object.freeze(['plugins', 'skills', 'experts'])
export const CREATE_SKILL = Object.freeze({
  id: 'sk-omx-skill-creator',
  slug: 'skill-creator',
  skill: 'skill-creator',
  catalogId: 'sk-omx-skill-creator',
  name: '技能创建',
  description: '创建双语可复用Skill',
})
export const PICKER_SEARCH_LIMIT = 20
export const PICKER_DEBOUNCE_MS = 200
export const PICKER_CACHE_TTL_MS = 90_000

/**
 * Skill 货架分类法（Taxonomy）唯一语义真源。顺序即展示顺序。
 * UI 片段（skill-picker.js / skill-plaza.js / plaza-shell.js）运行时经 boot.js
 * 注入的 SkillShelf 命名空间消费本模块，禁止再维护内联副本（parity 测试守卫）。
 * keywords 为 L2/L3 兜底匹配词表；仅电商扩充为五词，其余收敛为 [id]；
 * 短英文词（ad、music）不得入词表，扩充需评估误命中。
 */
export const SKILL_SHELF_TAXONOMY = Object.freeze([
  { id: '电商', labelKey: 'picker.tab.ecom', keywords: Object.freeze(['电商', '独立站', '跨境', 'shopify', '选品']) },
  { id: '商业广告', labelKey: 'picker.tab.ad', keywords: Object.freeze(['商业广告']) },
  { id: '短剧漫剧', labelKey: 'picker.tab.drama', keywords: Object.freeze(['短剧漫剧']) },
  { id: '专业影视', labelKey: 'picker.tab.film', keywords: Object.freeze(['专业影视']) },
  { id: '动画', labelKey: 'picker.tab.anim', keywords: Object.freeze(['动画']) },
  { id: '教育', labelKey: 'picker.tab.edu', keywords: Object.freeze(['教育']) },
  { id: '创意实验', labelKey: 'picker.tab.lab', keywords: Object.freeze(['创意实验']) },
  { id: '音频音乐', labelKey: 'picker.tab.audio', keywords: Object.freeze(['音频音乐']) },
  { id: '平台工具', labelKey: 'picker.tab.platform', keywords: Object.freeze(['平台工具']) },
])

export const SKILL_SHELF_TAGS = Object.freeze(SKILL_SHELF_TAXONOMY.map((row) => row.id))

export const PICKER_TABS = Object.freeze([
  { id: 'all', kind: 'all', labelKey: 'picker.tab.all' },
  { id: 'mine', kind: 'mine', labelKey: 'picker.tab.mine' },
  { id: 'featured', kind: 'featured', labelKey: 'picker.tab.featured' },
  ...SKILL_SHELF_TAXONOMY.map((row) => ({ id: row.id, kind: 'tag', labelKey: row.labelKey })),
])

export function skillToken(item) {
  const raw = String((item && (item.skill || item.slug)) || '').trim()
  const slug = raw.replace(/^\//, '')
  return slug
}

export function skillGesture(item) {
  const slug = skillToken(item)
  return slug ? `/${slug} ` : ''
}

export function appendSkillGesture(draft, gesture) {
  const token = String(gesture || '')
  if (!token) return String(draft || '')
  const withSpace = token.endsWith(' ') ? token : `${token} `
  const base = String(draft || '')
  const prefix = base && !/\s$/.test(base) ? `${base} ` : base
  return `${prefix}${withSpace}`
}

export function buildSearchPayload(tabId, query) {
  const q = String(query || '').trim()
  const tab = PICKER_TABS.find((row) => row.id === tabId) || PICKER_TABS[0]
  const payload = { query: q, limit: PICKER_SEARCH_LIMIT, offset: 0 }
  if (tab.kind === 'featured') payload.channels = ['custom']
  if (tab.kind === 'tag') payload.query = q ? `${q} ${tab.id}` : tab.id
  return payload
}

/**
 * tag 在 taxonomy 中有对应行且 keywords 有效时取该行 keywords，
 * 未知分类回落 [tag]（字面匹配，不崩、不落入「全部」）。
 */
export function keywordsForTag(tag) {
  const row = SKILL_SHELF_TAXONOMY.find((r) => r.id === tag)
  if (row && Array.isArray(row.keywords) && row.keywords.length) return row.keywords
  return [tag]
}

export function matchesDomainTag(item, tag) {
  if (!item || !tag) return true
  const tags = Array.isArray(item.tags) ? item.tags.map(String) : []
  if (tags.includes(tag)) return true
  const hay = [
    item.category,
    item.categoryLabel,
    item.name,
    item.title,
    item.description,
    item.summary,
    tags.join(' '),
  ].map((v) => String(v || '')).join(' ')
  const lowerHay = hay.toLowerCase()
  return keywordsForTag(tag).some((kw) => {
    const k = String(kw || '').toLowerCase()
    return k ? lowerHay.includes(k) : false
  })
}

export function itemShelfTags(item) {
  const tags = Array.isArray(item && item.tags) ? item.tags.map(String) : []
  return tags.filter((tag) => SKILL_SHELF_TAGS.includes(tag))
}

export function inSkillShelf(item) {
  if (!item) return false
  if (itemShelfTags(item).length) return true
  return SKILL_SHELF_TAGS.some((tag) => matchesDomainTag(item, tag))
}

export function filterPickerItems(items, tabId, presetBinding = null) {
  if (presetBinding && Array.isArray(presetBinding.skills)) {
    return filterPresetSkills(presetBinding.skills, tabId)
  }
  const list = Array.isArray(items) ? items : []
  const tab = PICKER_TABS.find((row) => row.id === tabId) || PICKER_TABS[0]
  if (tab.kind === 'mine') return list.filter((it) => it && it.installed === true)
  const shelf = list.filter((it) => inSkillShelf(it))
  if (tab.kind === 'tag') return shelf.filter((it) => matchesDomainTag(it, tab.id))
  return shelf
}

/**
 * Plaza 货架过滤：先收敛到货架全集，再按分类严格判定。
 * 未知分类走 matchesDomainTag 的「未知 → [tag]」字面分支，严禁回落「全部」。
 */
export function filterPlazaShelf(items, tag) {
  const list = Array.isArray(items) ? items : []
  const shelf = list.filter((it) => inSkillShelf(it))
  const key = String(tag || '').trim()
  if (!key) return shelf
  return shelf.filter((it) => matchesDomainTag(it, key))
}

/** Plaza 检索渠道：仅用户提交 query 时才追加 skillhub；分类浏览保持默认双渠道。 */
export const PLAZA_DEFAULT_CHANNELS = Object.freeze(['custom', 'workbuddy'])
export const PLAZA_QUERY_CHANNELS = Object.freeze(['custom', 'workbuddy', 'skillhub'])
export const PLAZA_PAGE_SIZE = 48

export function buildPlazaSearchPayload(submitted, category, page = 1, pageSize = PLAZA_PAGE_SIZE) {
  const q = String(submitted || '').trim()
  const cat = String(category || '').trim()
  const query = cat ? (q ? `${q} ${cat}` : cat) : q
  return {
    query,
    limit: pageSize,
    offset: (Math.max(1, Number(page) || 1) - 1) * pageSize,
    channels: q ? [...PLAZA_QUERY_CHANNELS] : [...PLAZA_DEFAULT_CHANNELS],
  }
}

export function installPayload(item) {
  if (!item || item.installed === true) return null
  const slug = String(item.slug || item.skill || '').trim()
  if (!slug) return null
  const catalogId = String(item.catalogId || (String(item.id || '').startsWith('sk-') ? item.id : '') || '').trim()
  return catalogId ? { slug, catalogId } : { slug }
}

export function writePlazaIntent(tab, storage) {
  const next = PLAZA_TABS.includes(tab) ? tab : 'skills'
  if (!storage || typeof storage.setItem !== 'function') return next
  storage.setItem(PLAZA_INTENT_KEY, JSON.stringify({ tab: next }))
  return next
}

export function consumePlazaIntent(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null
  let raw = null
  try {
    raw = storage.getItem(PLAZA_INTENT_KEY)
  } catch {
    return null
  }
  try {
    if (typeof storage.removeItem === 'function') storage.removeItem(PLAZA_INTENT_KEY)
  } catch { /* ignore */ }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    const tab = parsed && parsed.tab
    return PLAZA_TABS.includes(tab) ? tab : null
  } catch {
    return null
  }
}

export function pickerCacheKey(payload) {
  return JSON.stringify(payload || {})
}

export function peekPickerCache(store, key, now = Date.now(), ttlMs = PICKER_CACHE_TTL_MS) {
  if (!store || typeof store.get !== 'function' || !key) return null
  const hit = store.get(key)
  if (!hit || !hit.body) return null
  const at = Number(hit.at) || 0
  if (now - at >= ttlMs) return null
  return hit.body
}

export function writePickerCache(store, key, body, now = Date.now()) {
  if (!store || typeof store.set !== 'function' || !key || !body) return false
  store.set(key, { at: now, body })
  return true
}

export function loadPickerSearch(payload, opts) {
  const key = pickerCacheKey(payload)
  const now = opts && typeof opts.now === 'number' ? opts.now : Date.now()
  const ttl = opts && typeof opts.ttlMs === 'number' ? opts.ttlMs : PICKER_CACHE_TTL_MS
  const cache = opts && opts.cache
  const inflight = opts && opts.inflight
  const fetchSearch = opts && opts.fetchSearch
  const cached = peekPickerCache(cache, key, now, ttl)
  if (cached) return Promise.resolve({ body: cached, fromCache: true })
  if (inflight && typeof inflight.get === 'function' && inflight.has(key)) {
    return inflight.get(key).then((body) => ({ body, fromCache: false }))
  }
  if (typeof fetchSearch !== 'function') {
    return Promise.resolve({ body: null, fromCache: false })
  }
  const pending = Promise.resolve(fetchSearch(payload)).then((body) => {
    // TTL 自请求完成时刻起算：必须在 then 回调内读取时钟，禁止闭包捕获发起时刻。
    const at = opts && typeof opts.completedAt === 'function' ? opts.completedAt() : Date.now()
    writePickerCache(cache, key, body, at)
    if (inflight && typeof inflight.delete === 'function') inflight.delete(key)
    return body
  }, (err) => {
    if (inflight && typeof inflight.delete === 'function') inflight.delete(key)
    throw err
  })
  if (inflight && typeof inflight.set === 'function') inflight.set(key, pending)
  return pending.then((body) => ({ body, fromCache: false }))
}
