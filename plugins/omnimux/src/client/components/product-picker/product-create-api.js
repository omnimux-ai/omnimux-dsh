/**
 * 产品选择器「链接创建」公开 HTTP 协作层。
 * 只走 /omnimux/products 公开路径，不导入 products 插件私有模块。
 */

/**
 * 廉价前端校验；服务端仍会再验一次。
 * @param {unknown} value
 * @returns {boolean}
 */
export function isHttpUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 规范化粘贴链接（缺协议时补 https）。
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeHttpUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;
  return `https://${text}`;
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, body: any }>}
 */
export async function productsRequest(path, opts = {}) {
  const response = await fetch(path, {
    method: opts.method ?? 'GET',
    headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let json = {};
  try {
    json = await response.json();
  } catch {
    json = { error: `HTTP ${String(response.status)}`, message: `HTTP ${String(response.status)}` };
  }
  return { ok: response.ok, status: response.status, body: json };
}

/**
 * 读取落地页为产品草稿，不写库。
 * @param {string} url
 * @param {'physical' | 'digital'} [kind]
 */
export function importProductFromLink(url, kind) {
  const body =
    kind === 'digital' || kind === 'physical'
      ? { url, kind }
      : { url };
  return productsRequest('/omnimux/products/import-from-link', { method: 'POST', body });
}

/**
 * 持久化产品。
 * @param {Record<string, unknown>} body
 */
export function createProductRecord(body) {
  return productsRequest('/omnimux/products', { method: 'POST', body });
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function textOf(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

/**
 * 草稿 → 保存载荷。解析成功不等于可保存：名称仍须可用。
 * @param {Record<string, unknown> | null | undefined} draft
 * @param {{
 *   fallbackUrl?: string,
 *   preferredKind?: 'physical' | 'digital' | 'all' | string,
 * }} [opts]
 * @returns {{ ok: true, body: Record<string, unknown> } | { ok: false, reason: 'empty-name' | 'empty-draft' }}
 */
export function buildCreatePayloadFromDraft(draft, opts = {}) {
  if (!draft || typeof draft !== 'object') {
    return { ok: false, reason: 'empty-draft' };
  }

  const preferred =
    opts.preferredKind === 'digital' || opts.preferredKind === 'physical'
      ? opts.preferredKind
      : null;
  const kind =
    draft.kind === 'digital' || preferred === 'digital'
      ? 'digital'
      : 'physical';

  const name = textOf(draft.name);
  if (!name) return { ok: false, reason: 'empty-name' };

  const link = textOf(draft.link) || textOf(opts.fallbackUrl);
  const categories = Array.isArray(draft.categories)
    ? draft.categories
      .filter((row) => typeof row === 'string')
      .map((row) => row.trim())
      .filter((row) => row !== '')
    : [];

  const media = Array.isArray(draft.media)
    ? draft.media
      .filter((row) => row && typeof row === 'object' && typeof row.real_path === 'string' && row.real_path.trim())
      .map((row) => ({
        id: typeof row.id === 'string' && row.id ? row.id : undefined,
        real_path: String(row.real_path).trim(),
        original_name:
          typeof row.original_name === 'string' && row.original_name
            ? row.original_name
            : String(row.real_path).split('/').pop() || String(row.real_path),
      }))
    : [];

  /** @type {Record<string, unknown>} */
  const body = {
    name,
    kind,
    link,
    categories,
    media,
    cover_media_id:
      typeof draft.cover_media_id === 'string' && draft.cover_media_id
        ? draft.cover_media_id
        : null,
    selling_points: textOf(draft.selling_points),
    target_audience: textOf(draft.target_audience),
    brand: textOf(draft.brand),
    features: textOf(draft.features),
    description: textOf(draft.description),
  };

  if (kind === 'physical') {
    body.price = textOf(draft.price);
    body.sku = textOf(draft.sku);
    body.promotion = textOf(draft.promotion);
  } else if (draft.brand_strategy && typeof draft.brand_strategy === 'object') {
    body.brand_strategy = draft.brand_strategy;
  }

  return { ok: true, body };
}

/**
 * 从错误响应提取可读文案。
 * @param {{ body?: any, status?: number } | null | undefined} result
 * @param {string} fallback
 */
export function messageFromProductsResult(result, fallback = '操作失败，请稍后重试') {
  const body = result?.body;
  if (body && typeof body === 'object') {
    const msg = body.message || body.error;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  if (result?.status) return `HTTP ${result.status}`;
  return fallback;
}

/**
 * 解析 + 保存一条龙。仅在保存成功后返回 product。
 * @param {{
 *   url: string,
 *   preferredKind?: string,
 *   importFromLink?: typeof importProductFromLink,
 *   createProduct?: typeof createProductRecord,
 *   signalToken?: { current: number },
 *   requestId?: number,
 * }} args
 * @returns {Promise<
 *   | { ok: true, product: any, draft: any }
 *   | { ok: false, stage: 'validate' | 'import' | 'empty' | 'payload' | 'save' | 'stale', message: string, draft?: any }
 * >}
 */
export async function createProductFromLink(args) {
  const url = normalizeHttpUrl(args.url);
  if (!isHttpUrl(url)) {
    return { ok: false, stage: 'validate', message: '请输入合法的网页链接' };
  }

  const importFn = args.importFromLink || importProductFromLink;
  const createFn = args.createProduct || createProductRecord;
  const preferredKind =
    args.preferredKind === 'digital' || args.preferredKind === 'physical'
      ? args.preferredKind
      : undefined;

  const importResult = await importFn(url, preferredKind);
  if (args.signalToken && args.requestId != null && args.signalToken.current !== args.requestId) {
    return { ok: false, stage: 'stale', message: '' };
  }
  if (!importResult.ok) {
    const code = importResult.body?.error;
    if (code === 'link-import-empty') {
      return {
        ok: false,
        stage: 'empty',
        message: '未能提取到有效商品信息，请检查链接后重试',
      };
    }
    return {
      ok: false,
      stage: 'import',
      message: messageFromProductsResult(importResult, '解析失败，请检查链接后重试'),
    };
  }

  const draft = importResult.body?.data;
  if (!draft || typeof draft !== 'object') {
    return {
      ok: false,
      stage: 'empty',
      message: '未能提取到有效商品信息，请检查链接后重试',
    };
  }

  const payload = buildCreatePayloadFromDraft(draft, {
    fallbackUrl: url,
    preferredKind,
  });
  if (!payload.ok) {
    return {
      ok: false,
      stage: 'payload',
      message:
        payload.reason === 'empty-name'
          ? '解析结果缺少商品名称，请换一个链接重试'
          : '未能提取到有效商品信息，请检查链接后重试',
      draft,
    };
  }

  const saveResult = await createFn(payload.body);
  if (args.signalToken && args.requestId != null && args.signalToken.current !== args.requestId) {
    return { ok: false, stage: 'stale', message: '', draft };
  }
  if (!saveResult.ok) {
    return {
      ok: false,
      stage: 'save',
      message: messageFromProductsResult(saveResult, '保存失败，请稍后重试'),
      draft,
    };
  }

  const product = saveResult.body?.product;
  if (!product || typeof product !== 'object') {
    return {
      ok: false,
      stage: 'save',
      message: '保存失败：未返回产品记录',
      draft,
    };
  }

  return { ok: true, product, draft };
}
