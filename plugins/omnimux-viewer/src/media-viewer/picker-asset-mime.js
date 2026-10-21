/**
 * Asset-picker MIME projection.
 *
 * `/omnimux/assets/state` exposes the authoritative file metadata, but the
 * picker preview URL is extension-less and the asset `type` is a category
 * (`character`/`product`), so the submit layer cannot infer a media type from
 * the item alone. These helpers keep that metadata on the picker item.
 */
import { inferMimeType } from './media-slot.js';

/**
 * @param {object | string | null | undefined} source
 * @returns {string}
 */
export function pickerMimeOf(source) {
  if (!source) return '';
  if (typeof source === 'string') return inferMimeType({ url: source });
  const name = source.original_name || source.originalName || source.name || source.filename || source.file_name || source.real_path || '';
  const byName = inferMimeType({ name });
  if (byName) return byName;
  const direct = source.mime || source.mimeType || source.mediaType || source.type;
  if (typeof direct === 'string' && direct.includes('/') && !direct.endsWith('/')) return direct.toLowerCase();
  const fromUrl = source.url || source.previewUrl || source.cover_url || source.coverUrl;
  return fromUrl ? inferMimeType({ url: String(fromUrl) }) : '';
}

/**
 * @param {string} mime
 * @param {string} category
 * @returns {'image' | 'video' | 'audio'}
 */
export function pickerKindOf(mime, category) {
  if (typeof mime === 'string' && mime.startsWith('video/')) return 'video';
  if (typeof mime === 'string' && mime.startsWith('audio/')) return 'audio';
  if (typeof mime === 'string' && mime.startsWith('image/')) return 'image';
  if (category === 'video') return 'video';
  if (category === 'audio') return 'audio';
  return 'image';
}
