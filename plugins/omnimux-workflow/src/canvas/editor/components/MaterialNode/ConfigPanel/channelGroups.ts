/**
 * Channel Groups, metadata definitions, and routing policies for Canvas Workflow Node ConfigPanel.
 * Supports Video, Image, and Text modalities.
 */

export interface ChannelGroupItem {
  id: string;
  label: string;
  badge?: string;
  pricing?: {
    pointsEstimate: number | string;
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
  // Seedance 2.0 Fast (1:1 对齐用户实测截图)
  'seedance-2-0-fast': [
    {
      id: 'pro',
      label: '进阶版',
      badge: '9.7折 · 满血真人 · 专属素材库 · 按秒计费',
      pricing: { pointsEstimate: 1121, discountRate: 0.97, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 30 },
      enabled: true,
    },
    {
      id: 'official',
      label: '官方版',
      badge: '原生不加价 · 按秒计费',
      pricing: { pointsEstimate: 1154, discountRate: 1.0, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 45 },
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '7.1折 · 限时特惠 · 按秒计费',
      pricing: { pointsEstimate: 546, discountRate: 0.71, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 180 },
      enabled: true,
    },
    {
      id: 'preferred',
      label: '优选版',
      badge: '8.1折 · 限时特惠 · 按秒计费',
      pricing: { pointsEstimate: 624, discountRate: 0.81, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 180 },
      enabled: true,
    },
    {
      id: 'cheap',
      label: '特惠版',
      badge: '按条计费 · 时长同价',
      pricing: { pointsEstimate: '当前参数不支持报价', discountRate: 0.25, billingMode: 'per_task' },
      sla: { stability24h: 100, avgWaitTimeSec: 120 },
      enabled: true,
    },
  ],

  // Seedance 2.0 (全能版)
  'seedance-2-0': [
    {
      id: 'pro',
      label: '进阶版',
      badge: '9.7折 · 满血真人 · 专属素材库 · 按秒计费',
      pricing: { pointsEstimate: 3476, discountRate: 0.97, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 60 },
      enabled: true,
    },
    {
      id: 'official',
      label: '官方版',
      badge: '原生不加价 · 按秒计费',
      pricing: { pointsEstimate: 3568, discountRate: 1.0, billingMode: 'per_second' },
      sla: { stability24h: 67, avgWaitTimeSec: 90 },
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '5.2折 · 限时特惠 · 按秒计费',
      pricing: { pointsEstimate: 1040, discountRate: 0.52, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 180 },
      enabled: true,
    },
    {
      id: 'preferred',
      label: '优选版',
      badge: '5.8折 · 限时特惠 · 按秒计费',
      pricing: { pointsEstimate: 1560, discountRate: 0.58, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 180 },
      enabled: true,
    },
    {
      id: 'cheap',
      label: '特惠版',
      badge: '按条计费 · 时长同价',
      pricing: { pointsEstimate: '当前参数不支持报价', discountRate: 0.25, billingMode: 'per_task' },
      sla: { stability24h: 100, avgWaitTimeSec: 120 },
      enabled: true,
    },
  ],

  // Seedance 2.5 (新旗舰)
  'seedance-2-5': [
    {
      id: 'pro',
      label: '进阶版',
      badge: '全新2.5旗舰 · 满血画质 · 按秒计费',
      pricing: { pointsEstimate: 4200, discountRate: 0.95, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 60 },
      enabled: true,
    },
    {
      id: 'official',
      label: '官方版',
      badge: '官方原生通道 · 按秒计费',
      pricing: { pointsEstimate: 4400, discountRate: 1.0, billingMode: 'per_second' },
      sla: { stability24h: 80, avgWaitTimeSec: 90 },
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '5.5折 · 限时特惠 · 按秒计费',
      pricing: { pointsEstimate: 1800, discountRate: 0.55, billingMode: 'per_second' },
      sla: { stability24h: 99, avgWaitTimeSec: 150 },
      enabled: true,
    },
  ],

  // Claude Opus 4.6 (文本旗舰)
  'claude-opus-4-6': [
    {
      id: 'claude-max-open',
      label: '顶配满血版',
      badge: '高优先级专线 · 无限速 · 极速交付',
      pricing: { pointsEstimate: 3140, discountRate: 3.14, billingMode: 'per_token' },
      sla: { stability24h: 100, avgWaitTimeSec: 3 },
      enabled: true,
    },
    {
      id: 'claude-plus',
      label: '进阶增强版',
      badge: '快速响应 · 专属企业池 · 稳定低延时',
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

  // DeepSeek Flash Vision (文本/视觉大模型)
  'deepseek-v4-flash-vision-exp': [
    {
      id: 'deepseek-official',
      label: '官方直连版',
      badge: '满血低延时 · 官方专属通道',
      pricing: { pointsEstimate: 1430, discountRate: 1.43, billingMode: 'per_token' },
      sla: { stability24h: 100, avgWaitTimeSec: 2 },
      enabled: true,
    },
    {
      id: 'default',
      label: '标准版',
      badge: '基础费率 · 极速自动分流',
      pricing: { pointsEstimate: 1000, discountRate: 1.0, billingMode: 'per_token' },
      sla: { stability24h: 99, avgWaitTimeSec: 4 },
      enabled: true,
    },
  ],

  // GPT Image 2.5 (图像旗舰)
  'gpt-image-2.5': [
    {
      id: 'pro',
      label: '进阶高精版',
      badge: '超清渲染 · 满血画质 · 优先生成',
      pricing: { pointsEstimate: 2100, discountRate: 0.95, billingMode: 'per_task' },
      sla: { stability24h: 100, avgWaitTimeSec: 15 },
      enabled: true,
    },
    {
      id: 'official',
      label: '官方版',
      badge: 'OpenAI 官方通道 · 原生不加价',
      pricing: { pointsEstimate: 2200, discountRate: 1.0, billingMode: 'per_task' },
      sla: { stability24h: 98, avgWaitTimeSec: 20 },
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '6.2折 · 限时特惠 · 高性价比',
      pricing: { pointsEstimate: 980, discountRate: 0.62, billingMode: 'per_task' },
      sla: { stability24h: 100, avgWaitTimeSec: 35 },
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

/**
 * 获取指定模型的渠道分组，若无定制配置则自动生成通用的优质渠道分组
 */
export function getOrGenerateModelChannelGroups(modelId: string): ChannelGroupItem[] {
  const custom = getModelChannelGroups(modelId);
  if (custom.length > 0) return custom;

  // 为其他通用模型提供标准渠道池模版
  return [
    {
      id: 'pro',
      label: '进阶版',
      badge: '满血增强 · 优先响应',
      pricing: { pointsEstimate: 1680, discountRate: 0.95, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 40 },
      enabled: true,
    },
    {
      id: 'official',
      label: '官方版',
      badge: '原生不加价',
      pricing: { pointsEstimate: 1750, discountRate: 1.0, billingMode: 'per_second' },
      sla: { stability24h: 95, avgWaitTimeSec: 50 },
      enabled: true,
    },
    {
      id: 'standard',
      label: '标准版',
      badge: '6.8折 · 限时特惠',
      pricing: { pointsEstimate: 880, discountRate: 0.68, billingMode: 'per_second' },
      sla: { stability24h: 100, avgWaitTimeSec: 90 },
      enabled: true,
    },
    {
      id: 'cheap',
      label: '特惠版',
      badge: '按条计费 · 时长同价',
      pricing: { pointsEstimate: '当前参数不支持报价', discountRate: 0.25, billingMode: 'per_task' },
      sla: { stability24h: 98, avgWaitTimeSec: 120 },
      enabled: true,
    },
  ];
}

/**
 * 提取精简的型号短名称（用于底栏触发药丸）
 */
export function resolveShortModelName(modelId?: string): string {
  if (!modelId) return '选择模型';
  const { modelId: id } = parseModelAndGroup(modelId);
  const lower = id.toLowerCase();

  // 视频模型映射
  if (lower.includes('seedance-2-0-fast') || lower.includes('seedance-2.0-fast')) return '2.0 Fast';
  if (lower.includes('seedance-2-0-mini') || lower.includes('seedance-2.0-mini')) return '2.0 Mini';
  if (lower.includes('seedance-2-0') || lower.includes('seedance-2.0')) return 'Seedance 2.0';
  if (lower.includes('seedance-2-5') || lower.includes('seedance-2.5')) return 'Seedance 2.5';
  if (lower.includes('seedance-1-5') || lower.includes('seedance-1.5')) return '1.5 Pro';
  if (lower.includes('wan-3.0') || lower.includes('wan3')) return 'Wan 3.0';
  if (lower.includes('minimax-h3') || lower.includes('hailuo')) return 'Hailuo H3';
  if (lower.includes('kling-o3')) return 'Kling O3';
  if (lower.includes('kling')) return 'Kling';
  if (lower.includes('grok-imagine-video')) return 'Grok Video';

  // 图像模型映射
  if (lower.includes('gpt-image-2.5') || lower.includes('gpt-image-2-5')) return 'Image 2.5';
  if (lower.includes('gpt-image-2')) return 'GPT Image 2';
  if (lower.includes('midjourney')) return 'Midjourney';
  if (lower.includes('nanobanana')) return 'NanoBanana';
  if (lower.includes('seedream')) return 'Seedream';
  if (lower.includes('grok-imagine-image')) return 'Grok Image';

  // 文本模型映射
  if (lower.includes('claude-opus-4-6') || lower.includes('opus-4.6')) return 'Opus 4.6';
  if (lower.includes('claude-opus-5')) return 'Opus 5';
  if (lower.includes('deepseek-v4-flash')) return 'Flash Vision';
  if (lower.includes('deepseek-v4-pro')) return 'DeepSeek Pro';
  if (lower.includes('gemini-3.8-flash')) return 'Gemini 3.8';
  if (lower.includes('gpt-5.5')) return 'GPT-5.5';

  return id;
}
