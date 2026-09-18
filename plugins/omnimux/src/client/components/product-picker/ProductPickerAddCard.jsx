import React from 'react';

/**
 * 产品选择器列表首位「创建产品」1:1 正方形卡片（参考图 1/图 3：虚线大卡 + 购物袋图标 + 居中标题）。
 * @param {{
 *   label?: string,
 *   desc?: string,
 *   onClick: () => void,
 * }} props
 */
export function ProductPickerAddCard({
  label = '创建产品',
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
      <div className="omx-product-pick-card__add-inner">
        <div className="omx-product-pick-card__add-icon">
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 18V6z" />
            <path d="M9 9a3 3 0 0 0 6 0" />
          </svg>
        </div>
        <div className="omx-product-pick-card__add-label">{label}</div>
      </div>
    </article>
  );
}
