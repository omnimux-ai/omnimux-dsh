/**
 * 资产侧栏 → 导入节点：原生绝对路径或当前工作区的项目相对路径。
 * 无 React / store 依赖；相对路径不能冒充 native real_path。
 */

import { draftFromRealPath } from './localFileDraft.ts';
import type { ImportFileDraft } from './resourcePickerPolicy.ts';
import { looksAbsolutePath, materialTypeFromFilename, projectFileMediaUrl } from '../../../shared/localMedia.ts';
import { forbiddenRelativePathCode } from '../../../shared/projectAssets.ts';
import { buildMediaMetadata } from '../../../shared/mediaMetadata.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asPath(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstFileRecord(asset: Record<string, unknown>): Record<string, unknown> | null {
  if (!Array.isArray(asset.files) || asset.files.length === 0) return null;
  const first = asset.files[0];
  return isRecord(first) ? first : null;
}

/** Read native absolute paths only; relative_path requires explicit workspace identity. */
export function readAssetRealPath(asset: unknown): string {
  if (!isRecord(asset)) return '';
  const direct = asPath(asset.real_path) || asPath(asset.realPath);
  if (direct) return looksAbsolutePath(direct) ? direct : '';
  const file = firstFileRecord(asset);
  if (!file) return '';
  const path = asPath(file.real_path) || asPath(file.realPath) || asPath(file.path);
  return looksAbsolutePath(path) ? path : '';
}

function assetDisplayName(asset: Record<string, unknown>): string | undefined {
  const name = asPath(asset.name) || asPath(asset.originalName) || asPath(asset.title);
  if (name) return name;
  const file = firstFileRecord(asset);
  if (!file) return undefined;
  const fileName = asPath(file.original_name) || asPath(file.name);
  return fileName || undefined;
}

export type AssetImportDraftResult =
  | { ok: true; draft: ImportFileDraft }
  | { ok: false; reason: 'needPath' | 'unsupported' };

export function classifyAssetImport(asset: unknown, workspaceId?: string | null): AssetImportDraftResult {
  if (isRecord(asset) && asset.relative_path !== undefined) {
    const relativePath = asPath(asset.relative_path);
    const sourceWorkspaceId = asPath(asset.workspaceId);
    if (!sourceWorkspaceId || sourceWorkspaceId !== workspaceId || forbiddenRelativePathCode(relativePath)) {
      return { ok: false, reason: 'needPath' };
    }
    const name = assetDisplayName(asset) || relativePath.split('/').pop() || relativePath;
    const metadata = buildMediaMetadata({ ...asset, name, path: relativePath });
    const materialType = materialTypeFromFilename(name, metadata.mimeType || '');
    if (!materialType) return { ok: false, reason: 'unsupported' };
    return {
      ok: true,
      draft: {
        id: `${sourceWorkspaceId}:${relativePath}`,
        name,
        mime: metadata.mimeType || '',
        size: metadata.sizeBytes,
        durationSec: metadata.durationSec,
        materialType,
        relativePath,
        workspaceId: sourceWorkspaceId,
        assetId: asPath(asset.id) || undefined,
        previewUrl: projectFileMediaUrl(sourceWorkspaceId, relativePath),
      },
    };
  }
  const realPath = readAssetRealPath(asset);
  if (!realPath) return { ok: false, reason: 'needPath' };
  const extras = isRecord(asset)
    ? { name: assetDisplayName(asset) }
    : {};
  const draft = draftFromRealPath(realPath, extras);
  if (!draft) return { ok: false, reason: 'unsupported' };
  return { ok: true, draft };
}

export function draftFromAsset(asset: unknown, workspaceId?: string | null): ImportFileDraft | null {
  const result = classifyAssetImport(asset, workspaceId);
  return result.ok ? result.draft : null;
}
