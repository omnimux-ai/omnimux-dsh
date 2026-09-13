/**
 * @file plugins/omnimux-market/src/expert-market.ts
 * Dedicated data structures and preset installers for Market Experts.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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
  const dir = join(home, '.agent-presets', exp.id)
  mkdirSync(dir, { recursive: true })
  const presetYml = `name: ${exp.name}\ndescription: ${exp.description}\norder: ${exp.order}\n`
  writeFileSync(join(dir, 'preset.yml'), presetYml, 'utf8')
  const personaText = resolveExpertPersonaText(exp)
  const cordisYml = `# ${exp.id} Agent Preset
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
  writeFileSync(join(dir, 'agent.cordis.yml'), cordisYml, 'utf8')
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
