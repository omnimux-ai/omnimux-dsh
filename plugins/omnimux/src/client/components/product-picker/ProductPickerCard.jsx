import React from 'react';
import { resolveThumbnails } from './picker-model.js';

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
 * 产品选择卡片（对齐参考图 1：方形缩略图 + 左上勾选框 + 左下多图微标队列 + 卡下名称与分类，移除价格标签）
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
      : (product.cover_url || product.image || '');

  const glyph = (product.name || '?').trim().slice(0, 1).toUpperCase();

  const thumbnails = resolveThumbnails(product);
  const totalCount = Math.max(product.media_count || 0, thumbnails.length);
  const visibleThumbs = thumbnails.slice(0, 3);
  const overflowCount = totalCount > 3 ? totalCount - 3 : 0;
  const showThumbsRow = visibleThumbs.length > 1 || overflowCount > 0;

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

        {showThumbsRow ? (
          <div
            className="omx-product-pick-card__thumbs-row"
            aria-label={`素材共 ${totalCount} 张`}
            data-testid="product-picker-thumbs-row"
          >
            {visibleThumbs.map((thumbUrl, idx) => (
              <img
                key={idx}
                src={thumbUrl}
                alt=""
                className="omx-product-pick-card__sub-thumb"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ))}
            {overflowCount > 0 ? (
              <span className="omx-product-pick-card__sub-badge">+{overflowCount}</span>
            ) : null}
          </div>
        ) : null}
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

export const PRODUCT_CARD_CSS = `
.omx-product-pick-card {
  display: flex; flex-direction: column; width: 100%;
  background: transparent; border: none; padding: 0; text-align: left;
  cursor: pointer; box-sizing: border-box;
}
.omx-product-pick-card__thumb {
  position: relative; width: 100%; aspect-ratio: 1 / 1;
  background: var(--dsw-alias-bg-module-platform); border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: var(--dsw-alias-label-tertiary); overflow: hidden;
  border: 1.5px solid transparent;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.omx-product-pick-card:hover .omx-product-pick-card__thumb { transform: translateY(-2px); }
.omx-product-pick-card[data-selected="true"] .omx-product-pick-card__thumb {
  border-color: var(--dsw-alias-button-primary-fill);
}
.omx-product-pick-card__img {
  width: 100%; height: 100%; object-fit: cover;
}
.omx-product-pick-card__placeholder {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.omx-product-pick-card__glyph {
  font-size: 18px; font-weight: 600; opacity: 0.6;
}
.omx-product-pick-card__check {
  position: absolute; top: 8px; left: 8px; width: 18px; height: 18px; border-radius: 5px;
  display: inline-flex; align-items: center; justify-content: center; z-index: 2;
  border: 1.5px solid var(--dsw-alias-border-l4);
  background: var(--dsw-alias-bg-layer-2);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.omx-product-pick-card__check[data-selected="true"] {
  border-color: var(--dsw-alias-button-primary-fill);
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.omx-product-pick-card__thumbs-row {
  position: absolute; left: 8px; bottom: 8px; z-index: 2;
  display: flex; align-items: center; gap: 6px; pointer-events: none;
}
.omx-product-pick-card__sub-thumb {
  width: 28px; height: 28px; border-radius: 5px; object-fit: cover;
  border: 1.5px solid var(--dsw-alias-border-solid, #ffffff); /* exempt-ui03 对标参考图高对比度白描边防背景融合 */
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6); /* exempt-ui03 立体悬浮投影防背景吞噬 */
  display: block; flex-shrink: 0;
}
.omx-product-pick-card__sub-badge {
  min-width: 28px; height: 28px; padding: 0 5px; border-radius: 5px;
  background: var(--dsw-alias-backdrop-overlay, rgba(0, 0, 0, 0.75)); /* exempt-ui03 半透黑色底 */
  border: 1.5px solid var(--dsw-alias-border-solid, #ffffff); /* exempt-ui03 对标参考图高对比度白描边 */
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6); /* exempt-ui03 悬浮投影 */
  color: var(--dsw-alias-label-primary-foreground, #ffffff); font-size: 11px; font-weight: 600; line-height: 25px;
  text-align: center; display: inline-flex; align-items: center; justify-content: center;
  box-sizing: border-box; flex-shrink: 0;
}
.omx-product-pick-card__body {
  display: flex; flex-direction: column; gap: 2px; margin-top: 6px; padding: 0 2px; min-width: 0;
}
.omx-product-pick-card__title {
  font-size: 13px; font-weight: 600; line-height: 18px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary);
}
.omx-product-pick-card__meta {
  display: flex; align-items: center; min-width: 0;
}
.omx-product-pick-card__sku {
  font-size: 11px; color: var(--dsw-alias-label-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.omx-product-pick-card--add {
  aspect-ratio: 1 / 1; width: 100%;
  border: 1.5px dashed var(--dsw-alias-border-l3);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  display: flex; align-items: center; justify-content: center;
  box-sizing: border-box; cursor: pointer;
  align-self: start;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease, color 0.15s ease;
}
.omx-product-pick-card--add:hover {
  border-color: var(--dsw-alias-button-primary-fill);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-button-primary-fill);
  transform: translateY(-2px);
}
.omx-product-pick-card__add-inner {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
}
.omx-product-pick-card__add-icon {
  display: flex; align-items: center; justify-content: center;
  color: inherit;
}
.omx-product-pick-card__add-label {
  font-size: 13px; font-weight: 500; color: inherit; line-height: 18px;
}
`

const CARD_STYLE_ID = 'omx-product-pick-card-styles'

export function ensureProductCardStyles(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || doc.getElementById(CARD_STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = CARD_STYLE_ID
  style.textContent = PRODUCT_CARD_CSS
  doc.head?.appendChild(style)
}
