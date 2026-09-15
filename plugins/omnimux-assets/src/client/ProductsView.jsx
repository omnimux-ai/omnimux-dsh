import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, FilterBar, SearchField, Tabs } from 'dsh-ui-kit'
import { CheckIcon } from './icons.jsx'
import { CreateProductMenu } from './CreateProductMenu.jsx'

/**
 * @param {string} productId
 * @param {string} mediaId
 */
function previewUrl(productId, mediaId) {
  return `/omnimux/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(mediaId)}`
}

/**
 * 产品库 1:1 对齐原页面的嵌入视图组件。
 * 遵循原产品库 FilterBar (Tabs + stretch SearchField) 与全宽虚线居中空状态标准。
 *
 * @param {{
 *   t: (key: string) => string,
 *   open?: boolean,
 *   onOpenCreate?: (kind: 'physical' | 'digital') => void,
 * }} props
 */
export function ProductsView(props) {
  const { t, open = true, onOpenCreate } = props
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [kindTab, setKindTab] = useState('all')
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

  const handleCreate = (kind) => {
    onOpenCreate?.(kind)
  }

  return (
    <div className="omnimux-products-list-view">
      {/* 1:1 对齐原产品库 FilterBar：左侧下划线Tabs，右侧拉伸搜索框 */}
      <FilterBar
        className="omnimux-products-stage-toolbar"
        filters={
          <Tabs
            variant="underline"
            items={[
              { id: 'all', label: t('product.all') || '全部' },
              { id: 'physical', label: t('product.physical') || '实物产品' },
              { id: 'digital', label: t('product.digital') || '数字产品' },
            ]}
            activeId={kindTab}
            onChange={setKindTab}
          />
        }
        search={
          <SearchField
            value={query}
            placeholder={t('product.searchPlaceholder') || '搜索产品名称、卖点、品牌'}
            aria-label={t('product.searchPlaceholder') || '搜索产品名称、卖点、品牌'}
            debounceMs={0}
            stretch
            onValueChange={setQuery}
          />
        }
      />

      {/* 1:1 对齐原产品库主体内容与居中虚线大空状态 */}
      <div className="omnimux-products-body">
        {visibleProducts.length === 0 ? (
          <div className="omnimux-products-empty">
            <p>
              {query.trim()
                ? '没有找到匹配的产品。'
                : '暂无产品数据。点击「添加产品」录入首件标品。'}
            </p>
            {query.trim() === '' ? (
              <CreateProductMenu t={t} onSelect={handleCreate} />
            ) : null}
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
              const copied = copiedId === product.id

              return (
                <article
                  key={product.id}
                  className="omnimux-products-card"
                  tabIndex={0}
                  onClick={() => handleCreate(isDigital ? 'digital' : 'physical')}
                >
                  <div className="omnimux-products-card-thumb">
                    {preview ? (
                      <img
                        src={preview}
                        alt={product.name}
                        className="omnimux-products-card-media"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    ) : null}
                    <span className="omnimux-products-glyph">{glyph}</span>
                    <span className="omnimux-products-badge">
                      {isDigital ? (t('product.digital') || '数字产品') : (t('product.physical') || '实物产品')}
                    </span>
                  </div>

                  <div className="omnimux-products-card-body">
                    <h3 className="omnimux-products-card-name" title={product.name}>
                      {product.name}
                    </h3>
                    <p className="omnimux-products-card-sub">
                      <span>{product.brand || (Array.isArray(product.selling_points) ? product.selling_points[0] : '') || '通用'}</span>
                      {product.price ? <span className="omnimux-products-card-price">¥{product.price}</span> : null}
                    </p>

                    <div className="omnimux-products-card-actions">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={(e) => handleCopyCite(product, e)}
                      >
                        {copied ? <CheckIcon size={12} /> : null}
                        <span>{copied ? (t('product.copied') || '已复制') : (t('product.copyCite') || '复制引用')}</span>
                      </Button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
