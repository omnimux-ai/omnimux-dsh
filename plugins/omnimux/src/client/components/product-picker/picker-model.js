/**
 * 产品选择器逻辑模型
 */

export const BASE_CATEGORIES = Object.freeze([
  { id: 'all', key: 'productPicker.cat.all', defaultLabel: '全部' },
  { id: 'physical', key: 'productPicker.cat.physical', defaultLabel: '实体商品' },
  { id: 'digital', key: 'productPicker.cat.digital', defaultLabel: '数字产品' },
]);

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
 * 提取所有可用分类（包含基础分类和自定义标签分类）
 * @param {any[]} products
 * @returns {{ id: string, label: string }[]}
 */
export function collectCategories(products = []) {
  const customCats = new Set();
  for (const p of products) {
    if (Array.isArray(p.categories)) {
      for (const cat of p.categories) {
        if (typeof cat === 'string' && cat.trim()) {
          customCats.add(cat.trim());
        }
      }
    }
  }

  const result = BASE_CATEGORIES.map((c) => ({ id: c.id, label: c.defaultLabel, key: c.key }));
  for (const cat of customCats) {
    result.push({ id: cat, label: cat });
  }
  return result;
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
    // 1. 分类匹配
    if (category && category !== 'all') {
      const matchKind = p.kind === category;
      const matchCustom = Array.isArray(p.categories) && p.categories.includes(category);
      if (!matchKind && !matchCustom) {
        return false;
      }
    }

    // 2. 关键词匹配
    if (cleanQuery) {
      const name = String(p.name || '').toLowerCase();
      const desc = String(p.description || '').toLowerCase();
      const sku = String(p.sku || '').toLowerCase();
      const brand = String(p.brand || '').toLowerCase();
      const sellingPoints = Array.isArray(p.selling_points)
        ? p.selling_points.join(' ').toLowerCase()
        : String(p.selling_points || '').toLowerCase();

      const matched =
        name.includes(cleanQuery) ||
        desc.includes(cleanQuery) ||
        sku.includes(cleanQuery) ||
        brand.includes(cleanQuery) ||
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
  'productPicker.searchPlaceholder': '搜索产品名称、描述、SKU…',
  'productPicker.categories': '产品分类',
  'productPicker.cat.all': '全部',
  'productPicker.cat.physical': '实体商品',
  'productPicker.cat.digital': '数字产品',
  'productPicker.loading': '正在加载产品库…',
  'productPicker.empty': '产品库还是空的。先去添加商品，再回到这里选择。',
  'productPicker.emptySearch': '未找到匹配的产品',
  'productPicker.goLibrary': '前往产品库',
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
