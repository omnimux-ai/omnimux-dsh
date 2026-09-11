/**
 * Channel Groups and routing policies for Canvas Workflow Node ConfigPanel.
 * Self-contained in omnimux-workflow to respect domain plugin boundaries.
 */

export interface ChannelGroupItem {
  id: string;
  label: string;
  badge?: string;
  pricing?: {
    pointsEstimate: number;
    discountRate?: number;
    billingMode?: string;
  };
  sla?: {
    stability24h: number;
    avgWaitTimeSec?: number;
  };
  enabled: boolean;
}

export const MODEL_CHANNEL_GROUPS: Record<string, ChannelGroupItem[]> = {
  'seedance-2-0': [
    {
      id: 'pro',
      label: '进阶版',
      badge: '9.7折 · 满血真人 · 专属素材库',
      pricing: { pointsEstimate: 3476, discountRate: 0.97, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 60 },
      enabled: true,
    },
    {
      id: 'official',
      label: '官方版',
      badge: '原生态不加价',
      pricing: { pointsEstimate: 3568, discountRate: 1.0, billingMode: 'per_second' },
      sla: { stability24h: 67, avgWaitTimeSec: 90 },
      enabled: true,
    },
    {
      id: 'preferred',
      label: '优选版',
      badge: '5.8折 · 限时特惠',
      pricing: { pointsEstimate: 1560, discountRate: 0.58, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 180 },
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '5.2折 · 限时特惠',
      pricing: { pointsEstimate: 1040, discountRate: 0.52, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 180 },
      enabled: true,
    },
    {
      id: 'cheap',
      label: '特惠版',
      badge: '按条计费 · 时长同价',
      pricing: { pointsEstimate: 800, discountRate: 0.25, billingMode: 'per_task' },
      sla: { stability24h: 100, avgWaitTimeSec: 120 },
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
      enabled: true,
    },
    {
      id: 'official',
      label: '官方版',
      badge: '官方原生通道',
      pricing: { pointsEstimate: 3000, discountRate: 1.0, billingMode: 'per_second' },
      sla: { stability24h: 85, avgWaitTimeSec: 45 },
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '5.2折 · 高性价比',
      pricing: { pointsEstimate: 950, discountRate: 0.52, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 60 },
      enabled: true,
    },
    {
      id: 'cheap',
      label: '特惠版',
      badge: '排队约2min',
      pricing: { pointsEstimate: 750, discountRate: 0.25, billingMode: 'per_task' },
      sla: { stability24h: 98, avgWaitTimeSec: 120 },
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
      enabled: true,
    },
    {
      id: 'official',
      label: '官方版',
      badge: '官方原生通道',
      pricing: { pointsEstimate: 4400, discountRate: 1.0, billingMode: 'per_second' },
      sla: { stability24h: 80, avgWaitTimeSec: 90 },
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '限时特惠',
      pricing: { pointsEstimate: 1800, discountRate: 0.55, billingMode: 'per_second' },
      sla: { stability24h: 99, avgWaitTimeSec: 150 },
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
      enabled: true,
    },
    {
      id: 'claude-plus',
      label: '进阶增强版',
      badge: '快速响应 · 专属企业池',
      pricing: { pointsEstimate: 1430, discountRate: 1.43, billingMode: 'per_token' },
      sla: { stability24h: 100, avgWaitTimeSec: 5 },
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '标准公网池 · 高性价比',
      pricing: { pointsEstimate: 1000, discountRate: 1.0, billingMode: 'per_token' },
      sla: { stability24h: 98, avgWaitTimeSec: 10 },
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
      enabled: true,
    },
    {
      id: 'default',
      label: '标准版',
      badge: '基础费率 · 极速分流',
      pricing: { pointsEstimate: 1000, discountRate: 1.0, billingMode: 'per_token' },
      sla: { stability24h: 99, avgWaitTimeSec: 4 },
      enabled: true,
    },
  ],
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

export function getModelChannelGroups(modelId: string): ChannelGroupItem[] {
  const { modelId: canonical } = parseModelAndGroup(modelId);
  return MODEL_CHANNEL_GROUPS[canonical] ? [...MODEL_CHANNEL_GROUPS[canonical]] : [];
}
