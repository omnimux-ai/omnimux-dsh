/**
 * 创意模板核心数据模型与货架配置
 * 融合 7 大王牌官方 AI 应用与 395 套全量灵感模板及工作流上下文
 */

import { FEATURED_APPS_CARDS } from './featured-apps-data.js';
import CREATIVE_TEMPLATES_RAW from './creative-templates.json' with { type: 'json' };
import { resolveTemplateCopy } from './template-locale.js';
import {
  SHARED_PRIMARY_TABS,
  SHARED_SUB_CATEGORIES,
} from '../../shared/asset-hub-tabs/shared-tabs-catalog.js';

/**
 * 7 大精选应用卡片（包含对应 ApplicationManifest 与直通跳转参数）
 */
export const FEATURED_APPS_LIST = Object.freeze(
  FEATURED_APPS_CARDS.map((card) => {
    return {
      ...card,
      id: card.appId,
      title: card.titleZh,
      titleEn: card.titleEn,
      description: card.descZh,
      prompt: card.descEn || card.descZh,
      promptZh: card.descZh,
      cover: card.coverUrl,
      thumbnailUrl: card.coverUrl,
      previewVideoUrl: card.previewVideoUrl,
      categorySlug: card.categoryKey,
      type: 'app',
      isApp: true,
      manifest: card.manifest || null,
    };
  })
);

/**
 * 全量模板库（7 款官方王牌应用置顶 + 395 套灵感模板）
 */
export const ALL_CREATIVE_TEMPLATES = Object.freeze([
  ...FEATURED_APPS_LIST,
  ...CREATIVE_TEMPLATES_RAW.map((tpl) => ({
    ...tpl,
    isApp: false,
    type: tpl.type || 'template',
  })),
]);

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
 * 按分类筛选模版列表
 * @param {string} categorySlug
 * @returns {Array}
 */
export function selectTemplatesByCategory(categorySlug) {
  if (!categorySlug || categorySlug === 'all') {
    return ALL_CREATIVE_TEMPLATES;
  }
  return ALL_CREATIVE_TEMPLATES.filter(
    (item) => item.categorySlug === categorySlug || item.categoryKey === categorySlug
  );
}

/**
 * 根据 ID 查找指定模版或应用
 * @param {string} id
 * @returns {object | null}
 */
export function findTemplateById(id) {
  if (!id) return null;
  return ALL_CREATIVE_TEMPLATES.find((item) => item.id === id || item.appId === id) || null;
}

/**
 * 获取货架行推荐项目
 * @param {string} shelfSlug
 * @param {number} [limit=8]
 * @returns {Array}
 */
/**
 * 按当前语言取出名称与提示词。
 * @param {object | null | undefined} item
 * @param {string} locale
 * @returns {{ title: string, prompt: string }}
 */
export function resolveLocalizedTemplate(item, locale) {
  return resolveTemplateCopy(item, locale);
}

export function selectShelfItems(shelfSlug, limit = 8) {
  if (shelfSlug === 'explore-templates') {
    return FEATURED_APPS_LIST.slice(0, limit);
  }
  const filtered = ALL_CREATIVE_TEMPLATES.filter(
    (item) => item.categorySlug === shelfSlug || item.categoryKey === shelfSlug
  );
  return filtered.slice(0, limit);
}
