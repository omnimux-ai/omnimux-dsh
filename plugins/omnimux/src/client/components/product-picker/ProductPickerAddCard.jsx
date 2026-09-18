import React from 'react';

/**
 * 产品选择器列表首位「创建产品」卡片（虚线缩略图 + 加号 + 标题描述）。
 * @param {{
 *   label?: string,
 *   desc?: string,
 *   onClick: () => void,
 * }} props
 */
export function ProductPickerAddCard({
  label = '创建产品',
  desc = '粘贴商品链接自动解析',
  onClick,
}) {
  return (
    <article
      className="omx-product-pick-card omx-product-pick-card--add"
      tabIndex={0}
      role="button"
      aria-label={label}
      data-testid="product-picker-add-card"
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="omx-product-pick-card__thumb omx-product-pick-card__thumb--add">
        <div className="omx-product-pick-card__add-icon">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
      </div>
      <div className="omx-product-pick-card__body">
        <div className="omx-product-pick-card__title">{label}</div>
        <div className="omx-product-pick-card__meta">
          <span className="omx-product-pick-card__sku">{desc}</span>
        </div>
      </div>
    </article>
  );
}
