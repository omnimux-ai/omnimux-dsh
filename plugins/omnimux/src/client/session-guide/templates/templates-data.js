/**
 * 创意模板核心数据模型与货架配置
 * 全面收敛为 7 大精选出厂 AI 应用（每个分类 1 款王牌爆款，点击直通极简表单出片）
 */

import { FEATURED_APPS_CARDS } from './featured-apps-data.js';
import BUILTIN_APPS_RAW from '../../../../../omnimux-apps/catalog/builtin-apps.json' with { type: 'json' };

const BUILTIN_APPS_MAP = new Map(BUILTIN_APPS_RAW.map((app) => [app.appId, app]));

/**
 * 7 大精选应用卡片（包含对应 ApplicationManifest 与直通跳转参数）
 */
export const ALL_CREATIVE_TEMPLATES = Object.freeze(
  FEATURED_APPS_CARDS.map((card) => {
    const manifest = BUILTIN_APPS_MAP.get(card.appId) || null;
    return {
      ...card,
      id: card.appId,
      title: card.titleZh,
      titleEn: card.titleEn,
      description: card.descZh,
      cover: card.coverUrl,
      thumbnailUrl: card.coverUrl,
      previewVideoUrl: card.previewVideoUrl,
      categorySlug: card.categoryKey,
      type: 'app',
      manifest,
    };
  })
);

/**
 * 分类定义（极简单分组）
 */
export const TEMPLATE_CATEGORIES = Object.freeze([
  {
    slug: 'all',
    nameZh: '全部',
    nameEn: 'All',
    iconName: 'sparkles',
  },
]);

/**
 * 货架配置：根据用户指令只保留 1 个核心货架分组「探索模板」
 */
export const SHELVES_CONFIG = Object.freeze([
  {
    slug: 'explore-templates',
    titleZh: '探索模板',
    titleEn: 'Explore Templates',
    subtitleZh: '精选 7 大分类王牌爆款短视频应用 · 传图一键出片',
    targetCategory: 'all',
    type: 'app',
  },
]);

/**
 * 按分类筛选模版列表（单分组下直接返回 7 大王牌应用）
 */
export function selectTemplatesByCategory(categorySlug) {
  if (!categorySlug || categorySlug === 'all') {
    return ALL_CREATIVE_TEMPLATES;
  }
  const filtered = ALL_CREATIVE_TEMPLATES.filter((item) => item.categorySlug === categorySlug);
  return filtered.length > 0 ? filtered : ALL_CREATIVE_TEMPLATES;
}

/**
 * 根据 ID 查找指定模版或应用
 */
export function findTemplateById(id) {
  if (!id) return null;
  return ALL_CREATIVE_TEMPLATES.find((item) => item.id === id || item.appId === id) || null;
}

/**
 * 获取货架行推荐项目（返回 7 大精选应用）
 */
export function selectShelfItems(shelfSlug, limit = 7) {
  return ALL_CREATIVE_TEMPLATES.slice(0, limit);
}
