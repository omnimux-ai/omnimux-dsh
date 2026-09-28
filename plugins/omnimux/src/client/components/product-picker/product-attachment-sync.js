import { getGlobalAttachmentStore } from '../../attachments/store.ts';

/**
 * 商品缩略图地址统一解析函数（单一事实源 SSOT）
 * 支持入参为商品实体、归一化卡片、原始数据或字符串 URL。
 * 严格保证返回值必为合法字符串，绝不返回 Object，绝不产生 [object Object]。
 */
export function resolveProductPreview(product) {
  if (!product) return '';
  if (typeof product === 'string') {
    const trimmed = product.trim();
    return trimmed && !trimmed.includes('[object Object]') ? trimmed : '';
  }
  if (typeof product !== 'object') return '';

  const raw = product.raw || product;
  const productId = String(raw.id || product.id || raw.productId || product.productId || raw.entityId || product.entityId || '').trim();
  const cover = raw.cover || product.cover;
  const coverId = (cover && typeof cover === 'object' ? cover.id : null) || raw.cover_media_id || product.cover_media_id;

  // 1. 优先走产品库原生路由预览通道 /omnimux/products/:id?preview=:coverId
  if (coverId && productId) {
    return `/omnimux/products/${encodeURIComponent(productId)}?preview=${encodeURIComponent(coverId)}`;
  }

  // 2. 本地真实物理路径
  if (cover && typeof cover === 'object' && typeof cover.real_path === 'string' && cover.real_path.trim()) {
    return `file://${cover.real_path.trim()}`;
  }

  // 3. cover 本身为合法字符串
  if (typeof cover === 'string' && cover.trim() && !cover.includes('[object Object]')) {
    return cover.trim();
  }

  // 4. 直链候选字段探测（严格校验类型为 string）
  const candidates = [
    raw.previewUrl,
    product.previewUrl,
    raw.preview,
    product.preview,
    raw.thumbnailUrl,
    product.thumbnailUrl,
    raw.coverUrl,
    product.coverUrl,
    raw.cover_url,
    product.cover_url,
    raw.mainImage,
    product.mainImage,
    raw.image,
    product.image,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() && !candidate.includes('[object Object]')) {
      return candidate.trim();
    }
  }

  // 5. 检查 images 或 media 列表
  const images = Array.isArray(raw.images) ? raw.images : (Array.isArray(product.images) ? product.images : null);
  if (images && images.length > 0) {
    const first = images[0];
    if (typeof first === 'string' && first.trim() && !first.includes('[object Object]')) {
      return first.trim();
    }
    if (first && typeof first === 'object' && first.id && productId) {
      return `/omnimux/products/${encodeURIComponent(productId)}?preview=${encodeURIComponent(first.id)}`;
    }
  }

  const mediaList = Array.isArray(raw.media) ? raw.media : (Array.isArray(product.media) ? product.media : null);
  if (mediaList && mediaList.length > 0) {
    const firstMedia = mediaList.find((m) => m?.kind === 'image') || mediaList[0];
    if (firstMedia?.id && productId) {
      return `/omnimux/products/${encodeURIComponent(productId)}?preview=${encodeURIComponent(firstMedia.id)}`;
    }
    if (typeof firstMedia?.real_path === 'string' && firstMedia.real_path.trim()) {
      return `file://${firstMedia.real_path.trim()}`;
    }
  }

  return '';
}

/**
 * 将选中的商品同步登记至会话附件中心（以便发送时附加缩略图并作为全量结构化上下文注入）
 */
export function syncProductAttachment(product, oldProduct = null, targetSessionId = null) {
  try {
    const store = getGlobalAttachmentStore();
    const sessionId = targetSessionId || store.getActiveSessionId() || 'default';
    if (oldProduct && oldProduct.id) {
      const list = store.getSnapshot(sessionId);
      const prev = list.find((item) => item.kind === 'product' && String(item.entityId) === String(oldProduct.id));
      if (prev) {
        store.removeAttachment(sessionId, prev.id);
      }
    }
    if (product && product.id) {
      const previewUrl = resolveProductPreview(product);
      const relativePath = `products/${product.id}.json`;
      store.addAttachment(sessionId, {
        sourcePlugin: 'omnimux-products',
        kind: 'product',
        entityId: String(product.id),
        title: String(product.name || product.title || '产品'),
        extension: 'JSON',
        relativePath,
        previewUrl,
        metadata: {
          product: {
            id: product.id,
            name: product.name,
            price: product.price,
            sku: product.sku,
            brand: product.brand,
            description: product.description,
            selling_points: product.selling_points,
            features: product.features,
            target_audience: product.target_audience,
          },
        },
      });
    }
    return sessionId;
  } catch (err) {
    console.warn('[product-attachment-sync] syncProductAttachment failed:', err);
    return null;
  }
}

/**
 * 从会话附件中心移除指定商品
 */
export function removeProductAttachment(productId, targetSessionId = null) {
  try {
    if (!productId) return;
    const store = getGlobalAttachmentStore();
    const sessionId = targetSessionId || store.getActiveSessionId() || 'default';
    const list = store.getSnapshot(sessionId);
    const found = list.find((item) => item.kind === 'product' && String(item.entityId) === String(productId));
    if (found) {
      store.removeAttachment(sessionId, found.id);
    }
  } catch (err) {
    console.warn('[product-attachment-sync] removeProductAttachment failed:', err);
  }
}
