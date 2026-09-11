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
