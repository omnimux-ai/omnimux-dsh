/**
 * @file tools.js
 * 灵感模板与生成工作流 Agent 只读查询工具：
 * 开放全量 395+ 套短视频爆款灵感模板（含分镜提示词、时长、平台来源与结构化工作流元数据），
 * 供 Agent 作为生成策划、分镜对标与多模态创作时的上下文参考知识库。
 */

import { ALL_CREATIVE_TEMPLATES, findTemplateById } from '../client/session-guide/templates/templates-data.js';
import { JSON_TOOL_OUTPUT } from '../tools/schema.js';

/**
 * 检索灵感模板列表
 * @param {object} params
 * @param {string} [params.category]
 * @param {string} [params.platform]
 * @param {string} [params.query]
 * @param {number} [params.limit=10]
 * @returns {{ total: number, items: Array<object> }}
 */
export function queryCreativeTemplates({
  category,
  platform,
  query,
  limit = 10,
} = {}) {
  const catFilter = category ? String(category).toLowerCase().trim() : '';
  const platFilter = platform ? String(platform).toLowerCase().trim() : '';
  const qFilter = query ? String(query).toLowerCase().trim() : '';
  const maxItems = Math.max(1, Math.min(Number.isFinite(limit) ? Math.floor(limit) : 10, 50));

  const results = [];

  for (const item of ALL_CREATIVE_TEMPLATES) {
    if (!item) continue;

    // 1. 分类匹配 (slug 或中文名)
    if (catFilter) {
      const catSlug = String(item.categorySlug || item.categoryKey || '').toLowerCase();
      const catName = String(item.categoryNameZh || item.badge || '').toLowerCase();
      const matchesCat = catSlug.includes(catFilter) || catName.includes(catFilter);
      if (!matchesCat) continue;
    }

    // 2. 平台来源匹配
    if (platFilter) {
      const srcPlat = String(item.sourcePlatform || '').toLowerCase();
      if (!srcPlat.includes(platFilter)) continue;
    }

    // 3. 关键词模糊检索 (title, titleEn, prompt, description, tags)
    if (qFilter) {
      const hay = [
        item.title,
        item.titleZh,
        item.titleEn,
        item.description,
        item.prompt,
        item.badge,
        item.categorySlug,
        item.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!hay.includes(qFilter)) continue;
    }

    // 简版摘要输出（节省上下文 Token）
    const promptSummary = item.prompt
      ? item.prompt.slice(0, 160) + (item.prompt.length > 160 ? '...' : '')
      : '';

    results.push({
      id: item.id || item.appId,
      title: item.title || item.titleZh,
      titleEn: item.titleEn || '',
      categorySlug: item.categorySlug || item.categoryKey || 'general',
      sourcePlatform: item.sourcePlatform || (item.isApp ? 'omnimux-app' : 'creatify'),
      duration: item.duration || '15s',
      isApp: Boolean(item.isApp),
      hasWorkflow: Boolean(item.workflow || item.manifest),
      workflowSummary: item.workflow ? {
        nodeChain: item.workflow.nodeChain || '',
        nodeCount: item.workflow.nodeCount || 0,
        modelsUsed: item.workflow.modelsUsed || [],
      } : undefined,
      promptSummary,
    });
  }

  return {
    total: results.length,
    items: results.slice(0, maxItems),
  };
}

/**
 * 调阅指定模板完整数据
 * @param {string} templateId
 * @returns {object | null}
 */
export function getCreativeTemplateDetail(templateId) {
  if (!templateId) return null;
  const item = findTemplateById(templateId);
  if (!item) return null;

  return {
    id: item.id || item.appId,
    title: item.title || item.titleZh,
    titleEn: item.titleEn || '',
    categorySlug: item.categorySlug || item.categoryKey || 'general',
    sourcePlatform: item.sourcePlatform || (item.isApp ? 'omnimux-app' : 'creatify'),
    duration: item.duration || '15s',
    isApp: Boolean(item.isApp),
    prompt: item.prompt || item.descZh || item.description || '',
    workflow: item.workflow || null,
    thumbnailUrl: item.thumbnailUrl || item.cover || '',
    previewVideoUrl: item.previewVideoUrl || '',
  };
}

/**
 * 注册灵感模板查询与上下文参考工具
 * @param {object} ctx
 */
export function mountTemplatesTools(ctx) {
  if (!ctx.tools || typeof ctx.tools.register !== 'function') return;

  // 1. 搜索工具
  ctx.tools.register({
    name: 'omnimux_creative_templates_search',
    description:
      '检索与查询全量短视频灵感模板（涵盖 395+ 套涵盖软件演示、黄金开场、真实种草、视效大片、模特试穿、行业精选、硬核评测等分类），获取模板列表、来源平台、时长与提示词摘要，供营销短视频对标与分镜策划参考。',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description:
            "可选分类过滤（支持 Slug 或中文名，如 'hook-intro'/'黄金开场'、'apps-software'/'软件应用'、'ugc-review'/'真实种草'、'cinematic-vfx'/'视效大片'、'fashion-try-on'/'模特试穿'、'industry-packs'/'行业精选'、'durability-test'/'硬核评测'）。",
        },
        platform: {
          type: 'string',
          enum: ['creatify', 'pippit', 'higgsfield', 'creatok'],
          description: "可选来源平台过滤：'creatify'（电商与带货工作流）、'pippit'（社媒爆款广告）、'higgsfield'（视效与特效大片）、'creatok'（创意工具示例）。",
        },
        query: {
          type: 'string',
          description: "可选关键词模糊搜索（匹配标题、提示词、卖点或标签，如 '口红'、'3D 广告牌'、'防摔'、'SaaS' 等）。",
        },
        limit: {
          type: 'integer',
          description: '返回的最大模板条数，默认 10，最大 50。',
        },
      },
      additionalProperties: false,
    },
    output: JSON_TOOL_OUTPUT,
    execute: async (_toolCallId, args = {}) => {
      try {
        const result = queryCreativeTemplates(args || {});
        return {
          ok: true,
          ...result,
        };
      } catch (err) {
        return {
          ok: false,
          error: err && err.message ? err.message : String(err || 'Unknown error'),
          total: 0,
          items: [],
        };
      }
    },
  });

  // 2. 详情工具
  ctx.tools.register({
    name: 'omnimux_creative_template_get',
    description:
      '根据模板 ID 调阅指定灵感模板的完整提示词规范（Prompt）、影视分镜结构与底层工作流（Workflow 节点链与所用模型），为 Agent 提供完整的对标复刻与出片决策上下文。',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: "模板唯一 ID（如 'tpl-creatify-8164bec4-098f-4a20-b3d4-108a5fb0b521' 或 'app-creatify-chasing-product'）。",
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    output: JSON_TOOL_OUTPUT,
    execute: async (_toolCallId, args = {}) => {
      try {
        const { id } = args || {};
        if (!id) {
          return { ok: false, error: 'Missing required parameter: id' };
        }
        const detail = getCreativeTemplateDetail(id);
        if (!detail) {
          return { ok: false, error: `Template not found: ${id}` };
        }
        return {
          ok: true,
          template: detail,
        };
      } catch (err) {
        return {
          ok: false,
          error: err && err.message ? err.message : String(err || 'Unknown error'),
        };
      }
    },
  });
}
