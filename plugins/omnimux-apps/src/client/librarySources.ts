/**
 * plugins/omnimux-apps/src/client/librarySources.ts
 *
 * Library picker data access for AI App form widgets (library-picker /
 * media-extractor / product-link). Consumes ONLY the existing public HTTP
 * seams exposed by the domain plugins — no hub internal imports:
 *   - 资产库:  GET /omnimux/assets/library?type=&q=     -> { assets: [...] }
 *   - 灵感库:  GET /omnimux/inspiration/local?q=        -> { data: { items: [...] } }
 *   - 商品库:  GET /omnimux/products/collection?q=      -> { products: [...] }
 * When the owning plugin is absent or the library is empty the fetch yields an
 * empty list so the widget renders its empty state instead of failing.
 */

import type { LibraryKind } from '../shared/manifest.ts';

export type { LibraryKind };

/** One selectable row inside the library picker modal */
export interface LibraryItem {
  id: string;
  name: string;
  sub: string;
  /** Canonical value carried back into the form field (media URL/URI or product link) */
  url: string;
  /** Optional thumbnail URL for the grid card */
  preview: string;
  /** Media category of the row (image | video | audio) when the source library declares it */
  type?: string;
}

/** Fetch outcome: `unavailable` marks a missing plugin/route (distinct from an empty library) */
export interface LibraryFetchResult {
  items: LibraryItem[];
  unavailable: boolean;
}

/** Picked result encoded into a string form value */
export interface PickedValue {
  name: string;
  sub: string;
  url: string;
  source: LibraryKind | 'upload' | 'link';
  /** Media category (image | video | audio) used by the execution bridge for slot feed typing */
  type?: string;
}

interface LibraryMeta {
  title: string;
  subtitle: string;
  emptyText: string;
  triggerText: string;
}

export const LIBRARY_META: Record<LibraryKind, LibraryMeta> = {
  asset: {
    title: '从资产库选择',
    subtitle: '选择已上传的图片或视频素材',
    emptyText: '资产库暂无素材，请先在资产库中上传',
    triggerText: '从资产库选择',
  },
  inspiration: {
    title: '从灵感库选择',
    subtitle: '选择一条已收藏的爆款灵感',
    emptyText: '灵感库暂无内容，请先在灵感库中收藏',
    triggerText: '从灵感库选择',
  },
  product: {
    title: '从商品库选择',
    subtitle: '选择已建档的商品',
    emptyText: '商品库暂无商品，请先在商品库中建档',
    triggerText: '从商品库选择',
  },
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
};

function toText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

/** Rewrite inspiration media paths onto the public host media prefix (same contract as the hub picker) */
export function hostMediaSrc(url: unknown): string {
  const text = toText(url);
  if (!text || text.includes('..')) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith('/omnimux/inspiration/local/media/')) return text;
  if (text.startsWith('/omnimux/inspiration/media/')) return text;
  if (text.startsWith('/api/inspiration/v1/media/')) {
    return `/omnimux/inspiration/media/${text.slice('/api/inspiration/v1/media/'.length)}`;
  }
  if (text.startsWith('/')) return text;
  return '';
}

/**
 * Whitelist for URLs rendered as <img src> in the picker grid:
 * only http(s), site-relative paths, and existing blob: object URLs.
 * Blocks javascript:/data: and other scriptable or opaque schemes.
 */
export function sanitizePreviewUrl(url: unknown): string {
  const text = toText(url).trim();
  if (!text || text.includes('..')) return '';
  return /^(https?:\/\/|\/|blob:)/i.test(text) ? text : '';
}

/** Map one asset-library view row into a picker item */
export function mapAssetRow(row: unknown): LibraryItem | null {
  if (!row || typeof row !== 'object') return null;
  const rec = row as Record<string, any>;
  const id = toText(rec.id);
  if (!id) return null;
  const files = Array.isArray(rec.files) ? rec.files : [];
  const cover = rec.cover && typeof rec.cover === 'object' ? rec.cover : null;
  const coverFileId = toText(rec.cover_file_id || cover?.id || files[0]?.id);
  const url = toText(cover?.uri || files[0]?.uri || rec.uri);
  const typeLabel = ASSET_TYPE_LABELS[toText(rec.type)] || '素材';
  const mediaType = ASSET_TYPE_LABELS[toText(rec.type)] ? toText(rec.type) : undefined;
  return {
    id,
    name: toText(rec.name) || id,
    sub: toText(rec.description) || typeLabel,
    url,
    preview: coverFileId ? `/omnimux/assets/library/preview?id=${encodeURIComponent(id)}&file=${encodeURIComponent(coverFileId)}` : '',
    type: mediaType,
  };
}

/** Map one inspiration-library row into a picker item */
export function mapInspirationRow(row: unknown): LibraryItem | null {
  if (!row || typeof row !== 'object') return null;
  const rec = row as Record<string, any>;
  const id = toText(rec.id);
  if (!id) return null;
  const mediaList = Array.isArray(rec.media_urls) ? rec.media_urls.filter((u: unknown) => typeof u === 'string' && u) : [];
  const video = toText(mediaList[0] || rec.media_url);
  return {
    id,
    name: toText(rec.title || rec.name) || id,
    sub: toText(rec.source_platform || rec.platform || rec.category),
    url: hostMediaSrc(video),
    preview: hostMediaSrc(rec.cover_url ?? rec.cover_key ?? rec.cover) || hostMediaSrc(video),
    type: 'video',
  };
}

/** Map one product-library list row into a picker item */
export function mapProductRow(row: unknown): LibraryItem | null {
  if (!row || typeof row !== 'object') return null;
  const rec = row as Record<string, any>;
  const id = toText(rec.id);
  if (!id) return null;
  // Real /omnimux/products/collection contract: cover is a listViewOf media
  // object ({id, kind, real_path, ...}) with NO uri/url. Thumbnails are served
  // through the product preview seam, same as the hub product picker.
  const cover = rec.cover && typeof rec.cover === 'object' ? rec.cover : null;
  const coverMediaId = toText(cover?.id || rec.cover_media_id);
  const rawPreview = coverMediaId
    ? `/omnimux/products/${encodeURIComponent(id)}?preview=${encodeURIComponent(coverMediaId)}`
    : toText(rec.cover_url);
  return {
    id,
    name: toText(rec.name) || id,
    sub: toText(rec.sku || rec.price || rec.brand),
    url: toText(rec.link),
    preview: sanitizePreviewUrl(rawPreview),
    type: 'image',
  };
}

async function requestJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch picker items for a library. Never throws: network/availability
 * failures resolve to `{ items: [], unavailable: true }`.
 */
export async function fetchLibraryItems(library: LibraryKind, query = ''): Promise<LibraryFetchResult> {
  const q = query.trim();
  try {
    if (library === 'asset') {
      const body = await requestJson(`/omnimux/assets/library?q=${encodeURIComponent(q)}`);
      const rows = Array.isArray(body?.assets) ? body.assets : [];
      return { items: rows.map(mapAssetRow).filter(Boolean) as LibraryItem[], unavailable: false };
    }
    if (library === 'inspiration') {
      const body = await requestJson(`/omnimux/inspiration/local?q=${encodeURIComponent(q)}`);
      const rows = Array.isArray(body?.data?.items) ? body.data.items : [];
      return { items: rows.map(mapInspirationRow).filter(Boolean) as LibraryItem[], unavailable: false };
    }
    const body = await requestJson(`/omnimux/products/collection?q=${encodeURIComponent(q)}`);
    const rows = Array.isArray(body?.products) ? body.products : [];
    return { items: rows.map(mapProductRow).filter(Boolean) as LibraryItem[], unavailable: false };
  } catch {
    return { items: [], unavailable: true };
  }
}

/** Encode a picked result into the string form value */
export function encodePickedValue(value: PickedValue): string {
  return JSON.stringify(value);
}

/**
 * Decode a form value back into a picked result. Plain pasted links stay raw
 * strings and decode to null; callers render those as link cards.
 */
export function decodePickedValue(raw: unknown): PickedValue | null {
  if (typeof raw !== 'string' || !raw.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const name = toText(parsed.name);
    const url = toText(parsed.url);
    if (!name && !url) return null;
    const value: PickedValue = {
      name: name || url,
      sub: toText(parsed.sub),
      url,
      source: (parsed.source as PickedValue['source']) || 'link',
    };
    const type = toText(parsed.type);
    if (type) value.type = type;
    return value;
  } catch {
    return null;
  }
}

/** Uniform card model for any non-empty string value (picked JSON or raw link) */
export function displayValueOf(raw: unknown): { name: string; sub: string; source: PickedValue['source'] } {
  const decoded = decodePickedValue(raw);
  if (decoded) return { name: decoded.name, sub: decoded.sub, source: decoded.source };
  const text = toText(raw).trim();
  const truncated = text.length > 34 ? `${text.slice(0, 34)}…` : text;
  return { name: truncated, sub: '链接', source: 'link' };
}
