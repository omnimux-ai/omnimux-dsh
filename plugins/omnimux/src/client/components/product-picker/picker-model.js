/**
 * 产品选择器逻辑模型
 * 遵循系统产品形态标准：分类严格限定为实体商品 (physical) 与数字产品 (digital)。
 */

export const PRODUCT_CATEGORIES = Object.freeze([
  { id: 'all', key: 'productPicker.cat.all', defaultLabel: '全部', icon: 'grid' },
  { id: 'physical', key: 'productPicker.cat.physical', defaultLabel: '实体商品', icon: 'box' },
  { id: 'digital', key: 'productPicker.cat.digital', defaultLabel: '数字产品', icon: 'file' },
]);

/**
 * 兼容旧导出
 */
export const BASE_CATEGORIES = PRODUCT_CATEGORIES;

/**
 * 格式化价格
 * @param {string | number | undefined | null} price
 * @returns {string}
 */
export function formatPrice(price) {
  if (price === undefined || price === null || price === '') return '';
  const str = String(price).trim();
  if (str.startsWith('¥') || str.startsWith('$') || str.startsWith('€')) return str;
  return `¥${str}`;
}

/**
 * 计算各核心分类下的商品数量
 * @param {any[]} products
 * @returns {Record<string, number>}
 */
export function computeCategoryCounts(products = []) {
  const counts = { all: 0, physical: 0, digital: 0 };
  if (!Array.isArray(products)) return counts;

  counts.all = products.length;
  for (const p of products) {
    if (p.kind === 'digital') {
      counts.digital += 1;
    } else {
      counts.physical += 1;
    }
  }
  return counts;
}

/**
 * 提取核心可用分类（固定为全部、实体商品、数字产品，杜绝业务标签污染一级分类）
 * @param {any[]} products
 * @returns {{ id: string, label: string, key: string, icon: string, count: number }[]}
 */
export function collectCategories(products = []) {
  const counts = computeCategoryCounts(products);
  return PRODUCT_CATEGORIES.map((c) => ({
    id: c.id,
    label: c.defaultLabel,
    key: c.key,
    icon: c.icon,
    count: counts[c.id] ?? 0,
  }));
}

/**
 * 过滤与搜索商品
 * @param {any[]} products
 * @param {{ category?: string, query?: string }} filter
 * @returns {any[]}
 */
export function filterProducts(products = [], { category = 'all', query = '' } = {}) {
  const cleanQuery = query.trim().toLowerCase();

  return products.filter((p) => {
    // 1. 核心分类匹配 (all / physical / digital)
    if (category && category !== 'all') {
      const isDigital = p.kind === 'digital';
      if (category === 'digital' && !isDigital) return false;
      if (category === 'physical' && isDigital) return false;
    }

    // 2. 关键词匹配 (匹配名称、描述、SKU、品牌、卖点以及商品的自定义标签)
    if (cleanQuery) {
      const name = String(p.name || '').toLowerCase();
      const desc = String(p.description || '').toLowerCase();
      const sku = String(p.sku || '').toLowerCase();
      const brand = String(p.brand || '').toLowerCase();
      const categoriesText = Array.isArray(p.categories) ? p.categories.join(' ').toLowerCase() : '';
      const sellingPoints = Array.isArray(p.selling_points)
        ? p.selling_points.join(' ').toLowerCase()
        : String(p.selling_points || '').toLowerCase();

      const matched =
        name.includes(cleanQuery) ||
        desc.includes(cleanQuery) ||
        sku.includes(cleanQuery) ||
        brand.includes(cleanQuery) ||
        categoriesText.includes(cleanQuery) ||
        sellingPoints.includes(cleanQuery);

      if (!matched) return false;
    }

    return true;
  });
}

/** 默认 zh-CN 完整兜底文案字典 */
export const DEFAULT_STRINGS = Object.freeze({
  'productPicker.title': '从产品库选择',
  'productPicker.cancel': '取消',
  'productPicker.confirm': '确认选择',
  'productPicker.searchPlaceholder': '搜索产品名称、描述、SKU、标签…',
  'productPicker.categories': '产品分类',
  'productPicker.cat.all': '全部',
  'productPicker.cat.physical': '实体商品',
  'productPicker.cat.digital': '数字产品',
  'productPicker.loading': '正在加载产品库…',
  'productPicker.empty': '暂无商品数据。先前往产品库添加，再回到这里选择。',
  'productPicker.emptySearch': '未找到匹配的产品',
  'productPicker.goLibrary': '前往产品库管理',
  'productPicker.selectedMeta': '已选择：',
  'productPicker.unselectedHint': '请选择一件商品',
});

/**
 * 构造安全稳固的 i18n 解析器：
 * 只要传入的 customT 返回值为原始 key 或为空，一律强制回退到内置 DEFAULT_STRINGS 字典，杜绝暴露 raw key。
 * @param {((key: string, vars?: any) => string) | undefined} customT
 */
export function createSafeT(customT) {
  return (key, vars) => {
    if (typeof customT === 'function') {
      try {
        const res = customT(key, vars);
        if (typeof res === 'string' && res.trim() && res !== key) {
          return res;
        }
      } catch {
        // ignore error and fallback
      }
    }
    const template = DEFAULT_STRINGS[key] || key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
  };
}
