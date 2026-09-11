/**
 * @file tools.js
 * 营销广告预设 Agent 工具：
 * 开放全量官方广告预设库（96款广告格式、75款开场亮点、20款视觉风格），
 * 供 Agent 自主检索、匹配爆款创意结构与提取提示词工业级指导规范。
 */

import {
  CREATIVE_HOOKS,
  CREATIVE_VISUAL_STYLES,
  CREATIVE_VIDEO_FORMATS,
} from '../client/presets/catalog.js'
import { JSON_TOOL_OUTPUT } from '../tools/schema.js'

export const PRESET_DIMENSIONS = {
  format: {
    key: 'format',
    name: '广告格式',
    items: CREATIVE_VIDEO_FORMATS,
  },
  hook: {
    key: 'hook',
    name: '开场亮点',
    items: CREATIVE_HOOKS,
  },
  style: {
    key: 'style',
    name: '视觉风格',
    items: CREATIVE_VISUAL_STYLES,
  },
}

/**
 * 检索预设数据
 * @param {object} params
 * @param {'all' | 'format' | 'hook' | 'style'} [params.dimension='all']
 * @param {string} [params.category]
 * @param {string} [params.query]
 * @param {number} [params.limit=10]
 * @returns {{ total: number, dimension: string, items: Array<object> }}
 */
export function queryMarketingPresets({
  dimension = 'all',
  category,
  query,
  limit = 10,
} = {}) {
  const targetDim = String(dimension || 'all').toLowerCase().trim()
  const dimKeys = targetDim === 'all' || !PRESET_DIMENSIONS[targetDim]
    ? ['format', 'hook', 'style']
    : [targetDim]

  const catFilter = category ? String(category).toLowerCase().trim() : ''
  const qFilter = query ? String(query).toLowerCase().trim() : ''
  const maxItems = Math.max(1, Math.min(Number.isFinite(limit) ? Math.floor(limit) : 10, 50))

  const results = []

  for (const dimKey of dimKeys) {
    const dimConf = PRESET_DIMENSIONS[dimKey]
    if (!dimConf || !Array.isArray(dimConf.items)) continue

    for (const item of dimConf.items) {
      if (!item) continue

      // 1. 分类匹配
      if (catFilter) {
        const catSlug = String(item.categorySlug || '').toLowerCase()
        const catName = String(item.categoryName || '').toLowerCase()
        const catNameZh = String(item.categoryNameZh || '').toLowerCase()
        const matchesCat =
          catSlug.includes(catFilter) ||
          catName.includes(catFilter) ||
          catNameZh.includes(catFilter)
        if (!matchesCat) continue
      }

      // 2. 关键词模糊匹配 (title, titleZh, description, prompt, categoryName, categoryNameZh)
      if (qFilter) {
        const hay = [
          item.title,
          item.titleZh,
          item.description,
          item.prompt,
          item.categoryName,
          item.categoryNameZh,
          item.id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        if (!hay.includes(qFilter)) continue
      }

      results.push({
        id: item.id,
        dimension: dimKey,
        dimensionName: dimConf.name,
        title: item.title,
        titleZh: item.titleZh || item.title,
        categoryName: item.categoryName || item.categorySlug,
        categoryNameZh: item.categoryNameZh || item.categoryName || item.categorySlug,
        description: item.description || '',
        prompt: item.prompt || '',
      })
    }
  }

  return {
    total: results.length,
    dimension: targetDim,
    items: results.slice(0, maxItems),
  }
}

/**
 * 注册营销广告预设查询工具
 * @param {object} ctx
 */
export function mountPresetsTools(ctx) {
  ctx.tools?.register({
    name: 'omnimux_marketing_presets_search',
    description:
      '检索与查询官方营销广告预设（包含 96 款广告格式、75 款黄金前3秒开场亮点 Hook、20 款视觉风格），获取预设中英文名称、所属分类与完整的影视级提示词指导规范，供营销脚本策划、分镜拆解与爆款视频复刻使用。',
    parameters: {
      type: 'object',
      properties: {
        dimension: {
          type: 'string',
          enum: ['all', 'format', 'hook', 'style'],
          description:
            "查询的预设维度：'format'（广告视频结构/格式，96款）、'hook'（黄金前3秒开场亮点，75款）、'style'（画面视觉风格与光影，20款）、'all'（全部维度），缺省为 'all'。",
        },
        category: {
          type: 'string',
          description:
            "可选的分类名称或 slug（如 '热门广告'、'UGC 广告'、'视觉效果'、'产品演示'、'ASMR'、'生活方式'、'多巴胺' 等）。",
        },
        query: {
          type: 'string',
          description:
            "可选的关键词模糊检索（支持中文名称、英文标题、描述内容、提示词要点模糊匹配，如 '口红'、'微距'、'开箱'、'反转' 等）。",
        },
        limit: {
          type: 'integer',
          description: '返回的最大预设条数，默认为 10，最大为 50。',
        },
      },
      additionalProperties: false,
    },
    output: JSON_TOOL_OUTPUT,
    execute: async (_toolCallId, args = {}) => {
      try {
        const result = queryMarketingPresets(args || {})
        return {
          ok: true,
          ...result,
        }
      } catch (err) {
        return {
          ok: false,
          error: err && err.message ? err.message : String(err || 'Unknown error'),
          total: 0,
          items: [],
        }
      }
    },
  })
}
