/**
 * @file plugins/omnimux-market/src/expert-market.ts
 * Dedicated data structures and preset installers for Market Experts.
 * Aligned with official @deepseek-ai/dsh-agent-presets as Single Source of Truth.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { healInstalledAgentPresets, writeAgentPreset } from './expert-presets.js'
import { generatePixelAvatarDataUrl } from './expert/pixel-avatar.js'

export interface MarketExpertItem {
  id: string
  name: string
  nameEn: string
  description: string
  descriptionEn: string
  avatar: string
  initialStatus: 'enabled' | 'available' | 'disabled' | 'coming_soon'
  order: number
  group?: 'ecommerce' | 'system' | 'custom'
  trust?: 'system' | 'user'
  status?: 'enabled' | 'available' | 'disabled' | 'coming_soon'
}

export interface DiscoveredPresetRef {
  id: string
  name?: string
  description?: string
  order?: number
  trust?: 'system' | 'user'
  broken?: string
}

/** 出海专精专家核心阵容（5 位精细化专精角色，已移除 html-generator 与粗糙版重复项） */
export const DEFAULT_MARKET_EXPERTS: MarketExpertItem[] = [
  {
    id: 'shopee-ops-expert',
    name: 'Shopee运营专家',
    nameEn: 'Shopee Ops Expert',
    description: '负责市场、产品、店铺、品牌和关键词分析的Shopee运营专员。',
    descriptionEn: 'Shopee operation specialist for market, product, shop, brand and keyword analysis.',
    avatar: generatePixelAvatarDataUrl('shopee-ops-expert', { size: 96 }),
    initialStatus: 'enabled',
    order: 12,
    group: 'ecommerce',
  },
  {
    id: 'youtube-creator-expert',
    name: 'YouTube创作者专家',
    nameEn: 'YouTube Creator Expert',
    description: '帮助商家利用Topview自有创作者池数据寻找和评估YouTube创作者。',
    descriptionEn: 'Help merchants find and evaluate YouTube creators using Topview self-owned creator pool data.',
    avatar: generatePixelAvatarDataUrl('youtube-creator-expert', { size: 96 }),
    initialStatus: 'enabled',
    order: 13,
    group: 'ecommerce',
  },
  {
    id: 'amazon-operations-expert',
    name: '亚马逊运营专家',
    nameEn: 'Amazon Operations Expert',
    description: '专注于亚马逊店铺运营、商品详情优化、广告投放和竞争对手分析，以提高转化率和销售额。',
    descriptionEn: 'Focused on Amazon store operations, listing optimization, advertising, and competitor analysis to improve conversion',
    avatar: generatePixelAvatarDataUrl('amazon-operations-expert', { size: 96 }),
    initialStatus: 'enabled',
    order: 14,
    group: 'ecommerce',
  },
  {
    id: 'tiktok-ecommerce-expert',
    name: 'TikTok电商专家',
    nameEn: 'TikTok Ecommerce Expert',
    description: '擅长TikTok短视频销售、创作者合作和增长策略，帮助品牌在TikTok Shop上推出产品。',
    descriptionEn: 'Expert in TikTok short-video selling, creator partnerships, and growth strategies to help brands launch on TikTok Shop.',
    avatar: generatePixelAvatarDataUrl('tiktok-ecommerce-expert', { size: 96 }),
    initialStatus: 'enabled',
    order: 15,
    group: 'ecommerce',
  },
  {
    id: 'media-creator',
    name: '媒体创作者',
    nameEn: 'Media Creator',
    description: 'AI内容生成：使用Topview AI创意工具生成视频、图像、数字替身、背景移除、文本转语音和语音克隆。',
    descriptionEn: 'AI content generation: videos, images, digital avatars, background removal, TTS, and voice cloning using Topview AI',
    avatar: generatePixelAvatarDataUrl('media-creator', { size: 96 }),
    initialStatus: 'available',
    order: 16,
    group: 'ecommerce',
  },
]

/** 官方系统预设的增强元数据字典 */
export const SYSTEM_PRESET_METADATA: Record<string, { name: string, nameEn: string, description: string, descriptionEn: string, order: number }> = {
  standard: {
    name: '代码开发',
    nameEn: 'Code Developer',
    description: '全栈软件工程、代码重构、测试编写与系统架构设计。',
    descriptionEn: 'Full-stack software engineering, refactoring, testing and architecture.',
    order: 1,
  },
  'drama-agent': {
    name: '短剧专家',
    nameEn: 'Short Drama Expert',
    description: '短剧漫剧策划、剧本拆解、分镜编排与出海译制发行。',
    descriptionEn: 'Short drama planning, script breakdown, storyboard and distribution.',
    order: 2,
  },
  'tiktok-agent': {
    name: 'TikTok运营专家团',
    nameEn: 'TikTok Ops Team',
    description: 'TikTok 全链路爆款视频创作、带货选品、互动截流与投流增长。',
    descriptionEn: 'Full-funnel TikTok viral content creation, product selection, engagement and paid growth.',
    order: 3,
  },
  'omni-agent': {
    name: '社媒专家',
    nameEn: 'Social Media Expert',
    description: '全平台社媒营销操盘、跨渠道爆款内容创作与品牌心智建设。',
    descriptionEn: 'Multi-platform social media marketing, content creation and brand building.',
    order: 4,
  },
  'marketing-agent': {
    name: '营销专家',
    nameEn: 'Marketing Expert',
    description: '全域营销战略策划、高转化文案撰写与品牌获客增长。',
    descriptionEn: 'Marketing strategy, high-converting copywriting and user acquisition.',
    order: 5,
  },
  'marketing-growth-team': {
    name: '增长专家团',
    nameEn: 'Growth Team',
    description: '数据驱动的漏斗分析、病毒传播机制与规模化增长试验。',
    descriptionEn: 'Data-driven funnel optimization, viral loops and scalable growth experimentation.',
    order: 6,
  },
  'daily-work': {
    name: '日常工作',
    nameEn: 'Daily Work',
    description: '通用办公助理，协助文档处理、日常沟通、会议纪要与信息整理。',
    descriptionEn: 'General office assistant for documentation, communication and notes.',
    order: 7,
  },
  'software-company': {
    name: '软件开发团队',
    nameEn: 'Software Company',
    description: '多角色协同交付团队，涵盖架构师、前端、后端、QA、产品与审查员。',
    descriptionEn: 'Multi-role collaborative software delivery team.',
    order: 8,
  },
}

export function getMarketExpertStatus(home: string, exp: MarketExpertItem): 'enabled' | 'available' | 'disabled' | 'coming_soon' {
  if (exp.initialStatus === 'coming_soon') return 'coming_soon'
  const presetDir = join(home, '.agent-presets', exp.id)
  if (existsSync(join(presetDir, 'preset.yml'))) return 'enabled'
  const retiredDir = join(home, '.agent-presets', '.retired')
  if (existsSync(retiredDir)) {
    try {
      const files = readdirSync(retiredDir)
      if (files.some((f) => f === exp.id || f.startsWith(`${exp.id}-`))) {
        return 'disabled'
      }
    } catch {}
  }
  return exp.initialStatus
}

function resolveExpertPersonaText(exp: MarketExpertItem): string {
  if (exp.id === 'amazon-operations-expert') {
    return '你是「亚马逊运营专家」AI Agent专家。深度精通亚马逊全流程运营管理：Listing 多语言与 A+ 页面优化、关键词与类目排名提升、Buy Box 竞价与广告投放（PPC）策略、竞品数据深度分析与买家评论风险监控，助力店铺持续提升转化率与销售额。工作目录 {{cwd}}。'
  }
  if (exp.id === 'tiktok-ecommerce-expert') {
    return '你是「TikTok电商专家」AI Agent专家。精通 TikTok 短视频带货销售体系、爆款 3 秒 Hook 创意脚本、Creator Marketplace 达人建联与带货策略、TikTok Shop 算法推荐与海外商业化变现，帮助出海品牌与卖家在 TikTok 上高效打造爆款。工作目录 {{cwd}}。'
  }
  return `你是「${exp.name}」AI Agent专家。${exp.description}，工作目录 {{cwd}}。`
}

export function installMarketExpertPreset(home: string, exp: MarketExpertItem): void {
  writeAgentPreset(home, {
    id: exp.id,
    name: exp.name,
    description: exp.description,
    order: exp.order,
    persona: resolveExpertPersonaText(exp),
  })
  const retiredDir = join(home, '.agent-presets', '.retired')
  if (existsSync(retiredDir)) {
    try {
      const files = readdirSync(retiredDir)
      for (const f of files) {
        if (f === exp.id || f.startsWith(`${exp.id}-`)) {
          rmSync(join(retiredDir, f), { recursive: true, force: true })
        }
      }
    } catch {}
  }
}

/**
 * 启动物化：把初始状态为「已入职」（initialStatus === 'enabled'）但尚未落盘的
 * 市场专家补写进 `<home>/.agent-presets/`，让卡片状态与 Agent 预设列表真实一致。
 *
 * 幂等：preset.yml 已存在则跳过；尊重用户禁用：.retired 中有标记的不复活；
 * 单个专家写盘失败静默跳过，绝不阻塞插件激活。
 *
 * @returns 本次真正补写的专家 id 列表。
 */
export function materializeEnabledMarketExperts(home: string): string[] {
  healInstalledAgentPresets(home)
  const installed: string[] = []
  for (const exp of DEFAULT_MARKET_EXPERTS) {
    if (exp.initialStatus !== 'enabled') continue
    const presetDir = join(home, '.agent-presets', exp.id)
    if (existsSync(join(presetDir, 'preset.yml'))) continue
    if (getMarketExpertStatus(home, exp) !== 'enabled') continue
    try {
      installMarketExpertPreset(home, exp)
      installed.push(exp.id)
    } catch {}
  }
  return installed
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
  } else {
    try {
      writeFileSync(join(retiredDir, `${id}-${Date.now()}`), '', 'utf8')
    } catch {}
  }
}

/** 辅助：从本地磁盘目录扫描预设（单测与离线环境兜底） */
function scanLocalPresets(home: string): DiscoveredPresetRef[] {
  const presets: DiscoveredPresetRef[] = []
  const userRoot = join(home, '.agent-presets')
  if (existsSync(userRoot)) {
    try {
      const entries = readdirSync(userRoot, { withFileTypes: true })
      for (const ent of entries) {
        if (!ent.isDirectory() || ent.name.startsWith('.')) continue
        const presetDir = join(userRoot, ent.name)
        const ymlPath = join(presetDir, 'preset.yml')
        if (existsSync(ymlPath)) {
          let name = ent.name
          let description = ''
          let order = 20
          try {
            const raw = readFileSync(ymlPath, 'utf8')
            const nameMatch = raw.match(/^name:\s*(.+)$/m)
            if (nameMatch) name = nameMatch[1].trim()
            const descMatch = raw.match(/^description:\s*(.+)$/m)
            if (descMatch) description = descMatch[1].trim()
            const orderMatch = raw.match(/^order:\s*(\d+)$/m)
            if (orderMatch) order = Number(orderMatch[1])
          } catch {}
          presets.push({ id: ent.name, name, description, order, trust: 'user' })
        }
      }
    } catch {}
  }
  return presets
}

/**
 * 核心归一化聚合：全面对齐官方 ctx.agentPresets.list() 动态扫描结果。
 * 融合「出海专精专家」、「官方系统团队」与「用户自建 Agent」为统一全景列表。
 */
export function reconcileMarketExperts(
  home: string,
  officialPresets?: DiscoveredPresetRef[],
): MarketExpertItem[] {
  const effectivePresets = (officialPresets && officialPresets.length > 0)
    ? officialPresets
    : scanLocalPresets(home)

  const itemsMap = new Map<string, MarketExpertItem>()

  // 1. 基底：出海专精专家（5 位）
  for (const exp of DEFAULT_MARKET_EXPERTS) {
    const curStatus = getMarketExpertStatus(home, exp)
    itemsMap.set(exp.id, {
      ...exp,
      group: 'ecommerce',
      status: curStatus,
    })
  }

  // 2. 融合官方预设列表（包括系统级预设与用户自建预设）
  for (const p of effectivePresets) {
    if (!p.id || p.id === 'html-generator') continue // 彻底过滤 html-generator

    if (itemsMap.has(p.id)) {
      // 若该出海专家存在于生效预设中且未被显式 retired，且不是 coming_soon，锁定为已入职
      const existing = itemsMap.get(p.id)!
      if (existing.status !== 'disabled' && existing.status !== 'coming_soon') {
        existing.status = 'enabled'
      }
      continue
    }

    // 过滤已被废弃的粗糙版专家
    if (p.id === 'amazon-ops-expert' || p.id === 'tiktok-shop-ops-expert') {
      continue
    }

    if (p.trust === 'system' || SYSTEM_PRESET_METADATA[p.id]) {
      // 官方系统预设团队
      const meta = SYSTEM_PRESET_METADATA[p.id]
      itemsMap.set(p.id, {
        id: p.id,
        name: meta?.name || p.name || p.id,
        nameEn: meta?.nameEn || p.name || p.id,
        description: meta?.description || p.description || '',
        descriptionEn: meta?.descriptionEn || p.description || '',
        avatar: generatePixelAvatarDataUrl(p.id, { size: 96 }),
        initialStatus: 'enabled',
        status: 'enabled',
        order: meta?.order ?? (p.order ?? 50),
        group: 'system',
        trust: 'system',
      })
    } else {
      // 用户通过「创建 Agent」新建的本地专属 Agent
      itemsMap.set(p.id, {
        id: p.id,
        name: p.name || p.id,
        nameEn: p.name || p.id,
        description: p.description || '',
        descriptionEn: p.description || '',
        avatar: generatePixelAvatarDataUrl(p.id, { size: 96 }),
        initialStatus: 'enabled',
        status: 'enabled',
        order: p.order ?? 80,
        group: 'custom',
        trust: 'user',
      })
    }
  }

  const allItems = Array.from(itemsMap.values())
  // 保持按 group 与 order 稳定排序：出海专精(ecommerce) > 系统预装(system) > 用户自建(custom)
  const groupWeight: Record<string, number> = { ecommerce: 0, system: 1, custom: 2 }
  return allItems.sort((a, b) => {
    const wA = groupWeight[a.group || 'ecommerce'] ?? 99
    const wB = groupWeight[b.group || 'ecommerce'] ?? 99
    if (wA !== wB) return wA - wB
    return (a.order ?? 999) - (b.order ?? 999)
  })
}
