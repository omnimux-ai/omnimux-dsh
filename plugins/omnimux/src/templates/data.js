/**
 * @file data.js
 * Host 侧创意模板纯数据模块：发布包内完整模板记录、featured-first 合并列表
 * 与纯选择逻辑。不依赖 Node 内置模块、React、DOM 或浏览器服务；Host 工具、
 * HTTP 快照适配器与客户端兼容转导出均只依赖本模块。
 */

import CREATIVE_TEMPLATES_RAW from './creative-templates.json' with { type: 'json' };
import { FEATURED_APPS_CARDS } from './featured-apps-data.js';

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
 * 全量模板库（7 款官方王牌应用置顶 + 全量灵感模板）
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
 * 根据 ID 查找指定模版或应用（id 或 appId 首次匹配）
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
export function selectShelfItems(shelfSlug, limit = 8) {
  if (shelfSlug === 'explore-templates') {
    return FEATURED_APPS_LIST.slice(0, limit);
  }
  const filtered = ALL_CREATIVE_TEMPLATES.filter(
    (item) => item.categorySlug === shelfSlug || item.categoryKey === shelfSlug
  );
  return filtered.slice(0, limit);
}
