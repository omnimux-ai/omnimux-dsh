/**
 * 产品槽位辅助逻辑：最近选择记录与快速排序
 */

export const RECENT_PRODUCT_KEY = 'omx_recent_product_ids';

export function getRecentProductIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_PRODUCT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecentProductId(id: string) {
  if (!id || typeof window === 'undefined') return;
  try {
    const prev = getRecentProductIds().filter((x) => x !== id);
    const next = [id, ...prev].slice(0, 10);
    localStorage.setItem(RECENT_PRODUCT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function sortProductsForQuickMenu(products: any[], recentIds: string[], limit = 5): any[] {
  if (!Array.isArray(products) || products.length === 0) return [];
  const recentSet = new Set(recentIds);
  const recentProducts: any[] = [];
  const otherProducts: any[] = [];

  for (const id of recentIds) {
    const found = products.find((p) => p && p.id === id);
    if (found) {
      recentProducts.push(found);
    }
  }

  for (const p of products) {
    if (p && !recentSet.has(p.id)) {
      otherProducts.push(p);
    }
  }

  otherProducts.sort((a, b) => {
    const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });

  return [...recentProducts, ...otherProducts].slice(0, limit);
}

export function resolveProductThumbUrl(product: any): string {
  if (!product) return '';
  const cover = product.cover;
  const coverId = cover?.id || product.cover_media_id;
  if (coverId) {
    return `/omnimux/products/${encodeURIComponent(product.id)}?preview=${encodeURIComponent(coverId)}`;
  }
  if (cover?.real_path) {
    return `file://${cover.real_path}`;
  }
  return '';
}

