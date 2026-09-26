/**
 * Channel group catalogue for the canvas model picker.
 *
 * The picker shows what the hub will actually route to, so this table is a
 * mirror of `plugins/omnimux/src/catalog/serving/channel-groups.js`
 * (`MODEL_CHANNEL_GROUPS`): same model keys, same channel ids, same wire group,
 * points estimate, discount, billing mode and SLA. Cross-plugin source imports
 * are forbidden, so the mirror is enforced by
 * `scripts/verify-model-contracts.mjs` — drift fails CI instead of silently
 * routing to a group the user never picked.
 *
 * Badges carry feature words only: the discount and billing chips are derived
 * from `pricing`, so the same fact is never rendered twice.
 */

import { setLineConstraintResolver, type LineConstraints } from '../../../../../shared/validation/lineConstraints.ts';

export interface ChannelGroupItem {
  id: string;
  label: string;
  badge?: string;
  /** 渠道分类：官方专线 vs 自备渠道 */
  category?: 'official' | 'byok';
  sourceType?: 'official' | 'byok';
  chipLabel?: string;
  isAvailable?: boolean;
  /** 适合场景与能力文字简介。 */
  description?: string;
  pricing?: {
    /** Numeric estimate; `null` when the parameter set has no published price. */
    pointsEstimate: number | null;
    /** 支柱三：内部排序打分权重，彻底解耦面向用户的 pointsEstimate。 */
    sortWeight?: number;
    discountRate?: number;
    /** 网关真实分组倍率（相对官方组的相对价），SLA 缺失时的价格口径。 */
    priceRatio?: number | null;
    billingMode?: string;
  };
  sla?: {
    stability24h: number;
    avgWaitTimeSec?: number;
  };
  /** Gateway group appended as `model@wireGroup`; falls back to `id`. */
  wireGroup?: string;
  /**
   * Upstream model this line is actually served by, when it differs from the
   * product id (MiniMax H3 的固定 15 秒任务版是独立在售型号）。The routing candidate
   * becomes `wireModel@wireGroup`, and the candidate's model part is what the
   * execution layer sends as the request body model.
   */
  wireModel?: string;
  /**
   * What this line actually accepts. The contract publishes the widest union across
   * every line, so a narrow line corrects it here: one fixed length, a single
   * resolution and aspect, and the input types it refuses (`max: 0` drops the slot).
   */
  constraints?: LineConstraints;
  enabled: boolean;
}

export const MODEL_CHANNEL_GROUPS: Record<string, ChannelGroupItem[]> = {
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
};

export function parseModelAndGroup(input?: string): { modelId: string; group: string | null } {
  if (!input || typeof input !== 'string') return { modelId: '', group: null };
  const trimmed = input.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex < 0) return { modelId: trimmed, group: null };
  const rawModel = trimmed.slice(0, atIndex).trim();
  const rawGroup = trimmed.slice(atIndex + 1).trim();
  return {
    modelId: rawModel,
    group: rawGroup || null,
  };
}

/**
 * Configured channel groups for a model. Models without a pool return `[]`: the
 * picker must show "no channel choice" rather than invent channels and prices
 * the hub cannot route to.
 */
export function getModelChannelGroups(
  modelId: string,
  runtimeSettings?: RuntimeByokChannelSettings | null,
): ChannelGroupItem[] {
  if (runtimeSettings) {
    return resolveModelChannelGroups(modelId, runtimeSettings);
  }
  const { modelId: canonical } = parseModelAndGroup(modelId);
  return MODEL_CHANNEL_GROUPS[canonical] ? [...MODEL_CHANNEL_GROUPS[canonical]] : [];
}

export interface RuntimeByokChannelSettings {
  runtimeMode?: 'official' | 'agent' | 'key';
  runtimeMediaProvider?: string;
  runtimeKeyVerified?: boolean;
  runtimeKeyEndpoint?: string;
  runtimeMediaImage?: boolean;
  runtimeMediaVideo?: boolean;
  runtimeMediaAudio?: boolean;
  runtimeMediaImageModel?: string;
  runtimeMediaVideoModel?: string;
  runtimeMediaAudioModel?: string;
  constraints?: LineConstraints;
  byokProviders?: Array<{
    provider: string;
    verified: boolean;
    endpoint?: string;
    capabilities?: Array<'image' | 'video' | 'audio'>;
    constraints?: LineConstraints;
    image?: boolean;
    video?: boolean;
    audio?: boolean;
    runtimeMediaImage?: boolean;
    runtimeMediaVideo?: boolean;
    runtimeMediaAudio?: boolean;
    models?: Record<string, string>;
    imageModel?: string;
    videoModel?: string;
    audioModel?: string;
    model?: string;
  }>;
}

export const BYOK_PROVIDER_DISPLAY_MAP: Readonly<Record<string, {
  id: string;
  label: string;
  badge: string;
  chipLabel: string;
  provider: 'fal-ai' | 'openai' | 'custom-http';
}>> = Object.freeze({
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
});

/**
 * 严格类型守卫：深层校验 LineConstraints 结构，对 inputs.image.max、parameters 等关键字段做结构校验，防止畸变对象逃逸。
 */
export function isLineConstraintsShape(raw: unknown): raw is LineConstraints {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return false;
  }
  const obj = raw as Record<string, unknown>;

  if (obj.operations !== undefined) {
    if (!Array.isArray(obj.operations) || !obj.operations.every((op) => typeof op === 'string')) {
      return false;
    }
  }

  if (obj.inputs !== undefined) {
    if (!obj.inputs || typeof obj.inputs !== 'object' || Array.isArray(obj.inputs)) {
      return false;
    }
    const inputs = obj.inputs as Record<string, unknown>;
    for (const [, val] of Object.entries(inputs)) {
      if (val === undefined) continue;
      if (!val || typeof val !== 'object' || Array.isArray(val)) {
        return false;
      }
      const limit = val as Record<string, unknown>;
      if (limit.max !== undefined && (typeof limit.max !== 'number' || !Number.isFinite(limit.max) || limit.max < 0)) {
        return false;
      }
    }
  }

  if (obj.parameters !== undefined) {
    if (!obj.parameters || typeof obj.parameters !== 'object' || Array.isArray(obj.parameters)) {
      return false;
    }
    const params = obj.parameters as Record<string, unknown>;
    for (const [, val] of Object.entries(params)) {
      if (val === undefined) continue;
      if (!val || typeof val !== 'object' || Array.isArray(val)) {
        return false;
      }
      const param = val as Record<string, unknown>;
      if (param.only !== undefined) {
        if (!Array.isArray(param.only)) {
          return false;
        }
        for (const item of param.only) {
          if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') {
            return false;
          }
        }
      }
      if (param.fixed !== undefined) {
        if (
          typeof param.fixed !== 'string' &&
          typeof param.fixed !== 'number' &&
          typeof param.fixed !== 'boolean'
        ) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * 严格类型守卫函数：对 RuntimeByokChannelSettings 进行全字段深度防御性校验。
 * 杜绝恶意注入、残缺对象或任意无关脏对象。
 */
export function isRuntimeByokChannelSettings(raw: unknown): raw is RuntimeByokChannelSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return false;
  }
  const obj = raw as Record<string, unknown>;

  if (obj.runtimeMode !== undefined) {
    if (typeof obj.runtimeMode !== 'string' || !['official', 'agent', 'key'].includes(obj.runtimeMode)) {
      return false;
    }
  }

  if (obj.runtimeMediaProvider !== undefined && typeof obj.runtimeMediaProvider !== 'string') {
    return false;
  }

  if (obj.runtimeKeyVerified !== undefined && typeof obj.runtimeKeyVerified !== 'boolean') {
    return false;
  }

  if (obj.runtimeKeyEndpoint !== undefined && typeof obj.runtimeKeyEndpoint !== 'string') {
    return false;
  }

  if (obj.runtimeMediaImage !== undefined && typeof obj.runtimeMediaImage !== 'boolean') {
    return false;
  }

  if (obj.runtimeMediaVideo !== undefined && typeof obj.runtimeMediaVideo !== 'boolean') {
    return false;
  }

  if (obj.runtimeMediaAudio !== undefined && typeof obj.runtimeMediaAudio !== 'boolean') {
    return false;
  }

  if (obj.runtimeMediaImageModel !== undefined && typeof obj.runtimeMediaImageModel !== 'string') {
    return false;
  }

  if (obj.runtimeMediaVideoModel !== undefined && typeof obj.runtimeMediaVideoModel !== 'string') {
    return false;
  }

  if (obj.runtimeMediaAudioModel !== undefined && typeof obj.runtimeMediaAudioModel !== 'string') {
    return false;
  }

  if (obj.byokProviders !== undefined) {
    if (!Array.isArray(obj.byokProviders)) {
      return false;
    }
    for (const item of obj.byokProviders) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return false;
      }
      const p = item as Record<string, unknown>;
      if (typeof p.provider !== 'string' || typeof p.verified !== 'boolean') {
        return false;
      }
      if (p.endpoint !== undefined && typeof p.endpoint !== 'string') {
        return false;
      }
      if (p.capabilities !== undefined) {
        if (!Array.isArray(p.capabilities)) {
          return false;
        }
        for (const cap of p.capabilities) {
          if (cap !== 'image' && cap !== 'video' && cap !== 'audio') {
            return false;
          }
        }
      }
      if (p.image !== undefined && typeof p.image !== 'boolean') return false;
      if (p.video !== undefined && typeof p.video !== 'boolean') return false;
      if (p.audio !== undefined && typeof p.audio !== 'boolean') return false;
      if (p.runtimeMediaImage !== undefined && typeof p.runtimeMediaImage !== 'boolean') return false;
      if (p.runtimeMediaVideo !== undefined && typeof p.runtimeMediaVideo !== 'boolean') return false;
      if (p.runtimeMediaAudio !== undefined && typeof p.runtimeMediaAudio !== 'boolean') return false;
      if (p.imageModel !== undefined && typeof p.imageModel !== 'string') return false;
      if (p.videoModel !== undefined && typeof p.videoModel !== 'string') return false;
      if (p.audioModel !== undefined && typeof p.audioModel !== 'string') return false;
      if (p.model !== undefined && typeof p.model !== 'string') return false;
      if (p.models !== undefined && (typeof p.models !== 'object' || Array.isArray(p.models) || p.models === null)) return false;
      if (p.constraints !== undefined) {
        if (!isLineConstraintsShape(p.constraints)) {
          return false;
        }
      }
    }
  }

  if (obj.constraints !== undefined) {
    if (!isLineConstraintsShape(obj.constraints)) {
      return false;
    }
  }

  // 必须至少包含一个已知的有效字段，防止空对象 {} 逃逸
  return (
    obj.runtimeMode !== undefined ||
    obj.runtimeMediaProvider !== undefined ||
    obj.runtimeKeyVerified !== undefined ||
    obj.runtimeKeyEndpoint !== undefined ||
    obj.runtimeMediaImage !== undefined ||
    obj.runtimeMediaVideo !== undefined ||
    obj.runtimeMediaAudio !== undefined ||
    obj.runtimeMediaImageModel !== undefined ||
    obj.runtimeMediaVideoModel !== undefined ||
    obj.runtimeMediaAudioModel !== undefined ||
    obj.constraints !== undefined ||
    obj.byokProviders !== undefined
  );
}

/** BYOK 渠道默认基准约束（单图限制，统一渠道与线路约束引用） */
export const DEFAULT_BYOK_CONSTRAINTS: LineConstraints = Object.freeze({
  inputs: {
    image: { max: 1 },
  },
});

/**
 * 判断渠道分组或渠道 ID 是否属于 BYOK（自备渠道）。
 */
export function isByokGroup(
  groupOrId?: string | { id?: string; category?: string; sourceType?: string } | null,
): boolean {
  if (!groupOrId) return false;
  if (typeof groupOrId === 'string') {
    return groupOrId.startsWith('byok-');
  }
  return (
    groupOrId.category === 'byok' ||
    groupOrId.sourceType === 'byok' ||
    Boolean(groupOrId.id?.startsWith('byok-'))
  );
}

/**
 * 清洗与防御校验 providerKey，过滤非预期特殊字符，避免注入或非法 ID 构造。
 * 若清洗后为空串或入参非法，返回 null，由调用方跳过注入。
 */
export function sanitizeProviderKey(providerKey?: string): string | null {
  if (!providerKey || typeof providerKey !== 'string') return null;
  const norm = providerKey.toLowerCase().trim();
  if (!/^[a-z0-9_-]+$/.test(norm)) return null;
  return norm;
}

/**
 * 启发式推导模型所属模态（image / video / audio），用于 BYOK 渠道可用性精细门禁。
 */
export function detectModelModality(modelId: string): 'image' | 'video' | 'audio' | null {
  const { modelId: parsed } = parseModelAndGroup(modelId);
  const id = parsed.toLowerCase();

  // 1. 优先推导视频模型：避免带音频特性的视频模型（如 seedance-1.0-sound）被误判为纯音频模型
  if (
    id.includes('video') ||
    id.includes('seedance') ||
    id.includes('kling') ||
    id.includes('minimax-h3') ||
    id.includes('hailuo') ||
    /(?:^|[-_])wan(?:[-_]?[0-9]|[-_]?(?:i2v|t2v)|x|$)/.test(id) ||
    id.includes('sora') ||
    id.includes('runway') ||
    /(?:^|[-_])luma(?:[-_0-9]|$)/.test(id) ||
    id.includes('cogvideo') ||
    id.includes('grok-imagine-video') ||
    id.startsWith('veo')
  ) {
    return 'video';
  }

  // 2. 图片模型
  if (
    id.includes('image') ||
    id.includes('flux') ||
    id.includes('midjourney') ||
    id.startsWith('mj-') ||
    id.includes('seedream') ||
    id.includes('nano-banana') ||
    id.includes('banana') ||
    id.includes('imagen') ||
    id.includes('dall-e') ||
    id.includes('sd-') ||
    id.includes('stable-diffusion')
  ) {
    return 'image';
  }

  // 3. 音频模型（对 sound 模态做词界精确匹配，防止非音频模型误命中）
  if (
    id.includes('audio') ||
    id.includes('suno') ||
    id.includes('tts') ||
    id.includes('music') ||
    id.includes('voice') ||
    /(?:^|[-_])speech(?:[-_0-9]|$)/.test(id) ||
    /(?:^|[-_])sound(?:[-_0-9]|fx|effect|$)/.test(id) ||
    id.includes('whisper') ||
    id.startsWith('seed-audio')
  ) {
    return 'audio';
  }

  return null;
}

/**
 * 聚合指定逻辑模型的完整可用渠道池（官方内置专线 + 已验证的用户自备 BYOK 渠道）。
 *
 * @param modelId 逻辑模型 ID（支持带 @group 后缀，内部自动归一化）
 * @param runtimeSettings 当前运行时设置快照
 * @returns 包含 category ('official' | 'byok')、chipLabel 等属性的渠道分组列表
 */
export function resolveModelChannelGroups(
  modelId: string,
  runtimeSettings?: RuntimeByokChannelSettings | null,
): ChannelGroupItem[] {
  const { modelId: parsedModelId } = parseModelAndGroup(modelId);
  const rawOfficialGroups = MODEL_CHANNEL_GROUPS[parsedModelId] || [];
  const officialGroups = rawOfficialGroups.map((group) => ({
    ...group,
    category: 'official' as const,
    sourceType: 'official' as const,
    isAvailable: group.enabled !== false,
  }));

  if (!isRuntimeByokChannelSettings(runtimeSettings)) {
    return officialGroups;
  }

  const byokGroups: ChannelGroupItem[] = [];
  const addedIds = new Set(officialGroups.map((g) => g.id));

  const appendByokProvider = (providerKey?: string, constraints?: LineConstraints) => {
    const norm = sanitizeProviderKey(providerKey);
    if (!norm) return;
    const meta = Object.prototype.hasOwnProperty.call(BYOK_PROVIDER_DISPLAY_MAP, norm)
      ? BYOK_PROVIDER_DISPLAY_MAP[norm]
      : {
          id: `byok-${norm}`,
          label: `我的 ${norm}`,
          badge: '自备 API Key · 直连专线',
          chipLabel: '按需自付',
          provider: 'custom-http' as const,
        };
    if (addedIds.has(meta.id)) return;
    addedIds.add(meta.id);
    byokGroups.push({
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
      constraints: constraints && Object.keys(constraints).length > 0 ? constraints : DEFAULT_BYOK_CONSTRAINTS,
    });
  };

  const modelModality = detectModelModality(parsedModelId);

  // 1. 检查主配置中的媒体 Provider，按模型所属模态（image/video/audio）校验是否开启
  if (runtimeSettings.runtimeKeyVerified === true) {
    const allFalse =
      runtimeSettings.runtimeMediaImage === false &&
      runtimeSettings.runtimeMediaVideo === false &&
      runtimeSettings.runtimeMediaAudio === false;

    let isCapEnabled = !allFalse;
    if (modelModality) {
      if (modelModality === 'image') {
        isCapEnabled = runtimeSettings.runtimeMediaImage === true;
      } else if (modelModality === 'video') {
        isCapEnabled = runtimeSettings.runtimeMediaVideo === true;
      } else if (modelModality === 'audio') {
        isCapEnabled = runtimeSettings.runtimeMediaAudio === true;
      }
    }

    if (isCapEnabled) {
      const rawProvider = runtimeSettings.runtimeMediaProvider;
      let providerCandidate = '';
      if (typeof rawProvider === 'string') {
        const trimmed = rawProvider.trim();
        if (trimmed.length > 0) {
          providerCandidate = trimmed;
        }
      } else if (rawProvider === undefined) {
        providerCandidate = 'fal';
      }
      if (providerCandidate.length > 0) {
        const provider = providerCandidate.toLowerCase();
        const endpoint = typeof runtimeSettings.runtimeKeyEndpoint === 'string'
          ? runtimeSettings.runtimeKeyEndpoint.trim()
          : '';
        if (provider !== 'custom' || /^https?:\/\//i.test(endpoint)) {
          appendByokProvider(providerCandidate, runtimeSettings.constraints);
        }
      }
    }
  }

  // 2. 检查多 Provider 扩展列表 (byokProviders)
  if (Array.isArray(runtimeSettings.byokProviders)) {
    for (const item of runtimeSettings.byokProviders) {
      if (item && typeof item === 'object' && item.verified === true && item.provider) {
        const provider = sanitizeProviderKey(item.provider);
        if (!provider) {
          continue;
        }
        if (provider === 'custom' && !(typeof item.endpoint === 'string' && /^https?:\/\//i.test(item.endpoint.trim()))) {
          continue;
        }
        if (modelModality) {
          if (Array.isArray(item.capabilities) && item.capabilities.length > 0) {
            if (!item.capabilities.includes(modelModality)) {
              continue;
            }
          } else {
            // 向下兼容解析模态布尔字段以及专属模型字段，与后端 100% 对齐
            const capFlag = modelModality === 'image'
              ? 'runtimeMediaImage'
              : modelModality === 'video'
              ? 'runtimeMediaVideo'
              : modelModality === 'audio'
              ? 'runtimeMediaAudio'
              : '';
            const itemRecord = item as Record<string, unknown>;
            const isCurrentCapTrue = Boolean(
              itemRecord[modelModality] === true || (capFlag && itemRecord[capFlag] === true)
            );
            const isCurrentCapFalse = Boolean(
              itemRecord[modelModality] === false || (capFlag && itemRecord[capFlag] === false)
            );
            const models = (itemRecord.models && typeof itemRecord.models === 'object')
              ? (itemRecord.models as Record<string, unknown>)
              : undefined;
            const hasCapModel = Boolean(
              (models && typeof models[modelModality] === 'string' && (models[modelModality] as string).trim().length > 0)
              || (typeof itemRecord[`${modelModality}Model`] === 'string' && (itemRecord[`${modelModality}Model`] as string).trim().length > 0)
            );

            if (isCurrentCapFalse) {
              continue;
            }
            if (!isCurrentCapTrue && !hasCapModel) {
              continue;
            }
          }
        }
        appendByokProvider(provider, item.constraints);
      }
    }
  }

  return [...officialGroups, ...byokGroups];
}

/** `0.52` → `5.2折`；`1.43` → `×1.43`（加价组）；1 或缺失不出 chip。 */
export function formatPriceChip(rate?: number | null): string {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate === 1) return '';
  if (rate < 1) return `${Math.round(rate * 100) / 10}折`;
  return `×${Math.round(rate * 100) / 100}`;
}

/** 价格展示：有积分给积分，只有倍率给倍率，两者都无则明确说明不报价。 */
export function formatPriceLabel(pricing?: { pointsEstimate?: number | null, priceRatio?: number | null }): string {
  const points = pricing?.pointsEstimate;
  if (typeof points === 'number' && Number.isFinite(points)) return `≈${points} 积分`;
  const ratio = pricing?.priceRatio;
  if (typeof ratio === 'number' && Number.isFinite(ratio)) return `×${Math.round(ratio * 100) / 100} 倍率`;
  return '当前参数不支持报价';
}

/** Billing chip derived from the same field the hub ranks on. */
export function formatBillingLabel(billingMode?: string): string {
  if (billingMode === 'per_second') return '按秒计费';
  if (billingMode === 'per_task') return '按条计费';
  if (billingMode === 'per_token') return '按量计费';
  return '';
}

/** `≈3476 积分`, or the empty state when the parameter set has no quote. */
export function formatPointsLabel(pointsEstimate?: number | null): string {
  return typeof pointsEstimate === 'number' && Number.isFinite(pointsEstimate)
    ? `≈${pointsEstimate} 积分`
    : '当前参数不支持报价';
}

const SHORT_MODEL_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['seedance-2-0-fast', '2.0 Fast'],
  ['seedance-2.0-fast', '2.0 Fast'],
  ['seedance-2-0-mini', '2.0 Mini'],
  ['seedance-2.0-mini', '2.0 Mini'],
  ['seedance-2-5', 'Seedance 2.5'],
  ['seedance-2.5', 'Seedance 2.5'],
  ['seedance-2-0', 'Seedance 2.0'],
  ['seedance-2.0', 'Seedance 2.0'],
  ['seedance-1-5', '1.5 Pro'],
  ['seedance-1.5', '1.5 Pro'],
  ['wan-3.0', 'Wan 3.0'],
  ['wan3', 'Wan 3.0'],
  ['minimax-h3', 'Hailuo H3'],
  ['hailuo', 'Hailuo H3'],
  ['kling-o3', 'Kling O3'],
  ['kling', 'Kling'],
  ['grok-imagine-video', 'Grok Video'],
  ['gpt-image-2.5', 'Image 2.5'],
  ['midjourney', 'Midjourney'],
  ['mj-v8-1', 'Midjourney'],
  ['mj-v7', 'Midjourney'],
  ['nanobanana', 'NanoBanana'],
  ['nano-banana', 'NanoBanana'],
  ['seedream', 'Seedream'],
  ['grok-imagine-image', 'Grok Image'],
  ['claude-opus-5', 'Opus 5'],
  ['claude-opus-4-6', 'Opus 4.6'],
  ['opus-4.6', 'Opus 4.6'],
  ['deepseek-v4-flash', 'Flash Vision'],
  ['deepseek-v4-pro', 'DeepSeek Pro'],
  ['gemini-3.8-flash', 'Gemini 3.8'],
  ['gpt-5.5', 'GPT-5.5'],
];

/**
 * Family-keyed short names. The contract `family` outlives any canonical rename, so the capsule
 * keeps its compact label when a model id changes shape (e.g. `midjourney-8.1` → `mj-v8-1`).
 */
const FAMILY_SHORT_NAMES: Readonly<Record<string, string>> = {
  midjourney: 'Midjourney',
  nanobanana: 'NanoBanana',
  seedream: 'Seedream',
};

/**
 * Compact label for the trigger capsule (the menu itself shows full names).
 * @param modelId Model id (may carry a `@channelGroup` suffix).
 * @param family Contract family of the row, when the catalog exposes it.
 */
export function resolveShortModelName(modelId?: string, family?: string): string {
  if (!modelId) return '选择模型';
  const { modelId: id } = parseModelAndGroup(modelId);
  if (typeof family === 'string' && family.trim()) {
    const byFamily = FAMILY_SHORT_NAMES[family.trim().toLowerCase()];
    if (byFamily) return byFamily;
  }
  const lower = id.toLowerCase();
  for (const [fragment, label] of SHORT_MODEL_NAMES) {
    if (lower.includes(fragment)) return label;
  }
  return id;
}

/** Group ids named by a routing intent (`group`, `allowedGroups`); empty means automatic. */
function selectedGroupIds(routing: unknown, availableGroupIds?: Set<string>): Set<string> {
  const ids = new Set<string>();
  if (!routing || typeof routing !== 'object' || Array.isArray(routing)) return ids;
  const intent = routing as Record<string, unknown>;
  if (typeof intent.group === 'string' && intent.group.trim()) ids.add(intent.group.trim());
  if (typeof intent.channelGroupId === 'string' && intent.channelGroupId.trim()) {
    ids.add(intent.channelGroupId.trim());
  }
  if (Array.isArray(intent.allowedGroups)) {
    for (const candidate of intent.allowedGroups) {
      if (typeof candidate === 'string' && candidate.trim()) ids.add(candidate.trim());
    }
  }
  // 当 channelGroupId 与 allowedGroups[0] 为不同 BYOK ID 时，
  // 仅在 explicitByokId 确实在可用列表（若提供）中有效时，才将其作为权威来源剔除备选的 BYOK 分组；
  // 若 explicitByokId 已陈旧失效，则保留 allowedGroups 中的候选以防约束清空逃逸
  const explicitByokId = (typeof intent.channelGroupId === 'string' && isByokGroup(intent.channelGroupId.trim()))
    ? intent.channelGroupId.trim()
    : null;
  const isExplicitValid = explicitByokId && (!availableGroupIds || availableGroupIds.has(explicitByokId));
  if (isExplicitValid) {
    for (const id of Array.from(ids)) {
      if (isByokGroup(id) && id !== explicitByokId) {
        ids.delete(id);
      }
    }
  }
  const hasByok = Array.from(ids).some((id) => isByokGroup(id));
  const hasOfficial = Array.from(ids).some((id) => !isByokGroup(id));
  if (hasByok && hasOfficial) {
    if (intent.sourceType === 'byok') {
      return new Set(Array.from(ids).filter((id) => isByokGroup(id)));
    }
    if (intent.sourceType === 'official') {
      return new Set(Array.from(ids).filter((id) => !isByokGroup(id)));
    }
    return new Set<string>();
  }
  return ids;
}

/** What several selected lines agree on; a field they declare differently is released. */
export function intersectLineConstraints(declarations: LineConstraints[]): LineConstraints {
  let operations: string[] | null = null;
  const inputs: Record<string, { max?: number }> = {};
  const parameters: Record<string, { fixed?: unknown; only?: unknown[] }> = {};
  for (const declaration of declarations) {
    if (Array.isArray(declaration.operations) && declaration.operations.length > 0) {
      operations = operations === null
        ? [...declaration.operations]
        : operations.filter((id) => declaration.operations!.includes(id));
    }
    for (const [type, limit] of Object.entries(declaration.inputs ?? {})) {
      if (!limit || typeof limit.max !== 'number') continue;
      const current = inputs[type]?.max;
      inputs[type] = { max: typeof current === 'number' ? Math.min(current, limit.max) : limit.max };
    }
    for (const [field, constraint] of Object.entries(declaration.parameters ?? {})) {
      if (!constraint) continue;
      const current = parameters[field];
      if (typeof constraint.fixed !== 'undefined') {
        const conflict = current && typeof current.fixed !== 'undefined' && !Object.is(current.fixed, constraint.fixed);
        parameters[field] = conflict ? {} : { ...(current ?? {}), fixed: constraint.fixed };
        continue;
      }
      if (Array.isArray(constraint.only)) {
        const only = Array.isArray(current?.only)
          ? current.only.filter((value) => constraint.only!.some((candidate) => Object.is(candidate, value)))
          : constraint.only;
        parameters[field] = { ...(current ?? {}), only };
      }
    }
  }
  return {
    ...(operations ? { operations } : {}),
    ...(Object.keys(inputs).length > 0 ? { inputs } : {}),
    ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
  };
}

/**
 * Line constraints the node currently routes to.
 *
 * A line may accept far less than the model contract publishes, so the canvas reads
 * the declaration here before the contract reaches slot layout, operation lists or
 * parameter controls. Automatic routing applies nothing; several lines apply what
 * they agree on, with the stricter ceiling winning.
 *
 * @param modelId Model id (may carry a `@channelGroup` suffix).
 * @param routing Persisted routing intent (`group` and/or `allowedGroups`).
 * @param runtimeSettings Optional runtime settings to resolve dynamic BYOK channels.
 */
/**
 * 纯函数：针对视频自备渠道的兜底参数约束注入（标准比例与时长），避免契约逃逸。
 */
export function injectVideoByokDefaults(raw: LineConstraints = {}): LineConstraints {
  return {
    ...raw,
    inputs: {
      ...raw.inputs,
      image: raw.inputs?.image ?? { max: 1 },
    },
    parameters: {
      ...(raw.parameters || {}),
      aspectRatio: raw.parameters?.aspectRatio ?? { only: ['16:9', '9:16', '1:1'] },
      duration: raw.parameters?.duration ?? { only: [5, 10] },
    },
  };
}

export function resolveLineConstraints(
  modelId: string,
  routing: unknown,
  runtimeSettings?: RuntimeByokChannelSettings | null,
): LineConstraints {
  const effectiveSettings = runtimeSettings ?? null;
  const { modelId: id } = parseModelAndGroup(modelId);
  const groups = resolveModelChannelGroups(id, effectiveSettings);
  const availableGroupIds = new Set(groups.map((g) => g.id));
  const selected = selectedGroupIds(routing, availableGroupIds);
  if (selected.size === 0) return {};
  const declarations = groups
    .filter((group) => selected.has(group.id) || (group.wireGroup ? selected.has(group.wireGroup) : false))
    .map((group) => group.constraints)
    .filter((constraint): constraint is LineConstraints => Boolean(constraint));

  if (declarations.length === 0) {
    const confirmedActiveByokGroup = groups.find(
      (group) => isByokGroup(group) && (selected.has(group.id) || (group.wireGroup ? selected.has(group.wireGroup) : false)),
    );
    if (confirmedActiveByokGroup) {
      const base = confirmedActiveByokGroup.constraints || DEFAULT_BYOK_CONSTRAINTS;
      const modality = detectModelModality(id);
      if (modality === 'video') {
        return injectVideoByokDefaults(base);
      }
      return base;
    }
    return {};
  }

  const rawResult: LineConstraints = (declarations.length === 1 ? declarations[0] : intersectLineConstraints(declarations)) || {};
  // 若命中了自备渠道且属于视频模型，兜底注入基础参数约束（标准比例与时长），避免契约逃逸
  if (detectModelModality(id) === 'video' && groups.some((g) => isByokGroup(g) && (selected.has(g.id) || (g.wireGroup ? selected.has(g.wireGroup) : false)))) {
    return injectVideoByokDefaults(rawResult);
  }

  return rawResult;
}

// This module owns the group table, so it installs the lookup that the shared contract
// surfaces read through. Without it they keep the full model declaration.
setLineConstraintResolver(resolveLineConstraints);

/**
 * 渠道单选互斥路由派发载荷
 */
export interface ChannelSelectionPayload {
  modelId: string;
  strategy: 'auto';
  allowedGroups?: string[];
  channelGroupId?: string;
  sourceType?: 'official' | 'byok';
}

/**
 * 纯函数：根据模型 ID、选中的分组 ID 列表及当前可用分组，构造单选互斥路由派发载荷。
 * 纯函数，独立于 React 组件生命周期，供 ModelCascadeMenu 派发与白盒测试直接断言。
 */
export function buildChannelSelectionPayload(
  modelId: string,
  groupIds: string[],
  availableGroups: ChannelGroupItem[] = [],
): ChannelSelectionPayload | null {
  if (groupIds.length === 0) {
    return {
      modelId,
      strategy: 'auto',
    };
  }
  if (groupIds.length > 1) {
    return null;
  }
  const [primaryGroupId] = groupIds;
  if (!primaryGroupId) return null;
  const matchedGroup = availableGroups.find((g) => g.id === primaryGroupId);
  if (!matchedGroup || matchedGroup.enabled === false || matchedGroup.isAvailable === false) {
    return null;
  }
  const isByok = isByokGroup(matchedGroup);
  return {
    modelId,
    strategy: 'auto',
    allowedGroups: [primaryGroupId],
    ...(isByok ? { channelGroupId: primaryGroupId, sourceType: 'byok' } : {}),
  };
}
