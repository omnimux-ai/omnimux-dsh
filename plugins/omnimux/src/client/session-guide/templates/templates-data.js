/**
 * 创意模板核心数据模型与货架配置
 * 统一收敛 Pippit / Creatify / Creatok / Higgsfield / Topview 395+ 套具备分镜与提示词的真模版
 */

import CREATIVE_TEMPLATES_RAW from './creative-templates.json' with { type: 'json' }

/**
 * 7 大核心分类定义（纯净中英双语、Slug、矢量图标名称）
 */
export const TEMPLATE_CATEGORIES = Object.freeze([
  {
    slug: 'all',
    nameZh: '全部货架',
    nameEn: 'All',
    iconName: 'sparkles',
  },
  {
    slug: 'apps-software',
    nameZh: '软件应用',
    nameEn: 'Apps & Software',
    iconName: 'laptop',
    badge: 'NEW',
    descZh: '专治软件出海与App推广：SaaS 界面穿屏、手机 App 交互动效',
  },
  {
    slug: 'hook-intro',
    nameZh: '黄金开场',
    nameEn: 'Hook & Intro',
    iconName: 'target',
    descZh: '专治前3秒滑走：巨型商品碰撞、穿屏破框、荒诞反差追逐',
  },
  {
    slug: 'ugc-review',
    nameZh: '真实种草',
    nameEn: 'UGC & Review',
    iconName: 'message-circle',
    descZh: '专治转化率低：达人开箱实测、DIY草稿对现实物、买家吐槽',
  },
  {
    slug: 'cinematic-vfx',
    nameZh: '视效大片',
    nameEn: 'Cinematic VFX',
    iconName: 'flame',
    descZh: '专治画面廉价：裸眼3D大屏、子弹时间360°、超现实反重力悬浮',
  },
  {
    slug: 'fashion-try-on',
    nameZh: '模特试穿',
    nameEn: 'Fashion Try-On',
    iconName: 'shirt',
    descZh: '服饰鞋包量身定制：街头走秀、动态试衣变装、面料微距织纹',
  },
  {
    slug: 'industry-packs',
    nameZh: '行业精选',
    nameEn: 'Industry Packs',
    iconName: 'store',
    descZh: '垂直行业一键出片：美妆护肤、数码车载、节日促销完整成片套件',
  },
  {
    slug: 'durability-test',
    nameZh: '硬核评测',
    nameEn: 'Durability Test',
    iconName: 'shield',
    descZh: '品质信任背书：高空跌落防摔、超弹蛛网黏附、强力防水实测',
  },
])

/**
 * 货架行配置（纯净标题，去除 Emoji 充当图标，对齐 UI04 规范）
 */
export const SHELVES_CONFIG = Object.freeze([
  {
    slug: 'trending',
    titleZh: '本周精选趋势',
    titleEn: 'Trending',
    subtitleZh: '完播率与转化率最高的海外爆款精选',
    targetCategory: 'all',
  },
  {
    slug: 'apps-software',
    titleZh: '软件应用与 SaaS',
    titleEn: 'Apps & Software',
    subtitleZh: 'SaaS 界面穿屏与手机 App 交互流光 · 专为软件出海量身打造',
    targetCategory: 'apps-software',
    isNew: true,
  },
  {
    slug: 'hook-intro',
    titleZh: '黄金开场 Hook',
    titleEn: 'Hooks',
    subtitleZh: '巨型产品跌落、穿屏破框与荒诞反差 · 专治前3秒滑走',
    targetCategory: 'hook-intro',
  },
  {
    slug: 'cinematic-vfx',
    titleZh: '电影级视效与运镜',
    titleEn: 'Cinematic VFX',
    subtitleZh: '裸眼3D大屏、全景子弹时间与超现实悬浮 · 营造高端电影质感',
    targetCategory: 'cinematic-vfx',
  },
  {
    slug: 'ugc-review',
    titleZh: '真实种草与开箱',
    titleEn: 'UGC & Review',
    subtitleZh: '海外达人第一视角口播与手工草稿反转实物 · 降低买家防备心',
    targetCategory: 'ugc-review',
  },
  {
    slug: 'fashion-try-on',
    titleZh: '模特动态穿搭',
    titleEn: 'Fashion Try-On',
    subtitleZh: '街头走秀穿搭、动态变装与面料纹理细节 · 专攻服饰鞋包转化',
    targetCategory: 'fashion-try-on',
  },
  {
    slug: 'durability-test',
    titleZh: '硬核耐用评测',
    titleEn: 'Durability Test',
    subtitleZh: '暴力耐摔、强力防水与极限冲击实验 · 为产品坚实品质背书',
    targetCategory: 'durability-test',
  },
])

/**
 * 全量只读模版总表
 */
export const ALL_CREATIVE_TEMPLATES = Object.freeze(CREATIVE_TEMPLATES_RAW)

/**
 * 按分类筛选模版列表
 * @param {string} categorySlug
 * @returns {Array}
 */
export function selectTemplatesByCategory(categorySlug) {
  if (!categorySlug || categorySlug === 'all') {
    return ALL_CREATIVE_TEMPLATES
  }
  return ALL_CREATIVE_TEMPLATES.filter((item) => item.categorySlug === categorySlug)
}

/**
 * 根据 ID 查找指定模版
 * @param {string} id
 * @returns {object | null}
 */
export function findTemplateById(id) {
  if (!id) return null
  return ALL_CREATIVE_TEMPLATES.find((item) => item.id === id) || null
}

/**
 * 获取货架行推荐项目（默认提取每个分类前 6 项）
 * @param {string} shelfSlug
 * @param {number} [limit=6]
 * @returns {Array}
 */
export function selectShelfItems(shelfSlug, limit = 6) {
  if (shelfSlug === 'trending') {
    return ALL_CREATIVE_TEMPLATES.slice(0, limit)
  }
  const filtered = ALL_CREATIVE_TEMPLATES.filter((item) => item.categorySlug === shelfSlug)
  return filtered.slice(0, limit)
}
