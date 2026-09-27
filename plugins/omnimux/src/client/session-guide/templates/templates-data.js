/**
 * 创意模板客户端展示配置
 * 本文件为纯浏览器模块：只保留探索页导航/分类/货架配置与本地纯函数。
 * 完整模板数据与选择逻辑在 Host 侧数据模块 (src/templates/data.js)，
 * 浏览器通过 creative-templates-client.js 适配器按需异步获取快照，
 * 本文件不得再 import src/templates/data.js（其 JSON 会重新进入主包）。
 */

import { resolveTemplateCopy } from './template-locale.js';
import { getFeaturedAppsList } from './creative-templates-client.js';
import {
  SHARED_PRIMARY_TABS,
  SHARED_SUB_CATEGORIES,
} from '../../shared/asset-hub-tabs/shared-tabs-catalog.js';

/**
 * featured-only 路径的轻量列表（只含 7 大精选应用，不含全量模板）。
 * 单一真源来自快照适配器的 featured 构造，展示 featured apps 时零请求。
 */
export const FEATURED_APPS_LIST = getFeaturedAppsList();

/**
 * 货架行取数（原 selectShelfItems 的显式列表版本）。
 * 'explore-templates' 货架为 featured-only：不读快照、同步返回。
 * 其余货架在传入的合并列表（featured-first）上按既有规则过滤；
 * 快照未就绪时调用方传 FEATURED_APPS_LIST，自然得到 featured 近似结果。
 * @param {ReadonlyArray<Record<string, unknown>>} list
 * @param {string} shelfSlug
 * @param {number} [limit=8]
 * @returns {Array}
 */
export function selectShelfItemsFrom(list, shelfSlug, limit = 8) {
  if (shelfSlug === 'explore-templates') {
    return FEATURED_APPS_LIST.slice(0, limit);
  }
  const source = Array.isArray(list) ? list : [];
  return source
    .filter((item) => item.categorySlug === shelfSlug || item.categoryKey === shelfSlug)
    .slice(0, limit);
}

/**
 * 一级主导航：六大创作与资产库（对齐共享单一真源）
 * 顺序：精选 -> 资产库 -> 灵感库 -> 商品库 -> 爆款趋势 -> Skills
 */
export const EXPLORE_PRIMARY_TABS = SHARED_PRIMARY_TABS;

/**
 * 各一级库对应的真实二级分类字典（对齐共享单一真源，首项统一严格为「全部」）
 */
export const EXPLORE_SUB_CATEGORIES = SHARED_SUB_CATEGORIES;

/**
 * 10 大核心分类定义（纯净中英双语、Slug、矢量图标名称）
 * 顺序：全部 -> TikTok热门 -> Skills -> 软件应用 -> 黄金开场 -> 真实种草 -> 视效大片 -> 模特试穿 -> 行业精选 -> 硬核评测
 */
export const TEMPLATE_CATEGORIES = Object.freeze([
  {
    slug: 'all',
    nameZh: '全部',
    nameEn: 'All',
    iconName: 'sparkles',
  },
  {
    slug: 'skills',
    nameZh: 'Skills',
    nameEn: 'Skills',
    iconName: 'zap',
    descZh: '专业工作流技能：黄金Hook提取、分镜提示词生成、痛点逆向推导',
    isNonTemplate: true,
  },
  {
    slug: 'apps-software',
    nameZh: '软件应用',
    nameEn: 'Apps & Software',
    iconName: 'laptop',
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
    descZh: '专治转化率低：达人开箱实测、买家吐槽与手持测评',
  },
  {
    slug: 'cinematic-vfx',
    nameZh: '视效大片',
    nameEn: 'Cinematic VFX',
    iconName: 'flame',
    descZh: '专治画面廉价：裸眼3D大屏、全景动态、超现实反重力悬浮',
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
    descZh: '品质信任背书：高空跌落防摔、超弹黏附、强力防水实测',
  },
]);

/**
 * 货架行配置
 */
export const SHELVES_CONFIG = Object.freeze([
  {
    slug: 'explore-templates',
    titleZh: '王牌短视频应用',
    titleEn: 'Featured Video Apps',
    subtitleZh: '精选 7 大分类官方 AI 短视频出片应用 · 传图即可出片',
    targetCategory: 'all',
    type: 'app',
  },
  {
    slug: 'skills',
    titleZh: 'Skills 技能库',
    titleEn: 'Skills Catalog',
    subtitleZh: '专业工作流技能 · 提示词生成与分镜解构大师',
    targetCategory: 'skills',
    type: 'skills',
  },
  {
    slug: 'apps-software',
    titleZh: '软件应用与 SaaS',
    titleEn: 'Apps & Software',
    subtitleZh: 'SaaS 界面穿屏与手机 App 交互流光 · 专为软件出海量身打造',
    targetCategory: 'apps-software',
    type: 'template',
  },
  {
    slug: 'hook-intro',
    titleZh: '黄金开场 Hook',
    titleEn: 'Hooks',
    subtitleZh: '巨型产品跌落、穿屏破框与荒诞反差 · 专治前3秒滑走',
    targetCategory: 'hook-intro',
    type: 'template',
  },
  {
    slug: 'ugc-review',
    titleZh: '真实种草与开箱',
    titleEn: 'UGC & Review',
    subtitleZh: '海外达人第一视角口播与痛点实测 · 降低买家防备心',
    targetCategory: 'ugc-review',
    type: 'template',
  },
  {
    slug: 'cinematic-vfx',
    titleZh: '电影级视效与运镜',
    titleEn: 'Cinematic VFX',
    subtitleZh: '裸眼3D大屏、超现实悬浮与微距光影 · 营造高端电影质感',
    targetCategory: 'cinematic-vfx',
    type: 'template',
  },
  {
    slug: 'fashion-try-on',
    titleZh: '模特动态穿搭',
    titleEn: 'Fashion Try-On',
    subtitleZh: '街头走秀穿搭、动态变装与面料纹理细节 · 专攻服饰鞋包转化',
    targetCategory: 'fashion-try-on',
    type: 'template',
  },
  {
    slug: 'durability-test',
    titleZh: '硬核耐用评测',
    titleEn: 'Durability Test',
    subtitleZh: '暴力耐摔、强力防水与极限冲击实验 · 为产品坚实品质背书',
    targetCategory: 'durability-test',
    type: 'template',
  },
]);

/**
 * 按当前语言取出名称与提示词。
 * @param {object | null | undefined} item
 * @param {string} locale
 * @returns {{ title: string, prompt: string }}
 */
export function resolveLocalizedTemplate(item, locale) {
  return resolveTemplateCopy(item, locale);
}
