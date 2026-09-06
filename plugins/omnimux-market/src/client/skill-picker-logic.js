/** Pure helpers for the Composer Skill picker. Importable by tests; the UI fragment inlines the same rules. */

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
 * UI 片段（skill-picker.js / skill-plaza.js）因 concat 单 factory 约束内联副本，
 * 由 skill-shelf-parity.test.js 对拍守卫，漂移即测试失败。
 * keywords 为 L2/L3 兜底匹配词表，v1 收敛为 [id]；扩充需评估误命中（见 docs/design/2026-09-skill-shelf-filter-design.md）。
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
  { id: 'all', kind: 'all' },
  { id: 'mine', kind: 'mine' },
  { id: 'featured', kind: 'featured' },
  ...SKILL_SHELF_TAGS.map((id) => ({ id, kind: 'tag' })),
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

export function matchesDomainTag(item, tag) {
  if (!item || !tag) return true
  const tags = Array.isArray(item.tags) ? item.tags.map(String) : []
  if (tags.includes(tag)) return true
  const row = SKILL_SHELF_TAXONOMY.find((entry) => entry.id === tag)
  const keywords = row && Array.isArray(row.keywords) && row.keywords.length ? row.keywords : [tag]
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
  return keywords.some((kw) => {
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

export function filterPickerItems(items, tabId) {
  const list = Array.isArray(items) ? items : []
  const tab = PICKER_TABS.find((row) => row.id === tabId) || PICKER_TABS[0]
  if (tab.kind === 'mine') return list.filter((it) => it && it.installed === true)
  const shelf = list.filter((it) => inSkillShelf(it))
  if (tab.kind === 'tag') return shelf.filter((it) => matchesDomainTag(it, tab.id))
  return shelf
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
    writePickerCache(cache, key, body, now)
    if (inflight && typeof inflight.delete === 'function') inflight.delete(key)
    return body
  }, (err) => {
    if (inflight && typeof inflight.delete === 'function') inflight.delete(key)
    throw err
  })
  if (inflight && typeof inflight.set === 'function') inflight.set(key, pending)
  return pending.then((body) => ({ body, fromCache: false }))
}
