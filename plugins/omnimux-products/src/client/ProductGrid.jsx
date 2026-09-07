import { Button, IconButton } from 'dsh-ui-kit'
import { activateRowKeydown } from './a11y.js'
import { previewUrl } from './api.js'
import { CheckIcon } from './icons.jsx'

/**
 * @param {{
 *   t?: (key: string) => string,
 *   products: any[],
 *   emptyLabel?: string,
 *   emptyActionLabel?: string,
 *   showEmptyAction?: boolean,
 *   onEmptyAction?: () => void,
 *   onOpen?: (product: any) => void,
 *   onCopy: (product: any) => void,
 *   onRemove: (product: any) => void,
 *   copiedId?: string,
 *   selectedIds?: Set<string>,
 *   onToggleSelect?: (product: any) => void,
 * }} props
 */
export function ProductGrid({ t, products, emptyLabel, emptyActionLabel, showEmptyAction = true, onEmptyAction, onOpen, onCopy, onRemove, copiedId, selectedIds, onToggleSelect }) {
  const safeEmptyLabel = emptyLabel || (typeof t === 'function' ? t('empty.all') : '')
  const safeEmptyActionLabel = emptyActionLabel ?? (typeof t === 'function' ? t('add.button') : '')
  if (products.length === 0) {
    return (
      <div className="omnimux-products-empty">
        <p>{safeEmptyLabel}</p>
        {safeEmptyActionLabel && onEmptyAction && showEmptyAction ? (
          <Button variant="primary" size="sm" onClick={onEmptyAction}>
            {safeEmptyActionLabel}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="omnimux-products-grid">
      {products.map((product) => {
        const glyph = (product.name || '?').trim().slice(0, 1)
        const cover = product.cover
        const preview = cover?.kind === 'image' && cover.id
          ? previewUrl(product.id, cover.id)
          : ''
        const selected = selectedIds?.has(product.id)
        return (
          <article
            key={product.id}
            className="omnimux-products-focusable omnimux-products-card"
            tabIndex={0}
            role="button"
            aria-selected={selected ? 'true' : 'false'}
            onClick={() => { onOpen?.(product) }}
            onKeyDown={activateRowKeydown(() => { onOpen?.(product) })}
          >
            <div className="omnimux-products-card-thumb">
              {preview ? (
                <img
                  src={preview}
                  alt=""
                  className="omnimux-products-card-media"
                  onError={(event) => { event.currentTarget.dataset.broken = 'true' }}
                />
              ) : null}
              <span className="omnimux-products-glyph">{glyph}</span>
              <span className="omnimux-products-badge">
                {product.kind === 'digital' ? t('kind.digital') : t('kind.physical')}
              </span>
              {onToggleSelect ? (
                <IconButton
                  variant="ghost"
                  size="xs"
                  className="omnimux-products-check"
                  data-selected={selected ? 'true' : 'false'}
                  aria-label={t('select.toggle')}
                  aria-pressed={selected ? 'true' : 'false'}
                  title=""
                  onClick={(event) => { event.stopPropagation(); onToggleSelect(product) }}
                >
                  {selected ? <CheckIcon size={12} /> : <span />}
                </IconButton>
              ) : null}
            </div>
            <div className="omnimux-products-card-body">
              <div className="omnimux-products-card-title">{product.name}</div>
              <div className="omnimux-products-card-desc">
                {product.kind === 'digital'
                  ? (product.link
                    || product.brand_strategy?.brand_basic_info?.product?.name
                    || product.description
                    || '—')
                  : (product.selling_points || product.description || '—')}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
