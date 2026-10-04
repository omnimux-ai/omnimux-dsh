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
      subtitle: '标准版 1K · 高分档依渠道',
      family: 'openai',
      parameters: {
        aspectRatio: {
          defaultValue: '16:9',
          options: [
            { value: 'auto', label: '自适应' },
            '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9',
          ],
        },
        resolution: { defaultValue: '1K', options: ['1K', '2K', '4K'] },
        quality: { defaultValue: 'standard', options: ['standard', 'hd'] },
        n: { defaultValue: 1, options: [1, 2, 4] },
      },
      channelGroups: [
        { id: 'pro', label: '旗舰版', badge: '原生高分 · 独立线路', wireGroup: 'gpt-image-2.5-pro', pricing: { pointsEstimate: 0.036765, discountRate: 0.281248, billingMode: 'per_task' } },
        {
          id: 'standard', label: '标准版', default: true, badge: '基础清晰度 · 异步出图', wireGroup: 'default',
          constraints: { parameters: { resolution: { fixed: '1K' }, quality: { supported: false }, n: { fixed: 1 } } },
          pricing: { pointsEstimate: 0.13072, discountRate: 1, billingMode: 'per_task' },
        },
        { id: 'economy', label: '经济版', badge: '经济走量 · 独立线路', wireGroup: 'gpt-image-2.5-economy', pricing: { pointsEstimate: 0.0147, discountRate: 0.112455, billingMode: 'per_task' } },
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
        resolution: { defaultValue: '1K', options: ['1K', '2K', '4K'] },
      },
      channelGroups: [
        { id: 'standard', label: '标准版', default: true, wireGroup: 'gpt-image-2.5-flare-std', badge: '极速专线 · 快速迭代', pricing: { pointsEstimate: 0.2, discountRate: 1.125, billingMode: 'per_task' } },
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
        resolution: { defaultValue: '1K', options: ['1K', '2K', '4K'] },
      },
      channelGroups: [
        { id: 'standard', label: '标准版', default: true, wireGroup: 'gpt-image-2.5-sunburst-std', badge: '画质专线 · 精细成品', pricing: { pointsEstimate: 0.2, discountRate: 1.125, billingMode: 'per_task' } },
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
      id: ch.id,
      wireGroup: ch.wireGroup,
      constraints: ch.constraints,
      default: ch.default === true,
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

/**
 * Project image option domains from the model and the selected channel, keeping catalog order.
 * @param {{ raw?: { parameters?: Record<string, object> } }} [model]
 * @param {{ constraints?: { parameters?: Record<string, object> } }} [channel]
 * @returns {Record<'aspectRatio' | 'resolution' | 'n', { options: Array<{ value: string, label: string }>, defaultValue: string | undefined }>}
 */
export function imageParameterOptions(model, channel) {
  const parameters = model?.raw?.parameters || {};
  const constraints = channel?.constraints?.parameters || {};
  const fallback = DEFAULT_FALLBACK_CATALOG.image[0].parameters;
  const domains = {};
  for (const field of ['aspectRatio', 'resolution', 'n']) {
    const definition = parameters[field] || fallback[field];
    let source = definition.options;
    if (!Array.isArray(source) && field === 'n') {
      const range = definition.range || definition;
      if (Number.isInteger(range.min) && Number.isInteger(range.max) && range.min <= range.max) {
        source = Array.from({ length: range.max - range.min + 1 }, (_, index) => range.min + index);
      }
    }
    const constraint = constraints[field] || {};
    const options = (Array.isArray(source) ? source : fallback[field].options)
      .map((option) => {
        const value = String(option && typeof option === 'object' ? option.value : option);
        const label = option && typeof option === 'object' ? option.label : undefined;
        return { value, label: label || (value === 'auto' ? '自适应' : value) };
      })
      .filter(({ value }) => (
        (constraint.fixed === undefined || value === String(constraint.fixed))
        && (!Array.isArray(constraint.only) || constraint.only.some((allowed) => value === String(allowed)))
      ));
    const preferred = String(definition.defaultValue ?? definition.default ?? '');
    domains[field] = {
      options,
      defaultValue: options.find(({ value }) => value === preferred)?.value ?? options[0]?.value,
    };
  }
  return domains;
}

/** Prefer the catalog's declared default without changing channel identity or order. */
export function defaultMediaChannel(model) {
  return model?.channels?.find((channel) => channel.default) || model?.channels?.[0];
}

export const DEFAULT_CASCADE_MODELS = [
  ...parseCatalogToCascade(DEFAULT_FALLBACK_CATALOG.video),
  ...parseCatalogToCascade(DEFAULT_FALLBACK_CATALOG.image),
];

