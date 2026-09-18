import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, ConfirmModal, IconButton } from 'dsh-ui-kit'
import { CheckIcon } from './icons.jsx'

/**
 * @param {string} productId
 * @param {string} mediaId
 */
function previewUrl(productId, mediaId) {
  return `/omnimux/products/${encodeURIComponent(productId)}?preview=${encodeURIComponent(mediaId)}`
}

/**
 * 产品二级分类胶囊导航组件，复用 UI 共享胶囊规范（参考图 2）。
 * 挂载在第一层 FilterBar 正下方，与本地分类导航共享 24px 左对齐基准线与黄金垂直净空。
 *
 * @param {{
 *   t: (key: string) => string,
 *   kindTab: string,
 *   onKindTabChange: (kind: string) => void,
 * }} props
 */
export function ProductCategoryNav(props) {
  const { t, kindTab = 'all', onKindTabChange } = props
  const chips = [
    { id: 'all', label: t('product.all') || '全部' },
    { id: 'physical', label: t('product.physical') || '实物产品' },
    { id: 'digital', label: t('product.digital') || '数字产品' },
  ]

  return (
    <div className="omnimux-assets-local-nav" role="group" aria-label="产品二级分类">
      <div className="omnimux-assets-local-nav-row">
        {chips.map((chip) => (
          <Button
            key={chip.id}
            variant="ghost"
            size="sm"
            className="omnimux-assets-cloud-chip"
            aria-pressed={kindTab === chip.id ? 'true' : 'false'}
            onClick={() => onKindTabChange?.(chip.id)}
          >
            {chip.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

/**
 * 产品库 1:1 对齐原页面的嵌入视图组件。
 * 遵循原产品库全宽居中虚线大空状态与商品微卡标准。
 *
 * @param {{
 *   t: (key: string) => string,
 *   open?: boolean,
 *   query?: string,
 *   kindTab?: string,
 *   onOpenCreate?: (kind: 'physical' | 'digital') => void,
 * }} props
 */
export function ProductsView(props) {
  const { t, open = true, query = '', kindTab = 'all', onOpenCreate } = props
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [pendingRemove, setPendingRemove] = useState(null)
  const [busy, setBusy] = useState(false)

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/omnimux/products/state')
      if (res.ok) {
        const json = await res.json()
        if (Array.isArray(json?.products)) {
          setProducts(json.products)
        }
      }
    } catch {
      // ignore network errors
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      void fetchProducts()
    }
  }, [open, fetchProducts])

  const visibleProducts = useMemo(() => {
    let list = products
    if (kindTab === 'physical') {
      list = list.filter((p) => p.kind !== 'digital')
    } else if (kindTab === 'digital') {
      list = list.filter((p) => p.kind === 'digital')
    }
    if (query && query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((p) => {
        const name = String(p.name || '').toLowerCase()
        const brand = String(p.brand || '').toLowerCase()
        const selling = Array.isArray(p.selling_points) ? p.selling_points.join(' ').toLowerCase() : ''
        return name.includes(q) || brand.includes(q) || selling.includes(q)
      })
    }
    return list
  }, [products, kindTab, query])

  const toggleSelect = useCallback((id, e) => {
    e?.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleOpenBatchDelete = useCallback(() => {
    const selectedProducts = products.filter((p) => selectedIds.has(p.id))
    setPendingRemove({
      ids: [...selectedIds],
      names: selectedProducts.map((p) => p.name),
    })
  }, [products, selectedIds])

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingRemove) return
    try {
      setBusy(true)
      await Promise.all(
        pendingRemove.ids.map((id) =>
          fetch(`/omnimux/products/${encodeURIComponent(id)}`, { method: 'DELETE' })
        )
      )
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of pendingRemove.ids) next.delete(id)
        return next
      })
      setPendingRemove(null)
      await fetchProducts()
    } catch {
      // ignore network errors
    } finally {
      setBusy(false)
    }
  }, [pendingRemove, fetchProducts])

  const handleCreate = (kind, productId) => {
    onOpenCreate?.(kind, productId)
  }

  return (
    <div className="omnimux-products-list-view">
      {selectedIds.size > 0 ? (
        <div className="omnimux-assets-selection">
          <span>{(t('select.count') || '已选 {n} 项').replace('{n}', String(selectedIds.size))}</span>
          <div className="omnimux-assets-selection-actions">
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              {t('select.clear') || '取消选择'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={handleOpenBatchDelete}
            >
              {(t('select.delete') || '移除 {n} 项').replace('{n}', String(selectedIds.size))}
            </Button>
          </div>
        </div>
      ) : null}

      {/* 1:1 对齐原产品库主体内容与居中虚线大空状态 */}
      <div className="omnimux-products-body">
        {visibleProducts.length === 0 ? (
          <div className="omnimux-products-empty">
            <p>
              {query.trim()
                ? '没有找到匹配的产品。'
                : '暂无产品数据。点击上方「添加产品」录入首件标品。'}
            </p>
          </div>
        ) : (
          <div className="omnimux-products-grid">
            {visibleProducts.map((product) => {
              const glyph = (product.name || '?').trim().slice(0, 1)
              const cover = product.cover
              const preview = cover?.kind === 'image' && cover.id
                ? previewUrl(product.id, cover.id)
                : ''
              const isDigital = product.kind === 'digital'
              const selected = selectedIds.has(product.id)

              return (
                <article
                  key={product.id}
                  className="omnimux-products-card omnimux-assets-focusable"
                  tabIndex={0}
                  onClick={() => handleCreate(isDigital ? 'digital' : 'physical', product.id)}
                >
                  <div className="omnimux-products-card-thumb">
                    <IconButton
                      variant="ghost"
                      size="xs"
                      className="omnimux-assets-check"
                      data-selected={selected ? 'true' : 'false'}
                      aria-label={t('select.toggle') || '选择产品'}
                      aria-pressed={selected ? 'true' : 'false'}
                      onClick={(e) => toggleSelect(product.id, e)}
                    >
                      {selected ? <CheckIcon size={12} /> : <span />}
                    </IconButton>
                    {preview ? (
                      <img
                        src={preview}
                        alt={product.name}
                        className="omnimux-products-card-media"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    ) : null}
                    <span className="omnimux-products-glyph">{glyph}</span>
                  </div>

                  <div className="omnimux-products-card-body">
                    <h3 className="omnimux-products-card-name" title={product.name}>
                      {product.name}
                    </h3>
                    <p className="omnimux-products-card-sub">
                      <span>{product.brand || (Array.isArray(product.selling_points) ? product.selling_points[0] : '') || '通用'}</span>
                    </p>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {pendingRemove ? (
        <ConfirmModal
          open
          onClose={() => setPendingRemove(null)}
          title={
            pendingRemove.ids.length > 1
              ? (t('select.removeTitle') || '确认从产品库移除这 {n} 项？').replace('{n}', String(pendingRemove.ids.length))
              : (t('product.removeTitle') || '确认从产品库移除「{name}」？').replace('{name}', String(pendingRemove.names[0] ?? ''))
          }
          message={t('product.removeHint') || '仅从产品库移除引用，本地磁盘源文件不受影响。'}
          confirmLabel={t('remove.confirm') || t('mapping.removeConfirm') || '确认移除'}
          cancelLabel={t('remove.cancel') || t('mapping.cancel') || '取消'}
          confirmVariant="danger"
          confirmLoading={busy}
          onConfirm={handleConfirmDelete}
        />
      ) : null}
    </div>
  )
}
