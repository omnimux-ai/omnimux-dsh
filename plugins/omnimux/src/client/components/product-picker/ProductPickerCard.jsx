import React from 'react';
import { formatPrice } from './picker-model.js';

/**
 * 纯矢量商品占位图标 (零 Emoji)
 */
function ProductPlaceholderIcon({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

/**
 * 产品选择卡片（对齐参考稿：方形缩略图 + 左上勾选框 + 左下价格胶囊 + 卡下名称，保持简洁）
 * @param {{
 *   product: any,
 *   selected?: boolean,
 *   typeLabel: string,
 *   onSelect: (product: any) => void,
 *   onConfirmSelect?: (product: any) => void,
 * }} props
 */
export function ProductPickerCard({
  product,
  selected = false,
  typeLabel,
  onSelect,
  onConfirmSelect,
}) {
  const cover = product.cover;
  const preview =
    cover?.kind === 'image' && cover.id
      ? `/omnimux/products/${encodeURIComponent(product.id)}?preview=${encodeURIComponent(cover.id)}`
      : '';

  const priceText = formatPrice(product.price);
  const glyph = (product.name || '?').trim().slice(0, 1).toUpperCase();

  return (
    <article
      className="omx-product-pick-card"
      tabIndex={0}
      role="radio"
      aria-checked={selected ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      onClick={() => onSelect(product)}
      onDoubleClick={() => onConfirmSelect?.(product)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(product);
        }
      }}
    >
      <div className="omx-product-pick-card__thumb">
        <span
          className="omx-product-pick-card__check"
          data-selected={selected ? 'true' : 'false'}
          aria-hidden="true"
        >
          {selected ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : null}
        </span>

        {preview ? (
          <img
            src={preview}
            alt=""
            className="omx-product-pick-card__img"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="omx-product-pick-card__placeholder">
            <ProductPlaceholderIcon size={26} />
            <span className="omx-product-pick-card__glyph">{glyph}</span>
          </div>
        )}

        {priceText ? <span className="omx-product-pick-card__badge">{priceText}</span> : null}
      </div>

      <div className="omx-product-pick-card__body">
        <div className="omx-product-pick-card__title" title={product.name}>
          {product.name || '未命名产品'}
        </div>
        <div className="omx-product-pick-card__meta">
          <span className="omx-product-pick-card__sku" title={typeLabel}>{typeLabel}</span>
        </div>
      </div>
    </article>
  );
}
