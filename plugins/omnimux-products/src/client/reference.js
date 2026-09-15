import { previewUrl } from './api.js'

/**
 * 将商品持久化记录转换为统一引用模型 (UnifiedReference)
 * @param {any} product
 * @returns {import('../../omnimux/src/client/reference/types.ts').UnifiedReference | null}
 */
export function buildProductReference(product) {
  if (!product || !product.id) return null
  const cover = product.cover
  const pUrl = cover?.kind === 'image' && cover.id ? previewUrl(product.id, cover.id) : ''
  const relPath = cover?.real_path || `.omnimux/products/${product.id}.json`
  const ext = cover?.ext ? cover.ext.replace(/^\./, '').toUpperCase() : 'JSON'

  return {
    id: String(product.id),
    source: 'product',
    title: product.name || '商品',
    kind: 'product',
    file: {
      relativePath: relPath,
      previewUrl: pUrl,
      extension: ext,
    },
    context: {
      scene: 'ecommerce_marketing',
      summary: product.selling_points || product.description || product.name,
      metadata: {
        product_id: product.id,
        name: product.name,
        kind: product.kind || 'physical',
        brand: product.brand || '',
        sku: product.sku || '',
        selling_points: product.selling_points || '',
        link: product.link || '',
        categories: Array.isArray(product.categories) ? product.categories : [],
      },
    },
  }
}

/**
 * 投递商品引用到当前会话
 * @param {any} product
 * @param {object} [opts]
 */
export async function deliverProductReference(product, opts = {}) {
  const ref = buildProductReference(product)
  if (!ref) return { ok: false, reason: 'invalid-product' }

  const refApi = typeof window !== 'undefined' ? window.__omnimuxReference : undefined
  if (refApi && typeof refApi.deliver === 'function') {
    return refApi.deliver(ref, opts)
  }

  // 降级回退
  if (typeof window !== 'undefined') {
    const wb = window.__omnimuxWorkbench
    if (wb) {
      try { wb.setConversationCollapsed?.(false) } catch {}
      try { wb.setFocus?.('split') } catch {}
    }

    const payload = {
      sourcePlugin: 'omnimux-products',
      kind: 'product',
      entityId: ref.id,
      title: ref.title,
      relativePath: ref.file.relativePath,
      previewUrl: ref.file.previewUrl,
      extension: ref.file.extension,
      metadata: ref.context?.metadata,
    }

    const store = window.__omnimuxAttachments
    let ok = true
    if (store && typeof store.addAttachment === 'function') {
      const res = store.addAttachment('', payload)
      ok = Boolean(res?.ok || res?.reason === 'duplicate')
    } else {
      window.dispatchEvent?.(new CustomEvent('omnimux:add-to-conversation', { detail: payload }))
    }

    try {
      window.dispatchEvent?.(new CustomEvent('omnimux:attachments:reveal'))
    } catch {}

    return { ok, referenceId: ref.id }
  }

  return { ok: false, reason: 'no-window' }
}
