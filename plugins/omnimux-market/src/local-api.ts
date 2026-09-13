import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
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
export async function handleWorkshopApi(
  req: IncomingMessage,
  res: ServerResponse,
  method: WorkshopReadMethod,
  host: WorkshopApiHost,
  authorization: WorkshopReadAuthorization,
): Promise<void> {
  try {
    await new RequestGuard(authorization).authorizeHeaders(req, method)
    if (!WORKSHOP_READ_METHODS.includes(method)) throw new WorkshopReadError('INVALID_REQUEST', 400)
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (
      (req.url?.length || 0) > 8192 ||
      [...url.searchParams.keys()].some((key) => key !== 'request') ||
      url.searchParams.getAll('request').length > 1
    ) {
      throw new WorkshopReadError('INVALID_REQUEST', 400)
    }

    const raw = url.searchParams.get('request')
    let result: unknown
    if (method === 'workshopCapabilities' || method === 'workshopInventory') {
      if (raw !== null) throw new WorkshopReadError('INVALID_REQUEST', 400)
      result = await host[method](req)
    } else {
      if (!raw) throw new WorkshopReadError('INVALID_REQUEST', 400)
      let input: unknown
      try {
        input = JSON.parse(raw)
      } catch {
        throw new WorkshopReadError('INVALID_REQUEST', 400)
      }
      result =
        method === 'workshopQuery'
          ? await host.workshopQuery(req, input as WorkshopQueryRequest)
          : await host.workshopDetail(req, input as WorkshopDetailRequest)
    }
    res.setHeader('cache-control', 'no-store')
    return sendJson(res, 200, { ok: true, ...(result as object) })
  } catch (error) {
    const isWorkshopError = error instanceof WorkshopReadError || error instanceof WorkshopQueryError
    const code = isWorkshopError ? error.code : 'CAPABILITY_UNAVAILABLE'
    let status = 503
    if (error instanceof WorkshopReadError) {
      status = error.status
    } else if (code === 'INVALID_REQUEST') {
      status = 400
    } else if (code === 'CURSOR_EXPIRED') {
      status = 409
    }
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
  'setModelSelection',
])

export {
  type MarketExpertItem,
  type MarketExpertEntry,
  BUILTIN_AGENT_PRESETS,
  DEFAULT_MARKET_EXPERTS,
  STATIC_MARKET_EXPERTS,
  getMarketExpertStatus,
  listMarketExperts,
  findMarketExpert,
  installMarketExpertPreset,
  disableMarketExpertPreset,
} from './expert-market.js'

import {
  type MarketExpertItem,
  findMarketExpert,
  installMarketExpertPreset,
  disableMarketExpertPreset,
  listMarketExperts,
} from './expert-market.js'

interface ApiContext {
  req: IncomingMessage
  res: ServerResponse
  cfg: PluginConfig
  url: URL
  body: Record<string, any>
  method: string
}

type ApiMethodHandler = (ctx: ApiContext) => Promise<void> | void

// --- 独立领域 Handler 路由实现 ---

async function handleSearch(ctx: ApiContext): Promise<void> {
  const { body, url, cfg, res } = ctx
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
  void attachRatings(result.items, cfg).catch(() => {})
  return sendJson(res, 200, { ok: true, ...result })
}

async function handleRatings(ctx: ApiContext): Promise<void> {
  const { body, url, cfg, res } = ctx
  const rawSlugs = Array.isArray(body.slugs)
    ? body.slugs
    : String(body.slugs || url.searchParams.get('slugs') || '').split(',')
  const slugs = rawSlugs.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 24)
  const ratings: Record<string, number> = {}
  await Promise.all(
    slugs.map(async (slug) => {
      try {
        const score = await fetchEvalScore(slug, cfg)
        if (score != null) ratings[slug] = score
      } catch {}
    }),
  )
  return sendJson(res, 200, { ok: true, ratings })
}

async function handleSkillInstall(ctx: ApiContext): Promise<void> {
  const { req, res, body, url, cfg } = ctx
  if (!trustedRestartRequest(req)) return sendJson(res, 403, { ok: false, error: 'install is limited to same-origin requests' })
  const slug = String(body.slug || url.searchParams.get('slug') || '').trim()
  if (!slug) return sendJson(res, 400, { ok: false, error: '缺少 slug' })
  const version = String(body.version || url.searchParams.get('version') || '').trim()
  const result = await installSkill(slug, cfg, undefined, undefined, version || undefined, body.catalogId ? String(body.catalogId) : undefined)
  return sendJson(res, 200, { ok: true, ...result })
}

async function handleSkillList(ctx: ApiContext): Promise<void> {
  const items = await listInstalled(ctx.cfg.skillsDir)
  return sendJson(ctx.res, 200, { ok: true, skillsDir: ctx.cfg.skillsDir, items })
}

async function handleSkillUninstall(ctx: ApiContext): Promise<void> {
  const { req, res, body, url, cfg } = ctx
  if (!trustedRestartRequest(req)) return sendJson(res, 403, { ok: false, error: 'uninstall is limited to same-origin requests' })
  const slug = String(body.slug || url.searchParams.get('slug') || '').trim()
  if (!slug) return sendJson(res, 400, { ok: false, error: '缺少 slug' })
  const result = await uninstallSkill(slug, cfg.skillsDir)
  return sendJson(res, 200, { ok: true, ...result })
}

async function handleConfigRoute(ctx: ApiContext): Promise<void> {
  const { req, res, body, cfg } = ctx
  if (body.save) {
    if (!trustedRestartRequest(req)) {
      return sendJson(res, 403, { ok: false, error: 'config save is limited to same-origin requests' })
    }
    assignConfig(cfg, sanitizePatch(body))
    writeOverlay(cfg)
    configureHttpJsonCache({ ttlMs: Math.max(15, cfg.plazaCacheTtlSec) * 1000 })
  }
  return sendJson(res, 200, { ok: true, ...publicConfig(cfg) })
}

function handleUpdateCheck(ctx: ApiContext): void {
  return sendJson(ctx.res, 200, { ok: true, disabled: true, reason: 'fork 已禁用自更新，更新走 omnimux-dsh 仓库' })
}

function handleUpdate(ctx: ApiContext): void {
  return sendJson(ctx.res, 200, { ok: true, disabled: true, reason: 'fork 已禁用自更新，更新走 omnimux-dsh 仓库' })
}

async function handlePluginCategoriesRoute(ctx: ApiContext): Promise<void> {
  const items = await listPluginCategories(ctx.cfg)
  return sendJson(ctx.res, 200, { ok: true, items })
}

async function handlePluginsRoute(ctx: ApiContext): Promise<void> {
  const { body, url, cfg, res } = ctx
  try {
    const q = body.q ?? body.query ?? url.searchParams.get('q')
    const scope = body.scope ?? url.searchParams.get('scope')
    const category = body.category ?? url.searchParams.get('category')
    const sort = body.sort ?? url.searchParams.get('sort')
    const page = body.page ?? url.searchParams.get('page')
    const pageSize = body.pageSize ?? body.limit ?? url.searchParams.get('page_size') ?? url.searchParams.get('pageSize')
    const result = await listPlugins(cfg, { q, scope, category, sort, page, pageSize })
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

async function handlePluginInstallRoute(ctx: ApiContext): Promise<void> {
  const { req, res, body, url, cfg } = ctx
  if (!trustedRestartRequest(req)) return sendJson(res, 403, { ok: false, error: 'pluginInstall is limited to same-origin requests' })
  const owner = body.owner ?? url.searchParams.get('owner')
  const name = body.name ?? url.searchParams.get('name')
  const fullName = body.fullName ?? url.searchParams.get('fullName')
  const result = await withPluginInstallLock(() => installMarketPlugin({ owner, name, fullName }, cfg))
  return sendJson(res, 200, { ok: true, ...result })
}

function handlePluginInstallStatusRoute(ctx: ApiContext): void {
  return sendJson(ctx.res, 200, {
    ok: true,
    ...publicInstallStatus(),
    busy: isPluginInstallBusy() || progress.active,
    restart: true,
    boot: BOOT_ID,
  })
}

function handlePluginRestartRoute(ctx: ApiContext): void {
  const { req, res } = ctx
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

async function handleSkillDetail(ctx: ApiContext): Promise<void> {
  const { body, url, cfg, res } = ctx
  const slug = parseSlug(String(body.slug || url.searchParams.get('slug') || ''))
  const installed = await installedSlugs(cfg.skillsDir)
  const card = await fetchSkillCard(slug, cfg, installed)
  const tab = String(body.tab || url.searchParams.get('tab') || 'readme')
  const content = await fetchSkillTab(slug, tab, cfg)
  return sendJson(res, 200, { ok: true, card, tab, content })
}

function resolveExploreDirectory(slug: string, skillsDir: string): string {
  const candidates = [
    join(skillsDir, slug),
    join(process.env.HOME || '', '.omnimux-dev/skills', slug),
    join(process.env.HOME || '', '.dsh/skills', slug),
    join(packageRoot(), 'catalog/skills', slug),
    join(packageRoot(), 'catalog/experts', slug),
    join('/Users/x/Desktop/Project/Github/OmniMux-skills/skills', slug),
    join('/Users/x/Desktop/Project/OPC/资产库/skills', 'OmniMux-skills-' + slug),
    join('/Users/x/Desktop/Project/OPC/资产库/skills', slug),
    join('/Users/x/Desktop/Project/Github/workbuddyskills/skills', slug),
  ]
  for (const c of candidates) {
    if (existsSync(join(c, 'SKILL.md'))) return c
  }
  return ''
}

function handleSkillContent(ctx: ApiContext): void {
  const { body, url, cfg, res } = ctx
  const slug = parseSlug(String(body.slug || url.searchParams.get('slug') || ''))
  if (!slug) return sendJson(res, 400, { ok: false, error: '缺少 slug' })

  const skillDir = resolveExploreDirectory(slug, cfg.skillsDir)
  if (!skillDir) return sendJson(res, 200, { ok: true, found: false })

  try {
    const files = readdirSync(skillDir, { withFileTypes: true })
    const tree: Array<{ name: string, isDir: boolean, children?: string[] }> = []
    for (const f of files) {
      if (f.name.startsWith('.')) continue
      if (f.isDirectory()) {
        let children: string[] = []
        try {
          children = readdirSync(join(skillDir, f.name)).filter((c) => !c.startsWith('.'))
        } catch {}
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
  return sendJson(res, 200, { ok: true, found: false })
}

async function handleSkillTab(ctx: ApiContext): Promise<void> {
  const { body, url, cfg, res } = ctx
  const slug = parseSlug(String(body.slug || url.searchParams.get('slug') || ''))
  const tab = String(body.tab || url.searchParams.get('tab') || '').trim()
  if (!tab) return sendJson(res, 400, { ok: false, error: '缺少 tab' })
  const result = await fetchSkillTab(slug, tab, cfg)
  return sendJson(res, 200, { ok: true, slug, ...result })
}

function handleHomeCustomOrder(ctx: ApiContext): void {
  const { req, res, body } = ctx
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

/**
 * 专家市场清单：内置 Agent 预设 + 预设市场专家 + ~/.dsh/.agent-presets 实际预设（含已离职归档）。
 */
function handleExpertMarketList(ctx: ApiContext): void {
  const home = expertRoots().home
  const items = listMarketExperts(home)
  return sendJson(ctx.res, 200, { ok: true, items })
}

function handleExpertMarketInstall(ctx: ApiContext): void {
  const { body, url, res } = ctx
  const id = String(body.id || url.searchParams.get('id') || '').trim()
  if (!id) return sendJson(res, 400, { ok: false, error: '缺少 id' })
  const home = expertRoots().home
  const exp: MarketExpertItem | null = findMarketExpert(home, id)
  if (!exp) return sendJson(res, 400, { ok: false, error: `unknown expert ${id}` })
  installMarketExpertPreset(home, exp)
  return sendJson(res, 200, { ok: true, id, status: 'enabled' })
}

function handleExpertMarketDisable(ctx: ApiContext): void {
  const { body, url, res } = ctx
  const id = String(body.id || url.searchParams.get('id') || '').trim()
  if (!id) return sendJson(res, 400, { ok: false, error: '缺少 id' })
  const home = expertRoots().home
  disableMarketExpertPreset(home, id)
  return sendJson(res, 200, { ok: true, id, status: 'disabled' })
}

function handleExperts(ctx: ApiContext): void {
  const doc = decorateCatalog(loadCatalog(), expertRoots())
  const titles = new Map(doc.categories.map((c: { id: string, title: string }) => [c.id, c.title]))
  const items = doc.items
    .filter((it: { tab: string }) => it.tab === 'experts')
    .map((it: Record<string, unknown>) => catalogCard(it, titles.get(String(it.category)) || ''))
  const categories = doc.categories.filter((c: { tab: string }) => c.tab === 'experts')
  return sendJson(ctx.res, 200, { ok: true, items, categories })
}

function handleConnectors(ctx: ApiContext): void {
  const { items, categories } = listMarketplaceConnectors()
  return sendJson(ctx.res, 200, { ok: true, items, categories, source: 'workbuddy-marketplace' })
}

async function handleCatalogInstall(ctx: ApiContext): Promise<void> {
  const { req, res, body, url } = ctx
  if (!trustedRestartRequest(req)) return sendJson(res, 403, { ok: false, error: 'catalogInstall is limited to same-origin requests' })
  const id = String(body.id || url.searchParams.get('id') || '').trim()
  if (!id) return sendJson(res, 400, { ok: false, error: '缺少 id' })
  const result = await withConnectorPatchLock(() =>
    Promise.resolve(installItem({ catalog: loadCatalog(), id, ...expertRoots() }) as Record<string, unknown>),
  )
  return sendJson(res, 200, { ok: true, ...result })
}

function handleCatalogSummon(ctx: ApiContext): void {
  const { req, res, body, url } = ctx
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
      kind: String(item?.kind || 'expert') as 'expert' | 'team',
    })
    attached = true
  }
  return sendJson(res, 200, { ok: true, ...result, attached, sessionId: attached ? sessionId : '' })
}

async function handleCatalogUninstall(ctx: ApiContext): Promise<void> {
  const { req, res, body, url } = ctx
  if (!trustedRestartRequest(req)) return sendJson(res, 403, { ok: false, error: 'catalogUninstall is limited to same-origin requests' })
  const id = String(body.id || url.searchParams.get('id') || '').trim()
  if (!id) return sendJson(res, 400, { ok: false, error: '缺少 id' })
  const item = findItem(loadCatalog(), id)
  if (!item) return sendJson(res, 400, { ok: false, error: `unknown item ${id}` })
  if (item.kind !== 'connector') return sendJson(res, 400, { ok: false, error: `item ${id} is not a connector` })
  await withConnectorPatchLock(async () => {
    removeMcpRow(expertRoots().profileDir, item)
  })
  return sendJson(res, 200, { ok: true, id, installed: false, kind: 'connector' })
}

export interface SessionModelChoice {
  auto: boolean
  selectedModel: {
    id: string
    name: string
    capsuleName?: string
    type: 'video' | 'image'
    icon?: string
    subtitle?: string
  } | null
}

export const sessionModelStore = new Map<string, SessionModelChoice>()

export function getSessionModel(sessionId: string): SessionModelChoice | undefined {
  return sessionModelStore.get(sessionId)
}

export function setSessionModel(sessionId: string, choice: SessionModelChoice): void {
  sessionModelStore.set(sessionId, choice)
}

let activeModelCatalogResolver: (() => Promise<{ video?: any[]; image?: any[] } | null>) | null = null

export function setModelCatalogResolver(resolver: () => Promise<{ video?: any[]; image?: any[] } | null>): void {
  activeModelCatalogResolver = resolver
}

async function handleGetModelCatalog(ctx: ApiContext): Promise<void> {
  const { res } = ctx
  try {
    let catalog: any = null
    if (activeModelCatalogResolver) {
      catalog = await activeModelCatalogResolver()
    }
    return sendJson(res, 200, { ok: true, catalog })
  } catch (err) {
    return sendJson(res, 200, { ok: true, catalog: null })
  }
}

async function handleGetModelSelection(ctx: ApiContext): Promise<void> {
  const { res, url, body } = ctx
  const sessionId = String(body.sessionId || url.searchParams.get('sessionId') || '').trim() || 'default'
  const choice = sessionModelStore.get(sessionId) || { auto: true, selectedModel: null }
  return sendJson(res, 200, { ok: true, sessionId, ...choice })
}

async function handleSetModelSelection(ctx: ApiContext): Promise<void> {
  const { res, body } = ctx
  const sessionId = String(body.sessionId || '').trim() || 'default'
  const auto = body.auto !== false
  const selectedModel = auto ? null : ((body.selectedModel as SessionModelChoice['selectedModel']) || null)
  sessionModelStore.set(sessionId, { auto, selectedModel })
  return sendJson(res, 200, { ok: true, sessionId, auto, selectedModel })
}

const API_ROUTE_TABLE: Record<string, ApiMethodHandler> = {
  search: handleSearch,
  ratings: handleRatings,
  install: handleSkillInstall,
  list: handleSkillList,
  uninstall: handleSkillUninstall,
  config: handleConfigRoute,
  updateCheck: handleUpdateCheck,
  update: handleUpdate,
  pluginCategories: handlePluginCategoriesRoute,
  plugins: handlePluginsRoute,
  pluginInstall: handlePluginInstallRoute,
  pluginInstallStatus: handlePluginInstallStatusRoute,
  pluginRestart: handlePluginRestartRoute,
  detail: handleSkillDetail,
  skillTab: handleSkillTab,
  skillContent: handleSkillContent,
  exploreFile: handleSkillContent,
  homeCustomOrder: handleHomeCustomOrder,
  expertMarketList: handleExpertMarketList,
  expertMarketInstall: handleExpertMarketInstall,
  expertMarketDisable: handleExpertMarketDisable,
  experts: handleExperts,
  connectors: handleConnectors,
  catalogInstall: handleCatalogInstall,
  catalogSummon: handleCatalogSummon,
  catalogUninstall: handleCatalogUninstall,
  getModelCatalog: handleGetModelCatalog,
  getModelSelection: handleGetModelSelection,
  setModelSelection: handleSetModelSelection,
}

export async function handleApi(req: IncomingMessage, res: ServerResponse, cfg: PluginConfig): Promise<void> {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const body = req.method === 'POST' ? await readBody(req) : {}
    const method = String(body.method || url.searchParams.get('method') || 'search')

    const isMutating = MUTATING_METHODS.has(method) || (method === 'config' && Boolean(body.save))
    if (isMutating) {
      if (req.method !== 'POST') {
        return sendJson(res, 405, { ok: false, error: 'Method Not Allowed: mutating operations require POST' })
      }
      if (!trustedRestartRequest(req)) {
        return sendJson(res, 403, { ok: false, error: 'Forbidden: mutating operations are limited to same-origin requests' })
      }
    }

    const handler = API_ROUTE_TABLE[method]
    if (handler) {
      return await handler({ req, res, cfg, url, body, method })
    }

    return sendJson(res, 400, { ok: false, error: 'unknown method' })
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

function detectImageContentType(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
  if (ext === '.webp') return 'image/webp'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.gif') return 'image/gif'
  return 'image/png'
}

function resolveLocalCoverOrAvatar(target: string): { path: string; contentType: string } | null {
  // 1. 本地 catalog 封面图与专家头像 catalog/covers/<filename>
  if (target.startsWith('catalog/covers/')) {
    const fileName = target.slice('catalog/covers/'.length)
    if (/^(?:home\/)?[a-z0-9][a-z0-9-]*\.(png|jpg|jpeg|webp)$/.test(fileName)) {
      const coverPath = join(packageRoot(), 'catalog', 'covers', fileName)
      if (existsSync(coverPath)) {
        return { path: coverPath, contentType: detectImageContentType(fileName) }
      }
    }
  }

  // 2. 本地 catalog 专家头像 catalog/avatars/<path>
  if (target.startsWith('catalog/avatars/')) {
    const rel = target.slice('catalog/avatars/'.length)
    if (/^[a-zA-Z0-9._/-]+\.(png|jpg|jpeg|webp)$/i.test(rel) && !rel.includes('..')) {
      const avatarPath = join(packageRoot(), 'catalog', 'avatars', rel)
      if (existsSync(avatarPath)) {
        return { path: avatarPath, contentType: detectImageContentType(rel) }
      }
    }
  }

  // 3. 映射 workbuddyskills 远程 URL 到本地已有专家库真源，零云端请求
  const wbMatch = target.match(/^https:\/\/raw\.githubusercontent\.com\/infometa\/workbuddyskills\/(?:main|master)\/experts\/([a-zA-Z0-9._-]+)\/avatars\/([a-zA-Z0-9._-]+\.(?:png|jpg|jpeg|webp))$/)
  if (wbMatch) {
    const [, expertId, fileName] = wbMatch
    const candidates = [
      join(packageRoot(), 'catalog', 'avatars', expertId, fileName),
      join(packageRoot(), 'catalog', 'experts', expertId, 'avatars', fileName),
      join(packageRoot(), 'catalog', 'covers', `${expertId}-${fileName}`),
      join(packageRoot(), 'catalog', 'covers', fileName),
      join('/Users/x/Desktop/Project/Github/workbuddyskills/experts', expertId, 'avatars', fileName),
    ]
    for (const c of candidates) {
      if (existsSync(c)) {
        return { path: c, contentType: detectImageContentType(fileName) }
      }
    }
    const wbCacheDir = join(homedir(), '.workbuddy', 'plugins', 'cache', 'experts', expertId)
    if (existsSync(wbCacheDir)) {
      try {
        const versions = readdirSync(wbCacheDir)
        for (const v of versions) {
          const candidate = join(wbCacheDir, v, 'avatars', fileName)
          if (existsSync(candidate)) {
            return { path: candidate, contentType: detectImageContentType(fileName) }
          }
        }
      } catch {}
    }
  }

  return null
}

function getAvatarCacheDir(): string {
  const dir = join(dshHome(), 'cache', 'market-avatars')
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  } catch {}
  return dir
}

function resolveAvatarDiskCache(targetUrl: string): { path: string; contentType: string } | null {
  try {
    const cacheDir = getAvatarCacheDir()
    const hash = createHash('sha256').update(targetUrl).digest('hex')
    const filePath = join(cacheDir, `${hash}.bin`)
    const metaPath = join(cacheDir, `${hash}.meta.json`)
    if (existsSync(filePath) && existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
      return { path: filePath, contentType: meta.contentType || 'image/png' }
    }
  } catch {}
  return null
}

function saveAvatarDiskCache(targetUrl: string, body: Buffer, contentType: string): void {
  try {
    const cacheDir = getAvatarCacheDir()
    const hash = createHash('sha256').update(targetUrl).digest('hex')
    const filePath = join(cacheDir, `${hash}.bin`)
    const metaPath = join(cacheDir, `${hash}.meta.json`)
    writeFileSync(filePath, body)
    writeFileSync(metaPath, JSON.stringify({ url: targetUrl, contentType, savedAt: Date.now() }))
  } catch {}
}

export async function handleIcon(req: IncomingMessage, res: ServerResponse, cfg: PluginConfig): Promise<void> {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const target = url.searchParams.get('url') || ''

    if (target.startsWith('marketplace-icon:')) {
      const id = target.slice('marketplace-icon:'.length)
      const resolved = resolveMarketplaceIconFile(id)
      if (resolved) {
        const bytes = readFileSync(resolved.path)
        res.setHeader('content-type', resolved.contentType)
        res.setHeader('cache-control', 'public, max-age=86400')
        res.end(bytes)
        return
      }
    }

    // 1. 本地真源（内置 covers、avatars、本地专家库镜像）优先，零网络开销
    const local = resolveLocalCoverOrAvatar(target)
    if (local) {
      const bytes = readFileSync(local.path)
      res.statusCode = 200
      res.setHeader('content-type', local.contentType)
      res.setHeader('cache-control', 'public, max-age=86400')
      res.end(bytes)
      return
    }

    // 2. 本地持久化磁盘缓存命中，直接从本地磁盘加载，不走云端
    const cached = resolveAvatarDiskCache(target)
    if (cached) {
      const bytes = readFileSync(cached.path)
      res.statusCode = 200
      res.setHeader('content-type', cached.contentType)
      res.setHeader('cache-control', 'public, max-age=86400')
      res.end(bytes)
      return
    }

    if (!/^https:\/\//i.test(target)) {
      res.statusCode = 400
      res.end('bad url')
      return
    }

    const { body, contentType } = await fetchBytes(target, { timeoutMs: Math.min(cfg.timeoutMs, 15000), userAgent: cfg.userAgent })
    const finalType = contentType.startsWith('image/') ? contentType : 'image/png'

    // 3. 首次拉取后持久化存入本地磁盘缓存，后续请求均本地加载
    saveAvatarDiskCache(target, body, finalType)

    res.statusCode = 200
    res.setHeader('content-type', finalType)
    res.setHeader('cache-control', 'public, max-age=86400')
    res.end(body)
  } catch (err) {
    res.statusCode = 502
    res.end(err instanceof Error ? err.message : 'icon failed')
  }
}

async function attachRatings(items: SkillCard[], cfg: PluginConfig): Promise<void> {
  await Promise.all(
    items.slice(0, 24).map(async (it) => {
      const rating = await fetchEvalScore(it.slug, cfg)
      if (rating != null) it.rating = rating
    }),
  )
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
