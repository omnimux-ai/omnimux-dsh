import { clamp, collectQueries, searchSkills as searchSkillsRemote } from './api.js'
import { categoryLabel, parseCategory } from './categories.js'
import { parseAggregateChannels, sanitizeSortBy } from './config-store.js'
import { loadCatalog as loadCatalogDefault } from './expert/catalog.js'
import type { CatalogDoc, CatalogSkillItem, PluginConfig, SearchResult, SkillCard, SkillChannel, SortBy } from './types.js'
export type { CatalogDoc, CatalogSkillItem } from './types.js'

const CHANNEL_WEIGHT: Record<SkillChannel, number> = {
  custom: 3,
  workbuddy: 2,
  skillhub: 1,
}

const OMX_SKILLS_REPO = 'infometa/OmniMux-skills'

const STOP = new Set([
  'a', 'an', 'the', 'of', 'for', 'to', 'in', 'on', 'with', 'and', 'or', 'from', 'by', 'as', 'is', 'at',
  'this', 'that', 'into',
  '的', '了', '和', '与', '及', '或', '在', '为', '对', '把', '被', '让', '请', '帮', '我', '你',
  '一个', '一份', '一些', '这个', '那个', '帮我', '我要', '写', '做', '开发', '实现', '需要',
])

export interface AggregateSkillSearchOptions {
  cfg: PluginConfig
  queries?: unknown
  category?: string
  sortBy?: SortBy
  limit?: number
  offset?: number
  installed?: Set<string>
  signal?: AbortSignal
  channels?: unknown
  catalog?: CatalogDoc
  loadCatalog?: () => CatalogDoc
  searchSkills?: typeof searchSkillsRemote
}

interface RankedCard {
  card: SkillCard
  score: number
  weight: number
  index: number
}

/**
 * 三渠道技能聚合检索：自建 Catalog > WorkBuddy 本地市场 > SkillHub 远程。
 * Host `skillhub_search` 与 HTTP `method=search` 必须走这里，禁止两套合并逻辑。
 */
export async function aggregateSkillSearch(
  query: string,
  opts: AggregateSkillSearchOptions,
): Promise<SearchResult> {
  const cfg = opts.cfg
  const limit = clamp(opts.limit ?? cfg.maxResults, 1, 80)
  const offset = Math.max(0, Math.floor(opts.offset || 0))
  const category = parseCategory(opts.category)
  const keywords = collectQueries(query, opts.queries)
  const browsing = keywords.length === 0
  const sortBy = sanitizeSortBy(opts.sortBy, browsing ? 'downloads' : cfg.sortBy)
  const wanted = parseAggregateChannels(opts.channels) || cfg.aggregateChannels || ['custom', 'workbuddy', 'skillhub']
  const want = new Set(wanted)
  const tokens = tokenizeSkillQueries(keywords)
  const installed = opts.installed
  const channelCounts: Partial<Record<SkillChannel, number>> = {}
  const channelErrors: Partial<Record<SkillChannel, string>> = {}
  const channelsServed: SkillChannel[] = []

  const catalog = want.has('custom') || want.has('workbuddy')
    ? (opts.catalog || (opts.loadCatalog || loadCatalogDefault)())
    : { items: [] as CatalogSkillItem[] }

  const custom = want.has('custom')
    ? rankCatalogChannel(catalog, 'custom', tokens, category, cfg, installed)
    : []
  if (want.has('custom')) {
    channelsServed.push('custom')
    channelCounts.custom = custom.length
  }

  const workbuddy = want.has('workbuddy')
    ? rankCatalogChannel(catalog, 'workbuddy', tokens, category, cfg, installed)
    : []
  if (want.has('workbuddy')) {
    channelsServed.push('workbuddy')
    channelCounts.workbuddy = workbuddy.length
  }

  let remote: SearchResult | undefined
  if (want.has('skillhub')) {
    const searchFn = opts.searchSkills || searchSkillsRemote
    try {
      remote = await searchFn(query, {
        cfg,
        queries: opts.queries,
        category,
        sortBy,
        limit: clamp(Math.max(limit + offset, 12), 1, 80),
        offset: 0,
        installed,
        signal: opts.signal,
      })
      channelsServed.push('skillhub')
      channelCounts.skillhub = remote.items.length
    }
    catch (err) {
      const message = classifyRemoteError(err)
      channelErrors.skillhub = message
      if (cfg.aggregateRemoteSoftFail === false) throw err
    }
  }

  const localHits = custom.length + workbuddy.length
  if (remote?.fallback && localHits > 0) {
    channelCounts.skillhub = 0
    const idx = channelsServed.indexOf('skillhub')
    if (idx >= 0) channelsServed.splice(idx, 1)
    remote = { ...remote, items: [], fallback: false, hasMore: false, total: 0 }
  }

  const remoteRanked: RankedCard[] = (remote?.items || []).map((card, index) => ({
    card: stampRemote(card),
    score: 0,
    weight: CHANNEL_WEIGHT.skillhub,
    index,
  }))

  const merged = mergeRanked([custom, workbuddy, remoteRanked])
  const extraRemote = remote && !remote.fallback
    ? Math.max(0, remote.total - remote.items.length)
    : 0
  const total = merged.length + extraRemote
  const items = merged.slice(offset, offset + limit)
  const hasMore = offset + items.length < merged.length || extraRemote > 0 || Boolean(remote?.hasMore && extraRemote > 0)

  const errors = Object.keys(channelErrors).length ? channelErrors : undefined
  const emptyLocal = localHits === 0
  const fallback = Boolean(remote?.fallback && emptyLocal)

  return {
    query: keywords[0] || query || '',
    queries: keywords.length ? keywords : undefined,
    category,
    sortBy,
    items,
    total,
    totalApprox: extraRemote > 0,
    offset,
    hasMore,
    fallback: fallback || undefined,
    channelsServed,
    channelCounts,
    channelErrors: errors,
  }
}

export function catalogSkillChannel(item: CatalogSkillItem): SkillChannel | null {
  if (String(item.kind || '') !== 'skill') return null
  const tab = String(item.tab || 'skills')
  if (tab !== 'skills') return null
  const id = String(item.id || '')
  const repo = String(item.source?.repo || '')
  if (id.startsWith('sk-omx-') || repo === OMX_SKILLS_REPO) return 'custom'
  if (!id.startsWith('sk-omx-')) return 'workbuddy'
  return null
}

export function catalogSkillSlug(item: CatalogSkillItem): string {
  const skill = String(item.skill || '').trim().toLowerCase()
  if (skill) return skill
  return slugFromCatalogId(item.id)
}

export function slugFromCatalogId(id: string): string {
  const s = String(id || '').trim().toLowerCase()
  if (s.startsWith('sk-omx-')) return s.slice('sk-omx-'.length)
  if (s.startsWith('sk-')) return s.slice(3)
  return s
}

export function findCatalogSkill(
  slug: string,
  catalogId?: string,
  catalog?: CatalogDoc,
): CatalogSkillItem | undefined {
  const doc = catalog || loadCatalogDefault()
  const items = (doc.items || []).filter((item) => catalogSkillChannel(item) != null)
  const idNeedle = String(catalogId || '').trim()
  if (idNeedle) {
    const hit = items.find((item) => item.id === idNeedle)
    if (hit) return hit
  }
  const s = String(slug || '').trim().toLowerCase()
  if (!s) return undefined
  const scored = items
    .map((item, index) => ({ item, index, n: matchCatalogNeedle(item, s) }))
    .filter((row) => row.n > 0)
    .sort((a, b) => b.n - a.n || a.index - b.index)
  return scored[0]?.item
}

export function tokenizeSkillQuery(query: string): string[] {
  const raw = String(query || '').trim().toLowerCase()
  if (!raw) return []
  const parts = raw.split(/[^0-9a-zA-Z\u4e00-\u9fff]+/).filter(Boolean)
  const out = new Set<string>()
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(raw)) out.add(raw)
  for (const part of parts) {
    if (STOP.has(part)) continue
    if (/[\u4e00-\u9fff]/.test(part)) {
      if (part.length >= 2) out.add(part)
      for (let i = 0; i + 1 < part.length; i++) {
        const bg = part.slice(i, i + 2)
        if (!STOP.has(bg)) out.add(bg)
      }
    }
    else if (part.length >= 2) {
      out.add(part)
    }
  }
  return [...out]
}

export function scoreCatalogSkill(item: CatalogSkillItem, tokens: string[]): number {
  if (!tokens.length) return 1
  const skill = String(item.skill || '').toLowerCase()
  const id = String(item.id || '').toLowerCase()
  const title = String(item.title || '').toLowerCase()
  const summary = String(item.summary || '').toLowerCase()
  const tags = Array.isArray(item.tags) ? item.tags.map(String).join(' ').toLowerCase() : ''
  const hay = `${title} ${summary} ${tags} ${skill} ${id}`
  const titleHay = `${title} ${skill} ${id}`
  let score = 0
  for (const token of tokens) {
    if (skill === token || id === token || id === `sk-omx-${token}` || id === `sk-${token}`) {
      score += 80
      continue
    }
    if (!hay.includes(token)) continue
    const w = token.length >= 4 ? 5 : token.length >= 3 ? 3 : 2
    score += titleHay.includes(token) ? w * 2 : w
  }
  return score
}

export function catalogItemToCard(
  item: CatalogSkillItem,
  channel: SkillChannel,
  cfg: Pick<PluginConfig, 'webBase'>,
  installed?: Set<string>,
): SkillCard {
  const slug = catalogSkillSlug(item)
  const category = String(item.category || '')
  const avatar = typeof item.avatar === 'string' ? item.avatar : ''
  const card: SkillCard = {
    id: String(item.id || slug),
    slug,
    name: String(item.title || slug),
    description: String(item.summary || ''),
    category,
    categoryLabel: categoryLabel(category) || category,
    version: '',
    downloads: 0,
    stars: 0,
    installs: 0,
    pageUrl: `${cfg.webBase.replace(/\/$/, '')}/skills/${encodeURIComponent(slug)}`,
    owner: channel === 'custom' ? 'omnimux' : 'workbuddy',
    installed: installed?.has(slug) || false,
    channel,
    catalogId: String(item.id || ''),
    installBackend: 'catalog',
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
  }
  if (avatar) card.iconUrl = avatar
  return card
}

function rankCatalogChannel(
  catalog: CatalogDoc,
  channel: SkillChannel,
  tokens: string[],
  category: string | undefined,
  cfg: PluginConfig,
  installed?: Set<string>,
): RankedCard[] {
  const pool = (catalog.items || []).filter((item) => catalogSkillChannel(item) === channel)
  const filtered = category
    ? pool.filter((item) => localCategoryMatch(item, category))
    : pool
  const ranked = filtered
    .map((item, index) => ({ item, index, score: scoreCatalogSkill(item, tokens) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
  return ranked.map((row) => ({
    card: catalogItemToCard(row.item, channel, cfg, installed),
    score: row.score,
    weight: CHANNEL_WEIGHT[channel],
    index: row.index,
  }))
}

function localCategoryMatch(item: CatalogSkillItem, category: string): boolean {
  const key = category.toLowerCase()
  const label = categoryLabel(category).toLowerCase()
  const hay = `${item.category || ''} ${(item.tags || []).join(' ')} ${item.title || ''} ${item.summary || ''}`.toLowerCase()
  return hay.includes(key) || (label !== key && !!label && hay.includes(label))
}

function mergeRanked(groups: RankedCard[][]): SkillCard[] {
  const seen = new Map<string, RankedCard>()
  for (const group of groups) {
    for (const row of group) {
      const key = dedupeKey(row.card)
      if (!key) continue
      const prev = seen.get(key)
      if (!prev) {
        seen.set(key, row)
        continue
      }
      if (row.weight > prev.weight) seen.set(key, row)
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.weight - a.weight || b.score - a.score || a.index - b.index)
    .map((row) => row.card)
}

function dedupeKey(card: SkillCard): string {
  const slug = String(card.slug || '').trim().toLowerCase()
  if (slug) return slug
  return slugFromCatalogId(card.catalogId || card.id)
}

function stampRemote(card: SkillCard): SkillCard {
  return {
    ...card,
    channel: card.channel || 'skillhub',
    installBackend: card.installBackend || 'skillhub',
  }
}

function tokenizeSkillQueries(keywords: string[]): string[] {
  const out = new Set<string>()
  for (const keyword of keywords) {
    for (const token of tokenizeSkillQuery(keyword)) out.add(token)
  }
  return [...out]
}

function matchCatalogNeedle(item: CatalogSkillItem, s: string): number {
  const id = String(item.id || '').toLowerCase()
  const skill = String(item.skill || '').toLowerCase()
  if (id === s) return 100
  if (skill === s) return 90
  if (id === `sk-omx-${s}` || id === `sk-${s}`) return 80
  if (skill && (`sk-omx-${skill}` === s || `sk-${skill}` === s)) return 70
  if (slugFromCatalogId(id) === s) return 60
  return 0
}

function classifyRemoteError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err || 'error')
  if (/timeout|timed out|abort/i.test(message)) return 'timeout'
  if (/ENOTFOUND|ECONN|network|fetch/i.test(message)) return 'network'
  return message.slice(0, 120) || 'error'
}
