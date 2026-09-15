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
  pricing?: {
    /** Numeric estimate; `null` when the parameter set has no published price. */
    pointsEstimate: number | null;
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
      "label": "进阶版",
      "badge": "按次高价专线 · Pidoi 满血",
      "pricing": {
        "pointsEstimate": 3476,
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
        "pointsEstimate": 3568,
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
      "badge": "官转专线 · 极稳高画质",
      "pricing": {
        "pointsEstimate": 1560,
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
        "pointsEstimate": 1040,
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
      "label": "特惠版",
      "badge": "限时特惠 · 按条计费",
      "pricing": {
        "pointsEstimate": 800,
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
        "pointsEstimate": 950,
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
      "label": "特惠版",
      "badge": "特惠走量 · 按条计费",
      "pricing": {
        "pointsEstimate": 750,
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
      "label": "进阶版",
      "badge": "按次高价专线 · 满血出片",
      "pricing": {
        "pointsEstimate": 4500,
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
      "enabled": true
    },
    {
      "id": "standard",
      "label": "标准版",
      "badge": "全新 2.5 旗舰 · 官方原生专线",
      "pricing": {
        "pointsEstimate": 1800,
        "discountRate": 1,
        "billingMode": "per_second"
      },
      "sla": {
        "stability24h": 100,
        "avgWaitTimeSec": 60
      },
      "wireGroup": "default",
      "enabled": true
    },
    {
      "id": "cheap",
      "label": "特惠版",
      "badge": "限时特惠 · 30秒按次专线",
      "pricing": {
        "pointsEstimate": 900,
        "discountRate": 0.5,
        "billingMode": "per_task"
      },
      "sla": {
        "stability24h": 90,
        "avgWaitTimeSec": 120
      },
      "constraints": {
        "operations": [
          "video_multi_ref"
        ],
        "parameters": {
          "duration": {
            "fixed": 30
          },
          "resolution": {
            "only": [
              "720p"
            ]
          },
          "aspectRatio": {
            "only": [
              "16:9",
              "9:16"
            ]
          }
        },
        "inputs": {
          "image": {
            "max": 9
          },
          "video": {
            "max": 0
          },
          "audio": {
            "max": 0
          }
        }
      },
      "wireGroup": "seedance-cheap",
      "enabled": true
    }
  ],
  "claude-opus-4-6": [
    {
      "id": "claude-max-open",
      "label": "顶配满血版",
      "badge": "Claude Max 外接版",
      "pricing": { "pointsEstimate": 2000, "discountRate": 1.0, "billingMode": "per_token" },
      "sla": { "stability24h": 100, "avgWaitTimeSec": 8 },
      "wireGroup": "claude-max-open",
      "enabled": true
    },
    {
      "id": "claude-plus",
      "label": "进阶增强版",
      "badge": "Claude Plus 精品专线",
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
      "label": "官方直连版",
      "badge": "官方满血直签",
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
        "pointsEstimate": 1200,
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
  "minimax-h3": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "海螺 MiniMax 官方专线",
      "pricing": {
        "pointsEstimate": 1100,
        "discountRate": 1,
        "billingMode": "per_second"
      },
      "sla": {
        "stability24h": 99,
        "avgWaitTimeSec": 50
      },
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
      "label": "特惠版",
      "badge": "经济走量特惠池",
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
        "pointsEstimate": 200,
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
        "pointsEstimate": 225,
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
        "pointsEstimate": 225,
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
        "pointsEstimate": 150,
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
      "label": "高价档",
      "badge": "Evolink 全档高清专线",
      "pricing": {
        "pointsEstimate": 260,
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
        "pointsEstimate": 600,
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
        "pointsEstimate": 1000,
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
        "pointsEstimate": 1500,
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
      "label": "号池版",
      "badge": "自建号池 · 随心用",
      "pricing": {
        "pointsEstimate": 450,
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
        "pointsEstimate": 800,
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
export function getModelChannelGroups(modelId: string): ChannelGroupItem[] {
  const { modelId: canonical } = parseModelAndGroup(modelId);
  return MODEL_CHANNEL_GROUPS[canonical] ? [...MODEL_CHANNEL_GROUPS[canonical]] : [];
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
function selectedGroupIds(routing: unknown): Set<string> {
  const ids = new Set<string>();
  if (!routing || typeof routing !== 'object' || Array.isArray(routing)) return ids;
  const intent = routing as Record<string, unknown>;
  if (typeof intent.group === 'string' && intent.group.trim()) ids.add(intent.group.trim());
  if (Array.isArray(intent.allowedGroups)) {
    for (const candidate of intent.allowedGroups) {
      if (typeof candidate === 'string' && candidate.trim()) ids.add(candidate.trim());
    }
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
 */
export function resolveLineConstraints(modelId: string, routing: unknown): LineConstraints {
  const selected = selectedGroupIds(routing);
  if (selected.size === 0) return {};
  const { modelId: id } = parseModelAndGroup(modelId);
  const declarations = getModelChannelGroups(id)
    .filter((group) => selected.has(group.id) || (group.wireGroup ? selected.has(group.wireGroup) : false))
    .map((group) => group.constraints)
    .filter((constraint): constraint is LineConstraints => Boolean(constraint));
  if (declarations.length === 0) return {};
  return declarations.length === 1 ? declarations[0] : intersectLineConstraints(declarations);
}

// This module owns the group table, so it installs the lookup that the shared contract
// surfaces read through. Without it they keep the full model declaration.
setLineConstraintResolver(resolveLineConstraints);
