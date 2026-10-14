/**
 * Anti-corruption mapper: omnimux-assets library rows → drawer SubjectPack.
 * Copied TYPE_CITE labels (no import of omnimux-assets). Unknown type → custom.
 */
import type { SubjectPack } from '../editor/components/assets/types.ts';

export const LIBRARY_ASSET_TYPES = [
  'character',
  'scene',
  'style',
  'prop',
  'knowledge',
  'custom',
] as const;

export type LibraryAssetType = (typeof LIBRARY_ASSET_TYPES)[number];

/** TYPE_CITE 1:1 — capsule copy, never 「机甲」/「Lora」 as type ids. */
export const TYPE_CITE: Record<LibraryAssetType, string> = {
  character: '角色',
  scene: '场景',
  style: '风格包',
  prop: '道具',
  knowledge: '知识包',
  custom: '自定义',
};

export const SUBJECT_CATEGORY_TABS: Array<{ id: 'all' | LibraryAssetType; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'character', label: TYPE_CITE.character },
  { id: 'scene', label: TYPE_CITE.scene },
  { id: 'style', label: TYPE_CITE.style },
  { id: 'prop', label: TYPE_CITE.prop },
  { id: 'knowledge', label: TYPE_CITE.knowledge },
  { id: 'custom', label: TYPE_CITE.custom },
];

export interface LibraryFileView {
  id?: string;
  kind?: string;
  real_path?: string;
  original_name?: string;
}

export interface LibraryAssetView {
  id?: string;
  name?: string;
  type?: string;
  tags?: unknown;
  files?: LibraryFileView[];
  cover?: { id?: string } | null;
  cover_file_id?: string | null;
  updated_at?: string;
  updatedAt?: number;
}

export function normalizeLibraryType(type: unknown): LibraryAssetType {
  if (typeof type === 'string' && (LIBRARY_ASSET_TYPES as readonly string[]).includes(type)) {
    return type as LibraryAssetType;
  }
  return 'custom';
}

export function libraryPreviewUrl(assetId: string, fileId?: string): string {
  const params = new URLSearchParams({ id: assetId });
  if (fileId) params.set('file', fileId);
  return `/omnimux/assets/library/preview?${params.toString()}`;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is string => typeof row === 'string' && row.trim() !== '');
}

export function mapLibraryAssetToSubject(asset: LibraryAssetView): SubjectPack {
  const id = typeof asset.id === 'string' && asset.id.trim() !== '' ? asset.id : '';
  const name = typeof asset.name === 'string' && asset.name.trim() !== '' ? asset.name : '未命名主体';
  const type = normalizeLibraryType(asset.type);
  const cite = TYPE_CITE[type];
  const files = Array.isArray(asset.files) ? asset.files : [];
  const coverId =
    (asset.cover && typeof asset.cover.id === 'string' && asset.cover.id)
    || (typeof asset.cover_file_id === 'string' ? asset.cover_file_id : '')
    || (typeof files[0]?.id === 'string' ? files[0].id : '');
  const avatar = id && coverId ? libraryPreviewUrl(id, coverId) : '';
  const previewUrls = files
    .map((file) => (id && typeof file.id === 'string' ? libraryPreviewUrl(id, file.id) : ''))
    .filter((url) => url !== '')
    .slice(0, 4);
  const extraTags = asStringArray(asset.tags).filter((tag) => tag !== cite);
  const updatedAt =
    typeof asset.updatedAt === 'number'
      ? asset.updatedAt
      : (typeof asset.updated_at === 'string' ? Date.parse(asset.updated_at) || 0 : 0);

  const fileRefs = files
    .map((file) => {
      const realPath = typeof file.real_path === 'string' ? file.real_path.trim() : '';
      const originalName = typeof file.original_name === 'string' ? file.original_name.trim() : '';
      const fileId = typeof file.id === 'string' ? file.id : '';
      if (!realPath && !fileId && !originalName) return null;
      return {
        ...(fileId ? { id: fileId } : {}),
        ...(file.kind ? { kind: file.kind } : {}),
        ...(realPath ? { real_path: realPath } : {}),
        ...(originalName ? { original_name: originalName } : {}),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return {
    id,
    name,
    avatar,
    itemCount: files.length,
    tags: [cite, ...extraTags],
    updatedAt,
    previewUrls: previewUrls.length > 0 ? previewUrls : (avatar ? [avatar] : []),
    type,
    ...(fileRefs.length > 0 ? { files: fileRefs } : {}),
  };
}

export type PickKind = 'file' | 'directory';

export type PickInterpretation =
  | { kind: 'ok'; paths: string[] }
  | { kind: 'cancel' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

export function interpretPickResponse(result: {
  ok: boolean;
  status: number;
  body?: { error?: string; message?: string; path?: string | null; paths?: string[] };
}): PickInterpretation {
  if (!result.ok) {
    const code = result.body?.error;
    if (result.status === 501 || code === 'picker-unsupported') {
      return { kind: 'unsupported' };
    }
    return {
      kind: 'error',
      message: result.body?.message || result.body?.error || `HTTP ${String(result.status)}`,
    };
  }
  const raw = result.body?.paths;
  const paths = Array.isArray(raw)
    ? raw.filter((row): row is string => typeof row === 'string' && row.trim() !== '')
    : (typeof result.body?.path === 'string' && result.body.path.trim() !== '' ? [result.body.path] : []);
  if (paths.length === 0) return { kind: 'cancel' };
  return { kind: 'ok', paths };
}
