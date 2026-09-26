/**
 * OmniMux Model Channel Groups and Routing Strategies.
 * Supports Brand -> Model ID -> Channel Group hierarchical routing,
 * with 'auto', 'stability_first', and 'cost_first' dispatching policies.
 */

import { gatewayCandidates, toProductId } from './id-universe.js'
import { resolveGroupEstimatedPoints } from '../pricing-calculator.js'

export const ROUTING_STRATEGIES = Object.freeze(['auto', 'stability_first', 'cost_first'])

export const BYOK_PROVIDER_DISPLAY_MAP = Object.freeze({
  fal: {
    id: 'byok-fal',
    label: '我的 fal.ai',
    badge: '自备 API Key · 直连专线',
    chipLabel: '按需自付',
    provider: 'fal-ai',
  },
  openai: {
    id: 'byok-openai',
    label: '我的 OpenAI',
    badge: '自备 API Key · 直连专线',
    chipLabel: '按需自付',
    provider: 'openai',
  },
  openrouter: {
    id: 'byok-openrouter',
    label: '我的 OpenRouter',
    badge: '自备 API Key · 直连专线',
    chipLabel: '按需自付',
    provider: 'custom-http',
  },
  siliconflow: {
    id: 'byok-siliconflow',
    label: '我的 SiliconFlow',
    badge: '自备 API Key · 直连专线',
    chipLabel: '按需自付',
    provider: 'custom-http',
  },
  custom: {
    id: 'byok-custom',
    label: '我的 自建端点',
    badge: '自备 API Key · 直连专线',
    chipLabel: '内部专线',
    provider: 'custom-http',
  },
})

/**
 * Standard group catalog definitions per model family / model ID.
 * Metadata aligns with production gateway GroupRatio, pricing, and SLA metrics.
 */
export const MODEL_CHANNEL_GROUPS = Object.freeze({
  "seedance-2-0": [
    {
      "id": "pro",
      "label": "旗舰版",
      "badge": "满血出片 · 按次专线",
      "pricing": {
        "pointsEstimate": 9.8,
        "discountRate": 3.333,
        "billingMode": "per_task"
      },
      "sla": {
        "stability24h": 100,
        "avgWaitTimeSec": 45
      },
      "wireGroup": "seedance-2-0-task-pro",
      "enabled": true
    },
    {
      "id": "official",
      "label": "官方版",
      "badge": "官方原厂直签 · 极稳高画质",
      "pricing": {
        "pointsEstimate": 4.9,
        "discountRate": 1,
        "billingMode": "per_second"
      },
      "sla": {
        "stability24h": 67,
        "avgWaitTimeSec": 90
      },
      "wireGroup": "default",
      "enabled": true
    },
    {
      "id": "preferred",
      "label": "优选版",
      "badge": "精品专线 · 极稳高画质",
      "pricing": {
        "pointsEstimate": 5.7,
        "discountRate": 1.178,
        "billingMode": "per_second"
      },
      "sla": {
        "stability24h": 100,
        "avgWaitTimeSec": 60
      },
      "wireGroup": "seedance-standard",
      "enabled": true
    },
    {
      "id": "standard",
      "label": "标准版",
      "badge": "主流专线 · 官方原生",
      "pricing": {
        "pointsEstimate": 4.9,
        "discountRate": 1,
        "billingMode": "per_second"
      },
      "sla": {
        "stability24h": 98,
        "avgWaitTimeSec": 90
      },
      "wireGroup": "default",
      "enabled": true
    },
    {
      "id": "cheap",
      "label": "经济版",
      "badge": "经济走量 · 按条计费",
      "pricing": {
        "pointsEstimate": 1.5,
        "discountRate": 0.5,
        "billingMode": "per_task"
      },
      "sla": {
        "stability24h": 90,
        "avgWaitTimeSec": 120
      },
      "wireGroup": "cheap",
      "enabled": true
    }
  ],
  "seedance-2-0-fast": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "极速出片 · 官方专线",
      "pricing": {
        "pointsEstimate": 4.9,
        "discountRate": 1,
        "billingMode": "per_second"
      },
      "sla": {
        "stability24h": 100,
        "avgWaitTimeSec": 30
      },
      "wireGroup": "default",
      "enabled": true
    },
    {
      "id": "cheap",
      "label": "经济版",
      "badge": "经济走量 · 按条计费",
      "pricing": {
        "pointsEstimate": 1.5,
        "discountRate": 0.5,
        "billingMode": "per_task"
      },
      "sla": {
        "stability24h": 90,
        "avgWaitTimeSec": 120
      },
      "wireGroup": "cheap",
      "enabled": true
    }
  ],
  "seedance-2-5": [
    {
      "id": "pro",
      "label": "旗舰版",
      "badge": "满血出片 · 按次专线",
      "pricing": {
        "pointsEstimate": 19,
        "discountRate": 3.333,
        "billingMode": "per_task"
      },
      "sla": {
        "stability24h": 100,
        "avgWaitTimeSec": 45
      },
      "constraints": {
        "parameters": {
          "duration": {
            "fixed": 30
          }
        }
      },
      "wireGroup": "seedance-2-5-task-pro",
      "enabled": false
    },
    {
      "id": "standard",
      "label": "标准版",
      "badge": "全新 2.5 旗舰 · 官方原生专线",
      "pricing": {
        "pointsEstimate": 16,
        "discountRate": 1,
        "billingMode": "per_second"
      },
      "sla": {
        "stability24h": 100,
        "avgWaitTimeSec": 60
      },
      "wireGroup": "default",
      "enabled": true
    }
  ],
  "claude-opus-4-6": [
    {
      "id": "claude-max-open",
      "label": "旗舰版",
      "badge": "官方订阅直连",
      "pricing": { "pointsEstimate": 2000, "discountRate": 1.0, "billingMode": "per_token" },
      "sla": { "stability24h": 100, "avgWaitTimeSec": 8 },
      "wireGroup": "claude-max-open",
      "enabled": true
    },
    {
      "id": "claude-plus",
      "label": "优选版",
      "badge": "精品专线 · 高品质输出",
      "pricing": { "pointsEstimate": 1000, "discountRate": 1.0, "billingMode": "per_token" },
      "sla": { "stability24h": 99, "avgWaitTimeSec": 10 },
      "wireGroup": "claude-plus",
      "enabled": true
    },
    {
      "id": "standard",
      "label": "标准版",
      "badge": "主流高品质专线",
      "pricing": { "pointsEstimate": 500, "discountRate": 1.0, "billingMode": "per_token" },
      "sla": { "stability24h": 98, "avgWaitTimeSec": 12 },
      "wireGroup": "standard",
      "enabled": true
    }
  ],
  "deepseek-v4-flash": [
    {
      "id": "deepseek-official",
      "label": "官方版",
      "badge": "官方原厂直签",
      "pricing": { "pointsEstimate": 100, "discountRate": 1.0, "billingMode": "per_token" },
      "sla": { "stability24h": 100, "avgWaitTimeSec": 4 },
      "wireGroup": "deepseek-official",
      "enabled": true
    },
    {
      "id": "default",
      "label": "标准版",
      "badge": "DeepSeek 官方专线",
      "pricing": { "pointsEstimate": 50, "discountRate": 1.0, "billingMode": "per_token" },
      "sla": { "stability24h": 99, "avgWaitTimeSec": 5 },
      "wireGroup": "default",
      "enabled": true
    }
  ],
  "kling": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "可灵商业专线",
      "pricing": {
        "pointsEstimate": 4,
        "discountRate": 1,
        "billingMode": "per_second"
      },
      "sla": {
        "stability24h": 98,
        "avgWaitTimeSec": 60
      },
      "wireGroup": "default",
      "enabled": true
    }
  ],
  // H3 全系列按分组接入：包含官方原生标准版、3倍速极速版、ComfyUI工作流双档专线、15秒长片版以及口型同步专线版。
  // 各自通过 `wireModel` 绑定上游独立型号，并通过 `wireGroup` 挂载对应的官方或专属分组。
  // 每个分组携带独立契约，实现完全隔离的参数与计费控制。
  "minimax-h3": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "海螺 MiniMax 官方专线 · 4–15 秒",
      "pricing": {
        "pointsEstimate": 3.6,
        "discountRate": 1,
        "billingMode": "per_second"
      },
      "sla": {
        "stability24h": 99,
        "avgWaitTimeSec": 50
      },
      "wireGroup": "default",
      "enabled": true
    },
    {
      // 上游 `minimax-h3-turbo`（ID 172）：海螺 3.0 极速版视频生成，$0.035/次，出片提速 3 倍。
      "id": "turbo",
      "label": "极速版",
      "badge": "海螺 3.0 极速版 · 3倍出片速度",
      "pricing": {
        "pointsEstimate": 0.4,
        "discountRate": 1,
        "billingMode": "per_task"
      },
      "wireModel": "minimax-h3-turbo",
      "wireGroup": "default",
      "enabled": true
    },
    {
      // 上游 `minimax-h3-video`（ID 173）专属高速档分组 `minimax-h3-video-fast`：AutoDL 极速出片，0.9倍折算 $0.0225/次。
      "id": "video_fast",
      "label": "经济版",
      "badge": "极速出片 · 极致低价专线",
      "pricing": {
        "pointsEstimate": 0.2,
        "discountRate": 0.9,
        "billingMode": "per_task"
      },
      "constraints": {
        "parameters": {
          "resolution": {
            "only": [
              "768P",
              "2K"
            ]
          }
        }
      },
      "wireModel": "minimax-h3-video",
      "wireGroup": "minimax-h3-video-fast",
      "enabled": true
    },
    {
      // 上游 `minimax-h3-video`（ID 173）专属画质档分组 `minimax-h3-video-pro`：AutoDL 极限画质先行版，1.15倍折算 $0.02875/次。
      "id": "video_pro",
      "label": "高清版",
      "badge": "极限画质 · 先行专线",
      "pricing": {
        "pointsEstimate": 0.3,
        "discountRate": 1.15,
        "billingMode": "per_task"
      },
      "constraints": {
        "parameters": {
          "resolution": {
            "only": [
              "768P",
              "2K"
            ]
          }
        }
      },
      "wireModel": "minimax-h3-video",
      "wireGroup": "minimax-h3-video-pro",
      "enabled": true
    },
    {
      // 上游 `minimax-h3-task`（ID 166）：固定 15 秒按次专线（$0.3781/次）。
      "id": "task",
      "label": "长片版",
      "badge": "固定 15 秒 · 按次专线",
      "pricing": {
        "pointsEstimate": 3.8,
        "discountRate": 1,
        "billingMode": "per_task"
      },
      "constraints": {
        "operations": [
          "text_to_video",
          "first_frame",
          "first_last_frame",
          "video_multi_ref"
        ],
        "parameters": {
          "duration": {
            "fixed": 15
          },
          "resolution": {
            "only": [
              "768P",
              "2K"
            ]
          }
        }
      },
      "wireModel": "minimax-h3-task",
      "wireGroup": "default",
      "enabled": true
    },
    {
      // 上游 `minimax-h3-lip-sync`（网关渠道 44 fal.ai 官方直连，model_mapping 至 minimax/h3-max/lip-sync/image-to-video）：
      // 对口型图生视频，人像图片 + 驱动音频 → 唇形对齐视频；按秒计费 $0.125/秒（1.25 积分/秒）。
      "id": "lipsync",
      "label": "口型版",
      "badge": "音频驱动唇形对齐 · 适合人像口播对白",
      "description": "专注音频驱动人像唇形对齐，完美匹配口播短剧、带货解说与虚拟角色对白场景。",
      "pricing": {
        "pointsEstimate": 6.3,
        "discountRate": 1,
        "billingMode": "per_second"
      },
      "sla": {
        "stability24h": 98,
        "avgWaitTimeSec": 45
      },
      "constraints": {
        "operations": [
          "digital_human"
        ],
        "parameters": {
          "resolution": {
            "only": [
              "768P",
              "2K"
            ]
          }
        }
      },
      "wireModel": "minimax-h3-lip-sync",
      "wireGroup": "default",
      "enabled": true
    }
  ],
  "gemini-3.8-flash": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "Google 官方专线",
      "pricing": {
        "pointsEstimate": 100,
        "discountRate": 1,
        "billingMode": "per_token"
      },
      "wireGroup": "default",
      "enabled": true
    },
    {
      "id": "cheap",
      "label": "经济版",
      "badge": "经济走量专线",
      "pricing": {
        "pointsEstimate": 80,
        "discountRate": 1.111,
        "billingMode": "per_token"
      },
      "wireGroup": "gemini-cheap",
      "enabled": true
    }
  ],
  "gpt-5.5": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "OpenAI 官方专线",
      "pricing": {
        "pointsEstimate": 600,
        "discountRate": 1,
        "billingMode": "per_token"
      },
      "wireGroup": "default",
      "enabled": true
    }
  ],
  "gpt-image-2.5": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "官方最新生图专线",
      "pricing": {
        "pointsEstimate": 0.1,
        "discountRate": 1,
        "billingMode": "per_task"
      },
      "wireGroup": "default",
      "enabled": true
    }
  ],
  // 2026-09-15：分组与模型名绑定 —— 实测 `model=gpt-image-2.5` 配 `-flare-std`
  // 分组回 503「分组 … 下模型 … 无可用渠道」，故两个 profile 各自成独立模型，
  // 且各自的 std 分组即其唯一可达线路。网关 `-pro` 分组未取得档位定价依据，暂不登记。
  "gpt-image-2.5-flare": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "极速专线 · 快速迭代",
      "pricing": {
        "pointsEstimate": 0.2,
        "discountRate": 1.125,
        "billingMode": "per_task"
      },
      "wireGroup": "gpt-image-2.5-flare-std",
      "default": true,
      "enabled": true
    }
  ],
  "gpt-image-2.5-sunburst": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "画质专线 · 精细成品",
      "pricing": {
        "pointsEstimate": 0.2,
        "discountRate": 1.125,
        "billingMode": "per_task"
      },
      "wireGroup": "gpt-image-2.5-sunburst-std",
      "default": true,
      "enabled": true
    }
  ],
  "nano-banana-2": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "Google 官方生图专线",
      "pricing": {
        "pointsEstimate": 0.2,
        "discountRate": 1,
        "billingMode": "per_task"
      },
      "sla": {
        "stability24h": 100,
        "avgWaitTimeSec": 15
      },
      "wireGroup": "default",
      "enabled": true
    },
    {
      "id": "pro",
      "label": "高清版",
      "badge": "全档高清专线",
      "pricing": {
        "pointsEstimate": 0.3,
        "discountRate": 1.714,
        "billingMode": "per_task"
      },
      "sla": {
        "stability24h": 100,
        "avgWaitTimeSec": 10
      },
      "wireGroup": "nano-banana-2-pro",
      "enabled": true
    }
  ],
  "seedance-2-0-mini": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "轻量视频官方专线",
      "pricing": {
        "pointsEstimate": 1.5,
        "discountRate": 1,
        "billingMode": "per_task"
      },
      "sla": {
        "stability24h": 100,
        "avgWaitTimeSec": 45
      },
      "wireGroup": "default",
      "enabled": true
    }
  ],
  "wan-3.0": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "Wan 官方专线",
      "pricing": {
        "pointsEstimate": 2.5,
        "discountRate": 1,
        "billingMode": "per_task"
      },
      "wireGroup": "default",
      "enabled": true
    }
  ],
  "grok-imagine-video-1-5": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "xAI 官方视频专线",
      "pricing": {
        "pointsEstimate": 2,
        "discountRate": 1,
        "billingMode": "per_task"
      },
      "sla": {
        "stability24h": 100,
        "avgWaitTimeSec": 30
      },
      "wireGroup": "default",
      "enabled": true
    },
    {
      "id": "pool",
      "label": "经济版",
      "badge": "极致低价 · 随取随用",
      "pricing": {
        "pointsEstimate": 0.6,
        "discountRate": 0.2857,
        "billingMode": "per_task"
      },
      "sla": {
        "stability24h": 88,
        "avgWaitTimeSec": 90
      },
      "wireGroup": "pool",
      "enabled": true
    }
  ],
  "seed-audio-1.0": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "豆包语音官方专线",
      "pricing": {
        "pointsEstimate": 50,
        "discountRate": 1,
        "billingMode": "per_token"
      },
      "sla": {
        "stability24h": 100,
        "avgWaitTimeSec": 5
      },
      "wireGroup": "default",
      "enabled": true
    }
  ],
  "suno": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "Suno 音乐生成官方专线",
      "pricing": {
        "pointsEstimate": 0.5,
        "discountRate": 1,
        "billingMode": "per_task"
      },
      "wireGroup": "default",
      "enabled": true
    }
  ]
})

/**
 * 模块内部闭包保护：汇聚所有在 MODEL_CHANNEL_GROUPS 中声明的官方渠道 ID 与 wireGroup 集合，
 * 杜绝跨文件硬编码与维护漂移。
 */
const OFFICIAL_CHANNEL_ID_SET = (() => {
  const ids = new Set(['official', 'default', 'standard', 'fast'])
  for (const groupList of Object.values(MODEL_CHANNEL_GROUPS)) {
    if (Array.isArray(groupList)) {
      for (const group of groupList) {
        if (group && typeof group.id === 'string' && group.id.trim()) {
          ids.add(group.id.toLowerCase().trim())
        }
        if (group && typeof group.wireGroup === 'string' && group.wireGroup.trim()) {
          ids.add(group.wireGroup.toLowerCase().trim())
        }
      }
    }
  }
  return ids
})()

/** 对外仅暴露只读数组，杜绝通过引用执行外部篡改操作 */
export const OFFICIAL_CHANNEL_IDS = Object.freeze(Array.from(OFFICIAL_CHANNEL_ID_SET))

/**
 * 只读辅助函数：判断给定渠道 ID 是否属于官方渠道白名单
 * @param {unknown} id
 * @returns {boolean}
 */
export function isOfficialChannelId(id) {
  if (typeof id !== 'string') return false
  const trimmed = id.toLowerCase().trim()
  if (!trimmed) return false
  return OFFICIAL_CHANNEL_ID_SET.has(trimmed)
}

/**
 * Split a model reference like "seedance-2-0@standard" into model and group.
 * @param {unknown} input
 * @returns {{ modelId: string, group: string | null }}
 */
export function parseModelAndGroup(input) {
  if (typeof input !== 'string') return { modelId: '', group: null }
  const trimmed = input.trim()
  if (!trimmed) return { modelId: '', group: null }
  const atIndex = trimmed.indexOf('@')
  if (atIndex < 0) {
    return { modelId: toProductId(trimmed), group: null }
  }
  // 健壮解析：遇到包含多于一个 @ 的模型名称时 Fail-Closed
  if (atIndex !== trimmed.lastIndexOf('@')) {
    return { modelId: '', group: null }
  }
  const rawModel = trimmed.slice(0, atIndex).trim()
  const rawGroup = trimmed.slice(atIndex + 1).trim()
  const modelId = toProductId(rawModel)
  if (!modelId) return { modelId: '', group: null }
  const group = rawGroup || null
  return {
    modelId,
    group,
  }
}

/**
 * Get channel groups available for a model.
 * @param {string} modelId
 * @returns {Array<typeof MODEL_CHANNEL_GROUPS[string][number]>}
 */
export function getModelChannelGroups(modelId) {
  const canonical = toProductId(modelId)
  return structuredClone(MODEL_CHANNEL_GROUPS[canonical] ?? [])
}

/**
 * 从运行时设置中提取指定 BYOK 提供商的实际约束配置。
 *
 * @param {string} provider 提供商名称或标识
 * @param {Record<string, unknown> | null | undefined} runtimeSettings 运行时设置快照
 * @returns {object | undefined} 提取出的约束对象（若配置）
 */
export function extractByokConstraints(provider, runtimeSettings) {
  if (!runtimeSettings || typeof runtimeSettings !== 'object' || Array.isArray(runtimeSettings)) {
    return undefined
  }
  const norm = typeof provider === 'string' && provider.trim()
    ? provider.toLowerCase().trim()
    : ''
  if (!norm) return undefined

  // 1. 优先从 byokProviders 列表中匹配提取已配置的约束
  if (Array.isArray(runtimeSettings.byokProviders)) {
    const matched = runtimeSettings.byokProviders.find((item) =>
      item && typeof item === 'object' && typeof item.provider === 'string'
      && item.provider.toLowerCase().trim() === norm
    )
    if (matched && matched.constraints && typeof matched.constraints === 'object' && !Array.isArray(matched.constraints)) {
      return structuredClone(matched.constraints)
    }
  }

  // 2. 检查主配置中的媒体约束（当主 provider 匹配时）
  const rawProvider = runtimeSettings.runtimeMediaProvider
  let mainProvider = ''
  if (typeof rawProvider === 'string') {
    const trimmed = rawProvider.trim()
    if (trimmed.length > 0) {
      mainProvider = trimmed.toLowerCase()
    }
  } else if (rawProvider === undefined) {
    mainProvider = 'fal'
  }
  if (mainProvider && norm === mainProvider && runtimeSettings.constraints && typeof runtimeSettings.constraints === 'object' && !Array.isArray(runtimeSettings.constraints)) {
    return structuredClone(runtimeSettings.constraints)
  }

  return undefined
}

// 模块顶层常量：已知标准模型能力映射表，提升至顶层杜绝运行时重复分配开销
const INFERRED_IMAGE_MODELS = Object.freeze(new Set([
  'gpt-image-2.5',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
  'nano-banana-2',
]))
const INFERRED_VIDEO_MODELS = Object.freeze(new Set([
  'seedance-2-0',
  'seedance-2-0-fast',
  'seedance-2-5',
  'seedance-2-0-mini',
  'kling',
  'minimax-h3',
  'wan-3.0',
  'grok-imagine-video-1-5',
]))
const INFERRED_AUDIO_MODELS = Object.freeze(new Set([
  'seed-audio-1.0',
  'suno',
]))

const WAN_VIDEO_RE = /(?:^|[-_])wan(?:[-_]?(?:[0-9]|i2v|t2v)|x|$)/
const SOUND_AUDIO_RE = /(?:^|[-_])sound(?:[-_0-9]|fx|effect|$)/

/**
 * 根据模型标识推导其媒体能力类型（image / video / audio / text）。
 * @param {string} [modelId]
 * @returns {'image' | 'video' | 'audio' | 'text' | ''}
 */
export function inferCapabilityFromModel(modelId) {
  if (!modelId || typeof modelId !== 'string') return ''
  const parsed = parseModelAndGroup(modelId).modelId || modelId
  const id = parsed.toLowerCase().trim()

  // 1. 精确匹配已知标准模型
  if (INFERRED_IMAGE_MODELS.has(id)) return 'image'
  if (INFERRED_VIDEO_MODELS.has(id)) return 'video'
  if (INFERRED_AUDIO_MODELS.has(id)) return 'audio'

  // 2. 模式关键字推导
  if (id.includes('image') || id.includes('flux') || id.includes('banana') || id.includes('midjourney') || id.includes('dall-e') || id.includes('sd-') || id.includes('stable-diffusion')) {
    return 'image'
  }
  if (id.includes('video') || id.includes('seedance') || id.includes('kling') || id.includes('minimax-h3') || id.includes('sora') || id.includes('runway') || id.includes('luma') || id.includes('cogvideo') || WAN_VIDEO_RE.test(id)) {
    return 'video'
  }
  if (id.includes('audio') || id.includes('voice') || id.includes('speech') || id.includes('tts') || SOUND_AUDIO_RE.test(id) || id.includes('music') || id.includes('suno') || id.includes('whisper')) {
    return 'audio'
  }

  return ''
}

/**
 * 统一构建 BYOK 渠道对象。
 * 确保动态注入的渠道对象结构（含 constraints 与 pricing 默认值）保持 100% 一致。
 * 默认约束为能力无关的 {}，仅对图片等具体类型注入图片约束。
 *
 * @param {unknown} provider 提供商标识字符串
 * @param {object} [constraints] 限制配置
 * @param {'image' | 'video' | 'audio' | string} [capability] 媒体能力类型
 * @returns {object} 规范化的 BYOK 渠道对象
 */
export function buildByokChannelGroup(provider, constraints, capability) {
  const raw = typeof provider === 'string' ? provider.toLowerCase().trim() : ''
  if (!raw || !/^[a-z0-9_-]+$/.test(raw)) {
    return null
  }
  const norm = raw
  const hasMeta = Object.prototype.hasOwnProperty.call(BYOK_PROVIDER_DISPLAY_MAP, norm)
  const meta = hasMeta ? BYOK_PROVIDER_DISPLAY_MAP[norm] : {
    id: `byok-${norm}`,
    label: `我的 ${norm}`,
    badge: '自备 API Key · 直连专线',
    chipLabel: norm === 'custom' ? '内部专线' : '按需自付',
    provider: 'custom-http',
  }
  const defaultConstraints = capability === 'image'
    ? { inputs: { image: { max: 1 } } }
    : {}
  return {
    id: meta.id,
    label: meta.label,
    badge: meta.badge,
    category: 'byok',
    sourceType: 'byok',
    chipLabel: meta.chipLabel,
    wireGroup: meta.id,
    enabled: true,
    isAvailable: true,
    pricing: {
      pointsEstimate: null,
      billingMode: 'payg',
    },
    constraints: (constraints && typeof constraints === 'object' && !Array.isArray(constraints))
      ? structuredClone(constraints)
      : defaultConstraints,
  }
}

/**
 * 解析请求中的渠道意图与归属类别（BYOK / 官方 / 未指定）。
 * 统一收敛 req.group、req.allowedGroups 以及 req.model 中的内联 @group 后缀。
 *
 * @param {{ model?: unknown, group?: unknown, allowedGroups?: unknown } | null | undefined} req
 * @returns {{
 *   requestedChannel: string,
 *   effectiveChannel: string,
 *   isByokChannel: boolean,
 *   isOfficialChannel: boolean,
 *   byokProvider: string,
 * }}
 */
export function resolveRequestChannelIntent(req) {
  if (!req || typeof req !== 'object' || Array.isArray(req)) {
    return {
      requestedChannel: '',
      effectiveChannel: '',
      isByokChannel: false,
      isOfficialChannel: false,
      byokProvider: '',
    }
  }

  let requestedChannel = typeof req.group === 'string' ? req.group.trim() : ''
  if (!requestedChannel && typeof req.model === 'string' && req.model.includes('@')) {
    const { group: inlineGroup } = parseModelAndGroup(req.model)
    if (inlineGroup) {
      requestedChannel = inlineGroup
    }
  }

  const normalizedAllowed = Array.isArray(req.allowedGroups)
    ? req.allowedGroups.map((g) => (typeof g === 'string' ? g.trim() : '')).filter(Boolean)
    : []
  const firstAllowed = normalizedAllowed[0] || ''
  const hasAllowedByok = normalizedAllowed.some((g) => g.toLowerCase().startsWith('byok-'))
  const hasAllowedOfficial = normalizedAllowed.some((g) => !g.toLowerCase().startsWith('byok-') && isOfficialChannelId(g))
  const effectiveChannel = requestedChannel || firstAllowed

  const isMixedAllowedGroups = !requestedChannel && hasAllowedByok && hasAllowedOfficial
  const isByokChannel = !isMixedAllowedGroups && typeof effectiveChannel === 'string' && effectiveChannel.toLowerCase().startsWith('byok-')
  const byokProvider = isByokChannel ? effectiveChannel.slice(5).toLowerCase().trim() : ''

  // 判定显式官方渠道意图：
  // 1. requestedChannel 存在且属于 OFFICIAL_CHANNEL_IDS 白名单且不是 BYOK
  // 2. 或 allowedGroups 存在非空且全部为 OFFICIAL_CHANNEL_IDS 中的官方分组（严防未知自定义渠道冒领）
  const normRequested = typeof requestedChannel === 'string' ? requestedChannel.toLowerCase().trim() : ''
  const hasOfficialRequested = Boolean(normRequested && !isByokChannel && isOfficialChannelId(normRequested))
  const hasOfficialAllowedOnly = Array.isArray(req.allowedGroups)
    && req.allowedGroups.length > 0
    && req.allowedGroups.every((g) => typeof g === 'string' && g.trim() && !g.toLowerCase().startsWith('byok-') && isOfficialChannelId(g))

  const isOfficialChannel = hasOfficialRequested || hasOfficialAllowedOnly

  return {
    requestedChannel,
    effectiveChannel,
    isByokChannel,
    isOfficialChannel,
    byokProvider,
  }
}

/**
 * 聚合指定逻辑模型的完整可用渠道池（官方内置专线 + 已验证的用户自备 BYOK 渠道）。
 *
 * @param {string} modelId 逻辑模型 ID（支持带 @group 后缀，内部自动归一化）
 * @param {Record<string, unknown> | null} [runtimeSettings] 当前运行时设置快照
 * @returns {Array<object>} 包含 category ('official' | 'byok')、chipLabel 等属性的渠道分组列表
 */
export function resolveModelChannelGroups(modelId, runtimeSettings) {
  const { modelId: parsedModelId } = parseModelAndGroup(modelId)
  const canonicalId = parsedModelId || toProductId(modelId)
  const capability = inferCapabilityFromModel(canonicalId || modelId)
  const officialGroups = getModelChannelGroups(canonicalId).map((group) => ({
    ...group,
    category: 'official',
    sourceType: 'official',
    isAvailable: group.enabled !== false,
  }))

  if (!runtimeSettings || typeof runtimeSettings !== 'object' || Array.isArray(runtimeSettings)) {
    return officialGroups
  }

  const byokGroups = []
  const addedIds = new Set(officialGroups.map((g) => g.id))

  const appendByokProvider = (providerKey, constraints) => {
    const group = buildByokChannelGroup(providerKey, constraints, capability)
    if (!group) return
    if (addedIds.has(group.id)) return
    addedIds.add(group.id)
    byokGroups.push(group)
  }

  let capFlag = ''
  if (capability === 'image') {
    capFlag = 'runtimeMediaImage'
  } else if (capability === 'video') {
    capFlag = 'runtimeMediaVideo'
  } else if (capability === 'audio') {
    capFlag = 'runtimeMediaAudio'
  }

  // 1. 检查主配置中的媒体 Provider，未知模态模型在非全关情况下保持健壮可用
  if (runtimeSettings.runtimeKeyVerified === true) {
    const allFalse =
      runtimeSettings.runtimeMediaImage === false &&
      runtimeSettings.runtimeMediaVideo === false &&
      runtimeSettings.runtimeMediaAudio === false

    const isCapEnabled = capFlag ? runtimeSettings[capFlag] === true : !allFalse

    if (isCapEnabled) {
      const rawProvider = runtimeSettings.runtimeMediaProvider
      let mainProvider = ''
      if (typeof rawProvider === 'string') {
        const trimmed = rawProvider.trim()
        if (trimmed.length > 0) {
          mainProvider = trimmed.toLowerCase()
        }
      } else if (rawProvider === undefined) {
        mainProvider = 'fal'
      }

      if (mainProvider) {
        const mainEndpoint = typeof runtimeSettings.runtimeKeyEndpoint === 'string' ? runtimeSettings.runtimeKeyEndpoint.trim() : ''
        // 若为 custom provider，必须校验端点 endpoint 非空才加入渠道池
        if (mainProvider !== 'custom' || /^https?:\/\//i.test(mainEndpoint)) {
          const constraints = extractByokConstraints(mainProvider, runtimeSettings)
          appendByokProvider(mainProvider, constraints)
        }
      }
    }
  }

  // 2. 检查多 Provider 扩展列表 (byokProviders)
  if (Array.isArray(runtimeSettings.byokProviders)) {
    for (const item of runtimeSettings.byokProviders) {
      if (item && typeof item === 'object' && item.verified === true && typeof item.provider === 'string' && item.provider.trim()) {
        if (capability) {
          // 精确模态匹配：优先对齐前端 TypeScript 检查 item.capabilities.includes(capability)
          if (Array.isArray(item.capabilities) && item.capabilities.length > 0) {
            if (!item.capabilities.includes(capability)) {
              continue
            }
          } else {
            // 兼容支持单独的布尔开关 (image/video/audio 或 runtimeMediaImage/Video/Audio)
            const isCurrentCapTrue = Boolean(capFlag && (item[capFlag] === true || item[capability] === true))
            const isCurrentCapFalse = Boolean(capFlag && (item[capFlag] === false || item[capability] === false))
            const hasCapModel = Boolean(
              (item.models && typeof item.models === 'object' && item.models[capability])
              || item[`${capability}Model`]
            )

            if (isCurrentCapFalse) {
              continue
            }
            // 对齐执行层门禁，在未配置能力模型且开关省略时排除该候选
            if (!isCurrentCapTrue && !hasCapModel) {
              continue
            }
          }
        }
        const itemProvider = item.provider.toLowerCase().trim()
        const itemEndpoint = typeof item.endpoint === 'string' ? item.endpoint.trim() : ''
        // 若为 custom provider，必须校验端点 endpoint 非空且必须为合法 http(s) 协议才加入渠道池
        if (itemProvider === 'custom' && (!itemEndpoint || !/^https?:\/\//i.test(itemEndpoint))) {
          continue
        }
        const itemConstraints = (item.constraints && typeof item.constraints === 'object' && !Array.isArray(item.constraints))
          ? structuredClone(item.constraints)
          : extractByokConstraints(item.provider, runtimeSettings)
        appendByokProvider(item.provider, itemConstraints)
      }
    }
  }

  return [...officialGroups, ...byokGroups]
}

/** Points used for ranking when a group publishes no numeric estimate. */
const UNPRICED_RANKING_POINTS = 1000

/**
 * Numeric point estimate only. Display-only notes (`当前参数不支持报价`) never
 * participate in ranking, so a note can never reorder the failover plan.
 * 支柱三：若声明内部排序权重 sortWeight 则优先用于排序，彻底解耦面向用户的 pointsEstimate。
 * 支柱一：若 pointsEstimate 未显式配置，自动依据定价引擎推导客观预估积分。
 * @param {{ pricing?: { pointsEstimate?: number | string, sortWeight?: number } }} group
 * @param {string} [modelId]
 * @returns {number | null}
 */
function pointsOf(group, modelId) {
  const weight = group.pricing?.sortWeight
  if (typeof weight === 'number' && Number.isFinite(weight)) return weight

  const points = group.pricing?.pointsEstimate
  if (typeof points === 'number' && Number.isFinite(points)) return points

  if (modelId) {
    const derived = resolveGroupEstimatedPoints(modelId, group)
    if (typeof derived === 'number' && Number.isFinite(derived)) return derived
  }

  // 网关不给积分口径时，用真实分组倍率折算排序权重（仅用于排序，不当作积分展示）。
  const ratio = group.pricing?.priceRatio
  return typeof ratio === 'number' && Number.isFinite(ratio) ? ratio * UNPRICED_RANKING_POINTS : null
}

/**
 * Calculate auto ranking score for a channel group (stability weight 70%, cost weight 30%).
 * Higher score = higher priority.
 */
function calculateAutoScore(group) {
  // 分组未公布 SLA 时用中性默认值参与排序，不对外声称稳定率。
  const stabilityPart = (group.sla?.stability24h ?? 80) * 0.7
  const price = pointsOf(group) ?? UNPRICED_RANKING_POINTS
  // Normalized inverse price score (0..30)
  const pricePart = Math.max(0, 30 - (price / 200))
  return stabilityPart + pricePart
}

/**
 * @param {string} strategy
 * @returns {(a: object, b: object) => number}
 */
function comparatorFor(strategy) {
  if (strategy === 'stability_first') {
    return (a, b) => {
      const stabDiff = (b.sla?.stability24h ?? 0) - (a.sla?.stability24h ?? 0)
      if (stabDiff !== 0) return stabDiff
      return (a.sla?.avgWaitTimeSec ?? 0) - (b.sla?.avgWaitTimeSec ?? 0)
    }
  }
  if (strategy === 'cost_first') {
    // Unpriced groups sort last: an unknown price must not win a cheapest-first race.
    return (a, b) => (pointsOf(a) ?? Number.POSITIVE_INFINITY) - (pointsOf(b) ?? Number.POSITIVE_INFINITY)
  }
  return (a, b) => calculateAutoScore(b) - calculateAutoScore(a)
}

/**
 * @param {unknown} allowedGroups
 * @returns {Set<string> | null}
 */
function normalizeAllowed(allowedGroups) {
  if (!Array.isArray(allowedGroups) || allowedGroups.length === 0) return null
  const allowed = new Set(allowedGroups.map((id) => String(id).trim().toLowerCase()).filter(Boolean))
  return allowed.size > 0 ? allowed : null
}

/**
 * 校验指定 BYOK 提供商在 runtimeSettings 中是否已验证且具备相应模态能力
 * @param {string} provider
 * @param {string} [capability]
 * @param {Record<string, unknown>} runtimeSettings
 * @returns {boolean}
 */
function isByokProviderVerifiedAndCapReady(provider, capability, runtimeSettings) {
  if (!runtimeSettings || typeof runtimeSettings !== 'object' || Array.isArray(runtimeSettings)) {
    return false
  }
  const normProvider = typeof provider === 'string' ? provider.toLowerCase().trim() : ''
  if (!normProvider) return false

  let capFlag = ''
  if (capability === 'image') {
    capFlag = 'runtimeMediaImage'
  } else if (capability === 'video') {
    capFlag = 'runtimeMediaVideo'
  } else if (capability === 'audio') {
    capFlag = 'runtimeMediaAudio'
  }

  // 1. 检查多 Provider 扩展列表 (byokProviders)，只要存在任一已验证且具备相应模态能力的记录即判定合格
  if (Array.isArray(runtimeSettings.byokProviders)) {
    const hasReadyItem = runtimeSettings.byokProviders.some((item) => {
      if (!item || typeof item !== 'object') return false
      if (typeof item.provider !== 'string' || item.provider.toLowerCase().trim() !== normProvider) return false
      if (item.verified !== true) return false

      if (normProvider === 'custom') {
        const ep = typeof item.endpoint === 'string' ? item.endpoint.trim() : ''
        if (!/^https?:\/\//i.test(ep)) return false
      }
      if (!capability) {
        return true
      }
      if (Array.isArray(item.capabilities) && item.capabilities.length > 0) {
        return item.capabilities.includes(capability)
      }
      const isCurrentCapTrue = Boolean(capFlag && (item[capFlag] === true || item[capability] === true))
      const isCurrentCapFalse = Boolean(capFlag && (item[capFlag] === false || item[capability] === false))
      const hasCapModel = Boolean(
        (item.models && typeof item.models === 'object' && item.models[capability])
        || item[`${capability}Model`]
      )
      if (isCurrentCapFalse) {
        return false
      }
      if (isCurrentCapTrue) {
        return true
      }
      return hasCapModel
    })
    if (hasReadyItem) {
      return true
    }
  }

  // 2. 检查主配置中的媒体 Provider (runtimeKeyVerified)
  if (runtimeSettings.runtimeKeyVerified === true) {
    const rawProvider = runtimeSettings.runtimeMediaProvider
    const mainProvider = (typeof rawProvider === 'string' && rawProvider.trim())
      ? rawProvider.trim().toLowerCase()
      : (rawProvider === undefined ? 'fal' : '')
    if (mainProvider === normProvider) {
      if (normProvider === 'custom') {
        const ep = typeof runtimeSettings.runtimeKeyEndpoint === 'string' ? runtimeSettings.runtimeKeyEndpoint.trim() : ''
        if (!/^https?:\/\//i.test(ep)) return false
      }
      if (!capability) {
        return true
      }
      const allFalse =
        runtimeSettings.runtimeMediaImage === false &&
        runtimeSettings.runtimeMediaVideo === false &&
        runtimeSettings.runtimeMediaAudio === false
      const isCapEnabled = capFlag ? runtimeSettings[capFlag] === true : !allFalse
      return isCapEnabled
    }
  }

  return false
}

/**
 * Resolve the ordered channel plan for a model.
 *
 * Routing intent (`group`, `allowedGroups`, or `strategy`) makes the plan
 * fail-closed: only configured groups are tried, the caller's pool is never
 * silently widened, and an exhausted pool surfaces as an error instead of
 * falling back to an unbounded channel. Without intent the plan is exactly
 * `gatewayCandidates`, i.e. the pre-routing behavior.
 *
 * @param {string} modelId
 * @param {{
 *   strategy?: 'auto' | 'stability_first' | 'cost_first' | string,
 *   group?: string,
 *   allowedGroups?: string[],
 * }} [options]
 * @returns {{ candidates: string[], unresolvedGroups: string[] }}
 */
export function resolveChannelPlan(modelId, options = {}) {
  const { modelId: canonicalModel, group: inlineGroup } = parseModelAndGroup(modelId)
  if (!canonicalModel) return { candidates: [], unresolvedGroups: [] }

  const requestedGroup = inlineGroup || (typeof options.group === 'string' ? options.group.trim() : '')
  const strategy = ROUTING_STRATEGIES.includes(options.strategy) ? options.strategy : 'auto'
  const allowed = normalizeAllowed(options.allowedGroups)
  const hasIntent = Boolean(requestedGroup || allowed || ROUTING_STRATEGIES.includes(options.strategy))

  if (!hasIntent) return { candidates: gatewayCandidates(canonicalModel), unresolvedGroups: [] }

  const normalizedAllowed = Array.isArray(options.allowedGroups)
    ? options.allowedGroups.map((g) => (typeof g === 'string' ? g.trim() : '')).filter(Boolean)
    : []
  const hasAllowedByok = normalizedAllowed.some((g) => g.toLowerCase().startsWith('byok-'))
  const hasAllowedOfficial = normalizedAllowed.some((g) => !g.toLowerCase().startsWith('byok-') && isOfficialChannelId(g))
  const isMixedAllowedGroups = !requestedGroup && hasAllowedByok && hasAllowedOfficial

  if (isMixedAllowedGroups) {
    return {
      candidates: [],
      unresolvedGroups: Array.isArray(options.allowedGroups) ? [...options.allowedGroups] : [],
    }
  }

  let groups = resolveModelChannelGroups(canonicalModel, options.runtimeSettings)

  const isByok = (id) => typeof id === 'string' && id.toLowerCase().startsWith('byok-')
  const ensureByokGroup = (byokId) => {
    const normalizedId = typeof byokId === 'string' ? byokId.toLowerCase().trim() : String(byokId).toLowerCase().trim()
    if (!groups.some((g) => g.id === normalizedId || g.wireGroup === normalizedId)) {
      const provider = normalizedId.startsWith('byok-')
        ? normalizedId.slice(5).trim()
        : normalizedId
      // 若为 custom provider，必须校验端点 endpoint 非空才加入渠道池
      if (provider === 'custom') {
        const hasValidEndpoint = Array.isArray(options.runtimeSettings?.byokProviders)
          && options.runtimeSettings.byokProviders.some((p) => p && typeof p === 'object' && typeof p.provider === 'string' && p.provider.toLowerCase().trim() === 'custom' && typeof p.endpoint === 'string' && /^https?:\/\//i.test(p.endpoint.trim()))
        const mainEndpoint = typeof options.runtimeSettings?.runtimeKeyEndpoint === 'string' ? options.runtimeSettings.runtimeKeyEndpoint.trim() : ''
        if (!hasValidEndpoint && !/^https?:\/\//i.test(mainEndpoint)) {
          return
        }
      }
      const capability = inferCapabilityFromModel(canonicalModel || modelId)
      // 显式 BYOK 请求必须在 options.runtimeSettings 存在且通过 isByokProviderVerifiedAndCapReady 验证时才允许合成，若缺失 settings 或未验证，严禁直接合成
      if (!options.runtimeSettings || typeof options.runtimeSettings !== 'object') {
        return
      }
      const isVerifiedAndReady = isByokProviderVerifiedAndCapReady(provider, capability, options.runtimeSettings)
      if (!isVerifiedAndReady) {
        return
      }
      const constraints = extractByokConstraints(provider, options.runtimeSettings)
      const group = buildByokChannelGroup(provider, constraints, capability)
      if (group) {
        groups = [...groups, group]
      }
    }
  }

  if (requestedGroup && isByok(requestedGroup)) {
    ensureByokGroup(requestedGroup.toLowerCase())
  }
  if (allowed) {
    for (const id of allowed) {
      if (isByok(id)) {
        ensureByokGroup(id)
      }
    }
  }

  if (groups.length === 0) {
    // No pool is configured for this model, so the intent cannot be honored.
    // Report the ids that could not be resolved instead of pretending they applied.
    const unresolvedGroups = allowed ? [...options.allowedGroups].map((id) => String(id).trim()).filter(Boolean) : (requestedGroup ? [requestedGroup] : [])
    const hasByokIntent = Boolean((requestedGroup && isByok(requestedGroup)) || hasAllowedByok)
    if (hasByokIntent) {
      return { candidates: [], unresolvedGroups }
    }
    return { candidates: gatewayCandidates(canonicalModel), unresolvedGroups }
  }

  const isAllowed = (group) => !allowed
    || allowed.has(String(group.id).toLowerCase())
    || (group.wireGroup ? allowed.has(String(group.wireGroup).toLowerCase()) : false)
  // A line may be served by a different upstream model than the product id
  // (MiniMax H3 的固定 15 秒任务版是独立在售型号，不是同名分组）。The candidate's
  // model part is what the execution layer sends as the request body model, so a
  // group that names `wireModel` routes to that upstream model while still being
  // selected as a group. Groups without `wireModel` keep the product id verbatim.
  const wireOf = (group) => `${group.wireModel || canonicalModel}@${group.wireGroup || group.id}`
  const enabled = groups.filter((group) => group.enabled)

  if (requestedGroup) {
    const targetGroup = String(requestedGroup).toLowerCase().trim()
    const isTargetGroup = (group) => {
      if (!group) return false
      const gid = String(group.id).toLowerCase().trim()
      const wire = group.wireGroup ? String(group.wireGroup).toLowerCase().trim() : ''
      return gid === targetGroup || wire === targetGroup
    }
    const matched = groups.find(isTargetGroup)
    const tail = enabled.filter((group) => !isTargetGroup(group))
    // The pool restricts the failover tail too: naming one group is not a licence
    // to try the caller's excluded (often pricier) groups.
    const orderedTail = tail.filter(isAllowed).sort(comparatorFor(strategy))
    const unresolvedGroups = matched ? [] : [requestedGroup]
    if (!matched && (isByok(targetGroup) || !isOfficialChannelId(targetGroup))) {
      return { candidates: [], unresolvedGroups }
    }
    // The named line leads through the same builder as the tail: naming `task` on a
    // product whose lines point at different upstream models must route to *that*
    // line's model, not to the product id.
    const head = matched ? wireOf(matched) : `${canonicalModel}@${targetGroup}`
    return {
      candidates: [...new Set([head, ...orderedTail.map(wireOf)])],
      unresolvedGroups,
    }
  }

  const pool = enabled.filter(isAllowed)
  if (pool.length === 0) {
    const unresolvedGroups = allowed
      ? [...allowed]
      : []
    // Fail closed: an unmatched pool must not widen into the full channel set.
    return { candidates: [], unresolvedGroups }
  }

  return { candidates: pool.sort(comparatorFor(strategy)).map(wireOf), unresolvedGroups: [] }
}

/**
 * Ordered gateway candidates for a request. Kept as the array-shaped API for
 * callers that do not need the unresolved-pool report.
 * @param {string} modelId
 * @param {{ strategy?: string, group?: string, allowedGroups?: string[] }} [options]
 * @returns {string[]}
 */
export function resolveChannelCandidates(modelId, options = {}) {
  return resolveChannelPlan(modelId, options).candidates
}
