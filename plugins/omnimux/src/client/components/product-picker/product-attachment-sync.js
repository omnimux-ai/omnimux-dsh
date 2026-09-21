import { getGlobalAttachmentStore } from '../../attachments/store.ts';

export function resolveProductPreview(product) {
  if (!product) return '';
  const cover = product.cover;
  const coverId = cover?.id || product.cover_media_id;
  if (coverId && product.id) {
    return `/omnimux/products/${encodeURIComponent(product.id)}?preview=${encodeURIComponent(coverId)}`;
  }
  if (cover?.real_path) return `file://${cover.real_path}`;
  if (product.cover_url) return product.cover_url;
  if (product.image) return product.image;
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
