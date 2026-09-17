import React from 'react';

/**
 * 资产选择器首位常驻添加资产卡片 (对齐设计规范：1:1 方形虚线缩略图 + 居中加号 + 标题描述)
 * @param {{
 *   label?: string,
 *   desc?: string,
 *   onClick: () => void,
 * }} props
 */
export function AssetPickerAddCard({ label = '添加资产', desc = '本地素材入库', onClick }) {
  return (
    <article
      className="omx-asset-pick-card omx-asset-pick-card--add"
      tabIndex={0}
      role="button"
      aria-label={label}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="omx-asset-pick-card__thumb omx-asset-pick-card__thumb--add">
        <div className="omx-asset-pick-card__add-icon">
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
      <div className="omx-asset-pick-card__body">
        <div className="omx-asset-pick-card__title">{label}</div>
        <div className="omx-asset-pick-card__meta">
          <span className="omx-asset-pick-card__desc">{desc}</span>
        </div>
      </div>
    </article>
  );
}
