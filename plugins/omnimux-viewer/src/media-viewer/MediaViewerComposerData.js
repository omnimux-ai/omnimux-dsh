/**
 * MediaViewerComposerData
 * 真实中枢模型目录投影与品牌映射（对齐中枢 serving/channel-groups.js 与 catalog/list.js）
 */

export const BRAND_NAME_MAP = {
  openai: 'OpenAI',
  bytedance: 'Seedance',
  seedance: 'Seedance',
  seedream: 'Seedream',
  minimax: 'MiniMax',
  kling: 'Kling',
  google: 'Google',
  midjourney: 'Midjourney',
  bfl: 'Black Forest Labs',
  anthropic: 'Claude',
  muse: 'Muse',
  wan: 'Wan',
};

/** Client-side image task counts. This is not a gateway `n` parameter. */
export const IMAGE_BATCH_COUNTS = Object.freeze([1, 2, 4]);

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
    const brandName = item.familyLabel || BRAND_NAME_MAP[fam] || item.family || '通用';

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
      enabled: ch.enabled !== false,
      default: ch.default === true,
      name: ch.label || ch.id,
      price: ch.pricing?.pointsEstimate ? `≈${ch.pricing.pointsEstimate} 积分` : '按量计费',
      points: (() => {
        const raw = ch.pricing?.pointsEstimate;
        if (raw === null || raw === undefined || raw === '') return null;
        const numeric = Number(raw);
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
      })(),
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

    const resolvedId = item.id;
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
  const domains = {};
  for (const field of ['aspectRatio', 'resolution']) {
    const definition = parameters[field];
    if (!definition || !Array.isArray(definition.options) || definition.options.length === 0) {
      domains[field] = { options: [], defaultValue: undefined };
      continue;
    }
    const constraint = constraints[field] || {};
    const options = definition.options
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
  // Batch is a client task-count policy, never a gateway parameter.
  domains.n = {
    options: IMAGE_BATCH_COUNTS.map((value) => ({ value: String(value), label: String(value) })),
    defaultValue: '1',
  };
  return domains;
}

/** Prefer the catalog's declared default without changing channel identity or order. */
export function defaultMediaChannel(model) {
  const channels = (model?.channels || []).filter((channel) => channel.enabled !== false);
  return channels.find((channel) => channel.default) || channels[0];
}

