import React from 'react';

/**
 * 纯矢量资产占位图标 (零 Emoji)
 */
function AssetPlaceholderIcon({ size = 26 }) {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

/**
 * 资产选择卡片（对齐产品库参考稿：方形缩略图 + 左上勾选框 + 左下分类胶囊 + 卡下名称与描述，保持简洁统一）
 * @param {{
 *   asset: { id: string, name?: string, type?: string, description?: string, missing_file_count?: number, files?: unknown[], cover?: any, previewUrl?: string },
 *   selected?: boolean,
 *   alreadyAdded?: boolean,
 *   disabled?: boolean,
 *   typeLabel: string,
 *   alreadyLabel: string,
 *   missingLabel: string,
 *   onToggle: (asset: object) => void,
 *   onDoubleClick?: (asset: object) => void,
 * }} props
 */
export function AssetPickerCard({
  asset,
  selected = false,
  alreadyAdded = false,
  disabled = false,
  typeLabel,
  alreadyLabel,
  missingLabel,
  onToggle,
  onDoubleClick,
}) {
  const missing = Number(asset.missing_file_count) > 0 && (!asset.files || asset.files.length === 0);
  const locked = Boolean(disabled || alreadyAdded);
  const isChecked = selected || alreadyAdded;

  // 封面图处理：优先使用 cover / previewUrl，其次扫描 files 中的首个图片文件
  const preview = (() => {
    if (asset.previewUrl) return asset.previewUrl;
    if (asset.cover) {
      if (typeof asset.cover === 'string') return asset.cover;
      if (asset.cover.id) {
        return `/omnimux/assets/library/preview?id=${encodeURIComponent(asset.id)}&file=${encodeURIComponent(asset.cover.id)}`;
      }
    }
    if (Array.isArray(asset.files) && asset.files.length > 0) {
      const imgFile = asset.files.find((f) => {
        if (!f) return false;
        if (f.kind === 'image' || f.type === 'image') return true;
        if (typeof f.mime === 'string' && f.mime.startsWith('image/')) return true;
        const name = String(f.original_name || f.name || f.relative_path || f.real_path || '');
        return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name);
      });
      if (imgFile && imgFile.id) {
        return `/omnimux/assets/library/preview?id=${encodeURIComponent(asset.id)}&file=${encodeURIComponent(imgFile.id)}`;
      }
    }
    return '';
  })();

  const glyph = (asset.name || asset.id || '?').trim().slice(0, 1).toUpperCase();

  return (
    <article
      className="omx-asset-pick-card"
      tabIndex={0}
      role="checkbox"
      aria-checked={isChecked ? 'true' : 'false'}
      aria-disabled={locked ? 'true' : 'false'}
      data-selected={isChecked ? 'true' : 'false'}
      data-already={alreadyAdded ? 'true' : 'false'}
      onClick={() => {
        if (!locked) onToggle(asset);
      }}
      onDoubleClick={() => {
        if (!locked && onDoubleClick) onDoubleClick(asset);
      }}
      onKeyDown={(event) => {
        if (locked) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle(asset);
        }
      }}
    >
      <div className="omx-asset-pick-card__thumb">
        <span
          className="omx-asset-pick-card__check"
          data-selected={isChecked ? 'true' : 'false'}
          aria-hidden="true"
        >
          {isChecked ? (
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
            className="omx-asset-pick-card__img"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="omx-asset-pick-card__placeholder">
            <AssetPlaceholderIcon size={26} />
            <span className="omx-asset-pick-card__glyph">{glyph}</span>
          </div>
        )}

        {typeLabel ? <span className="omx-asset-pick-card__badge">{typeLabel}</span> : null}
        {missing ? <span className="omx-asset-pick-card__missing">{missingLabel}</span> : null}
        {alreadyAdded ? <span className="omx-asset-pick-card__already">{alreadyLabel}</span> : null}
      </div>

      <div className="omx-asset-pick-card__body">
        <div className="omx-asset-pick-card__title" title={asset.name || asset.id}>
          {asset.name || asset.id}
        </div>
        <div className="omx-asset-pick-card__meta">
          <span className="omx-asset-pick-card__desc" title={asset.description || typeLabel}>
            {asset.description || typeLabel}
          </span>
        </div>
      </div>
    </article>
  );
}

export const ASSET_CARD_CSS = `
.omx-asset-pick-card {
  display: flex; flex-direction: column; width: 100%;
  background: transparent; border: none; padding: 0; text-align: left;
  cursor: pointer; box-sizing: border-box;
}
.omx-asset-pick-card__thumb {
  position: relative; width: 100%; aspect-ratio: 1 / 1;
  background: var(--dsw-alias-bg-module-platform); border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: var(--dsw-alias-label-tertiary); overflow: hidden;
  border: 1.5px solid transparent;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.omx-asset-pick-card:hover .omx-asset-pick-card__thumb { transform: translateY(-2px); }
.omx-asset-pick-card[data-selected="true"] .omx-asset-pick-card__thumb {
  border-color: var(--dsw-alias-button-primary-fill);
}
.omx-asset-pick-card[aria-disabled="true"] { cursor: default; opacity: 0.72; }
.omx-asset-pick-card[aria-disabled="true"]:hover .omx-asset-pick-card__thumb { transform: none; }
.omx-asset-pick-card__img {
  width: 100%; height: 100%; object-fit: cover;
}
.omx-asset-pick-card__placeholder {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.omx-asset-pick-card__glyph {
  font-size: 18px; font-weight: 600; opacity: 0.6;
}
.omx-asset-pick-card__check {
  position: absolute; top: 8px; left: 8px; width: 18px; height: 18px; border-radius: 5px;
  display: inline-flex; align-items: center; justify-content: center; z-index: 2;
  border: 1.5px solid var(--dsw-alias-border-l4);
  background: var(--dsw-alias-bg-layer-2);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.omx-asset-pick-card__check[data-selected="true"] {
  border-color: var(--dsw-alias-button-primary-fill);
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.omx-asset-pick-card__badge {
  position: absolute; left: 8px; bottom: 8px; z-index: 2;
  font-size: 11px; line-height: 16px; font-weight: 600; padding: 2px 8px;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary);
}
.omx-asset-pick-card__already, .omx-asset-pick-card__missing {
  position: absolute; right: 8px; top: 8px; z-index: 2;
  font-size: 10px; line-height: 14px; padding: 2px 6px; border-radius: 4px;
  background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-state-warn-primary);
  border: 1px solid var(--dsw-alias-border-l2);
}
.omx-asset-pick-card__body {
  display: flex; flex-direction: column; gap: 2px; margin-top: 6px; padding: 0 2px; min-width: 0;
}
.omx-asset-pick-card__title {
  font-size: 13px; font-weight: 600; line-height: 18px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary);
}
.omx-asset-pick-card__meta {
  display: flex; align-items: center; min-width: 0;
}
.omx-asset-pick-card__desc {
  font-size: 11px; color: var(--dsw-alias-label-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.omx-asset-pick-card--add .omx-asset-pick-card__thumb--add {
  border: 1.5px dashed var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-2);
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}
.omx-asset-pick-card--add:hover .omx-asset-pick-card__thumb--add {
  border-color: var(--dsw-alias-button-primary-fill);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-button-primary-fill);
  transform: translateY(-2px);
}
.omx-asset-pick-card__add-icon {
  display: flex; align-items: center; justify-content: center;
  color: inherit;
}
`

const CARD_STYLE_ID = 'omx-asset-pick-card-styles'

export function ensureAssetCardStyles(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || doc.getElementById(CARD_STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = CARD_STYLE_ID
  style.textContent = ASSET_CARD_CSS
  doc.head?.appendChild(style)
}
