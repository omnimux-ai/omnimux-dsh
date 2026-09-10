import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { clamp, fetchSkillCard, parseSlug } from './api.js'
import { parseCategory } from './categories.js'
import { assignConfig, dshHome, publicConfig, sanitizePatch, sanitizeSortBy, writeOverlay } from './config-store.js'
import { configureHttpJsonCache } from './http.js'
import { BOOT_ID, progress, publicInstallStatus } from './dsh-cli.js'
import { decorateCatalog, loadCatalog } from './expert/catalog.js'
import { findItem, installItem, removeMcpRow, withConnectorPatchLock } from './expert/install.js'
import { packageRoot, profileDir } from './expert/paths.js'
import { summonItem } from './expert/summon.js'
import { writeSessionExpert } from './session-attach.js'
import { fetchBytes } from './http.js'
import { installSkill, installedSlugs, listInstalled, uninstallSkill } from './install.js'
import { listMarketplaceConnectors, resolveMarketplaceIconFile } from './marketplace-connectors.js'
import { installMarketPlugin, isPluginInstallBusy, listPluginCategories, listPlugins, withPluginInstallLock } from './plugin-market.js'
import { scheduleRestart, servingPort, trustedRestartRequest } from './restart.js'
import { fetchEvalScore, fetchSkillTab } from './skill-detail.js'
import { aggregateSkillSearch } from './skill-aggregate.js'
import type { PluginConfig, SkillCard, WorkshopQueryRequest } from './types.js'
import { RequestGuard, WORKSHOP_READ_METHODS } from './workshop-request-guard.js'
import type { WorkshopReadAuthorization, WorkshopReadMethod } from './workshop-request-guard.js'
import { WorkshopReadError } from './workshop-store.js'
import { WorkshopQueryError } from './workshop-query.js'
import type { WorkshopDetailRequest } from './workshop-sources.js'

export interface WorkshopApiHost {
  workshopCapabilities(req: IncomingMessage): Promise<unknown>
  workshopInventory(req: IncomingMessage): Promise<unknown>
  workshopQuery(req: IncomingMessage, request: WorkshopQueryRequest): Promise<unknown>
  workshopDetail(req: IncomingMessage, request: WorkshopDetailRequest): Promise<unknown>
}

/** Fixed, GET-only methods: authentication and scope checks precede payload decoding. */
export async function handleWorkshopApi(req: IncomingMessage, res: ServerResponse, method: WorkshopReadMethod,
  host: WorkshopApiHost, authorization: WorkshopReadAuthorization): Promise<void> {
  try {
    await new RequestGuard(authorization).authorizeHeaders(req, method)
    if (!WORKSHOP_READ_METHODS.includes(method)) throw new WorkshopReadError('INVALID_REQUEST', 400)
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if ((req.url?.length || 0) > 8192 || [...url.searchParams.keys()].some((key) => key !== 'request')
      || url.searchParams.getAll('request').length > 1) throw new WorkshopReadError('INVALID_REQUEST', 400)
    const raw = url.searchParams.get('request')
    let result: unknown
    if (method === 'workshopCapabilities' || method === 'workshopInventory') {
      if (raw !== null) throw new WorkshopReadError('INVALID_REQUEST', 400)
      result = await host[method](req)
    } else {
      if (!raw) throw new WorkshopReadError('INVALID_REQUEST', 400)
      let input: unknown
      try { input = JSON.parse(raw) } catch { throw new WorkshopReadError('INVALID_REQUEST', 400) }
      result = method === 'workshopQuery' ? await host.workshopQuery(req, input as WorkshopQueryRequest)
        : await host.workshopDetail(req, input as WorkshopDetailRequest)
    }
    res.setHeader('cache-control', 'no-store')
    return sendJson(res, 200, { ok: true, ...(result as object) })
  } catch (error) {
    const code = error instanceof WorkshopReadError || error instanceof WorkshopQueryError ? error.code : 'CAPABILITY_UNAVAILABLE'
    const status = error instanceof WorkshopReadError ? error.status : code === 'INVALID_REQUEST' ? 400 : code === 'CURSOR_EXPIRED' ? 409 : 503
    res.setHeader('cache-control', 'no-store')
    return sendJson(res, status, { ok: false, code, error: code, retryable: status >= 500 })
  }
}

let restarting = false

export const MUTATING_METHODS = new Set([
  'install',
  'uninstall',
  'pluginInstall',
  'pluginUninstall',
  'pluginRestart',
  'catalogInstall',
  'catalogSummon',
  'catalogUninstall',
  'expertMarketInstall',
  'expertMarketDisable',
])

export interface MarketExpertItem {
  id: string
  name: string
  nameEn: string
  description: string
  descriptionEn: string
  avatar: string
  initialStatus: 'enabled' | 'available' | 'coming_soon'
  order: number
}

export const DEFAULT_MARKET_EXPERTS: MarketExpertItem[] = [
  {
    id: 'shopee-ops-expert',
    name: 'Shopee运营专家',
    nameEn: 'Shopee Ops Expert',
    description: '负责市场、产品、店铺、品牌和关键词分析的Shopee运营专员。',
    descriptionEn: 'Shopee operation specialist for market, product, shop, brand and keyword analysis.',
    avatar: 'catalog/covers/expert-shopee-ops.png',
    initialStatus: 'enabled',
    order: 12,
  },
  {
    id: 'youtube-creator-expert',
    name: 'YouTube创作者专家',
    nameEn: 'YouTube Creator Expert',
    description: '帮助商家利用Topview自有创作者池数据寻找和评估YouTube创作者。',
    descriptionEn: 'Help merchants find and evaluate YouTube creators using Topview self-owned creator... pool data.',
    avatar: 'catalog/covers/expert-youtube-creator.png',
    initialStatus: 'enabled',
    order: 13,
  },
  {
    id: 'amazon-ops-expert',
    name: '亚马逊运营专家',
    nameEn: 'Amazon Ops Expert',
    description: '亚马逊市场、产品、列表、关键词、评论和风险分析运营专家。',
    descriptionEn: 'Amazon operation specialist for market, product, listing, keyword, review and risk... analysis.',
    avatar: 'catalog/covers/expert-amazon-ops.png',
    initialStatus: 'enabled',
    order: 14,
  },
  {
    id: 'tiktok-shop-ops-expert',
    name: 'TikTok Shop运营专家',
    nameEn: 'TikTok Shop Ops Expert',
    description: '负责TikTok Shop趋势、产品、素材、内容、联盟、广告和直播运营的专家。',
    descriptionEn: 'TikTok Shop operation specialist for trends, products, materials, content, affiliates, ads and live... ops.',
    avatar: 'catalog/covers/expert-tiktok-shop-ops.png',
    initialStatus: 'enabled',
    order: 15,
  },
  {
    id: 'media-creator',
    name: '媒体创作者',
    nameEn: 'Media Creator',
    description: 'AI内容生成：使用Topview AI创意工具生成视频、图像、数字替身、背景移除、文本转语音和语音克隆。',
    descriptionEn: 'AI content generation: videos, images, digital avatars, background removal, TTS, and... voice cloning using Topview AI',
    avatar: 'catalog/covers/expert-media-creator.png',
    initialStatus: 'available',
    order: 16,
  },
  {
    id: 'html-generator',
    name: 'HTML生成器',
    nameEn: 'HTML Generator',
    description: '根据数据或描述生成美观的HTML网页，支持数据可视化和报告展示',
    descriptionEn: '根据数据或描述生成美观的HTML网页，支持数据可视化和报告展示',
    avatar: 'catalog/covers/expert-html-generator.png',
    initialStatus: 'available',
    order: 17,
  },
  {
    id: 'amazon-operations-expert',
    name: '亚马逊运营专家',
    nameEn: 'Amazon Operations Expert',
    description: '专注于亚马逊店铺运营、商品详情优化、广告投放和竞争对手分析，以提高转化率和销售额。',
    descriptionEn: 'Focused on Amazon store operations, listing optimization, advertising, and competitor... analysis to improve conversion',
    avatar: 'catalog/covers/expert-amazon-operations.png',
    initialStatus: 'coming_soon',
    order: 18,
  },
  {
    id: 'tiktok-ecommerce-expert',
    name: 'TikTok电商专家',
    nameEn: 'TikTok Ecommerce Expert',
    description: '擅长TikTok短视频销售、创作者合作和增长策略，帮助品牌在TikTok Shop上推出产品。',
    descriptionEn: 'Expert in TikTok short-video selling, creator partnerships, and growth strategies to help... brands launch on TikTok Shop.',
    avatar: 'catalog/covers/expert-tiktok-ecommerce.png',
    initialStatus: 'coming_soon',
    order: 19,
  },
]

export function getMarketExpertStatus(home: string, exp: MarketExpertItem): 'enabled' | 'available' | 'coming_soon' {
  if (exp.initialStatus === 'coming_soon') return 'coming_soon'
  const presetDir = join(home, '.agent-presets', exp.id)
  if (existsSync(join(presetDir, 'preset.yml'))) return 'enabled'
  return 'available'
}

export function installMarketExpertPreset(home: string, exp: MarketExpertItem): void {
  const dir = join(home, '.agent-presets', exp.id)
  mkdirSync(dir, { recursive: true })
  const presetYml = `name: ${exp.name}\ndescription: ${exp.description}\norder: ${exp.order}\n`
  writeFileSync(join(dir, 'preset.yml'), presetYml, 'utf8')
  const cordisYml = `# ${exp.id} Agent Preset
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: |
      你是「${exp.name}」AI Agent专家。${exp.description}，工作目录 {{cwd}}。
- id: agent-instructions
  name: '@deepseek-ai/dsh-agent-instructions'
  config:
    maxBytes: 65536
- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: !!js process.platform === 'win32'
- id: tool-pwsh
  name: '@deepseek-ai/dsh-tool-pwsh'
  disabled: !!js process.platform !== 'win32'
- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'
- id: tool-fs-search
  name: '@deepseek-ai/dsh-tool-fs-search'
- id: tool-subagent
  name: '@deepseek-ai/dsh-tool-subagent'
- id: tool-subagent-fork
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: fork
    toolName: subagent_fork
    backgroundMode: continuable
`
  writeFileSync(join(dir, 'agent.cordis.yml'), cordisYml, 'utf8')
}

export function disableMarketExpertPreset(home: string, id: string): void {
  const dir = join(home, '.agent-presets', id)
  const retiredDir = join(home, '.agent-presets', '.retired')
  mkdirSync(retiredDir, { recursive: true })
  if (existsSync(dir)) {
    const dest = join(retiredDir, `${id}-${Date.now()}`)
    try {
      rmSync(dest, { recursive: true, force: true })
      renameSync(dir, dest)
    } catch {
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

export async function handleApi(req: IncomingMessage, res: ServerResponse, cfg: PluginConfig): Promise<void> {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const body = req.method === 'POST' ? await readBody(req) : {}
    const method = String(body.method || url.searchParams.get('method') || 'search')

    // 严格 HTTP Method 与写操作来源防伪隔离 (Issue #33)
    const isMutating = MUTATING_METHODS.has(method) || (method === 'config' && Boolean(body.save))
    if (isMutating) {
      if (req.method !== 'POST') {
        return sendJson(res, 405, { ok: false, error: 'Method Not Allowed: mutating operations require POST' })
      }
      if (!trustedRestartRequest(req)) {
        return sendJson(res, 403, { ok: false, error: 'Forbidden: mutating operations are limited to same-origin requests' })
      }
    }
    if (method === 'search') {
      const query = String(body.query || url.searchParams.get('query') || '').trim()
      const category = parseCategory(body.category || url.searchParams.get('category'))
      const explicit = Number(body.limit)
      const limit = Number.isFinite(explicit) && explicit > 0 ? clamp(explicit, 1, 80) : cfg.maxResults
      const offset = Math.max(0, Math.floor(Number(body.offset) || 0))
      const installed = await installedSlugs(cfg.skillsDir)
      const result = await aggregateSkillSearch(query, {
        cfg,
        queries: body.queries,
        category,
        sortBy: sanitizeSortBy(body.sortBy, query ? cfg.sortBy : 'downloads'),
        limit,
        offset,
        installed,
        channels: body.channels,
      })
      // P0：评分惰性 SWR —— 不 await，不挡 search 返回。失败静默。
      void attachRatings(result.items, cfg).catch(() => {})
      return sendJson(res, 200, { ok: true, ...result })
    }
    if (method === 'ratings') {
      const rawSlugs = Array.isArray(body.slugs) ? body.slugs : String(body.slugs || url.searchParams.get('slugs') || '').split(',')
      const slugs = rawSlugs.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 24)
      const ratings: Record<string, number> = {}
      await Promise.all(slugs.map(async (slug) => {
        try {
          const score = await fetchEvalScore(slug, cfg)
          if (score != null) ratings[slug] = score
        } catch { /* skip */ }
      }))
      return sendJson(res, 200, { ok: true, ratings })
    }
    if (method === 'install') {
      if (!trustedRestartRequest(req)) return sendJson(res, 403, { ok: false, error: 'install is limited to same-origin requests' })
      const slug = String(body.slug || url.searchParams.get('slug') || '').trim()
      if (!slug) return sendJson(res, 400, { ok: false, error: '缺少 slug' })
      const version = String(body.version || url.searchParams.get('version') || '').trim()
      const result = await installSkill(slug, cfg, undefined, undefined, version || undefined, body.catalogId ? String(body.catalogId) : undefined)
      return sendJson(res, 200, { ok: true, ...result })
    }
    if (method === 'list') {
      const items = await listInstalled(cfg.skillsDir)
      return sendJson(res, 200, { ok: true, skillsDir: cfg.skillsDir, items })
    }
    if (method === 'uninstall') {
      if (!trustedRestartRequest(req)) return sendJson(res, 403, { ok: false, error: 'uninstall is limited to same-origin requests' })
      const slug = String(body.slug || url.searchParams.get('slug') || '').trim()
      if (!slug) return sendJson(res, 400, { ok: false, error: '缺少 slug' })
      const result = await uninstallSkill(slug, cfg.skillsDir)
      return sendJson(res, 200, { ok: true, ...result })
    }
    if (method === 'config') {
      if (body.save) {
        // 与 pluginRestart 同闸：跨站 / 无 Origin 的 save 不得改 Host 配置
        if (!trustedRestartRequest(req)) {
          return sendJson(res, 403, { ok: false, error: 'config save is limited to same-origin requests' })
        }
        assignConfig(cfg, sanitizePatch(body))
        writeOverlay(cfg)
        configureHttpJsonCache({ ttlMs: Math.max(15, cfg.plazaCacheTtlSec) * 1000 })
      }
      return sendJson(res, 200, { ok: true, ...publicConfig(cfg) })
    }
    if (method === 'updateCheck') {
      // fork 已分叉（改名 omnimux-market）：上游 release 会覆盖改名，自更新禁用。
      // 客户端更新提示由响应里的 latest 字段驱动，这里不返回它即可自然隐藏。
      return sendJson(res, 200, { ok: true, disabled: true, reason: 'fork 已禁用自更新，更新走 omnimux-dsh 仓库' })
    }
    if (method === 'update') {
      return sendJson(res, 200, { ok: true, disabled: true, reason: 'fork 已禁用自更新，更新走 omnimux-dsh 仓库' })
    }
    if (method === 'pluginCategories') {
      const items = await listPluginCategories(cfg)
      return sendJson(res, 200, { ok: true, items })
    }
    if (method === 'plugins') {
      try {
        const result = await listPlugins(cfg, {
          q: body.q ?? body.query ?? url.searchParams.get('q'),
          scope: body.scope ?? url.searchParams.get('scope'),
          category: body.category ?? url.searchParams.get('category'),
          sort: body.sort ?? url.searchParams.get('sort'),
          page: body.page ?? url.searchParams.get('page'),
          pageSize: body.pageSize ?? body.limit ?? url.searchParams.get('page_size') ?? url.searchParams.get('pageSize'),
        })
        return sendJson(res, 200, { ok: true, ...result })
      } catch (err: unknown) {
        if (cfg.aggregateRemoteSoftFail) {
          return sendJson(res, 200, {
            ok: true,
            items: [],
            total: 0,
            page: 1,
            pageSize: 24,
            apiBase: cfg.apiBase,
            webBase: cfg.webBase,
            warning: err instanceof Error ? err.message : String(err),
          })
        }
        throw err
      }
    }
    if (method === 'pluginInstall') {
      if (!trustedRestartRequest(req)) return sendJson(res, 403, { ok: false, error: 'pluginInstall is limited to same-origin requests' })
      const result = await withPluginInstallLock(() => installMarketPlugin(
        {
          owner: body.owner ?? url.searchParams.get('owner'),
          name: body.name ?? url.searchParams.get('name'),
          fullName: body.fullName ?? url.searchParams.get('fullName'),
        },
        cfg,
      ))
      return sendJson(res, 200, { ok: true, ...result })
    }
    if (method === 'pluginInstallStatus') {
      return sendJson(res, 200, {
        ok: true,
        ...publicInstallStatus(),
        busy: isPluginInstallBusy() || progress.active,
        restart: true,
        boot: BOOT_ID,
      })
    }
    if (method === 'pluginRestart') {
      if (!trustedRestartRequest(req)) return sendJson(res, 403, { ok: false, error: 'restart is limited to same-origin requests' })
      if (isPluginInstallBusy() || progress.active) return sendJson(res, 409, { ok: false, error: 'cannot restart while a plugin operation is running' })
      if (restarting) return sendJson(res, 409, { ok: false, error: 'restart already scheduled' })
      restarting = true
      try {
        const result = scheduleRestart(servingPort(req))
        return sendJson(res, 202, { ok: true, pid: result.pid, helperPid: result.helperPid, via: result.via })
      } catch (err) {
        restarting = false
        throw err
      }
    }
    if (method === 'detail') {
      const slug = parseSlug(String(body.slug || url.searchParams.get('slug') || ''))
      const installed = await installedSlugs(cfg.skillsDir)
      const [card, rating] = await Promise.all([
        fetchSkillCard(slug, cfg, installed),
        fetchEvalScore(slug, cfg),
      ])
      if (card && rating != null) card.rating = rating
      return sendJson(res, 200, {
        ok: true,
        slug,
        installed: installed.has(slug),
        version: card?.version || '',
        card,
      })
    }
    if (method === 'skillTab') {
      const slug = parseSlug(String(body.slug || url.searchParams.get('slug') || ''))
      const tab = String(body.tab || url.searchParams.get('tab') || '').trim()
      if (!tab) return sendJson(res, 400, { ok: false, error: '缺少 tab' })
      const result = await fetchSkillTab(slug, tab, cfg)
      return sendJson(res, 200, { ok: true, slug, ...result })
    }
    if (method === 'skillContent') {
      const slug = parseSlug(String(body.slug || url.searchParams.get('slug') || ''))
      const candidates = [
        join(cfg.skillsDir, slug),
        join(process.env.HOME || '', '.omnimux-dev/skills', slug),
        join(process.env.HOME || '', '.dsh/skills', slug),
        join(packageRoot(), 'catalog/skills', slug),
        join(packageRoot(), 'catalog/experts', slug),
        join('/Users/x/Desktop/Project/Github/OmniMux-skills/skills', slug),
        join('/Users/x/Desktop/Project/OPC/资产库/skills', 'OmniMux-skills-' + slug),
        join('/Users/x/Desktop/Project/OPC/资产库/skills', slug),
        join('/Users/x/Desktop/Project/Github/workbuddyskills/skills', slug),
      ]
      let skillDir = ''
      for (const c of candidates) {
        if (existsSync(join(c, 'SKILL.md'))) {
          skillDir = c
          break
        }
      }
      if (skillDir) {
        try {
          const files = readdirSync(skillDir, { withFileTypes: true })
          const tree: Array<{ name: string, isDir: boolean, children?: string[] }> = []
          for (const f of files) {
            if (f.name.startsWith('.')) continue
            if (f.isDirectory()) {
              let children: string[] = []
              try { children = readdirSync(join(skillDir, f.name)).filter((c) => !c.startsWith('.')) } catch {}
              tree.push({ name: f.name, isDir: true, children })
            } else {
              tree.push({ name: f.name, isDir: false })
            }
          }
          const skillMd = readFileSync(join(skillDir, 'SKILL.md'), 'utf8')
          let metaYaml = ''
          if (existsSync(join(skillDir, 'meta.yaml'))) {
            metaYaml = readFileSync(join(skillDir, 'meta.yaml'), 'utf8')
          }
          return sendJson(res, 200, { ok: true, found: true, tree, skillMd, metaYaml })
        } catch {}
      }
      return sendJson(res, 200, { ok: true, found: false })
    }
    if (method === 'homeCustomOrder') {
      const configPath = join(packageRoot(), 'catalog', 'skill-recommendations.json')
      if (req.method === 'POST') {
        const order = Array.isArray(body.order) ? body.order.map(String) : []
        try {
          if (existsSync(configPath) && order.length > 0) {
            const raw = JSON.parse(readFileSync(configPath, 'utf8'))
            raw.homeRecommendations = order
            writeFileSync(configPath, JSON.stringify(raw, null, 2) + '\n')
          }
        } catch {}
        return sendJson(res, 200, { ok: true, order })
      }
      let currentOrder: string[] = []
      try {
        if (existsSync(configPath)) {
          const raw = JSON.parse(readFileSync(configPath, 'utf8'))
          currentOrder = Array.isArray(raw.homeRecommendations) ? raw.homeRecommendations : []
        }
      } catch {}
      return sendJson(res, 200, { ok: true, order: currentOrder })
    }
    if (method === 'expertMarketList') {
      const home = expertRoots().home
      const items = DEFAULT_MARKET_EXPERTS.map((exp) => ({
        ...exp,
        status: getMarketExpertStatus(home, exp),
      }))
      return sendJson(res, 200, { ok: true, items })
    }
    if (method === 'expertMarketInstall') {
      const id = String(body.id || url.searchParams.get('id') || '').trim()
      if (!id) return sendJson(res, 400, { ok: false, error: '缺少 id' })
      const exp = DEFAULT_MARKET_EXPERTS.find((it) => it.id === id)
      if (!exp) return sendJson(res, 400, { ok: false, error: `unknown expert ${id}` })
      const home = expertRoots().home
      installMarketExpertPreset(home, exp)
      return sendJson(res, 200, { ok: true, id, status: 'enabled' })
    }
    if (method === 'expertMarketDisable') {
      const id = String(body.id || url.searchParams.get('id') || '').trim()
      if (!id) return sendJson(res, 400, { ok: false, error: '缺少 id' })
      const home = expertRoots().home
      disableMarketExpertPreset(home, id)
      return sendJson(res, 200, { ok: true, id, status: 'available' })
    }
    if (method === 'experts') {
      const doc = decorateCatalog(loadCatalog(), expertRoots())
      const titles = new Map(doc.categories.map((c: { id: string, title: string }) => [c.id, c.title]))
      const items = doc.items
        .filter((it: { tab: string }) => it.tab === 'experts')
        .map((it: Record<string, unknown>) => catalogCard(it, titles.get(String(it.category)) || ''))
      const categories = doc.categories.filter((c: { tab: string }) => c.tab === 'experts')
      return sendJson(res, 200, { ok: true, items, categories })
    }
    if (method === 'connectors') {
      // P0：广场连接器 Tab 读 WorkBuddy 本地市场全量，不过滤 visible_in。
      // 安装仍属下一刀；本接口只负责展示。
      const { items, categories } = listMarketplaceConnectors()
      return sendJson(res, 200, { ok: true, items, categories, source: 'workbuddy-marketplace' })
    }
    if (method === 'catalogInstall') {
      if (!trustedRestartRequest(req)) return sendJson(res, 403, { ok: false, error: 'catalogInstall is limited to same-origin requests' })
      const id = String(body.id || url.searchParams.get('id') || '').trim()
      if (!id) return sendJson(res, 400, { ok: false, error: '缺少 id' })
      const result = await withConnectorPatchLock(() => Promise.resolve(
        installItem({ catalog: loadCatalog(), id, ...expertRoots() }) as Record<string, unknown>,
      ))
      return sendJson(res, 200, { ok: true, ...result })
    }
    if (method === 'catalogSummon') {
      if (!trustedRestartRequest(req)) return sendJson(res, 403, { ok: false, error: 'catalogSummon is limited to same-origin requests' })
      const id = String(body.id || url.searchParams.get('id') || '').trim()
      if (!id) return sendJson(res, 400, { ok: false, error: '缺少 id' })
      const sessionState = body.sessionState === 'blank' ? 'blank' : 'locked'
      const catalog = loadCatalog()
      const item = findItem(catalog, id) as Record<string, unknown> | undefined
      const result = summonItem({ catalog, id, sessionState, ...expertRoots() }) as Record<string, unknown>
      const sessionId = String(body.sessionId || url.searchParams.get('sessionId') || '').trim()
      let attached = false
      if (sessionId && result.skill) {
        writeSessionExpert(expertRoots().home, sessionId, {
          id: String(result.id || id),
          skill: String(result.skill),
          title: String(item?.title || result.id || id),
          kind: String(item?.kind || 'expert'),
        })
        attached = true
      }
      return sendJson(res, 200, { ok: true, ...result, attached, sessionId: attached ? sessionId : '' })
    }
    if (method === 'catalogUninstall') {
      if (!trustedRestartRequest(req)) return sendJson(res, 403, { ok: false, error: 'catalogUninstall is limited to same-origin requests' })
      const id = String(body.id || url.searchParams.get('id') || '').trim()
      if (!id) return sendJson(res, 400, { ok: false, error: '缺少 id' })
      const item = findItem(loadCatalog(), id)
      if (!item) return sendJson(res, 400, { ok: false, error: `unknown item ${id}` })
      // 本期只支持连接器卸载（删托管段 MCP 行）；专家/技能卸载留给后续版本
      if (item.kind !== 'connector') return sendJson(res, 400, { ok: false, error: `item ${id} is not a connector` })
      await withConnectorPatchLock(async () => {
        removeMcpRow(expertRoots().profileDir, item)
      })
      return sendJson(res, 200, { ok: true, id, installed: false, kind: 'connector' })
    }
    sendJson(res, 400, { ok: false, error: 'unknown method' })
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

export async function handleIcon(req: IncomingMessage, res: ServerResponse, cfg: PluginConfig): Promise<void> {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const target = url.searchParams.get('url') || ''

    // 本地市场 icons/<id>.* —— 只读 marketplace-icon:<id>，禁止任意路径。
    const local = resolveMarketplaceIconFile(target)
    if (local) {
      const body = readFileSync(local.path)
      res.statusCode = 200
      res.setHeader('content-type', local.contentType)
      res.setHeader('cache-control', 'public, max-age=3600')
      res.end(body)
      return
    }

    // 本地 catalog 封面图 catalog/covers/<filename>
    if (target.startsWith('catalog/covers/')) {
      const fileName = target.slice('catalog/covers/'.length)
      if (/^(?:home\/)?[a-z0-9][a-z0-9-]*\.(png|jpg|jpeg|webp)$/.test(fileName)) {
        const coverPath = join(packageRoot(), 'catalog', 'covers', fileName)
        if (existsSync(coverPath)) {
          const body = readFileSync(coverPath)
          const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
          const contentType = ext === '.webp' ? 'image/webp' : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'image/png'
          res.statusCode = 200
          res.setHeader('content-type', contentType)
          res.setHeader('cache-control', 'public, max-age=3600')
          res.end(body)
          return
        }
      }
    }

    if (!/^https:\/\//i.test(target)) {
      res.statusCode = 400
      res.end('bad url')
      return
    }
    const { body, contentType } = await fetchBytes(target, { timeoutMs: Math.min(cfg.timeoutMs, 15000), userAgent: cfg.userAgent })
    res.statusCode = 200
    res.setHeader('content-type', contentType.startsWith('image/') ? contentType : 'image/png')
    res.setHeader('cache-control', 'public, max-age=3600')
    res.end(body)
  } catch (err) {
    res.statusCode = 502
    res.end(err instanceof Error ? err.message : 'icon failed')
  }
}

async function attachRatings(items: SkillCard[], cfg: PluginConfig): Promise<void> {
  await Promise.all(items.slice(0, 24).map(async (it) => {
    const rating = await fetchEvalScore(it.slug, cfg)
    if (rating != null) it.rating = rating
  }))
}

/** Roots the bundled catalog installs against: DSH home, target profile, package root. */
function expertRoots(): { home: string, profileDir: string, packageRoot: string } {
  const home = dshHome()
  return { home, profileDir: profileDir(home), packageRoot: packageRoot() }
}

/** Map one bundled-catalog item onto the shared card shape the client renders. */
function catalogCard(item: Record<string, unknown>, categoryTitle: string): Record<string, unknown> {
  const subtitle = typeof item.subtitle === 'string' ? item.subtitle : ''
  const summary = typeof item.summary === 'string' ? item.summary : ''
  return {
    id: item.id,
    slug: item.id,
    name: item.title,
    description: subtitle ? `${subtitle} · ${summary}` : summary,
    iconUrl: item.avatar || '',
    category: item.category,
    categoryLabel: categoryTitle,
    installed: item.installed === true,
    kind: item.kind,
    gesture: item.skill ? `/${item.skill}` : '',
  }
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  res.statusCode = code
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}
