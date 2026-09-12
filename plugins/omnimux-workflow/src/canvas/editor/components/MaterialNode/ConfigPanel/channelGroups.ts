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

export interface ChannelGroupItem {
  id: string;
  label: string;
  badge?: string;
  pricing?: {
    /** Numeric estimate; `null` when the parameter set has no published price. */
    pointsEstimate: number | null;
    discountRate?: number;
    billingMode?: string;
  };
  sla?: {
    stability24h: number;
    avgWaitTimeSec?: number;
  };
  /** Gateway group appended as `model@wireGroup`; falls back to `id`. */
  wireGroup?: string;
  enabled: boolean;
}

export const MODEL_CHANNEL_GROUPS: Record<string, ChannelGroupItem[]> = {
  'seedance-2-0': [
    {
      id: 'pro',
      label: '进阶版',
      badge: '满血真人 · 专属素材库',
      pricing: { pointsEstimate: 3476, discountRate: 0.97, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 60 },
      wireGroup: 'seedance-pro',
      enabled: true,
    },
    {
      id: 'official',
      label: '官方版',
      badge: '原生不加价',
      pricing: { pointsEstimate: 3568, discountRate: 1.0, billingMode: 'per_second' },
      sla: { stability24h: 67, avgWaitTimeSec: 90 },
      wireGroup: 'official',
      enabled: true,
    },
    {
      id: 'preferred',
      label: '优选版',
      badge: '限时特惠',
      pricing: { pointsEstimate: 1560, discountRate: 0.58, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 180 },
      wireGroup: 'seedance-standard',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '限时特惠',
      pricing: { pointsEstimate: 1040, discountRate: 0.52, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 180 },
      wireGroup: 'standard',
      enabled: true,
    },
    {
      id: 'cheap',
      label: '特惠版',
      badge: '时长同价',
      pricing: { pointsEstimate: 800, discountRate: 0.25, billingMode: 'per_task' },
      sla: { stability24h: 100, avgWaitTimeSec: 120 },
      wireGroup: 'seedance-cheap',
      enabled: true,
    },
  ],
  'seedance-2-0-fast': [
    {
      id: 'pro',
      label: '进阶版',
      badge: '极速出片 · 满血真人',
      pricing: { pointsEstimate: 2900, discountRate: 0.95, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 30 },
      wireGroup: 'seedance-pro',
      enabled: true,
    },
    {
      id: 'official',
      label: '官方版',
      badge: '官方原生通道',
      pricing: { pointsEstimate: 3000, discountRate: 1.0, billingMode: 'per_second' },
      sla: { stability24h: 85, avgWaitTimeSec: 45 },
      wireGroup: 'official',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '高性价比',
      pricing: { pointsEstimate: 950, discountRate: 0.52, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 60 },
      wireGroup: 'standard',
      enabled: true,
    },
    {
      id: 'cheap',
      label: '特惠版',
      badge: '排队约2min',
      pricing: { pointsEstimate: 750, discountRate: 0.25, billingMode: 'per_task' },
      sla: { stability24h: 98, avgWaitTimeSec: 120 },
      wireGroup: 'seedance-cheap',
      enabled: true,
    },
  ],
  'seedance-2-5': [
    {
      id: 'pro',
      label: '进阶版',
      badge: '全新2.5旗舰 · 满血画质',
      pricing: { pointsEstimate: 4200, discountRate: 0.95, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 60 },
      wireGroup: 'seedance-pro',
      enabled: true,
    },
    {
      id: 'official',
      label: '官方版',
      badge: '官方原生通道',
      pricing: { pointsEstimate: 4400, discountRate: 1.0, billingMode: 'per_second' },
      sla: { stability24h: 80, avgWaitTimeSec: 90 },
      wireGroup: 'official',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '限时特惠',
      pricing: { pointsEstimate: 1800, discountRate: 0.55, billingMode: 'per_second' },
      sla: { stability24h: 99, avgWaitTimeSec: 150 },
      wireGroup: 'seedance-standard',
      enabled: true,
    },
  ],
  'claude-opus-4-6': [
    {
      id: 'claude-max-open',
      label: '顶配满血版',
      badge: '高优先级专线 · 无限速',
      pricing: { pointsEstimate: 3140, discountRate: 3.14, billingMode: 'per_token' },
      sla: { stability24h: 100, avgWaitTimeSec: 3 },
      wireGroup: 'claude-max-open',
      enabled: true,
    },
    {
      id: 'claude-plus',
      label: '进阶增强版',
      badge: '快速响应 · 专属企业池',
      pricing: { pointsEstimate: 1430, discountRate: 1.43, billingMode: 'per_token' },
      sla: { stability24h: 100, avgWaitTimeSec: 5 },
      wireGroup: 'claude-plus',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '标准公网池 · 高性价比',
      pricing: { pointsEstimate: 1000, discountRate: 1.0, billingMode: 'per_token' },
      sla: { stability24h: 98, avgWaitTimeSec: 10 },
      wireGroup: 'standard',
      enabled: true,
    },
  ],
  'deepseek-v4-flash-vision-exp': [
    {
      id: 'deepseek-official',
      label: '官方直连版',
      badge: '满血低延时 · 官方通道',
      pricing: { pointsEstimate: 1430, discountRate: 1.43, billingMode: 'per_token' },
      sla: { stability24h: 100, avgWaitTimeSec: 2 },
      wireGroup: 'deepseek-official',
      enabled: true,
    },
    {
      id: 'default',
      label: '标准版',
      badge: '基础费率 · 极速自动分流',
      pricing: { pointsEstimate: 1000, discountRate: 1.0, billingMode: 'per_token' },
      sla: { stability24h: 99, avgWaitTimeSec: 4 },
      wireGroup: 'default',
      enabled: true,
    },
  ],
  'kling': [
    {
      id: 'pro',
      label: '专业版',
      badge: '极速生成 · 高清专线',
      pricing: { pointsEstimate: 2400, discountRate: 1.2, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 40 },
      wireGroup: 'kling-pro',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '稳定经济',
      pricing: { pointsEstimate: 1700, discountRate: 0.85, billingMode: 'per_second' },
      sla: { stability24h: 98, avgWaitTimeSec: 80 },
      wireGroup: 'kling-standard',
      enabled: true,
    },
  ],
  'minimax-h3': [
    {
      id: 'pro',
      label: '专业版',
      badge: '专属通道 · 优先排队',
      pricing: { pointsEstimate: 2200, discountRate: 1.1, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 50 },
      wireGroup: 'minimax-pro',
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '经济普惠',
      pricing: { pointsEstimate: 1600, discountRate: 0.8, billingMode: 'per_second' },
      sla: { stability24h: 99, avgWaitTimeSec: 90 },
      wireGroup: 'minimax-standard',
      enabled: true,
    },
  ],
}

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

/** `0.52` → `5.2折`; undiscounted groups produce no chip. */
export function formatDiscountLabel(discountRate?: number): string {
  if (typeof discountRate !== 'number' || !Number.isFinite(discountRate) || discountRate >= 1) return '';
  return `${Math.round(discountRate * 100) / 10}折`;
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
  ['gpt-image-2-5', 'Image 2.5'],
  ['gpt-image-2', 'GPT Image 2'],
  ['midjourney', 'Midjourney'],
  ['nanobanana', 'NanoBanana'],
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

/** Compact label for the trigger capsule (the menu itself shows full names). */
export function resolveShortModelName(modelId?: string): string {
  if (!modelId) return '选择模型';
  const { modelId: id } = parseModelAndGroup(modelId);
  const lower = id.toLowerCase();
  for (const [fragment, label] of SHORT_MODEL_NAMES) {
    if (lower.includes(fragment)) return label;
  }
  return id;
}
