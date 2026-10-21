/**
 * Asset-picker projection: keep the real file MIME / filename that the asset
 * APIs expose.
 *
 * The picker preview URL is extension-less and the asset `type` is a category
 * (`character`/`product`), so the submit layer cannot infer a media type from
 * the rendered item alone. These mappers preserve the authoritative metadata;
 * the submission layer (`inferMimeType`) is deliberately unchanged.
 *
 * Cloud rows are the reason media and cover MIME must stay separate: 99 rows in
 * the bundled catalog are `media_type: audio/video` with a `.png` cover.
 */
import { inferMimeType } from './media-slot.js';

/**
 * @param {object | string | null | undefined} source
 * @returns {string}
 */
export function pickerMimeOf(source) {
  if (!source) return '';
  if (typeof source === 'string') return inferMimeType({ url: source });
  const direct = source.mime || source.mimeType || source.mime_type || source.mediaType || source.media_type_mime;
  if (typeof direct === 'string' && direct.includes('/') && !direct.endsWith('/')) return direct.toLowerCase();
  const name = source.original_name || source.originalName || source.name || source.filename || source.file_name || source.real_path || '';
  const byName = inferMimeType({ name });
  if (byName) return byName;
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

const localPreviewUrl = (id, fileId) => (
  fileId ? `/omnimux/assets/library/preview?id=${encodeURIComponent(id)}&file=${encodeURIComponent(fileId)}` : ''
);
const cloudPreviewUrl = (c) => c.meta?.source_cover_url || c.cover_url || `/omnimux/assets/cloud/media?id=${encodeURIComponent(c.id)}&which=cover`;

/** Map one `/omnimux/assets/state` asset row. */
export function mapLocalAsset(a) {
  const files = Array.isArray(a.files) ? a.files : [];
  const coverFile = a.cover?.id ? a.cover : (files.find((file) => file?.kind === 'image') || files[0] || null);
  const coverUrl = coverFile?.id ? localPreviewUrl(a.id, coverFile.id) : '';
  const mediaByKind = {};
  const variants = coverFile?.id ? [coverFile, ...files] : files;
  for (const file of variants) {
    const kind = file?.kind;
    // Preview route serves image/video only; audio files cannot be referenced here.
    if (!file?.id || !kind || !['image', 'video'].includes(kind)) continue;
    if (!mediaByKind[kind]) {
      mediaByKind[kind] = {
        url: localPreviewUrl(a.id, file.id),
        mime: pickerMimeOf(file) || undefined,
        filename: file.original_name,
      };
    }
  }
  const defaultVariant = mediaByKind.image || mediaByKind.video || mediaByKind.audio || null;
  const defaultUrl = defaultVariant?.url || coverUrl;
  const mime = defaultVariant?.mime || pickerMimeOf(coverFile) || pickerMimeOf(a);
  return {
    id: a.id,
    title: a.name || a.handle || a.id,
    name: a.name || a.handle || a.id,
    filename: defaultVariant?.filename,
    url: defaultUrl,
    thumbUrl: coverUrl || defaultUrl,
    type: pickerKindOf(mime, a.type),
    mime: mime || undefined,
    mediaByKind,
    isMine: true,
    raw: a,
  };
}

/**
 * Pick the file variant that matches the slot being filled. The library asset
 * category (character/scene/…) says nothing about a file's media kind, so the
 * image/video/audio choice must happen against the target slot.
 * @param {object} item
 * @param {'image' | 'video' | 'audio' | undefined} targetType
 * @returns {object}
 */
export function assetForSlot(item, targetType) {
  const variant = targetType && item?.mediaByKind?.[targetType];
  if (!variant) return item;
  return {
    ...item,
    url: variant.url,
    mime: variant.mime,
    filename: variant.filename,
    type: targetType,
  };
}

/** Map one `/omnimux/assets/cloud/search` row. Media MIME must come from the media file, never the cover. */
export function mapCloudAsset(c) {
  const coverUrl = cloudPreviewUrl(c);
  const mediaUrl = c.media_url || c.meta?.source_media_url || `/omnimux/assets/cloud/media?id=${encodeURIComponent(c.id)}&which=media`;
  const mediaMime = pickerMimeOf(c.media_url) || pickerMimeOf(c.meta?.source_media_url) || pickerMimeOf({ mime: c.mime || c.mime_type });
  const coverMime = pickerMimeOf(c.cover_url) || pickerMimeOf(coverUrl);
  // A static image can legitimately be represented by its cover; a video/audio
  // row cannot, or the submit layer would treat a .png cover as the media.
  const mime = mediaMime || (c.media_type === 'image' ? coverMime : '');
  return {
    id: c.id,
    title: c.name || c.id,
    name: c.name || c.id,
    url: mediaUrl,
    thumbUrl: coverUrl || mediaUrl,
    type: pickerKindOf(mime, c.media_type),
    mime: mime || undefined,
    isMine: false,
    raw: c,
  };
}

/** Map one `/omnimux/products/state` row. */
export function mapProductAsset(p) {
  const coverMediaId = p.cover_media_id || p.cover?.id;
  const coverUrl = coverMediaId ? `/omnimux/products/${encodeURIComponent(p.id)}?preview=${encodeURIComponent(coverMediaId)}` : '';
  const mime = pickerMimeOf(p.cover) || pickerMimeOf(p) || pickerMimeOf(coverUrl);
  return {
    id: p.id,
    title: p.name || p.id,
    name: p.name || p.id,
    url: coverUrl,
    thumbUrl: coverUrl,
    type: pickerKindOf(mime, 'image'),
    mime: mime || undefined,
    isMine: true,
    raw: p,
  };
}

/** Map one `/omnimux/assets/artifacts` row. */
export function mapArtifactAsset(art) {
  const coverUrl = `/omnimux/assets/artifacts/preview?id=${encodeURIComponent(art.id)}`;
  const mime = pickerMimeOf(art) || pickerMimeOf(coverUrl);
  return {
    id: art.id,
    title: art.title || art.id,
    name: art.title || art.id,
    url: coverUrl,
    thumbUrl: coverUrl,
    type: pickerKindOf(mime, art.type),
    mime: mime || undefined,
    isMine: true,
    raw: art,
  };
}
