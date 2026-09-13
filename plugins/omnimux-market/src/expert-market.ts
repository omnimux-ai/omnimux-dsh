/**
 * @file plugins/omnimux-market/src/expert-market.ts
 * 专家市场数据层：出厂内置 Agent 预设 + 预设市场专家 + 磁盘实际预设的聚合。
 *
 * 三个来源：
 * 1. 出厂内置 Agent 预设（tiktok-agent / standard / daily-work / cordis / ptc / minimal）——随应用分发，恒为已入职；
 * 2. 预设市场专家（DEFAULT_MARKET_EXPERTS）——按需安装到 ~/.dsh/.agent-presets/<id>/；
 * 3. ~/.dsh/.agent-presets/ 下真实存在的预设目录（如用户自建的 software-company）——动态扫描，
 *    含被禁用后移入 .retired 的预设（标记为已离职，可重新聘用）。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

export interface MarketExpertItem {
  id: string
  name: string
  nameEn: string
  description: string
  descriptionEn: string
  avatar: string
  initialStatus: 'enabled' | 'available' | 'disabled' | 'coming_soon'
  order: number
}

export type MarketExpertStatus = MarketExpertItem['initialStatus']

/** 条目来源：出厂内置预设 / 市场专家定义 / 磁盘已装预设 / 已离职预设。 */
export type MarketExpertSource = 'builtin' | 'preset' | 'installed' | 'retired'

export interface MarketExpertEntry extends MarketExpertItem {
  status: MarketExpertStatus
  source: MarketExpertSource
}

/** preset.yml 中可被专家市场消费的字段。 */
export interface AgentPresetMeta {
  name?: string
  description?: string
  nameEn?: string
  descriptionEn?: string
  avatar?: string
  order?: number
}

/** 出厂内置 Agent 预设：随应用分发，不伪造用户级副本。 */
export const BUILTIN_AGENT_PRESETS: MarketExpertItem[] = [
  {
    id: 'tiktok-agent',
    name: '全能社媒操盘手',
    nameEn: 'Social Media Lead',
    description: '全域社媒爆款创作与矩阵运营增长。',
    descriptionEn: 'Full-funnel social hit creation and matrix growth operations.',
    avatar: '',
    initialStatus: 'enabled',
    order: 1,
  },
  {
    id: 'standard',
    name: '代码开发',
    nameEn: 'CodeDev',
    description: '全栈架构设计、代码编写与工程交付。',
    descriptionEn: 'Full-stack architecture design, coding and engineering delivery.',
    avatar: '',
    initialStatus: 'enabled',
    order: 2,
  },
  {
    id: 'daily-work',
    name: '日常工作',
    nameEn: 'WorkAssistant',
    description: '日常办公协同、文档拟定与事务闭环。',
    descriptionEn: 'Daily office collaboration, document drafting and closure of errands.',
    avatar: '',
    initialStatus: 'enabled',
    order: 3,
  },
  {
    id: 'cordis',
    name: '创造模式',
    nameEn: 'Creator Mode',
    description: '插件实验开发、运行时检查与团队搭建。',
    descriptionEn: 'Plugin experimentation, runtime inspection and team composition.',
    avatar: '',
    initialStatus: 'enabled',
    order: 4,
  },
  {
    id: 'ptc',
    name: 'PTC 模式',
    nameEn: 'PTC Mode',
    description: '功能完整的编码 Agent，但默认不提供 workflow 工具；其他工具通过 PTC 模式 SDK 呈现，让模型用一个 TypeScript 程序组合多步操作。',
    descriptionEn: 'A full-featured coding agent without the workflow tool by default; other tools surface through the PTC SDK so the model composes multi-step work in one TypeScript program.',
    avatar: '',
    initialStatus: 'enabled',
    order: 5,
  },
  {
    id: 'minimal',
    name: '极简模式',
    nameEn: 'Minimal Mode',
    description: '仅提供持久 shell 的单工具编码 Agent。',
    descriptionEn: 'A single-tool coding agent that only offers a persistent shell.',
    avatar: '',
    initialStatus: 'enabled',
    order: 6,
  },
]

const BUILTIN_AGENT_PRESET_IDS = new Set(BUILTIN_AGENT_PRESETS.map((preset) => preset.id))

/** 预设市场专家（无需本地预设文件即可展示与安装）。 */
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
    descriptionEn: 'Help merchants find and evaluate YouTube creators using Topview self-owned creator pool data.',
    avatar: 'catalog/covers/expert-youtube-creator.png',
    initialStatus: 'enabled',
    order: 13,
  },
  {
    id: 'amazon-ops-expert',
    name: '亚马逊运营专家',
    nameEn: 'Amazon Ops Expert',
    description: '亚马逊市场、产品、列表、关键词、评论和风险分析运营专家。',
    descriptionEn: 'Amazon operation specialist for market, product, listing, keyword, review and risk analysis.',
    avatar: 'catalog/covers/expert-amazon-ops.png',
    initialStatus: 'enabled',
    order: 14,
  },
  {
    id: 'tiktok-shop-ops-expert',
    name: 'TikTok Shop运营专家',
    nameEn: 'TikTok Shop Ops Expert',
    description: '负责TikTok Shop趋势、产品、素材、内容、联盟、广告和直播运营的专家。',
    descriptionEn: 'TikTok Shop operation specialist for trends, products, materials, content, affiliates, ads and live ops.',
    avatar: 'catalog/covers/expert-tiktok-shop-ops.png',
    initialStatus: 'enabled',
    order: 15,
  },
  {
    id: 'media-creator',
    name: '媒体创作者',
    nameEn: 'Media Creator',
    description: 'AI内容生成：使用Topview AI创意工具生成视频、图像、数字替身、背景移除、文本转语音和语音克隆。',
    descriptionEn: 'AI content generation: videos, images, digital avatars, background removal, TTS, and voice cloning using Topview AI',
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
    descriptionEn: 'Focused on Amazon store operations, listing optimization, advertising, and competitor analysis to improve conversion',
    avatar: 'catalog/covers/expert-amazon-operations.png',
    initialStatus: 'available',
    order: 18,
  },
  {
    id: 'tiktok-ecommerce-expert',
    name: 'TikTok电商专家',
    nameEn: 'TikTok Ecommerce Expert',
    description: '擅长TikTok短视频销售、创作者合作和增长策略，帮助品牌在TikTok Shop上推出产品。',
    descriptionEn: 'Expert in TikTok short-video selling, creator partnerships, and growth strategies to help brands launch on TikTok Shop.',
    avatar: 'catalog/covers/expert-tiktok-ecommerce.png',
    initialStatus: 'available',
    order: 19,
  },
]

/** 静态清单 = 出厂内置预设 + 预设市场专家，数组顺序即默认展示顺序。 */
export const STATIC_MARKET_EXPERTS: MarketExpertItem[] = [...BUILTIN_AGENT_PRESETS, ...DEFAULT_MARKET_EXPERTS]

// ─────────────────────────────────────────────────────────────
// 磁盘扫描
// ─────────────────────────────────────────────────────────────

/** 预设根目录（用户预设与 .retired 归档均在此）。 */
export function agentPresetRoot(home: string): string {
  return join(home, '.agent-presets')
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * 是否为出厂内置 Agent 预设（随应用分发，不由本插件伪造用户级副本）。
 *
 * @param id 预设 id
 * @returns 是否内置
 */
export function isBuiltinAgentPreset(id: string): boolean {
  return BUILTIN_AGENT_PRESET_IDS.has(id)
}

/**
 * ~/.dsh/.agent-presets/<id>/preset.yml 是否存在。
 *
 * @param home DSH home 目录
 * @param id 预设 id
 * @returns 是否已安装
 */
export function isAgentPresetInstalled(home: string, id: string): boolean {
  return existsSync(join(agentPresetRoot(home), id, 'preset.yml'))
}

/**
 * 解析 .retired 里的条目名 → 原始预设 id。
 * 禁用时写入 `<id>-<毫秒时间戳>`，这里剥离时间戳后缀，避免误伤自带数字的 id。
 *
 * @param name .retired 下的目录/文件名
 * @returns 原始预设 id
 */
export function retireEntryId(name: string): string {
  return name.replace(/-\d{9,}$/, '')
}

function retiredEntries(home: string): string[] {
  const dir = join(agentPresetRoot(home), '.retired')
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function hasRetiredEntry(home: string, id: string): boolean {
  return retiredEntries(home).some((name) => retireEntryId(name) === id)
}

/** 内置预设的离职标记只认标记文件：出厂预设目录不会被搬走。 */
function hasRetiredMarker(home: string, id: string): boolean {
  const dir = join(agentPresetRoot(home), '.retired')
  return retiredEntries(home).some((name) => {
    if (retireEntryId(name) !== id) return false
    try {
      return !statSync(join(dir, name)).isDirectory()
    } catch {
      return false
    }
  })
}

/**
 * 读取一个 preset.yml 的展示字段；文件缺失或不可解析时返回 null。
 *
 * @param presetFile preset.yml 绝对路径
 * @returns 元信息或 null
 */
export function readAgentPresetMeta(presetFile: string): AgentPresetMeta | null {
  if (!existsSync(presetFile)) return null
  let raw = ''
  try {
    raw = readFileSync(presetFile, 'utf8')
  } catch {
    return null
  }
  const parsed = parsePresetYaml(raw)
  if (!parsed) return null
  const order = Number(parsed.order)
  return {
    name: typeof parsed.name === 'string' ? parsed.name : undefined,
    description: typeof parsed.description === 'string' ? parsed.description : undefined,
    nameEn: typeof parsed.nameEn === 'string' ? parsed.nameEn : undefined,
    descriptionEn: typeof parsed.descriptionEn === 'string' ? parsed.descriptionEn : undefined,
    avatar: typeof parsed.avatar === 'string' ? parsed.avatar : undefined,
    order: Number.isFinite(order) ? order : undefined,
  }
}

function parsePresetYaml(raw: string): Record<string, unknown> | null {
  try {
    const doc = parseYaml(raw)
    if (doc && typeof doc === 'object') return doc as Record<string, unknown>
  } catch {
    // 落到下面的逐行兜底解析
  }
  const fallback: Record<string, unknown> = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/.exec(line.trim())
    if (!match) continue
    const value = match[2].trim().replace(/^['"]|['"]$/g, '')
    if (value) fallback[match[1]] = value
  }
  return Object.keys(fallback).length > 0 ? fallback : null
}

/** 由 id + preset.yml 元信息构造展示条目；缺名字时退回 id，保证卡片不空。 */
function buildScannedExpert(id: string, meta: AgentPresetMeta, initialStatus: MarketExpertStatus): MarketExpertItem {
  const name = meta.name || id
  const description = meta.description || ''
  return {
    id,
    name,
    nameEn: meta.nameEn || name,
    description,
    descriptionEn: meta.descriptionEn || description,
    avatar: meta.avatar || '',
    initialStatus,
    order: typeof meta.order === 'number' ? meta.order : 100,
  }
}

function compareExpertOrder(a: MarketExpertItem, b: MarketExpertItem): number {
  if (a.order !== b.order) return a.order - b.order
  return a.id.localeCompare(b.id)
}

/**
 * 扫描 ~/.dsh/.agent-presets/ 下真实存在的预设目录（跳过隐藏目录与 .retired）。
 *
 * @param home DSH home 目录
 * @returns 已装预设条目（按 order 排序）
 */
export function scanInstalledAgentPresets(home: string): MarketExpertItem[] {
  const root = agentPresetRoot(home)
  if (!isDirectory(root)) return []
  let entries: string[] = []
  try {
    entries = readdirSync(root)
  } catch {
    return []
  }
  const items: MarketExpertItem[] = []
  for (const name of entries) {
    if (name.startsWith('.')) continue
    if (!isDirectory(join(root, name))) continue
    const meta = readAgentPresetMeta(join(root, name, 'preset.yml'))
    if (!meta) continue
    items.push(buildScannedExpert(name, meta, 'enabled'))
  }
  return items.sort(compareExpertOrder)
}

/**
 * 扫描 .retired 归档，让已离职的自定义预设仍可见、可重新聘用。
 *
 * @param home DSH home 目录
 * @returns 已离职条目（按 order 排序）
 */
export function scanRetiredAgentPresets(home: string): MarketExpertItem[] {
  const dir = join(agentPresetRoot(home), '.retired')
  if (!isDirectory(dir)) return []
  const items: MarketExpertItem[] = []
  const seen = new Set<string>()
  for (const name of retiredEntries(home)) {
    if (name.startsWith('.')) continue
    const id = retireEntryId(name)
    if (seen.has(id)) continue
    const meta = readAgentPresetMeta(join(dir, name, 'preset.yml'))
    if (!meta) continue
    seen.add(id)
    items.push(buildScannedExpert(id, meta, 'disabled'))
  }
  return items.sort(compareExpertOrder)
}

// ─────────────────────────────────────────────────────────────
// 状态与聚合
// ─────────────────────────────────────────────────────────────

/**
 * 计算单个专家的市场状态。
 *
 * 判定顺序：即将推出 → 出厂内置 → 磁盘已装 → 已离职归档 → 定义里的初始状态。
 * 内置预设恒为已入职，只有用户在市场里显式离职（.retired 标记）后才变为已离职。
 *
 * @param home DSH home 目录
 * @param exp 专家定义
 * @returns 市场状态
 */
export function getMarketExpertStatus(home: string, exp: MarketExpertItem): MarketExpertStatus {
  if (exp.initialStatus === 'coming_soon') return 'coming_soon'
  if (isBuiltinAgentPreset(exp.id)) return hasRetiredMarker(home, exp.id) ? 'disabled' : 'enabled'
  if (isAgentPresetInstalled(home, exp.id)) return 'enabled'
  if (hasRetiredEntry(home, exp.id)) return 'disabled'
  return exp.initialStatus
}

/**
 * 静态定义与磁盘 preset.yml 合并：静态定义的展示字段优先，磁盘仅补齐缺失项。
 *
 * @param exp 静态定义
 * @param meta 磁盘 preset.yml 元信息（可为 null）
 * @returns 合并后的条目
 */
export function mergeMarketExpertMeta(exp: MarketExpertItem, meta: AgentPresetMeta | null): MarketExpertItem {
  if (!meta) return { ...exp }
  return {
    ...exp,
    name: exp.name || meta.name || exp.id,
    nameEn: exp.nameEn || meta.nameEn || meta.name || exp.id,
    description: exp.description || meta.description || '',
    descriptionEn: exp.descriptionEn || meta.descriptionEn || meta.description || '',
    avatar: exp.avatar || meta.avatar || '',
    order: exp.order,
  }
}

/**
 * 专家市场完整清单：静态定义（内置预设 + 市场专家）在前，磁盘实际预设随后，已离职的排最后。
 *
 * @param home DSH home 目录
 * @returns 带状态与来源的条目列表
 */
export function listMarketExperts(home: string): MarketExpertEntry[] {
  const entries: MarketExpertEntry[] = []
  const seen = new Set<string>()

  for (const exp of STATIC_MARKET_EXPERTS) {
    const meta = readAgentPresetMeta(join(agentPresetRoot(home), exp.id, 'preset.yml'))
    const merged = mergeMarketExpertMeta(exp, meta)
    const builtin = isBuiltinAgentPreset(exp.id)
    entries.push({
      ...merged,
      status: getMarketExpertStatus(home, merged),
      source: builtin ? 'builtin' : (meta ? 'installed' : 'preset'),
    })
    seen.add(exp.id)
  }

  for (const item of scanInstalledAgentPresets(home)) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    entries.push({ ...item, status: 'enabled', source: 'installed' })
  }

  for (const item of scanRetiredAgentPresets(home)) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    entries.push({ ...item, status: 'disabled', source: 'retired' })
  }

  return entries
}

/**
 * 按 id 解析专家定义（静态定义 ∪ 磁盘预设 ∪ 已离职预设）。
 *
 * @param home DSH home 目录
 * @param id 预设 id
 * @returns 专家定义或 null
 */
export function findMarketExpert(home: string, id: string): MarketExpertItem | null {
  const hit = listMarketExperts(home).find((item) => item.id === id)
  if (!hit) return null
  const { status: _status, source: _source, ...item } = hit
  return item
}

// ─────────────────────────────────────────────────────────────
// 安装 / 禁用
// ─────────────────────────────────────────────────────────────

function resolveExpertPersonaText(exp: MarketExpertItem): string {
  if (exp.id === 'amazon-operations-expert') {
    return '你是「亚马逊运营专家」AI Agent专家。深度精通亚马逊全流程运营管理：Listing 多语言与 A+ 页面优化、关键词与类目排名提升、Buy Box 竞价与广告投放（PPC）策略、竞品数据深度分析与买家评论风险监控，助力店铺持续提升转化率与销售额。工作目录 {{cwd}}。'
  }
  if (exp.id === 'tiktok-ecommerce-expert') {
    return '你是「TikTok电商专家」AI Agent专家。精通 TikTok 短视频带货销售体系、爆款 3 秒 Hook 创意脚本、Creator Marketplace 达人建联与带货策略、TikTok Shop 算法推荐与海外商业化变现，帮助出海品牌与卖家在 TikTok 上高效打造爆款。工作目录 {{cwd}}。'
  }
  return `你是「${exp.name}」AI Agent专家。${exp.description}，工作目录 {{cwd}}。`
}

function buildPresetYml(exp: MarketExpertItem): string {
  return `name: ${exp.name}\ndescription: ${exp.description}\norder: ${exp.order}\n`
}

function buildCordisYml(exp: MarketExpertItem): string {
  const personaText = resolveExpertPersonaText(exp)
  return `# ${exp.id} Agent Preset
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    prefix: |
      ${personaText}
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
}

/**
 * 清除 .retired 中该 id 的离职标记文件（重新聘用时调用）。
 * 只删除标记文件，归档的预设目录一律保留，避免误删用户此前的预设内容。
 *
 * @param home DSH home 目录
 * @param id 预设 id
 */
function clearRetiredMarkers(home: string, id: string): void {
  const dir = join(agentPresetRoot(home), '.retired')
  if (!isDirectory(dir)) return
  for (const name of retiredEntries(home)) {
    if (retireEntryId(name) !== id) continue
    try {
      if (statSync(join(dir, name)).isDirectory()) continue
      rmSync(join(dir, name), { force: true })
    } catch {}
  }
}

/**
 * 把 .retired 里的预设目录搬回原位（保留用户自定义内容，绝不重建副本）。
 *
 * 只服务于自定义/市场预设：出厂内置预设随应用分发，其 `.retired` 目录可能来自
 * 内置预设出现在市场之前的旧副本，一律不得当成用户级副本还原（调用方须先判定）。
 *
 * @param home DSH home 目录
 * @param id 预设 id
 * @returns 是否发生了还原
 */
function restoreRetiredPreset(home: string, id: string): boolean {
  const active = join(agentPresetRoot(home), id)
  if (existsSync(active)) return false
  const dir = join(agentPresetRoot(home), '.retired')
  if (!isDirectory(dir)) return false
  const candidates = retiredEntries(home)
    .filter((name) => retireEntryId(name) === id)
    .filter((name) => existsSync(join(dir, name, 'preset.yml')))
    .sort()
  const latest = candidates[candidates.length - 1]
  if (!latest) return false
  try {
    renameSync(join(dir, latest), active)
    return true
  } catch {
    return false
  }
}

/**
 * 安装（或重新聘用）一个专家预设。
 *
 * - 已离职的预设优先原样还原，保留用户此前的自定义内容；
 * - 出厂内置预设随应用分发，只清除离职标记，不伪造用户级副本；
 * - 其余按需创建 preset.yml 与 agent.cordis.yml，已存在的定义一律不覆盖。
 *
 * @param home DSH home 目录
 * @param exp 专家定义
 */
export function installMarketExpertPreset(home: string, exp: MarketExpertItem): void {
  // 内置判定必须先于离职还原：.retired 里的旧副本是过期归档，不得冒充用户预设覆盖出厂定义。
  if (isBuiltinAgentPreset(exp.id)) {
    clearRetiredMarkers(home, exp.id)
    return
  }
  if (restoreRetiredPreset(home, exp.id)) {
    clearRetiredMarkers(home, exp.id)
    return
  }
  clearRetiredMarkers(home, exp.id)
  const dir = join(agentPresetRoot(home), exp.id)
  mkdirSync(dir, { recursive: true })
  if (!existsSync(join(dir, 'preset.yml'))) writeFileSync(join(dir, 'preset.yml'), buildPresetYml(exp), 'utf8')
  if (!existsSync(join(dir, 'agent.cordis.yml'))) writeFileSync(join(dir, 'agent.cordis.yml'), buildCordisYml(exp), 'utf8')
}

/**
 * 禁用（离职）一个专家预设。
 *
 * - 出厂内置预设只写离职标记，不移动应用自带定义；
 * - 其余预设目录整体移入 .retired，便于原样还原。
 *
 * @param home DSH home 目录
 * @param id 预设 id
 */
export function disableMarketExpertPreset(home: string, id: string): void {
  const dir = join(agentPresetRoot(home), id)
  const retiredDir = join(agentPresetRoot(home), '.retired')
  mkdirSync(retiredDir, { recursive: true })
  if (isBuiltinAgentPreset(id)) {
    clearRetiredMarkers(home, id)
    try {
      writeFileSync(join(retiredDir, `${id}-${Date.now()}`), '', 'utf8')
    } catch {}
    return
  }
  if (existsSync(dir)) {
    const dest = join(retiredDir, `${id}-${Date.now()}`)
    try {
      rmSync(dest, { recursive: true, force: true })
      renameSync(dir, dest)
    } catch {
      rmSync(dir, { recursive: true, force: true })
    }
  } else {
    try {
      writeFileSync(join(retiredDir, `${id}-${Date.now()}`), '', 'utf8')
    } catch {}
  }
}
