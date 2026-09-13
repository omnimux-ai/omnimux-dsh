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
