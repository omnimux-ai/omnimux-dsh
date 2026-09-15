import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, EmptyState } from 'dsh-ui-kit'
import { ChatIcon, CheckIcon, PlusIcon } from './icons.jsx'

/**
 * @param {string} productId
 * @param {string} mediaId
 */
function previewUrl(productId, mediaId) {
  return `/omnimux/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(mediaId)}`
}

/**
 * @param {{
 *   t: (key: string) => string,
 *   query?: string,
 *   open?: boolean,
 *   onOpenCreate?: (kind: 'physical' | 'digital') => void,
 * }} props
 */
export function ProductsView(props) {
  const { t, query = '', open = true, onOpenCreate } = props
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [kindFilter, setKindFilter] = useState('all')
  const [copiedId, setCopiedId] = useState(null)

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

  const counts = useMemo(() => {
    let physical = 0
    let digital = 0
    for (const p of products) {
      if (p.kind === 'digital') digital++
      else physical++
    }
    return {
      all: products.length,
      physical,
      digital,
    }
  }, [products])

  const chips = useMemo(() => [
    { key: 'all', label: t('product.all') || '全部', total: counts.all },
    { key: 'physical', label: t('product.physical') || '实物产品', total: counts.physical },
    { key: 'digital', label: t('product.digital') || '数字产品', total: counts.digital },
  ], [t, counts])

  const visibleProducts = useMemo(() => {
    let list = products
    if (kindFilter === 'physical') {
      list = list.filter((p) => p.kind !== 'digital')
    } else if (kindFilter === 'digital') {
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
  }, [products, kindFilter, query])

  const handleCopyCite = (product, e) => {
    e.stopPropagation()
    const cite = product.cite || `@产品/${product.name}`
    try {
      void navigator.clipboard?.writeText?.(cite)
      setCopiedId(product.id)
      setTimeout(() => setCopiedId(null), 1800)
    } catch {
      // clipboard fallback
    }
  }

  return (
    <div className="omnimux-assets-products-view">
      {/* 二级分类 Chips */}
      <div className="omnimux-assets-local-nav">
        <div className="omnimux-assets-local-nav-row" role="group" aria-label="产品库分类">
          {chips.map((c) => (
            <Button
              key={c.key}
              variant="ghost"
              size="sm"
              className="omnimux-assets-cloud-chip"
              aria-pressed={c.key === kindFilter ? 'true' : 'false'}
              onClick={() => setKindFilter(c.key)}
            >
              {c.label}
              <span className="omnimux-assets-cloud-count">{c.total}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* 内容网格 */}
      <div className="omnimux-assets-products-grid">
        {visibleProducts.length === 0 ? (
          <div className="omnimux-assets-empty-wrap">
            <EmptyState
              title={t('product.empty') || '暂无商品数据'}
              description="沉淀要卖的货：卖点、人群与主图，供 Agent 在创作中精准调用"
              action={
                onOpenCreate ? (
                  <Button variant="primary" leadingIcon={<PlusIcon />} onClick={() => onOpenCreate('physical')}>
                    {t('product.create') || '新建产品'}
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          visibleProducts.map((product) => {
            const glyph = (product.name || '?').trim().slice(0, 1)
            const cover = product.cover
            const preview = cover?.kind === 'image' && cover.id
              ? previewUrl(product.id, cover.id)
              : ''
            const isDigital = product.kind === 'digital'
            const cite = product.cite || `@产品/${product.name}`
            const copied = copiedId === product.id

            return (
              <article
                key={product.id}
                className="omnimux-assets-product-card"
                tabIndex={0}
              >
                <div className="omnimux-assets-product-thumb">
                  {preview ? (
                    <img
                      src={preview}
                      alt={product.name}
                      className="omnimux-assets-product-img"
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  ) : null}
                  <span className="omnimux-assets-product-glyph">{glyph}</span>
                  <span className="omnimux-assets-product-badge">
                    {isDigital ? (t('product.digital') || '数字产品') : (t('product.physical') || '实物产品')}
                  </span>
                </div>

                <div className="omnimux-assets-product-info">
                  <h3 className="omnimux-assets-product-name" title={product.name}>
                    {product.name}
                  </h3>
                  <p className="omnimux-assets-product-meta">
                    {product.brand ? <span className="omnimux-assets-product-brand">{product.brand}</span> : null}
                    {product.price ? <span className="omnimux-assets-product-price">¥{product.price}</span> : null}
                    {!product.brand && !product.price ? (
                      <span className="omnimux-assets-product-desc">
                        {Array.isArray(product.selling_points) && product.selling_points.length > 0
                          ? product.selling_points[0]
                          : (product.description || '无详细描述')}
                      </span>
                    ) : null}
                  </p>

                  <div className="omnimux-assets-product-actions">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="omnimux-assets-cite-btn"
                      onClick={(e) => handleCopyCite(product, e)}
                    >
                      {copied ? <CheckIcon size={12} /> : null}
                      <span>{copied ? (t('product.copied') || '已复制') : (t('product.copyCite') || '复制引用')}</span>
                    </Button>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}
