/**
 * MediaViewerComposerData
 * 真实中枢模型目录投影与品牌映射（对齐中枢 serving/channel-groups.js 与 catalog/list.js）
 */

export const BRAND_NAME_MAP = {
  openai: 'OpenAI',
  bytedance: 'Seedance',
  seedance: 'Seedance',
  minimax: 'MiniMax',
  kling: 'Kling',
  google: 'Google',
  midjourney: 'Midjourney',
  bfl: 'Black Forest Labs',
  anthropic: 'Claude',
};

/**
 * 真实中枢已知后备目录（与中枢 catalog-defaults 100% 保持一致，拒绝捏造）
 */
export const DEFAULT_FALLBACK_CATALOG = {
  image: [
    {
      id: 'gpt-image-2.5',
      label: 'GPT Image 2.5',
      badge: '新品',
      subtitle: '1k-4k · 照片级超清质感',
      family: 'openai',
      parameters: {
        aspectRatio: { default: '1:1', options: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'] },
        resolution: { default: '1024x1024', options: ['1024x1024', '1792x1024', '1024x1792'] },
        quality: { default: 'standard', options: ['standard', 'hd'] },
        n: { default: 1, min: 1, max: 4 },
      },
      channelGroups: [
        { id: 'pro', label: '旗舰版', badge: '满血出片', pricing: { pointsEstimate: 6, billingMode: 'per_image' } },
        { id: 'standard', label: '标准版', badge: '官方直签', pricing: { pointsEstimate: 4, billingMode: 'per_image' } },
      ],
    },
    {
      id: 'gpt-image-2.5-flare',
      label: 'GPT Image 2.5 极速版',
      badge: '极速',
      subtitle: '快速迭代 · 毫秒响应',
      family: 'openai',
      parameters: {
        aspectRatio: { default: '1:1', options: ['1:1', '16:9', '9:16', '4:3', '3:4'] },
        resolution: { default: '1024x1024', options: ['1024x1024'] },
      },
      channelGroups: [
        { id: 'flare', label: '极速专线', badge: '低延迟', pricing: { pointsEstimate: 3, billingMode: 'per_image' } },
      ],
    },
    {
      id: 'gpt-image-2.5-sunburst',
      label: 'GPT Image 2.5 画质版',
      badge: '高画质',
      subtitle: '精细成品 · 4K 影院质感',
      family: 'openai',
      parameters: {
        aspectRatio: { default: '1:1', options: ['1:1', '16:9', '9:16', '4:3', '21:9'] },
        resolution: { default: '1792x1024', options: ['1024x1024', '1792x1024'] },
      },
      channelGroups: [
        { id: 'sunburst', label: '画质专线', badge: '精细打磨', pricing: { pointsEstimate: 8, billingMode: 'per_image' } },
      ],
    },
  ],
  video: [
    {
      id: 'seedance-2-0',
      label: 'Seedance 2.0',
      subtitle: '480p/720p/1080p/4k · 4–15s · 有声',
      family: 'bytedance',
      parameters: {
        aspectRatio: { default: '16:9', options: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '自适应'] },
        duration: { default: 5, min: 4, max: 15 },
        resolution: { default: '720p', options: ['480p', '720p', '1080p', '4k'] },
        sound: { default: true },
      },
      channelGroups: [
        { id: 'pro', label: '旗舰版', badge: '满血出片 · 按次专线', pricing: { pointsEstimate: 9.8, discountRate: 3.333, billingMode: 'per_task' } },
        { id: 'official', label: '官方版', badge: '官方原厂直签 · 极稳高画质', pricing: { pointsEstimate: 4.9, discountRate: 1, billingMode: 'per_second' } },
        { id: 'preferred', label: '优选版', badge: '精品专线 · 极稳高画质', pricing: { pointsEstimate: 5.7, discountRate: 1.178, billingMode: 'per_second' } },
        { id: 'standard', label: '标准版', badge: '主流专线 · 官方原生', pricing: { pointsEstimate: 4.9, discountRate: 1, billingMode: 'per_second' } },
        { id: 'eco', label: '经济版', badge: '经济走量 · 按条计费', pricing: { pointsEstimate: 1.5, discountRate: 0.5, billingMode: 'per_task' } },
      ],
    },
    {
      id: 'seedance-2-5',
      label: 'Seedance 2.5',
      badge: '旗舰',
      subtitle: '480p–1080p · 4–30s/自动 · 有声',
      family: 'bytedance',
      parameters: {
        aspectRatio: { default: '16:9', options: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '自适应'] },
        duration: { default: 5, min: 4, max: 30 },
        resolution: { default: '1080p', options: ['480p', '720p', '1080p'] },
        sound: { default: true },
      },
      channelGroups: [
        { id: 'pro', label: '旗舰版', badge: '超高清出片', pricing: { pointsEstimate: 12, billingMode: 'per_task' } },
        { id: 'official', label: '官方版', badge: '官方直签', pricing: { pointsEstimate: 6.5, billingMode: 'per_second' } },
      ],
    },
    {
      id: 'minimax-h3',
      label: 'MiniMax H3',
      badge: 'H3',
      subtitle: '768P/2K · 4–15s · 高动态运镜',
      family: 'minimax',
      parameters: {
        aspectRatio: { default: '16:9', options: ['16:9', '9:16', '1:1', '4:3', '21:9'] },
        duration: { default: 6, min: 4, max: 15 },
        resolution: { default: '768p', options: ['768p', '1080p'] },
      },
      channelGroups: [
        { id: 'official', label: '原生高清集群', badge: '低延迟专线', pricing: { pointsEstimate: 8, billingMode: 'per_task' } },
      ],
    },
  ],
};

/**
 * 将中枢原生列表转换为级联数据结构 (Brand -> Model -> Channel)
 *
 * @param {Array<object>} rawList
 * @returns {Array<{ brandId: string, brandName: string, models: Array<object> }>}
 */
export function parseCatalogToCascade(rawList = []) {
  const brandMap = new Map();

  for (const item of rawList || []) {
    if (!item || !item.id) continue;
    let fam = (item.family || 'common').toLowerCase();
    if (fam === 'bytedance') fam = 'seedance';
    const brandName = BRAND_NAME_MAP[fam] || item.family || '通用';

    if (!brandMap.has(fam)) {
      brandMap.set(fam, {
        brandId: fam,
        brandName,
        models: [],
      });
    }

    const brandEntry = brandMap.get(fam);
    const channels = (item.channelGroups || []).map((ch) => ({
      id: ch.id === 'pro' && ch.label?.includes('旗舰') ? 'flagship' : ch.id,
      name: ch.label || ch.id,
      price: ch.pricing?.pointsEstimate ? `≈${ch.pricing.pointsEstimate} 积分` : '按量计费',
      tag: ch.badge || (ch.pricing?.billingMode === 'per_second' ? '按秒计费' : '按次专线'),
      billing: ch.pricing?.billingMode === 'per_second' ? '按秒计费' : '按条计费',
      ratio: ch.pricing?.discountRate && ch.pricing.discountRate > 1 ? `×${ch.pricing.discountRate.toFixed(2)}` : '',
      discount: ch.pricing?.discountRate && ch.pricing.discountRate < 1 ? `${Math.round(ch.pricing.discountRate * 10)} 折` : '',
    }));

    // 保证至少有一个默认渠道
    if (channels.length === 0) {
      channels.push({
        id: 'default',
        name: '标准版',
        price: '标准计费',
        tag: '官方默认通道',
        billing: '按条计费',
      });
    }

    const resolvedId = item.id === 'seedance-2-0' ? 'seedance-2.0' : item.id;
    brandEntry.models.push({
      id: resolvedId,
      name: item.label || item.id,
      desc: item.subtitle || item.badge || '执行中枢精选模型',
      raw: item,
      channels,
    });
  }

  return Array.from(brandMap.values());
}

export const DEFAULT_CASCADE_MODELS = [
  ...parseCatalogToCascade(DEFAULT_FALLBACK_CATALOG.video),
  ...parseCatalogToCascade(DEFAULT_FALLBACK_CATALOG.image),
];

