/**
 * 加号整页选素材：分类、提示词和六路数据。
 * 只走公开地址，不引用其他插件的内部模块。
 * 严格对齐 specs/asset-hub-shared-tabs.spec.md 与 specs/asset-hub-shared-tabs-architecture.md
 */
import { mapInspirationRow } from '../components/inspiration-picker/picker-model.js'
import { mapSourceItem } from '../session-guide/trending/trending-source.js'
import { SHARED_PRIMARY_TABS } from '../shared/asset-hub-tabs/shared-tabs-catalog.js'
import FEATURED_SKILLS_JSON from '../session-guide/skills/featured-skills.json' with { type: 'json' }

export const LIBRARY_STAGE_EVENT = 'omnimux:library-stage'
export const LIBRARY_STAGE_PROMPT_EVENT = 'omnimux:library-stage:prompt'
export const LIBRARY_STAGE_DOCK_ID = 'omnimux-library-stage'

export const LIBRARY_TABS = Object.freeze(
  SHARED_PRIMARY_TABS.map((t) => ({ id: t.id, label: t.nameZh }))
)

const FEATURED_LIMIT = 8
const PAGE_LIMIT = 48

/** 加号各素材入口各自打开的分类。 */
export function tabForKind(kind) {
  const k = String(kind || '').toLowerCase()
  if (k === 'product' || k === 'products') return 'products'
  if (k === 'inspiration') return 'inspiration'
  if (k === 'library' || k === 'assets' || k === 'asset') return 'assets'
  if (k === 'trending' || k === 'hot') return 'trending'
  if (k === 'skill' || k === 'skills') return 'skills'
  if (k === 'featured' || k === 'template' || k === 'templates' || k === 'app') return 'featured'
  return 'featured'
}

/** 当前分类要读哪些来源。精选四路都读，其余只读自己那一路。 */
export function sourcesForTab(tab) {
  if (tab === 'assets') return ['assets']
  if (tab === 'inspiration') return ['inspiration']
  if (tab === 'products') return ['products']
  if (tab === 'trending') return ['trending']
  if (tab === 'skills') return ['skills']
  if (tab === 'featured') return ['assets', 'inspiration', 'products', 'trending']
  return ['assets', 'inspiration', 'products', 'trending']
}

/**
 * 依据卡片生成对应的 Prompt 草稿
 */
export function promptForCard(card) {
  const name = String(card?.title || card?.name || '').trim()
  if (!name) return ''
  if (card.lane === 'featured') return `请基于模板「${name}」，结合我的产品卖点生成对应视频脚本。`
  if (card.lane === 'assets') return `请结合资产「${name}」继续创作：`
  if (card.lane === 'products') return `请围绕产品「${name}」撰写内容：`
  if (card.lane === 'inspiration') return `请参考本地灵感「${name}」继续创作：`
  if (card.lane === 'trending') return `请对标这条爆款「${name}」复刻一条视频：`
  if (card.lane === 'skills') return `为我运行技能「${name}」，指导下一步创作流程。`
  return ''
}

/** 空输入框写入；已有文字接在后面；同一句不重复。 */
export function mergeLibraryPrompt(draft, prompt) {
  const next = String(prompt || '').trim()
  if (!next) return String(draft || '')
  const current = String(draft || '')
  if (!current.trim()) return next
  if (current.split('\n').some((line) => line.trim() === next)) return current
  return `${current.replace(/\s+$/, '')}\n${next}`
}

async function requestJson(path, fetchImpl) {
  const fetchFn = fetchImpl || globalThis.fetch
  if (typeof fetchFn !== 'function') throw new Error('无法连接素材服务')
  const response = await fetchFn(path)
  let body = {}
  try {
    body = await response.json()
  } catch {
    body = {}
  }
  return { ok: Boolean(response?.ok), status: Number(response?.status) || 0, body }
}

function failure(res, fallback) {
  return new Error(res.body?.message || res.body?.error || fallback)
}

async function loadAssets(fetchImpl, limit) {
  const res = await requestJson('/omnimux/assets/library', fetchImpl)
  if (!res.ok) throw failure(res, '资产库暂时打不开')
  const rows = Array.isArray(res.body?.assets) ? res.body.assets : []
  return rows.slice(0, limit).filter((row) => row?.id).map((row) => ({
    id: String(row.id),
    title: String(row.name || row.title || row.id),
    raw: row,
  }))
}

async function loadProducts(fetchImpl, limit) {
  const res = await requestJson('/omnimux/products', fetchImpl)
  if (!res.ok) throw failure(res, '产品库暂时打不开')
  const rows = Array.isArray(res.body?.products) ? res.body.products : []
  return rows.slice(0, limit).filter((row) => row?.id).map((row) => ({
    id: String(row.id),
    title: String(row.name || row.title || row.id),
    raw: row,
  }))
}

async function loadInspiration(fetchImpl, limit) {
  const res = await requestJson(
    `/omnimux/inspiration/local?sort=hot&page=1&page_size=${limit}&projection=lean`,
    fetchImpl,
  )
  if (!res.ok) throw failure(res, '灵感库暂时打不开')
  const rows = Array.isArray(res.body?.data?.items) ? res.body.data.items : []
  return rows.map((row) => mapInspirationRow(row, true)).filter(Boolean).slice(0, limit).map((row) => ({
    id: row.id,
    title: row.title,
    raw: row,
  }))
}

async function loadTrending(fetchImpl, limit) {
  const res = await requestJson(
    `/omnimux/inspiration?sort=views&page=1&page_size=${limit}&projection=lean`,
    fetchImpl,
  )
  if (res.status === 401) {
    const error = new Error('登录后可查看云端灵感')
    error.code = 'need-login'
    throw error
  }
  if (!res.ok) throw failure(res, '爆款趋势暂时打不开')
  const rows = Array.isArray(res.body?.data?.items) ? res.body.data.items : []
  return rows.map((row) => mapSourceItem(row)).filter(Boolean).slice(0, limit).map((item) => ({
    id: item.id,
    title: item.title,
    trending: item,
    raw: {
      id: item.id,
      title: item.title,
      previewUrl: item.cover || '',
      kind: item.videoUrl ? 'video' : 'image',
      is_local: false,
    },
  }))
}

async function loadSkills(fetchImpl, limit) {
  const list = Array.isArray(FEATURED_SKILLS_JSON?.skills) ? FEATURED_SKILLS_JSON.skills : []
  return list.slice(0, limit).map((skill) => ({
    id: String(skill.id),
    title: String(skill.titleZh || skill.title || skill.id),
    raw: skill,
  }))
}

const LOADERS = {
  assets: loadAssets,
  products: loadProducts,
  inspiration: loadInspiration,
  trending: loadTrending,
  skills: loadSkills,
}

/**
 * @param {string} tab
 * @param {{ fetchImpl?: typeof fetch }} [deps]
 */
export async function loadLibraryCards(tab, deps = {}) {
  const lanes = sourcesForTab(tab)
  const limit = tab === 'featured' ? FEATURED_LIMIT : PAGE_LIMIT
  const settled = await Promise.all(lanes.map(async (lane) => {
    try {
      const loader = LOADERS[lane]
      if (!loader) return { lane, items: [], error: null }
      const items = await loader(deps.fetchImpl, limit)
      return { lane, items, error: null }
    } catch (caught) {
      return {
        lane,
        items: [],
        error: {
          message: caught instanceof Error ? caught.message : String(caught),
          code: caught?.code || '',
        },
      }
    }
  }))
  const cards = []
  const errors = {}
  for (const row of settled) {
    if (row.error) errors[row.lane] = row.error
    for (const item of row.items) cards.push({ ...item, lane: row.lane })
  }
  return { cards, errors, lanes }
}
