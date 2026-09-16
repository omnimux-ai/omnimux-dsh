/**
 * OmniMux Model Channel Groups and Routing Strategies.
 * Supports Brand -> Model ID -> Channel Group hierarchical routing,
 * with 'auto', 'stability_first', and 'cost_first' dispatching policies.
 */

import { gatewayCandidates, toProductId } from './id-universe.js'

export const ROUTING_STRATEGIES = Object.freeze(['auto', 'stability_first', 'cost_first'])

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
      "badge": "精品专线 · 极稳高画质",
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
      "label": "经济版",
      "badge": "经济走量 · 按条计费",
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
      "label": "经济版",
      "badge": "经济走量 · 按条计费",
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
      "label": "旗舰版",
      "badge": "满血出片 · 按次专线",
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
  // H3 全系列按分组接入：包含官方原生标准版、3倍速极速版、ComfyUI工作流双档专线、以及15秒长片版。
  // 各自通过 `wireModel` 绑定上游独立型号，并通过 `wireGroup` 挂载对应的官方或专属分组。
  // 每个分组携带独立契约，实现完全隔离的参数与计费控制。
  "minimax-h3": [
    {
      "id": "standard",
      "label": "标准版",
      "badge": "海螺 MiniMax 官方专线 · 4–15 秒",
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
    },
    {
      // 上游 `minimax-h3-turbo`（ID 172）：海螺 3.0 极速版视频生成，$0.035/次，出片提速 3 倍。
      "id": "turbo",
      "label": "极速版",
      "badge": "海螺 3.0 极速版 · 3倍出片速度",
      "pricing": {
        "pointsEstimate": 540,
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
        "pointsEstimate": 350,
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
        "pointsEstimate": 440,
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
        "pointsEstimate": 5825,
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
        "pointsEstimate": 200,
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
        "pointsEstimate": 225,
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
        "pointsEstimate": 225,
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
      "label": "高清版",
      "badge": "全档高清专线",
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
      "label": "经济版",
      "badge": "极致低价 · 随取随用",
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
})

/**
 * Split a model reference like "seedance-2-0@standard" into model and group.
 * @param {unknown} input
 * @returns {{ modelId: string, group: string | null }}
 */
export function parseModelAndGroup(input) {
  if (typeof input !== 'string') return { modelId: '', group: null }
  const trimmed = input.trim()
  const atIndex = trimmed.indexOf('@')
  if (atIndex < 0) {
    return { modelId: toProductId(trimmed), group: null }
  }
  const rawModel = trimmed.slice(0, atIndex).trim()
  const rawGroup = trimmed.slice(atIndex + 1).trim()
  const modelId = toProductId(rawModel)
  if (!modelId) return { modelId: '', group: null }
  return {
    modelId,
    group: rawGroup || null,
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

/** Points used for ranking when a group publishes no numeric estimate. */
const UNPRICED_RANKING_POINTS = 1000

/**
 * Numeric point estimate only. Display-only notes (`当前参数不支持报价`) never
 * participate in ranking, so a note can never reorder the failover plan.
 * @param {{ pricing?: { pointsEstimate?: number | string } }} group
 * @returns {number | null}
 */
function pointsOf(group) {
  const points = group.pricing?.pointsEstimate
  if (typeof points === 'number' && Number.isFinite(points)) return points
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

  const groups = getModelChannelGroups(canonicalModel)
  if (groups.length === 0) {
    // No pool is configured for this model, so the intent cannot be honored.
    // Report the ids that could not be resolved instead of pretending they applied.
    const unresolvedGroups = allowed ? [...options.allowedGroups].map((id) => String(id).trim()).filter(Boolean) : (requestedGroup ? [requestedGroup] : [])
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
    const matched = groups.find((group) => group.id === requestedGroup || group.wireGroup === requestedGroup)
    const tail = enabled.filter((group) => group.id !== requestedGroup && group.wireGroup !== requestedGroup)
    // The pool restricts the failover tail too: naming one group is not a licence
    // to try the caller's excluded (often pricier) groups.
    const orderedTail = tail.filter(isAllowed).sort(comparatorFor(strategy))
    const unresolvedGroups = matched ? [] : [requestedGroup]
    // The named line leads through the same builder as the tail: naming `task` on a
    // product whose lines point at different upstream models must route to *that*
    // line's model, not to the product id.
    const head = matched ? wireOf(matched) : `${canonicalModel}@${requestedGroup}`
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
