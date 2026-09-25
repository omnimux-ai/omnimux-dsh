/**
 * 实体二级菜单辅助逻辑与角色立绘/缩略图解析
 */

import { resolveProductThumbUrl, sortProductsForQuickMenu } from './productSlotHelper.ts';

export { resolveProductThumbUrl, sortProductsForQuickMenu };

export function resolveCharacterThumbUrl(asset: any): string {
  if (!asset) return '';
  if (asset.previewUrl) return asset.previewUrl;
  if (asset.cover) {
    if (typeof asset.cover === 'string') return asset.cover;
    if (asset.cover.id) {
      return `/omnimux/assets/library/preview?id=${encodeURIComponent(asset.id)}&file=${encodeURIComponent(asset.cover.id)}`;
    }
  }
  if (Array.isArray(asset.files) && asset.files.length > 0) {
    const imgFile = asset.files.find((f: any) => {
      if (!f) return false;
      if (f.kind === 'image' || f.type === 'image') return true;
      if (typeof f.mime === 'string' && f.mime.startsWith('image/')) return true;
      const name = String(f.original_name || f.name || f.relative_path || f.real_path || '');
      return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name);
    });
    if (imgFile && imgFile.id) {
      return `/omnimux/assets/library/preview?id=${encodeURIComponent(asset.id)}&file=${encodeURIComponent(imgFile.id)}`;
    }
    if (asset.files[0]?.id) {
      return `/omnimux/assets/library/preview?id=${encodeURIComponent(asset.id)}&file=${encodeURIComponent(asset.files[0].id)}`;
    }
  }
  return '';
}
